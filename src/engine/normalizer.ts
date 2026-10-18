import { Question, QuestionType, Option } from '../types/quiz';
import { extractDriveFileId } from '../utils/driveImage';
import { normalizeTableField } from '../utils/tableParser';

/**
 * Normalizes raw question objects from any exam JSON in the repository
 * into the unified internal Question schema (strictly in-memory, read-only).
 */
export function normalizeQuestion(raw: any, index: number): Question {
  const id = raw.id !== undefined && raw.id !== null ? raw.id : index + 1;
  const rawText = String(raw.text || raw.question || raw['Nội dung'] || '');

  // Extract raw type (supporting typo 'typr' found in some banks)
  const rawType = (raw.type || raw.typr || '').toString().toLowerCase().trim();

  // Normalize options first to help determine type if missing
  let normalizedOptions: Option[] = [];
  if (Array.isArray(raw.options)) {
    normalizedOptions = raw.options.map((opt: any, optIdx: number) => {
      const letterId = String.fromCharCode(97 + optIdx); // 'a', 'b', 'c', ...
      if (typeof opt === 'string') {
        return { id: letterId, text: opt };
      } else if (typeof opt === 'object' && opt !== null) {
        return {
          id: (opt.id || letterId).toString().toLowerCase(),
          text: String(opt.text || opt.content || opt.label || ''),
        };
      }
      return { id: letterId, text: String(opt) };
    });
  }

  // Extract raw correct answers (preserve raw array items before stringifying to detect numeric 0-based indices)
  let rawAnswers: any = raw.correctAnswers;
  if (rawAnswers === undefined) rawAnswers = raw.correctAnswer;
  if (rawAnswers === undefined) rawAnswers = raw.correct;

  const rawAnswerItems: any[] = (
    Array.isArray(rawAnswers)
      ? rawAnswers
      : rawAnswers !== undefined && rawAnswers !== null
      ? [rawAnswers]
      : []
  ).filter((a: any) => a !== undefined && a !== null && String(a).trim() !== '');

  let normalizedAnswers: string[] = rawAnswerItems.map((a: any) =>
    String(a).trim()
  );

  // Determine question type
  let type: QuestionType = 'single';
  if (rawType === 'radio' || rawType === 'single') {
    type = 'single';
  } else if (
    rawType === 'checkbox' ||
    rawType === 'multiple' ||
    rawType === 'multiple_choice'
  ) {
    type = 'multiple';
  } else if (rawType === 'essay') {
    type = 'essay';
  } else if (rawType === 'dropdown') {
    type = 'dropdown';
  } else if (rawType === 'fill' || rawType === 'text') {
    type = 'fill';
  } else {
    // Type is missing or unusual - infer from structure
    if (normalizedOptions.length > 0) {
      if (normalizedAnswers.length > 1) {
        type = 'multiple';
      } else {
        type = 'single';
      }
    } else if (rawText.includes('[1]') && rawText.includes('[2]')) {
      type = 'dropdown';
    } else if (
      normalizedAnswers.length > 0 &&
      normalizedAnswers[0].length < 30
    ) {
      type = 'fill';
    } else {
      type = 'essay';
    }
  }

  // Guard: if a question is marked 'single', 'multiple', or 'dropdown' but has 0 options in the source JSON
  if (
    (type === 'single' || type === 'multiple' || type === 'dropdown') &&
    normalizedOptions.length === 0
  ) {
    if (normalizedAnswers.length === 1 && normalizedAnswers[0].length < 40) {
      type = 'fill';
    } else {
      type = 'essay';
    }
  }

  // Map answer items to option IDs for single/multiple choice questions
  if (
    (type === 'single' || type === 'multiple') &&
    normalizedOptions.length > 0
  ) {
    normalizedAnswers = rawAnswerItems.map((rawItem) => {
      // 1. If the raw JSON value is a number (0-based index e.g. 0, 1, 2, 3 in IT3080), map directly to option at that index
      if (
        typeof rawItem === 'number' &&
        Number.isInteger(rawItem) &&
        rawItem >= 0 &&
        rawItem < normalizedOptions.length
      ) {
        return normalizedOptions[rawItem].id;
      }

      const ans = String(rawItem).trim();
      const lowerAns = ans.toLowerCase();

      // 2. Direct match on option id ('a', 'b', etc.)
      const directMatch = normalizedOptions.find((o) => o.id === lowerAns);
      if (directMatch) return directMatch.id;

      // 3. Exact match on option text
      const textMatch = normalizedOptions.find(
        (o) => o.text.trim().toLowerCase() === lowerAns
      );
      if (textMatch) return textMatch.id;

      // 4. Match ignoring trailing punctuation differences (e.g. '?' or '.')
      const stripPunct = (s: string) =>
        s
          .trim()
          .replace(/[?.!,;:]+$/, '')
          .trim()
          .toLowerCase();
      const strippedTarget = stripPunct(ans);
      if (strippedTarget) {
        const punctMatch = normalizedOptions.find(
          (o) => stripPunct(o.text) === strippedTarget
        );
        if (punctMatch) return punctMatch.id;
      }

      // 5. Match letter prefix e.g. "A) ..." or "A. ..."
      const prefixMatch = ans.match(/^([a-h])[).:\-]\s*/i);
      if (prefixMatch) {
        const letter = prefixMatch[1].toLowerCase();
        const byLetter = normalizedOptions.find((o) => o.id === letter);
        if (byLetter) return byLetter.id;
      }

      // 6. String numeric index fallback ("0", "1", "2", ...)
      if (/^\d+$/.test(ans)) {
        const idx = Number(ans);
        if (idx >= 0 && idx < normalizedOptions.length) {
          return normalizedOptions[idx].id;
        }
      }

      return ans;
    });
  }

  // Extract explanation, scope, suggestions
  const explanation = String(raw.explanation || raw['Giải thích'] || '');
  const scope = String(
    raw.scope || raw.category || raw.topic || raw.slideRef || raw.chapter || ''
  );
  const suggestion =
    raw.suggestion || (scope ? `Ôn tập phần: ${scope}` : undefined);

  // Extract code (including codeSnippet), structured/markdown tables, and links
  const code = String(raw.code || raw.codeSnippet || '');
  const table = normalizeTableField(raw);
  const link = String(
    raw.link || raw.Link || raw.imageUrl || raw.driveImageId || ''
  );
  const driveImageId = raw.driveImageId || extractDriveFileId(link);

  return {
    id,
    type,
    text: rawText,
    code: code.trim() ? code.trim() : undefined,
    table,
    link: link.trim() ? link.trim() : undefined,
    options: normalizedOptions.length > 0 ? normalizedOptions : undefined,
    correctAnswers: normalizedAnswers,
    explanation: explanation.trim() ? explanation.trim() : undefined,
    suggestion:
      typeof suggestion === 'string' && suggestion.trim()
        ? suggestion.trim()
        : undefined,
    scope: scope.trim() ? scope.trim() : undefined,
    points: typeof raw.points === 'number' ? raw.points : 1,
    originalNum: raw.originalNum,
    topic: raw.topic || raw.category || raw.chapter,
    driveImageId: driveImageId || undefined,
    imageUrl: raw.imageUrl ? String(raw.imageUrl).trim() : undefined,
  };
}

export function normalizeExam(rawList: any[]): Question[] {
  if (!Array.isArray(rawList)) return [];
  return rawList.map((item, idx) => normalizeQuestion(item, idx));
}
