/**
 * Builds the self-contained HTML document that renders one assistant chat
 * message: markdown (markdown-it) with LaTeX math typeset by KaTeX.
 *
 * The whole message renders inside a single WebView instead of native
 * views. React Native <Text> cannot host a WebView mid-sentence reliably on
 * iOS — wide inline expressions are dropped from the line or drawn over the
 * surrounding text — and one document per message needs fewer WebViews than
 * one per expression while giving KaTeX real text flow for both inline and
 * display math.
 */
import MarkdownIt from 'markdown-it';
import katex from 'katex';
import { KATEX_CSS } from './katexCss';
import { markdownItMath } from './markdownItMath';

export interface MessageHtmlOptions {
  content: string;
  textColor: string;
  backgroundColor: string;
  mutedText: string;
  linkColor: string;
  codeBg: string;
  borderColor: string;
  fontSize?: number;
}

// html stays disabled (markdown-it default): assistant output can never
// inject markup or script into the page.
const markdownIt = MarkdownIt({ typographer: true, html: false, linkify: false });
markdownIt.use(markdownItMath);

// Math tokens become KaTeX HTML at render time. throwOnError keeps
// malformed TeX visible as KaTeX error text instead of blanking the bubble.
// output: 'html' skips the hidden MathML: WKWebView gives display-mode
// <math> elements a real layout box, which inflated the measured height and
// pushed the message content out of view.
markdownIt.renderer.rules.math_inline = (tokens, idx) =>
  katex.renderToString(tokens[idx].content, { throwOnError: false, output: 'html' });
markdownIt.renderer.rules.math_block = (tokens, idx) =>
  katex.renderToString(tokens[idx].content, {
    displayMode: true,
    throwOnError: false,
    output: 'html',
  });

function chatCss(options: Required<Omit<MessageHtmlOptions, 'content'>>): string {
  const { textColor, backgroundColor, mutedText, linkColor, codeBg, borderColor, fontSize } = options;
  return `
/* The page must never scroll: React Native pins the WebView to the measured
   content size, and any leftover scroll area would show the wrong slice. */
html, body { margin: 0; padding: 0; background-color: ${backgroundColor}; overflow: hidden; }
body {
  color: ${textColor};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: ${fontSize}px;
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
  overflow-wrap: break-word;
  word-break: break-word;
}
p { margin: 0 0 10px; }
h1 { font-size: 1.75em; margin: 8px 0 12px; }
h2 { font-size: 1.5em; margin: 8px 0 10px; }
h3 { font-size: 1.25em; margin: 8px 0 8px; }
ul, ol { margin: 0 0 10px; padding-left: 24px; }
li { margin-bottom: 4px; }
blockquote {
  border-left: 4px solid ${linkColor};
  color: ${mutedText};
  margin: 0 0 10px;
  padding-left: 10px;
}
code {
  background-color: ${codeBg};
  border-radius: 4px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 0.9em;
  padding: 2px 6px;
}
pre {
  background-color: ${codeBg};
  border-radius: 8px;
  margin: 0 0 10px;
  overflow-x: auto;
  padding: 10px;
}
pre code { background: transparent; padding: 0; }
hr { border: 0; border-top: 1px solid ${borderColor}; margin: 12px 0; }
table { border-collapse: collapse; margin-bottom: 10px; }
th, td { border: 1px solid ${borderColor}; padding: 8px; }
th { background-color: ${codeBg}; }
a { color: ${linkColor}; text-decoration: underline; }
.katex-display { margin: 10px 0; overflow-x: auto; overflow-y: hidden; }
.katex-error { color: #cc0000; }
`;
}

/**
 * Returns the full HTML document for one message. Model output only reaches
 * the page through markdown-it's escaping and KaTeX's escaping, so raw HTML
 * or TeX in the reply cannot inject markup.
 */
export function buildMessageHtml(options: MessageHtmlOptions): string {
  const { content, ...theme } = options;
  const bodyHtml = markdownIt.render(content);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${KATEX_CSS}</style>
<style>${chatCss({ fontSize: 16, ...theme })}</style>
</head>
<body>
<div id="message">${bodyHtml}</div>
<script>
function postHeight() {
  var el = document.getElementById('message');
  if (!el || !window.ReactNativeWebView) return;
  // Range rects are the individual line boxes, so the lowest one is the
  // true text bottom. scrollHeight would report the viewport instead, and
  // feeding an over-tall viewport back into the next measurement locks the
  // bubble at the wrong size.
  var range = document.createRange();
  range.selectNodeContents(el);
  var rects = range.getClientRects();
  var bottom = 0;
  for (var i = 0; i < rects.length; i++) {
    if (rects[i].height > 0 && rects[i].bottom > bottom) bottom = rects[i].bottom;
  }
  var box = el.getBoundingClientRect();
  if (bottom === 0) bottom = box.bottom;
  window.ReactNativeWebView.postMessage(JSON.stringify({ h: Math.ceil(bottom - box.top) }));
}
window.addEventListener('load', function () {
  postHeight();
  // Inlined fonts settle after load and change metrics, so re-measure.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(postHeight);
  }
  // React Native pins the bubble to the measured height; late font metrics
  // or KaTeX error text reflows are re-reported.
  if (window.ResizeObserver) {
    new ResizeObserver(postHeight).observe(document.documentElement);
  }
  setTimeout(postHeight, 150);
});
</script>
</body>
</html>`;
}
