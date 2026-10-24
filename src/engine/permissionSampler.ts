import { Question, SubjectPermissionTier } from '../types/quiz';

/**
 * 32-bit FNV-1a deterministic string hashing function.
 * Ensures consistent pseudo-random rankings across all JavaScript engines and runtimes.
 */
function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Generates a stable unique deduplication key for a question.
 */
export function getQuestionDeduplicationKey(q: Question): string {
  const filePrefix = q.sourceFile ? q.sourceFile.trim().toLowerCase() : '';
  const numOrId = q.originalNum !== undefined ? String(q.originalNum) : String(q.id);
  const textSample = String(q.text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 100);
  return `${filePrefix}:::${numOrId}:::${textSample}:::${q.type}`;
}

/**
 * Deduplicates questions from multiple sources.
 */
export function deduplicateQuestions(questions: Question[]): Question[] {
  const seen = new Set<string>();
  const result: Question[] = [];
  for (const q of questions) {
    const key = getQuestionDeduplicationKey(q);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(q);
    }
  }
  return result;
}

/**
 * Selects a deterministic subset of questions according to granted permission tier (25%, 50%, 75%, 100%).
 * 
 * Guarantees:
 * 1. Proportional, balanced distribution across chapters / topics.
 * 2. Deterministic: same subject, same question bank, same tier yields EXACT same questions for all accounts.
 * 3. Strict subset nesting: Subset(25%) ⊆ Subset(50%) ⊆ Subset(75%) ⊆ Subset(100%).
 * 4. Deduplicates questions before allocation.
 * 5. Handles small chapters without question loss or exceeding maximum available.
 * 6. Handles missing chapter information via fallback group.
 */
export function getPermittedQuestions(
  allQuestions: Question[],
  permissionTier: SubjectPermissionTier = 25,
  subjectId = ''
): Question[] {
  const cleanTier = [25, 50, 75, 100].includes(permissionTier)
    ? permissionTier
    : 25;

  // Deduplicate pool
  const deduped = deduplicateQuestions(allQuestions);
  if (cleanTier === 100) {
    return deduped;
  }

  // Group by chapter
  const chapterGroups = new Map<string, Question[]>();
  for (const q of deduped) {
    let groupKey = '__default__';
    if (q.chapter !== undefined && String(q.chapter).trim() !== '') {
      groupKey = `ch_${String(q.chapter).trim().toLowerCase()}`;
    } else if (q.chapter_name && q.chapter_name.trim() !== '') {
      groupKey = `name_${q.chapter_name.trim().toLowerCase()}`;
    }
    if (!chapterGroups.has(groupKey)) {
      chapterGroups.set(groupKey, []);
    }
    chapterGroups.get(groupKey)!.push(q);
  }

  const sortedGroupKeys = Array.from(chapterGroups.keys()).sort();
  const ratio = cleanTier / 100;
  const permittedIds = new Set<string | number>();

  for (const groupKey of sortedGroupKeys) {
    const chapterQuestions = chapterGroups.get(groupKey)!;
    const totalInChapter = chapterQuestions.length;
    if (totalInChapter === 0) continue;

    // Stable deterministic sorting within chapter based on FNV-1a hash
    const rankedQuestions = [...chapterQuestions].sort((a, b) => {
      const aHash = fnv1aHash(
        `perm_seed:${subjectId}:${groupKey}:${a.id}:${a.originalNum ?? ''}:${a.text.slice(0, 50)}`
      );
      const bHash = fnv1aHash(
        `perm_seed:${subjectId}:${groupKey}:${b.id}:${b.originalNum ?? ''}:${b.text.slice(0, 50)}`
      );
      if (aHash !== bHash) {
        return aHash - bHash;
      }
      return String(a.id).localeCompare(String(b.id));
    });

    // Proportional count with stable deterministic rounding
    const targetCount = Math.max(1, Math.min(totalInChapter, Math.ceil(totalInChapter * ratio)));
    for (let i = 0; i < targetCount; i++) {
      permittedIds.add(rankedQuestions[i].id);
    }
  }

  // Preserve the relative original deduplicated ordering
  return deduped.filter((q) => permittedIds.has(q.id));
}
