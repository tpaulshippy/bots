import {
  buildMessageHtml,
  buildMessageStyles,
  renderMessageBody,
  MESSAGE_SCOPE_CLASS,
} from '@/components/markdown/markdownHtml';

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

  it('renders a mid-paragraph \\[...\\] as display math, not inline', () => {
    const html = buildMessageHtml({ content: 'see \\[ x + 1 \\] below', ...theme });
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

describe('buildMessageStyles (shared with the web build)', () => {
  it('scopes every rule to the message container', () => {
    const css = buildMessageStyles(theme);
    expect(css).toContain(`.${MESSAGE_SCOPE_CLASS} p {`);
    expect(css).toContain(`.${MESSAGE_SCOPE_CLASS} .katex-display {`);
    expect(css).toContain(`.${MESSAGE_SCOPE_CLASS} a {`);
    // Comma lists must scope every part, not just the first.
    expect(css).toContain(`.${MESSAGE_SCOPE_CLASS} ul, .${MESSAGE_SCOPE_CLASS} ol {`);
    // No global element selectors: the web build injects this into the app
    // document, where an unscoped `p { ... }` would restyle every screen.
    expect(css).not.toMatch(/(^|\})\s*(p|h1|ul|a|code|pre|table)\s*[,{]/);
    expect(css).not.toMatch(/(^|\})\s*(html|body)\s*[,{]/);
  });

  it('bakes the theme colors in', () => {
    const css = buildMessageStyles(theme);
    expect(css).toContain('color: #ffffff');
    expect(css).toContain('background-color: #1c1c1e');
    expect(css).toContain('border-left: 4px solid #6db3f2');
  });
});

describe('renderMessageBody', () => {
  it('returns only the rendered body, without document or style tags', () => {
    const html = renderMessageBody('**bold** and \\( z^2 \\)');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('class="katex"');
    expect(html).not.toContain('<style');
    expect(html).not.toContain('<!DOCTYPE');
    expect(html).not.toContain('<html');
  });
});
