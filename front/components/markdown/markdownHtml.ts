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

export interface MessageTheme {
  textColor: string;
  backgroundColor: string;
  mutedText: string;
  linkColor: string;
  codeBg: string;
  borderColor: string;
}

export interface MessageHtmlOptions extends MessageTheme {
  content: string;
  fontSize?: number;
  /**
   * Identifies this document, echoed in every measurement it reports. When the
   * app hands a recycled bubble new content, the previous document is still
   * live for a moment and can have a measurement already in flight -- its 150ms
   * timer, or a ResizeObserver callback. Without something to check, that late
   * report is credited to the new message, and a short message hands its
   * under-sized height to a long one that then clips.
   */
  docId?: string;
}

// Root class for rendered messages. Every rule is scoped to it so the web
// build can inject the stylesheet into the app document without restyling
// the rest of the app.
export const MESSAGE_SCOPE_CLASS = 'assistant-md';

// html stays disabled (markdown-it default): assistant output can never
// inject markup or script into the page.
const markdownIt = MarkdownIt({ typographer: true, html: false, linkify: false });
markdownIt.use(markdownItMath);

// Math tokens become KaTeX HTML at render time. throwOnError keeps
// malformed TeX visible as KaTeX error text instead of blanking the bubble.
// output: 'html' skips the hidden MathML: WKWebView gives display-mode
// <math> elements a real layout box, which inflated the measured height and
// pushed the message content out of view.
// \[...\] and $$...$$ can also arrive as inline tokens (mid-paragraph), so
// the inline rule honors their display flag.
markdownIt.renderer.rules.math_inline = (tokens, idx) =>
  katex.renderToString(tokens[idx].content, {
    displayMode: tokens[idx].meta?.displayMode === true,
    throwOnError: false,
    output: 'html',
  });
markdownIt.renderer.rules.math_block = (tokens, idx) =>
  katex.renderToString(tokens[idx].content, {
    displayMode: true,
    throwOnError: false,
    output: 'html',
  });

/** Render the markdown body of one message (no document wrapper). */
export function renderMessageBody(content: string): string {
  return markdownIt.render(content);
}

/**
 * Prefix every rule selector with `scope`, leaving at-rules (@font-face,
 * @keyframes) untouched. Comma-separated selector lists are scoped per part.
 * The inputs are the flat, minified KaTeX stylesheet and the rules below, so
 * a brace-boundary pass is enough.
 */
function scopeCss(css: string, scope: string): string {
  return css.replace(/(^|\})([^{}@][^{}]*)\{/g, (_match, brace, selector) => {
    const scopedSelector = selector
      .split(',')
      .map((part: string) => `${scope} ${part.trim()}`)
      .join(', ');
    return `${brace}${scopedSelector} {`;
  });
}

const MESSAGE_RULES = `
color: TEXT_COLOR;
background-color: BACKGROUND_COLOR;
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
font-size: FONT_SIZE;
line-height: 1.5;
-webkit-text-size-adjust: 100%;
overflow-wrap: break-word;
word-break: break-word;
`;

const MESSAGE_DESCENDANT_RULES = `
p { margin: 0 0 10px; }
h1 { font-size: 1.75em; margin: 8px 0 12px; }
h2 { font-size: 1.5em; margin: 8px 0 10px; }
h3 { font-size: 1.25em; margin: 8px 0 8px; }
ul, ol { margin: 0 0 10px; padding-left: 24px; }
li { margin-bottom: 4px; }
blockquote {
  border-left: 4px solid LINK_COLOR;
  color: MUTED_TEXT;
  margin: 0 0 10px;
  padding-left: 10px;
}
code {
  background-color: CODE_BG;
  border-radius: 4px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 0.9em;
  padding: 2px 6px;
}
pre {
  background-color: CODE_BG;
  border-radius: 8px;
  margin: 0 0 10px;
  overflow-x: auto;
  padding: 10px;
}
pre code { background: transparent; padding: 0; }
hr { border: 0; border-top: 1px solid BORDER_COLOR; margin: 12px 0; }
table { border-collapse: collapse; margin-bottom: 10px; }
th, td { border: 1px solid BORDER_COLOR; padding: 8px; }
th { background-color: CODE_BG; }
a { color: LINK_COLOR; text-decoration: underline; }
.katex-display { margin: 10px 0; overflow-x: auto; overflow-y: hidden; }
.katex-error { color: #cc0000; }
`;

/**
 * The message stylesheet, every rule scoped to MESSAGE_SCOPE_CLASS. Shared
 * by both platforms: the native WebView uses it inside its own document, the
 * web build injects it into the app document exactly once.
 */
export function buildMessageStyles(theme: MessageTheme, fontSize = 16): string {
  const themed = MESSAGE_DESCENDANT_RULES.replace(/LINK_COLOR/g, theme.linkColor)
    .replace(/MUTED_TEXT/g, theme.mutedText)
    .replace(/CODE_BG/g, theme.codeBg)
    .replace(/BORDER_COLOR/g, theme.borderColor);
  const root = MESSAGE_RULES.replace('FONT_SIZE', `${fontSize}px`)
    .replace('TEXT_COLOR', theme.textColor)
    .replace('BACKGROUND_COLOR', theme.backgroundColor);
  return `.${MESSAGE_SCOPE_CLASS} {${root}}${scopeCss(themed, `.${MESSAGE_SCOPE_CLASS}`)}`;
}

/**
 * Returns the full HTML document for one native message. Model output only
 * reaches the page through markdown-it's escaping and KaTeX's escaping, so
 * raw HTML or TeX in the reply cannot inject markup.
 */
export function buildMessageHtml(options: MessageHtmlOptions): string {
  const { content, docId = '', ...theme } = options;
  const bodyHtml = renderMessageBody(content);
  const fontSize = options.fontSize ?? 16;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${KATEX_CSS}</style>
<style>${buildMessageStyles(theme, fontSize)}</style>
<style>
/* Page-local resets only: this document exists solely to render one message. */
html, body { margin: 0; padding: 0; overflow: hidden; }
</style>
</head>
<body>
<div class="${MESSAGE_SCOPE_CLASS}" id="message">${bodyHtml}</div>
<script>
var DOC_ID = ${JSON.stringify(docId)};
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
  // Measure from the top of the DOCUMENT, not from the container's own box.
  // When a message opens with a heading, that heading's top margin collapses
  // out of #message, so the container's box starts partway down the frame
  // while its height does not reach the last line. Subtracting box.top then
  // throws away exactly the pixels that end up clipped: a message starting
  // with "### ..." reported 1438 for content painted down to 1446, and the
  // final line lost its bottom. The WebView frame spans the document, so the
  // height it needs is the distance from the document's top edge to the lowest
  // painted pixel.
  // The WebView frame spans the whole document, whose top edge sits at
  // viewport y = -scrollY, so the height it needs is the distance from there
  // to the lowest painted pixel.
  var needed = Math.max(bottom, box.bottom) + (window.scrollY || 0);
  // Report the width this measurement was taken at, so the app can key the
  // cached height by it. The same message wraps to a different number of lines
  // in a wider or narrower bubble, and the bubble is maxWidth: '85%' of a row
  // whose padding differs per screen, so one message is routinely measured at
  // more than one width. Reusing a height across widths is what clips.
  var width = Math.round(box.width);
  // Webfonts change metrics after load, so a report taken while they are still
  // loading is provisional: usable, but the app must not treat it as settled.
  var settled = !(document.fonts && document.fonts.status === 'loading');
  window.ReactNativeWebView.postMessage(
    JSON.stringify({ h: Math.ceil(needed), w: width, final: settled, doc: DOC_ID }),
  );
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
