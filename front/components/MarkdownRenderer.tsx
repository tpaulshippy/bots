import React, { useMemo } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import Markdown from 'react-native-markdown-display';

interface MarkdownRendererProps {
  content: string;
}

function createMarkdownStyles(
  textColor: string,
  codeBg: string,
  borderColor: string,
  mutedText: string,
  linkColor: string,
) {
  return StyleSheet.create({
    body: {
      color: textColor,
      fontSize: 16,
      lineHeight: 24,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 10,
    },
    heading1: {
      color: textColor,
      fontSize: 28,
      marginTop: 8,
      marginBottom: 12,
    },
    heading2: {
      color: textColor,
      fontSize: 24,
      marginTop: 8,
      marginBottom: 10,
    },
    heading3: {
      color: textColor,
      fontSize: 20,
      marginTop: 8,
      marginBottom: 8,
    },
    bullet_list: {
      marginBottom: 10,
    },
    ordered_list: {
      marginBottom: 10,
    },
    list_item: {
      color: textColor,
      marginBottom: 4,
    },
    blockquote: {
      borderLeftWidth: 4,
      borderLeftColor: linkColor,
      color: mutedText,
      paddingLeft: 10,
      marginLeft: 0,
      marginRight: 0,
      marginBottom: 10,
    },
    code_inline: {
      backgroundColor: codeBg,
      color: textColor,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    code_block: {
      backgroundColor: codeBg,
      color: textColor,
      borderRadius: 8,
      padding: 10,
      marginBottom: 10,
    },
    fence: {
      backgroundColor: codeBg,
      color: textColor,
      borderRadius: 8,
      padding: 10,
      marginBottom: 10,
    },
    hr: {
      backgroundColor: borderColor,
      height: 1,
      marginVertical: 12,
    },
    table: {
      borderWidth: 1,
      borderColor: borderColor,
      marginBottom: 10,
    },
    th: {
      borderWidth: 1,
      borderColor: borderColor,
      padding: 8,
      color: textColor,
      backgroundColor: codeBg,
    },
    td: {
      borderWidth: 1,
      borderColor: borderColor,
      padding: 8,
      color: textColor,
    },
    link: {
      color: linkColor,
      textDecorationLine: 'underline',
    },
  });
}

function normalizeMarkdown(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const MarkdownRenderer = ({ content }: MarkdownRendererProps) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const normalizedContent = useMemo(() => normalizeMarkdown(content), [content]);
  const textColor = isDark ? '#fff' : '#000';
  const codeBg = isDark ? '#2d2d2d' : '#f2f2f2';
  const borderColor = isDark ? '#444' : '#ddd';
  const mutedText = isDark ? '#bdbdbd' : '#555';
  const linkColor = isDark ? '#6db3f2' : '#03465b';
  const markdownStyles = useMemo(
    () => createMarkdownStyles(textColor, codeBg, borderColor, mutedText, linkColor),
    [textColor, codeBg, borderColor, mutedText, linkColor],
  );

  return (
    <Markdown
      style={markdownStyles}
      onLinkPress={(url: string) => {
        Linking.openURL(url).catch(() => null);
        return true;
      }}
    >
      {normalizedContent}
    </Markdown>
  );
};

export default MarkdownRenderer;