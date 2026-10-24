import { UserNotification } from '../types/quiz';
import { supabase, isSupabaseConfigured } from './supabase';

const LOCAL_NOTIFICATIONS_KEY = 'hust_quiz_user_notifications';

export const notificationService = {
  /**
   * Retrieves notifications for current user (by userId or userEmail, or guest).
   */
  async getNotifications(userId?: string, userEmail?: string): Promise<UserNotification[]> {
    const local = notificationService.getLocalNotifications();

    const isTargetUser = (n: UserNotification) => {
      if (userEmail && n.userEmail) {
        return n.userEmail.toLowerCase() === userEmail.toLowerCase();
      }
      if (userId && n.userId) {
        return n.userId === userId;
      }
      if (userEmail || userId) {
        return false;
      }
      // Guest mode (neither userId nor userEmail provided)
      return !n.userId && !n.userEmail;
    };

    const filteredLocal = local.filter(isTargetUser);

    if (isSupabaseConfigured && supabase && userId && !userId.startsWith('local-')) {
      try {
        const { data, error } = await supabase
          .from('user_notifications')
          .select('*')
          .or(`user_id.eq.${userId}${userEmail ? `,user_email.eq.${userEmail}` : ''}`)
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          const remoteList: UserNotification[] = data.map((d: any) => ({
            id: d.id,
            userId: d.user_id,
            userEmail: d.user_email,
            reportId: d.report_id,
            subjectCode: d.subject_code,
            seed: d.seed,
            questionIndex: d.question_index,
            attemptId: d.attempt_id,
            message: d.message,
            adminNote: d.admin_note,
            isRead: Boolean(d.is_read),
            createdAt: d.created_at,
          }));

          const seen = new Set<string>();
          const merged: UserNotification[] = [];
          [...remoteList, ...filteredLocal].forEach((n) => {
            if (!seen.has(n.id) && isTargetUser(n)) {
              seen.add(n.id);
              merged.push(n);
            }
          });
          return merged;
        }
      } catch (err) {
        console.warn('Error fetching notifications from Supabase:', err);
      }
    }

    return filteredLocal;
  },

  /**
   * Alias for getNotifications.
   */
  async getUserNotifications(userId?: string, userEmail?: string): Promise<UserNotification[]> {
    return notificationService.getNotifications(userId, userEmail);
  },

  /**
   * Creates a notification for a user when their report is processed.
   * Enforces idempotency so multiple clicks do not generate duplicate notifications.
   */
  async createNotification(
    data: Omit<UserNotification, 'id' | 'createdAt' | 'isRead'>
  ): Promise<UserNotification | null> {
    const local = notificationService.getLocalNotifications();

    // Idempotency: check if there's already an existing notification for this report
    if (data.reportId) {
      const existing = local.find((n) => n.reportId === data.reportId);
      if (existing && existing.message === data.message) {
        return existing;
      }
    }

    const newNotif: UserNotification = {
      ...data,
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    // Save to local
    notificationService.saveLocalNotifications([newNotif, ...local]);

    // Save to Supabase
    if (isSupabaseConfigured && supabase) {
      try {
        const isValidUuid = (val?: string) =>
          typeof val === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

        const { error } = await supabase.from('user_notifications').insert({
          id: newNotif.id,
          user_id: isValidUuid(newNotif.userId) ? newNotif.userId : null,
          user_email: newNotif.userEmail || null,
          report_id: newNotif.reportId || null,
          subject_code: newNotif.subjectCode,
          seed: newNotif.seed,
          question_index: newNotif.questionIndex || null,
          attempt_id: newNotif.attemptId || null,
          message: newNotif.message,
          admin_note: newNotif.adminNote || null,
          is_read: false,
          created_at: newNotif.createdAt,
        });

        if (error) {
          console.warn('Failed creating user_notification in Supabase:', error);
        }
      } catch (err) {
        console.warn('Network error inserting user_notification:', err);
      }
    }

    return newNotif;
  },

  /**
   * Marks a notification as read.
   */
  async markAsRead(notificationId: string): Promise<void> {
    // 1. Update in local storage
    const local = notificationService.getLocalNotifications();
    const updated = local.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n));
    notificationService.saveLocalNotifications(updated);

    // 2. Update in Supabase
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('user_notifications')
          .update({ is_read: true })
          .eq('id', notificationId);
      } catch (err) {
        console.warn('Failed marking notification as read in Supabase:', err);
      }
    }
  },

  getLocalNotifications(): UserNotification[] {
    try {
      const raw = localStorage.getItem(LOCAL_NOTIFICATIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  saveLocalNotifications(list: UserNotification[]): void {
    try {
      localStorage.setItem(LOCAL_NOTIFICATIONS_KEY, JSON.stringify(list.slice(0, 100)));
    } catch {
      // ignore
    }
  },
};
