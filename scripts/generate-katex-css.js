#!/usr/bin/env node
/**
 * Regenerate front/components/markdown/katexCss.ts from the installed katex
 * package: the stock katex.min.css with every woff2 font inlined as a
 * base64 data URI.
 *
 * Why: assistant chat renders KaTeX HTML inside a WebView that loads no
 * external resources, so math must typeset fully offline. WebView file-URL
 * font loading is inconsistent across iOS/Android, so fonts travel as data
 * URIs instead. woff/ttf fallbacks are dropped (woff2 is supported by every
 * WKWebView/Android System WebView we target).
 *
 * Usage: node scripts/generate-katex-css.js
 * Re-run after bumping the katex dependency and commit the result.
 */
const fs = require('fs');
const path = require('path');

const frontDir = path.join(__dirname, '..', 'front');
const katexDist =
  path.dirname(require.resolve('katex/package.json', { paths: [frontDir] })) + '/dist';
const cssPath = path.join(katexDist, 'katex.min.css');
const outPath = path.join(frontDir, 'components', 'markdown', 'katexCss.ts');

let css = fs.readFileSync(cssPath, 'utf8');

// Inline each woff2 reference and drop the remaining woff/ttf fallback
// sources for that font-face.
css = css.replace(
  /url\(fonts\/([A-Za-z0-9_-]+\.woff2)\) format\("woff2"\)(?:,url\(fonts\/[A-Za-z0-9_.-]+\) format\("[a-z]+"\))*/g,
  (match, fileName) => {
    const fontPath = path.join(katexDist, 'fonts', fileName);
    if (!fs.existsSync(fontPath)) {
      throw new Error(`katex CSS references missing font: ${fileName}`);
    }
    const base64 = fs.readFileSync(fontPath).toString('base64');
    return `url(data:font/woff2;base64,${base64}) format("woff2")`;
  },
);

const inlined = (css.match(/data:font\/woff2;base64/g) || []).length;
if (inlined === 0) {
  throw new Error('No fonts were inlined — did the katex CSS format change?');
}
if (/url\(fonts\//.test(css)) {
  throw new Error('Some font URLs were not inlined');
}

const header = `/**
 * GENERATED FILE — do not edit by hand.
 * Produced by scripts/generate-katex-css.js from katex/dist/katex.min.css
 * with all woff2 fonts inlined as base64 data URIs (${inlined} font faces).
 * Re-run the script after upgrading the katex dependency.
 */
`;

// JSON.stringify escapes backslashes, quotes and raw control characters
// (katex.min.css contains a literal newline, which breaks a single-quoted
// literal). U+2028/U+2029 are escaped manually for older JS parsers.
const cssLiteral = JSON.stringify(css).replace(/[\u2028\u2029]/g, (ch) =>
  ch === '\u2028' ? '\\u2028' : '\\u2029',
);
const body = `export const KATEX_CSS =\n  ${cssLiteral};\n`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, header + body);

const sizeKb = Math.round(fs.statSync(outPath).size / 1024);
console.log(`Wrote ${outPath} (${inlined} font faces inlined, ${sizeKb} KB)`);
