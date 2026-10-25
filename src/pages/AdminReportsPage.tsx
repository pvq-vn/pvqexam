import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { reportService } from '../services/reportService';
import { userService, UserAccountProfile } from '../services/userService';
import { examDefinitionService } from '../services/examDefinitionService';
import { notificationService } from '../services/notificationService';
import { authService, UserProfile } from '../services/authService';
import { questionStatsService } from '../services/questionStatsService';
import { historyService } from '../services/historyService';
import {
  Question,
  TimeMode,
  QuestionStat,
  ErrorReport,
  ReportStatus,
  ReportType,
  QuizAttempt,
  ExamDefinition,
  SubjectPermissionTier,
} from '../types/quiz';
import { SUBJECT_CATALOG } from '../data/subjectCatalog';
import { canonicalizeExamPath, loadExamFile } from '../data/dataLoader';
import {
  ShieldAlert,
  Shield,
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
  Save,
  UserCheck,
  UserX,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  BarChart2,
  Award,
  Filter,
  Send,
  Eye,
  RefreshCw,
  Database,
  Trash2,
  Plus,
  CheckSquare,
  Square,
  Lock,
  Globe,
  Sparkles,
  Copy,
  Play,
} from 'lucide-react';

interface AdminReportsPageProps {
  currentUser?: UserProfile | UserAccountProfile | null;
  onNavigateHome?: () => void;
  initialTab?: 'reports' | 'exams' | 'users' | 'questions';
}

interface ExamAggregatedRow {
  exam: ExamDefinition;
  attemptsCount: number;
  uniqueUsersCount: number;
  avgScore: number | null;
  maxScore: number | null;
  minScore: number | null;
  attempts: QuizAttempt[];
}

const formatDateBeforeTime = (isoString?: string | null): string => {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  } catch {
    return String(isoString);
  }
};

export const AdminReportsPage: React.FC<AdminReportsPageProps> = ({
  currentUser: propCurrentUser,
  initialTab,
}) => {
  const parseHashTab = (): 'reports' | 'exams' | 'users' | 'questions' => {
    try {
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      if (hash.includes('tab=exams') || hash.includes('/admin/exams')) return 'exams';
      if (hash.includes('tab=users') || hash.includes('/admin/users')) return 'users';
      if (hash.includes('tab=questions') || hash.includes('/admin/questions')) return 'questions';
      if (hash.includes('tab=reports') || hash.includes('/admin/reports')) return 'reports';
    } catch {}
    return initialTab || 'reports';
  };

  const [activeTab, setActiveTab] = useState<'reports' | 'exams' | 'users' | 'questions'>(parseHashTab);
  const [internalUser, setInternalUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const handleHashChange = () => {
      setActiveTab(parseHashTab());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSwitchTab = (tab: 'reports' | 'exams' | 'users' | 'questions') => {
    setActiveTab(tab);
    window.location.hash = `#/admin?tab=${tab}`;
  };

  useEffect(() => {
    if (!propCurrentUser) {
      authService.getCurrentUser().then(setInternalUser);
    }
  }, [propCurrentUser]);

  const effectiveUser = propCurrentUser || internalUser;

  // =========================================================================
  // TAB 1: REPORTS STATE
  // =========================================================================
  const [reports, setReports] = useState<ErrorReport[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchReportQuery, setSearchReportQuery] = useState<string>('');
  const [loadingReports, setLoadingReports] = useState(true);

  // Resolution Modal state (NO DIRECT DB QUESTION EDITING as per Section 9.2)
  const [editingReport, setEditingReport] = useState<ErrorReport | null>(null);
  const [editStatus, setEditStatus] = useState<ReportStatus>('open');
  const [editAdminNote, setEditAdminNote] = useState<string>('');
  const [savingReport, setSavingReport] = useState(false);
  const [reportSaveSuccess, setReportSaveSuccess] = useState(false);

  // =========================================================================
  // TAB 2: EXAMS & STATS STATE (Section 10)
  // =========================================================================
  const [examDefinitions, setExamDefinitions] = useState<ExamDefinition[]>([]);
  const [allAttempts, setAllAttempts] = useState<QuizAttempt[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);

  // Multi-criteria filters for exams
  const [filterSubjectCode, setFilterSubjectCode] = useState<string>('all');
  const [searchSeedQuery, setSearchSeedQuery] = useState<string>('');
  const [searchCreatorQuery, setSearchCreatorQuery] = useState<string>('');
  const [filterMinScore, setFilterMinScore] = useState<string>('');
  const [filterMaxScore, setFilterMaxScore] = useState<string>('');
  const [filterVisibility, setFilterVisibility] = useState<'all' | 'public' | 'private'>('all');

  // Selected Exam Drilldown & Detail Modals
  const [selectedExamRow, setSelectedExamRow] = useState<ExamAggregatedRow | null>(null);
  const [detailExamRow, setDetailExamRow] = useState<ExamAggregatedRow | null>(null);
  const [editingExamTitle, setEditingExamTitle] = useState<string>('');
  const [savingExamTitle, setSavingExamTitle] = useState(false);
  const [deletingExam, setDeletingExam] = useState<ExamAggregatedRow | null>(null);
  const [inspectingAttempt, setInspectingAttempt] = useState<QuizAttempt | null>(null);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);

  // =========================================================================
  // TAB 3: USERS & PERMISSIONS STATE (Section 5)
  // =========================================================================
  const [users, setUsers] = useState<UserAccountProfile[]>([]);
  const [searchUserQuery, setSearchUserQuery] = useState<string>('');
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Permission Modal state (25%, 50%, 75%, 100% tiers)
  const [permissionUser, setPermissionUser] = useState<UserAccountProfile | null>(null);
  const [userTiers, setUserTiers] = useState<Record<string, SubjectPermissionTier>>({});
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [permissionSaveSuccess, setPermissionSaveSuccess] = useState(false);

  // User History Modal state
  const [historyUser, setHistoryUser] = useState<UserAccountProfile | null>(null);
  const [userAttempts, setUserAttempts] = useState<QuizAttempt[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null);

  // =========================================================================
  // TAB 4: DỮ LIỆU CÂU HỎI & TẠO ĐỀ THI (Admin Question Explorer)
  // =========================================================================
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    SUBJECT_CATALOG[0]?.id || ''
  );
  const [selectedSourceFilePath, setSelectedSourceFilePath] = useState<string>(
    SUBJECT_CATALOG[0]?.examFiles[0]?.filePath || ''
  );
  const [questionsList, setQuestionsList] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [adminQuestionStats, setAdminQuestionStats] = useState<Record<string, QuestionStat>>({});
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string | number>>(new Set());
  const [searchQuestionQuery, setSearchQuestionQuery] = useState('');
  const [filterQuestionStatus, setFilterQuestionStatus] = useState<
    'all' | 'unattempted' | 'attempted' | 'correct' | 'wrong'
  >('all');
  const [filterQuestionScope, setFilterQuestionScope] = useState<string>('all');
  const [copiedAdminSeed, setCopiedAdminSeed] = useState<string | null>(null);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | number | null>(null);
  const [isAdminCustomExamsExpanded, setIsAdminCustomExamsExpanded] = useState<boolean>(false);

  // Custom exam creation modal state
  const [showCreateExamModal, setShowCreateExamModal] = useState(false);
  const [customExamTitle, setCustomExamTitle] = useState('');
  const [customExamSeed, setCustomExamSeed] = useState('');
  const [customExamIsPublic, setCustomExamIsPublic] = useState(false);
  const [creatingCustomExam, setCreatingCustomExam] = useState(false);
  const [createCustomExamSuccess, setCreateCustomExamSuccess] = useState(false);

  // =========================================================================
  // DATA LOADERS
  // =========================================================================
  const loadReports = () => {
    setLoadingReports(true);
    reportService.getReports().then((data) => {
      setReports(data);
      setLoadingReports(false);
    });
  };

  const loadExamsAndStats = () => {
    setLoadingExams(true);
    Promise.all([
      examDefinitionService.getAllExamDefinitions(),
      examDefinitionService.getAllAttemptsForAdmin(),
    ]).then(([defs, atts]) => {
      setExamDefinitions(defs);
      setAllAttempts(atts);
      setLoadingExams(false);
    });
  };

  const loadUsers = () => {
    setLoadingUsers(true);
    userService.getAllUsers().then((data) => {
      setUsers(data);
      setLoadingUsers(false);
    });
  };

  useEffect(() => {
    loadReports();
    loadExamsAndStats();
    loadUsers();
  }, []);

  // Quick update report status
  const handleQuickUpdateStatus = async (reportId: string, status: ReportStatus) => {
    await reportService.updateReportStatus(reportId, status);
    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? { ...r, status } : r))
    );
  };

  // Open Resolution Modal
  const openResolutionModal = (report: ErrorReport) => {
    setEditingReport(report);
    setEditStatus(report.status);
    setEditAdminNote(report.adminNote || '');
    setReportSaveSuccess(false);
  };

  // Save Resolution & Create Notification (Section 9.2 & 9.3)
  const handleSaveResolution = async () => {
    if (!editingReport) return;
    setSavingReport(true);
    try {
      const isResolved = editStatus === 'resolved';
      const resolvedAt = isResolved ? new Date().toISOString() : undefined;

      await reportService.updateReport(editingReport.id, {
        status: editStatus,
        adminNote: editAdminNote,
        resolvedAt: resolvedAt,
      });

      // Send User Notification if marked as resolved or updated
      if (isResolved) {
        // Resolve actual attempt & seed if missing
        let resolvedSeed = editingReport.seed && editingReport.seed !== 'UNKNOWN' ? editingReport.seed : undefined;
        let resolvedAttemptId = editingReport.attemptId;
        let resolvedQIndex = editingReport.questionIndex;

        const candidateAttempt =
          (resolvedAttemptId ? allAttempts.find((a) => a.id === resolvedAttemptId) : undefined) ||
          allAttempts.find(
            (a) =>
              a.subjectCode.toLowerCase() === editingReport.subjectCode.toLowerCase() &&
              (editingReport.userId ? a.userId === editingReport.userId : true)
          );

        if (candidateAttempt) {
          if (!resolvedSeed) resolvedSeed = candidateAttempt.seed;
          if (!resolvedAttemptId) resolvedAttemptId = candidateAttempt.id;
          if (!resolvedQIndex && candidateAttempt.questions) {
            const foundIdx = candidateAttempt.questions.findIndex(
              (q) => String(q.id) === String(editingReport.questionId) || String(q.originalNum) === String(editingReport.originalQuestionId)
            );
            if (foundIdx !== -1) {
              resolvedQIndex = foundIdx + 1;
            }
          }
        }

        const notifMsg = `Câu hỏi số ${resolvedQIndex || 'trong đề'} (Mã đề: ${
          resolvedSeed || 'gốc'
        }) đã được kiểm tra và xử lý. Vào lịch sử làm bài và mở lại đề để kiểm tra.`;

        await notificationService.createNotification({
          userId: editingReport.userId,
          userEmail: editingReport.userEmail,
          reportId: editingReport.id,
          subjectCode: editingReport.subjectCode,
          seed: resolvedSeed || 'UNKNOWN',
          questionIndex: resolvedQIndex,
          attemptId: resolvedAttemptId,
          message: notifMsg,
          adminNote: editAdminNote.trim() ? editAdminNote.trim() : undefined,
        });
      }

      setReports((prev) =>
        prev.map((r) =>
          r.id === editingReport.id
            ? {
                ...r,
                status: editStatus,
                adminNote: editAdminNote,
                resolvedAt: resolvedAt,
              }
            : r
        )
      );

      setReportSaveSuccess(true);
      setTimeout(() => {
        setEditingReport(null);
        setReportSaveSuccess(false);
      }, 900);
    } catch (err) {
      console.error('Lỗi khi lưu xử lý báo lỗi:', err);
      alert('Không thể lưu trạng thái xử lý báo lỗi. Vui lòng thử lại!');
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

  // Open Permissions Modal (Section 5)
  const openPermissionsModal = (user: UserAccountProfile) => {
    setPermissionUser(user);
    setUserTiers(user.subjectPermissions || {});
    setSelectedSources([...(user.allowedExamSources || [])]);
    setPermissionSaveSuccess(false);
  };

  const handleSetSubjectTier = (subjectCode: string, tier: SubjectPermissionTier) => {
    setUserTiers((prev) => ({
      ...prev,
      [subjectCode]: tier,
    }));
  };

  const handleSetAllSubjectTiers = (tier: SubjectPermissionTier) => {
    const updated: Record<string, SubjectPermissionTier> = {};
    SUBJECT_CATALOG.forEach((s) => {
      updated[s.code] = tier;
    });
    setUserTiers(updated);
  };

  // Save Permissions to Database (25%, 50%, 75%, 100%)
  const handleSavePermissions = async () => {
    if (!permissionUser) return;
    setSavingPermissions(true);
    try {
      await userService.updateUserSubjectPermissions(
        permissionUser.id,
        userTiers,
        selectedSources
      );

      setUsers((prev) =>
        prev.map((u) =>
          u.id === permissionUser.id
            ? {
                ...u,
                subjectPermissions: userTiers,
                allowedExamSources: selectedSources,
              }
            : u
        )
      );

      setPermissionSaveSuccess(true);
      setTimeout(() => {
        setPermissionUser(null);
        setPermissionSaveSuccess(false);
      }, 1000);
    } catch (err) {
      console.error('Lỗi khi lưu phân quyền:', err);
      alert('Không thể lưu phân quyền người dùng vào database.');
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

  // Filtered reports (Newest first)
  const filteredReports = useMemo(() => {
    return reports
      .filter((r) => {
        if (filterStatus !== 'all' && r.status !== filterStatus) return false;
        if (searchReportQuery.trim()) {
          const q = searchReportQuery.toLowerCase();
          const matchSubject = r.subjectCode?.toLowerCase().includes(q);
          const matchText = r.questionText?.toLowerCase().includes(q);
          const matchDesc = r.description?.toLowerCase().includes(q);
          const matchEmail = r.userEmail?.toLowerCase().includes(q);
          const matchSeed = r.seed?.toLowerCase().includes(q);
          const matchScope = r.scope?.toLowerCase().includes(q);
          const matchFile = r.sourceFile?.toLowerCase().includes(q);
          return (
            matchSubject ||
            matchText ||
            matchDesc ||
            matchEmail ||
            matchSeed ||
            matchScope ||
            matchFile
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [reports, filterStatus, searchReportQuery]);

  // Helper to resolve creator name/email for display (preferring full name)
  const getDisplayCreatorEmail = (exam: ExamDefinition): string => {
    if (exam.creatorName && exam.creatorName.trim()) {
      return exam.creatorName;
    }
    if (exam.createdByUserId) {
      const matched = users.find((u) => u.id === exam.createdByUserId);
      if (matched?.fullName) return matched.fullName;
      if (matched?.email) return matched.email;
    }
    if (exam.creatorEmail && !/^[0-9a-f-]{30,}$/i.test(exam.creatorEmail)) {
      return exam.creatorEmail;
    }
    return exam.creatorName || exam.creatorEmail || exam.createdByUserId || 'Ẩn danh';
  };

  // Helper to format date with date before time (DD/MM/YYYY HH:mm:ss)
  const formatDateBeforeTime = (isoString?: string | null): string => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    } catch {
      return isoString;
    }
  };

  // Aggregate Exam Rows (Section 10)
  const aggregatedExamRows: ExamAggregatedRow[] = useMemo(() => {
    // Map of attempts by normalized seed
    const attemptsBySeed = new Map<string, QuizAttempt[]>();
    allAttempts.forEach((att) => {
      const seedKey = (att.seed || '').trim().toUpperCase();
      if (!attemptsBySeed.has(seedKey)) {
        attemptsBySeed.set(seedKey, []);
      }
      attemptsBySeed.get(seedKey)!.push(att);
    });

    // Also include any seed found in attempts even if ExamDefinition table row was absent
    const allDefsMap = new Map<string, ExamDefinition>();
    examDefinitions.forEach((def) => {
      allDefsMap.set(def.seed.trim().toUpperCase(), def);
    });

    attemptsBySeed.forEach((atts, seedKey) => {
      if (!allDefsMap.has(seedKey) && atts.length > 0) {
        const first = atts[0];
        const matchedUser = users.find((u) => u.id === first.userId);
        allDefsMap.set(seedKey, {
          id: `exam-${seedKey}`,
          seed: seedKey,
          subjectId: first.subjectId,
          subjectCode: first.subjectCode,
          createdByUserId: first.userId,
          creatorEmail: matchedUser?.email,
          questionIds: (first.questions || []).map((q) => q.id),
          config: first.config,
          createdAt: first.startedAt,
        });
      }
    });

    const rows: ExamAggregatedRow[] = [];
    allDefsMap.forEach((exam, seedKey) => {
      const examAtts = attemptsBySeed.get(seedKey) || [];
      const totalAtts = examAtts.length;
      const uniqueUsers = new Set(examAtts.map((a) => a.userId || a.id)).size;

      const scores = examAtts.map((a) => a.score10);
      const avgScore = totalAtts > 0 ? scores.reduce((s, c) => s + c, 0) / totalAtts : null;
      const maxScore = totalAtts > 0 ? Math.max(...scores) : null;
      const minScore = totalAtts > 0 ? Math.min(...scores) : null;

      rows.push({
        exam,
        attemptsCount: totalAtts,
        uniqueUsersCount: uniqueUsers,
        avgScore,
        maxScore,
        minScore,
        attempts: examAtts,
      });
    });

    // Sort newest first
    return rows.sort((a, b) => (b.exam.createdAt > a.exam.createdAt ? 1 : -1));
  }, [examDefinitions, allAttempts, users]);

  // Filtered Exam Rows
  const filteredExamRows = useMemo(() => {
    return aggregatedExamRows.filter((row) => {
      if (filterSubjectCode !== 'all' && row.exam.subjectCode !== filterSubjectCode) {
        return false;
      }
      if (searchSeedQuery.trim()) {
        const q = searchSeedQuery.trim().toUpperCase();
        if (!row.exam.seed.toUpperCase().includes(q)) return false;
      }
      if (searchCreatorQuery.trim()) {
        const q = searchCreatorQuery.trim().toLowerCase();
        const creator = getDisplayCreatorEmail(row.exam).toLowerCase();
        if (!creator.includes(q)) return false;
      }
      if (filterMinScore.trim()) {
        const minVal = parseFloat(filterMinScore);
        if (!isNaN(minVal) && (row.avgScore === null || row.avgScore < minVal)) {
          return false;
        }
      }
      if (filterMaxScore.trim()) {
        const maxVal = parseFloat(filterMaxScore);
        if (!isNaN(maxVal) && (row.avgScore === null || row.avgScore > maxVal)) {
          return false;
        }
      }
      if (filterVisibility === 'public' && !row.exam.isPublic) {
        return false;
      }
      if (filterVisibility === 'private' && row.exam.isPublic) {
        return false;
      }
      return true;
    });
  }, [
    aggregatedExamRows,
    filterSubjectCode,
    searchSeedQuery,
    searchCreatorQuery,
    filterMinScore,
    filterMaxScore,
    filterVisibility,
    users,
  ]);

  // Handle Admin Delete Exam
  const handleDeleteExam = async () => {
    if (!deletingExam) return;
    const toDelete = deletingExam;
    // Dismiss modal immediately without 1-2s delay
    setDeletingExam(null);

    // Optimistically remove exam and attempts from local view immediately
    const targetSeed = toDelete.exam.seed.toUpperCase();
    setExamDefinitions((prev) =>
      prev.filter((d) => d.seed.toUpperCase() !== targetSeed)
    );
    setAllAttempts((prev) =>
      prev.filter((a) => (a.seed || '').toUpperCase() !== targetSeed)
    );

    try {
      await examDefinitionService.deleteExamDefinition(
        toDelete.exam.id,
        toDelete.exam.seed
      );

      // Recalculate stats for current user
      const targetUserId = effectiveUser?.id;
      const remaining = await historyService.getAttempts(targetUserId);
      await questionStatsService.recalculateStatsFromAttempts(targetUserId, remaining);
      if (selectedSubject) {
        const updatedStats = questionStatsService.getSubjectQuestionStats(targetUserId, selectedSubject.id);
        setAdminQuestionStats(updatedStats);
      }
    } catch (err) {
      console.error('Lỗi khi xóa đề thi:', err);
      alert('Không thể xóa đề thi. Vui lòng tải lại trang!');
    }
  };

  // =========================================================================
  // TAB 4: QUESTION EXPLORER & CUSTOM EXAM BUILDER LOGIC
  // =========================================================================
  const selectedSubject = useMemo(
    () => SUBJECT_CATALOG.find((s) => s.id === selectedSubjectId) || SUBJECT_CATALOG[0],
    [selectedSubjectId]
  );

  const selectedFile = useMemo(() => {
    if (!selectedSubject) return null;
    return (
      selectedSubject.examFiles.find((f) => f.filePath === selectedSourceFilePath) ||
      selectedSubject.examFiles[0]
    );
  }, [selectedSubject, selectedSourceFilePath]);

  // When subject changes, reset selected source file if needed
  useEffect(() => {
    if (
      selectedSubject &&
      !selectedSubject.examFiles.some((f) => f.filePath === selectedSourceFilePath)
    ) {
      setSelectedSourceFilePath(selectedSubject.examFiles[0]?.filePath || '');
    }
    setFilterQuestionScope('all');
  }, [selectedSubject, selectedSourceFilePath]);

  // Helper to extract common scope prefix (e.g., '2021.1 - Trang 1' -> '2021.1')
  const extractScopePrefix = (scope: string | undefined | null): string => {
    if (!scope) return '';
    const trimmed = scope.trim();
    const cleaned = trimmed.replace(
      /\s*[-—–:/]\s*(Trang|Câu|Page|Part|Phần|Ảnh|Slide|Bài)\s*[\d\w.-]+.*$/i,
      ''
    ).trim();
    return cleaned || trimmed;
  };

  // Extract available scope prefixes for the currently loaded questions
  const availableScopes = useMemo(() => {
    const set = new Set<string>();
    questionsList.forEach((q) => {
      const prefix = extractScopePrefix(q.scope);
      if (prefix) {
        set.add(prefix);
      }
    });
    return Array.from(set).sort();
  }, [questionsList]);

  // Load questions for selected exam source file & aggregate stats
  useEffect(() => {
    if (!selectedFile) return;
    let isMounted = true;
    setLoadingQuestions(true);
    loadExamFile(selectedFile.filePath)
      .then((qs) => {
        if (!isMounted) return;
        const sorted = [...qs].sort(
          (a, b) => (Number(a.id) || 0) - (Number(b.id) || 0)
        );
        setQuestionsList(sorted);
        setSelectedQuestionIds(new Set());
        setLoadingQuestions(false);
      })
      .catch((err) => {
        console.error('Lỗi tải câu hỏi:', err);
        if (isMounted) {
          setQuestionsList([]);
          setLoadingQuestions(false);
        }
      });

    if (selectedSubject) {
      const targetUserId = effectiveUser?.id;

      // 1. Immediately load local stats for current user/guest
      const localStats = targetUserId
        ? questionStatsService.getSubjectQuestionStats(targetUserId, selectedSubject.id)
        : questionStatsService.getSubjectQuestionStats('local_guest', selectedSubject.id);

      setAdminQuestionStats(localStats);

      // 2. If authenticated, synchronize with remote Supabase in background
      if (targetUserId) {
        questionStatsService
          .syncRemoteStats(targetUserId, selectedSubject.id)
          .then(() => {
            if (!isMounted) return;
            const updated = questionStatsService.getSubjectQuestionStats(
              targetUserId,
              selectedSubject.id
            );
            setAdminQuestionStats(updated);
          })
          .catch((err) => {
            console.warn('Failed syncing remote question stats in Admin explorer:', err);
          });
      }
    }

    return () => {
      isMounted = false;
    };
  }, [selectedFile, selectedSubject, effectiveUser?.id]);

  // Filtered Questions in Tab 4
  const filteredQuestionsList = useMemo(() => {
    return questionsList.filter((q) => {
      const stat = adminQuestionStats[String(q.id)] || (q.originalNum !== undefined ? adminQuestionStats[String(q.originalNum)] : undefined);
      const hasAttempted = Boolean(stat && stat.attempts > 0);
      const isCorrect = Boolean(stat && stat.correctCount > 0);
      const isWrong = Boolean(stat && stat.wrongCount > 0);

      if (filterQuestionStatus === 'unattempted' && hasAttempted) return false;
      if (filterQuestionStatus === 'attempted' && !hasAttempted) return false;
      if (filterQuestionStatus === 'correct' && !isCorrect) return false;
      if (filterQuestionStatus === 'wrong' && !isWrong) return false;

      // Filter by Scope Prefix
      if (filterQuestionScope !== 'all') {
        const qScopePrefix = extractScopePrefix(q.scope);
        if (qScopePrefix !== filterQuestionScope) return false;
      }

      if (searchQuestionQuery.trim()) {
        const query = searchQuestionQuery.trim().toLowerCase();
        const matchText = (q.text || '').toLowerCase().includes(query);
        const matchId = String(q.id || '').toLowerCase().includes(query);
        const matchChapter = String(q.chapter || '').toLowerCase().includes(query);
        const matchScope = (q.scope || '').toLowerCase().includes(query);
        return matchText || matchId || matchChapter || matchScope;
      }
      return true;
    });
  }, [questionsList, adminQuestionStats, filterQuestionStatus, filterQuestionScope, searchQuestionQuery]);

  // Admin Custom Exams (both Private & Public)
  const adminCustomExams = useMemo(() => {
    return examDefinitions.filter((d) => {
      return (
        d.id.startsWith('exam-') ||
        Boolean(d.title) ||
        Boolean(d.createdByUserId) ||
        d.creatorEmail === effectiveUser?.email
      );
    });
  }, [examDefinitions, effectiveUser?.email]);

  const handleLaunchAdminExam = (def: ExamDefinition) => {
    window.location.hash = `#/quiz/${def.subjectCode}?seed=${def.seed}&from=admin`;
  };

  const handleCopyAdminSeed = (seed: string) => {
    navigator.clipboard.writeText(seed);
    setCopiedAdminSeed(seed);
    setTimeout(() => setCopiedAdminSeed(null), 2000);
  };

  const handleToggleExamPublic = async (def: ExamDefinition) => {
    const nextPublic = !def.isPublic;
    try {
      await examDefinitionService.saveExamDefinition({
        ...def,
        isPublic: nextPublic,
        isExplicitAdminUpdate: true,
      } as any);
      setExamDefinitions((prev) =>
        prev.map((d) => (d.seed === def.seed ? { ...d, isPublic: nextPublic } : d))
      );
      setDetailExamRow((prev) =>
        prev && prev.exam.seed === def.seed
          ? { ...prev, exam: { ...prev.exam, isPublic: nextPublic } }
          : prev
      );
    } catch (err) {
      console.error('Lỗi khi chuyển đổi quyền công khai của đề:', err);
      alert('Không thể cập nhật trạng thái đề thi. Vui lòng thử lại!');
    }
  };

  const handleSaveExamTitle = async () => {
    if (!detailExamRow) return;
    const cleanTitle = editingExamTitle.trim();
    setSavingExamTitle(true);
    try {
      const updatedExam = {
        ...detailExamRow.exam,
        title: cleanTitle,
        isExplicitAdminUpdate: true,
      };
      await examDefinitionService.saveExamDefinition(updatedExam as any);
      setExamDefinitions((prev) =>
        prev.map((d) => (d.seed === detailExamRow.exam.seed ? { ...d, title: cleanTitle } : d))
      );
      setDetailExamRow((prev) => (prev ? { ...prev, exam: { ...prev.exam, title: cleanTitle } } : null));
    } catch (err) {
      console.error('Lỗi khi lưu tên đề thi:', err);
      alert('Không thể lưu tên đề thi. Vui lòng thử lại!');
    } finally {
      setSavingExamTitle(false);
    }
  };

  const handleSyncLocalDataToCloud = async () => {
    setSyncingCloud(true);
    setSyncSuccessMsg(null);
    try {
      const res = await examDefinitionService.syncAllLocalDataToSupabase();
      setSyncSuccessMsg(`Đã đồng bộ thành công ${res.syncedDefs} đề thi và ${res.syncedAttempts} bài thi lên Supabase!`);
      loadExamsAndStats();
      setTimeout(() => setSyncSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error('Lỗi khi đồng bộ lên Supabase:', err);
      alert('Không thể đồng bộ dữ liệu: ' + (err?.message || err));
    } finally {
      setSyncingCloud(false);
    }
  };

  // Open Custom Exam Modal
  const handleOpenCreateExamModal = async () => {
    if (selectedQuestionIds.size === 0) {
      alert('Vui lòng chọn ít nhất 1 câu hỏi để tạo đề thi!');
      return;
    }
    const seed = await examDefinitionService.generateUniqueSeed();
    setCustomExamSeed(seed);
    setCustomExamTitle(
      `Đề tự chọn ${selectedSubject?.code || ''} (${selectedQuestionIds.size} câu)`
    );
    setCustomExamIsPublic(false);
    setCreateCustomExamSuccess(false);
    setShowCreateExamModal(true);
  };

  const handleGenerateNewCustomSeed = async () => {
    const seed = await examDefinitionService.generateUniqueSeed();
    setCustomExamSeed(seed);
  };

  // Submit Custom Exam Creation (without time limitation - user picks time on start)
  const handleSaveCustomExam = async () => {
    if (!selectedSubject || !selectedFile || selectedQuestionIds.size === 0) return;
    setCreatingCustomExam(true);
    try {
      const seed = customExamSeed.trim().toUpperCase();
      const selectedQs = questionsList.filter((q) => selectedQuestionIds.has(q.id));
      const chapters = Array.from(
        new Set(selectedQs.map((q) => String(q.chapter || 'Tổng hợp')))
      );

      const newExamDef: ExamDefinition = {
        id: `exam-${seed}`,
        seed,
        title: customExamTitle.trim() || `Đề tự chọn ${selectedSubject.code}`,
        isPublic: customExamIsPublic,
        subjectId: selectedSubject.id,
        subjectCode: selectedSubject.code,
        createdByUserId: effectiveUser?.id,
        creatorEmail: effectiveUser?.email || 'admin@pvqexam.local',
        questionIds: Array.from(selectedQuestionIds),
        totalQuestions: selectedQuestionIds.size,
        config: {
          subjectId: selectedSubject.id,
          selectedChapters: chapters,
          mcqCount: selectedQuestionIds.size,
          essayCount: 0,
          timeMode: 'auto',
          shuffleQuestions: true,
          shuffleOptions: true,
          seed,
          examFilePath: selectedFile.filePath,
        },
        createdAt: new Date().toISOString(),
      };

      await examDefinitionService.saveExamDefinition(newExamDef);
      setExamDefinitions((prev) => [newExamDef, ...prev.filter((d) => d.seed !== seed)]);
      setCreateCustomExamSuccess(true);
      setTimeout(() => {
        setShowCreateExamModal(false);
        setCreateCustomExamSuccess(false);
        setSelectedQuestionIds(new Set());
      }, 1200);
    } catch (err) {
      console.error('Lỗi khi tạo đề thi tự chọn:', err);
      alert('Không thể tạo đề thi. Vui lòng thử lại!');
    } finally {
      setCreatingCustomExam(false);
    }
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (!searchUserQuery.trim()) return true;
      const q = searchUserQuery.toLowerCase();
      return (
        u.email.toLowerCase().includes(q) ||
        (u.fullName && u.fullName.toLowerCase().includes(q))
      );
    });
  }, [users, searchUserQuery]);

  const getStatusBadge = (status: ReportStatus) => {
    switch (status) {
      case 'open':
        return (
          <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 rounded-full text-xs font-semibold flex items-center gap-1">
            <Clock size={12} /> Chưa xử lý
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
            <XCircle size={12} /> Bỏ qua
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
        return 'Thiếu hình ảnh / link hỏng';
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
              Xử lý báo lỗi, thống kê đề thi dùng chung và phân quyền tỷ lệ ngân hàng đề
            </p>
          </div>
        </div>

        {/* Tab Switcher: 3 Tabs (reports, exams, users) */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl self-start md:self-center text-xs font-bold">
          <button
            type="button"
            onClick={() => handleSwitchTab('reports')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
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
            onClick={() => handleSwitchTab('exams')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'exams'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BarChart2 size={14} />
            <span>Quản lý đề thi & Thống kê</span>
            <span className="px-1.5 py-0.2 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-full text-[10px] font-bold">
              {aggregatedExamRows.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchTab('users')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'users'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users size={14} />
            <span>Tài khoản & Phân quyền</span>
            <span className="px-1.5 py-0.2 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-full text-[10px] font-bold">
              {users.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchTab('questions')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'questions'
                ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Database size={14} />
            <span>Dữ liệu câu hỏi</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: BÁO LỖI CÂU HỎI (Section 8 & 9) */}
      {/* ========================================================================= */}
      {activeTab === 'reports' && (
        <div className="space-y-5 animate-in fade-in duration-200">

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
                placeholder="Tìm theo môn, mã đề, nội dung câu hỏi, scope, ID gốc..."
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
                  {/* Card Header with Question Index and Metadata */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 font-mono font-bold text-xs rounded">
                        {report.subjectCode}
                      </span>
                      {report.seed && (
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-semibold text-xs rounded border border-slate-200 dark:border-slate-700">
                          Mã đề: {report.seed}
                        </span>
                      )}
                      {report.questionIndex && (
                        <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                          Câu {report.questionIndex} trong bài thi
                        </span>
                      )}
                      <span className="text-xs text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-2.5 py-0.5 rounded font-medium border border-rose-200 dark:border-rose-800">
                        {getReportTypeLabel(report.type)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {getStatusBadge(report.status)}
                    </div>
                  </div>

                  {/* Section 8.2: Scope, Original ID & Source File display */}
                  <div className="px-3.5 py-2 bg-slate-100/80 dark:bg-slate-800/80 rounded-xl text-xs flex flex-wrap items-center gap-x-5 gap-y-1.5 border border-slate-200/60 dark:border-slate-700/60 font-mono">
                    <span className="text-slate-600 dark:text-slate-300">
                      Phạm vi (Scope):{' '}
                      <strong className="text-indigo-600 dark:text-indigo-400 font-bold">
                        {report.scope || 'Chưa xác định'}
                      </strong>
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      ID nguồn gốc:{' '}
                      <strong className="text-blue-600 dark:text-blue-400 font-bold">
                        {report.originalQuestionId !== undefined
                          ? report.originalQuestionId
                          : report.questionId}
                      </strong>
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      Tệp JSON:{' '}
                      <strong className="text-emerald-700 dark:text-emerald-400 font-bold">
                        {report.sourceFile || 'exam.json'}
                      </strong>
                    </span>
                  </div>

                  {/* Details */}
                  <div className="space-y-2.5 text-xs sm:text-sm">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80">
                      <strong className="block text-slate-900 dark:text-slate-100 mb-1 text-xs">
                        Nội dung câu hỏi:
                      </strong>
                      <p className="leading-relaxed whitespace-pre-wrap">{report.questionText}</p>
                    </div>

                    {report.description && (
                      <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl text-rose-950 dark:text-rose-200 border border-rose-100 dark:border-rose-900/50">
                        <strong className="block text-rose-900 dark:text-rose-300 mb-1 text-xs">
                          Mô tả lỗi từ người làm bài:
                        </strong>
                        <p className="leading-relaxed font-medium">{report.description}</p>
                      </div>
                    )}

                    {report.adminNote && (
                      <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl text-blue-950 dark:text-blue-200 border border-blue-100 dark:border-blue-900/50">
                        <strong className="block text-blue-900 dark:text-blue-300 mb-1 text-xs">
                          Lời nhắn của Admin gửi thí sinh:
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
                      {/* Resolution Button */}
                      <button
                        type="button"
                        onClick={() => openResolutionModal(report)}
                        className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                      >
                        <CheckCircle size={13} /> Xử lý & Phản hồi
                      </button>

                      {/* Quick status actions */}
                      {report.status !== 'reviewing' && (
                        <button
                          type="button"
                          onClick={() => handleQuickUpdateStatus(report.id, 'reviewing')}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 font-semibold transition-colors cursor-pointer"
                        >
                          Đang xử lý
                        </button>
                      )}

                      {report.status !== 'rejected' && (
                        <button
                          type="button"
                          onClick={() => handleQuickUpdateStatus(report.id, 'rejected')}
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
      {/* TAB 2: QUẢN LÝ ĐỀ THI & THỐNG KÊ (Section 10) */}
      {/* ========================================================================= */}
      {activeTab === 'exams' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Multi-Criteria Filters Toolbar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                <Filter size={15} /> Bộ lọc đề thi đồng thời:
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSyncLocalDataToCloud}
                  disabled={syncingCloud}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  title="Đẩy toàn bộ đề thi và bài thi từ máy này lên Supabase để đồng bộ với Vercel"
                >
                  <RefreshCw size={13} className={syncingCloud ? 'animate-spin' : ''} />
                  {syncingCloud ? 'Đang đồng bộ...' : 'Đồng bộ lên Cloud (Supabase)'}
                </button>
                <button
                  type="button"
                  onClick={loadExamsAndStats}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw size={13} /> Làm mới
                </button>
              </div>
            </div>

            {syncSuccessMsg && (
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-2 animate-in fade-in">
                <CheckCircle size={15} className="shrink-0" />
                <span>{syncSuccessMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {/* Subject Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Môn học</label>
                <select
                  value={filterSubjectCode}
                  onChange={(e) => setFilterSubjectCode(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none"
                >
                  <option value="all">Tất cả các môn</option>
                  {SUBJECT_CATALOG.map((s) => (
                    <option key={s.id} value={s.code}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Seed Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Mã đề / Seed</label>
                <input
                  type="text"
                  value={searchSeedQuery}
                  onChange={(e) => setSearchSeedQuery(e.target.value)}
                  placeholder="VD: 593740..."
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono outline-none"
                />
              </div>

              {/* Creator Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Người tạo đề</label>
                <input
                  type="text"
                  value={searchCreatorQuery}
                  onChange={(e) => setSearchCreatorQuery(e.target.value)}
                  placeholder="Email hoặc ID..."
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none"
                />
              </div>

              {/* Visibility Filter (Private / Public) */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Quyền riêng tư</label>
                <select
                  value={filterVisibility}
                  onChange={(e) => setFilterVisibility(e.target.value as 'all' | 'public' | 'private')}
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none"
                >
                  <option value="all">Tất cả</option>
                  <option value="public">Công khai</option>
                  <option value="private">Riêng tư</option>
                </select>
              </div>

              {/* Min Score */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Điểm TB từ</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={filterMinScore}
                  onChange={(e) => setFilterMinScore(e.target.value)}
                  placeholder="0.0"
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none"
                />
              </div>

              {/* Max Score */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Điểm TB đến</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={filterMaxScore}
                  onChange={(e) => setFilterMaxScore(e.target.value)}
                  placeholder="10.0"
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
              <span className="text-slate-500">
                Tìm thấy <strong>{filteredExamRows.length}</strong> / {aggregatedExamRows.length} đề thi
              </span>
              <button
                type="button"
                onClick={() => {
                  setFilterSubjectCode('all');
                  setSearchSeedQuery('');
                  setSearchCreatorQuery('');
                  setFilterVisibility('all');
                  setFilterMinScore('');
                  setFilterMaxScore('');
                }}
                className="text-rose-600 dark:text-rose-400 font-semibold hover:underline cursor-pointer"
              >
                Xóa bộ lọc
              </button>
            </div>
          </div>

          {/* Exam Table */}
          {loadingExams ? (
            <div className="p-12 text-center text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse">
              Đang tải danh sách đề thi và thống kê...
            </div>
          ) : filteredExamRows.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-2">
              <FileText size={40} className="text-slate-400 mx-auto" />
              <h3 className="font-bold text-slate-800 dark:text-slate-100">
                Không tìm thấy đề thi phù hợp
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hãy điều chỉnh tiêu chí bộ lọc để hiển thị đề thi mong muốn.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4">Mã đề (Seed)</th>
                      <th className="py-3 px-4">Môn học</th>
                      <th className="py-3 px-4">Người tạo</th>
                      <th className="py-3 px-4">Số câu</th>
                      <th className="py-3 px-4">Lượt làm</th>
                      <th className="py-3 px-4">Thí sinh</th>
                      <th className="py-3 px-4">Điểm TB</th>
                      <th className="py-3 px-4">Cao / Thấp</th>
                      <th className="py-3 px-4 text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredExamRows.map((row) => (
                      <tr
                        key={row.exam.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3.5 px-4 font-mono font-bold text-indigo-700 dark:text-indigo-400">
                          <div className="flex items-center gap-1.5">
                            <span>{row.exam.seed}</span>
                            <span
                              className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                row.exam.isPublic
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                              }`}
                            >
                              {row.exam.isPublic ? 'Public' : 'Private'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded font-mono font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 text-[11px]">
                            {row.exam.subjectCode}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                          <span className="truncate max-w-[150px] block font-medium" title={getDisplayCreatorEmail(row.exam)}>
                            {getDisplayCreatorEmail(row.exam)}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {new Date(row.exam.createdAt).toLocaleDateString('vi-VN')}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-700 dark:text-slate-300">
                          {row.exam.totalQuestions || row.exam.questionIds.length} câu
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                            {row.attemptsCount} lượt
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-semibold">
                          <button
                            type="button"
                            onClick={() => setSelectedExamRow(row)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition-colors font-bold cursor-pointer group"
                            title="Bấm để xem danh sách thí sinh làm đề này"
                          >
                            <Users size={13} className="text-indigo-500 group-hover:scale-110 transition-transform" />
                            <span>{row.uniqueUsersCount} người</span>
                          </button>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                          {row.avgScore !== null ? `${row.avgScore.toFixed(2)}/10` : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 text-[11px]">
                          {row.maxScore !== null && row.minScore !== null ? (
                            <span>
                              {row.maxScore.toFixed(1)} / {row.minScore.toFixed(1)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setDetailExamRow(row);
                                setEditingExamTitle(row.exam.title || `Đề ${row.exam.subjectCode} (${row.exam.seed})`);
                              }}
                              className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition-colors"
                              title="Chi tiết đề thi, sửa tên đề, phân quyền private/public, vào làm bài..."
                            >
                              <Sliders size={12} /> Chi tiết
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingExam(row)}
                              className="px-2 py-1 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900 border border-rose-200 dark:border-rose-800 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition-colors"
                              title="Xóa đề thi này"
                            >
                              <Trash2 size={12} /> Xóa
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: TÀI KHOẢN & PHÂN QUYỀN (Section 4 & 5) */}
      {/* ========================================================================= */}
      {activeTab === 'users' && (
        <div className="space-y-5 animate-in fade-in duration-200">
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
              onClick={loadUsers}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw size={14} /> Làm mới
            </button>
          </div>

          {/* Users Table */}
          {loadingUsers ? (
            <div className="p-12 text-center text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse">
              Đang tải danh sách người dùng...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-2">
              <Users size={40} className="text-slate-400 mx-auto" />
              <h3 className="font-bold text-slate-800 dark:text-slate-100">
                Không tìm thấy tài khoản nào
              </h3>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4">Tài khoản</th>
                      <th className="py-3 px-4">Vai trò</th>
                      <th className="py-3 px-4">Phê duyệt</th>
                      <th className="py-3 px-4">Quyền môn học</th>
                      <th className="py-3 px-4">Ngày tạo</th>
                      <th className="py-3 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredUsers.map((u) => {
                      const perms = u.subjectPermissions || {};
                      const permEntries = Object.entries(perms);

                      return (
                        <tr
                          key={u.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 dark:text-slate-100">
                              {u.fullName}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">{u.email}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            {u.role === 'admin' ? (
                              <span className="px-2 py-0.5 rounded font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px]">
                                ADMIN
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px]">
                                USER
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            {u.isApproved ? (
                              <span className="px-2 py-0.5 rounded font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] flex items-center gap-1 w-fit">
                                <UserCheck size={11} /> Đã duyệt
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] flex items-center gap-1 w-fit">
                                <UserX size={11} /> Chờ duyệt
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            {permEntries.length > 0 ? (
                              <span
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-medium text-xs border border-blue-200/60 dark:border-blue-800"
                                title={permEntries.map(([code, tier]) => `${code}: ${tier}%`).join('\n')}
                              >
                                <Shield size={12} className="text-blue-600 dark:text-blue-400 shrink-0" />
                                <span>Đã cấp cho 1 số môn ({permEntries.length})</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Mặc định (25%)</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                            {new Date(u.createdAt).toLocaleDateString('vi-VN')}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleToggleApproval(u)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                                  u.isApproved
                                    ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300'
                                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300'
                                }`}
                              >
                                {u.isApproved ? 'Hủy duyệt' : 'Duyệt'}
                              </button>

                              <button
                                type="button"
                                onClick={() => openPermissionsModal(u)}
                                className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 border border-blue-200 dark:border-blue-800 text-xs font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Sliders size={12} /> Cấp quyền %
                              </button>

                              <button
                                type="button"
                                onClick={() => openHistoryModal(u)}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <History size={12} /> Lịch sử
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: DỮ LIỆU CÂU HỎI & TẠO ĐỀ THI (Dành riêng cho Admin) */}
      {/* ========================================================================= */}
      {activeTab === 'questions' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Controls Bar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Subject Selector */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Môn học
                </label>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                >
                  {SUBJECT_CATALOG.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Source File Selector */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Nguồn đề ({selectedSubject?.examFiles.length || 0} file)
                </label>
                <select
                  value={selectedSourceFilePath}
                  onChange={(e) => setSelectedSourceFilePath(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                >
                  {selectedSubject?.examFiles.map((f) => (
                    <option key={f.filePath} value={f.filePath}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Scope Selector */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Phạm vi (Scope)
                </label>
                <select
                  value={filterQuestionScope}
                  onChange={(e) => setFilterQuestionScope(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                >
                  <option value="all">Tất cả scope ({availableScopes.length})</option>
                  {availableScopes.map((scope) => (
                    <option key={scope} value={scope}>
                      {scope}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search Question */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Tìm kiếm câu hỏi / ID / Chương
                </label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuestionQuery}
                    onChange={(e) => setSearchQuestionQuery(e.target.value)}
                    placeholder="Nội dung, ID, chương, scope..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Filter by Admin Attempt Status */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Trạng thái làm bài (Admin)
                </label>
                <select
                  value={filterQuestionStatus}
                  onChange={(e) => setFilterQuestionStatus(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                >
                  <option value="all">Tất cả ({questionsList.length} câu)</option>
                  <option value="unattempted">Chưa làm</option>
                  <option value="attempted">Đã từng làm</option>
                  <option value="correct">Đã làm đúng</option>
                  <option value="wrong">Đã làm sai</option>
                </select>
              </div>
            </div>

            {/* Selection & Action Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const allIds = new Set(filteredQuestionsList.map((q) => q.id));
                    setSelectedQuestionIds(allIds);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer text-slate-700 dark:text-slate-300"
                >
                  Chọn tất cả ({filteredQuestionsList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedQuestionIds(new Set())}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer text-slate-500"
                >
                  Bỏ chọn
                </button>
                <span className="text-slate-600 dark:text-slate-400 ml-2">
                  Đã chọn: <strong className="text-blue-600 dark:text-blue-400 font-bold">{selectedQuestionIds.size}</strong> câu
                </span>
              </div>

              <button
                type="button"
                disabled={selectedQuestionIds.size === 0}
                onClick={handleOpenCreateExamModal}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
              >
                <Plus size={15} /> Tạo đề thi từ {selectedQuestionIds.size} câu đã chọn
              </button>
            </div>
          </div>

          {/* Questions List */}
          {loadingQuestions ? (
            <div className="p-12 text-center text-sm text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse">
              Đang tải danh sách câu hỏi nguồn đề...
            </div>
          ) : filteredQuestionsList.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-2">
              <FileText size={40} className="text-slate-400 mx-auto" />
              <h3 className="font-bold text-slate-800 dark:text-slate-100">
                Không tìm thấy câu hỏi phù hợp
              </h3>
              <p className="text-xs text-slate-500">
                Hãy thử chọn nguồn đề khác hoặc xóa bộ lọc tìm kiếm.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredQuestionsList.map((q) => {
                  const isSelected = selectedQuestionIds.has(q.id);
                  const isExpanded = expandedQuestionId === q.id;
                  const stat =
                    adminQuestionStats[String(q.id)] ||
                    (q.originalNum !== undefined
                      ? adminQuestionStats[String(q.originalNum)]
                      : undefined);
                  const attempts = stat?.attempts || 0;
                  const corrects = stat?.correctCount || 0;
                  const wrongs = stat?.wrongCount || 0;

                  return (
                    <div
                      key={q.id}
                      className={`p-4 transition-colors ${
                        isSelected
                          ? 'bg-blue-50/40 dark:bg-blue-950/20'
                          : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/30'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(selectedQuestionIds);
                            if (next.has(q.id)) next.delete(q.id);
                            else next.add(q.id);
                            setSelectedQuestionIds(next);
                          }}
                          className="mt-0.5 text-blue-600 dark:text-blue-400 cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare size={18} className="text-blue-600 dark:text-blue-400" />
                          ) : (
                            <Square size={18} className="text-slate-400 hover:text-slate-600" />
                          )}
                        </button>

                        <div className="flex-1 space-y-1.5 min-w-0">
                          {/* Badges row */}
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="px-2 py-0.5 rounded font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-[11px]">
                              ID: #{q.id}
                            </span>
                            {q.chapter && (
                              <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold border border-indigo-200/50 dark:border-indigo-800">
                                {q.chapter}
                              </span>
                            )}

                            {/* Admin attempt status badge */}
                            {attempts === 0 ? (
                              <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 text-[11px] font-medium">
                                Chưa làm
                              </span>
                            ) : (
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                  corrects > 0 && wrongs === 0
                                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                    : corrects > 0
                                    ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                                    : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                                }`}
                              >
                                Đã làm {attempts} lần (Đúng {corrects} · Sai {wrongs})
                              </span>
                            )}
                          </div>

                          {/* Question text */}
                          <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                            {q.text}
                          </p>

                          {/* Options and details toggle */}
                          <button
                            type="button"
                            onClick={() => setExpandedQuestionId(isExpanded ? null : q.id)}
                            className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer pt-1"
                          >
                            {isExpanded ? (
                              <>
                                Thu gọn đáp án <ChevronUp size={13} />
                              </>
                            ) : (
                              <>
                                Xem các đáp án ({q.options?.length || 0} lựa chọn) <ChevronDown size={13} />
                              </>
                            )}
                          </button>

                          {/* Expanded Options */}
                          {isExpanded && (
                            <div className="pt-2.5 space-y-1.5 animate-in fade-in duration-150">
                              {q.options && q.options.length > 0 && (
                                <div className="space-y-1 text-xs">
                                  {q.options.map((opt) => {
                                    const isCorrect = (q.correctAnswers || []).some(
                                      (ans) =>
                                        String(opt.id || '').trim().toLowerCase() ===
                                          String(ans || '').trim().toLowerCase() ||
                                        String(opt.text || '').trim().toLowerCase() ===
                                          String(ans || '').trim().toLowerCase()
                                    );
                                    return (
                                      <div
                                        key={opt.id}
                                        className={`p-2 rounded-lg border flex items-start gap-2 ${
                                          isCorrect
                                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 font-semibold text-emerald-900 dark:text-emerald-200'
                                            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                        }`}
                                      >
                                        <span className="font-mono font-bold shrink-0">{String(opt.id || '').toUpperCase()}.</span>
                                        <span>{opt.text}</span>
                                        {isCorrect && (
                                          <span className="ml-auto text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                                            Đáp án chuẩn
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {q.explanation && (
                                <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-lg text-xs text-amber-900 dark:text-amber-200 space-y-1">
                                  <span className="font-bold block">Giải thích:</span>
                                  <p>{q.explanation}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: XỬ LÝ BÁO LỖI (Section 9.2: KHÔNG CHỈNH SỬA DB TRỰC TIẾP) */}
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
            <div className="bg-gradient-to-r from-rose-900 to-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <CheckCircle size={18} className="text-rose-400" />
                  Xử lý phản hồi báo lỗi câu hỏi
                </h3>
                <p className="text-xs text-rose-200 mt-0.5">
                  Môn {editingReport.subjectCode} · {editingReport.seed ? `Mã đề: ${editingReport.seed}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingReport(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              {reportSaveSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
                  <Check size={16} /> Đã cập nhật trạng thái xử lý và gửi thông báo tới thí sinh thành công!
                </div>
              )}

              {/* Exact Metadata Box for Admin JSON lookup (Section 8.2 & 9.2) */}
              <div className="p-4 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-2 font-mono">
                <div className="font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[11px] pb-1 border-b border-slate-200 dark:border-slate-700">
                  Thông tin định danh để đối chiếu file JSON:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700 dark:text-slate-300">
                  <div>
                    Môn học: <strong className="text-blue-600 dark:text-blue-400">{editingReport.subjectCode}</strong>
                  </div>
                  <div>
                    Mã đề: <strong className="text-indigo-600 dark:text-indigo-400">{editingReport.seed || 'N/A'}</strong>
                  </div>
                  <div>
                    Phạm vi (Scope): <strong className="text-emerald-600 dark:text-emerald-400">{editingReport.scope || 'Chưa xác định'}</strong>
                  </div>
                  <div>
                    ID nguồn gốc: <strong className="text-amber-600 dark:text-amber-400">{editingReport.originalQuestionId !== undefined ? editingReport.originalQuestionId : editingReport.questionId}</strong>
                  </div>
                  <div className="sm:col-span-2">
                    Tệp JSON nguồn: <strong className="text-rose-600 dark:text-rose-400">{editingReport.sourceFile || 'exam.json'}</strong>
                  </div>
                </div>
              </div>

              {/* Readonly Question Text & User Report */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                <span className="font-bold text-slate-600 dark:text-slate-400 block">Nội dung câu hỏi:</span>
                <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-200">{editingReport.questionText}</p>
              </div>

              {editingReport.description && (
                <div className="p-3 bg-rose-50/70 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900/60 text-xs space-y-1">
                  <span className="font-bold text-rose-800 dark:text-rose-300 block">Mô tả của thí sinh:</span>
                  <p className="text-rose-950 dark:text-rose-100">{editingReport.description}</p>
                </div>
              )}

              {/* Status Select */}
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
                  <option value="reviewing">Đang kiểm tra / Đang sửa</option>
                  <option value="resolved">Đã sửa (Phát thông báo cho thí sinh)</option>
                  <option value="rejected">Bỏ qua / Không lỗi</option>
                </select>
              </div>

              {/* Admin Note / Message to User (Section 9.3) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Lời nhắn của Admin gửi thí sinh (Tùy chọn)
                </label>
                <textarea
                  rows={3}
                  value={editAdminNote}
                  onChange={(e) => setEditAdminNote(e.target.value)}
                  placeholder="VD: Đã cập nhật đáp án chuẩn sang B và bổ sung giải thích chi tiết..."
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
                onClick={handleSaveResolution}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer"
              >
                <Send size={14} />
                {savingReport ? 'Đang cập nhật & gửi thông báo...' : 'Lưu trạng thái & Gửi thông báo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CHI TIẾT ĐỀ THI (Sửa tên đề, Toggle Private/Public, Vào làm, ...) */}
      {/* ========================================================================= */}
      {detailExamRow &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-slate-950/70 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-75 will-change-transform"
            onClick={() => setDetailExamRow(null)}
          >
            <div
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full p-6 space-y-5 animate-in zoom-in-95 duration-75 text-slate-900 dark:text-slate-100 max-h-[90vh] overflow-y-auto will-change-transform"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                    <Sliders size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      Chi tiết đề thi
                      <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold">
                        {detailExamRow.exam.seed}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Cập nhật thông tin, quyền riêng tư và điều khiển đề thi
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailExamRow(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Edit Title Section */}
              <div className="space-y-2 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Tên đề thi:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editingExamTitle}
                    onChange={(e) => setEditingExamTitle(e.target.value)}
                    placeholder="Nhập tên đề thi hiển thị..."
                    className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleSaveExamTitle}
                    disabled={savingExamTitle}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
                  >
                    <Save size={13} />
                    {savingExamTitle ? 'Đang lưu...' : 'Lưu tên'}
                  </button>
                </div>
              </div>

              {/* Quick Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Môn học</div>
                  <div className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400 mt-0.5">
                    {detailExamRow.exam.subjectCode}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Số câu</div>
                  <div className="font-bold text-sm text-slate-800 dark:text-slate-200 mt-0.5">
                    {detailExamRow.exam.totalQuestions || detailExamRow.exam.questionIds.length} câu
                  </div>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Lượt làm</div>
                  <div className="font-bold text-sm text-slate-800 dark:text-slate-200 mt-0.5">
                    {detailExamRow.attemptsCount} lượt
                  </div>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Điểm TB</div>
                  <div className="font-bold text-sm text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {detailExamRow.avgScore !== null ? `${detailExamRow.avgScore.toFixed(2)}/10` : '—'}
                  </div>
                </div>
              </div>

              {/* Creator & Date Info */}
              <div className="text-xs space-y-1.5 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Người tạo:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                    {getDisplayCreatorEmail(detailExamRow.exam)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Ngày tạo:</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200 font-medium">
                    {formatDateBeforeTime(detailExamRow.exam.createdAt)}
                  </span>
                </div>
              </div>

              {/* Privacy Toggle Section */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    {detailExamRow.exam.isPublic ? (
                      <>
                        <Globe size={14} className="text-emerald-500" />
                        <span className="text-emerald-700 dark:text-emerald-400">Đang ở chế độ Công khai (Public)</span>
                      </>
                    ) : (
                      <>
                        <Lock size={14} className="text-indigo-500" />
                        <span className="text-indigo-700 dark:text-indigo-400">Đang ở chế độ Riêng tư (Private)</span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {detailExamRow.exam.isPublic
                      ? 'Mọi sinh viên đều có thể nhìn thấy và làm đề thi này trên trang chủ.'
                      : 'Chỉ Admin và người tạo đề mới có thể nhìn thấy đề thi này.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleExamPublic(detailExamRow.exam)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 shadow-xs ${
                    detailExamRow.exam.isPublic
                      ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-950/80 dark:hover:bg-amber-900 dark:text-amber-300'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {detailExamRow.exam.isPublic ? 'Chuyển sang Riêng tư' : 'Bật Công khai đề'}
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const row = detailExamRow;
                      setDetailExamRow(null);
                      setSelectedExamRow(row);
                    }}
                    className="px-3 py-2 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Users size={14} /> Xem thí sinh ({detailExamRow.uniqueUsersCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(detailExamRow.exam.seed);
                      alert(`Đã sao chép mã đề: ${detailExamRow.exam.seed}`);
                    }}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Copy size={14} /> Sao chép mã
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const row = detailExamRow;
                      setDetailExamRow(null);
                      setDeletingExam(row);
                    }}
                    className="px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLaunchAdminExam(detailExamRow.exam)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
                  >
                    <Play size={13} fill="currentColor" /> Vào làm bài
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ========================================================================= */}
      {/* MODAL 2: CHI TIẾT NGƯỜI LÀM ĐỀ THI (Section 10.2) */}
      {/* ========================================================================= */}
      {selectedExamRow &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-slate-950/70 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-75 will-change-transform"
            onClick={() => setSelectedExamRow(null)}
          >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-3xl w-full my-6 overflow-hidden animate-in fade-in zoom-in-95 duration-75 text-slate-900 dark:text-slate-100 will-change-transform"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <BarChart2 size={18} className="text-indigo-400" />
                  Danh sách thí sinh làm đề: {selectedExamRow.exam.seed}
                </h3>
                <p className="text-xs text-indigo-200 mt-0.5">
                  Môn: {selectedExamRow.exam.subjectCode} · Tổng số {selectedExamRow.attemptsCount} lượt làm từ {selectedExamRow.uniqueUsersCount} người
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedExamRow(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {selectedExamRow.attempts.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  Chưa có lượt nộp bài nào cho đề thi này.
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Group attempts by user */}
                  {Array.from(
                    selectedExamRow.attempts.reduce((map, att) => {
                      const key = att.userId || att.id;
                      if (!map.has(key)) map.set(key, []);
                      map.get(key)!.push(att);
                      return map;
                    }, new Map<string, QuizAttempt[]>())
                  ).map(([userId, userAtts], idx) => {
                    const firstAtt = userAtts[0];
                    const scores = userAtts.map((a) => a.score10);
                    const bestScore = Math.max(...scores);
                    const latestAtt = userAtts[0]; // sorted newest

                    return (
                      <div
                        key={userId || idx}
                        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
                          <div>
                            <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                              Thí sinh #{idx + 1}
                            </span>
                            {(() => {
                              const candidateUser = users.find((u) => u.id === userId);
                              const candidateLabel = candidateUser?.email || candidateUser?.fullName || userId;
                              return (
                                <span className="text-[11px] text-slate-500 ml-2 font-mono">
                                  {candidateLabel}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="font-semibold text-slate-600 dark:text-slate-300">
                              Làm {userAtts.length} lần
                            </span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              Điểm cao nhất: {bestScore.toFixed(2)}/10
                            </span>
                          </div>
                        </div>

                        {/* List individual attempts for this user */}
                        <div className="space-y-1.5 pl-2">
                          {userAtts.map((att, aIdx) => (
                            <div
                              key={att.id || aIdx}
                              className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 py-1.5 border-b border-slate-100 dark:border-slate-800/60 last:border-none gap-2 flex-wrap"
                            >
                              <span>
                                Lần {userAtts.length - aIdx}:{' '}
                                <strong className="text-slate-800 dark:text-slate-200 font-bold">
                                  {att.score10.toFixed(2)} điểm
                                </strong>{' '}
                                ({att.correctCount}/{att.totalScoredQuestions} câu đúng)
                              </span>
                              <div className="flex items-center gap-3 text-[11px]">
                                <span>{Math.round(att.timeSpentSeconds / 60)} phút</span>
                                <span>{new Date(att.submittedAt).toLocaleString('vi-VN')}</span>
                                <button
                                  type="button"
                                  onClick={() => setInspectingAttempt(att)}
                                  className="px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                >
                                  <Eye size={12} /> Xem bài làm
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
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
                onClick={() => setSelectedExamRow(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 text-white font-bold text-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CẤP QUYỀN TỶ LỆ 25%, 50%, 75%, 100% (Section 4 & 5) */}
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
                  Cấp quyền tỷ lệ câu hỏi (25% - 50% - 75% - 100%)
                </h3>
                <p className="text-xs text-blue-200 mt-0.5">
                  Tài khoản: {permissionUser.fullName} ({permissionUser.email})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPermissionUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                Thiết lập nhanh:
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSetAllSubjectTiers(100)}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-2xs cursor-pointer"
                >
                  Cấp 100% tất cả môn
                </button>
                <button
                  type="button"
                  onClick={() => handleSetAllSubjectTiers(25)}
                  className="px-2.5 py-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg font-semibold hover:bg-slate-100 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Đặt về mặc định 25%
                </button>
              </div>
            </div>

            {/* Subject Tier Picker List */}
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {permissionSaveSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
                  <Check size={16} /> Đã lưu phân quyền tỷ lệ câu hỏi thành công!
                </div>
              )}

              {SUBJECT_CATALOG.map((subject) => {
                const hasMultipleSources = subject.examFiles.length > 1;

                if (hasMultipleSources) {
                  return (
                    <div
                      key={subject.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-blue-600 text-white font-mono font-bold text-xs rounded">
                            {subject.code}
                          </span>
                          <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100">
                            {subject.name}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            (Kỳ {subject.semester} · {subject.examFiles.length} nguồn đề riêng biệt)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              subject.examFiles.forEach((f) => {
                                handleSetSubjectTier(`${subject.id}::${f.filePath}`, 100);
                              });
                              handleSetSubjectTier(subject.code, 100);
                            }}
                            className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                          >
                            Cấp 100% tất cả nguồn
                          </button>
                        </div>
                      </div>

                      {/* List each source file separately */}
                      <div className="space-y-2.5 pl-2">
                        {subject.examFiles.map((file) => {
                          const fileKey = `${subject.id}::${file.filePath}`;
                          const currentTier = userTiers[fileKey] || userTiers[subject.code] || 25;

                          return (
                            <div
                              key={file.filePath}
                              className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                            >
                              <div>
                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                  {file.label}
                                </span>
                                <span className="text-[10px] text-slate-400 block font-mono">
                                  {file.filePath}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0 bg-slate-100 dark:bg-slate-700 p-0.5 rounded-lg">
                                {([25, 50, 75, 100] as SubjectPermissionTier[]).map((tier) => (
                                  <button
                                    key={tier}
                                    type="button"
                                    onClick={() => {
                                      handleSetSubjectTier(fileKey, tier);
                                      if (file.isDefault) {
                                        handleSetSubjectTier(subject.code, tier);
                                      }
                                    }}
                                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                                      currentTier === tier
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                                    }`}
                                  >
                                    {tier}%
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                // Single source subject
                const currentTier = userTiers[subject.code] || userTiers[subject.id] || 25;
                return (
                  <div
                    key={subject.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-blue-600 text-white font-mono font-bold text-xs rounded">
                          {subject.code}
                        </span>
                        <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100">
                          {subject.name}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {subject.examFiles[0]?.label || 'Ngân hàng đề'} · Kỳ {subject.semester}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 bg-slate-200/80 dark:bg-slate-700/80 p-1 rounded-xl">
                      {([25, 50, 75, 100] as SubjectPermissionTier[]).map((tier) => (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => {
                            handleSetSubjectTier(subject.code, tier);
                            if (subject.examFiles[0]) {
                              handleSetSubjectTier(
                                `${subject.id}::${subject.examFiles[0].filePath}`,
                                tier
                              );
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            currentTier === tier
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                          }`}
                        >
                          {tier}%
                        </button>
                      ))}
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
      {/* MODAL 4: XEM LỊCH SỬ LÀM BÀI CỦA NGƯỜI DÙNG */}
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
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {loadingHistory ? (
                <div className="py-12 text-center text-sm text-slate-500 animate-pulse">
                  Đang tải lịch sử làm bài...
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

      {/* ========================================================================= */}
      {/* MODAL: XÁC NHẬN XÓA ĐỀ THI (Admin Delete Exam) */}
      {/* ========================================================================= */}
      {deletingExam &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-slate-950/70 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-75 will-change-transform"
            onClick={() => setDeletingExam(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-75 text-slate-900 dark:text-slate-100 will-change-transform"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto shadow-sm">
                <Trash2 size={24} />
              </div>
              <div className="text-center space-y-1">
                <h3 className="font-bold text-base">Xác nhận xóa đề thi?</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Mã đề: <strong className="font-mono text-slate-900 dark:text-white">{deletingExam.exam.seed}</strong> · Môn: {deletingExam.exam.subjectCode}
                </p>
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium pt-1">
                  Khi xóa, đề thi sẽ bị hủy mã và tự động biến mất khỏi lịch sử làm bài của người dùng. Người dùng sẽ không thể truy cập lại đề thi này.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingExam(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleDeleteExam}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md cursor-pointer transition-colors"
                >
                  Xác nhận xóa
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ========================================================================= */}
      {/* MODAL: XEM BÀI LÀM CHI TIẾT CỦA THÍ SINH (Section 10) */}
      {/* ========================================================================= */}
      {inspectingAttempt && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setInspectingAttempt(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-3xl w-full my-6 overflow-hidden animate-in fade-in zoom-in-95 text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <FileText size={18} className="text-blue-400" />
                  Chi tiết bài làm: {inspectingAttempt.subjectCode} - {inspectingAttempt.subjectName}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Mã đề: <code className="font-mono font-bold text-yellow-300">{inspectingAttempt.seed}</code> · Điểm số:{' '}
                  <strong className="text-emerald-400 font-bold text-sm">
                    {inspectingAttempt.score10.toFixed(2)}/10
                  </strong>{' '}
                  ({inspectingAttempt.correctCount}/{inspectingAttempt.totalScoredQuestions} câu đúng)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingAttempt(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Questions breakdown */}
            <div className="p-6 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs">
                <span>
                  Thời gian làm: <strong>{Math.round(inspectingAttempt.timeSpentSeconds / 60)} phút</strong>
                </span>
                <span>
                  Nộp lúc: <strong>{new Date(inspectingAttempt.submittedAt).toLocaleString('vi-VN')}</strong>
                </span>
                <span>
                  Thí sinh:{' '}
                  <strong>
                    {users.find((u) => u.id === inspectingAttempt.userId)?.email || inspectingAttempt.userId || 'Ẩn danh'}
                  </strong>
                </span>
              </div>

              <div className="space-y-3 pt-2">
                {inspectingAttempt.questions.map((q, qIdx) => {
                  const userAns = inspectingAttempt.answers[q.id];
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
                      key={q.id || qIdx}
                      className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                        q.type === 'essay'
                          ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
                          : isCorrect
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                          : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          Câu {qIdx + 1} (ID #{q.id}):
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            q.type === 'essay'
                              ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                              : isCorrect
                              ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200'
                              : 'bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-200'
                          }`}
                        >
                          {q.type === 'essay' ? 'Tự luận' : isCorrect ? 'Đúng' : 'Sai'}
                        </span>
                      </div>

                      <p className="font-medium text-slate-800 dark:text-slate-200">{q.text}</p>

                      <div className="flex flex-wrap items-center gap-4 text-[11px] pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                        <span>
                          Thí sinh chọn:{' '}
                          <strong className="font-bold text-slate-900 dark:text-white">
                            {userAns ? String(userAns) : '(Bỏ trống)'}
                          </strong>
                        </span>
                        {q.type !== 'essay' && (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            Đáp án đúng: <strong>{correctAnswersStr}</strong>
                          </span>
                        )}
                      </div>

                      {q.explanation && (
                        <div className="p-2 bg-amber-50 dark:bg-amber-950/40 rounded border border-amber-200/60 dark:border-amber-900/40 text-[11px] text-amber-900 dark:text-amber-200">
                          <strong>Giải thích:</strong> {q.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectingAttempt(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 text-white font-bold text-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: TẠO ĐỀ THI TỰ CHỌN (Custom Exam Creator) */}
      {/* ========================================================================= */}
      {showCreateExamModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowCreateExamModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full my-6 overflow-hidden animate-in fade-in zoom-in-95 text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Sparkles size={18} className="text-yellow-400" />
                  Tạo đề thi từ các câu đã chọn
                </h3>
                <p className="text-xs text-blue-200 mt-0.5">
                  Môn: {selectedSubject?.code} · Số câu: {selectedQuestionIds.size} câu
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateExamModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {createCustomExamSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
                  <Check size={16} /> Đã tạo đề thi thành công! Mã đề: {customExamSeed}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tên / Tiêu đề đề thi
                </label>
                <input
                  type="text"
                  value={customExamTitle}
                  onChange={(e) => setCustomExamTitle(e.target.value)}
                  placeholder="VD: Đề ôn tập giữa kỳ..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold outline-none focus:border-blue-500"
                />
              </div>

              {/* Seed (Auto-generated unique seed, read-only) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mã đề (Seed)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={customExamSeed}
                    className="flex-1 px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-sm font-bold text-blue-600 dark:text-blue-400 outline-none select-all"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateNewCustomSeed}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={13} /> Tạo mã mới
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Mã đề được sinh tự động độc nhất, không trùng với bất kỳ đề nào trong hệ thống.
                </p>
              </div>


              {/* Private vs Public Toggle */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Chế độ hiển thị & Quyền truy cập
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomExamIsPublic(false)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      !customExamIsPublic
                        ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-200 shadow-2xs'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Lock size={14} /> Riêng tư (Private)
                    </div>
                    <p className="text-[10px] mt-1 leading-normal">
                      Chỉ Admin thấy trong danh sách. Người dùng có mã đề vẫn có thể vào làm qua ô nhập mã trên trang chủ.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCustomExamIsPublic(true)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      customExamIsPublic
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200 shadow-2xs'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Globe size={14} /> Công khai (Public)
                    </div>
                    <p className="text-[10px] mt-1 leading-normal">
                      Hiển thị trực tiếp trong mục Đề thi công khai của hệ thống trên trang chủ để tất cả người dùng làm bài.
                    </p>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateExamModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={creatingCustomExam}
                onClick={handleSaveCustomExam}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer"
              >
                <Save size={14} />
                {creatingCustomExam ? 'Đang tạo...' : 'Tạo & Lưu đề thi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
