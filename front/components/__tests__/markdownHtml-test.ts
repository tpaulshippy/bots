import { buildMessageHtml } from '@/components/markdown/markdownHtml';

const theme = {
  textColor: '#ffffff',
  backgroundColor: '#1c1c1e',
  mutedText: '#bdbdbd',
  linkColor: '#6db3f2',
  codeBg: '#2d2d2d',
  borderColor: '#444',
};

describe('buildMessageHtml', () => {
  it('typesets inline and display LaTeX with KaTeX instead of leaking raw text', () => {
    const html = buildMessageHtml({
      content: [
        'To solve the inequality \\( z^2 + 54 \\geq -15z \\) for \\( z \\):',
        '',
        '\\[',
        'z^2 + 54 + 15z \\geq 0',
        '\\]',
      ].join('\n'),
      ...theme,
    });

    // KaTeX markup and the >= glyph: the delimiters and \geq are consumed.
    expect(html).toContain('class="katex"');
    expect(html).toContain('≥');
    expect(html).toContain('class="katex-display"');
    // The raw TeX survives only inside KaTeX's hidden MathML annotation.
    const body = html.slice(html.indexOf('<body>'));
    expect(body).not.toContain('\\(');
    expect(body).not.toContain('\\[');
  });

  it('renders display math with KaTeX for $...$ and $$...$$ too', () => {
    const html = buildMessageHtml({
      content: 'Inline $x = 5$ and display:\n\n$$\\frac{a}{b}\n$$',
      ...theme,
    });
    expect(html).toContain('class="katex"');
    expect(html).toContain('mfrac');
    expect(html).toContain('class="katex-display"');
  });

  it('keeps currency as text', () => {
    const html = buildMessageHtml({ content: 'Tutoring costs $5 and $10 total.', ...theme });
    expect(html).not.toContain('class="katex"');
    expect(html).toContain('Tutoring costs $5 and $10 total.');
  });

  it('escapes raw HTML from model output', () => {
    const html = buildMessageHtml({
      content: '<script>alert(1)</script><img src=x onerror=alert(2)>',
      ...theme,
    });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)');
  });

  it('embeds KaTeX fonts and theme colors so the bubble renders offline', () => {
    const html = buildMessageHtml({ content: '\\( z \\)', ...theme });
    expect(html).toContain('data:font/woff2;base64');
    expect(html).not.toContain('url(fonts/');
    expect(html).toContain('#ffffff');
    expect(html).toContain('#1c1c1e');
    // No external fetches: styles, scripts and fonts are all embedded.
    // (The w3.org MathML namespace is an identifier, not a loaded resource.)
    expect(html).not.toContain('<link ');
    expect(html).not.toContain('<script src');
    expect(html).not.toMatch(/url\(https?:/);
  });

  it('posts its height back to React Native', () => {
    const html = buildMessageHtml({ content: 'hello', ...theme });
    expect(html).toContain('window.ReactNativeWebView.postMessage');
  });
});
