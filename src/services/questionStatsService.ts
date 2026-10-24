import { Question, QuestionEvaluation, QuestionStat, SubjectProgress, QuizAttempt } from '../types/quiz';
import { supabase, isSupabaseConfigured } from './supabase';

const LOCAL_QSTATS_PREFIX = 'hust_quiz_qstats_';

const memStorageMap = new Map<string, string>();
const storage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch {
      // ignore
    }
    return memStorageMap.get(key) || null;
  },
  setItem(key: string, val: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, val);
        return;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, val);
        return;
      }
    } catch {
      // ignore
    }
    memStorageMap.set(key, val);
  },
  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
        return;
      }
    } catch {
      // ignore
    }
    memStorageMap.delete(key);
  },
};

function getStorageKey(userId?: string): string {
  const safeId = userId && !userId.startsWith('local-') ? userId : 'local_guest';
  return `${LOCAL_QSTATS_PREFIX}${safeId}`;
}

const processedAttemptIds = new Set<string>();

export const questionStatsService = {
  /**
   * Retrieves stored question stats for a specific user and subject from localStorage.
   */
  getSubjectQuestionStats(
    userId: string | undefined,
    subjectId: string
  ): Record<string, QuestionStat> {
    try {
      const key = getStorageKey(userId);
      const raw = storage.getItem(key);
      if (!raw) return {};
      const allSubjectsStats = JSON.parse(raw);
      return allSubjectsStats[subjectId] || {};
    } catch (e) {
      console.warn('Failed reading question stats from localStorage:', e);
      return {};
    }
  },

  /**
   * Returns a lightweight mapping of questionId -> attemptCount for question sampling.
   */
  getQuestionAttempts(
    userId: string | undefined,
    subjectId: string
  ): Record<string, number> {
    const stats = questionStatsService.getSubjectQuestionStats(userId, subjectId);
    const result: Record<string, number> = {};
    for (const [qId, stat] of Object.entries(stats)) {
      result[qId] = stat.attempts || 0;
    }
    return result;
  },

  /**
   * Records a completed quiz attempt for all questions in the quiz,
   * updating their attempt count and correctness in localStorage and Supabase.
   * NOTE: As mandated in Section 12:
   * - attempt_count ONLY increases if the answer was correct.
   * - wrong answers keep attempt_count unchanged, and increase wrong_count.
   * - unanswered / empty answers keep attempt_count, correct_count, wrong_count unchanged.
   * - Idempotent across retries using attemptId.
   */
  async recordQuizAttempts(
    userId: string | undefined,
    subjectId: string,
    questions: Question[],
    _answers: Record<string | number, string | string[]>,
    evaluations: Record<string | number, QuestionEvaluation> = {},
    attemptId?: string
  ): Promise<void> {
    if (!questions || questions.length === 0) return;

    if (attemptId) {
      const dedupeKey = `${userId || 'guest'}:::${attemptId}`;
      if (processedAttemptIds.has(dedupeKey)) {
        return; // Idempotent: already processed this submission
      }
      processedAttemptIds.add(dedupeKey);
    }

    const storageKey = getStorageKey(userId);
    let allSubjectsData: Record<string, Record<string, QuestionStat>> = {};
    try {
      const raw = storage.getItem(storageKey);
      if (raw) {
        allSubjectsData = JSON.parse(raw);
      }
    } catch {
      allSubjectsData = {};
    }

    if (!allSubjectsData[subjectId]) {
      allSubjectsData[subjectId] = {};
    }

    const nowIso = new Date().toISOString();
    const updatedQuestionRows: Array<{
      user_id: string;
      subject_id: string;
      question_id: string;
      attempt_count: number;
      correct_count: number;
      wrong_count: number;
      last_attempted_at: string;
    }> = [];

    for (const q of questions) {
      const qIdStr = String(q.id);
      const prev = allSubjectsData[subjectId][qIdStr] || {
        attempts: 0,
        correctCount: 0,
        wrongCount: 0,
        lastAttemptedAt: nowIso,
      };

      const evalItem = evaluations[q.id] || evaluations[qIdStr];
      const isCorrect = evalItem?.isCorrect ?? false;
      const isUnanswered = evalItem?.isUnanswered ?? false;

      // Section 12: Only increment attempts if the answer was correct
      const newAttempts = prev.attempts + (isCorrect ? 1 : 0);
      const newCorrect = prev.correctCount + (isCorrect ? 1 : 0);
      const newWrong =
        prev.wrongCount + (!isCorrect && !isUnanswered && q.type !== 'essay' ? 1 : 0);

      const updatedStat: QuestionStat = {
        attempts: newAttempts,
        correctCount: newCorrect,
        wrongCount: newWrong,
        lastAttemptedAt: nowIso,
      };

      allSubjectsData[subjectId][qIdStr] = updatedStat;

      if (userId && !userId.startsWith('local-')) {
        updatedQuestionRows.push({
          user_id: userId,
          subject_id: subjectId,
          question_id: qIdStr,
          attempt_count: newAttempts,
          correct_count: newCorrect,
          wrong_count: newWrong,
          last_attempted_at: nowIso,
        });
      }
    }

    // 1. Save to storage immediately
    try {
      storage.setItem(storageKey, JSON.stringify(allSubjectsData));
    } catch (err) {
      console.warn('Failed saving question stats to storage:', err);
    }

    // 2. Sync to Supabase in background if authenticated
    if (
      isSupabaseConfigured &&
      supabase &&
      userId &&
      !userId.startsWith('local-') &&
      updatedQuestionRows.length > 0
    ) {
      try {
        const { error } = await supabase
          .from('user_question_stats')
          .upsert(updatedQuestionRows, {
            onConflict: 'user_id,subject_id,question_id',
          });
        if (error) {
          console.warn('Failed syncing user_question_stats to Supabase:', error.message);
        }
      } catch (err) {
        console.warn('Network error syncing question stats to Supabase:', err);
      }
    }
  },

  /**
   * Recalculates and synchronizes question stats for a user based strictly on their remaining active attempts.
   * Ensures that deleting an attempt decrements attempt/correct count for questions answered correctly,
   * leaves attempt count unchanged for questions answered wrongly, and cleans up subjects with 0 attempts.
   */
  async recalculateStatsFromAttempts(
    userId: string | undefined,
    attempts: QuizAttempt[]
  ): Promise<void> {
    const key = getStorageKey(userId);
    const newAllSubjectsData: Record<string, Record<string, QuestionStat>> = {};
    const updatedRows: Array<{
      user_id: string;
      subject_id: string;
      question_id: string;
      attempt_count: number;
      correct_count: number;
      wrong_count: number;
      last_attempted_at: string;
    }> = [];

    // Filter attempts to strictly this user's attempts
    const userAttempts = attempts.filter((a) => {
      if (userId && !userId.startsWith('local-')) {
        return a.userId === userId;
      }
      return !a.userId || a.userId.startsWith('local-');
    });

    for (const att of userAttempts) {
      const subjectId = att.subjectId;
      if (!subjectId || !att.questions) continue;

      if (!newAllSubjectsData[subjectId]) {
        newAllSubjectsData[subjectId] = {};
      }

      const evals = att.result?.evaluations || {};

      for (const q of att.questions) {
        const qIdStr = String(q.id);
        const evalItem = evals[qIdStr] || evals[q.id];
        const isCorrect = evalItem?.isCorrect ?? false;
        const isUnanswered = evalItem?.isUnanswered ?? false;

        const current = newAllSubjectsData[subjectId][qIdStr] || {
          attempts: 0,
          correctCount: 0,
          wrongCount: 0,
          lastAttemptedAt: att.submittedAt || new Date().toISOString(),
        };

        if (isCorrect) {
          current.attempts += 1;
          current.correctCount += 1;
        } else if (!isUnanswered && q.type !== 'essay') {
          current.wrongCount += 1;
        }
        current.lastAttemptedAt = att.submittedAt || current.lastAttemptedAt;
        newAllSubjectsData[subjectId][qIdStr] = current;
      }
    }

    // 1. Update localStorage immediately with exact recomputed stats
    try {
      storage.setItem(key, JSON.stringify(newAllSubjectsData));
    } catch (err) {
      console.warn('Failed saving recalculated question stats to storage:', err);
    }

    // 2. Synchronize to Supabase if authenticated
    if (isSupabaseConfigured && supabase && userId && !userId.startsWith('local-')) {
      try {
        for (const [subjId, qMap] of Object.entries(newAllSubjectsData)) {
          for (const [qIdStr, stat] of Object.entries(qMap)) {
            if (stat.attempts > 0 || stat.wrongCount > 0) {
              updatedRows.push({
                user_id: userId,
                subject_id: subjId,
                question_id: qIdStr,
                attempt_count: stat.attempts,
                correct_count: stat.correctCount,
                wrong_count: stat.wrongCount,
                last_attempted_at: stat.lastAttemptedAt,
              });
            }
          }
        }

        // Wipe obsolete stats and write fresh active stats
        await supabase.from('user_question_stats').delete().eq('user_id', userId);
        if (updatedRows.length > 0) {
          await supabase.from('user_question_stats').insert(updatedRows);
        }
      } catch (err) {
        console.warn('Failed syncing recalculated question stats to Supabase:', err);
      }
    }
  },

  /**
   * Fetches remote question stats from Supabase and synchronizes them into localStorage.
   */
  async syncRemoteStats(
    userId: string,
    subjectId: string
  ): Promise<Record<string, number>> {
    if (!isSupabaseConfigured || !supabase || !userId || userId.startsWith('local-')) {
      return questionStatsService.getQuestionAttempts(userId, subjectId);
    }

    try {
      const { data, error } = await supabase
        .from('user_question_stats')
        .select('question_id, attempt_count, correct_count, wrong_count, last_attempted_at')
        .eq('user_id', userId)
        .eq('subject_id', subjectId);

      const key = getStorageKey(userId);
      let allSubjectsData: Record<string, Record<string, QuestionStat>> = {};
      try {
        const raw = storage.getItem(key);
        if (raw) allSubjectsData = JSON.parse(raw);
      } catch {
        allSubjectsData = {};
      }

      if (!error && Array.isArray(data)) {
        if (data.length === 0) {
          // If no questions on remote for this subject, clean it out of localStorage
          delete allSubjectsData[subjectId];
        } else {
          const freshSubjectStats: Record<string, QuestionStat> = {};
          for (const row of data) {
            const qIdStr = String(row.question_id);
            freshSubjectStats[qIdStr] = {
              attempts: row.attempt_count || 0,
              correctCount: row.correct_count || 0,
              wrongCount: row.wrong_count || 0,
              lastAttemptedAt: row.last_attempted_at || new Date().toISOString(),
            };
          }
          allSubjectsData[subjectId] = freshSubjectStats;
        }
        storage.setItem(key, JSON.stringify(allSubjectsData));
      }
    } catch (err) {
      console.warn('Failed syncing remote question stats:', err);
    }

    return questionStatsService.getQuestionAttempts(userId, subjectId);
  },

  /**
   * Calculates overall progress and mastery metrics for a subject or chapter question pool.
   */
  getSubjectProgress(
    userId: string | undefined,
    subjectId: string,
    questions: Question[]
  ): SubjectProgress {
    if (!questions || questions.length === 0) {
      return {
        totalQuestions: 0,
        attemptedQuestions: 0,
        neverAttemptedQuestions: 0,
        totalAttempts: 0,
        accuracy: 0,
      };
    }

    const stats = questionStatsService.getSubjectQuestionStats(userId, subjectId);
    let attemptedCount = 0;
    let totalAttempts = 0;
    let totalCorrect = 0;
    let totalAnswered = 0;

    for (const q of questions) {
      const qStat = stats[String(q.id)];
      if (qStat && qStat.attempts > 0) {
        attemptedCount++;
        totalAttempts += qStat.attempts;
        totalCorrect += qStat.correctCount || 0;
        totalAnswered += (qStat.correctCount || 0) + (qStat.wrongCount || 0);
      }
    }

    const accuracy =
      totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

    return {
      totalQuestions: questions.length,
      attemptedQuestions: attemptedCount,
      neverAttemptedQuestions: Math.max(0, questions.length - attemptedCount),
      totalAttempts,
      accuracy,
    };
  },

  /**
   * Resets question statistics for a specific subject (e.g. if user wants to start over).
   */
  async clearSubjectStats(userId: string | undefined, subjectId: string): Promise<void> {
    const key = getStorageKey(userId);
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const all = JSON.parse(raw);
        delete all[subjectId];
        storage.setItem(key, JSON.stringify(all));
      }
    } catch (e) {
      console.warn('Failed clearing subject stats in localStorage:', e);
    }

    if (isSupabaseConfigured && supabase && userId && !userId.startsWith('local-')) {
      try {
        await supabase
          .from('user_question_stats')
          .delete()
          .eq('user_id', userId)
          .eq('subject_id', subjectId);
      } catch (err) {
        console.warn('Failed deleting user_question_stats from Supabase:', err);
      }
    }
  },
};
