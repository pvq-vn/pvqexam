import katex from 'katex';

export type BlockToken =
  | { type: 'code'; language: string; content: string }
  | { type: 'math-block'; latex: string }
  | { type: 'table'; content: string }
  | { type: 'paragraph'; lines: string[] };

export type InlineToken =
  | { type: 'text'; content: string }
  | { type: 'code'; content: string }
  | { type: 'math-inline'; latex: string; displayMode: boolean }
  | { type: 'bold'; children: InlineToken[] }
  | { type: 'italic'; children: InlineToken[] }
  | { type: 'underline'; children: InlineToken[] }
  | { type: 'bold-underline'; children: InlineToken[] }
  | { type: 'sub'; content: string }
  | { type: 'sup'; content: string }
  | { type: 'url'; rawToken: string }
  | { type: 'slot-badge'; slotNumber: string };

// Memoized cache for KaTeX HTML strings to avoid re-parsing repeated formulas ($n$, $O(n)$, etc.)
const katexHtmlCache = new Map<string, { html: string; hasError: boolean }>();
const MAX_KATEX_CACHE_SIZE = 2000;

/**
 * Safely renders a LaTeX string to HTML using KaTeX with caching and error fallback.
 * `trust: false` ensures no unsafe HTML/JS injection can occur through LaTeX commands.
 */
export function renderLatexToHtml(
  latex: string,
  displayMode = false
): { html: string; hasError: boolean } {
  const trimmed = latex.trim();
  if (!trimmed) return { html: '', hasError: false };

  const cacheKey = `${displayMode ? 'D' : 'I'}:${trimmed}`;
  const cached = katexHtmlCache.get(cacheKey);
  if (cached) return cached;

  try {
    const html = katex.renderToString(trimmed, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
      output: 'htmlAndMathml',
    });
    const result = { html, hasError: false };
    if (katexHtmlCache.size >= MAX_KATEX_CACHE_SIZE) {
      const firstKey = katexHtmlCache.keys().next().value;
      if (firstKey) katexHtmlCache.delete(firstKey);
    }
    katexHtmlCache.set(cacheKey, result);
    return result;
  } catch {
    const fallback = { html: '', hasError: true };
    katexHtmlCache.set(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Decodes common HTML entities (e.g. &lt; -> <, &gt; -> >, &quot; -> ", &#39; -> ', &amp; -> &)
 * so that escaped content such as `&lt;&lt;include&gt;&gt;` renders cleanly as `<<include>>`.
 */
export function decodeHtmlEntities(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Normalizes HTML <br>, <br/>, <br /> tags into newline characters outside code blocks.
 */
function normalizeLineBreaks(input: string): string {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
}

/**
 * Splits raw rich text into block-level tokens:
 * - Fenced code blocks (```lang ... ```)
 * - Standalone display math blocks ($$ ... $$ or \[ ... \])
 * - Embedded markdown pipe tables
 * - Text paragraphs
 */
export function tokenizeBlocks(rawContent: string): BlockToken[] {
  if (!rawContent || typeof rawContent !== 'string') return [];

  const blocks: BlockToken[] = [];
  // Match fenced code blocks ```...``` first so nothing inside them is altered
  const codeFenceRegex = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeFenceRegex.exec(rawContent)) !== null) {
    if (match.index > lastIndex) {
      const textSegment = rawContent.slice(lastIndex, match.index);
      blocks.push(...tokenizeNonCodeBlocks(textSegment));
    }

    const lang = (match[1] || '').trim().toLowerCase();
    const codeBody = (match[2] || '').replace(/^\n+|\n+$/g, '');
    blocks.push({
      type: 'code',
      language: lang,
      content: codeBody,
    });

    lastIndex = codeFenceRegex.lastIndex;
  }

  if (lastIndex < rawContent.length) {
    blocks.push(...tokenizeNonCodeBlocks(rawContent.slice(lastIndex)));
  }

  return blocks;
}

function tokenizeNonCodeBlocks(segment: string): BlockToken[] {
  const decoded = decodeHtmlEntities(segment);
  const normalized = normalizeLineBreaks(decoded);
  const results: BlockToken[] = [];

  // Split out standalone display math blocks $$ ... $$ or \[ ... \]
  const displayMathRegex = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = displayMathRegex.exec(normalized)) !== null) {
    if (m.index > lastIdx) {
      results.push(...tokenizeParagraphsAndTables(normalized.slice(lastIdx, m.index)));
    }
    const latex = (m[1] ?? m[2] ?? '').trim();
    if (latex) {
      results.push({ type: 'math-block', latex });
    }
    lastIdx = displayMathRegex.lastIndex;
  }

  if (lastIdx < normalized.length) {
    results.push(...tokenizeParagraphsAndTables(normalized.slice(lastIdx)));
  }

  return results;
}

function tokenizeParagraphsAndTables(text: string): BlockToken[] {
  const rawLines = text.split('\n');
  const blocks: BlockToken[] = [];

  let currentParagraphLines: string[] = [];
  let currentTableLines: string[] = [];

  const flushParagraph = () => {
    if (currentParagraphLines.length > 0) {
      blocks.push({ type: 'paragraph', lines: currentParagraphLines });
      currentParagraphLines = [];
    }
  };

  const flushTable = () => {
    if (currentTableLines.length > 0) {
      if (currentTableLines.length >= 2) {
        blocks.push({ type: 'table', content: currentTableLines.join('\n') });
      } else {
        currentParagraphLines.push(...currentTableLines);
      }
      currentTableLines = [];
    }
  };

  for (const line of rawLines) {
    const trimmed = line.trim();
    // Detect markdown pipe table row: starts and ends with | and has at least 2 pipes
    const isTableLine =
      trimmed.startsWith('|') &&
      trimmed.endsWith('|') &&
      trimmed.length > 2 &&
      (trimmed.match(/\|/g)?.length ?? 0) >= 2;

    if (isTableLine) {
      flushParagraph();
      currentTableLines.push(trimmed);
    } else {
      flushTable();
      if (trimmed === '') {
        flushParagraph();
      } else {
        currentParagraphLines.push(line);
      }
    }
  }

  flushTable();
  flushParagraph();

  return blocks;
}

/**
 * Combined inline tokenizer for a single line of text.
 * Preserves order of precedence:
 * 1. Inline code: `...`
 * 2. Display math on single line: $$...$$ or \[...\]
 * 3. Inline math: $...$ or \(...\)
 * 4. Safe inline HTML tags from exam JSONs: <b><u>...</u></b>, <b>...</b>, <u>...</u>, <i>...</i>, <sub>...</sub>, <sup>...</sup>
 * 5. Markdown bold: **...**
 * 6. URLs: https?://...
 * 7. Dropdown slot markers: [1], [2], ...
 */
const INLINE_MASTER_REGEX = new RegExp(
  [
    // 1. Inline code `...`
    '`([^`\\n]+)`',
    // 2. Display math $$...$$ or \\[...\\]
    '\\$\\$([^$\\n]+?)\\$\\$|\\\\\\[([^\\n]+?)\\\\\\]',
    // 3. Inline math $...$ (not starting/ending with space-only currency) or \\(...\\)
    '\\$((?:\\\\\\$|[^$\\n])+?)\\$|\\\\\\(([^\\n]+?)\\\\\\)',
    // 4. Safe HTML tags: <b><u>...</u></b>, <u><b>...</b></u>, <b>...</b>, <strong>...</strong>, <u>...</u>, <i>...</i>, <em>...</em>, <sub>...</sub>, <sup>...</sup>
    '<(?:b|strong)>\\s*<u>([\\s\\S]*?)<\\/u>\\s*<\\/(?:b|strong)>',
    '<u>\\s*<(?:b|strong)>([\\s\\S]*?)<\\/(?:b|strong)>\\s*<\\/u>',
    '<(?:b|strong)>([\\s\\S]*?)<\\/(?:b|strong)>',
    '<u>([\\s\\S]*?)<\\/u>',
    '<(?:i|em)>([\\s\\S]*?)<\\/(?:i|em)>',
    '<sub>([\\s\\S]*?)<\\/sub>',
    '<sup>([\\s\\S]*?)<\\/sup>',
    // 5. Markdown bold **...**
    '\\*\\*([^*\\n]+?)\\*\\*',
    // 6. URL https?://...
    '(https?:\\/\\/[^\\s<>"]+)',
    // 7. Dropdown slot marker [1]..[20]
    '\\[([1-9]|1[0-9]|20)\\]',
  ].join('|'),
  'gi'
);

export function tokenizeInline(line: string, allowNested = true): InlineToken[] {
  if (!line) return [];

  const cleanLine = decodeHtmlEntities(line);
  const tokens: InlineToken[] = [];
  const regex = new RegExp(INLINE_MASTER_REGEX.source, 'gi');
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(cleanLine)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: 'text',
        content: cleanLine.slice(lastIndex, match.index),
      });
    }

    const [
      fullMatch,
      inlineCode,
      displayMathDollar,
      displayMathBracket,
      inlineMathDollar,
      inlineMathParen,
      htmlBoldUnderline1,
      htmlBoldUnderline2,
      htmlBold,
      htmlUnderline,
      htmlItalic,
      htmlSub,
      htmlSup,
      mdBold,
      urlMatch,
      slotBadge,
    ] = match;

    if (inlineCode !== undefined) {
      tokens.push({ type: 'code', content: inlineCode });
    } else if (displayMathDollar !== undefined || displayMathBracket !== undefined) {
      tokens.push({
        type: 'math-inline',
        latex: (displayMathDollar ?? displayMathBracket).trim(),
        displayMode: true,
      });
    } else if (inlineMathDollar !== undefined || inlineMathParen !== undefined) {
      const candidate = inlineMathDollar ?? inlineMathParen;
      // Guard against shell prompt "$ cmd ... $" if it has leading & trailing spaces without math chars
      if (
        inlineMathDollar !== undefined &&
        /^\s+[a-z]{2,}\s+/i.test(candidate) &&
        !/[\\^_{}=<>+\-*/()]/.test(candidate)
      ) {
        tokens.push({ type: 'text', content: fullMatch });
      } else {
        tokens.push({
          type: 'math-inline',
          latex: candidate.trim(),
          displayMode: false,
        });
      }
    } else if (htmlBoldUnderline1 !== undefined || htmlBoldUnderline2 !== undefined) {
      const inner = htmlBoldUnderline1 ?? htmlBoldUnderline2;
      tokens.push({
        type: 'bold-underline',
        children: allowNested ? tokenizeInline(inner, false) : [{ type: 'text', content: inner }],
      });
    } else if (htmlBold !== undefined) {
      tokens.push({
        type: 'bold',
        children: allowNested ? tokenizeInline(htmlBold, false) : [{ type: 'text', content: htmlBold }],
      });
    } else if (htmlUnderline !== undefined) {
      tokens.push({
        type: 'underline',
        children: allowNested
          ? tokenizeInline(htmlUnderline, false)
          : [{ type: 'text', content: htmlUnderline }],
      });
    } else if (htmlItalic !== undefined) {
      tokens.push({
        type: 'italic',
        children: allowNested ? tokenizeInline(htmlItalic, false) : [{ type: 'text', content: htmlItalic }],
      });
    } else if (htmlSub !== undefined) {
      tokens.push({ type: 'sub', content: htmlSub });
    } else if (htmlSup !== undefined) {
      tokens.push({ type: 'sup', content: htmlSup });
    } else if (mdBold !== undefined) {
      tokens.push({
        type: 'bold',
        children: allowNested ? tokenizeInline(mdBold, false) : [{ type: 'text', content: mdBold }],
      });
    } else if (urlMatch !== undefined) {
      tokens.push({ type: 'url', rawToken: urlMatch });
    } else if (slotBadge !== undefined) {
      tokens.push({ type: 'slot-badge', slotNumber: slotBadge });
    } else {
      tokens.push({ type: 'text', content: fullMatch });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push({
      type: 'text',
      content: line.slice(lastIndex),
    });
  }

  return tokens;
}
