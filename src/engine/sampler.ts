import { Question, QuizConfig } from '../types/quiz';
import { createRNG, fisherYatesShuffle } from './shuffle';

/**
 * Checks if a question belongs to a specific chapter/topic target string.
 */
function isQuestionInChapter(q: Question, target: string): boolean {
  const norm = target.trim().toLowerCase();
  if (norm === 'all' || norm === '') return true;

  const qChapterStr = q.chapter !== undefined ? String(q.chapter).trim().toLowerCase() : '';
  const qChapterName = q.chapter_name ? q.chapter_name.trim().toLowerCase() : '';
  const qTopic = q.topic ? q.topic.trim().toLowerCase() : '';

  if (qChapterStr === norm) return true;
  if (qChapterName === norm) return true;
  if (qTopic === norm) return true;
  if (`chương ${qChapterStr}` === norm) return true;

  // Check if target is composite id e.g. "1:::Tên chương"
  if (norm.includes(':::')) {
    const [chId, chName] = norm.split(':::');
    if (chId && qChapterStr === chId) return true;
    if (chName && qChapterName === chName) return true;
  }

  return false;
}

/**
 * Filter questions belonging to one or more specific chapters/topics.
 */
export function filterQuestionsByChapter(
  questions: Question[],
  selectedChapter?: string | string[],
  selectedChapters?: string[]
): Question[] {
  let targets: string[] = [];
  if (Array.isArray(selectedChapter)) {
    targets = selectedChapter;
  } else if (selectedChapters && selectedChapters.length > 0) {
    targets = selectedChapters;
  } else if (
    typeof selectedChapter === 'string' &&
    selectedChapter.trim() !== '' &&
    selectedChapter.trim() !== 'all'
  ) {
    targets = [selectedChapter.trim()];
  }

  if (targets.length === 0 || targets.includes('all')) {
    return questions;
  }

  const matched = questions.filter((q) =>
    targets.some((target) => isQuestionInChapter(q, target))
  );
  return matched.length > 0 ? matched : questions;
}

/**
 * Samples a target number of questions prioritizing questions that have been
 * attempted the fewest times (0 attempts first, then 1 attempt, then 2, etc.).
 * Within each attempt tier, questions are randomized using the seeded RNG.
 */
function samplePrioritized(
  questions: Question[],
  targetCount: number,
  rng: () => number,
  attemptCounts?: Record<string, number>,
  prioritizeLeastAttempted = true
): Question[] {
  if (questions.length <= targetCount) {
    return fisherYatesShuffle(questions, rng);
  }

  // If prioritization is disabled or no attempt counts provided, standard random shuffle
  if (!prioritizeLeastAttempted || !attemptCounts) {
    const shuffled = fisherYatesShuffle(questions, rng);
    return shuffled.slice(0, targetCount);
  }

  // 1. Group questions into buckets by attempt count
  const buckets = new Map<number, Question[]>();
  for (const q of questions) {
    const attempts = attemptCounts[String(q.id)] || 0;
    if (!buckets.has(attempts)) {
      buckets.set(attempts, []);
    }
    buckets.get(attempts)!.push(q);
  }

  // 2. Sort bucket attempt numbers ascending (0, 1, 2, ...)
  const sortedTiers = Array.from(buckets.keys()).sort((a, b) => a - b);

  // 3. Accumulate questions starting from lowest attempt tier
  const selected: Question[] = [];
  for (const tier of sortedTiers) {
    const tierQuestions = buckets.get(tier)!;
    // Randomize within this tier using deterministic seeded RNG
    const shuffledTier = fisherYatesShuffle(tierQuestions, rng);

    const needed = targetCount - selected.length;
    if (needed <= 0) break;

    if (shuffledTier.length <= needed) {
      selected.push(...shuffledTier);
    } else {
      selected.push(...shuffledTier.slice(0, needed));
    }
  }

  return selected;
}

export function sampleAndPrepareQuestions(
  allQuestions: Question[],
  config: QuizConfig,
  attemptCounts?: Record<string, number>
): Question[] {
  const rng = createRNG(config.seed);

  // 1. Filter by selected chapter / topic if requested
  const chapterPool = filterQuestionsByChapter(
    allQuestions,
    config.selectedChapter,
    config.selectedChapters
  );

  // 2. Separate MCQ (single, multiple, dropdown, fill) and Essay
  const mcqQuestions = chapterPool.filter((q) => q.type !== 'essay');
  const essayQuestions = chapterPool.filter((q) => q.type === 'essay');

  // 3. Sample MCQ and Essay prioritizing least attempted
  const shouldPrioritize = config.prioritizeLeastAttempted !== false;
  const actualMcqCount = Math.min(config.mcqCount, mcqQuestions.length);
  const actualEssayCount = Math.min(config.essayCount, essayQuestions.length);

  const selectedMcq = samplePrioritized(
    mcqQuestions,
    actualMcqCount,
    rng,
    attemptCounts,
    shouldPrioritize
  );
  const selectedEssay = samplePrioritized(
    essayQuestions,
    actualEssayCount,
    rng,
    attemptCounts,
    shouldPrioritize
  );

  // 4. Combine
  let combined = [...selectedMcq, ...selectedEssay];

  // 5. Shuffle combined questions if requested (so tiers are distributed naturally)
  if (config.shuffleQuestions) {
    combined = fisherYatesShuffle(combined, rng);
  }

  // 6. Shuffle options if requested (only for single/multiple with options)
  if (config.shuffleOptions) {
    combined = combined.map((q) => {
      if ((q.type === 'single' || q.type === 'multiple') && q.options && q.options.length > 1) {
        // Do not shuffle if options look like "Tất cả các đáp án trên" or ordered
        const hasOrderedOption = q.options.some((o) =>
          /tất cả|cả .* đều|không có đáp án/i.test(o.text)
        );
        if (!hasOrderedOption) {
          const shuffledOptions = fisherYatesShuffle(q.options, rng);
          return {
            ...q,
            options: shuffledOptions,
          };
        }
      }
      return q;
    });
  }

  return combined;
}
