import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { historyService } from '../services/historyService';
import { authService, UserProfile } from '../services/authService';
import { notificationService } from '../services/notificationService';
import { QuizAttempt, UserNotification } from '../types/quiz';
import {
  History,
  Eye,
  RefreshCw,
  Calendar,
  Clock,
  Award,
  Trash2,
  Bell,
  CheckCircle,
  X,
} from 'lucide-react';

interface HistoryPageProps {
  currentUser?: UserProfile | null;
  onReopenAttempt: (attempt: QuizAttempt, targetQuestionId?: string) => void;
  onNavigateHome: () => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  currentUser: propUser,
  onReopenAttempt,
  onNavigateHome,
}) => {
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(propUser || null);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setLoading(true);
      const activeUser = propUser || (await authService.getCurrentUser());
      if (!isMounted) return;
      setUser(activeUser);

      const [attemptData, notifData] = await Promise.all([
        historyService.getAttempts(activeUser?.id),
        notificationService.getUserNotifications(activeUser?.id, activeUser?.email),
      ]);
      if (!isMounted) return;
      setAttempts(attemptData);
      setNotifications(notifData);
      setLoading(false);
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [propUser, propUser?.id, propUser?.email]);

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  const [confirmDelete, setConfirmDelete] = useState<
    | { type: 'single'; attemptId: string; title: string }
    | { type: 'clear' }
    | null
  >(null);

  const handleClearHistory = () => {
    setConfirmDelete({ type: 'clear' });
  };

  const handleDeleteSingleAttempt = (attempt: QuizAttempt) => {
    setConfirmDelete({
      type: 'single',
      attemptId: attempt.id,
      title: `${attempt.subjectCode} - ${attempt.subjectName} (Mã đề: ${attempt.seed})`,
    });
  };

  const handleExecuteDelete = async () => {
    if (!confirmDelete) return;

    if (confirmDelete.type === 'clear') {
      historyService.clearLocalHistory(user?.id);
      setAttempts([]);
    } else if (confirmDelete.type === 'single') {
      await historyService.deleteAttempt(confirmDelete.attemptId, user?.id);
      setAttempts((prev) => prev.filter((a) => a.id !== confirmDelete.attemptId));
    }
    setConfirmDelete(null);
  };

  const handleOpenNotificationAttempt = async (n: UserNotification) => {
    await notificationService.markAsRead(n.id);
    setNotifications((prev) =>
      prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item))
    );

    // Look for matching attempt in local list first, or fallback to historyService
    let target =
      attempts.find((a) => a.id === n.attemptId) ||
      attempts.find((a) => n.seed && n.seed !== 'UNKNOWN' && a.seed.toUpperCase() === n.seed.toUpperCase());

    // Fallback: if not found by seed/attemptId, search by subjectCode among user's attempts
    if (!target && n.subjectCode) {
      const subjectAttempts = attempts.filter(
        (a) => a.subjectCode.toLowerCase() === n.subjectCode.toLowerCase()
      );
      if (subjectAttempts.length > 0) {
        target = subjectAttempts[0];
      }
    }

    if (target) {
      let targetQId: string | undefined;
      if (n.questionIndex && target.questions && target.questions[n.questionIndex - 1]) {
        targetQId = String(target.questions[n.questionIndex - 1].id);
      }
      onReopenAttempt(target, targetQId);
    } else {
      // Reopen in review mode directly by seed or subject
      const seedParam = n.seed && n.seed !== 'UNKNOWN' ? `&seed=${n.seed}` : '';
      window.location.hash = `#/quiz/${n.subjectCode}?review=true${seedParam}`;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <History size={26} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100">
              Lịch sử làm bài thi
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {user
                ? `Tài khoản: ${user.fullName || user.email}`
                : 'Chế độ khách (Lưu trên trình duyệt)'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-center">
          {user && (
            <button
              type="button"
              onClick={() => setShowNotificationModal(true)}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 text-xs font-semibold flex items-center gap-1.5 transition-colors relative cursor-pointer shadow-xs"
            >
              <Bell
                size={14}
                className={
                  notifications.filter((n) => !n.isRead).length > 0
                    ? 'text-blue-600 dark:text-blue-400'
                    : ''
                }
              />
              <span>Thông báo</span>
              {notifications.filter((n) => !n.isRead).length > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-600 text-white font-extrabold animate-pulse">
                  {notifications.filter((n) => !n.isRead).length}
                </span>
              ) : notifications.length > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                  {notifications.length}
                </span>
              ) : null}
            </button>
          )}

          {attempts.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-rose-200 dark:hover:border-rose-900 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 size={14} /> Xóa tất cả
            </button>
          )}
        </div>
      </div>

      {/* Notifications Modal (Moved to top button & Portaled to body to never obstruct history list) */}
      {showNotificationModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 overscroll-contain animate-in fade-in duration-150"
            onClick={() => setShowNotificationModal(false)}
          >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 space-y-4 animate-in zoom-in-95 text-slate-900 dark:text-slate-100 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Bell size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                    Thông báo phản hồi báo lỗi
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {notifications.filter((n) => !n.isRead).length > 0
                      ? `${notifications.filter((n) => !n.isRead).length} thông báo chưa đọc`
                      : 'Không có thông báo mới'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {notifications.filter((n) => !n.isRead).length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      for (const n of notifications) {
                        if (!n.isRead) {
                          await notificationService.markAsRead(n.id);
                        }
                      }
                      setNotifications((prev) =>
                        prev.map((item) => ({ ...item, isRead: true }))
                      );
                    }}
                    className="px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Đánh dấu tất cả đã đọc
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowNotificationModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto space-y-3 flex-1 pr-1">
              {notifications.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  Bạn chưa có thông báo nào từ hệ thống.
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                      n.isRead
                        ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-80'
                        : 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 shadow-2xs'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200">
                          {n.subjectCode}
                        </span>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          Mã đề: <strong className="font-mono">{n.seed}</strong>
                        </span>
                        {!n.isRead && (
                          <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                        {n.message}
                      </p>
                      {n.adminNote && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                          Lời nhắn admin: &quot;{n.adminNote}&quot;
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setShowNotificationModal(false);
                          handleOpenNotificationAttempt(n);
                        }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                      >
                        <Eye size={13} /> Mở xem câu hỏi này
                      </button>
                      {!n.isRead && (
                        <button
                          type="button"
                          onClick={async () => {
                            await notificationService.markAsRead(n.id);
                            setNotifications((prev) =>
                              prev.map((item) =>
                                item.id === n.id ? { ...item, isRead: true } : item
                              )
                            );
                          }}
                          className="px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Đã đọc
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Attempts List */}
      {loading ? (
        <div className="p-12 text-center text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          Đang tải lịch sử...
        </div>
      ) : attempts.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-3">
          <Award size={48} className="text-slate-300 dark:text-slate-700 mx-auto" />
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
            Chưa có bài thi nào
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Hãy bắt đầu làm một bài kiểm tra để theo dõi tiến độ và xem lại kết quả chi tiết tại đây.
          </p>
          <button
            type="button"
            onClick={onNavigateHome}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-sm transition-colors"
          >
            Làm bài ngay
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {attempts.map((attempt) => (
            <div
              key={attempt.id}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 shadow-sm hover:shadow transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 rounded font-mono font-bold text-xs">
                    {attempt.subjectCode}
                  </span>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                    {attempt.subjectName}
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <Calendar size={13} /> {formatDate(attempt.submittedAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={13} /> {formatSeconds(attempt.timeSpentSeconds)}
                  </span>
                  <span>
                    Mã đề: <strong className="font-mono text-slate-700 dark:text-slate-300">{attempt.seed}</strong>
                  </span>
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-300 pt-0.5">
                  Đúng <strong>{attempt.correctCount}</strong> / {attempt.totalScoredQuestions} câu trắc nghiệm
                  {attempt.essayCount > 0 && ` + ${attempt.essayCount} câu tự luận`}
                </div>
              </div>

              {/* Score and Action */}
              <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                <div className="text-right">
                  <div
                    className={`text-2xl sm:text-3xl font-black ${
                      attempt.score10 >= 8
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : attempt.score10 >= 5
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {attempt.score10.toFixed(2)}
                  </div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">
                    Điểm / 10
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onReopenAttempt(attempt)}
                  className="px-3.5 py-2 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <Eye size={14} /> Xem lại
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteSingleAttempt(attempt)}
                  className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                  title="Xóa bài thi này"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Custom Confirmation Modal (Portaled to body to cover full screen evenly) */}
      {confirmDelete &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 overscroll-contain animate-in fade-in duration-150"
            onClick={() => setConfirmDelete(null)}
          >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full p-6 space-y-4 animate-in zoom-in-95 text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                {confirmDelete.type === 'clear'
                  ? 'Xóa toàn bộ lịch sử?'
                  : 'Xóa bài thi khỏi lịch sử?'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {confirmDelete.type === 'clear'
                  ? 'Bạn có chắc chắn muốn xóa toàn bộ lịch sử làm bài trên thiết bị này? Thao tác này không thể hoàn tác.'
                  : `Bạn có chắc chắn muốn xóa bài thi này khỏi lịch sử? Mã đề liên kết sẽ bị gỡ bỏ.`}
              </p>
              {confirmDelete.type === 'single' && (
                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-[11px] font-mono text-slate-700 dark:text-slate-300">
                  {confirmDelete.title}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md transition-colors cursor-pointer"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

