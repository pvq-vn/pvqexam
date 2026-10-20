import React, { useState, useEffect, useCallback } from 'react';
import { Subject, QuizConfig, TimeMode, Question, SubjectProgress } from '../types/quiz';
import {
  getExamStats,
  ExamStats,
  loadExamFile,
  onExamCacheUpdated,
  canonicalizeExamPath,
} from '../data/dataLoader';
import { generateSeed } from '../engine/shuffle';
import { questionStatsService } from '../services/questionStatsService';
import { authService } from '../services/authService';
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
  Sparkles,
  Layers,
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
  const defaultFile =
    subject.examFiles.find((f) => f.isDefault) || subject.examFiles[0];
  const [selectedFile, setSelectedFile] = useState(defaultFile.filePath);
  const [stats, setStats] = useState<ExamStats | null>(null);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [liveUpdatedNotice, setLiveUpdatedNotice] = useState(false);

  // Chapter & Smart Selection
  const [selectedChapter, setSelectedChapter] = useState<string>('all');
  const [prioritizeLeastAttempted, setPrioritizeLeastAttempted] = useState<boolean>(true);
  const [chapterProgress, setChapterProgress] = useState<SubjectProgress | null>(null);

  // Active counts
  const [mcqCount, setMcqCount] = useState<number>(40);
  const [essayCount, setEssayCount] = useState<number>(0);
  const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(true);
  const [shuffleOptions, setShuffleOptions] = useState<boolean>(true);
  const [timeMode, setTimeMode] = useState<TimeMode>('auto');
  const [customMinutesInput, setCustomMinutesInput] = useState<number>(45);
  const [seed, setSeed] = useState<string>(initialSeed || generateSeed());

  // Determine active chapter limits
  const activeChapter = stats?.chapters?.find((c) => c.id === selectedChapter);
  const maxAvailableMcq = activeChapter ? activeChapter.mcqCount : (stats?.mcqCount || 0);
  const maxAvailableEssay = activeChapter ? activeChapter.essayCount : (stats?.essayCount || 0);
  const maxAvailableTotal = activeChapter ? activeChapter.count : (stats?.totalCount || 0);

  const fetchStats = useCallback(
    (forceReload = false, preserveCounts = false) => {
      setLoadingStats(true);
      setStatsError(null);

      Promise.all([
        getExamStats(selectedFile, { forceReload }),
        loadExamFile(selectedFile, { forceReload }),
      ])
        .then(([resStats, questions]) => {
          setStats(resStats);
          setAllQuestions(questions);
          setLoadingStats(false);

          if (!preserveCounts) {
            setMcqCount(resStats.mcqCount > 0 ? Math.min(40, resStats.mcqCount) : 0);
            setEssayCount(resStats.essayCount > 0 ? Math.min(2, resStats.essayCount) : 0);
          } else {
            setMcqCount((prev) => Math.min(prev, resStats.mcqCount));
            setEssayCount((prev) => Math.min(prev, resStats.essayCount));
          }
        })
        .catch((err) => {
          setStatsError((err as Error).message);
          setLoadingStats(false);
        });
    },
    [selectedFile]
  );

  // Load stats whenever selected exam file changes
  useEffect(() => {
    setSelectedChapter('all');
    fetchStats(false, false);
  }, [fetchStats]);

  // Update progress stats for currently selected chapter / subject
  useEffect(() => {
    if (allQuestions.length === 0) {
      setChapterProgress(null);
      return;
    }

    authService.getCurrentUser().then((user) => {
      let filtered = allQuestions;
      if (selectedChapter !== 'all') {
        const target = selectedChapter.trim().toLowerCase();
        filtered = allQuestions.filter((q) => {
          const qChapterStr = q.chapter !== undefined ? String(q.chapter).trim().toLowerCase() : '';
          const qChapterName = q.chapter_name ? q.chapter_name.trim().toLowerCase() : '';
          const qTopic = q.topic ? q.topic.trim().toLowerCase() : '';
          return (
            qChapterStr === target ||
            qChapterName === target ||
            qTopic === target ||
            `chương ${qChapterStr}` === target
          );
        });
      }
      const progress = questionStatsService.getSubjectProgress(
        user?.id,
        subject.id,
        filtered
      );
      setChapterProgress(progress);
    });
  }, [allQuestions, selectedChapter, subject.id]);

  // Listen for live HMR updates when the owner modifies exam.json on disk in dev mode
  useEffect(() => {
    const unsubscribe = onExamCacheUpdated((updatedPath) => {
      if (
        !updatedPath ||
        canonicalizeExamPath(updatedPath).toLowerCase() ===
          canonicalizeExamPath(selectedFile).toLowerCase()
      ) {
        fetchStats(true, true);
        setLiveUpdatedNotice(true);
        setTimeout(() => setLiveUpdatedNotice(false), 3500);
      }
    });
    return unsubscribe;
  }, [selectedFile, fetchStats]);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // Handle chapter change
  const handleChapterChange = (chapterId: string) => {
    setSelectedChapter(chapterId);
    if (!stats) return;

    const ch = stats.chapters?.find((c) => c.id === chapterId);
    const availMcq = ch ? ch.mcqCount : stats.mcqCount;
    const availEssay = ch ? ch.essayCount : stats.essayCount;

    setMcqCount((prev) => (availMcq > 0 ? Math.min(prev > 0 ? prev : 40, availMcq) : 0));
    setEssayCount((prev) => (availEssay > 0 ? Math.min(prev, availEssay) : 0));
  };

  // Compute calculated duration in minutes
  const totalQuestions = mcqCount + essayCount;
  const calculatedMinutes = Math.max(
    15,
    Math.ceil((totalQuestions * 1.5) / 5) * 5
  );

  const handleStart = () => {
    const resolvedCustomMinutes =
      timeMode === 'auto'
        ? calculatedMinutes
        : timeMode === 'custom'
        ? Math.max(1, Math.min(300, customMinutesInput || 45))
        : undefined;

    onStartQuiz({
      subjectId: subject.id,
      examFilePath: selectedFile,
      mcqCount,
      essayCount,
      shuffleQuestions,
      shuffleOptions,
      timeMode,
      customMinutes: resolvedCustomMinutes,
      seed: seed.trim().toUpperCase() || generateSeed(),
      selectedChapter: selectedChapter !== 'all' ? selectedChapter : undefined,
      prioritizeLeastAttempted: true,
    });
  };

  const mcqPresets = [10, 20, 40, 60].filter((c) => c <= maxAvailableMcq);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto overscroll-contain"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiz-setup-title"
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full my-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-900 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-5 sm:p-6 relative">
          <button
            type="button"
            onClick={onCancel}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Đóng cửa sổ"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-0.5 bg-blue-600 rounded-md text-xs font-mono font-bold tracking-wider">
              {subject.code}
            </span>
            <span className="text-xs text-slate-300 font-medium">
              Học kỳ {subject.semester}
            </span>
          </div>
          <h2
            id="quiz-setup-title"
            className="text-xl sm:text-2xl font-bold mt-2 text-white pr-8"
          >
            {subject.name}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
            {subject.description ||
              'Cấu hình bộ câu hỏi và thời gian làm bài kiểm tra.'}
          </p>
        </div>

        {/* Form Body */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[68vh] overflow-y-auto custom-scrollbar">
          {/* File selector if course has multiple banks */}
          {subject.examFiles.length > 1 && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                Chọn nguồn đề thi / ngân hàng câu hỏi
              </label>
              <select
                value={selectedFile}
                onChange={(e) => setSelectedFile(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 font-medium outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
              >
                {subject.examFiles.map((f) => (
                  <option key={f.filePath} value={f.filePath}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Loading or Stats Banner */}
          {loadingStats ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-sm text-slate-500 animate-pulse">
              Đang phân tích ngân hàng câu hỏi...
            </div>
          ) : statsError ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center justify-between gap-2">
              <span>{statsError}</span>
              <button
                type="button"
                onClick={() => fetchStats(true, false)}
                className="px-2.5 py-1 bg-white border border-rose-300 rounded-lg font-semibold shrink-0 hover:bg-rose-100"
              >
                Thử lại
              </button>
            </div>
          ) : stats ? (
            <div className="flex items-center justify-between gap-2 p-3 bg-blue-50/70 dark:bg-slate-800/80 border border-blue-100 dark:border-slate-700 rounded-xl text-xs text-blue-950 dark:text-blue-200">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="font-semibold">
                  Ngân hàng câu hỏi sẵn sàng ({stats.essayCount > 0 ? 'Trắc nghiệm & Tự luận' : 'Trắc nghiệm'})
                </span>
              </div>

              <button
                type="button"
                onClick={() => fetchStats(true, true)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/80 dark:bg-slate-700 hover:bg-white text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-slate-600 font-semibold transition-colors shrink-0"
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

          {/* Chapter / Topic Selector (for subjects with chapters) */}
          {stats && stats.chapters && stats.chapters.length > 0 && (
            <div className="p-4 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-slate-50 dark:from-slate-800/70 dark:via-slate-800/50 dark:to-slate-800/30 border border-blue-200/80 dark:border-slate-700 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-blue-950 dark:text-blue-200 flex items-center gap-1.5">
                  <BookOpen size={15} className="text-blue-600 dark:text-blue-400" />
                  Chủ đề / Chương ôn tập
                </label>
                <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-100/80 dark:bg-blue-900/50 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Layers size={11} /> {stats.chapters.length} chương
                </span>
              </div>

              <select
                value={selectedChapter}
                onChange={(e) => handleChapterChange(e.target.value)}
                className="w-full p-2.5 bg-white dark:bg-slate-800 border border-blue-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 shadow-2xs"
              >
                <option value="all">
                  📚 Tất cả các chương
                </option>
                {stats.chapters.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    📖 {ch.name}
                  </option>
                ))}
              </select>

              {/* Progress for current selection */}
              {chapterProgress && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-700 dark:text-slate-300 text-[11px] sm:text-xs">
                      Đã làm:{' '}
                      <strong className="text-blue-700 dark:text-blue-400">
                        {chapterProgress.attemptedQuestions} câu
                      </strong>
                    </span>
                  </div>

                  {chapterProgress.totalAttempts > 0 && (
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-100/70 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md">
                      Độ đúng: {chapterProgress.accuracy}%
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* MCQ Count Selection */}
          {stats && maxAvailableMcq > 0 && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Số câu trắc nghiệm
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={maxAvailableMcq}
                    value={mcqCount}
                    onChange={(e) => {
                      const val = Math.max(
                        0,
                        Math.min(maxAvailableMcq, Number(e.target.value) || 0)
                      );
                      setMcqCount(val);
                    }}
                    className="w-16 px-2 py-0.5 text-right text-xs font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700 rounded-md outline-none focus:border-blue-600"
                    aria-label="Số câu trắc nghiệm tùy chỉnh"
                  />
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    câu
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {mcqPresets.map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setMcqCount(count)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border transition-all ${
                      mcqCount === count
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {count} câu
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setMcqCount(maxAvailableMcq)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border transition-all ${
                    mcqCount === maxAvailableMcq
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  Tất cả
                </button>
              </div>
            </div>
          )}

          {/* Essay Count Selection */}
          {stats && maxAvailableEssay > 0 && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Số câu tự luận (Không chấm tự động)
                </label>
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {essayCount} câu
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 5].map((count) => {
                  if (count > maxAvailableEssay) return null;
                  return (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setEssayCount(count)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border transition-all ${
                        essayCount === count
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {count} câu
                    </button>
                  );
                })}
                {maxAvailableEssay > 5 && (
                  <button
                    type="button"
                    onClick={() => setEssayCount(maxAvailableEssay)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border transition-all ${
                      essayCount === maxAvailableEssay
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    Tất cả
                  </button>
                )}
              </div>
            </div>
          )}

          {/* System Default Notice: Smart Prioritization */}
          <div className="flex items-center gap-2.5 p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/40 rounded-xl text-xs text-amber-900 dark:text-amber-200">
            <Sparkles size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="font-medium">
              Hệ thống mặc định tự động ưu tiên các câu hỏi làm ít nhất để tối ưu hóa quá trình học.
            </span>
          </div>

          {/* Shuffle Options */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={shuffleQuestions}
                onChange={(e) => setShuffleQuestions(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-slate-300 dark:border-slate-600 dark:bg-slate-800"
              />
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Shuffle size={15} className="text-slate-500 dark:text-slate-400" /> Xáo trộn thứ tự câu hỏi
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={shuffleOptions}
                onChange={(e) => setShuffleOptions(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-slate-300 dark:border-slate-600 dark:bg-slate-800"
              />
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Shuffle size={15} className="text-slate-500 dark:text-slate-400" /> Xáo trộn thứ tự đáp án
              </span>
            </label>
          </div>

          {/* Time Limit Setting */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
              Thời gian làm bài
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
                  className={`p-2.5 rounded-xl border text-xs sm:text-sm font-semibold transition-all text-left flex items-center gap-2 ${
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

          {/* Seed Input */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Mã đề / Seed tái lập
              </label>
              <button
                type="button"
                onClick={() => setSeed(generateSeed())}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
              >
                <RotateCw size={12} /> Tạo mã ngẫu nhiên
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={seed}
                onChange={(e) => setSeed(e.target.value.toUpperCase())}
                maxLength={12}
                placeholder="VD: A7F3K2"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-mono font-bold tracking-widest text-slate-800 dark:text-slate-100 uppercase focus:border-blue-600 outline-none"
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Nhập lại cùng một mã Seed để tái tạo chính xác bộ câu hỏi và thứ tự
              đề thi.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-sm transition-colors"
          >
            Đóng
          </button>
          <button
            type="button"
            disabled={loadingStats || totalQuestions <= 0}
            onClick={handleStart}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm shadow-md hover:shadow transition-all flex items-center gap-2"
          >
            <Play size={16} fill="currentColor" /> BẮT ĐẦU LÀM BÀI (
            {totalQuestions} CÂU)
          </button>
        </div>
      </div>
    </div>
  );
};
