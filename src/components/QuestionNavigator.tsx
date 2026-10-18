import React, { useMemo } from 'react';
import { RefreshCcw, Send } from 'lucide-react';
import { Question, QuestionEvaluation } from '../types/quiz';

interface QuestionNavigatorProps {
  questions: Question[];
  answers: Record<string | number, string | string[]>;
  flagged: (string | number)[];
  isReview: boolean;
  evaluations?: Record<string | number, QuestionEvaluation>;
  onSubmitClick: () => void;
  onRetryClick?: () => void;
  onScrollToQuestion: (qId: string | number) => void;
}

export function isQuestionAnswered(
  q: Question,
  userAns: string | string[] | undefined
): boolean {
  if (userAns === undefined || userAns === null) return false;
  if (q.type === 'dropdown') {
    if (!Array.isArray(userAns)) return false;
    const expectedSlots = q.correctAnswers?.length || 1;
    if (userAns.length < expectedSlots) return false;
    return userAns
      .slice(0, expectedSlots)
      .every((v) => v !== undefined && String(v).trim() !== '');
  }
  if (Array.isArray(userAns)) {
    return (
      userAns.length > 0 &&
      userAns.some((v) => v !== undefined && String(v).trim() !== '')
    );
  }
  return String(userAns).trim() !== '';
}

const QuestionNavigatorComponent: React.FC<QuestionNavigatorProps> = ({
  questions,
  answers,
  flagged,
  isReview,
  evaluations,
  onSubmitClick,
  onRetryClick,
  onScrollToQuestion,
}) => {
  const answeredCount = useMemo(
    () =>
      questions.filter((q) => isQuestionAnswered(q, answers[q.id])).length,
    [questions, answers]
  );

  const progressPercent =
    questions.length > 0
      ? Math.round((answeredCount / questions.length) * 100)
      : 0;

  const flaggedSet = useMemo(() => new Set(flagged), [flagged]);

  const getButtonStyles = (q: Question) => {
    const qId = q.id;
    const isAnswered = isQuestionAnswered(q, answers[qId]);

    if (isReview) {
      if (q.type === 'essay') {
        return 'bg-blue-600 text-white border-blue-600';
      }
      const evalItem = evaluations ? evaluations[qId] : undefined;
      if (!evalItem || evalItem.isUnanswered) {
        return 'bg-amber-400 text-white border-amber-400 shadow-2xs';
      }
      if (evalItem.isCorrect) {
        return 'bg-emerald-500 text-white border-emerald-500 shadow-2xs';
      }
      return 'bg-rose-500 text-white border-rose-500 shadow-2xs';
    }

    // Playing state
    if (isAnswered) {
      return 'bg-blue-600 text-white border-blue-600 font-bold shadow-2xs';
    }
    return 'bg-white text-slate-700 border-slate-200 hover:border-blue-400 hover:bg-blue-50/40';
  };

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
      {/* Navigator Header + Progress Bar */}
      <div className="p-4 border-b border-slate-100 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm">
            {isReview ? 'Tổng quan kết quả' : 'Tiến độ làm bài'}
          </h3>
          <span className="text-xs text-slate-600 font-semibold">
            {answeredCount} / {questions.length} đã làm
          </span>
        </div>

        {!isReview && (
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* Grid of Question Numbers */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar max-h-72 md:max-h-none">
        <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-5 gap-2">
          {questions.map((q, idx) => {
            const isFlagged = flaggedSet.has(q.id);
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => onScrollToQuestion(q.id)}
                className={`relative flex items-center justify-center h-9 sm:h-10 w-full rounded-lg border text-xs sm:text-sm font-semibold transition-all ${getButtonStyles(
                  q
                )}`}
                aria-label={`Chuyển tới câu ${idx + 1}`}
              >
                {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}

                {/* Flag Dot */}
                {isFlagged && (
                  <span
                    className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 border-2 border-white rounded-full"
                    title="Đã cắm cờ"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-600">
          {!isReview ? (
            <>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-600 rounded-xs shrink-0" />
                <span>Đã làm ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-white border border-slate-300 rounded-xs shrink-0" />
                <span>Chưa làm ({questions.length - answeredCount})</span>
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <div className="w-3 h-3 bg-amber-500 rounded-full shrink-0" />
                <span>Đã đặt cờ ({flagged.length})</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-emerald-500 rounded-xs shrink-0" />
                <span>Trả lời đúng</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-rose-500 rounded-xs shrink-0" />
                <span>Trả lời sai</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-amber-400 rounded-xs shrink-0" />
                <span>Bỏ trống</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-600 rounded-xs shrink-0" />
                <span>Tự luận</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Navigator Footer Action */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/80">
        {!isReview ? (
          <button
            type="button"
            onClick={onSubmitClick}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <Send size={15} /> NỘP BÀI THI
          </button>
        ) : (
          onRetryClick && (
            <button
              type="button"
              onClick={onRetryClick}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <RefreshCcw size={15} /> LÀM ĐỀ KHÁC
            </button>
          )
        )}
      </div>
    </div>
  );
};

export const QuestionNavigator = React.memo(QuestionNavigatorComponent);
