import React, { useCallback, useMemo } from 'react';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useThemeColor } from '@/hooks/useThemeColor';
import { KATEX_CSS } from '@/components/markdown/katexCss';
import {
  buildMessageStyles,
  renderMessageBody,
  MESSAGE_SCOPE_CLASS,
} from '@/components/markdown/markdownHtml';
import type { MessageTheme } from '@/components/markdown/markdownHtml';
import { handleAssistantLink } from '@/components/markdown/links';

interface MarkdownRendererProps {
  content: string;
}

export { isSafeHttpUrl, linkDomain } from '@/components/markdown/links';

const KATEX_STYLE_ID = 'assistant-md-katex-css';
const THEME_STYLE_ID = 'assistant-md-theme-css';

/**
 * Inject the message styles into the app document once: KaTeX's stylesheet
 * (with inlined fonts) never changes, and the theme stylesheet is rewritten
 * in place on a color-scheme change. Every rule is scoped to
 * MESSAGE_SCOPE_CLASS, so nothing here restyles the rest of the app.
 */
function ensureMessageStyles(theme: MessageTheme) {
  if (typeof document === 'undefined') return;
  const upsert = (id: string, css: string) => {
    let style = document.getElementById(id) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      document.head.appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;
  };
  upsert(KATEX_STYLE_ID, KATEX_CSS);
  upsert(THEME_STYLE_ID, buildMessageStyles(theme));
}

function normalizeMarkdown(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Web build: no WebView needed, so only the markdown body goes into the
 * DOM (native builds wrap the same body in a document — see
 * MarkdownRenderer.tsx). The measuring script is absent here, so the
 * message sizes itself.
 */
const MarkdownRenderer = ({ content }: MarkdownRendererProps) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const cardBackground = useThemeColor({}, 'cardBackground');
  const normalizedContent = useMemo(() => normalizeMarkdown(content), [content]);

  const theme = useMemo<MessageTheme>(
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

  ensureMessageStyles(theme);
  const bodyHtml = useMemo(() => renderMessageBody(normalizedContent), [normalizedContent]);

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

  return (
    <div
      className={MESSAGE_SCOPE_CLASS}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: bodyHtml }}
    />
  );
};

export default MarkdownRenderer;
