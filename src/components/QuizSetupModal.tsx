import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Subject,
  QuizConfig,
  TimeMode,
  Question,
  SubjectProgress,
  SubjectPermissionTier,
  ExamDefinition,
} from '../types/quiz';
import {
  loadExamFile,
  loadMultipleExamFiles,
  onExamCacheUpdated,
  canonicalizeExamPath,
  extractExamStats,
  ExamStats,
} from '../data/dataLoader';
import { generateSeed } from '../engine/shuffle';
import { getPermittedQuestions, deduplicateQuestions } from '../engine/permissionSampler';
import { examDefinitionService } from '../services/examDefinitionService';
import { questionStatsService } from '../services/questionStatsService';
import { authService, UserProfile } from '../services/authService';
import {
  Play,
  Shuffle,
  Clock,
  FileText,
  RotateCw,
  RefreshCw,
  X,
  CheckCircle2,
  BookOpen,
  Layers,
  Shield,
  Lock,
  AlertCircle,
  HelpCircle,
  CheckSquare,
  Square,
} from 'lucide-react';

interface QuizSetupModalProps {
  subject: Subject;
  initialSeed?: string;
  onStartQuiz: (config: QuizConfig) => void;
  onCancel: () => void;
}

export const QuizSetupModal: React.FC<QuizSetupModalProps> = ({
  subject,
  initialSeed,
  onStartQuiz,
  onCancel,
}) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);

  // Admin exam source selection (multi-select for admin)
  const defaultFile =
    subject.examFiles.find((f) => f.isDefault) || subject.examFiles[0];
  const [adminSelectedSources, setAdminSelectedSources] = useState<string[]>(
    subject.examFiles.map((f) => f.filePath)
  );

  // Question bank state
  const [stats, setStats] = useState<ExamStats | null>(null);
  const [allPermittedQuestions, setAllPermittedQuestions] = useState<Question[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [liveUpdatedNotice, setLiveUpdatedNotice] = useState(false);

  // Chapter & Smart Selection (multi-select chapters)
  const [selectedChapters, setSelectedChapters] = useState<string[]>(['all']);
  const [chapterProgress, setChapterProgress] = useState<SubjectProgress | null>(null);

  // Active counts & options
  const [mcqCount, setMcqCount] = useState<number>(40);
  const [essayCount, setEssayCount] = useState<number>(0);
  const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(true);
  const [shuffleOptions, setShuffleOptions] = useState<boolean>(true);
  const [timeMode, setTimeMode] = useState<TimeMode>('auto');
  const [customMinutesInput, setCustomMinutesInput] = useState<number>(45);
  const [seed, setSeed] = useState<string>(
    initialSeed || examDefinitionService.generateUniqueSeed()
  );

  // Shared exam definition recognition state (Section 6)
  const [matchedExamDef, setMatchedExamDef] = useState<ExamDefinition | null>(null);
  const [checkingSeed, setCheckingSeed] = useState(false);

  // Check auth & permissions
  useEffect(() => {
    let isMounted = true;
    authService.getCurrentUser().then((user) => {
      if (isMounted) {
        setCurrentUser(user);
        setUserLoaded(true);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const isAdmin = Boolean(currentUser?.isAdmin);

  // Determine user permission tier (Section 4)
  const userPermissionTier: SubjectPermissionTier = useMemo(() => {
    if (isAdmin) return 100;
    if (currentUser?.subjectPermissions?.[subject.id]) {
      return currentUser.subjectPermissions[subject.id];
    }
    return 25; // Default 25% for unauthenticated or ungranted users
  }, [isAdmin, currentUser, subject.id]);

  // Load and analyze questions
  const fetchQuestionsAndStats = useCallback(
    async (forceReload = false, preserveCounts = false) => {
      if (!userLoaded) return;

      setLoadingStats(true);
      setStatsError(null);

      try {
        let permitted: Question[];

        if (isAdmin) {
          const sourcesToLoad =
            adminSelectedSources.length > 0
              ? adminSelectedSources
              : subject.examFiles.map((f) => f.filePath);
          permitted = await loadMultipleExamFiles(sourcesToLoad, { forceReload });
        } else {
          // Regular users: load each source with its specific permission tier
          const results: Question[] = [];
          for (const file of subject.examFiles) {
            const raw = await loadExamFile(file.filePath, { forceReload });
            const sourceKey = `${subject.id}::${file.filePath}`;
            const labelKey = `${subject.id}::${file.label}`;
            const codeKey = `${subject.code}::${file.filePath}`;
            const tier: SubjectPermissionTier =
              currentUser?.subjectPermissions?.[sourceKey] ||
              currentUser?.subjectPermissions?.[labelKey] ||
              currentUser?.subjectPermissions?.[codeKey] ||
              currentUser?.subjectPermissions?.[subject.id] ||
              currentUser?.subjectPermissions?.[subject.code] ||
              25;
            const permittedFromSource = getPermittedQuestions(
              raw,
              tier,
              `${subject.id}-${file.label}`
            );
            results.push(...permittedFromSource);
          }
          permitted = deduplicateQuestions(results);
        }

        const computedStats = extractExamStats(permitted);
        setStats(computedStats);
        setAllPermittedQuestions(permitted);
        setLoadingStats(false);

        if (!preserveCounts) {
          setMcqCount(computedStats.mcqCount > 0 ? Math.min(40, computedStats.mcqCount) : 0);
          setEssayCount(computedStats.essayCount > 0 ? Math.min(2, computedStats.essayCount) : 0);
        } else {
          setMcqCount((prev) => Math.min(prev, computedStats.mcqCount));
          setEssayCount((prev) => Math.min(prev, computedStats.essayCount));
        }
      } catch (err) {
        setStatsError((err as Error).message || 'Không thể tải câu hỏi.');
        setLoadingStats(false);
      }
    },
    [userLoaded, isAdmin, adminSelectedSources, subject.examFiles, currentUser, subject.id, subject.code]
  );

  useEffect(() => {
    fetchQuestionsAndStats(false, false);
  }, [fetchQuestionsAndStats]);

  // Listen for HMR file changes
  useEffect(() => {
    const unsubscribe = onExamCacheUpdated((updatedPath) => {
      if (!updatedPath || subject.examFiles.some((f) => canonicalizeExamPath(f.filePath) === canonicalizeExamPath(updatedPath))) {
        fetchQuestionsAndStats(true, true);
        setLiveUpdatedNotice(true);
        setTimeout(() => setLiveUpdatedNotice(false), 3500);
      }
    });
    return unsubscribe;
  }, [subject.examFiles, fetchQuestionsAndStats]);

  // Check seed for existing shared exam definition (Section 6)
  useEffect(() => {
    const cleanSeed = seed.trim().toUpperCase();
    if (!cleanSeed) {
      setMatchedExamDef(null);
      return;
    }

    let isMounted = true;
    setCheckingSeed(true);

    examDefinitionService
      .getExamDefinitionBySeed(cleanSeed)
      .then((def) => {
        if (!isMounted) return;
        setCheckingSeed(false);
        if (def && def.subjectId === subject.id) {
          setMatchedExamDef(def);
          // Restore configuration from shared definition
          if (def.config.mcqCount !== undefined) setMcqCount(def.config.mcqCount);
          if (def.config.essayCount !== undefined) setEssayCount(def.config.essayCount);
          if (def.config.shuffleQuestions !== undefined) setShuffleQuestions(def.config.shuffleQuestions);
          if (def.config.shuffleOptions !== undefined) setShuffleOptions(def.config.shuffleOptions);
          if (def.config.selectedChapters && def.config.selectedChapters.length > 0) {
            setSelectedChapters(def.config.selectedChapters);
          } else if (def.config.selectedChapter) {
            setSelectedChapters([def.config.selectedChapter]);
          }
          if (isAdmin && def.config.examFilePaths && def.config.examFilePaths.length > 0) {
            setAdminSelectedSources(def.config.examFilePaths);
          }
        } else {
          setMatchedExamDef(null);
        }
      })
      .catch(() => {
        if (isMounted) {
          setCheckingSeed(false);
          setMatchedExamDef(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [seed, subject.id, isAdmin]);

  // Compute available limits based on selected chapters
  const activeQuestions = useMemo(() => {
    if (selectedChapters.includes('all') || selectedChapters.length === 0) {
      return allPermittedQuestions;
    }
    const targetSet = new Set(selectedChapters.map((c) => c.trim().toLowerCase()));
    return allPermittedQuestions.filter((q) => {
      const qCh = q.chapter !== undefined ? String(q.chapter).trim().toLowerCase() : '';
      const qName = q.chapter_name ? q.chapter_name.trim().toLowerCase() : '';
      return targetSet.has(qCh) || targetSet.has(qName) || targetSet.has(`chương ${qCh}`);
    });
  }, [allPermittedQuestions, selectedChapters]);

  const maxAvailableMcq = useMemo(
    () => activeQuestions.filter((q) => q.type !== 'essay').length,
    [activeQuestions]
  );
  const maxAvailableEssay = useMemo(
    () => activeQuestions.filter((q) => q.type === 'essay').length,
    [activeQuestions]
  );

  // Chapter selection handlers
  const handleToggleChapter = (chapterId: string) => {
    if (matchedExamDef) return; // Locked on shared exam

    if (chapterId === 'all') {
      setSelectedChapters(['all']);
      return;
    }

    let updated = selectedChapters.filter((c) => c !== 'all');
    if (updated.includes(chapterId)) {
      updated = updated.filter((c) => c !== chapterId);
      if (updated.length === 0) {
        updated = ['all'];
      }
    } else {
      updated.push(chapterId);
    }
    setSelectedChapters(updated);
  };

  const handleSelectAllChapters = () => {
    if (matchedExamDef) return;
    setSelectedChapters(['all']);
  };

  // Admin source selection handlers
  const handleToggleAdminSource = (filePath: string) => {
    if (matchedExamDef) return;
    let updated: string[];
    if (adminSelectedSources.includes(filePath)) {
      updated = adminSelectedSources.filter((p) => p !== filePath);
      if (updated.length === 0) {
        updated = [filePath]; // Keep at least one
      }
    } else {
      updated = [...adminSelectedSources, filePath];
    }
    setAdminSelectedSources(updated);
  };

  const handleSelectAllAdminSources = () => {
    if (matchedExamDef) return;
    setAdminSelectedSources(subject.examFiles.map((f) => f.filePath));
  };

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // Compute calculated duration in minutes
  const totalQuestions = mcqCount + essayCount;
  const calculatedMinutes = Math.max(
    15,
    Math.ceil((totalQuestions * 1.5) / 5) * 5
  );

  const handleStart = async () => {
    if (totalQuestions <= 0) return;

    const cleanSeed = seed.trim().toUpperCase() || generateSeed();
    const resolvedCustomMinutes =
      timeMode === 'auto'
        ? calculatedMinutes
        : timeMode === 'custom'
        ? Math.max(1, Math.min(300, customMinutesInput || 45))
        : undefined;

    const sources = isAdmin
      ? adminSelectedSources
      : subject.examFiles.map((f) => f.filePath);

    const config: QuizConfig = {
      subjectId: subject.id,
      examFilePath: sources[0] || '',
      examFilePaths: sources,
      mcqCount,
      essayCount,
      shuffleQuestions,
      shuffleOptions,
      timeMode,
      customMinutes: resolvedCustomMinutes,
      seed: cleanSeed,
      selectedChapter: selectedChapters[0] || 'all',
      selectedChapters,
      examDefinitionId: matchedExamDef?.id,
      prioritizeLeastAttempted: true,
    };

    onStartQuiz(config);
  };

  const mcqPresets = [10, 20, 40, 60].filter((c) => c <= maxAvailableMcq);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-hidden overscroll-contain"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiz-setup-title"
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full my-auto max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-900 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-5 sm:p-6 relative shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Đóng cửa sổ"
          >
            <X size={18} />
          </button>

          <div className="flex items-center flex-wrap gap-2.5">
            <span className="px-2.5 py-0.5 bg-blue-600 rounded-md text-xs font-mono font-bold tracking-wider">
              {subject.code}
            </span>
            <span className="text-xs text-slate-300 font-medium">
              Học kỳ {subject.semester}
            </span>
            {isAdmin && (
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-md text-[11px] font-semibold flex items-center gap-1">
                <Shield size={12} /> Quyền: {userPermissionTier}%
              </span>
            )}
          </div>

          <h2
            id="quiz-setup-title"
            className="text-xl sm:text-2xl font-bold mt-2 text-white pr-8"
          >
            {subject.name}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
            {subject.description || 'Cấu hình bộ câu hỏi và thời gian làm bài kiểm tra.'}
          </p>
        </div>

        {/* Notice on Error Reports (Section 9.1) */}
        <div className="bg-blue-50/80 dark:bg-blue-950/40 border-b border-blue-100 dark:border-blue-900/60 px-5 py-2.5 flex items-center gap-2 text-xs text-blue-900 dark:text-blue-200 font-medium shrink-0">
          <HelpCircle size={15} className="text-blue-600 dark:text-blue-400 shrink-0" />
          <span>
            Nếu phát hiện câu hỏi có đáp án hoặc lời giải chưa chính xác, hãy sử dụng chức năng <strong>Báo lỗi</strong> để admin kiểm tra và chỉnh sửa.
          </span>
        </div>

        {/* Form Body */}
        <div className="p-5 sm:p-6 space-y-5 flex-1 overflow-y-auto custom-scrollbar">
          {/* Shared Exam Definition Notice (Section 6) */}
          {matchedExamDef && (
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl space-y-1 text-xs text-amber-950 dark:text-amber-200">
              <div className="flex items-center gap-1.5 font-bold">
                <Lock size={14} className="text-amber-600 dark:text-amber-400" />
                <span>Đề thi dùng chung đã tồn tại (Mã: {matchedExamDef.seed})</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                Đề thi này được tạo bởi <strong className="font-mono">{matchedExamDef.creatorEmail || 'Người dùng hệ thống'}</strong>.
                Số câu, môn học và chủ đề đã được khóa để tái lập chính xác đề thi gốc. Bạn có thể tự do điều chỉnh <strong>Thời gian làm bài</strong>.
              </p>
            </div>
          )}

          {/* ADMIN: Multi-Select Exam Sources (Section 3.2) */}
          {isAdmin && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FileText size={14} className="text-blue-600" />
                  Nguồn đề thi (Admin chọn nhiều nguồn):
                </label>
                <button
                  type="button"
                  disabled={Boolean(matchedExamDef)}
                  onClick={handleSelectAllAdminSources}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold disabled:opacity-50"
                >
                  Chọn tất cả
                </button>
              </div>

              <div className="space-y-1.5">
                {subject.examFiles.map((f) => {
                  const isSelected = adminSelectedSources.includes(f.filePath);
                  return (
                    <label
                      key={f.filePath}
                      className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-medium'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      } ${matchedExamDef ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={Boolean(matchedExamDef)}
                          checked={isSelected}
                          onChange={() => handleToggleAdminSource(f.filePath)}
                          className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                        />
                        <span>{f.label}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Question Bank Status */}
          {loadingStats ? (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-center text-sm text-slate-500 dark:text-slate-400 animate-pulse">
              {isAdmin
                ? `Đang chuẩn bị tập câu hỏi hợp lệ (${userPermissionTier}% ngân hàng)...`
                : 'Đang chuẩn bị ngân hàng câu hỏi...'}
            </div>
          ) : statsError ? (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
              <span>{statsError}</span>
              <button
                type="button"
                onClick={() => fetchQuestionsAndStats(true, false)}
                className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-700 rounded-lg font-semibold shrink-0 cursor-pointer"
              >
                Thử lại
              </button>
            </div>
          ) : stats && isAdmin ? (
            <div className="flex items-center justify-between gap-2 p-3 bg-blue-50/70 dark:bg-slate-800/80 border border-blue-100 dark:border-slate-700 rounded-xl text-xs text-blue-950 dark:text-blue-200">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="font-semibold">
                  Tập câu hỏi khả dụng: <strong>{stats.totalCount} câu</strong> (
                  {stats.mcqCount} trắc nghiệm{stats.essayCount > 0 ? `, ${stats.essayCount} tự luận` : ''}) · Mức quyền: {userPermissionTier}%
                </span>
              </div>

              <button
                type="button"
                onClick={() => fetchQuestionsAndStats(true, true)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/80 dark:bg-slate-700 hover:bg-white text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-slate-600 font-semibold transition-colors shrink-0 cursor-pointer"
                title="Đọc lại dữ liệu mới nhất từ file JSON"
              >
                <RefreshCw size={12} />
                <span className="hidden sm:inline">Làm mới</span>
              </button>
            </div>
          ) : null}

          {liveUpdatedNotice && (
            <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 font-medium">
              <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
              <span>Đã tự động cập nhật dữ liệu mới nhất từ file JSON trên đĩa.</span>
            </div>
          )}

          {/* Multi-Chapter / Topic Selection (Section 3.2) */}
          {stats && stats.chapters && stats.chapters.length > 0 && (
            <div className="p-4 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-slate-50 dark:from-slate-800/70 dark:via-slate-800/50 dark:to-slate-800/30 border border-blue-200/80 dark:border-slate-700 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-blue-950 dark:text-blue-200 flex items-center gap-1.5">
                  <BookOpen size={15} className="text-blue-600 dark:text-blue-400" />
                  Chủ đề / Chương ôn tập (Chọn nhiều chủ đề):
                </label>
                {!matchedExamDef && (
                  <button
                    type="button"
                    onClick={handleSelectAllChapters}
                    className="text-xs text-blue-700 dark:text-blue-300 hover:underline font-semibold"
                  >
                    Tất cả các chương
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                    selectedChapters.includes('all')
                      ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-xs'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                  } ${matchedExamDef ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={Boolean(matchedExamDef)}
                      checked={selectedChapters.includes('all')}
                      onChange={() => handleToggleChapter('all')}
                      className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                    />
                    <span>📚 Tất cả các chương</span>
                  </div>
                  {isAdmin && <span className="text-[11px] opacity-80">{stats.totalCount} câu</span>}
                </label>

                {stats.chapters.map((ch) => {
                  const isChecked = selectedChapters.includes(ch.id);
                  return (
                    <label
                      key={ch.id}
                      className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                        isChecked && !selectedChapters.includes('all')
                          ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-400 dark:border-blue-700 text-blue-900 dark:text-blue-200 font-semibold'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                      } ${matchedExamDef ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <input
                          type="checkbox"
                          disabled={Boolean(matchedExamDef)}
                          checked={isChecked && !selectedChapters.includes('all')}
                          onChange={() => handleToggleChapter(ch.id)}
                          className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                        />
                        <span className="truncate">{ch.name}</span>
                      </div>
                      {isAdmin && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                          {ch.count} câu
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* MCQ Count Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Số câu hỏi trắc nghiệm
              </label>
              {isAdmin && (
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Khả dụng: <strong>{maxAvailableMcq}</strong> câu
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={maxAvailableMcq}
                disabled={Boolean(matchedExamDef)}
                value={mcqCount}
                onChange={(e) =>
                  setMcqCount(
                    Math.max(0, Math.min(maxAvailableMcq, parseInt(e.target.value) || 0))
                  )
                }
                className="w-24 p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-center font-bold text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-600 disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:cursor-not-allowed"
              />

              {!matchedExamDef && (
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {mcqPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setMcqCount(preset)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        mcqCount === preset
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                  {maxAvailableMcq > 0 && !mcqPresets.includes(maxAvailableMcq) && (
                    <button
                      type="button"
                      onClick={() => setMcqCount(maxAvailableMcq)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        mcqCount === maxAvailableMcq
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {isAdmin ? `Tất cả (${maxAvailableMcq})` : 'Tất cả'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Essay Count Selection */}
          {maxAvailableEssay > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Số câu hỏi tự luận
                </label>
                {isAdmin && (
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Khả dụng: <strong>{maxAvailableEssay}</strong> câu
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={maxAvailableEssay}
                  disabled={Boolean(matchedExamDef)}
                  value={essayCount}
                  onChange={(e) =>
                    setEssayCount(
                      Math.max(0, Math.min(maxAvailableEssay, parseInt(e.target.value) || 0))
                    )
                  }
                  className="w-24 p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-center font-bold text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-600 disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:cursor-not-allowed"
                />

                {!matchedExamDef && (
                  <button
                    type="button"
                    onClick={() => setEssayCount(maxAvailableEssay)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      essayCount === maxAvailableEssay
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {isAdmin ? `Tất cả (${maxAvailableEssay})` : 'Tất cả'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Shuffle Options */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <label className={`flex items-center gap-3 select-none ${matchedExamDef ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                disabled={Boolean(matchedExamDef)}
                checked={shuffleQuestions}
                onChange={(e) => setShuffleQuestions(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-slate-300 dark:border-slate-600 dark:bg-slate-800"
              />
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Shuffle size={15} className="text-slate-500 dark:text-slate-400" /> Xáo trộn thứ tự câu hỏi
              </span>
            </label>

            <label className={`flex items-center gap-3 select-none ${matchedExamDef ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                disabled={Boolean(matchedExamDef)}
                checked={shuffleOptions}
                onChange={(e) => setShuffleOptions(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-slate-300 dark:border-slate-600 dark:bg-slate-800"
              />
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Shuffle size={15} className="text-slate-500 dark:text-slate-400" /> Xáo trộn thứ tự đáp án
              </span>
            </label>
          </div>

          {/* Time Limit Setting (Always customizable, even on shared exam!) */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
              Thời gian làm bài (Có thể tùy chỉnh):
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { mode: 'auto', label: `Tự động (${calculatedMinutes}p)` },
                { mode: 'unlimited', label: 'Không giới hạn' },
                { mode: '15', label: '15 phút' },
                { mode: '30', label: '30 phút' },
                { mode: '45', label: '45 phút' },
                { mode: '60', label: '60 phút' },
              ].map((item) => (
                <button
                  key={item.mode}
                  type="button"
                  onClick={() => setTimeMode(item.mode as TimeMode)}
                  className={`p-2.5 rounded-xl border text-xs sm:text-sm font-semibold transition-all text-left flex items-center gap-2 cursor-pointer ${
                    timeMode === item.mode
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 ring-1 ring-blue-600'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Clock
                    size={14}
                    className={
                      timeMode === item.mode
                        ? 'text-blue-600 shrink-0'
                        : 'text-slate-400 shrink-0'
                    }
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Seed Input (Section 6) */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Mã đề / Seed
              </label>
              <button
                type="button"
                onClick={() => setSeed(examDefinitionService.generateUniqueSeed())}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
              >
                <RotateCw size={12} /> Tạo mã mới
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={seed}
                placeholder="VD: A7F3K2"
                className="w-full p-2.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-mono font-bold tracking-widest text-slate-800 dark:text-slate-100 uppercase outline-none select-all cursor-default"
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Mã đề được hệ thống tự động sinh ngẫu nhiên để tránh trùng lặp. Nhấn &quot;Tạo mã mới&quot; để đổi mã khác. Để làm lại đề thi cũ, vui lòng nhập mã tại Trang chủ.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-sm transition-colors cursor-pointer"
          >
            Đóng
          </button>
          <button
            type="button"
            disabled={loadingStats || totalQuestions <= 0}
            onClick={handleStart}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm shadow-md hover:shadow transition-all flex items-center gap-2 cursor-pointer"
          >
            <Play size={16} fill="currentColor" /> BẮT ĐẦU LÀM BÀI ({totalQuestions} CÂU)
          </button>
        </div>
      </div>
    </div>
  );
};
