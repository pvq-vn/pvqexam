import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Subject, QuizConfig, QuizAttempt } from './types/quiz';
import { SUBJECT_CATALOG } from './data/subjectCatalog';
import { Navbar } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { QuizSetupModal } from './components/QuizSetupModal';
import { AuthModal } from './components/AuthModal';
import { draftService, QuizDraft } from './services/draftService';
import { authService, UserProfile } from './services/authService';
import { AlertCircle, Play, Trash2 } from 'lucide-react';

// Lazy-load QuizPage and secondary routes for faster initial Home startup
const QuizPage = lazy(() =>
  import('./pages/QuizPage').then((m) => ({ default: m.QuizPage }))
);
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage }))
);
const AdminReportsPage = lazy(() =>
  import('./pages/AdminReportsPage').then((m) => ({
    default: m.AdminReportsPage,
  }))
);

export function App() {
  const [currentRoute, setCurrentRoute] = useState<
    'home' | 'quiz' | 'history' | 'admin'
  >('home');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Setup modal state
  const [setupSubject, setSetupSubject] = useState<Subject | null>(null);
  const [setupSeed, setSetupSeed] = useState<string | undefined>(undefined);

  // Active quiz session state
  const [activeSubject, setActiveSubject] = useState<Subject | null>(null);
  const [activeConfig, setActiveConfig] = useState<QuizConfig | null>(null);
  const [resumedDraft, setResumedDraft] = useState<QuizDraft | null>(null);
  const [reopenAttempt, setReopenAttempt] = useState<QuizAttempt | null>(null);

  // Draft banner state on home/other pages
  const [activeDraft, setActiveDraft] = useState<QuizDraft | null>(null);

  // Initialize Auth & Draft check
  useEffect(() => {
    authService.getCurrentUser().then(setCurrentUser);
    const unsubscribe = authService.onAuthStateChange(setCurrentUser);

    const draft = draftService.getDraft();
    if (draft) {
      setActiveDraft(draft);
    }

    return () => {
      unsubscribe();
    };
  }, []);

  // Parse URL hash for direct links e.g. #/quiz/IT3080?seed=A7F3K2
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/history')) {
        setCurrentRoute('history');
      } else if (hash.startsWith('#/admin')) {
        authService.getCurrentUser().then((user) => {
          if (user?.isAdmin) {
            setCurrentRoute('admin');
          } else {
            setCurrentRoute('home');
            window.location.hash = '#/';
          }
        });
      } else if (hash.startsWith('#/quiz/')) {
        const parts = hash.replace('#/quiz/', '').split('?');
        const subjectCode = parts[0];
        const params = new URLSearchParams(parts[1] || '');
        const targetSubject = SUBJECT_CATALOG.find(
          (s) => s.code.toLowerCase() === subjectCode.toLowerCase()
        );

        if (targetSubject) {
          const seedParam = params.get('seed') || undefined;
          // If the user refreshed the browser while playing an active draft with this subject & seed,
          // automatically resume the draft session instead of popping up the setup modal!
          const savedDraft = draftService.getDraft();
          if (
            savedDraft &&
            savedDraft.subjectId === targetSubject.id &&
            (!seedParam ||
              savedDraft.config.seed.toUpperCase() === seedParam.toUpperCase())
          ) {
            setSetupSubject(null);
            setReopenAttempt(null);
            setActiveSubject(targetSubject);
            setActiveConfig(savedDraft.config);
            setResumedDraft(savedDraft);
            setCurrentRoute('quiz');
            return;
          }

          // Otherwise, if not already playing this quiz, open the setup modal
          setSetupSubject((prev) =>
            currentRoute === 'quiz' ? prev : targetSubject
          );
          setSetupSeed(seedParam);
        }
      } else if (hash === '#/' || hash === '') {
        setCurrentRoute('home');
        setActiveDraft(draftService.getDraft());
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentRoute]);

  // Handle starting a new quiz from configuration
  const handleStartQuiz = (config: QuizConfig) => {
    const subject = SUBJECT_CATALOG.find((s) => s.id === config.subjectId);
    if (!subject) return;

    // Starting a brand-new quiz clears any old draft first
    draftService.clearDraft();
    setSetupSubject(null);
    setReopenAttempt(null);
    setResumedDraft(null);
    setActiveSubject(subject);
    setActiveConfig(config);
    setCurrentRoute('quiz');
    setActiveDraft(null);

    // Update URL hash
    window.location.hash = `#/quiz/${subject.code}?seed=${config.seed}`;
  };

  // Resume draft quiz without losing answers or remaining time
  const handleResumeDraft = () => {
    const draft = activeDraft || draftService.getDraft();
    if (!draft) return;

    const subject = SUBJECT_CATALOG.find((s) => s.id === draft.subjectId);
    if (!subject) return;

    setSetupSubject(null);
    setReopenAttempt(null);
    setResumedDraft(draft);
    setActiveSubject(subject);
    setActiveConfig(draft.config);
    setCurrentRoute('quiz');
    setActiveDraft(null);

    window.location.hash = `#/quiz/${subject.code}?seed=${draft.config.seed}`;
  };

  // Discard draft
  const handleDiscardDraft = () => {
    draftService.clearDraft();
    setActiveDraft(null);
    setResumedDraft(null);
  };

  // Reopen previous attempt in review mode
  const handleReopenAttempt = (attempt: QuizAttempt) => {
    const subject = SUBJECT_CATALOG.find((s) => s.id === attempt.subjectId);
    if (!subject) return;

    setSetupSubject(null);
    setResumedDraft(null);
    setActiveSubject(subject);
    setActiveConfig(attempt.config);
    setReopenAttempt(attempt);
    setCurrentRoute('quiz');

    window.location.hash = `#/quiz/${subject.code}?seed=${attempt.seed}&review=true`;
  };

  // Exit quiz and return home (refreshing activeDraft banner if still in progress)
  const handleExitQuiz = () => {
    setCurrentRoute('home');
    setActiveSubject(null);
    setActiveConfig(null);
    setResumedDraft(null);
    setReopenAttempt(null);
    setActiveDraft(draftService.getDraft());
    window.location.hash = '#/';
  };

  // Retry with same seed
  const handleRetryWithSameSeed = () => {
    if (!activeConfig || !activeSubject) return;
    draftService.clearDraft();
    setReopenAttempt(null);
    setResumedDraft(null);
    handleStartQuiz({ ...activeConfig });
  };

  const handleNavigate = (route: 'home' | 'history' | 'admin') => {
    if (route === 'admin' && !currentUser?.isAdmin) {
      setCurrentRoute('home');
      window.location.hash = '#/';
      return;
    }
    setCurrentRoute(route);
    setActiveDraft(draftService.getDraft());
    if (route === 'home') window.location.hash = '#/';
    if (route === 'history') window.location.hash = '#/history';
    if (route === 'admin') window.location.hash = '#/admin';
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-150">
      {/* Navigation Header */}
      <Navbar
        currentUser={currentUser}
        currentRoute={currentRoute}
        onNavigate={handleNavigate}
        onOpenAuth={() => setShowAuthModal(true)}
      />

      {/* In-Progress Draft Banner */}
      {activeDraft && currentRoute !== 'quiz' && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2.5 shadow-xs text-xs sm:text-sm font-medium">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle size={18} className="shrink-0" />
              <span>
                Bạn đang có bài làm dở môn{' '}
                <strong>
                  {activeDraft.subjectCode} - {activeDraft.subjectName}
                </strong>{' '}
                ({Object.keys(activeDraft.answers || {}).length}/
                {activeDraft.questions.length} câu đã chọn · Mã đề{' '}
                <code className="font-mono font-bold">
                  {activeDraft.config.seed}
                </code>
                ).
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResumeDraft}
                className="px-3 py-1 bg-slate-950 hover:bg-slate-900 text-white rounded-lg font-bold text-xs flex items-center gap-1 transition-colors"
              >
                <Play size={12} fill="currentColor" /> Tiếp tục làm
              </button>
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="px-3 py-1 bg-white/80 hover:bg-white text-slate-900 rounded-lg font-semibold text-xs flex items-center gap-1 transition-colors"
              >
                <Trash2 size={12} /> Hủy bài dở
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {currentRoute === 'home' && (
          <HomePage
            onSelectSubject={(subject) => {
              setSetupSubject(subject);
              setSetupSeed(undefined);
            }}
          />
        )}

        <Suspense
          fallback={
            <div className="p-12 text-center text-sm text-slate-500 dark:text-slate-400">
              Đang tải trang...
            </div>
          }
        >
          {currentRoute === 'quiz' && activeSubject && activeConfig && (
            <QuizPage
              subject={activeSubject}
              config={activeConfig}
              initialAttempt={reopenAttempt}
              initialDraft={resumedDraft}
              onExit={handleExitQuiz}
              onRetryWithSameSeed={handleRetryWithSameSeed}
            />
          )}

          {currentRoute === 'history' && (
            <HistoryPage
              onReopenAttempt={handleReopenAttempt}
              onNavigateHome={() => handleNavigate('home')}
            />
          )}

          {currentRoute === 'admin' && (
            currentUser?.isAdmin ? (
              <AdminReportsPage onNavigateHome={() => handleNavigate('home')} />
            ) : (
              <div className="text-center py-20 space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
                  <AlertCircle size={32} />
                </div>
                <h2 className="text-xl font-bold">Khu vực dành riêng cho Quản trị viên</h2>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Bạn cần đăng nhập bằng tài khoản Quản trị viên để truy cập tính năng này.
                </p>
                <button
                  type="button"
                  onClick={() => handleNavigate('home')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 cursor-pointer"
                >
                  Quay về trang chủ
                </button>
              </div>
            )
          )}
        </Suspense>
      </div>

      {/* Quiz Configuration Modal */}
      {setupSubject && (
        <QuizSetupModal
          subject={setupSubject}
          initialSeed={setupSeed}
          onStartQuiz={handleStartQuiz}
          onCancel={() => setSetupSubject(null)}
        />
      )}

      {/* Authentication Modal */}
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={(user) => {
            setCurrentUser(user);
          }}
        />
      )}

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-6 mt-12 text-center text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 space-y-1">
          <p className="font-semibold text-slate-700 dark:text-slate-300">
            pvqexam — Hệ thống luyện thi trắc nghiệm & tự luận CNTT HUST
          </p>
          <p>
            Dữ liệu câu hỏi được lưu giữ nguyên bản (Read-only) từ kho tài liệu{' '}
            <code>pvq-vn/hust-it1-materials</code>.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
