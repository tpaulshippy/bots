import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useThemeColor } from '@/hooks/useThemeColor';
import { buildMessageHtml } from '@/components/markdown/markdownHtml';
import {
  pickMeasurement,
  readMeasurements,
  rememberMeasurements,
  type Measurement,
} from '@/components/markdown/heightCache';
import { handleAssistantLink } from '@/components/markdown/links';

interface MarkdownRendererProps {
  content: string;
}

export { isSafeHttpUrl, linkDomain } from '@/components/markdown/links';
export { resetHeightCache } from '@/components/markdown/heightCache';

// How long to wait for the page's first report before showing the bubble at
// the placeholder height anyway. Reports normally land within a few tens of
// milliseconds of load.
const REVEAL_FALLBACK_MS = 1200;

function normalizeMarkdown(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
  const normalizedContent = useMemo(() => normalizeMarkdown(content), [content]);

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
  // Re-reads the cache after a report so a recycled chat row (or a remount
  // while scrolling) can never keep showing a stale size.
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0);
  // Laid-out width of the WebView, which is the width the page wraps at. Known
  // from the first layout, well before the page reports, so a remount can find
  // its cached height immediately instead of flashing.
  const [width, setWidth] = useState(0);
  // This mount's own most recent report. A height the page just measured at the
  // width this bubble is rendering at is correct by construction, so it wins
  // over the cache and does not have to wait for the width to be reconciled.
  const [reported, setReported] = useState<Measurement | null>(null);
  // Until there is a real height, there is nothing honest to draw: any estimate
  // is wrong by hundreds of pixels in one direction or the other (0.9 px per
  // character for a long message, 2.3 for a short one with a heading), and a
  // frame that is too short slices the last line off, which is the bug this is
  // all about.
  const [revealTimedOut, setRevealTimedOut] = useState(false);
  const matched = pickMeasurement(readMeasurements(cacheKey), width);
  const shownHeight = reported?.height ?? matched?.height;
  const revealed = reported !== null || matched !== undefined || revealTimedOut;

  const onMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data);
        const measured = Math.ceil(Number(payload?.h));
        if (!Number.isFinite(measured) || measured <= 0) return;
        const measuredWidth = Math.round(Number(payload?.w)) || width;
        const final = payload?.final !== false;
        const previous =
          pickMeasurement(readMeasurements(cacheKey), measuredWidth) ??
          // This mount may already have reported at this width, before the
          // value was cached, so compare against what is on screen too.
          (reported?.width === measuredWidth ? reported : undefined);
        // Ignore trivial corrections: re-laying out the chat row for a pixel
        // or two only costs jank. Not when either side is provisional, though:
        // a pre-font height is a guess, and dropping the settled correction
        // because it moved by two pixels would keep the guess.
        if (
          previous !== undefined &&
          previous.final &&
          final &&
          Math.abs(previous.height - measured) < 3
        ) {
          return;
        }
        const next = (readMeasurements(cacheKey) ?? []).filter(
          (entry) => entry.width !== measuredWidth,
        );
        next.push({ width: measuredWidth, height: measured, final });
        rememberMeasurements(cacheKey, next);
        setReported({ width: measuredWidth, height: measured, final });
        forceRender();
      } catch {
        // Malformed measurement message: keep the current height.
      }
    },
    [cacheKey, width, reported],
  );

  // While the bubble is hidden this only decides how much room the row
  // reserves, so it never has to be right -- nothing is painted at this size.
  // It just keeps the reserved height in the right neighbourhood so the row
  // does not jump a long way when the real height lands. (An over-estimate
  // would be worse than useless here: no single per-character rate can
  // over-shoot both a long message at 0.9 px/char and a short one with a
  // heading at 2.3, so the honest answer is to paint nothing until measured.)
  const estimatedHeight = Math.max(
    44,
    Math.ceil((normalizedContent.length / 38) * 24) + 16,
  );

  // The WebView's own document loads as about:blank; only that first
  // request may pass. A markdown link like [x](about:blank) reaches the
  // same callback later and must go through the link guard instead of
  // replacing the rendered message with a blank page.
  const initialDocumentPending = useRef(true);

  // Never leave a message permanently invisible. The page reports on load and
  // then again after its fonts settle, so this is only a backstop for a
  // WebView that never manages to report at all; better a bubble at the
  // placeholder height than a blank row with no way to tell it apart from
  // a rendering failure.
  useEffect(() => {
    if (revealed) return;
    const timer = setTimeout(() => setRevealTimedOut(true), REVEAL_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [revealed, cacheKey]);

  return (
    <WebView
      source={{ html }}
      onLayout={(event) => {
        const laidOut = Math.round(event.nativeEvent.layout.width);
        setWidth((current) => (current === laidOut ? current : laidOut));
      }}
      style={[
        styles.webView,
        { height: shownHeight ?? estimatedHeight, opacity: revealed ? 1 : 0 },
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
});

export default MarkdownRenderer;
