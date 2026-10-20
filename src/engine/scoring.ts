import { Option, Question, QuestionEvaluation, QuizResult } from '../types/quiz';

/**
 * Normalizes text for fill-in-the-blank answer checking.
 */
function normalizeFillText(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeFillRelaxed(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[,\s]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s.\-]/gu, '')
    .trim();
}

/**
 * Resolves a dropdown or MCQ value ('a', '0', or option text) to its 0-based index
 * within `options`, or returns -1 if not found.
 */
export function resolveOptionIndex(
  options: Option[] | undefined,
  rawVal: string | number | undefined
): number {
  if (!options || options.length === 0 || rawVal === undefined || rawVal === null) {
    return -1;
  }
  const str = String(rawVal).trim();
  if (!str) return -1;
  const lower = str.toLowerCase();

  // 1. Direct option ID match ('a', 'b', ...)
  const byId = options.findIndex((o) => o.id.toLowerCase() === lower);
  if (byId !== -1) return byId;

  // 2. Numeric 0-based index match ('0', '1', ...)
  if (/^\d+$/.test(str)) {
    const idx = Number(str);
    if (idx >= 0 && idx < options.length) {
      return idx;
    }
  }

  // 3. Option text match
  const byText = options.findIndex((o) => o.text.trim().toLowerCase() === lower);
  if (byText !== -1) return byText;

  return -1;
}

/**
 * Checks whether two option identifiers/values refer to the same option.
 */
export function areOptionValuesEquivalent(
  options: Option[] | undefined,
  valA: string | number | undefined,
  valB: string | number | undefined
): boolean {
  if (valA === undefined || valB === undefined) return false;
  const strA = String(valA).trim().toLowerCase();
  const strB = String(valB).trim().toLowerCase();
  if (!strA || !strB) return false;
  if (strA === strB) return true;

  if (options && options.length > 0) {
    const idxA = resolveOptionIndex(options, strA);
    const idxB = resolveOptionIndex(options, strB);
    if (idxA !== -1 && idxA === idxB) return true;
  }

  return false;
}

/**
 * Evaluates a single question against the user's answer.
 */
export function evaluateQuestion(
  q: Question,
  userAnsRaw: string | string[] | undefined
): QuestionEvaluation {
  const points = q.points || 1;

  if (q.type === 'essay') {
    // Essay questions are NOT scored automatically
    return {
      isCorrect: false,
      isUnanswered:
        !userAnsRaw ||
        (typeof userAnsRaw === 'string' && userAnsRaw.trim() === ''),
      earnedPoints: 0,
      maxPoints: 0,
      userAnswer: userAnsRaw || '',
      correctAnswers: q.correctAnswers || [],
    };
  }

  // Check unanswered
  let isUnanswered = false;
  if (userAnsRaw === undefined || userAnsRaw === null) {
    isUnanswered = true;
  } else if (Array.isArray(userAnsRaw)) {
    isUnanswered =
      userAnsRaw.length === 0 ||
      userAnsRaw.every((item) => !item || String(item).trim() === '');
  } else if (typeof userAnsRaw === 'string') {
    isUnanswered = userAnsRaw.trim() === '';
  }

  if (isUnanswered) {
    return {
      isCorrect: false,
      isUnanswered: true,
      earnedPoints: 0,
      maxPoints: points,
      userAnswer: Array.isArray(userAnsRaw) ? [] : '',
      correctAnswers: q.correctAnswers,
    };
  }

  let isCorrect = false;

  switch (q.type) {
    case 'single': {
      const selected = Array.isArray(userAnsRaw) ? userAnsRaw[0] : userAnsRaw;
      const target = q.correctAnswers[0];
      if (selected && target) {
        isCorrect = areOptionValuesEquivalent(q.options, selected, target);
      }
      break;
    }

    case 'multiple': {
      const rawArr = Array.isArray(userAnsRaw)
        ? userAnsRaw
        : userAnsRaw !== undefined
        ? [userAnsRaw]
        : [];
      const userList = rawArr.map((a) => String(a).toLowerCase().trim()).filter(Boolean);
      const correctList = (q.correctAnswers || []).map((a) =>
        a.toLowerCase().trim()
      );

      const allCorrectSelected = correctList.every((corr) =>
        userList.some((u) => areOptionValuesEquivalent(q.options, u, corr))
      );
      const noWrongSelected = userList.every((u) =>
        correctList.some((corr) => areOptionValuesEquivalent(q.options, u, corr))
      );
      isCorrect =
        allCorrectSelected &&
        noWrongSelected &&
        userList.length === correctList.length;
      break;
    }

    case 'fill': {
      const rawUserStr = Array.isArray(userAnsRaw) ? userAnsRaw[0] : userAnsRaw || '';
      const userText = normalizeFillText(rawUserStr);
      const userRelaxed = normalizeFillRelaxed(rawUserStr);

      // Check against any valid answer in correctAnswers
      const candidates: string[] = [];
      q.correctAnswers.forEach((ans) => {
        candidates.push(ans);
        // Also support splitting by single '|' or ';' if author specified multiple choices (avoiding '||' operator)
        if (!ans.includes('||')) {
          ans.split(/[|;]/).forEach((sub) => {
            if (sub.trim()) candidates.push(sub);
          });
        }
      });

      isCorrect = candidates.some((cand) => {
        const normCand = normalizeFillText(cand);
        if (normCand && normCand === userText) return true;
        const relaxedCand = normalizeFillRelaxed(cand);
        if (relaxedCand && userRelaxed && relaxedCand === userRelaxed) return true;
        return false;
      });
      break;
    }

    case 'dropdown': {
      // User answer can be array of selected option IDs ('a', 'b') or indices ('0', '1') for [1], [2], ...
      const userAnswers = Array.isArray(userAnsRaw)
        ? userAnsRaw
        : userAnsRaw !== undefined
        ? [userAnsRaw]
        : [];
      const correctAnswers = q.correctAnswers || [];

      if (
        userAnswers.length === correctAnswers.length &&
        correctAnswers.length > 0
      ) {
        isCorrect = correctAnswers.every((corr, idx) => {
          const slotChoices = q.dropdownSlots?.[idx]?.choices || q.options;
          return areOptionValuesEquivalent(slotChoices, userAnswers[idx], corr);
        });
      }
      break;
    }
  }

  return {
    isCorrect,
    isUnanswered: false,
    earnedPoints: isCorrect ? points : 0,
    maxPoints: points,
    userAnswer: userAnsRaw !== undefined ? userAnsRaw : '',
    correctAnswers: q.correctAnswers,
  };
}

/**
 * Calculates overall quiz results for a list of questions and user answers.
 */
export function calculateQuizResult(
  questions: Question[],
  answers: Record<string | number, string | string[]>,
  timeSpentSeconds: number
): QuizResult {
  const evaluations: Record<string | number, QuestionEvaluation> = {};

  let totalPossibleScore = 0;
  let earnedScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  let essayCount = 0;
  let totalScoredQuestions = 0;

  questions.forEach((q) => {
    const userAns = answers[q.id];
    const evaluation = evaluateQuestion(q, userAns);
    evaluations[q.id] = evaluation;

    if (q.type === 'essay') {
      essayCount++;
    } else {
      totalScoredQuestions++;
      totalPossibleScore += evaluation.maxPoints;
      earnedScore += evaluation.earnedPoints;

      if (evaluation.isUnanswered) {
        unansweredCount++;
      } else if (evaluation.isCorrect) {
        correctCount++;
      } else {
        wrongCount++;
      }
    }
  });

  const rawScale =
    totalPossibleScore > 0 ? (earnedScore / totalPossibleScore) * 10 : 0;
  const score10 = Math.round(rawScale * 100) / 100;

  return {
    score10,
    totalPossibleScore,
    earnedScore,
    totalQuestions: questions.length,
    totalScoredQuestions,
    correctCount,
    wrongCount,
    unansweredCount,
    essayCount,
    timeSpentSeconds,
    evaluations,
  };
}
