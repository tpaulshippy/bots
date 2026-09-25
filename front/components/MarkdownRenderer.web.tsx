import React, { useCallback, useMemo } from 'react';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useThemeColor } from '@/hooks/useThemeColor';
import { buildMessageHtml } from '@/components/markdown/markdownHtml';
import { handleAssistantLink } from '@/components/markdown/links';

interface MarkdownRendererProps {
  content: string;
}

export { isSafeHttpUrl, linkDomain } from '@/components/markdown/links';

function normalizeMarkdown(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Web build: no WebView needed, so the same markdown + KaTeX HTML goes
 * straight into the DOM. The embedded <style> blocks (KaTeX CSS with
 * inlined fonts) travel with the HTML, and the measuring script is inert
 * without the ReactNativeWebView bridge.
 */
const MarkdownRenderer = ({ content }: MarkdownRendererProps) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const cardBackground = useThemeColor({}, 'cardBackground');
  const normalizedContent = useMemo(() => normalizeMarkdown(content), [content]);

  const html = useMemo(
    () =>
      buildMessageHtml({
        content: normalizedContent,
        textColor: isDark ? '#fff' : '#000',
        backgroundColor: cardBackground,
        mutedText: isDark ? '#bdbdbd' : '#555',
        linkColor: isDark ? '#6db3f2' : '#03465b',
        codeBg: isDark ? '#2d2d2d' : '#f2f2f2',
        borderColor: isDark ? '#444' : '#ddd',
      }),
    [normalizedContent, isDark, cardBackground],
  );

  // Intercept link clicks so assistant links keep the confirm-sheet flow
  // instead of navigating the app away.
  const onClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement | null)?.closest?.('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    event.preventDefault();
    handleAssistantLink(href);
  }, []);

  return <div onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
};

export default MarkdownRenderer;
