import React, { useCallback, useMemo, useReducer, useRef } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useThemeColor } from '@/hooks/useThemeColor';
import { buildMessageHtml } from '@/components/markdown/markdownHtml';
import { handleAssistantLink } from '@/components/markdown/links';

interface MarkdownRendererProps {
  content: string;
}

export { isSafeHttpUrl, linkDomain } from '@/components/markdown/links';

// Measured heights are stable per message + theme; caching avoids a
// measure/resize flash when chat rows unmount and remount while scrolling.
interface Measurement {
  height: number;
  // The width the height was measured at: the same message reflows to a
  // different height in a wider or narrower bubble, so the width has to
  // travel with the height for the entry to be reusable.
  width: number;
}

const heightCache = new Map<string, Measurement>();
const MAX_CACHE_ENTRIES = 200;
// The bubble width derived from the window is a hint that can be off by a
// point or two (safe-area insets, a parent that is not exactly 85% wide), so
// a measurement is treated as matching a slightly wider bubble too.
const WIDTH_TOLERANCE = 4;

function rememberHeight(key: string, measurement: Measurement) {
  if (heightCache.size >= MAX_CACHE_ENTRIES) heightCache.clear();
  heightCache.set(key, measurement);
}

function normalizeMarkdown(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Mirrors the message stylesheet in markdown/markdownHtml.ts, which is what
// actually decides the height. Only used to pre-size the frame before the
// page reports its real height, so it tracks the stylesheet's metrics.
const FONT_SIZE = 16;
const LINE_HEIGHT = Math.round(FONT_SIZE * 1.5); // line-height: 1.5
const BLOCK_GAP = 10; // p / ul / ol / blockquote margin-bottom
const LIST_INDENT = 24; // ul, ol padding-left
const QUOTE_INDENT = 10; // blockquote padding-left (+ 4px border)
const TABLE_ROW = LINE_HEIGHT + 17; // 8px cell padding + 1px borders
const TABLE_SEPARATOR = /^\s*\|?[\s:|-]+\|[\s:|-]*$/;
// Average glyph advance for 16px system text. Deliberately a shade wide:
// wrapping a word early only makes the placeholder bubble taller, never
// shorter than the text it has to hold.
const CHARS_PER_PIXEL = 1 / 8.5;
const MIN_BUBBLE_HEIGHT = 44;
// Narrowest bubble worth estimating for: a phone in portrait is ~265.
const MIN_CONTENT_WIDTH = 132;

const isListItem = (line: string) => /^\s*([-*+]|\d+\.)\s/.test(line);
const isQuote = (line: string) => /^\s*>/.test(line);
const isTableRow = (line: string) => /^\s*\|/.test(line);

/**
 * Height of one markdown block, counting the line boxes it will occupy.
 * Heading, fence and table metrics are all taller than a text line, so a
 * plain character count under-counts them badly.
 */
function blockHeight(block: string, contentWidth: number): number {
  const lines = block.split('\n');
  if (lines.every(isTableRow)) {
    const rows = lines.filter((line) => !TABLE_SEPARATOR.test(line)).length;
    return Math.max(1, rows) * TABLE_ROW;
  }
  if (/^\s*```/.test(block)) {
    // pre: 10px padding all round, code at 0.9em
    const codeLines = lines.filter((line) => !/^\s*```/.test(line)).length;
    return 20 + Math.max(1, codeLines) * Math.round(FONT_SIZE * 0.9 * 1.5);
  }
  const heading = block.match(/^(#{1,3})\s/);
  if (heading) {
    // h1/h2/h3 are 28/24/20px, so their line boxes are taller than a text line.
    const size = { 1: 28, 2: 24, 3: 20 }[heading[1].length]!;
    const perLine = Math.max(6, contentWidth * CHARS_PER_PIXEL);
    return Math.max(1, Math.ceil(block.length / perLine)) * Math.round(size * 1.5);
  }
  return lines.reduce((total, line) => {
    const indent = isQuote(line) ? QUOTE_INDENT : isListItem(line) ? LIST_INDENT : 0;
    const perLine = Math.max(6, (contentWidth - indent) * CHARS_PER_PIXEL);
    return total + Math.max(1, Math.ceil(line.length / perLine)) * LINE_HEIGHT;
  }, 0);
}

/**
 * Placeholder height for the frame between mount and the page's first
 * measurement. The page cannot scroll (html/body are overflow: hidden and
 * the WebView is not scrollable), so any frame smaller than the text clips
 * it -- which is why the WebView stays transparent until a real measurement
 * for the current width has arrived and this estimate only has to keep the
 * bubble from resizing wildly in the meantime.
 */
function estimateHeight(content: string, contentWidth: number): number {
  const blocks = content.split('\n\n').filter((block) => block.trim());
  const text = blocks.reduce((total, block) => total + blockHeight(block, contentWidth), 0);
  const gaps = Math.max(0, blocks.length - 1) * BLOCK_GAP;
  return Math.max(MIN_BUBBLE_HEIGHT, Math.ceil(text + gaps) + LINE_HEIGHT);
}

/**
 * Renders one assistant message: markdown + LaTeX math in a single
 * sandboxed WebView that reports its content height so the chat bubble
 * wraps it exactly. Native builds use this file; the web build swaps in
 * MarkdownRenderer.web.tsx, which renders the same HTML directly in the DOM.
 *
 * The WebView takes the bubble's full width (the bubble is a definite-width
 * container) and only the height is negotiated: a WebView has no intrinsic
 * size, and feeding a measured width back would reflow the document on every
 * measurement.
 */
const MarkdownRenderer = ({ content }: MarkdownRendererProps) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const cardBackground = useThemeColor({}, 'cardBackground');
  const { width: windowWidth } = useWindowDimensions();
  const normalizedContent = useMemo(() => normalizeMarkdown(content), [content]);

  // The width the page will lay out at, derived from the bubble the renderer
  // sits in: the chat row (window - the list's 20px padding) capped at the
  // bubble's 85% maxWidth, less the bubble's 10px padding and 1px border.
  // Only a hint: the page reports the width it really got, and that is the
  // one every decision below is made against.
  const contentWidth = useMemo(
    () => Math.max(MIN_CONTENT_WIDTH, (windowWidth - 40) * 0.85 - 22),
    [windowWidth]
  );

  const theme = useMemo(
    () => ({
      textColor: isDark ? '#fff' : '#000',
      backgroundColor: cardBackground,
      mutedText: isDark ? '#bdbdbd' : '#555',
      linkColor: isDark ? '#6db3f2' : '#03465b',
      codeBg: isDark ? '#2d2d2d' : '#f2f2f2',
      borderColor: isDark ? '#444' : '#ddd',
    }),
    [isDark, cardBackground],
  );

  const html = useMemo(
    () => buildMessageHtml({ content: normalizedContent, ...theme }),
    [normalizedContent, theme],
  );

  const cacheKey = `${theme.textColor}|${theme.backgroundColor}|${normalizedContent}`;
  // The height cache is the single source of truth: the current message's
  // height is read straight from it, so a recycled chat row (or a remount
  // while scrolling) can never show the previous message's size, and no
  // per-component state can drift out of sync with the cache.
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0);
  const cached = heightCache.get(cacheKey);
  // A measurement taken in a wider bubble is still a safe frame: the text
  // only ever needs more room, never less. One taken in a narrower bubble is
  // not, and reusing it is what cut off the last row after a rotation.
  const cachedHeight =
    cached && cached.width + WIDTH_TOLERANCE >= contentWidth ? cached.height : undefined;
  // Nothing is painted until the height is known for this width, so a frame
  // that is briefly too small can never show a half-height message.
  const measured = cachedHeight !== undefined;

  const onMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data);
        const measuredHeight = Math.ceil(Number(payload?.h));
        if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) return;
        // A page that has not been laid out yet reports no width; keep the
        // placeholder rather than caching a height nothing can be compared to.
        const measuredWidth = Math.round(Number(payload?.w));
        const width = Number.isFinite(measuredWidth) && measuredWidth > 0
          ? measuredWidth
          : contentWidth;
        const previous = heightCache.get(cacheKey);
        // Ignore trivial corrections: re-laying out the chat row for a pixel
        // or two only costs jank.
        if (previous && Math.abs(previous.height - measuredHeight) < 3 && previous.width === width) {
          return;
        }
        rememberHeight(cacheKey, { height: measuredHeight, width });
        forceRender();
      } catch {
        // Malformed measurement message: keep the estimated height.
      }
    },
    [cacheKey, contentWidth],
  );

  const estimatedHeight = useMemo(
    () => estimateHeight(normalizedContent, contentWidth),
    [normalizedContent, contentWidth],
  );

  // The WebView's own document loads as about:blank; only that first
  // request may pass. A markdown link like [x](about:blank) reaches the
  // same callback later and must go through the link guard instead of
  // replacing the rendered message with a blank page.
  const initialDocumentPending = useRef(true);

  return (
    <WebView
      source={{ html }}
      style={[
        styles.webView,
        { height: cachedHeight ?? estimatedHeight },
        measured ? null : styles.unmeasured,
      ]}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      overScrollMode="never"
      scalesPageToFit={false}
      setSupportMultipleWindows={false}
      // '*' is load-bearing: without it react-native-webview skips
      // onShouldStartLoadWithRequest for non-http(s) URLs and opens them
      // with Linking.openURL, which would bypass the HTTP(S) allowlist and
      // the confirm sheet (tel:, sms:, custom app schemes).
      originWhitelist={['*']}
      onLoadStart={() => {
        initialDocumentPending.current = false;
      }}
      onMessage={onMessage}
      onShouldStartLoadWithRequest={(request) => {
        if (request.url === 'about:blank' && initialDocumentPending.current) return true;
        handleAssistantLink(request.url);
        return false;
      }}
    />
  );
};

const styles = StyleSheet.create({
  webView: {
    // The bubble parent has a definite width; the page paints the bubble
    // background itself so the WebView never flashes white.
    width: '100%',
    backgroundColor: 'transparent',
  },
  // Placeholder frame: the page still loads and reports its height while
  // hidden, so the bubble jumps once to the measured size instead of
  // showing the message clipped to the placeholder.
  unmeasured: {
    opacity: 0,
  },
});

export default MarkdownRenderer;
