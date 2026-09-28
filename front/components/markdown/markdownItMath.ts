/**
 * markdown-it plugin that tokenizes LaTeX math so assistant messages can
 * typeset it with KaTeX instead of leaking raw markup like "\geq" into the
 * chat bubble (markdown's backslash-escape rule used to eat the "\(" and
 * "\[" delimiters, which is what produced the garbled rendering).
 *
 * Supported delimiters (matching what the tutoring models emit):
 *   inline:  \( ... \)   $ ... $
 *   display: \[ ... \]   $$ ... $$
 *
 * Explicit delimiters (\(, \[, $$) may span line breaks; bare $...$ may not,
 * and $ carries pandoc-style guards so prices like "$5 and $10" stay text.
 *
 * Tokens carry the TeX source in `token.content` and `{ displayMode }` in
 * `token.meta`.
 */
import MarkdownIt from 'markdown-it';
// markdown-it v14 ships ESM type declarations; the deep specifiers carry
// the .mjs extension.
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';

interface MathDelimiter {
  open: string;
  close: string;
  displayMode: boolean;
  allowNewline: boolean;
}

const BACKSLASH_DELIMITERS: Record<string, MathDelimiter> = {
  '(': { open: '\\(', close: '\\)', displayMode: false, allowNewline: true },
  '[': { open: '\\[', close: '\\]', displayMode: true, allowNewline: true },
};

const DOLLAR_DELIMITER: MathDelimiter = {
  open: '$',
  close: '$',
  displayMode: false,
  allowNewline: false,
};

const DOUBLE_DOLLAR_DELIMITER: MathDelimiter = {
  open: '$$',
  close: '$$',
  displayMode: true,
  allowNewline: true,
};

/** True when the character before `index` does not escape it. */
function isEscaped(src: string, index: number): boolean {
  let backslashes = 0;
  for (let k = index - 1; k >= 0 && src[k] === '\\'; k--) backslashes++;
  return backslashes % 2 === 1;
}

/**
 * Find the unescaped closing delimiter at or after `from`, bounded by `max`.
 * Returns -1 when absent, or when newlines are disallowed and the match
 * would span one.
 */
function findClosing(
  src: string,
  from: number,
  delimiter: MathDelimiter,
  max: number,
): number {
  let searchFrom = from;
  for (;;) {
    const idx = src.indexOf(delimiter.close, searchFrom);
    if (idx === -1 || idx >= max) return -1;
    if (isEscaped(src, idx)) {
      searchFrom = idx + delimiter.close.length;
      continue;
    }
    if (!delimiter.allowNewline && src.slice(from, idx).includes('\n')) return -1;
    return idx;
  }
}

function matchDelimiterAt(src: string, pos: number): MathDelimiter | null {
  const ch = src[pos];
  if (ch === '\\') {
    return BACKSLASH_DELIMITERS[src[pos + 1]] ?? null;
  }
  if (ch === '$') {
    return src[pos + 1] === '$' ? DOUBLE_DOLLAR_DELIMITER : DOLLAR_DELIMITER;
  }
  return null;
}

/** Pandoc-style guards so currency like "$5 and $10" is not math. */
function passesDollarGuards(src: string, content: string, closeEnd: number): boolean {
  if (/\s/.test(content[0]) || /\s/.test(content[content.length - 1])) return false;
  const after = src[closeEnd];
  if (after !== undefined && /[0-9]/.test(after)) return false;
  return true;
}

function mathInline(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const start = state.pos;
  const delimiter = matchDelimiterAt(src, start);
  if (!delimiter) return false;

  const contentStart = start + delimiter.open.length;
  if (contentStart >= state.posMax) return false;

  const closeStart = findClosing(src, contentStart, delimiter, state.posMax);
  if (closeStart === -1) return false;

  const content = src.slice(contentStart, closeStart);
  if (!content.trim()) return false;

  const closeEnd = closeStart + delimiter.close.length;
  if (delimiter === DOLLAR_DELIMITER && !passesDollarGuards(src, content, closeEnd)) {
    return false;
  }

  if (!silent) {
    const token = state.push('math_inline', '', 0);
    token.content = content;
    token.markup = delimiter.open;
    token.meta = { displayMode: delimiter.displayMode };
  }
  state.pos = closeEnd;
  return true;
}

function mathBlock(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  const startPos = state.bMarks[startLine] + state.tShift[startLine];
  // Four-space indentation means an indented code block, not math.
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;

  const src = state.src;
  let delimiter: MathDelimiter;
  if (src.startsWith(DOUBLE_DOLLAR_DELIMITER.open, startPos)) {
    delimiter = DOUBLE_DOLLAR_DELIMITER;
  } else if (src.startsWith('\\[', startPos)) {
    delimiter = BACKSLASH_DELIMITERS['['];
  } else {
    return false;
  }

  const contentStart = startPos + delimiter.open.length;
  const searchLimit = state.eMarks[endLine];
  const closeStart = findClosing(src, contentStart, delimiter, searchLimit);
  if (closeStart === -1) return false;

  const content = src.slice(contentStart, closeStart);
  if (!content.trim()) return false;

  // Consume every line up to and including the one holding the closer.
  const closeEnd = closeStart + delimiter.close.length;
  let lastLine = startLine;
  while (lastLine < endLine && state.eMarks[lastLine] < closeEnd) lastLine++;

  // A closer followed by more text on its line is not a display block; let
  // the inline rule handle the math so the trailing text survives.
  if (src.slice(closeEnd, state.eMarks[lastLine]).trim()) return false;

  if (silent) return true;

  state.line = lastLine + 1;
  const token = state.push('math_block', '', 0);
  token.block = true;
  token.map = [startLine, state.line];
  token.content = content;
  token.markup = delimiter.open;
  token.meta = { displayMode: true };
  return true;
}

export function markdownItMath(md: MarkdownIt): void {
  // Before 'escape' so \( and \[ reach this rule instead of being unescaped
  // to bare parentheses/brackets; before 'fence' so $$ and \[ blocks win.
  md.block.ruler.before('fence', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.inline.ruler.before('escape', 'math_inline', mathInline);
}

export default markdownItMath;
