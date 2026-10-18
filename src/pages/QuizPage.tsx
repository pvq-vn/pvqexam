import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import confetti from 'canvas-confetti';
import {
  Question,
  Subject,
  QuizConfig,
  QuizResult,
  QuizAttempt,
} from '../types/quiz';
import { loadExamFile } from '../data/dataLoader';
import { sampleAndPrepareQuestions } from '../engine/sampler';
import { calculateQuizResult } from '../engine/scoring';
import { QuestionCard } from '../components/QuestionCard';
import {
  QuestionNavigator,
  isQuestionAnswered,
} from '../components/QuestionNavigator';
import { TimerDisplay } from '../components/TimerDisplay';
import { ErrorReportModal } from '../components/ErrorReportModal';
import { draftService, QuizDraft } from '../services/draftService';
import { historyService } from '../services/historyService';
import { authService, UserProfile } from '../services/authService';
import {
  Clock,
  Send,
  RefreshCcw,
  AlertCircle,
  Copy,
  ChevronLeft,
  Filter,
  LayoutGrid,
  ArrowUp,
  X,
} from 'lucide-react';

interface QuizPageProps {
  subject: Subject;
  config: QuizConfig;
  initialAttempt?: QuizAttempt | null;
  initialDraft?: QuizDraft | null;
  onExit: () => void;
  onRetryWithSameSeed: () => void;
}

type QuestionFilter =
  | 'all'
  | 'unanswered'
  | 'flagged'
  | 'wrong'
  | 'correct'
  | 'essay';

function computeTotalSecondsFromConfig(config: QuizConfig): number {
  if (config.timeMode === 'unlimited') return 0;
  if (config.timeMode === 'auto') {
    const minutes =
      config.customMinutes ||
      Math.max(
        15,
        Math.ceil(((config.mcqCount + config.essayCount) * 1.5) / 5) * 5
      );
    return minutes * 60;
  }
  if (config.timeMode === 'custom') {
    return (config.customMinutes || 45) * 60;
  }
  return parseInt(config.timeMode, 10) * 60;
}

export const QuizPage: React.FC<QuizPageProps> = ({
  subject,
  config,
  initialAttempt,
  initialDraft,
  onExit,
  onRetryWithSameSeed,
}) => {
  // Game states: 'loading', 'playing', 'review'
  const [gameState, setGameState] = useState<'loading' | 'playing' | 'review'>(
    initialAttempt ? 'review' : 'loading'
  );
  const [loadingError, setLoadingError] = useState<string | null>(null);

  // Core quiz state
  const [questions, setQuestions] = useState<Question[]>(
    initialAttempt ? initialAttempt.questions : []
  );
  const [answers, setAnswers] = useState<
    Record<string | number, string | string[]>
  >(initialAttempt ? initialAttempt.answers : {});
  const [flagged, setFlagged] = useState<(string | number)[]>(
    initialAttempt ? initialAttempt.flagged : []
  );
  const [activeFilter, setActiveFilter] = useState<QuestionFilter>('all');

  // Time management — isolated in ref to prevent per-second re-renders of the question list
  const [totalDuration, setTotalDuration] = useState<number>(() =>
    computeTotalSecondsFromConfig(config)
  );
  const [initialTimerSeconds, setInitialTimerSeconds] = useState<number>(() =>
    initialAttempt ? 0 : computeTotalSecondsFromConfig(config)
  );
  const timeRemainingRef = useRef<number>(
    initialAttempt ? 0 : computeTotalSecondsFromConfig(config)
  );
  const [startedAt, setStartedAt] = useState<string>(() =>
    initialAttempt ? initialAttempt.startedAt : new Date().toISOString()
  );

  // Results
  const [result, setResult] = useState<QuizResult | null>(
    initialAttempt ? initialAttempt.result : null
  );

  // Modals & UI
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [reportingQuestion, setReportingQuestion] = useState<Question | null>(
    null
  );
  const [copiedSeed, setCopiedSeed] = useState(false);

  // Current user
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  const mainScrollRef = useRef<HTMLDivElement>(null);
  const draftStateRef = useRef({
    gameState,
    questions,
    subject,
    config,
    answers,
    flagged,
    totalDuration,
    startedAt,
  });
  draftStateRef.current = {
    gameState,
    questions,
    subject,
    config,
    answers,
    flagged,
    totalDuration,
    startedAt,
  };

  const saveCurrentDraft = useCallback(() => {
    const draft = draftStateRef.current;
    if (draft.gameState !== 'playing' || draft.questions.length === 0) return;

    draftService.saveDraft({
      subjectId: draft.subject.id,
      subjectName: draft.subject.name,
      subjectCode: draft.subject.code,
      config: draft.config,
      questions: draft.questions,
      answers: draft.answers,
      flagged: draft.flagged,
      timeRemaining: timeRemainingRef.current,
      totalDuration: draft.totalDuration,
      startedAt: draft.startedAt,
    });
  }, []);

  useEffect(() => {
    authService.getCurrentUser().then(setCurrentUser);
  }, []);

  // Show/hide scroll-to-top button
  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 500);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // 1. Initial Data Loading, Draft Restoration & Question Preparation
  useEffect(() => {
    if (initialAttempt) {
      setQuestions(initialAttempt.questions);
      setAnswers(initialAttempt.answers);
      setFlagged(initialAttempt.flagged);
      setResult(initialAttempt.result);
      setStartedAt(initialAttempt.startedAt);
      setActiveFilter('all');
      setGameState('review');
      return;
    }

    // Check if we have a matching saved draft (passed via prop or persisted in localStorage across F5 refresh)
    const candidateDraft = initialDraft || draftService.getDraft();
    if (
      candidateDraft &&
      candidateDraft.subjectId === subject.id &&
      candidateDraft.config.seed === config.seed &&
      candidateDraft.questions.length > 0
    ) {
      setQuestions(candidateDraft.questions);
      setAnswers(candidateDraft.answers || {});
      setFlagged(candidateDraft.flagged || []);
      setTotalDuration(candidateDraft.totalDuration);
      setInitialTimerSeconds(candidateDraft.timeRemaining);
      timeRemainingRef.current = candidateDraft.timeRemaining;
      setStartedAt(candidateDraft.startedAt);
      setResult(null);
      setActiveFilter('all');
      setGameState('playing');
      return;
    }

    let isMounted = true;
    setGameState('loading');
    setLoadingError(null);
    setActiveFilter('all');

    loadExamFile(config.examFilePath)
      .then((allQuestions) => {
        if (!isMounted) return;

        if (allQuestions.length === 0) {
          throw new Error('Ngân hàng câu hỏi không có dữ liệu');
        }

        const prepared = sampleAndPrepareQuestions(allQuestions, config);
        const totalSecs = computeTotalSecondsFromConfig(config);
        const nowIso = new Date().toISOString();

        setQuestions(prepared);
        setAnswers({});
        setFlagged([]);
        setResult(null);
        setTotalDuration(totalSecs);
        setInitialTimerSeconds(totalSecs);
        timeRemainingRef.current = totalSecs;
        setStartedAt(nowIso);
        setGameState('playing');

        // Initial draft save
        draftService.saveDraft({
          subjectId: subject.id,
          subjectName: subject.name,
          subjectCode: subject.code,
          config,
          questions: prepared,
          answers: {},
          flagged: [],
          timeRemaining: totalSecs,
          totalDuration: totalSecs,
          startedAt: nowIso,
        });
      })
      .catch((err) => {
        if (isMounted) {
          setLoadingError((err as Error).message || 'Không thể tải đề thi.');
          setGameState('loading');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [
    subject.id,
    subject.name,
    subject.code,
    config.examFilePath,
    config.seed,
    initialAttempt,
    initialDraft,
  ]);

  // 2. Save draft whenever answers or flagged questions change
  useEffect(() => {
    if (gameState !== 'playing' || questions.length === 0) return;
    saveCurrentDraft();
  }, [answers, flagged, gameState, questions, saveCurrentDraft]);

  // 3. Persist countdown periodically (every 15s) and immediately on tab hide / reload
  useEffect(() => {
    if (gameState !== 'playing' || questions.length === 0) return;

    const periodicTimer = setInterval(() => {
      saveCurrentDraft();
    }, 15000);

    const handleVisibilityOrUnload = () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentDraft();
      }
    };

    window.addEventListener('beforeunload', saveCurrentDraft);
    document.addEventListener('visibilitychange', handleVisibilityOrUnload);

    return () => {
      clearInterval(periodicTimer);
      window.removeEventListener('beforeunload', saveCurrentDraft);
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityOrUnload
      );
    };
  }, [gameState, questions.length, saveCurrentDraft]);

  // Timer tick handler — updates ref only (0 re-renders on QuizPage)
  const handleTimerTick = useCallback((seconds: number) => {
    timeRemainingRef.current = seconds;
  }, []);

  // Answer handler
  const handleAnswerChange = useCallback(
    (qId: string | number, value: string | string[]) => {
      if (gameState !== 'playing') return;
      setAnswers((prev) => ({
        ...prev,
        [qId]: value,
      }));
    },
    [gameState]
  );

  // Flag toggle
  const handleToggleFlag = useCallback(
    (qId: string | number) => {
      if (gameState !== 'playing') return;
      setFlagged((prev) =>
        prev.includes(qId) ? prev.filter((id) => id !== qId) : [...prev, qId]
      );
    },
    [gameState]
  );

  const handleReportClick = useCallback((question: Question) => {
    setReportingQuestion(question);
  }, []);

  const handleOpenSubmitConfirm = useCallback(() => {
    setShowMobileNav(false);
    setShowSubmitConfirm(true);
  }, []);

  // Scroll smoothly to question (unfiltering if needed)
  const scrollToQuestion = useCallback((qId: string | number) => {
    setShowMobileNav(false);
    const el = document.getElementById(`question-${qId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      // Question was hidden by active filter — reset filter to 'all' then scroll
      setActiveFilter('all');
      setTimeout(() => {
        const target = document.getElementById(`question-${qId}`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
    }
  }, []);

  // Final submission logic
  const handleFinalSubmit = useCallback(() => {
    setShowSubmitConfirm(false);
    setShowMobileNav(false);

    const draft = draftStateRef.current;
    const elapsedFromClock = Math.max(
      1,
      Math.round((Date.now() - new Date(draft.startedAt).getTime()) / 1000)
    );
    const timeSpent =
      draft.totalDuration > 0
        ? Math.max(1, draft.totalDuration - timeRemainingRef.current)
        : elapsedFromClock;

    const computedResult = calculateQuizResult(
      draft.questions,
      draft.answers,
      timeSpent
    );
    setResult(computedResult);
    setActiveFilter('all');
    setGameState('review');

    // Clear active draft
    draftService.clearDraft();

    // Trigger confetti if score is great
    if (computedResult.score10 >= 8.0) {
      try {
        confetti({
          particleCount: 90,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {
        // ignore
      }
    }

    // Save attempt to history
    const attempt: QuizAttempt = {
      id: `attempt-${Date.now()}`,
      userId: currentUser?.id,
      subjectId: draft.subject.id,
      subjectName: draft.subject.name,
      subjectCode: draft.subject.code,
      seed: draft.config.seed,
      score10: computedResult.score10,
      totalScoredQuestions: computedResult.totalScoredQuestions,
      correctCount: computedResult.correctCount,
      unansweredCount: computedResult.unansweredCount,
      essayCount: computedResult.essayCount,
      timeSpentSeconds: timeSpent,
      startedAt: draft.startedAt,
      submittedAt: new Date().toISOString(),
      config: draft.config,
      questions: draft.questions,
      answers: draft.answers,
      flagged: draft.flagged,
      result: computedResult,
    };

    historyService.saveAttempt(attempt);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentUser?.id]);

  const copySeed = () => {
    navigator.clipboard.writeText(config.seed);
    setCopiedSeed(true);
    setTimeout(() => setCopiedSeed(false), 2000);
  };

  const flaggedSet = useMemo(() => new Set(flagged), [flagged]);

  const answeredCount = useMemo(
    () =>
      questions.filter((q) => isQuestionAnswered(q, answers[q.id])).length,
    [questions, answers]
  );
  const unansweredCount = questions.length - answeredCount;

  // Filtered question list preserving original index (`idx`)
  const visibleQuestions = useMemo(() => {
    return questions
      .map((q, idx) => ({ q, idx }))
      .filter(({ q }) => {
        if (activeFilter === 'all') return true;
        if (activeFilter === 'flagged') return flaggedSet.has(q.id);
        if (activeFilter === 'unanswered') {
          if (gameState === 'review' && result) {
            return (
              q.type !== 'essay' &&
              Boolean(result.evaluations[q.id]?.isUnanswered)
            );
          }
          return !isQuestionAnswered(q, answers[q.id]);
        }
        if (gameState === 'review' && result) {
          const ev = result.evaluations[q.id];
          if (activeFilter === 'wrong') {
            return q.type !== 'essay' && ev && !ev.isCorrect && !ev.isUnanswered;
          }
          if (activeFilter === 'correct') {
            return q.type !== 'essay' && Boolean(ev?.isCorrect);
          }
          if (activeFilter === 'essay') {
            return q.type === 'essay';
          }
        }
        return true;
      });
  }, [questions, activeFilter, flaggedSet, gameState, result, answers]);

  // Format seconds to string mm:ss
  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m} phút ${s < 10 ? '0' : ''}${s} giây`;
  };

  // LOADING STATE
  if (gameState === 'loading') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
        {loadingError ? (
          <div className="max-w-md p-6 bg-white rounded-2xl border border-rose-200 shadow-xs space-y-4">
            <AlertCircle size={40} className="text-rose-500 mx-auto" />
            <h3 className="font-bold text-slate-800 text-lg">
              Không thể tải đề thi
            </h3>
            <p className="text-xs text-rose-600 leading-relaxed">
              {loadingError}
            </p>
            <div className="flex gap-2 justify-center pt-2">
              <button
                type="button"
                onClick={onExit}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Quay về danh sách môn
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
              >
                Thử lại
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <h3 className="font-bold text-slate-800 text-lg">
              Đang chuẩn bị đề thi...
            </h3>
            <p className="text-xs text-slate-500">
              Đang tải ngân hàng {subject.code} & áp dụng mã đề{' '}
              <strong className="font-mono">{config.seed}</strong>
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row pb-20 md:pb-12">
      {/* LEFT/SIDEBAR NAVIGATOR (STICKY ON DESKTOP) */}
      <aside className="w-full md:w-80 md:h-[calc(100vh-5rem)] md:sticky top-20 flex flex-col shrink-0 space-y-3.5 mb-5 md:mb-0 md:pr-5">
        {/* Course Banner Card */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-blue-700 text-xs px-2 py-0.5 bg-blue-50 rounded-md border border-blue-200/80">
                {subject.code}
              </span>
              <span className="text-[11px] text-slate-400 font-medium">
                · Kỳ {subject.semester}
              </span>
            </div>
            <h2
              className="font-bold text-slate-800 text-sm truncate mt-1"
              title={subject.name}
            >
              {subject.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => {
              saveCurrentDraft();
              onExit();
            }}
            className="px-2.5 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl text-xs flex items-center gap-1 font-semibold transition-colors shrink-0"
            title="Thoát khỏi bài thi (Tiến độ làm bài được lưu tự động)"
          >
            <ChevronLeft size={15} /> Thoát
          </button>
        </div>

        {/* Timer Box (in playing mode) */}
        {gameState === 'playing' && (
          <div className="hidden md:flex items-center justify-between bg-white px-4 py-3 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Thời gian
            </span>
            <TimerDisplay
              initialTimeRemaining={initialTimerSeconds}
              totalDuration={totalDuration}
              isPaused={gameState !== 'playing'}
              onTimeUpdate={handleTimerTick}
              onTimeUp={handleFinalSubmit}
            />
          </div>
        )}

        {/* Navigator Component (Desktop) */}
        <div className="hidden md:block flex-1 min-h-[280px]">
          <QuestionNavigator
            questions={questions}
            answers={answers}
            flagged={flagged}
            isReview={gameState === 'review'}
            evaluations={result?.evaluations}
            onSubmitClick={handleOpenSubmitConfirm}
            onRetryClick={onExit}
            onScrollToQuestion={scrollToQuestion}
          />
        </div>
      </aside>

      {/* RIGHT: MAIN QUESTIONS CONTENT */}
      <main className="flex-1 min-w-0 md:pl-1" ref={mainScrollRef}>
        {/* REVIEW STATS BANNER */}
        {gameState === 'review' && result && (
          <section className="mb-6 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs animate-in fade-in duration-200">
            <div className="text-center mb-5">
              <span className="inline-block px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
                Kết quả bài kiểm tra
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                {result.score10 >= 8.0
                  ? 'Xuất sắc! 🎉'
                  : result.score10 >= 5.0
                  ? 'Đã hoàn thành! 👍'
                  : 'Cần ôn tập thêm 📚'}
              </h2>
            </div>

            {/* Score Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center mb-5">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80">
                <div className="text-3xl sm:text-4xl font-black text-blue-600">
                  {result.score10.toFixed(2)}
                </div>
                <div className="text-[11px] font-bold text-slate-500 mt-1 uppercase tracking-wider">
                  Điểm / Thang 10
                </div>
              </div>

              <div className="p-4 bg-emerald-50/80 rounded-xl border border-emerald-200/80 text-emerald-900">
                <div className="text-3xl sm:text-4xl font-black text-emerald-600">
                  {result.correctCount}
                </div>
                <div className="text-[11px] font-bold text-emerald-700 mt-1 uppercase tracking-wider">
                  Câu đúng
                </div>
              </div>

              <div className="p-4 bg-rose-50/80 rounded-xl border border-rose-200/80 text-rose-900">
                <div className="text-3xl sm:text-4xl font-black text-rose-600">
                  {result.wrongCount}
                </div>
                <div className="text-[11px] font-bold text-rose-700 mt-1 uppercase tracking-wider">
                  Câu sai
                </div>
              </div>

              <div className="p-4 bg-amber-50/80 rounded-xl border border-amber-200/80 text-amber-900">
                <div className="text-3xl sm:text-4xl font-black text-amber-600">
                  {result.unansweredCount}
                </div>
                <div className="text-[11px] font-bold text-amber-700 mt-1 uppercase tracking-wider">
                  Bỏ trống
                </div>
              </div>
            </div>

            {/* Essay Notice */}
            {result.essayCount > 0 && (
              <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs sm:text-sm text-blue-950 mb-4 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Đề thi có <strong>{result.essayCount} câu tự luận</strong>{' '}
                  (không tính vào điểm trắc nghiệm, hãy đối chiếu câu trả lời
                  với Đáp án mẫu phía dưới).
                </span>
                <span className="font-bold text-blue-700 shrink-0">
                  Trắc nghiệm: {result.score10.toFixed(2)}/10
                </span>
              </div>
            )}

            {/* Time spent & Seed info */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-1.5 font-medium">
                <Clock size={14} /> Thời gian hoàn thành:{' '}
                <strong className="text-slate-700">
                  {formatSeconds(result.timeSpentSeconds)}
                </strong>
              </div>

              <div className="flex items-center gap-2">
                <span>
                  Mã đề:{' '}
                  <strong className="font-mono text-slate-800">
                    {config.seed}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={copySeed}
                  className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold flex items-center gap-1 transition-colors"
                  title="Sao chép mã đề"
                >
                  <Copy size={12} /> {copiedSeed ? 'Đã chép' : 'Chép'}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onRetryWithSameSeed}
                className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs sm:text-sm shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCcw size={15} /> Làm lại đề này (Cùng Seed)
              </button>
              <button
                type="button"
                onClick={onExit}
                className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs sm:text-sm shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                Làm đề khác / Môn khác
              </button>
            </div>
          </section>
        )}

        {/* FILTER BAR FOR QUICK NAVIGATION */}
        <div className="mb-4 bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
            <Filter size={14} className="text-slate-400" />
            <span>Lọc câu hỏi:</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(gameState === 'review' && result
              ? [
                  { id: 'all', label: `Tất cả (${questions.length})` },
                  { id: 'wrong', label: `Câu sai (${result.wrongCount})` },
                  {
                    id: 'unanswered',
                    label: `Bỏ trống (${result.unansweredCount})`,
                  },
                  { id: 'correct', label: `Câu đúng (${result.correctCount})` },
                  ...(result.essayCount > 0
                    ? [{ id: 'essay', label: `Tự luận (${result.essayCount})` }]
                    : []),
                  ...(flagged.length > 0
                    ? [{ id: 'flagged', label: `Cắm cờ (${flagged.length})` }]
                    : []),
                ]
              : [
                  { id: 'all', label: `Tất cả (${questions.length})` },
                  {
                    id: 'unanswered',
                    label: `Chưa làm (${unansweredCount})`,
                  },
                  { id: 'flagged', label: `Đã cắm cờ (${flagged.length})` },
                ]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id as QuestionFilter)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeFilter === tab.id
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* QUESTIONS LIST */}
        {visibleQuestions.length === 0 ? (
          <div className="p-12 bg-white rounded-2xl border border-slate-200 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-700">
              Không có câu hỏi nào thuộc bộ lọc hiện tại.
            </p>
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors"
            >
              Hiển thị tất cả câu hỏi
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {visibleQuestions.map(({ q, idx }) => (
              <QuestionCard
                key={q.id}
                question={q}
                index={idx}
                userAnswer={answers[q.id]}
                isFlagged={flaggedSet.has(q.id)}
                isReview={gameState === 'review'}
                evaluation={result?.evaluations[q.id]}
                onAnswerChange={handleAnswerChange}
                onToggleFlag={handleToggleFlag}
                onReportClick={handleReportClick}
              />
            ))}
          </div>
        )}

        {/* SUBMIT BUTTON AT BOTTOM */}
        {gameState === 'playing' && (
          <div className="mt-8 p-6 bg-white rounded-2xl border border-slate-200 shadow-xs text-center">
            <h3 className="font-bold text-slate-800 text-base mb-1">
              Bạn đã kiểm tra kỹ toàn bộ các câu hỏi?
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Đã hoàn thành <strong>{answeredCount}</strong> /{' '}
              {questions.length} câu hỏi. Sau khi nộp bài, hệ thống sẽ chấm điểm
              và hiển thị giải thích chi tiết.
            </p>
            <button
              type="button"
              onClick={handleOpenSubmitConfirm}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-md transition-all inline-flex items-center gap-2"
            >
              <Send size={16} /> NỘP BÀI THI
            </button>
          </div>
        )}
      </main>

      {/* MOBILE STICKY BOTTOM BAR (< md) */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-xs border-t border-slate-200 px-3 py-2.5 flex items-center justify-between gap-2 shadow-lg">
        {gameState === 'playing' ? (
          <TimerDisplay
            initialTimeRemaining={initialTimerSeconds}
            totalDuration={totalDuration}
            isPaused={gameState !== 'playing'}
            onTimeUpdate={handleTimerTick}
            onTimeUp={handleFinalSubmit}
            compact
          />
        ) : (
          <span className="text-xs font-bold text-slate-700 px-2">
            Điểm: {result?.score10.toFixed(2)}/10
          </span>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowMobileNav(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5"
          >
            <LayoutGrid size={14} />
            <span>
              {answeredCount}/{questions.length} câu
            </span>
          </button>

          {gameState === 'playing' && (
            <button
              type="button"
              onClick={handleOpenSubmitConfirm}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs"
            >
              <Send size={13} /> Nộp bài
            </button>
          )}
        </div>
      </div>

      {/* MOBILE NAVIGATOR DRAWER MODAL */}
      {showMobileNav && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex flex-col justify-end overscroll-contain"
          onClick={() => setShowMobileNav(false)}
        >
          <div
            className="bg-white rounded-t-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="font-bold text-sm text-slate-800">
                Danh sách câu hỏi
              </span>
              <button
                type="button"
                onClick={() => setShowMobileNav(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-3 overflow-y-auto">
              <QuestionNavigator
                questions={questions}
                answers={answers}
                flagged={flagged}
                isReview={gameState === 'review'}
                evaluations={result?.evaluations}
                onSubmitClick={handleOpenSubmitConfirm}
                onRetryClick={onExit}
                onScrollToQuestion={scrollToQuestion}
              />
            </div>
          </div>
        </div>
      )}

      {/* SCROLL TO TOP BUTTON */}
      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-16 md:bottom-6 right-4 md:right-6 z-30 p-3 rounded-full bg-slate-900/90 hover:bg-slate-900 text-white shadow-lg transition-all"
          title="Lên đầu trang"
          aria-label="Lên đầu trang"
        >
          <ArrowUp size={18} />
        </button>
      )}

      {/* CONFIRMATION SUBMIT MODAL */}
      {showSubmitConfirm && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overscroll-contain"
          onClick={() => setShowSubmitConfirm(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <AlertCircle size={44} className="text-blue-600 mx-auto" />
            <h3 className="font-bold text-slate-900 text-lg">
              Xác nhận nộp bài thi?
            </h3>

            {unansweredCount > 0 ? (
              <p className="text-xs text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-200 leading-relaxed">
                Bạn còn <strong>{unansweredCount} câu chưa hoàn thành</strong>.
                Các câu trắc nghiệm bỏ trống sẽ được tính là 0 điểm.
              </p>
            ) : (
              <p className="text-xs text-slate-600 leading-relaxed">
                Bạn đã hoàn thành đầy đủ {questions.length} câu hỏi. Bạn có muốn
                nộp bài và chấm điểm ngay bây giờ?
              </p>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-colors"
              >
                Tiếp tục làm
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors"
              >
                Nộp bài ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ERROR REPORT MODAL */}
      {reportingQuestion && (
        <ErrorReportModal
          question={reportingQuestion}
          subjectId={subject.id}
          subjectCode={subject.code}
          onClose={() => setReportingQuestion(null)}
        />
      )}
    </div>
  );
};
