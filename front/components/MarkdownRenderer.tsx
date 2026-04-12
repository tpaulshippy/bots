import React, { useMemo } from 'react';
import { WebView } from 'react-native-webview';
import { useColorScheme } from '@/hooks/useColorScheme';
import { marked } from 'marked';
import katex from 'katex';

interface MarkdownRendererProps {
  content: string;
}

function generateHtml(content: string, isDark: boolean): string {
  const textColor = isDark ? '#fff' : '#000';
  const bgColor = isDark ? '#1c1c1e' : '#fff';
  const codeBg = isDark ? '#2d2d2d' : '#f5f5f5';
  const linkColor = isDark ? '#6db3f2' : '#03465b';

  const processedContent = content
    .replace(/\\\(([^)]+)\\\)/g, (_, latex) => {
      try {
        return katex.renderToString(latex, { throwOnError: false, displayMode: false });
      } catch {
        return `\\(${latex}\\)`;
      }
    })
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, latex) => {
      try {
        return katex.renderToString(latex, { throwOnError: false, displayMode: true });
      } catch {
        return `\\[${latex}\\]`;
      }
    });

  const htmlContent = marked.parse(processedContent, { breaks: true, gfm: true });

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: ${textColor};
      background-color: ${bgColor};
      padding: 8px;
      margin: 0;
      word-wrap: break-word;
    }
    a { color: ${linkColor}; }
    code {
      background-color: ${codeBg};
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 14px;
    }
    pre {
      background-color: ${codeBg};
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
    }
    pre code {
      padding: 0;
      background: none;
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
    }
    blockquote {
      border-left: 4px solid ${linkColor};
      margin: 8px 0;
      padding-left: 12px;
      color: ${isDark ? '#aaa' : '#666'};
    }
    ul, ol {
      padding-left: 20px;
    }
    li {
      margin: 4px 0;
    }
    h1, h2, h3, h4, h5, h6 {
      margin: 12px 0 8px 0;
    }
    p {
      margin: 8px 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 8px 0;
    }
    th, td {
      border: 1px solid ${isDark ? '#444' : '#ddd'};
      padding: 8px;
      text-align: left;
    }
    th {
      background-color: ${codeBg};
    }
    hr {
      border: none;
      border-top: 1px solid ${isDark ? '#444' : '#ddd'};
      margin: 12px 0;
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
}

const MarkdownRenderer = ({ content }: MarkdownRendererProps) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const html = useMemo(() => generateHtml(content, isDark), [content, isDark]);

  return (
    <WebView
      originWhitelist={['*']}
      source={{ html }}
      style={{ backgroundColor: 'transparent', minHeight: 50 }}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      messagingEnabled={false}
    />
  );
};

export default MarkdownRenderer;