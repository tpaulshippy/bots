import React, { useCallback, useMemo, useReducer } from 'react';
import { StyleSheet } from 'react-native';
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
const heightCache = new Map<string, number>();
const MAX_CACHE_ENTRIES = 200;

function rememberHeight(key: string, height: number) {
  if (heightCache.size >= MAX_CACHE_ENTRIES) heightCache.clear();
  heightCache.set(key, height);
}

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
  // The height cache is the single source of truth: the current message's
  // height is read straight from it, so a recycled chat row (or a remount
  // while scrolling) can never show the previous message's size, and no
  // per-component state can drift out of sync with the cache.
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0);
  const cachedHeight = heightCache.get(cacheKey);

  const onMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const measured = Math.ceil(Number(JSON.parse(event.nativeEvent.data)?.h));
        if (!Number.isFinite(measured) || measured <= 0) return;
        const previous = heightCache.get(cacheKey);
        // Ignore trivial corrections: re-laying out the chat row for a pixel
        // or two only costs jank.
        if (previous !== undefined && Math.abs(previous - measured) < 3) return;
        rememberHeight(cacheKey, measured);
        forceRender();
      } catch {
        // Malformed measurement message: keep the estimated height.
      }
    },
    [cacheKey],
  );

  // Under-estimate on purpose: the page can only grow the frame towards the
  // real content height, never shrink it below the text.
  const estimatedHeight = Math.max(44, Math.ceil((normalizedContent.length / 38) * 24) + 16);

  return (
    <WebView
      source={{ html }}
      style={[styles.webView, { height: cachedHeight ?? estimatedHeight }]}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      overScrollMode="never"
      scalesPageToFit={false}
      setSupportMultipleWindows={false}
      originWhitelist={['about:blank']}
      onMessage={onMessage}
      onShouldStartLoadWithRequest={(request) => {
        // Only the initial in-memory document may load. Assistant links are
        // intercepted: confirmed in-app, never navigated inside the bubble.
        if (request.url === 'about:blank') return true;
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
