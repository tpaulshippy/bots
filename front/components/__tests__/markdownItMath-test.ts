import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { markdownItMath } from '@/components/markdown/markdownItMath';

const md = MarkdownIt({ typographer: true });
md.use(markdownItMath);

function allTokens(src: string): Token[] {
  const block = md.parse(src, {});
  const out: Token[] = [];
  const walk = (tokens: Token[]) => {
    for (const token of tokens) {
      out.push(token);
      if (token.children) walk(token.children);
    }
  };
  walk(block);
  return out;
}

function mathTokens(src: string): Token[] {
  return allTokens(src).filter((t) => t.type === 'math_inline' || t.type === 'math_block');
}

describe('markdownItMath', () => {
  it('tokenizes inline \\(...\\) math without mangling the delimiters', () => {
    const tokens = mathTokens('Solve \\( z^2 + 54 \\geq -15z \\) for \\( z \\).');
    expect(tokens).toHaveLength(2);
    expect(tokens[0].type).toBe('math_inline');
    expect(tokens[0].content).toBe(' z^2 + 54 \\geq -15z ');
    expect(tokens[0].meta).toEqual({ displayMode: false });
    expect(tokens[1].content).toBe(' z ');
  });

  it('tokenizes a multi-line \\[...\\] display block (the reported bug)', () => {
    const tokens = mathTokens('Move all terms to the left side:\n\n\\[\nz^2 + 54 + 15z \\geq 0\n\\]');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe('math_block');
    expect(tokens[0].content).toBe('\nz^2 + 54 + 15z \\geq 0\n');
    expect(tokens[0].meta).toEqual({ displayMode: true });
  });

  it('tokenizes $$...$$ display math on one line', () => {
    const tokens = mathTokens('$$\nx = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\n$$');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe('math_block');
    expect(tokens[0].meta).toEqual({ displayMode: true });
  });

  it('tokenizes single-line $...$ inline math', () => {
    const tokens = mathTokens('The root is $z = -6$ here.');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe('math_inline');
    expect(tokens[0].content).toBe('z = -6');
    expect(tokens[0].meta).toEqual({ displayMode: false });
  });

  it('does not treat currency as math', () => {
    expect(mathTokens('It costs $5 and $10 total.')).toHaveLength(0);
    expect(mathTokens('Price: $5.')).toHaveLength(0);
  });

  it('does not tokenize math inside code spans or fenced code', () => {
    expect(mathTokens('Use `\\( z \\)` as the delimiter.')).toHaveLength(0);
    expect(mathTokens('```\n\\( z \\)\n```')).toHaveLength(0);
  });

  it('respects escaped delimiters', () => {
    expect(mathTokens('An escaped dollar \\$5 stays text.')).toHaveLength(0);
  });

  it('ignores empty math', () => {
    expect(mathTokens('Empty \\( \\) here.')).toHaveLength(0);
  });

  it('keeps trailing text on the closer line out of a display block', () => {
    const tokens = allTokens('\\[ x \\] then text');
    const math = tokens.filter((t) => t.type === 'math_block');
    const inline = tokens.filter((t) => t.type === 'math_inline');
    // Block rule must refuse (text after closer); inline catches the math so
    // "then text" survives as a regular text token.
    expect(math).toHaveLength(0);
    expect(inline).toHaveLength(1);
    expect(inline[0].meta).toEqual({ displayMode: true });
    expect(tokens.some((t) => t.type === 'text' && t.content.includes('then text'))).toBe(true);
  });

  it('does not consume indented \\[ as math (code block wins)', () => {
    expect(mathTokens('    \\[ x \\]')).toHaveLength(0);
  });

  it('handles the full inequality walkthrough from the bug report', () => {
    const src = [
      'To solve the inequality \\( z^2 + 54 \\geq -15z \\) for \\( z \\), let\u2019s go',
      'through the steps systematically.',
      '',
      '**Step 1: Rewrite the inequality in standard form**',
      '',
      'We need to get all terms on one side of the inequality. Let\u2019s move all',
      'terms to the left side:',
      '',
      '\\[',
      'z^2 + 54 + 15z \\geq 0',
      '\\]',
      '',
      '**Step 2: Combine like terms**',
      '',
      'Combine the \\( z \\) terms:',
      '',
      '\\[',
      'z^2 + 15z + 54 \\geq 0',
      '\\]',
    ].join('\n');

    const tokens = mathTokens(src);
    expect(tokens).toHaveLength(5);
    expect(tokens.filter((t) => t.type === 'math_inline')).toHaveLength(3);
    expect(tokens.filter((t) => t.type === 'math_block')).toHaveLength(2);
    // The rendered markdown must no longer leak raw delimiters as text.
    const text = allTokens(src)
      .filter((t) => t.type === 'text')
      .map((t) => t.content)
      .join('');
    expect(text).not.toContain('\\geq');
    expect(text).not.toContain('z^2');
  });
});
