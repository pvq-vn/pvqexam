import { QuizAttempt, ExamDefinition, Question } from '../types/quiz';
import { supabase, isSupabaseConfigured } from './supabase';
import { questionStatsService } from './questionStatsService';
import { examDefinitionService } from './examDefinitionService';

const LOCAL_ATTEMPTS_KEY = 'hust_quiz_local_attempts';

export const historyService = {
  /**
   * Saves a completed quiz attempt to localStorage and Supabase (if configured).
   * Also ensures an ExamDefinition is automatically persisted so anyone with the seed can retake the exact exam.
   */
  async saveAttempt(attempt: QuizAttempt): Promise<void> {
    const cleanSeed = (attempt.seed || '').trim().toUpperCase();
    const normalizedAttempt: QuizAttempt = {
      ...attempt,
      seed: cleanSeed,
      userId: attempt.userId || 'local-guest',
    };

    // 1. Always save to localStorage for offline access and instant reactivity
    try {
      const existing = historyService.getLocalAttempts();
      const updated = [
        normalizedAttempt,
        ...existing.filter((a) => a.id !== normalizedAttempt.id),
      ].slice(0, 60);
      localStorage.setItem(LOCAL_ATTEMPTS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed saving attempt to localStorage:', e);
    }

    // 2. Automatically save ExamDefinition so this seed is globally accessible by anyone
    if (cleanSeed && normalizedAttempt.questions && normalizedAttempt.questions.length > 0) {
      try {
        const examDef: ExamDefinition = {
          id: normalizedAttempt.examDefinitionId || `exam-${cleanSeed}`,
          seed: cleanSeed,
          subjectId: normalizedAttempt.subjectId,
          subjectCode: normalizedAttempt.subjectCode,
          title: `Đề thi ${normalizedAttempt.subjectCode} (${cleanSeed})`,
          isPublic: false,
          createdByUserId:
            normalizedAttempt.userId && !normalizedAttempt.userId.startsWith('local-')
              ? normalizedAttempt.userId
              : undefined,
          questionIds: normalizedAttempt.questions.map((q) => q.id),
          totalQuestions: normalizedAttempt.questions.length,
          config: normalizedAttempt.config,
          createdAt: normalizedAttempt.startedAt || new Date().toISOString(),
        };
        await examDefinitionService.saveExamDefinition(examDef);
      } catch (err) {
        console.warn('Failed auto-saving exam definition from attempt:', err);
      }
    }

    // 3. If Supabase is configured and user is logged in, sync to database table
    if (
      isSupabaseConfigured &&
      supabase &&
      normalizedAttempt.userId &&
      !normalizedAttempt.userId.startsWith('local-')
    ) {
      try {
        const { error } = await supabase.from('quiz_attempts').upsert({
          id: normalizedAttempt.id,
          user_id: normalizedAttempt.userId,
          subject_id: normalizedAttempt.subjectId,
          subject_code: normalizedAttempt.subjectCode,
          subject_name: normalizedAttempt.subjectName,
          seed: cleanSeed,
          exam_id: normalizedAttempt.examDefinitionId || normalizedAttempt.config?.examDefinitionId || null,
          score_10: normalizedAttempt.score10,
          total_scored_questions: normalizedAttempt.totalScoredQuestions,
          correct_count: normalizedAttempt.correctCount,
          unanswered_count: normalizedAttempt.unansweredCount,
          essay_count: normalizedAttempt.essayCount,
          time_spent_seconds: normalizedAttempt.timeSpentSeconds,
          started_at: normalizedAttempt.startedAt,
          submitted_at: normalizedAttempt.submittedAt,
          config: normalizedAttempt.config,
          questions_snapshot: normalizedAttempt.questions,
          answers: normalizedAttempt.answers,
          flagged: normalizedAttempt.flagged,
          result: normalizedAttempt.result,
        });

        if (error) {
          console.warn('Failed syncing attempt to Supabase:', error);
        }
      } catch (err) {
        console.warn('Error connecting to Supabase quiz_attempts table:', err);
      }
    }

    // 4. Record question stats (attempt count, accuracy per question)
    try {
      await questionStatsService.recordQuizAttempts(
        normalizedAttempt.userId,
        normalizedAttempt.subjectId,
        normalizedAttempt.questions,
        normalizedAttempt.answers,
        normalizedAttempt.result?.evaluations,
        normalizedAttempt.id
      );
    } catch (err) {
      console.warn('Failed recording question stats in historyService:', err);
    }
  },

  /**
   * Deletes a single attempt from localStorage and Supabase.
   * If no other active attempt uses this seed, marks the seed as deleted.
   */
  async deleteAttempt(attemptId: string, userId?: string): Promise<void> {
    const existing = historyService.getLocalAttempts();
    const targetAttempt = existing.find((a) => a.id === attemptId);

    // 1. Delete from localStorage
    try {
      const updated = existing.filter((a) => a.id !== attemptId);
      localStorage.setItem(LOCAL_ATTEMPTS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed deleting attempt from localStorage:', e);
    }

    // 2. Delete the associated exam definition ONLY if no other attempt uses this seed
    if (targetAttempt) {
      const seed = (targetAttempt.seed || '').trim().toUpperCase();
      const remainingWithSeed = existing.filter(
        (a) => a.id !== attemptId && (a.seed || '').trim().toUpperCase() === seed
      );
      if (remainingWithSeed.length === 0) {
        const examId = targetAttempt.examDefinitionId || targetAttempt.examId || '';
        try {
          await examDefinitionService.deleteExamDefinition(examId, seed);
        } catch (err) {
          console.warn('Error deleting associated exam definition:', err);
        }
      }
    }

    // 3. Delete from Supabase if authenticated
    if (isSupabaseConfigured && supabase && userId && !userId.startsWith('local-')) {
      try {
        const { error } = await supabase
          .from('quiz_attempts')
          .delete()
          .eq('id', attemptId)
          .eq('user_id', userId);

        if (error) {
          console.warn('Failed deleting attempt from Supabase:', error);
          throw error;
        }
      } catch (err) {
        console.warn('Error deleting attempt from Supabase:', err);
        throw err;
      }
    }

    // 4. Recalculate and update question stats strictly based on remaining attempts
    const targetUserId = userId || targetAttempt?.userId;
    try {
      const remainingAttempts = await historyService.getAttempts(targetUserId);
      await questionStatsService.recalculateStatsFromAttempts(targetUserId, remainingAttempts);
    } catch (err) {
      console.warn('Failed recalculating question stats after delete:', err);
    }
  },

  /**
   * Retrieves attempts strictly isolated for the given user:
   * - If userId is empty or guest: only returns guest attempts (!userId or 'local-guest').
   * - If userId is provided: returns ONLY attempts matching that exact userId.
   */
  async getAttempts(userId?: string): Promise<QuizAttempt[]> {
    const local = historyService.getLocalAttempts();
    const deleted = new Set(examDefinitionService.getDeletedSeeds());

    const isGuest = !userId || userId.startsWith('local-');

    if (!isGuest && isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('quiz_attempts')
          .select('*')
          .eq('user_id', userId)
          .order('submitted_at', { ascending: false });

        if (error) {
          console.warn('Failed querying quiz_attempts from Supabase:', error);
        }

        const remoteAttempts: QuizAttempt[] =
          !error && Array.isArray(data)
            ? data.map((d: any) => ({
                id: d.id,
                userId: d.user_id,
                subjectId: d.subject_id,
                subjectCode: d.subject_code,
                subjectName: d.subject_name,
                seed: d.seed,
                examDefinitionId: d.exam_id || d.config?.examDefinitionId,
                score10: Number(d.score_10),
                totalScoredQuestions: d.total_scored_questions,
                correctCount: d.correct_count,
                unansweredCount: d.unanswered_count,
                essayCount: d.essay_count,
                timeSpentSeconds: d.time_spent_seconds,
                startedAt: d.started_at,
                submittedAt: d.submitted_at,
                config: d.config,
                questions: d.questions_snapshot,
                answers: d.answers,
                flagged: d.flagged || [],
                result: d.result,
              }))
            : [];

        // Sync remote attempts to local cache so seeds & attempts are discoverable offline
        try {
          const existingLocal = historyService.getLocalAttempts();
          const existingMap = new Map(existingLocal.map((a) => [a.id, a]));
          remoteAttempts.forEach((ra) => existingMap.set(ra.id, ra));
          const updatedLocal = Array.from(existingMap.values()).slice(0, 100);
          localStorage.setItem(LOCAL_ATTEMPTS_KEY, JSON.stringify(updatedLocal));

          // Ensure local cache has ExamDefinitions for completed attempts without hammering Supabase
          const existingLocalSeeds = new Set(
            examDefinitionService.getLocalExamDefinitions().map((d) => d.seed.toUpperCase())
          );
          remoteAttempts.forEach((ra) => {
            const cleanSeed = (ra.seed || '').trim().toUpperCase();
            if (cleanSeed && ra.questions && ra.questions.length > 0 && !existingLocalSeeds.has(cleanSeed)) {
              const def: ExamDefinition = {
                id: ra.examDefinitionId || `exam-${cleanSeed}`,
                seed: cleanSeed,
                subjectId: ra.subjectId,
                subjectCode: ra.subjectCode,
                title: `Đề thi ${ra.subjectCode} (${cleanSeed})`,
                isPublic: false,
                createdByUserId: ra.userId,
                questionIds: ra.questions.map((q) => q.id),
                totalQuestions: ra.questions.length,
                config: ra.config,
                createdAt: ra.startedAt || ra.submittedAt || new Date().toISOString(),
              };
              examDefinitionService.cacheLocalDefinition(def);
            }
          });
        } catch {
          // ignore cache errors
        }

        // Filter local attempts to ONLY those belonging to this exact authenticated user
        const userLocal = local.filter((a) => a.userId === userId);

        // Merge remote and user's local attempts without duplicates
        const seen = new Set<string>();
        const merged: QuizAttempt[] = [];

        // Remote attempts from Supabase are the authoritative record for this authenticated user.
        // They must NEVER be hidden by local deleted seeds!
        remoteAttempts.forEach((item) => {
          const cleanSeed = (item.seed || '').trim().toUpperCase();
          if (!seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
            if (cleanSeed) {
              examDefinitionService.unmarkSeedDeleted(cleanSeed);
            }
          }
        });

        // Add user's pending local attempts (if not on remote yet and not deleted)
        userLocal.forEach((item) => {
          const cleanSeed = (item.seed || '').trim().toUpperCase();
          if (!seen.has(item.id) && !deleted.has(cleanSeed)) {
            seen.add(item.id);
            merged.push(item);
          }
        });

        return merged;
      } catch (err) {
        console.warn('Supabase fetch attempts warning:', err);
      }

      // Offline fallback: ONLY return local attempts for this specific user
      return local.filter(
        (a) => a.userId === userId && !deleted.has((a.seed || '').trim().toUpperCase())
      );
    }

    // Guest Mode: ONLY return attempts created without an authenticated userId
    return local.filter((a) => {
      const isAttemptGuest = !a.userId || a.userId.startsWith('local-');
      const cleanSeed = (a.seed || '').trim().toUpperCase();
      return isAttemptGuest && !deleted.has(cleanSeed);
    });
  },

  /**
   * Loads a specific attempt by ID.
   */
  async getAttemptById(attemptId: string): Promise<QuizAttempt | null> {
    const local = historyService.getLocalAttempts();
    const found = local.find((a) => a.id === attemptId);
    if (found) return found;

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('quiz_attempts')
          .select('*')
          .eq('id', attemptId)
          .single();

        if (!error && data) {
          return {
            id: data.id,
            userId: data.user_id,
            subjectId: data.subject_id,
            subjectCode: data.subject_code,
            subjectName: data.subject_name,
            seed: data.seed,
            examDefinitionId: data.exam_id || data.config?.examDefinitionId,
            score10: Number(data.score_10),
            totalScoredQuestions: data.total_scored_questions,
            correctCount: data.correct_count,
            unansweredCount: data.unanswered_count,
            essayCount: data.essay_count,
            timeSpentSeconds: data.time_spent_seconds,
            startedAt: data.started_at,
            submittedAt: data.submitted_at,
            config: data.config,
            questions: data.questions_snapshot,
            answers: data.answers,
            flagged: data.flagged || [],
            result: data.result,
          };
        }
      } catch (err) {
        console.warn('Supabase get attempt warning:', err);
      }
    }

    return null;
  },

  getLocalAttempts(): QuizAttempt[] {
    try {
      const raw = localStorage.getItem(LOCAL_ATTEMPTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /**
   * Clears local history isolated by user:
   * - If userId is provided: clears only that user's local attempts.
   * - If guest: clears only guest attempts, leaving authenticated users' data intact.
   */
  clearLocalHistory(userId?: string): void {
    const existing = historyService.getLocalAttempts();
    const isGuest = !userId || userId.startsWith('local-');

    const remaining = existing.filter((a) => {
      if (isGuest) {
        // Keep authenticated users' attempts
        return Boolean(a.userId && !a.userId.startsWith('local-'));
      }
      // Keep other users' attempts and guest attempts
      return a.userId !== userId;
    });

    localStorage.setItem(LOCAL_ATTEMPTS_KEY, JSON.stringify(remaining));

    if (isGuest) {
      localStorage.removeItem('hust_quiz_qstats_local_guest');
    }
  },

  /**
   * Clears all history for the user (locally and remotely if authenticated)
   * and completely resets their question statistics.
   */
  async clearHistory(userId?: string): Promise<void> {
    const isGuest = !userId || userId.startsWith('local-');

    historyService.clearLocalHistory(userId);

    if (!isGuest && isSupabaseConfigured && supabase && userId) {
      try {
        await supabase.from('quiz_attempts').delete().eq('user_id', userId);
      } catch (err) {
        console.warn('Failed deleting all user attempts from Supabase:', err);
      }
    }

    try {
      await questionStatsService.recalculateStatsFromAttempts(userId, []);
    } catch (err) {
      console.warn('Failed resetting question stats after clearing history:', err);
    }
  },

  /**
   * Updates an attempt's questions and score in localStorage and Supabase (e.g. after exam.json edits).
   */
  async updateAttemptQuestions(attemptId: string, questions: Question[], score10?: number): Promise<void> {
    try {
      const existing = historyService.getLocalAttempts();
      const updated = existing.map((a) => {
        if (a.id === attemptId) {
          return {
            ...a,
            questions,
            score10: score10 !== undefined ? score10 : a.score10,
          };
        }
        return a;
      });
      localStorage.setItem(LOCAL_ATTEMPTS_KEY, JSON.stringify(updated));

      if (isSupabaseConfigured && supabase) {
        const updatePayload: Record<string, any> = { questions };
        if (score10 !== undefined) {
          updatePayload.score_10 = score10;
        }
        await supabase.from('quiz_attempts').update(updatePayload).eq('id', attemptId);
      }
    } catch (err) {
      console.warn('Could not update attempt questions in storage:', err);
    }
  },
};
