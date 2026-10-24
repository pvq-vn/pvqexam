import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SUBJECT_CATALOG } from '../data/subjectCatalog';
import { Subject, QuizConfig, ExamDefinition, TimeMode } from '../types/quiz';
import { examDefinitionService } from '../services/examDefinitionService';
import { UserProfile } from '../services/authService';
import {
  BookOpen,
  Search,
  Sparkles,
  ChevronRight,
  Layers,
  X,
  Award,
  Key,
  Clock,
  Play,
  Lock,
  Globe,
  AlertCircle,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface HomePageProps {
  currentUser?: UserProfile | null;
  onSelectSubject: (subject: Subject) => void;
  onStartQuiz?: (config: QuizConfig) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  currentUser,
  onSelectSubject,
  onStartQuiz,
}) => {
  const [selectedSemester, setSelectedSemester] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Existing seed & public exams state
  const [enterSeedInput, setEnterSeedInput] = useState<string>('');
  const [seedSearchError, setSeedSearchError] = useState<string | null>(null);
  const [searchingSeed, setSearchingSeed] = useState(false);
  const [selectedExistingDef, setSelectedExistingDef] = useState<ExamDefinition | null>(null);
  const [existingDefTimeMode, setExistingDefTimeMode] = useState<TimeMode>('auto');
  const [existingDefCustomMinutes, setExistingDefCustomMinutes] = useState<number>(45);

  const [publicExams, setPublicExams] = useState<ExamDefinition[]>([]);
  const [loadingPublicExams, setLoadingPublicExams] = useState(false);
  const [adminExamTab, setAdminExamTab] = useState<'all' | 'public' | 'private'>('all');
  const [isExamsShowcaseExpanded, setIsExamsShowcaseExpanded] = useState<boolean>(false);

  const semesters = ['all', '2026.2', '2026.1', '2025.2'];

  // Load public exams (and admin's private exams if logged in as admin)
  useEffect(() => {
    let isMounted = true;
    setLoadingPublicExams(true);
    const fetchExams = currentUser?.isAdmin
      ? examDefinitionService.getAllExamDefinitions()
      : examDefinitionService.getPublicExamDefinitions();

    fetchExams.then((exams) => {
      if (isMounted) {
        setPublicExams(exams);
        setLoadingPublicExams(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [currentUser?.isAdmin]);

  // Keyboard shortcut '/' to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Search existing seed to launch exam
  const handleSearchExistingSeed = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanSeed = enterSeedInput.trim().toUpperCase();
    if (!cleanSeed) return;

    setSearchingSeed(true);
    setSeedSearchError(null);

    try {
      const def = await examDefinitionService.getExamDefinitionBySeed(cleanSeed);
      if (!def) {
        setSeedSearchError('Mã đề không tồn tại, đã bị xóa hoặc chưa từng được tạo trước đây!');
      } else {
        setSelectedExistingDef(def);
        setExistingDefTimeMode(def.config.timeMode || 'auto');
        setExistingDefCustomMinutes(def.config.customMinutes || 45);
        setEnterSeedInput('');
      }
    } catch (err) {
      setSeedSearchError('Không thể tìm kiếm mã đề. Vui lòng thử lại!');
    } finally {
      setSearchingSeed(false);
    }
  };

  const handleStartExistingExam = () => {
    if (!selectedExistingDef || !onStartQuiz) return;

    const targetSubject = SUBJECT_CATALOG.find(
      (s) =>
        s.id === selectedExistingDef.subjectId ||
        s.code.toLowerCase() === selectedExistingDef.subjectCode.toLowerCase()
    );

    const resolvedTimeMode = existingDefTimeMode;
    const resolvedCustomMinutes =
      resolvedTimeMode === 'custom' ? existingDefCustomMinutes : undefined;

    const launchConfig: QuizConfig = {
      ...selectedExistingDef.config,
      subjectId: targetSubject ? targetSubject.id : selectedExistingDef.subjectId,
      seed: selectedExistingDef.seed,
      examDefinitionId: selectedExistingDef.id,
      timeMode: resolvedTimeMode,
      customMinutes: resolvedCustomMinutes,
    };

    onStartQuiz(launchConfig);
    setSelectedExistingDef(null);
  };

  const filteredSubjects = SUBJECT_CATALOG.filter((subj) => {
    const matchesSemester =
      selectedSemester === 'all' || subj.semester === selectedSemester;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      subj.code.toLowerCase().includes(q) ||
      subj.name.toLowerCase().includes(q) ||
      (subj.description || '').toLowerCase().includes(q);
    return matchesSemester && matchesSearch;
  });

  return (
    <div className="space-y-8 pb-16">
      {/* Hero Header */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white p-7 sm:p-11 shadow-xl border border-slate-800">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-80 h-80 bg-red-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-12 w-64 h-64 bg-blue-600/15 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xs border border-white/15 text-xs font-semibold text-rose-300">
            <Sparkles size={14} />
            <span>Ngân hàng đề thi trắc nghiệm & tự luận CNTT HUST</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
            <span className="text-red-500 font-black">pvq</span>exam
          </h1>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
            Nền tảng ôn luyện kiến thức, thi thử trắc nghiệm & tự luận các học
            phần chuyên ngành Công nghệ thông tin — Đại học Bách Khoa Hà Nội.
            Hiển thị chuẩn công thức toán học LaTeX, sơ đồ UML/mạng và chấm điểm
            phân tích tức thì.
          </p>

          <div className="pt-2 flex flex-wrap gap-3 text-xs font-semibold text-slate-200">
            <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
              ✓ {SUBJECT_CATALOG.length} Học phần chuyên ngành
            </span>
            <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
              ✓ Ngân hàng câu hỏi có đáp án & giải thích chi tiết
            </span>
            <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
              ✓ Tái tạo đề thi chuẩn xác bằng Seed
            </span>
          </div>
        </div>
      </section>

      {/* SECTION: Nhập mã đề có sẵn & Đề thi Public */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Key size={18} />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                Vào thi bằng mã đề có sẵn
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Nhập mã đề bạn đã làm trước đó hoặc mã đề nhận từ giảng viên / bạn bè để tải lại đúng đề thi gốc.
            </p>
          </div>

          {/* Seed Input Form */}
          <form
            onSubmit={handleSearchExistingSeed}
            className="flex items-center gap-2 self-start md:self-auto w-full md:w-auto"
          >
            <div className="relative flex-1 md:w-64">
              <input
                type="text"
                value={enterSeedInput}
                onChange={(e) => {
                  setEnterSeedInput(e.target.value.toUpperCase());
                  if (seedSearchError) setSeedSearchError(null);
                }}
                maxLength={14}
                placeholder="Nhập mã đề (VD: LE4DED)..."
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-mono font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-600 shadow-2xs"
              />
            </div>
            <button
              type="submit"
              disabled={searchingSeed || !enterSeedInput.trim()}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Play size={14} fill="currentColor" />
              <span>{searchingSeed ? 'Đang tìm...' : 'Vào đề thi'}</span>
            </button>
          </form>
        </div>

        {/* Error message */}
        {seedSearchError && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2 animate-in fade-in">
            <AlertCircle size={15} className="shrink-0" />
            <span>{seedSearchError}</span>
          </div>
        )}

        {/* Public & Admin Private Exams Showcase (with tabs for Admin) */}
        {publicExams.length > 0 && (() => {
          const publicCount = publicExams.filter((e) => e.isPublic).length;
          const privateCount = publicExams.filter((e) => !e.isPublic).length;
          const displayedExams = publicExams.filter((exam) => {
            if (!currentUser?.isAdmin) return exam.isPublic;
            if (adminExamTab === 'public') return exam.isPublic;
            if (adminExamTab === 'private') return !exam.isPublic;
            return true;
          });

          return (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-bold text-slate-700 dark:text-slate-300">
                <div
                  onClick={() => setIsExamsShowcaseExpanded(!isExamsShowcaseExpanded)}
                  className="flex items-center gap-2 cursor-pointer select-none group"
                >
                  <Globe size={15} className="text-indigo-500 group-hover:scale-110 transition-transform" />
                  <span className="group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {currentUser?.isAdmin
                      ? 'Kho đề thi hệ thống & Admin tự tạo:'
                      : 'Đề thi công khai (Public) do hệ thống cung cấp:'}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                    {publicExams.length} đề
                  </span>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
                  {currentUser?.isAdmin && isExamsShowcaseExpanded && (
                    <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs">
                      <button
                        type="button"
                        onClick={() => setAdminExamTab('all')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          adminExamTab === 'all'
                            ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        Tất cả ({publicExams.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdminExamTab('public')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                          adminExamTab === 'public'
                            ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        <Globe size={13} />
                        Công khai ({publicCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdminExamTab('private')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                          adminExamTab === 'private'
                            ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        <Lock size={13} />
                        Riêng tư ({privateCount})
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsExamsShowcaseExpanded(!isExamsShowcaseExpanded)}
                    className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    {isExamsShowcaseExpanded ? (
                      <>
                        <ChevronUp size={14} /> Thu gọn
                      </>
                    ) : (
                      <>
                        <ChevronDown size={14} /> Chọn đề có sẵn ({displayedExams.length})
                      </>
                    )}
                  </button>
                </div>
              </div>

              {isExamsShowcaseExpanded && (
                displayedExams.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 animate-in fade-in">
                    {adminExamTab === 'public'
                      ? 'Chưa có đề thi công khai nào.'
                      : adminExamTab === 'private'
                      ? 'Chưa có đề thi riêng tư nào của Admin.'
                      : 'Không có đề thi nào trong danh mục này.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-in fade-in duration-150">
                  {displayedExams.map((exam) => {
                    const isPrivate = !exam.isPublic;
                    return (
                      <div
                        key={exam.id}
                        onClick={() => {
                          setSelectedExistingDef(exam);
                          setExistingDefTimeMode(exam.config.timeMode || 'auto');
                          setExistingDefCustomMinutes(exam.config.customMinutes || 45);
                        }}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                          isPrivate
                            ? 'border-indigo-300 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/30 hover:border-indigo-500'
                            : 'border-slate-200 dark:border-slate-700 hover:border-indigo-500 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded font-mono font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[11px]">
                                {exam.subjectCode}
                              </span>
                              {isPrivate ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-200/80 dark:bg-indigo-900/80 text-indigo-800 dark:text-indigo-200 text-[10px] font-bold">
                                  <Lock size={10} /> Riêng tư
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                                  <Globe size={10} /> Công khai
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[10px] text-slate-400">
                              Mã: {exam.seed}
                            </span>
                          </div>
                          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 line-clamp-1">
                            {exam.title || `Đề thi ${exam.subjectCode}`}
                          </h4>
                        </div>
                        <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500">
                          <span>{exam.totalQuestions || exam.questionIds.length} câu hỏi</span>
                          <span className="text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-0.5">
                            Vào thi <ChevronRight size={12} />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })()}
      </section>

      {/* Filter and Search Bar */}
      <section className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Semester Tabs */}
        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-x-auto">
          {semesters.map((sem) => (
            <button
              key={sem}
              type="button"
              onClick={() => setSelectedSemester(sem)}
              className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
                selectedSemester === sem
                  ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {sem === 'all' ? 'Tất cả kỳ học' : `Học kỳ ${sem}`}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[270px] sm:w-80">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
          />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm mã môn, tên môn (Nhấn / để tìm)..."
            className="w-full pl-9 pr-8 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 shadow-2xs transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md cursor-pointer"
              aria-label="Xóa từ khóa tìm kiếm"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </section>

      {/* Subject Cards Grid */}
      <section>
        {filteredSubjects.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-3">
            <BookOpen size={40} className="text-slate-300 dark:text-slate-700 mx-auto" />
            <h3 className="font-bold text-slate-700 dark:text-slate-300">
              Không tìm thấy môn học phù hợp
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Thử tìm kiếm với từ khóa khác hoặc chọn &quot;Tất cả kỳ học&quot;.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedSemester('all');
                setSearchQuery('');
              }}
              className="px-4 py-2 bg-slate-900 dark:bg-blue-600 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Đặt lại bộ lọc
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredSubjects.map((subj) => (
              <div
                key={subj.id}
                onClick={() => onSelectSubject(subj)}
                className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-400 p-5 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-mono font-bold">
                      {subj.code}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {subj.badge && (
                        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/70 dark:border-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Award size={11} />
                          {subj.badge}
                        </span>
                      )}
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full">
                        Kỳ {subj.semester}
                      </span>
                    </div>
                  </div>

                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base sm:text-lg group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug mb-2">
                    {subj.name}
                  </h3>

                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed mb-4">
                    {subj.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <Layers size={14} className="text-slate-400" />
                    <span>
                      {currentUser?.isAdmin
                        ? `${subj.examFiles.length} bộ ngân hàng đề`
                        : 'Ngân hàng đề đã sẵn sàng'}
                    </span>
                  </div>

                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                    Cấu hình & Thi <ChevronRight size={14} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* MODAL: Vào thi bằng mã đề có sẵn (Portaled to document.body to cover full top bar evenly) */}
      {selectedExistingDef &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto overscroll-contain animate-in fade-in duration-150"
            onClick={() => setSelectedExistingDef(null)}
          >
            <div
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full my-6 overflow-hidden animate-in fade-in zoom-in-95 text-slate-900 dark:text-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white p-5 flex items-center justify-between">
                <div>
                  <span className="px-2 py-0.5 rounded font-mono font-bold bg-indigo-500/30 text-indigo-200 text-xs">
                    Mã đề: {selectedExistingDef.seed}
                  </span>
                  <h3 className="font-bold text-lg mt-1 text-white">
                    {selectedExistingDef.title || `Đề thi môn ${selectedExistingDef.subjectCode}`}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedExistingDef(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-5 sm:p-6 space-y-4">
                <div className="p-3.5 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Môn học:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {selectedExistingDef.subjectCode} -{' '}
                      {SUBJECT_CATALOG.find((s) => s.id === selectedExistingDef.subjectId || s.code === selectedExistingDef.subjectCode)?.name || selectedExistingDef.subjectCode}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Số câu hỏi:</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">
                      {selectedExistingDef.totalQuestions || selectedExistingDef.questionIds.length} câu
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Phạm vi chủ đề:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {selectedExistingDef.config.selectedChapters?.join(', ') ||
                        selectedExistingDef.config.selectedChapter ||
                        'Tất cả các chương'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Người tạo:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[220px]">
                      {selectedExistingDef.creatorName || selectedExistingDef.creatorEmail || 'Hệ thống'}
                    </span>
                  </div>
                </div>

                {/* Time Mode Selection */}
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Clock size={14} className="text-indigo-600" />
                    Điều chỉnh thời gian làm bài
                  </label>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { mode: 'auto', label: 'Tự động' },
                      { mode: 'unlimited', label: 'Không giới hạn' },
                      { mode: '15', label: '15 phút' },
                      { mode: '30', label: '30 phút' },
                      { mode: '45', label: '45 phút' },
                      { mode: '60', label: '60 phút' },
                    ].map((item) => (
                      <button
                        key={item.mode}
                        type="button"
                        onClick={() => setExistingDefTimeMode(item.mode as TimeMode)}
                        className={`p-2 rounded-xl border text-xs font-semibold transition-all text-left flex items-center gap-1.5 cursor-pointer ${
                          existingDefTimeMode === item.mode
                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 ring-1 ring-indigo-600'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Clock
                          size={13}
                          className={
                            existingDefTimeMode === item.mode
                              ? 'text-indigo-600 shrink-0'
                              : 'text-slate-400 shrink-0'
                          }
                        />
                        <span className="truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedExistingDef(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={handleStartExistingExam}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Play size={14} fill="currentColor" /> BẮT ĐẦU LÀM BÀI
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
