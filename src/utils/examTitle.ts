import { ExamDefinition, QuizAttempt } from '../types/quiz';

/**
 * Checks whether an exam title is an auto-generated default placeholder
 * (e.g. "Đề thi IT3080 (ABC123)" or "Đề IT3080 (ABC123)").
 */
export function isGenericExamTitle(
  title: string | undefined,
  subjectCode: string,
  seed: string
): boolean {
  const trimmed = (title || '').trim();
  if (!trimmed) return true;
  const cleanCode = (subjectCode || '').trim();
  const cleanSeed = (seed || '').trim().toUpperCase();
  const normalized = trimmed.toLowerCase();
  return (
    normalized === `đề thi ${cleanCode} (${cleanSeed})`.toLowerCase() ||
    normalized === `đề ${cleanCode} (${cleanSeed})`.toLowerCase() ||
    normalized === `đề thi ${cleanCode}`.toLowerCase()
  );
}

/**
 * Resolves the display title of an exam given its subject code, seed,
 * optional config title, and optional ExamDefinition title.
 * Prefers a non-generic ExamDefinition title, then configTitle,
 * then examDefTitle, and falls back to a concise default title.
 */
export function resolveExamTitle(params: {
  subjectCode: string;
  seed?: string;
  configTitle?: string;
  examDefTitle?: string;
}): string {
  const cleanSeed = (params.seed || '').trim().toUpperCase();
  const defTitle = params.examDefTitle?.trim() || '';
  const configTitle = params.configTitle?.trim() || '';

  if (defTitle && !isGenericExamTitle(defTitle, params.subjectCode, cleanSeed)) {
    return defTitle;
  }
  if (configTitle) {
    return configTitle;
  }
  if (defTitle) {
    return defTitle;
  }
  return cleanSeed
    ? `Đề thi ${params.subjectCode} (${cleanSeed})`
    : `Đề thi ${params.subjectCode}`;
}

/**
 * Resolves the display title of a quiz attempt's exam, preferring a custom
 * ExamDefinition title (e.g., created/renamed by admin or shared exam),
 * then `attempt.config?.title`, and falling back to a concise default title.
 */
export function resolveAttemptExamTitle(
  attempt: QuizAttempt,
  examDefsBySeed?: Map<string, ExamDefinition>
): string {
  const cleanSeed = (attempt.seed || '').trim().toUpperCase();
  const def = cleanSeed && examDefsBySeed ? examDefsBySeed.get(cleanSeed) : undefined;
  return resolveExamTitle({
    subjectCode: attempt.subjectCode,
    seed: cleanSeed,
    configTitle: attempt.config?.title,
    examDefTitle: def?.title,
  });
}
