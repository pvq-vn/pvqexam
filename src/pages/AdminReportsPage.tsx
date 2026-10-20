import React, { useState, useEffect } from 'react';
import { reportService } from '../services/reportService';
import { userService, UserAccountProfile } from '../services/userService';
import { ErrorReport, ReportStatus, ReportType, QuizAttempt } from '../types/quiz';
import { SUBJECT_CATALOG } from '../data/subjectCatalog';
import { canonicalizeExamPath } from '../data/dataLoader';
import {
  ShieldAlert,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  Info,
  Calendar,
  Mail,
  Users,
  Search,
  Check,
  X,
  Sliders,
  History,
  FileText,
  Edit3,
  Save,
  UserCheck,
  UserX,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface AdminReportsPageProps {
  onNavigateHome?: () => void;
}

export const AdminReportsPage: React.FC<AdminReportsPageProps> = () => {
  const [activeTab, setActiveTab] = useState<'reports' | 'users'>('reports');

  // Reports state
  const [reports, setReports] = useState<ErrorReport[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchReportQuery, setSearchReportQuery] = useState<string>('');
  const [loadingReports, setLoadingReports] = useState(true);

  // Edit Report Modal state
  const [editingReport, setEditingReport] = useState<ErrorReport | null>(null);
  const [editStatus, setEditStatus] = useState<ReportStatus>('open');
  const [editAdminNote, setEditAdminNote] = useState<string>('');
  const [editQuestionText, setEditQuestionText] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editType, setEditType] = useState<ReportType>('wrong_answer');
  const [savingReport, setSavingReport] = useState(false);
  const [reportSaveSuccess, setReportSaveSuccess] = useState(false);

  // Users state
  const [users, setUsers] = useState<UserAccountProfile[]>([]);
  const [searchUserQuery, setSearchUserQuery] = useState<string>('');
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Permission Modal state
  const [permissionUser, setPermissionUser] = useState<UserAccountProfile | null>(null);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [permissionSaveSuccess, setPermissionSaveSuccess] = useState(false);

  // History Modal state
  const [historyUser, setHistoryUser] = useState<UserAccountProfile | null>(null);
  const [userAttempts, setUserAttempts] = useState<QuizAttempt[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null);

  // Load Reports
  useEffect(() => {
    let isMounted = true;
    reportService.getReports().then((data) => {
      if (isMounted) {
        setReports(data);
        setLoadingReports(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Load Users
  const loadAllUsers = () => {
    setLoadingUsers(true);
    userService.getAllUsers().then((data) => {
      setUsers(data);
      setLoadingUsers(false);
    });
  };

  useEffect(() => {
    loadAllUsers();
  }, []);

  // Quick update report status
  const handleUpdateStatus = async (reportId: string, status: ReportStatus) => {
    await reportService.updateReportStatus(reportId, status);
    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? { ...r, status } : r))
    );
  };

  // Open Direct Edit Modal
  const openEditModal = (report: ErrorReport) => {
    setEditingReport(report);
    setEditStatus(report.status);
    setEditAdminNote(report.adminNote || '');
    setEditQuestionText(report.questionText || '');
    setEditDescription(report.description || '');
    setEditType(report.type);
    setReportSaveSuccess(false);
  };

  // Save Direct Edit to Database
  const handleSaveReportEdit = async () => {
    if (!editingReport) return;
    setSavingReport(true);
    try {
      await reportService.updateReport(editingReport.id, {
        status: editStatus,
        adminNote: editAdminNote,
        questionText: editQuestionText,
        description: editDescription,
        type: editType,
      });

      // Update state
      setReports((prev) =>
        prev.map((r) =>
          r.id === editingReport.id
            ? {
                ...r,
                status: editStatus,
                adminNote: editAdminNote,
                questionText: editQuestionText,
                description: editDescription,
                type: editType,
              }
            : r
        )
      );

      setReportSaveSuccess(true);
      setTimeout(() => {
        setEditingReport(null);
        setReportSaveSuccess(false);
      }, 1000);
    } catch (err) {
      console.error('Lỗi khi lưu báo lỗi:', err);
      alert('Không thể lưu cập nhật báo lỗi vào database. Vui lòng thử lại!');
    } finally {
      setSavingReport(false);
    }
  };

  // Toggle user approval
  const handleToggleApproval = async (user: UserAccountProfile) => {
    const nextApproval = !user.isApproved;
    try {
      await userService.updateUserApproval(user.id, nextApproval);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isApproved: nextApproval } : u))
      );
    } catch (err) {
      console.error('Lỗi khi cập nhật trạng thái duyệt người dùng:', err);
      alert('Không thể cập nhật trạng thái duyệt. Vui lòng thử lại!');
    }
  };

  // Open Permissions Modal
  const openPermissionsModal = (user: UserAccountProfile) => {
    setPermissionUser(user);
    setSelectedSources([...(user.allowedExamSources || [])]);
    setPermissionSaveSuccess(false);
  };

  // Toggle source in Permissions Modal
  const handleToggleSource = (filePath: string) => {
    const canonical = canonicalizeExamPath(filePath).toLowerCase();
    const exists = selectedSources.some(
      (s) => canonicalizeExamPath(s).toLowerCase() === canonical
    );

    if (exists) {
      setSelectedSources((prev) =>
        prev.filter((s) => canonicalizeExamPath(s).toLowerCase() !== canonical)
      );
    } else {
      setSelectedSources((prev) => [...prev, filePath]);
    }
  };

  // Select/Deselect All Sources
  const handleSelectAllSources = () => {
    const allPaths: string[] = [];
    SUBJECT_CATALOG.forEach((subj) => {
      subj.examFiles.forEach((file) => {
        allPaths.push(file.filePath);
      });
    });
    setSelectedSources(allPaths);
  };

  const handleClearAllSources = () => {
    setSelectedSources([]);
  };

  // Save Permissions to Database
  const handleSavePermissions = async () => {
    if (!permissionUser) return;
    setSavingPermissions(true);
    try {
      await userService.updateUserExamSources(permissionUser.id, selectedSources);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === permissionUser.id ? { ...u, allowedExamSources: selectedSources } : u
        )
      );
      setPermissionSaveSuccess(true);
      setTimeout(() => {
        setPermissionUser(null);
        setPermissionSaveSuccess(false);
      }, 1200);
    } catch (err) {
      console.error('Lỗi khi lưu phân quyền nguồn đề:', err);
      alert('Không thể lưu phân quyền nguồn đề vào database. Vui lòng thử lại!');
    } finally {
      setSavingPermissions(false);
    }
  };

  // Open User Quiz Attempts History
  const openHistoryModal = async (user: UserAccountProfile) => {
    setHistoryUser(user);
    setLoadingHistory(true);
    setUserAttempts([]);
    setExpandedAttemptId(null);
    try {
      const attempts = await userService.getUserQuizAttempts(user.id);
      setUserAttempts(attempts);
    } catch (err) {
      console.error('Lỗi khi tải lịch sử người dùng:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Filtered reports
  const filteredReports = reports.filter((r) => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (searchReportQuery.trim()) {
      const q = searchReportQuery.toLowerCase();
      const matchSubject = r.subjectCode?.toLowerCase().includes(q);
      const matchText = r.questionText?.toLowerCase().includes(q);
      const matchDesc = r.description?.toLowerCase().includes(q);
      const matchEmail = r.userEmail?.toLowerCase().includes(q);
      return matchSubject || matchText || matchDesc || matchEmail;
    }
    return true;
  });

  // Filtered users
  const filteredUsers = users.filter((u) => {
    if (!searchUserQuery.trim()) return true;
    const q = searchUserQuery.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      (u.fullName && u.fullName.toLowerCase().includes(q))
    );
  });

  const getStatusBadge = (status: ReportStatus) => {
    switch (status) {
      case 'open':
        return (
          <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 rounded-full text-xs font-semibold flex items-center gap-1">
            <Clock size={12} /> Chưa xử lý (Mới)
          </span>
        );
      case 'reviewing':
        return (
          <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 rounded-full text-xs font-semibold flex items-center gap-1">
            <AlertTriangle size={12} /> Đang kiểm tra
          </span>
        );
      case 'resolved':
        return (
          <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-full text-xs font-semibold flex items-center gap-1">
            <CheckCircle size={12} /> Đã sửa
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full text-xs font-semibold flex items-center gap-1">
            <XCircle size={12} /> Bỏ qua / Không lỗi
          </span>
        );
    }
  };

  const getReportTypeLabel = (type: string) => {
    switch (type) {
      case 'wrong_answer':
        return 'Sai đáp án chuẩn';
      case 'wrong_content':
        return 'Sai nội dung câu hỏi';
      case 'missing_image':
        return 'Thiếu hình ảnh / link Drive hỏng';
      case 'format_error':
        return 'Lỗi định dạng';
      case 'wrong_explanation':
        return 'Giải thích sai';
      default:
        return 'Lỗi khác';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      {/* Top Banner / Dashboard Navigation */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 shadow-xs">
            <ShieldAlert size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Bảng điều khiển Quản trị (Admin)
              </h1>
              <span className="px-2 py-0.5 bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded-md text-[10px] font-bold">
                Quyền Admin
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Quản lý báo lỗi, phê duyệt tài khoản, phân quyền nguồn đề thi và theo dõi lịch sử
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl self-start md:self-center text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'reports'
                ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ShieldAlert size={14} />
            <span>Báo lỗi câu hỏi</span>
            {reports.filter((r) => r.status === 'open').length > 0 && (
              <span className="px-1.5 py-0.2 bg-rose-600 text-white rounded-full text-[10px] font-bold">
                {reports.filter((r) => r.status === 'open').length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'users'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users size={14} />
            <span>Tài khoản & Nguồn đề</span>
            <span className="px-1.5 py-0.2 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-full text-[10px] font-bold">
              {users.length}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: BÁO LỖI CÂU HỎI & CHỈNH SỬA TRỰC TIẾP VÀO DATABASE */}
      {/* ========================================================================= */}
      {activeTab === 'reports' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Principle Info Banner */}
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
            <Info size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Quyền Admin:</strong> Bạn có quyền chỉnh sửa trực tiếp thông tin báo lỗi, phân loại, ghi chú giải pháp và trạng thái lưu thẳng vào cơ sở dữ liệu Supabase.
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchReportQuery}
                onChange={(e) => setSearchReportQuery(e.target.value)}
                placeholder="Tìm theo môn, nội dung câu hỏi, mô tả hoặc email..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold shrink-0">
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'open', label: 'Mới' },
                { id: 'reviewing', label: 'Đang xử lý' },
                { id: 'resolved', label: 'Đã sửa' },
                { id: 'rejected', label: 'Bỏ qua' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterStatus(tab.id)}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    filterStatus === tab.id
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reports List */}
          {loadingReports ? (
            <div className="p-12 text-center text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse">
              Đang tải danh sách báo lỗi từ cơ sở dữ liệu...
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-2">
              <CheckCircle size={40} className="text-emerald-500 mx-auto" />
              <h3 className="font-bold text-slate-800 dark:text-slate-100">
                Không tìm thấy báo lỗi nào
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tất cả câu hỏi hiện tại đều hoạt động ổn định hoặc chưa có phản hồi trong bộ lọc này.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredReports.map((report) => (
                <div
                  key={report.id}
                  className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 transition-all hover:border-slate-300 dark:hover:border-slate-700"
                >
                  {/* Card Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 font-mono font-bold text-xs rounded">
                        {report.subjectCode}
                      </span>
                      <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                        Câu hỏi #{report.questionId}
                      </span>
                      <span className="text-xs text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-2.5 py-0.5 rounded font-medium border border-rose-200 dark:border-rose-800">
                        {getReportTypeLabel(report.type)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {getStatusBadge(report.status)}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-2.5 text-xs sm:text-sm">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80">
                      <strong className="block text-slate-900 dark:text-slate-100 mb-1 text-xs">
                        Nội dung câu hỏi:
                      </strong>
                      <p className="leading-relaxed whitespace-pre-wrap">{report.questionText}</p>
                    </div>

                    <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl text-rose-950 dark:text-rose-200 border border-rose-100 dark:border-rose-900/50">
                      <strong className="block text-rose-900 dark:text-rose-300 mb-1 text-xs">
                        Mô tả lỗi từ người làm bài:
                      </strong>
                      <p className="leading-relaxed font-medium">{report.description}</p>
                    </div>

                    {report.adminNote && (
                      <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl text-blue-950 dark:text-blue-200 border border-blue-100 dark:border-blue-900/50">
                        <strong className="block text-blue-900 dark:text-blue-300 mb-1 text-xs">
                          Ghi chú của Admin:
                        </strong>
                        <p className="leading-relaxed">{report.adminNote}</p>
                      </div>
                    )}
                  </div>

                  {/* Actions & Meta */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Calendar size={13} /> {new Date(report.createdAt).toLocaleString('vi-VN')}
                      </span>
                      {report.userEmail && (
                        <span className="flex items-center gap-1">
                          <Mail size={13} /> {report.userEmail}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                      {/* Direct Edit Button */}
                      <button
                        type="button"
                        onClick={() => openEditModal(report)}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                      >
                        <Edit3 size={13} /> Chỉnh sửa trực tiếp
                      </button>

                      {/* Quick status actions */}
                      {report.status !== 'reviewing' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(report.id, 'reviewing')}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 font-semibold transition-colors cursor-pointer"
                        >
                          Đang xử lý
                        </button>
                      )}

                      {report.status !== 'resolved' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(report.id, 'resolved')}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs transition-colors cursor-pointer"
                        >
                          Đã sửa
                        </button>
                      )}

                      {report.status !== 'rejected' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(report.id, 'rejected')}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold transition-colors cursor-pointer"
                        >
                          Bỏ qua
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: QUẢN LÝ TÀI KHOẢN, PHÊ DUYỆT & CẤP NGUỒN ĐỀ THI */}
      {/* ========================================================================= */}
      {activeTab === 'users' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Rules Explanation Banner */}
          <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
            <Info size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed space-y-1">
              <p>
                <strong>Cơ chế bảo mật nguồn đề:</strong> Những người dùng chưa đăng nhập hoặc chưa được bạn duyệt sẽ thấy phần chọn nguồn đề <strong>rỗng (Trống)</strong> mà không có thông báo gì.
              </p>
              <p>
                Tài khoản được bạn duyệt chỉ thấy hiển thị <strong>1 bộ đề duy nhất</strong> (hệ thống tự động gộp tất cả các nguồn đề bạn cấp và xáo trộn câu hỏi cho người dùng). Chỉ tài khoản admin mới thấy tên chi tiết của các nguồn đề.
              </p>
            </div>
          </div>

          {/* User Search & Reload */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchUserQuery}
                onChange={(e) => setSearchUserQuery(e.target.value)}
                placeholder="Tìm kiếm tài khoản theo email hoặc họ tên..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={loadAllUsers}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer shrink-0"
            >
              Làm mới danh sách
            </button>
          </div>

          {/* Users Table / Cards */}
          {loadingUsers ? (
            <div className="p-12 text-center text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse">
              Đang tải danh sách tài khoản từ cơ sở dữ liệu...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-2">
              <Users size={40} className="text-slate-400 mx-auto" />
              <h3 className="font-bold text-slate-800 dark:text-slate-100">
                Không tìm thấy tài khoản nào
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chưa có tài khoản nào đăng ký hoặc không khớp với từ khóa tìm kiếm.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredUsers.map((user) => {
                const isUserAdmin = user.role === 'admin';
                return (
                  <div
                    key={user.id}
                    className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-slate-300 dark:hover:border-slate-700"
                  >
                    {/* User Info */}
                    <div className="flex items-start sm:items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-base shadow-xs shrink-0">
                        {user.fullName ? user.fullName[0].toUpperCase() : user.email[0].toUpperCase()}
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                            {user.fullName || user.email.split('@')[0]}
                          </h3>
                          {isUserAdmin ? (
                            <span className="px-2 py-0.5 bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded text-[10px] font-bold">
                              Quản trị viên (Admin)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded text-[10px] font-semibold">
                              Người dùng
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-400">
                          <span>
                            Ngày tạo: {new Date(user.createdAt || Date.now()).toLocaleDateString('vi-VN')}
                          </span>
                          <span>•</span>
                          <span className="text-blue-600 dark:text-blue-400 font-medium">
                            {user.allowedExamSources?.length || 0} nguồn đề được cấp
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status & Actions */}
                    <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
                      {/* Approval Status Toggle */}
                      {isUserAdmin ? (
                        <span className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-1.5">
                          <UserCheck size={14} /> Toàn quyền Admin
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleApproval(user)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                            user.isApproved
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 hover:bg-rose-100 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-300'
                              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 hover:bg-emerald-600 hover:text-white'
                          }`}
                          title={
                            user.isApproved
                              ? 'Nhấn để thu hồi quyền truy cập đề thi của tài khoản này'
                              : 'Nhấn để phê duyệt tài khoản này làm bài thi'
                          }
                        >
                          {user.isApproved ? (
                            <>
                              <UserCheck size={14} /> Đã duyệt (Bấm để hủy)
                            </>
                          ) : (
                            <>
                              <UserX size={14} /> Chưa duyệt (Bấm để duyệt)
                            </>
                          )}
                        </button>
                      )}

                      {/* Phân quyền nguồn đề button */}
                      <button
                        type="button"
                        onClick={() => openPermissionsModal(user)}
                        className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Tick chọn nguồn đề cụ thể của từng môn học cho tài khoản này"
                      >
                        <Sliders size={14} /> Cấp nguồn đề
                      </button>

                      {/* Xem lịch sử thi button */}
                      <button
                        type="button"
                        onClick={() => openHistoryModal(user)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Xem lịch sử và kết quả bài thi của người dùng này"
                      >
                        <History size={14} /> Lịch sử thi
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CHỈNH SỬA TRỰC TIẾP BÁO LỖI VÀO DATABASE */}
      {/* ========================================================================= */}
      {editingReport && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setEditingReport(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full my-6 overflow-hidden animate-in fade-in zoom-in-95 text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Edit3 size={18} className="text-rose-400" />
                  Chỉnh sửa trực tiếp báo lỗi #{editingReport.questionId}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Môn {editingReport.subjectCode} · Dữ liệu sẽ được ghi trực tiếp vào Supabase
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingReport(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {reportSaveSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
                  <Check size={16} /> Đã cập nhật và ghi trực tiếp vào Database thành công!
                </div>
              )}

              {/* Status & Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    Trạng thái xử lý
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as ReportStatus)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold outline-none focus:border-rose-500"
                  >
                    <option value="open">Chưa xử lý (Mới)</option>
                    <option value="reviewing">Đang kiểm tra</option>
                    <option value="resolved">Đã sửa</option>
                    <option value="rejected">Bỏ qua / Không lỗi</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    Phân loại lỗi
                  </label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as ReportType)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold outline-none focus:border-rose-500"
                  >
                    <option value="wrong_answer">Sai đáp án chuẩn</option>
                    <option value="wrong_content">Sai nội dung câu hỏi</option>
                    <option value="missing_image">Thiếu hình ảnh / link Drive hỏng</option>
                    <option value="format_error">Lỗi định dạng</option>
                    <option value="wrong_explanation">Giải thích sai</option>
                    <option value="other">Lỗi khác</option>
                  </select>
                </div>
              </div>

              {/* Ghi chú của Admin */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Ghi chú của Admin / Hướng khắc phục
                </label>
                <textarea
                  rows={3}
                  value={editAdminNote}
                  onChange={(e) => setEditAdminNote(e.target.value)}
                  placeholder="VD: Đã sửa đáp án sang C trong file ngân hàng đề thi..."
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm outline-none focus:border-rose-500"
                />
              </div>

              {/* Question Text */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Nội dung câu hỏi
                </label>
                <textarea
                  rows={3}
                  value={editQuestionText}
                  onChange={(e) => setEditQuestionText(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-mono outline-none focus:border-rose-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Mô tả của người báo
                </label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm outline-none focus:border-rose-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingReport(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={savingReport}
                onClick={handleSaveReportEdit}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer"
              >
                <Save size={14} />
                {savingReport ? 'Đang lưu vào Database...' : 'Lưu vào Database'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: PHÂN QUYỀN NGUỒN ĐỀ THI CHO TỪNG TÀI KHOẢN */}
      {/* ========================================================================= */}
      {permissionUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setPermissionUser(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full my-6 overflow-hidden animate-in fade-in zoom-in-95 text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-900 to-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Sliders size={18} className="text-blue-400" />
                  Cấp nguồn đề thi cho tài khoản
                </h3>
                <p className="text-xs text-blue-200 mt-0.5">
                  {permissionUser.fullName} ({permissionUser.email})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPermissionUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                Đã chọn: <strong className="text-blue-600 dark:text-blue-400">{selectedSources.length}</strong> nguồn đề
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllSources}
                  className="px-2.5 py-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg font-bold hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer"
                >
                  Chọn tất cả môn
                </button>
                <button
                  type="button"
                  onClick={handleClearAllSources}
                  className="px-2.5 py-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg font-bold hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer text-rose-600 dark:text-rose-400"
                >
                  Bỏ chọn tất cả
                </button>
              </div>
            </div>

            {/* Subject Sources Tree */}
            <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {permissionSaveSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
                  <Check size={16} /> Đã lưu phân quyền nguồn đề vào cơ sở dữ liệu thành công!
                </div>
              )}

              {SUBJECT_CATALOG.map((subject) => {
                const subjectFiles = subject.examFiles;
                const selectedInSubjectCount = subjectFiles.filter((f) =>
                  selectedSources.some(
                    (s) =>
                      canonicalizeExamPath(s).toLowerCase() ===
                      canonicalizeExamPath(f.filePath).toLowerCase()
                  )
                ).length;

                return (
                  <div
                    key={subject.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-blue-600 text-white font-mono font-bold text-xs rounded">
                          {subject.code}
                        </span>
                        <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100">
                          {subject.name}
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {selectedInSubjectCount}/{subjectFiles.length} nguồn được tick
                      </span>
                    </div>

                    <div className="space-y-2 pl-1">
                      {subjectFiles.map((file) => {
                        const isChecked = selectedSources.some(
                          (s) =>
                            canonicalizeExamPath(s).toLowerCase() ===
                            canonicalizeExamPath(file.filePath).toLowerCase()
                        );

                        return (
                          <label
                            key={file.filePath}
                            className="flex items-start gap-2.5 cursor-pointer select-none text-xs sm:text-sm p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700/50 transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleSource(file.filePath)}
                              className="w-4 h-4 mt-0.5 text-blue-600 rounded focus:ring-blue-500 border-slate-300 dark:border-slate-600 dark:bg-slate-800"
                            />
                            <div className="leading-snug">
                              <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                                {file.label}
                              </span>
                              <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 break-all">
                                {file.filePath}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPermissionUser(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={savingPermissions}
                onClick={handleSavePermissions}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer"
              >
                <Save size={14} />
                {savingPermissions ? 'Đang lưu vào Database...' : 'Lưu phân quyền'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: XEM LỊCH SỬ LÀM BÀI CỦA NGƯỜI DÙNG */}
      {/* ========================================================================= */}
      {historyUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setHistoryUser(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-3xl w-full my-6 overflow-hidden animate-in fade-in zoom-in-95 text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <History size={18} className="text-emerald-400" />
                  Lịch sử làm bài: {historyUser.fullName || historyUser.email}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Email: {historyUser.email} · Xem tất cả các bài thi đã nộp
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {loadingHistory ? (
                <div className="py-12 text-center text-sm text-slate-500 animate-pulse">
                  Đang tải lịch sử làm bài từ Supabase...
                </div>
              ) : userAttempts.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <FileText size={36} className="text-slate-400 mx-auto" />
                  <h4 className="font-bold text-slate-800 dark:text-slate-100">Chưa có bài thi nào</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Người dùng này chưa hoàn thành hoặc chưa nộp bài thi nào lên hệ thống.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {userAttempts.map((attempt) => {
                    const isExpanded = expandedAttemptId === attempt.id;
                    const durationMins = Math.round(attempt.timeSpentSeconds / 60);

                    return (
                      <div
                        key={attempt.id}
                        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 bg-blue-600 text-white font-mono font-bold text-xs rounded">
                              {attempt.subjectCode}
                            </span>
                            <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                              {attempt.subjectName}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-base font-extrabold text-blue-600 dark:text-blue-400">
                              {attempt.score10.toFixed(1)} / 10
                            </span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                              {attempt.correctCount}/{attempt.totalScoredQuestions} câu đúng
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                          <div className="flex flex-wrap items-center gap-3">
                            <span>
                              Ngày thi: {new Date(attempt.submittedAt).toLocaleString('vi-VN')}
                            </span>
                            <span>Thời gian: {durationMins > 0 ? `${durationMins} phút` : `${attempt.timeSpentSeconds}s`}</span>
                            <span>Mã Seed: <code className="font-mono font-bold text-slate-700 dark:text-slate-300">{attempt.seed}</code></span>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedAttemptId(isExpanded ? null : attempt.id)
                            }
                            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            {isExpanded ? (
                              <>
                                Thu gọn chi tiết <ChevronUp size={14} />
                              </>
                            ) : (
                              <>
                                Xem câu hỏi & đáp án ({attempt.questions.length} câu) <ChevronDown size={14} />
                              </>
                            )}
                          </button>
                        </div>

                        {/* Expanded Questions Breakdown */}
                        {isExpanded && (
                          <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2.5 animate-in fade-in duration-150">
                            {attempt.questions.map((q, idx) => {
                              const userAns = attempt.answers[q.id];
                              const correctAnswersStr = (q.correctAnswers || []).join(', ');
                              const isCorrect =
                                q.type !== 'essay' &&
                                (q.correctAnswers || []).some(
                                  (ans) =>
                                    String(userAns || '').trim().toLowerCase() ===
                                    String(ans || '').trim().toLowerCase()
                                );

                              return (
                                <div
                                  key={q.id || idx}
                                  className={`p-3 rounded-lg text-xs space-y-1.5 border ${
                                    q.type === 'essay'
                                      ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                                      : isCorrect
                                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                                      : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-slate-900 dark:text-slate-100">
                                      Câu {idx + 1}:
                                    </span>
                                    <span
                                      className={`px-1.5 py-0.2 rounded font-bold text-[10px] ${
                                        q.type === 'essay'
                                          ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                                          : isCorrect
                                          ? 'bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200'
                                          : 'bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200'
                                      }`}
                                    >
                                      {q.type === 'essay'
                                        ? 'Tự luận'
                                        : isCorrect
                                        ? 'Đúng'
                                        : 'Sai'}
                                    </span>
                                  </div>
                                  <p className="text-slate-800 dark:text-slate-200 line-clamp-2">
                                    {q.text}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-3 text-[11px]">
                                    <span className="font-medium text-slate-600 dark:text-slate-400">
                                      Thí sinh chọn:{' '}
                                      <strong className="font-bold text-slate-900 dark:text-white">
                                        {userAns || '(Chưa làm)'}
                                      </strong>
                                    </span>
                                    {q.type !== 'essay' && (
                                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                                        Đáp án đúng: <strong>{correctAnswersStr}</strong>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryUser(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 text-white font-bold text-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
