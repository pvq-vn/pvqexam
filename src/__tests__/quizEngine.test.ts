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
  extractExamStats,
  loadExamFile,
} from '../data/dataLoader';
import {
  sampleAndPrepareQuestions,
  filterQuestionsByChapter,
} from '../engine/sampler';
import { questionStatsService } from '../services/questionStatsService';
import { getPermittedQuestions } from '../engine/permissionSampler';
import { QuizConfig, Question, QuestionEvaluation } from '../types/quiz';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export interface TestSuiteSummary {
  passed: number;
  assertions: number;
}

export async function runUnitTests(): Promise<TestSuiteSummary> {
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

    // Dropdown Format B: options is array of slot objects with choices (e.g. IT3120)
    const qDropdownChoices = normalizeQuestion(
      {
        id: 1021,
        type: 'dropdown',
        text: 'Chọn mô tả đúng:',
        options: [
          { label: 'Khách hàng:', choices: ['Private', 'Public', 'Protected'] },
          { label: 'Mã số:', choices: ['Private', 'Public', 'Protected'] }
        ],
        correctAnswers: ['Public', 'Private']
      },
      2
    );
    check(qDropdownChoices.type === 'dropdown', 'Preserves type dropdown for Format B with choices');
    check(qDropdownChoices.dropdownSlots?.length === 2, 'Builds 2 dropdown slots for Format B');
    check(qDropdownChoices.dropdownSlots?.[0].label === 'Khách hàng:', 'Preserves slot label in Format B');
    check(evaluateQuestion(qDropdownChoices, ['Public', 'Private']).isCorrect, 'Grades Format B dropdown with exact texts as correct');
    check(evaluateQuestion(qDropdownChoices, ['b', 'a']).isCorrect, 'Grades Format B dropdown with option IDs ["b", "a"] as correct');

    // Dropdown Format C: raw options is empty, extracted from table rows (e.g. IT3080 Q797)
    const qDropdownTable = normalizeQuestion(
      {
        id: 1022,
        type: 'dropdown',
        text: 'Phân loại switch và router:',
        options: [],
        table: {
          headers: ['Đặc điểm', 'Chọn 1 trong 2'],
          rows: [
            ['Chuyển dữ liệu trong cùng mạng', 'Switch/ Router'],
            ['Chuyển dữ liệu qua mạng khác', 'Switch/ Router']
          ]
        },
        correctAnswers: ['Switch', 'Router']
      },
      3
    );
    check(qDropdownTable.type === 'dropdown', 'Never demotes Format C table dropdown to essay');
    check(qDropdownTable.dropdownSlots?.length === 2, 'Extracts 2 dropdown slots from table rows');
    check(evaluateQuestion(qDropdownTable, ['Switch', 'Router']).isCorrect, 'Grades Format C dropdown as correct');

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

  // 6. Chapter Extraction, Stats Aggregation & Chapter Filtering Tests
  {
    const rawBank = [
      {
        id: 1,
        chapter: 1,
        chapter_name: 'Tổng quan',
        text: 'Câu 1',
        options: ['A', 'B'],
        correctAnswers: ['A'],
      },
      {
        id: 2,
        chapter: 1,
        chapter_name: 'Tổng quan',
        text: 'Câu 2',
        options: ['A', 'B'],
        correctAnswers: ['B'],
      },
      {
        id: 3,
        chapter: 2,
        chapter_name: 'Kiến trúc',
        text: 'Câu 3',
        options: ['A', 'B'],
        correctAnswers: ['A'],
      },
      {
        id: 4,
        chapter: 2,
        chapter_name: 'Kiến trúc',
        type: 'essay',
        text: 'Câu 4 tự luận',
      },
    ];

    const questions = normalizeExam(rawBank);
    check(questions[0].chapter === 1 && questions[0].chapter_name === 'Tổng quan', 'Preserves chapter and chapter_name');
    check(questions[2].chapter === 2 && questions[2].chapter_name === 'Kiến trúc', 'Preserves chapter 2');

    const stats = extractExamStats(questions);
    check(Boolean(stats.chapters && stats.chapters.length === 2), 'Aggregates exactly 2 chapters');
    check(stats.chapters![0].count === 2 && stats.chapters![0].mcqCount === 2, 'Chapter 1 has 2 MCQs');
    check(stats.chapters![1].count === 2 && stats.chapters![1].mcqCount === 1 && stats.chapters![1].essayCount === 1, 'Chapter 2 has 1 MCQ and 1 essay');

    const ch1Questions = filterQuestionsByChapter(questions, '1');
    check(ch1Questions.length === 2 && ch1Questions.every((q) => q.chapter === 1), 'Filters questions by chapter id');

    const ch2Questions = filterQuestionsByChapter(questions, 'Kiến trúc');
    check(ch2Questions.length === 2 && ch2Questions.every((q) => q.chapter === 2), 'Filters questions by chapter name');
    passed++;
  }

  // 7. Question Attempt Prioritization (Spaced Repetition) Sampling Tests
  {
    const testQuestions = [
      { id: 'q1', type: 'single' as const, text: 'Q1', options: [{ id: 'a', text: 'A' }], correctAnswers: ['a'] },
      { id: 'q2', type: 'single' as const, text: 'Q2', options: [{ id: 'a', text: 'A' }], correctAnswers: ['a'] },
      { id: 'q3', type: 'single' as const, text: 'Q3', options: [{ id: 'a', text: 'A' }], correctAnswers: ['a'] },
      { id: 'q4', type: 'single' as const, text: 'Q4', options: [{ id: 'a', text: 'A' }], correctAnswers: ['a'] },
    ];

    // Mock attempt counts: q1 done 3 times, q2 done 0 times, q3 done 1 time, q4 done 0 times
    const attemptCounts = {
      q1: 3,
      q2: 0,
      q3: 1,
      q4: 0,
    };

    const config: QuizConfig = {
      subjectId: 'IT-TEST',
      examFilePath: '/test/exam.json',
      mcqCount: 2,
      essayCount: 0,
      shuffleQuestions: false,
      shuffleOptions: false,
      timeMode: 'auto',
      seed: 'SEED123',
      prioritizeLeastAttempted: true,
    };

    // Selecting 2 questions out of 4:
    // q2 and q4 have 0 attempts, q3 has 1 attempt, q1 has 3 attempts.
    // The 2 questions chosen MUST be q2 and q4!
    const sampled = sampleAndPrepareQuestions(testQuestions, config, attemptCounts);
    check(sampled.length === 2, 'Samples requested 2 questions');
    const sampledIds = new Set(sampled.map((q) => String(q.id)));
    check(sampledIds.has('q2') && sampledIds.has('q4'), 'Strictly prioritizes questions with 0 attempts over 1 or 3 attempts');

    // If requesting 3 questions: must include q2, q4 (tier 0) and q3 (tier 1), but NOT q1 (tier 3)
    const config3 = { ...config, mcqCount: 3 };
    const sampled3 = sampleAndPrepareQuestions(testQuestions, config3, attemptCounts);
    const sampled3Ids = new Set(sampled3.map((q) => String(q.id)));
    check(sampled3Ids.has('q2') && sampled3Ids.has('q4') && sampled3Ids.has('q3') && !sampled3Ids.has('q1'), 'Samples tier 0 then tier 1 before tier 3');

    // Test questionStatsService progress calculation
    const progress = questionStatsService.getSubjectProgress('test-user', 'IT-TEST', testQuestions);
    check(progress.totalQuestions === 4, 'Reports 4 total questions');
    passed++;
  }

  // 8. Test loadExamFile loading from disk in Node / fallback
  {
    const questions = await loadExamFile('/2025.2/IT3080 - Mạng máy tính/Gemini/OldExam.json');
    check(Array.isArray(questions) && questions.length > 0, 'loadExamFile loads questions from exam path');
    check(questions[0].id !== undefined, 'Questions have defined ids');
    passed++;
  }

  // 9. Permission Tiers (25%, 50%, 75%, 100%) Deterministic Nesting Tests (Section 4 & 15.1)
  {
    // Create synthetic bank across 4 chapters with 20 questions each (80 questions total)
    const bank: Question[] = [];
    for (let ch = 1; ch <= 4; ch++) {
      for (let i = 1; i <= 20; i++) {
        bank.push({
          id: `ch${ch}_q${i}`,
          chapter: ch,
          chapter_name: `Chương ${ch}`,
          type: 'single',
          text: `Câu hỏi ${i} thuộc chương ${ch}`,
          options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
          correctAnswers: ['a'],
        });
      }
    }

    const t25 = getPermittedQuestions(bank, 25, 'IT-TEST');
    const t50 = getPermittedQuestions(bank, 50, 'IT-TEST');
    const t75 = getPermittedQuestions(bank, 75, 'IT-TEST');
    const t100 = getPermittedQuestions(bank, 100, 'IT-TEST');

    check(t25.length === 20, 'Tier 25% has 20 questions out of 80 (25%)');
    check(t50.length === 40, 'Tier 50% has 40 questions out of 80 (50%)');
    check(t75.length === 60, 'Tier 75% has 60 questions out of 80 (75%)');
    check(t100.length === 80, 'Tier 100% has all 80 questions (100%)');

    const s25 = new Set(t25.map((q) => q.id));
    const s50 = new Set(t50.map((q) => q.id));
    const s75 = new Set(t75.map((q) => q.id));
    const s100 = new Set(t100.map((q) => q.id));

    // Invariant: 25% ⊆ 50% ⊆ 75% ⊆ 100%
    const is25SubsetOf50 = [...s25].every((id) => s50.has(id));
    const is50SubsetOf75 = [...s50].every((id) => s75.has(id));
    const is75SubsetOf100 = [...s75].every((id) => s100.has(id));

    check(is25SubsetOf50, 'Strict subset nesting: 25% is a strict subset of 50%');
    check(is50SubsetOf75, 'Strict subset nesting: 50% is a strict subset of 75%');
    check(is75SubsetOf100, 'Strict subset nesting: 75% is a strict subset of 100%');

    // Chapter balance in 25%: exactly 5 questions per chapter
    for (let ch = 1; ch <= 4; ch++) {
      const chCount = t25.filter((q) => q.chapter === ch).length;
      check(chCount === 5, `Chapter ${ch} has exactly 5 questions in 25% tier`);
    }

    // Determinism test: independent run produces identical question IDs
    const t25Repeat = getPermittedQuestions(bank, 25, 'IT-TEST');
    const repeatMatches = t25.every((q, idx) => q.id === t25Repeat[idx].id);
    check(repeatMatches, 'Deterministic: repeated runs return identical questions for same tier');
    passed++;
  }

  // 10. Question Statistics Rule Tests (Section 12: Only Correct increases attempt_count)
  {
    const userId = `local-test-user-${Date.now()}`;
    const subjectId = 'IT3080';
    const testQs: Question[] = [
      { id: 'q_stat_1', type: 'single', text: 'Q1', options: [{ id: 'a', text: 'A' }], correctAnswers: ['a'] },
      { id: 'q_stat_2', type: 'single', text: 'Q2', options: [{ id: 'a', text: 'A' }], correctAnswers: ['a'] },
      { id: 'q_stat_3', type: 'single', text: 'Q3', options: [{ id: 'a', text: 'A' }], correctAnswers: ['a'] },
    ];

    const answers = {
      q_stat_1: 'a', // Correct
      q_stat_2: 'b', // Wrong
      q_stat_3: '',  // Blank
    };

    const evals: Record<string, QuestionEvaluation> = {
      q_stat_1: { isCorrect: true, isUnanswered: false, earnedPoints: 1, maxPoints: 1, userAnswer: 'a', correctAnswers: ['a'] },
      q_stat_2: { isCorrect: false, isUnanswered: false, earnedPoints: 0, maxPoints: 1, userAnswer: 'b', correctAnswers: ['a'] },
      q_stat_3: { isCorrect: false, isUnanswered: true, earnedPoints: 0, maxPoints: 1, userAnswer: '', correctAnswers: ['a'] },
    };

    const attemptId = `attempt_test_${Date.now()}`;
    await questionStatsService.recordQuizAttempts(userId, subjectId, testQs, answers, evals, attemptId);

    const statsAfter = questionStatsService.getSubjectQuestionStats(userId, subjectId);

    // Q1 (Correct): attempt_count = 1, correct_count = 1, wrong_count = 0
    check(statsAfter['q_stat_1']?.attempts === 1, 'Correct answer increments attempt_count');
    check(statsAfter['q_stat_1']?.correctCount === 1, 'Correct answer increments correct_count');
    check(statsAfter['q_stat_1']?.wrongCount === 0, 'Correct answer has wrong_count = 0');

    // Q2 (Wrong): attempt_count = 0 (NOT INCREMENTED), wrong_count = 1
    check(!statsAfter['q_stat_2']?.attempts, 'Wrong answer DOES NOT increment attempt_count');
    check(statsAfter['q_stat_2']?.wrongCount === 1, 'Wrong answer increments wrong_count');
    check(!statsAfter['q_stat_2']?.correctCount, 'Wrong answer has correct_count = 0');

    // Q3 (Blank): attempt_count = 0, wrong_count = 0
    check(!statsAfter['q_stat_3']?.attempts, 'Blank question DOES NOT increment attempt_count');

    // Idempotency: submitting same attemptId again must not increment counters
    await questionStatsService.recordQuizAttempts(userId, subjectId, testQs, answers, evals, attemptId);
    const statsAfterRetry = questionStatsService.getSubjectQuestionStats(userId, subjectId);
    check(statsAfterRetry['q_stat_1']?.attempts === 1, 'Idempotent: retry with same attemptId does not double-increment');

    passed++;
  }

  // 11. Multi-Chapter Filter Tests (Section 3.2)
  {
    const questions: Question[] = [
      { id: 'c1_1', chapter: 1, chapter_name: 'Chương 1', type: 'single', text: 'Q1', options: [], correctAnswers: [] },
      { id: 'c2_1', chapter: 2, chapter_name: 'Chương 2', type: 'single', text: 'Q2', options: [], correctAnswers: [] },
      { id: 'c3_1', chapter: 3, chapter_name: 'Chương 3', type: 'single', text: 'Q3', options: [], correctAnswers: [] },
    ];

    // Filter by multiple chapters: ['1', 'Chương 3']
    const multiFiltered = filterQuestionsByChapter(questions, ['1', 'Chương 3']);
    check(multiFiltered.length === 2, 'Filters questions belonging to multiple selected chapters');
    const multiIds = new Set(multiFiltered.map((q) => q.id));
    check(multiIds.has('c1_1') && multiIds.has('c3_1') && !multiIds.has('c2_1'), 'Includes chapter 1 and 3, excludes chapter 2');
    passed++;
  }

  // 12. Seed Determinism & Reproducibility Tests (Section 6 & 15.1)
  {
    const bank: Question[] = [];
    for (let i = 1; i <= 30; i++) {
      bank.push({
        id: `q_seed_${i}`,
        type: 'single',
        text: `Question ${i}`,
        options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
        correctAnswers: ['a'],
      });
    }

    const cfgA: QuizConfig = {
      subjectId: 'IT3080',
      examFilePath: '/test/exam.json',
      mcqCount: 10,
      essayCount: 0,
      shuffleQuestions: true,
      shuffleOptions: false,
      timeMode: 'auto',
      seed: 'SHARED_SEED_99',
    };

    const cfgB: QuizConfig = {
      ...cfgA,
      timeMode: 'custom',
      customMinutes: 90, // Changed time only (Section 6.4)
    };

    const runA = sampleAndPrepareQuestions(bank, cfgA);
    const runB = sampleAndPrepareQuestions(bank, cfgB);

    check(runA.length === 10, 'Run A samples 10 questions');
    check(runB.length === 10, 'Run B samples 10 questions');

    const exactMatch = runA.every((q, idx) => q.id === runB[idx].id);
    check(exactMatch, 'Same seed produces identical question list even when time mode is changed');
    passed++;
  }

  return { passed, assertions };
}
