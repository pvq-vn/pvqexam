import { ErrorReport, ReportStatus, ReportType } from '../types/quiz';
import { supabase, isSupabaseConfigured } from './supabase';

const LOCAL_REPORTS_KEY = 'hust_quiz_local_reports';

export const reportService = {
  /**
   * Submits a question error report.
   * NOTE: As mandated in Section 24, this ONLY saves the report record.
   * It NEVER modifies exam.json or any repo data.
   */
  async submitReport(report: Omit<ErrorReport, 'id' | 'createdAt' | 'status'>): Promise<ErrorReport> {
    const newReport: ErrorReport = {
      ...report,
      id: `report-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
      status: 'open',
    };

    // Save to local storage for instant visibility in offline/local admin
    try {
      const existing = reportService.getLocalReports();
      localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify([newReport, ...existing]));
    } catch (e) {
      console.warn('Failed saving report to localStorage:', e);
    }

    // Save to Supabase if configured
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from('error_reports').insert({
          id: newReport.id,
          user_id: newReport.userId || null,
          user_email: newReport.userEmail || null,
          subject_id: newReport.subjectId,
          subject_code: newReport.subjectCode,
          question_id: String(newReport.questionId),
          original_question_id: newReport.originalQuestionId ? String(newReport.originalQuestionId) : null,
          question_text: newReport.questionText,
          scope: newReport.scope || null,
          source_file: newReport.sourceFile || null,
          seed: newReport.seed || null,
          attempt_id: newReport.attemptId || null,
          question_index: newReport.questionIndex || null,
          type: newReport.type,
          description: newReport.description || '',
          status: newReport.status,
          created_at: newReport.createdAt,
        });

        if (error) {
          console.warn('Failed inserting report into Supabase:', error);
        }
      } catch (err) {
        console.warn('Supabase report submit warning:', err);
      }
    }

    return newReport;
  },

  /**
   * Retrieves all error reports for Admin dashboard.
   */
  async getReports(): Promise<ErrorReport[]> {
    const local = reportService.getLocalReports();

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('error_reports')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data) && data.length > 0) {
          const remoteReports: ErrorReport[] = data.map((d: any) => ({
            id: d.id,
            userId: d.user_id,
            userEmail: d.user_email,
            subjectId: d.subject_id,
            subjectCode: d.subject_code,
            questionId: d.question_id,
            originalQuestionId: d.original_question_id || undefined,
            questionText: d.question_text,
            scope: d.scope || undefined,
            sourceFile: d.source_file || undefined,
            seed: d.seed || undefined,
            attemptId: d.attempt_id || undefined,
            questionIndex: d.question_index || undefined,
            type: d.type as ReportType,
            description: d.description || '',
            status: d.status as ReportStatus,
            createdAt: d.created_at,
            resolvedAt: d.resolved_at || undefined,
            adminNote: d.admin_note,
          }));

          const seen = new Set<string>();
          const merged: ErrorReport[] = [];
          [...remoteReports, ...local].forEach((r) => {
            if (!seen.has(r.id)) {
              seen.add(r.id);
              merged.push(r);
            }
          });
          return merged.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        }
      } catch (err) {
        console.warn('Supabase fetch reports warning:', err);
      }
    }

    return local.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  /**
   * Updates status of a report (e.g. 'reviewing', 'resolved', 'rejected').
   */
  async updateReportStatus(reportId: string, status: ReportStatus, adminNote?: string): Promise<void> {
    const resolvedAt = status === 'resolved' ? new Date().toISOString() : undefined;
    return reportService.updateReport(reportId, { status, adminNote, resolvedAt });
  },

  /**
   * Updates fields of a report and persists to Supabase and localStorage.
   */
  async updateReport(reportId: string, updates: Partial<ErrorReport>): Promise<void> {
    // 1. Update in local storage
    const local = reportService.getLocalReports();
    const updatedLocal = local.map((r) => {
      if (r.id === reportId) {
        return {
          ...r,
          ...updates,
          adminNote: updates.adminNote !== undefined ? updates.adminNote : r.adminNote,
          status: updates.status || r.status,
          resolvedAt: updates.resolvedAt !== undefined ? updates.resolvedAt : r.resolvedAt,
        };
      }
      return r;
    });
    localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(updatedLocal));

    // 2. Update in Supabase
    if (isSupabaseConfigured && supabase) {
      try {
        const payload: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };
        if (updates.status) payload.status = updates.status;
        if (updates.adminNote !== undefined) payload.admin_note = updates.adminNote;
        if (updates.type) payload.type = updates.type;
        if (updates.description !== undefined) payload.description = updates.description;
        if (updates.questionText) payload.question_text = updates.questionText;
        if (updates.resolvedAt !== undefined) payload.resolved_at = updates.resolvedAt;

        const { error } = await supabase
          .from('error_reports')
          .update(payload)
          .eq('id', reportId);

        if (error) {
          console.warn('Failed updating error_reports in Supabase (local update succeeded):', error);
        }
      } catch (err) {
        console.warn('Supabase update report warning (local update succeeded):', err);
      }
    }
  },

  getLocalReports(): ErrorReport[] {
    try {
      const raw = localStorage.getItem(LOCAL_REPORTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },
};
