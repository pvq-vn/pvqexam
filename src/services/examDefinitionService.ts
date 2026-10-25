import { ExamDefinition, QuizAttempt } from '../types/quiz';
import { supabase, isSupabaseConfigured } from './supabase';

const LOCAL_EXAM_DEFINITIONS_KEY = 'hust_quiz_exam_definitions';
const LOCAL_DELETED_SEEDS_KEY = 'hust_quiz_deleted_seeds';

export const examDefinitionService = {
  /**
   * Retrieves list of deleted seeds (case-insensitive uppercase).
   */
  getDeletedSeeds(): string[] {
    try {
      const raw = localStorage.getItem(LOCAL_DELETED_SEEDS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /**
   * Marks a seed as deleted so it can never be loaded again.
   */
  markSeedDeleted(seed: string): void {
    const clean = seed.trim().toUpperCase();
    if (!clean) return;
    try {
      const deleted = examDefinitionService.getDeletedSeeds();
      if (!deleted.includes(clean)) {
        localStorage.setItem(LOCAL_DELETED_SEEDS_KEY, JSON.stringify([...deleted, clean]));
      }
    } catch {
      // ignore
    }
  },

  /**
   * Unmarks a seed from the deleted list if an active attempt or exam definition exists.
   */
  unmarkSeedDeleted(seed: string): void {
    const clean = seed.trim().toUpperCase();
    if (!clean) return;
    try {
      const deleted = examDefinitionService.getDeletedSeeds();
      const updated = deleted.filter((s) => s.toUpperCase() !== clean);
      localStorage.setItem(LOCAL_DELETED_SEEDS_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  },

  /**
   * Generates a unique 6-character random seed that does not collide with existing or deleted seeds.
   */
  generateUniqueSeed(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const local = examDefinitionService.getLocalExamDefinitions();
    const deleted = examDefinitionService.getDeletedSeeds();
    const existingSeeds = new Set([
      ...local.map((d) => d.seed.toUpperCase()),
      ...deleted.map((s) => s.toUpperCase()),
    ]);

    for (let attempts = 0; attempts < 100; attempts++) {
      let seed = '';
      for (let i = 0; i < 6; i++) {
        seed += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      if (!existingSeeds.has(seed)) {
        return seed;
      }
    }
    return `EX${Date.now().toString(36).toUpperCase().slice(-4)}`;
  },

  /**
   * Retrieves an exam definition by seed string (case-insensitive).
   * Checks local storage definitions, Supabase exam_definitions, local attempt history, and Supabase attempts.
   */
  async getExamDefinitionBySeed(seed: string): Promise<ExamDefinition | null> {
    const cleanSeed = seed.trim().toUpperCase();
    if (!cleanSeed) return null;

    // Check if an active attempt currently exists in local history
    let localAttempts: QuizAttempt[] = [];
    try {
      const rawAttempts = localStorage.getItem('hust_quiz_local_attempts');
      localAttempts = rawAttempts ? JSON.parse(rawAttempts) : [];
    } catch {
      localAttempts = [];
    }

    const hasActiveAttempt = localAttempts.some(
      (a) => (a.seed || '').trim().toUpperCase() === cleanSeed
    );

    // If an active attempt exists, seed is definitely NOT deleted
    if (hasActiveAttempt) {
      examDefinitionService.unmarkSeedDeleted(cleanSeed);
    } else {
      const deletedSeeds = examDefinitionService.getDeletedSeeds();
      if (deletedSeeds.includes(cleanSeed)) {
        return null;
      }
    }

    // 1. Check Supabase exam_definitions table first (public read & source of truth)
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('exam_definitions')
          .select('*')
          .eq('seed', cleanSeed)
          .maybeSingle();

        if (!error && data) {
          // If found on Supabase, it is definitely NOT deleted!
          examDefinitionService.unmarkSeedDeleted(cleanSeed);

          let resolvedCreatorName = data.creator_name || undefined;
          let resolvedCreatorEmail = data.creator_email || undefined;

          // If creator_name is not set yet, resolve from user_profiles
          if (!resolvedCreatorName && data.created_by_user_id) {
            try {
              const { data: up } = await supabase
                .from('user_profiles')
                .select('full_name, email')
                .eq('id', data.created_by_user_id)
                .maybeSingle();
              if (up?.full_name) {
                resolvedCreatorName = up.full_name;
              }
              if (up?.email && !resolvedCreatorEmail) {
                resolvedCreatorEmail = up.email;
              }
            } catch {}
          }

          const remoteDef: ExamDefinition = {
            id: data.id,
            seed: data.seed,
            subjectId: data.subject_id,
            subjectCode: data.subject_code,
            title: data.title || undefined,
            isPublic: Boolean(data.is_public),
            createdByUserId: data.created_by_user_id,
            creatorEmail: resolvedCreatorEmail,
            creatorName: resolvedCreatorName,
            questionIds: data.question_ids || [],
            totalQuestions: data.question_ids?.length || 0,
            config: data.config,
            bankVersion: data.bank_version,
            createdAt: data.created_at,
          };
          // Cache to local
          examDefinitionService.cacheLocalDefinition(remoteDef);
          return remoteDef;
        }
      } catch (err) {
        console.warn('Error querying exam_definitions from Supabase:', err);
      }
    }

    // 2. Check local storage exam definitions
    const local = examDefinitionService.getLocalExamDefinitions();
    const foundLocal = local.find(
      (d) => (d.seed || '').trim().toUpperCase() === cleanSeed
    );
    if (foundLocal) {
      examDefinitionService.unmarkSeedDeleted(cleanSeed);
      return foundLocal;
    }

    // 3. Check deleted seeds list
    const deletedSeeds = examDefinitionService.getDeletedSeeds();
    if (deletedSeeds.includes(cleanSeed)) {
      return null;
    }

    // 3. Fallback: check historical quiz attempts across all users in local storage
    try {
      const matchAttempt = localAttempts.find(
        (a) => (a.seed || '').trim().toUpperCase() === cleanSeed
      );

      if (matchAttempt && matchAttempt.questions && matchAttempt.questions.length > 0) {
        const reconstructed: ExamDefinition = {
          id: matchAttempt.examDefinitionId || `exam-${cleanSeed}`,
          seed: cleanSeed,
          subjectId: matchAttempt.subjectId,
          subjectCode: matchAttempt.subjectCode,
          title: `Đề thi ${matchAttempt.subjectCode} (${cleanSeed})`,
          isPublic: false,
          createdByUserId: matchAttempt.userId,
          questionIds: matchAttempt.questions.map((q) => q.id),
          totalQuestions: matchAttempt.questions.length,
          config: matchAttempt.config,
          createdAt: matchAttempt.startedAt || new Date().toISOString(),
        };
        examDefinitionService.cacheLocalDefinition(reconstructed);
        // Persist to Supabase in the background
        examDefinitionService.saveExamDefinition(reconstructed).catch(() => {});
        return reconstructed;
      }
    } catch (err) {
      console.warn('Error recovering legacy exam definition from history:', err);
    }

    // 4. Fallback: check Supabase quiz_attempts table
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: attData } = await supabase
          .from('quiz_attempts')
          .select('*')
          .eq('seed', cleanSeed)
          .limit(1)
          .maybeSingle();

        if (attData && attData.questions_snapshot && attData.questions_snapshot.length > 0) {
          const reconstructed: ExamDefinition = {
            id: attData.exam_id || `exam-${cleanSeed}`,
            seed: cleanSeed,
            subjectId: attData.subject_id,
            subjectCode: attData.subject_code,
            title: `Đề thi ${attData.subject_code} (${cleanSeed})`,
            isPublic: false,
            createdByUserId: attData.user_id,
            questionIds: attData.questions_snapshot.map((q: any) => q.id),
            totalQuestions: attData.questions_snapshot.length,
            config: attData.config,
            createdAt: attData.started_at || new Date().toISOString(),
          };
          examDefinitionService.cacheLocalDefinition(reconstructed);
          examDefinitionService.saveExamDefinition(reconstructed).catch(() => {});
          return reconstructed;
        }
      } catch (err) {
        console.warn('Error recovering exam definition from Supabase quiz_attempts:', err);
      }
    }

    return null;
  },

  /**
   * Persists a new or existing exam definition to Supabase and localStorage.
   */
  async saveExamDefinition(def: ExamDefinition): Promise<ExamDefinition> {
    const cleanDef: ExamDefinition = {
      ...def,
      seed: def.seed.trim().toUpperCase(),
    };

    // 1. Check if exam definition already exists on Supabase (source of truth)
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: existing } = await supabase
          .from('exam_definitions')
          .select('*')
          .eq('seed', cleanDef.seed)
          .maybeSingle();

        if (existing) {
          // CANONICAL PRESERVATION: A quiz attempt, test-taker, or background sync must NEVER
          // overwrite the canonical visibility (is_public), question list (question_ids),
          // title, or configuration of an already-existing exam definition.
          cleanDef.id = existing.id || cleanDef.id;
          cleanDef.createdByUserId = existing.created_by_user_id || cleanDef.createdByUserId;
          cleanDef.creatorEmail = existing.creator_email || cleanDef.creatorEmail;
          cleanDef.creatorName = existing.creator_name || cleanDef.creatorName;
          cleanDef.createdAt = existing.created_at || cleanDef.createdAt;

          // Only allow changing isPublic or title if caller explicitly specified isExplicitAdminUpdate
          if ((def as any).isExplicitAdminUpdate) {
            cleanDef.isPublic = Boolean(def.isPublic);
            if (def.title) cleanDef.title = def.title;
          } else {
            cleanDef.isPublic = Boolean(existing.is_public);
            cleanDef.title = existing.title || cleanDef.title;
          }

          cleanDef.questionIds = existing.question_ids || cleanDef.questionIds;
          cleanDef.totalQuestions = cleanDef.questionIds.length;
          cleanDef.config = existing.config || cleanDef.config;
          cleanDef.bankVersion = existing.bank_version || cleanDef.bankVersion;

          // Only update database fields if explicit admin update OR backfilling missing creator info
          const updatePayload: Record<string, any> = {};
          if ((def as any).isExplicitAdminUpdate) {
            updatePayload.is_public = cleanDef.isPublic;
            if (cleanDef.title) updatePayload.title = cleanDef.title;
          }
          if (!existing.creator_name && cleanDef.creatorName) {
            updatePayload.creator_name = cleanDef.creatorName;
          }
          if (!existing.creator_email && cleanDef.creatorEmail) {
            updatePayload.creator_email = cleanDef.creatorEmail;
          }

          if (Object.keys(updatePayload).length > 0) {
            await supabase.from('exam_definitions').update(updatePayload).eq('seed', cleanDef.seed);
          }
        } else {
          // Brand-new exam definition: resolve creatorName from user_profiles if missing
          const isValidUuid =
            typeof cleanDef.createdByUserId === 'string' &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              cleanDef.createdByUserId
            );

          if (isValidUuid && (!cleanDef.creatorName || !cleanDef.creatorEmail)) {
            try {
              const { data: prof } = await supabase
                .from('user_profiles')
                .select('full_name, email')
                .eq('id', cleanDef.createdByUserId)
                .maybeSingle();
              if (prof?.full_name && !cleanDef.creatorName) {
                cleanDef.creatorName = prof.full_name;
              }
              if (prof?.email && !cleanDef.creatorEmail) {
                cleanDef.creatorEmail = prof.email;
              }
            } catch {}
          }

          const insertPayload: Record<string, any> = {
            id: cleanDef.id,
            seed: cleanDef.seed,
            subject_id: cleanDef.subjectId,
            subject_code: cleanDef.subjectCode,
            title: cleanDef.title || null,
            is_public: Boolean(cleanDef.isPublic),
            created_by_user_id: isValidUuid ? cleanDef.createdByUserId : null,
            creator_email: cleanDef.creatorEmail || null,
            creator_name: cleanDef.creatorName || null,
            question_ids: cleanDef.questionIds,
            config: cleanDef.config,
            bank_version: cleanDef.bankVersion || '1.0',
            created_at: cleanDef.createdAt,
          };

          await supabase.from('exam_definitions').insert(insertPayload);
        }
      } catch (err) {
        console.warn('Error connecting to Supabase exam_definitions table:', err);
      }
    }

    // 2. Save to local storage cache with resolved metadata
    examDefinitionService.cacheLocalDefinition(cleanDef);

    return cleanDef;
  },

  /**
   * Deletes an exam definition and its attempts, registering the seed as deleted.
   */
  async deleteExamDefinition(examId: string, seed: string): Promise<void> {
    const cleanSeed = (seed || '').trim().toUpperCase();
    if (cleanSeed) {
      examDefinitionService.markSeedDeleted(cleanSeed);
    }

    // 1. Remove from local storage exam definitions
    try {
      const current = examDefinitionService.getLocalExamDefinitions();
      const filtered = current.filter(
        (d) => d.id !== examId && (!cleanSeed || d.seed.toUpperCase() !== cleanSeed)
      );
      localStorage.setItem(LOCAL_EXAM_DEFINITIONS_KEY, JSON.stringify(filtered));
    } catch (err) {
      console.warn('Failed removing exam definition from localStorage:', err);
    }

    // 2. Remove related attempts from local storage so it vanishes from user history
    try {
      const raw = localStorage.getItem('hust_quiz_local_attempts');
      if (raw) {
        const atts: QuizAttempt[] = JSON.parse(raw);
        const filteredAtts = atts.filter(
          (a) =>
            a.examDefinitionId !== examId &&
            a.examId !== examId &&
            (!cleanSeed || (a.seed || '').trim().toUpperCase() !== cleanSeed)
        );
        localStorage.setItem('hust_quiz_local_attempts', JSON.stringify(filteredAtts));
      }
    } catch {
      // ignore
    }

    // 3. Delete from Supabase if configured
    if (isSupabaseConfigured && supabase) {
      try {
        if (examId) {
          await supabase.from('exam_definitions').delete().eq('id', examId);
        }
        if (cleanSeed) {
          await supabase.from('exam_definitions').delete().eq('seed', cleanSeed);
          // Delete related quiz attempts
          await supabase
            .from('quiz_attempts')
            .delete()
            .or(`exam_id.eq.${examId},seed.eq.${cleanSeed}`);
        }
      } catch (err) {
        console.warn('Error deleting exam definition from Supabase:', err);
      }
    }
  },

  /**
   * Retrieves all public exam definitions provided by the system/admin.
   */
  async getPublicExamDefinitions(): Promise<ExamDefinition[]> {
    const all = await examDefinitionService.getAllExamDefinitions();
    const deleted = new Set(examDefinitionService.getDeletedSeeds());
    return all.filter((d) => Boolean(d.isPublic) && !deleted.has(d.seed.toUpperCase()));
  },

  /**
   * Retrieves exam definitions visible to the specified user:
   * - Admin: all exams (public & private)
   * - Normal user: all public exams PLUS private exams created by that user
   * - Guest: only public exams
   */
  async getVisibleExamDefinitions(
    user?: { id?: string; email?: string; isAdmin?: boolean } | null
  ): Promise<ExamDefinition[]> {
    const all = await examDefinitionService.getAllExamDefinitions();
    const deleted = new Set(examDefinitionService.getDeletedSeeds());
    const valid = all.filter((d) => !deleted.has(d.seed.toUpperCase()));

    if (user?.isAdmin) {
      return valid;
    }

    const currentUserId = user?.id;
    const currentUserEmail = user?.email?.toLowerCase();

    return valid.filter((d) => {
      // Public exams are visible to everyone
      if (d.isPublic) return true;
      // Private exams created by the user are visible to the user
      if (currentUserId && d.createdByUserId === currentUserId) return true;
      if (currentUserEmail && d.creatorEmail && d.creatorEmail.toLowerCase() === currentUserEmail) {
        return true;
      }
      return false;
    });
  },

  /**
   * Retrieves all exam definitions for Admin Management.
   */
  async getAllExamDefinitions(): Promise<ExamDefinition[]> {
    const local = examDefinitionService.getLocalExamDefinitions();
    const deleted = new Set(examDefinitionService.getDeletedSeeds());

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('exam_definitions')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          const remoteList: ExamDefinition[] = data.map((d: any) => ({
            id: d.id,
            seed: d.seed,
            subjectId: d.subject_id,
            subjectCode: d.subject_code,
            title: d.title || undefined,
            isPublic: Boolean(d.is_public),
            createdByUserId: d.created_by_user_id,
            creatorEmail: d.creator_email,
            creatorName: d.creator_name || undefined,
            questionIds: d.question_ids || [],
            totalQuestions: d.total_questions || d.question_ids?.length || 0,
            config: d.config,
            bankVersion: d.bank_version,
            createdAt: d.created_at,
          }));

          const seen = new Set<string>();
          const merged: ExamDefinition[] = [];

          // Remote list from Supabase is authoritative
          remoteList.forEach((item) => {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              merged.push(item);
              examDefinitionService.unmarkSeedDeleted(item.seed);
            }
          });

          // Local additions
          local.forEach((item) => {
            if (!seen.has(item.id) && !deleted.has(item.seed.toUpperCase())) {
              seen.add(item.id);
              merged.push(item);
            }
          });

          return merged;
        }
      } catch (err) {
        console.warn('Error fetching all exam_definitions from Supabase:', err);
      }
    }

    return local.filter((d) => !deleted.has(d.seed.toUpperCase()));
  },

  /**
   * Retrieves all attempts across all users for Admin Exam Statistics.
   */
  async getAllAttemptsForAdmin(): Promise<QuizAttempt[]> {
    const deleted = new Set(examDefinitionService.getDeletedSeeds());
    let remoteAttempts: QuizAttempt[] = [];

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('quiz_attempts')
          .select('*')
          .order('submitted_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          remoteAttempts = data.map((d: any) => ({
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
          }));
        }
      } catch (err) {
        console.warn('Error fetching all attempts for admin:', err);
      }
    }

    // Merge with local storage attempts without duplicates
    let localAttempts: QuizAttempt[] = [];
    try {
      const raw = localStorage.getItem('hust_quiz_local_attempts');
      localAttempts = raw ? JSON.parse(raw) : [];
    } catch {
      localAttempts = [];
    }

    const seen = new Set<string>();
    const merged: QuizAttempt[] = [];
    [...remoteAttempts, ...localAttempts].forEach((item) => {
      const cleanSeed = (item.seed || '').trim().toUpperCase();
      if (!seen.has(item.id) && !deleted.has(cleanSeed)) {
        seen.add(item.id);
        merged.push(item);
      }
    });

    return merged;
  },

  getLocalExamDefinitions(): ExamDefinition[] {
    try {
      const raw = localStorage.getItem(LOCAL_EXAM_DEFINITIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  cacheLocalDefinition(def: ExamDefinition): void {
    try {
      const current = examDefinitionService.getLocalExamDefinitions();
      const filtered = current.filter((d) => d.id !== def.id && d.seed.toUpperCase() !== def.seed.toUpperCase());
      localStorage.setItem(LOCAL_EXAM_DEFINITIONS_KEY, JSON.stringify([def, ...filtered]));
    } catch {
      // ignore
    }
  },

  /**
   * Pushes all local exam definitions and local quiz attempts to Supabase.
   * Useful to unify statistics across localhost and deployed Vercel domains.
   */
  async syncAllLocalDataToSupabase(): Promise<{ syncedDefs: number; syncedAttempts: number }> {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase chưa được cấu hình.');
    }

    let syncedDefs = 0;
    let syncedAttempts = 0;

    // 1. Sync exam definitions
    const localDefs = examDefinitionService.getLocalExamDefinitions();
    for (const def of localDefs) {
      try {
        await examDefinitionService.saveExamDefinition(def);
        syncedDefs++;
      } catch (err) {
        console.warn('Failed syncing definition to Supabase:', def.seed, err);
      }
    }

    // 2. Sync quiz attempts
    let localAttempts: QuizAttempt[] = [];
    try {
      const raw = localStorage.getItem('hust_quiz_local_attempts');
      localAttempts = raw ? JSON.parse(raw) : [];
    } catch {
      localAttempts = [];
    }

    for (const att of localAttempts) {
      const cleanSeed = (att.seed || '').trim().toUpperCase();
      try {
        const { error } = await supabase.from('quiz_attempts').upsert({
          id: att.id,
          user_id: att.userId && !att.userId.startsWith('local-') ? att.userId : null,
          subject_id: att.subjectId,
          subject_code: att.subjectCode,
          subject_name: att.subjectName,
          seed: cleanSeed,
          exam_id: att.examDefinitionId || att.config?.examDefinitionId || null,
          score_10: att.score10,
          total_scored_questions: att.totalScoredQuestions,
          correct_count: att.correctCount,
          unanswered_count: att.unansweredCount,
          essay_count: att.essayCount,
          time_spent_seconds: att.timeSpentSeconds,
          started_at: att.startedAt,
          submitted_at: att.submittedAt,
          config: att.config,
          questions_snapshot: att.questions,
          answers: att.answers,
          flagged: att.flagged,
          result: att.result,
        });
        if (!error) {
          syncedAttempts++;
        }
      } catch (err) {
        console.warn('Failed syncing attempt to Supabase:', att.id, err);
      }
    }

    return { syncedDefs, syncedAttempts };
  },
};
