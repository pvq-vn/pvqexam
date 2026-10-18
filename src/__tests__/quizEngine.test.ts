import {
  sanitizeUrlToken,
  extractDriveFileId,
  buildDriveImageCandidates,
  resolveImageSource,
} from '../utils/driveImage';
import { normalizeTableField, parseTableData } from '../utils/tableParser';
import {
  tokenizeBlocks,
  tokenizeInline,
  renderLatexToHtml,
} from '../utils/mathParser';
import { normalizeQuestion, normalizeExam } from '../engine/normalizer';
import {
  evaluateQuestion,
  calculateQuizResult,
  areOptionValuesEquivalent,
} from '../engine/scoring';
import {
  canonicalizeExamPath,
  sanitizeExamJsonText,
  invalidateExamCache,
  onExamCacheUpdated,
} from '../data/dataLoader';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export interface TestSuiteSummary {
  passed: number;
  assertions: number;
}

export function runUnitTests(): TestSuiteSummary {
  let passed = 0;
  let assertions = 0;

  const check = (cond: boolean, msg: string) => {
    assertions++;
    assert(cond, msg);
  };

  // 1. LaTeX, Markdown, Code & Table Block/Inline Tokenizer Tests
  {
    const sample = [
      'Cho công thức inline $T_e = \\frac{O + 4M + P}{6}$ và ký hiệu \\(O(n \\log n)\\).',
      '$$\\sum_{i=1}^{n} x_i = S$$',
      '```cpp',
      'int main() { return 0; }',
      '```',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
    ].join('\n');

    const blocks = tokenizeBlocks(sample);
    check(blocks.some((b) => b.type === 'math-block'), 'Detects display math block');
    check(blocks.some((b) => b.type === 'code' && b.language === 'cpp'), 'Detects fenced code block');
    check(blocks.some((b) => b.type === 'table'), 'Detects markdown pipe table block');

    const firstPara = blocks.find((b) => b.type === 'paragraph');
    check(Boolean(firstPara && firstPara.type === 'paragraph'), 'Detects paragraph block');
    if (firstPara && firstPara.type === 'paragraph') {
      const inlines = tokenizeInline(firstPara.lines[0]);
      const mathTokens = inlines.filter((t) => t.type === 'math-inline');
      check(mathTokens.length === 2, 'Extracts both $...$ and \\(...\\) inline math tokens');
      for (const m of mathTokens) {
        if (m.type === 'math-inline') {
          const rendered = renderLatexToHtml(m.latex, m.displayMode);
          check(!rendered.hasError && rendered.html.includes('katex'), 'Renders KaTeX HTML without error');
        }
      }
    }

    const formatted = tokenizeInline('Từ khóa <b><u>quan trọng</u></b> với chỉ số H<sub>2</sub>O và x<sup>2</sup> ở ô [1]');
    check(formatted.some((t) => t.type === 'bold-underline'), 'Parses nested <b><u> tag');
    check(formatted.some((t) => t.type === 'sub' && t.content === '2'), 'Parses <sub> tag');
    check(formatted.some((t) => t.type === 'sup' && t.content === '2'), 'Parses <sup> tag');
    check(formatted.some((t) => t.type === 'slot-badge' && t.slotNumber === '1'), 'Parses [1] dropdown slot badge');
    passed++;
  }

  // 2. Google Drive URL Sanitization & Candidate Resolution Tests
  {
    const noisyInline = "'https://drive.google.com/file/d/1f8bcI9zh8r60hG2a3nU2wPm3s9g5Fp_K/view?usp=sharing'.";
    const sanitized = sanitizeUrlToken(noisyInline);
    check(sanitized.leadingText === "'", 'Strips leading single quote from inline URL');
    check(sanitized.trailingText === "'.", 'Strips trailing quote and period from inline URL');
    const fileId = extractDriveFileId(noisyInline);
    check(fileId === '1f8bcI9zh8r60hG2a3nU2wPm3s9g5Fp_K', 'Extracts clean Google Drive file ID');

    const candidates = buildDriveImageCandidates(fileId!);
    check(candidates.length === 3, 'Generates 3 ordered direct image candidates for Drive ID');
    check(candidates[0].includes('drive.google.com/thumbnail?id=') && candidates[0].includes('sz=w1600'), 'Primary candidate is w1600 thumbnail endpoint');
    check(candidates[1].includes('lh3.googleusercontent.com/d/'), 'Secondary candidate is Google User Content CDN');
    check(candidates[2].includes('drive.google.com/uc?export=view'), 'Tertiary candidate is Drive uc view endpoint');

    const resolved = resolveImageSource(noisyInline);
    check(Boolean(resolved && resolved.driveFileId === fileId), 'Resolves Drive image descriptor');
    passed++;
  }

  // 3. Multi-Format Table Parser & Normalizer Tests
  {
    const objectTable = {
      headers: ['Tiến trình', 'Burst Time'],
      rows: [
        ['P1', '10'],
        ['P2', '5'],
      ],
    };
    const multiTable = {
      tableR: { header: ['A', 'B'], rows: [[1, 2]] },
      tableS: { header: ['B', 'C'], rows: [[2, 3]] },
    };
    const relationalDb = {
      R: [{ A: 1, B: 2 }, { A: 3, B: 4 }],
      S: [{ C: 5, D: 6 }],
    };
    const matrix2D = [
      ['0', '1/2'],
      ['1/2', '0'],
    ];

    for (const rawTable of [objectTable, multiTable, relationalDb, matrix2D]) {
      const norm = normalizeTableField({ table: rawTable });
      check(Boolean(norm && !norm.includes('[object Object]')), 'Normalizes structured table without [object Object]');
      const parsed = parseTableData(norm);
      check(parsed.length > 0 && parsed[0].rows.length > 0, 'Parses normalized table back into StructuredTable[]');
    }
    passed++;
  }

  // 4. Schema Normalizer & Scoring Engine Tests (including 0-based numeric indices and operator fill answers)
  {
    // 0-based numeric correctAnswers (as in IT3080)
    const qNumeric = normalizeQuestion(
      {
        id: 101,
        type: 'single',
        text: 'Chọn giao thức tầng giao vận:',
        options: ['IP', 'TCP', 'HTTP', 'ARP'],
        correctAnswers: [1],
      },
      0
    );
    check(qNumeric.correctAnswers[0] === 'b', 'Maps 0-based numeric answer 1 to option ID "b"');
    check(evaluateQuestion(qNumeric, 'b').isCorrect, 'Scores selected option "b" as correct');

    // Dropdown with numeric index vs letter ID equivalence
    const qDropdown = normalizeQuestion(
      {
        id: 102,
        type: 'dropdown',
        text: 'Điền vào [1] và [2]:',
        options: ['O(1)', 'O(n)', 'O(n^2)'],
        correctAnswers: [0, 2],
      },
      1
    );
    check(areOptionValuesEquivalent(qDropdown.options, 'a', '0'), 'Option ID "a" and index "0" are equivalent');
    check(evaluateQuestion(qDropdown, ['a', 'c']).isCorrect, 'Grades dropdown with option IDs ["a", "c"] as correct');
    check(evaluateQuestion(qDropdown, ['0', '2']).isCorrect, 'Grades dropdown with numeric indices ["0", "2"] as correct');

    // Fill-in-the-blank with C++ operators (>>, &) and Vietnamese diacritics
    const qFillOp = normalizeQuestion(
      {
        id: 103,
        type: 'fill',
        text: 'Toán tử trích luồng trong C++:',
        options: [],
        correctAnswers: ['>>'],
      },
      2
    );
    check(evaluateQuestion(qFillOp, '>>').isCorrect, 'Grades C++ operator ">>" as correct in fill question');
    check(!evaluateQuestion(qFillOp, '<<').isCorrect, 'Grades wrong C++ operator "<<" as false in fill question');

    const qFillAmp = normalizeQuestion(
      {
        id: 104,
        type: 'fill',
        text: 'Toán tử lấy địa chỉ:',
        correctAnswers: ['&'],
      },
      3
    );
    check(evaluateQuestion(qFillAmp, '&').isCorrect, 'Grades C++ operator "&" as correct in fill question');

    // Optionless single question with empty answer -> downgraded to essay so it does not penalize score
    const qTruncated = normalizeQuestion(
      {
        id: 105,
        type: 'single',
        text: 'Câu hỏi bị thiếu options trong đề gốc',
        options: [],
        correctAnswer: '',
      },
      4
    );
    check(qTruncated.type === 'essay', 'Downgrades optionless single question with empty answer to essay');

    const quizRes = calculateQuizResult([qNumeric, qFillOp, qTruncated], { 101: 'b', 103: '>>' }, 45);
    check(quizRes.score10 === 10 && quizRes.correctCount === 2 && quizRes.essayCount === 1, 'Excludes essay from auto-graded denominator and computes 10/10 score');
    passed++;
  }

  // 5. Lenient In-Memory JSON Sanitizer & Cache Invalidation Tests
  {
    const malformedJson = `[\n  {\n    "id": 40 - Xem lại,\n    "type": "single",\n    "text": "Test",\n    "options": ["A", "B",],\n    "correctAnswers": ["A",]\n  },\n]`;
    const repaired = sanitizeExamJsonText(malformedJson);
    const parsed = JSON.parse(repaired);
    const normalized = normalizeExam(parsed);
    check(normalized.length === 1 && normalized[0].id === '40 - Xem lại', 'Repairs unquoted ID note and trailing commas in memory without mutating disk');

    check(
      canonicalizeExamPath('2026.1\\IT4931 - Lưu trữ\\Gemini\\exam.json') ===
        '/2026.1/IT4931 - Lưu trữ/Gemini/exam.json',
      'Canonicalizes Windows backslashes and NFC Unicode paths'
    );

    let notifiedPath: string | undefined;
    const unsub = onExamCacheUpdated((p) => {
      notifiedPath = p;
    });
    invalidateExamCache('/2026.1/test/exam.json');
    unsub();
    check(notifiedPath === '/2026.1/test/exam.json', 'Notifies subscribers when exam cache is invalidated');
    passed++;
  }

  return { passed, assertions };
}
