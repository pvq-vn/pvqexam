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
          question_text: newReport.questionText,
          type: newReport.type,
          description: newReport.description,
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
            questionText: d.question_text,
            type: d.type as ReportType,
            description: d.description,
            status: d.status as ReportStatus,
            createdAt: d.created_at,
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
          return merged;
        }
      } catch (err) {
        console.warn('Supabase fetch reports warning:', err);
      }
    }

    return local;
  },

  /**
   * Updates status of a report (e.g. 'reviewing', 'resolved', 'rejected').
   */
  async updateReportStatus(reportId: string, status: ReportStatus, adminNote?: string): Promise<void> {
    return reportService.updateReport(reportId, { status, adminNote });
  },

  /**
   * Updates any fields of a report and persists to Supabase and localStorage.
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
        if (updates.description) payload.description = updates.description;
        if (updates.questionText) payload.question_text = updates.questionText;

        const { error } = await supabase
          .from('error_reports')
          .update(payload)
          .eq('id', reportId);

        if (error) {
          console.warn('Failed updating error_reports in Supabase:', error);
          throw error;
        }
      } catch (err) {
        console.warn('Supabase update report error:', err);
        throw err;
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
