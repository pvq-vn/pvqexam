import { QuizAttempt } from '../types/quiz';
import { supabase, isSupabaseConfigured } from './supabase';
import { questionStatsService } from './questionStatsService';

const LOCAL_ATTEMPTS_KEY = 'hust_quiz_local_attempts';

export const historyService = {
  /**
   * Saves a completed quiz attempt to localStorage and Supabase (if configured).
   */
  async saveAttempt(attempt: QuizAttempt): Promise<void> {
    // 1. Always save to localStorage for offline access and instant reactivity
    try {
      const existing = historyService.getLocalAttempts();
      // Prepend newest attempt
      const updated = [attempt, ...existing.filter((a) => a.id !== attempt.id)].slice(0, 50);
      localStorage.setItem(LOCAL_ATTEMPTS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed saving attempt to localStorage:', e);
    }

    // 2. If Supabase is configured and user is logged in, sync to database table
    if (isSupabaseConfigured && supabase && attempt.userId && !attempt.userId.startsWith('local-')) {
      try {
        const { error } = await supabase.from('quiz_attempts').upsert({
          id: attempt.id,
          user_id: attempt.userId,
          subject_id: attempt.subjectId,
          subject_code: attempt.subjectCode,
          subject_name: attempt.subjectName,
          seed: attempt.seed,
          score_10: attempt.score10,
          total_scored_questions: attempt.totalScoredQuestions,
          correct_count: attempt.correctCount,
          unanswered_count: attempt.unansweredCount,
          essay_count: attempt.essayCount,
          time_spent_seconds: attempt.timeSpentSeconds,
          started_at: attempt.startedAt,
          submitted_at: attempt.submittedAt,
          config: attempt.config,
          questions_snapshot: attempt.questions,
          answers: attempt.answers,
          flagged: attempt.flagged,
          result: attempt.result,
        });

        if (error) {
          console.warn('Failed syncing attempt to Supabase:', error);
        }
      } catch (err) {
        console.warn('Error connecting to Supabase quiz_attempts table:', err);
      }
    }

    // 3. Record question stats (attempt count, accuracy per question)
    try {
      await questionStatsService.recordQuizAttempts(
        attempt.userId,
        attempt.subjectId,
        attempt.questions,
        attempt.answers,
        attempt.result?.evaluations
      );
    } catch (err) {
      console.warn('Failed recording question stats in historyService:', err);
    }
  },

  /**
   * Retrieves all attempts for current user (or local guest).
   */
  async getAttempts(userId?: string): Promise<QuizAttempt[]> {
    const local = historyService.getLocalAttempts();

    if (isSupabaseConfigured && supabase && userId && !userId.startsWith('local-')) {
      try {
        const { data, error } = await supabase
          .from('quiz_attempts')
          .select('*')
          .eq('user_id', userId)
          .order('submitted_at', { ascending: false });

        if (!error && Array.isArray(data) && data.length > 0) {
          const remoteAttempts: QuizAttempt[] = data.map((d: any) => ({
            id: d.id,
            userId: d.user_id,
            subjectId: d.subject_id,
            subjectCode: d.subject_code,
            subjectName: d.subject_name,
            seed: d.seed,
            score10: d.score_10,
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
          }));

          // Merge local and remote without duplicates
          const seen = new Set<string>();
          const merged: QuizAttempt[] = [];
          [...remoteAttempts, ...local].forEach((item) => {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              merged.push(item);
            }
          });
          return merged;
        }
      } catch (err) {
        console.warn('Supabase fetch attempts warning:', err);
      }
    }

    return local;
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
            score10: data.score_10,
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

  clearLocalHistory(): void {
    localStorage.removeItem(LOCAL_ATTEMPTS_KEY);
  },
};
