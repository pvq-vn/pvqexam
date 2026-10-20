import { supabase, isSupabaseConfigured, isAdminEmail } from './supabase';
import { QuizAttempt } from '../types/quiz';

export interface UserAccountProfile {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'user';
  isApproved: boolean;
  allowedExamSources: string[];
  createdAt: string;
  updatedAt: string;
}

const LOCAL_USERS_KEY = 'hust_quiz_admin_managed_users';

export const userService = {
  /**
   * Fetches all registered user profiles for admin management.
   */
  async getAllUsers(): Promise<UserAccountProfile[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          return data.map((d: any) => ({
            id: d.id,
            email: d.email,
            fullName: d.full_name || d.email.split('@')[0],
            role: (d.role === 'admin' || isAdminEmail(d.email)) ? 'admin' : 'user',
            isApproved: (d.role === 'admin' || isAdminEmail(d.email)) ? true : Boolean(d.is_approved),
            allowedExamSources: Array.isArray(d.allowed_exam_sources) ? d.allowed_exam_sources : [],
            createdAt: d.created_at,
            updatedAt: d.updated_at,
          }));
        }
      } catch (err) {
        console.warn('Error fetching user profiles from Supabase:', err);
      }
    }

    // Fallback to local storage if running offline
    try {
      const raw = localStorage.getItem(LOCAL_USERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /**
   * Approves or revokes user approval.
   */
  async updateUserApproval(userId: string, isApproved: boolean): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('user_profiles')
          .update({
            is_approved: isApproved,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);

        if (error) throw error;
      } catch (err) {
        console.warn('Failed updating user approval in Supabase:', err);
        throw err;
      }
    }

    // Local storage sync
    try {
      const users = await userService.getAllUsers();
      const updated = users.map((u) => (u.id === userId ? { ...u, isApproved } : u));
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  },

  /**
   * Updates the list of allowed exam file paths for a user.
   */
  async updateUserExamSources(userId: string, allowedSources: string[]): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('user_profiles')
          .update({
            allowed_exam_sources: allowedSources,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);

        if (error) throw error;
      } catch (err) {
        console.warn('Failed updating user allowed exam sources in Supabase:', err);
        throw err;
      }
    }

    // Local storage sync
    try {
      const users = await userService.getAllUsers();
      const updated = users.map((u) =>
        u.id === userId ? { ...u, allowedExamSources: allowedSources } : u
      );
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  },

  /**
   * Fetches all quiz attempts of a specific user for admin review.
   */
  async getUserQuizAttempts(userId: string): Promise<QuizAttempt[]> {
    if (isSupabaseConfigured && supabase && userId) {
      try {
        const { data, error } = await supabase
          .from('quiz_attempts')
          .select('*')
          .eq('user_id', userId)
          .order('submitted_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          return data.map((d: any) => ({
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
        }
      } catch (err) {
        console.warn('Error fetching quiz attempts for user:', err);
      }
    }

    return [];
  },
};
