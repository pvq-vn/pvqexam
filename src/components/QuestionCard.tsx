import React from 'react';
import {
  Flag,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Sparkles,
  Tag,
} from 'lucide-react';
import { Question, QuestionEvaluation } from '../types/quiz';
import {
  areOptionValuesEquivalent,
  resolveOptionIndex,
} from '../engine/scoring';
import { RichTextRenderer } from './RichTextRenderer';

interface QuestionCardProps {
  question: Question;
  index: number;
  userAnswer?: string | string[];
  isFlagged: boolean;
  isReview: boolean;
  evaluation?: QuestionEvaluation;
  onAnswerChange: (questionId: string | number, value: string | string[]) => void;
  onToggleFlag: (questionId: string | number) => void;
  onReportClick: (question: Question) => void;
}

/**
 * Strips redundant leading option prefixes like "A) " or "a. " when they match the option ID,
 * avoiding duplicate "A. A) ..." labels in the UI.
 */
function stripRedundantOptionPrefix(text: string, optId: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^([a-h])[).]\s+(.*)$/is);
  if (match && match[1].toLowerCase() === optId.toLowerCase()) {
    return match[2];
  }
  return text;
}

const QuestionCardComponent: React.FC<QuestionCardProps> = ({
  question,
  index,
  userAnswer,
  isFlagged,
  isReview,
  evaluation,
  onAnswerChange,
  onToggleFlag,
  onReportClick,
}) => {
  const qId = question.id;
  const isCorrect = evaluation?.isCorrect ?? false;
  const isUnanswered = evaluation?.isUnanswered ?? false;

  // Apply content-visibility: auto ONLY to cards below the initial fold (index >= 3)
  const deferredClass = index >= 3 ? 'question-card-deferred' : '';

  // Single choice selection
  const handleSingleSelect = (optId: string) => {
    if (isReview) return;
    onAnswerChange(qId, [optId]);
  };

  // Multiple choice selection
  const handleMultipleSelect = (optId: string) => {
    if (isReview) return;
    const current = Array.isArray(userAnswer)
      ? [...userAnswer]
      : userAnswer
      ? [userAnswer]
      : [];
    if (current.includes(optId)) {
      onAnswerChange(
        qId,
        current.filter((id) => id !== optId)
      );
    } else {
      onAnswerChange(qId, [...current, optId]);
    }
  };

  // Fill in the blank
  const handleFillChange = (val: string) => {
    if (isReview) return;
    onAnswerChange(qId, val);
  };

  // Dropdown slot change
  const handleDropdownChange = (slotIndex: number, optValue: string) => {
    if (isReview) return;
    const current = Array.isArray(userAnswer) ? [...userAnswer] : [];
    current[slotIndex] = optValue;
    onAnswerChange(qId, current);
  };

  // Essay text change
  const handleEssayChange = (val: string) => {
    if (isReview) return;
    onAnswerChange(qId, val);
  };

  // Border styling depending on state
  let cardBorder = 'border-slate-200/90 hover:border-slate-300';
  let cardBg = 'bg-white';
  let headerBg = 'bg-slate-50/80';

  if (isReview) {
    if (question.type === 'essay') {
      cardBorder = 'border-blue-200';
      headerBg = 'bg-blue-50/60';
    } else if (isUnanswered) {
      cardBorder = 'border-amber-300';
      headerBg = 'bg-amber-50/80';
    } else if (isCorrect) {
      cardBorder = 'border-emerald-300';
      headerBg = 'bg-emerald-50/80';
    } else {
      cardBorder = 'border-rose-300';
      headerBg = 'bg-rose-50/80';
    }
  } else if (isFlagged) {
    cardBorder = 'border-amber-400 ring-1 ring-amber-400/60';
    cardBg = 'bg-amber-50/5';
    headerBg = 'bg-amber-50/60';
  }

  // Check if any correct answer on an MCQ question didn't match any option in `question.options`
  const hasUnmatchedMcqCorrectAnswer =
    isReview &&
    (question.type === 'single' || question.type === 'multiple') &&
    question.options &&
    question.correctAnswers.length > 0 &&
    question.correctAnswers.some(
      (c) => resolveOptionIndex(question.options, c) === -1
    );

  return (
    <article
      id={`question-${qId}`}
      className={`${deferredClass} rounded-2xl border ${cardBorder} ${cardBg} shadow-xs overflow-hidden scroll-mt-24 transition-colors`}
    >
      {/* Question Card Header */}
      <div
        className={`px-4 sm:px-5 py-3 border-b border-slate-200/80 flex flex-wrap justify-between items-center gap-2 ${headerBg}`}
      >
        <div className="flex items-center flex-wrap gap-2">
          <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-lg bg-slate-900 text-white font-bold text-xs sm:text-sm tracking-tight">
            Câu {index + 1}
          </span>

          {question.points !== undefined && (
            <span className="text-xs text-slate-500 font-medium">
              ({question.points} điểm)
            </span>
          )}

          {/* Type Badges */}
          {question.type === 'multiple' && (
            <span className="text-xs bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full font-semibold">
              Chọn nhiều đáp án
            </span>
          )}
          {question.type === 'fill' && (
            <span className="text-xs bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full font-semibold">
              Điền đáp án
            </span>
          )}
          {question.type === 'dropdown' && (
            <span className="text-xs bg-teal-100 text-teal-800 px-2.5 py-0.5 rounded-full font-semibold">
              Ghép vị trí [1]..[n]
            </span>
          )}
          {question.type === 'essay' && (
            <span className="text-xs bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full font-semibold">
              Tự luận — Đối chiếu lời giải
            </span>
          )}

          {question.topic && (
            <span className="hidden lg:inline-flex items-center gap-1 text-[11px] text-slate-500 bg-white/80 border border-slate-200 px-2 py-0.5 rounded-md truncate max-w-[220px]">
              <Tag size={11} className="text-slate-400 shrink-0" />
              <span className="truncate">{question.topic}</span>
            </span>
          )}
        </div>

        {/* Right side controls: Flag / Review status / Report */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {isReview ? (
            <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm">
              {question.type === 'essay' ? (
                <span className="text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-lg">
                  Tự luận
                </span>
              ) : isUnanswered ? (
                <span className="text-amber-800 flex items-center gap-1 bg-amber-100 px-2.5 py-0.5 rounded-lg">
                  <AlertCircle size={14} /> Bỏ trống
                </span>
              ) : isCorrect ? (
                <span className="text-emerald-800 flex items-center gap-1 bg-emerald-100 px-2.5 py-0.5 rounded-lg">
                  <CheckCircle2 size={14} /> Chính xác
                </span>
              ) : (
                <span className="text-rose-800 flex items-center gap-1 bg-rose-100 px-2.5 py-0.5 rounded-lg">
                  <XCircle size={14} /> Chưa đúng
                </span>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onToggleFlag(qId)}
              className={`px-2.5 py-1 rounded-lg text-xs flex items-center gap-1.5 transition-colors ${
                isFlagged
                  ? 'bg-amber-100 text-amber-800 border border-amber-300 font-bold'
                  : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-800'
              }`}
              title="Đánh dấu câu hỏi cần xem lại"
              aria-label="Cắm cờ câu hỏi"
            >
              <Flag size={14} fill={isFlagged ? 'currentColor' : 'none'} />
              <span className="hidden sm:inline">
                {isFlagged ? 'Đã cắm cờ' : 'Đặt cờ'}
              </span>
            </button>
          )}

          {/* Report Button */}
          <button
            type="button"
            onClick={() => onReportClick(question)}
            className="px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-1"
            title="Báo lỗi câu hỏi này"
            aria-label="Báo lỗi câu hỏi"
          >
            <AlertTriangle size={14} />
            <span className="hidden md:inline">Báo lỗi</span>
          </button>
        </div>
      </div>

      {/* Question Body */}
      <div className="p-4 sm:p-6 space-y-4">
        <div className="text-sm sm:text-base text-slate-900 font-medium leading-relaxed">
          <RichTextRenderer
            text={question.text}
            code={question.code}
            table={question.table}
            link={question.link}
            driveImageId={question.driveImageId}
          />
        </div>

        {/* INPUT AREA: SINGLE CHOICE */}
        {question.type === 'single' && question.options && (
          <div className="space-y-2.5 pt-1">
            {question.options.map((opt) => {
              const selectedArray = Array.isArray(userAnswer)
                ? userAnswer
                : userAnswer
                ? [userAnswer]
                : [];
              const isSelected = selectedArray.some((u) =>
                areOptionValuesEquivalent(question.options, u, opt.id)
              );
              const isCorrectOpt = question.correctAnswers.some((c) =>
                areOptionValuesEquivalent(question.options, opt.id, c)
              );

              let optionStyle =
                'border-slate-200 hover:border-blue-300 hover:bg-slate-50/80 cursor-pointer text-slate-800';
              let letterBadgeStyle =
                'bg-slate-100 text-slate-700 border-slate-200';
              let badgeIcon = null;

              if (isReview) {
                if (isCorrectOpt) {
                  optionStyle =
                    'bg-emerald-50/90 border-emerald-500 text-emerald-950 font-medium ring-1 ring-emerald-500/50';
                  letterBadgeStyle =
                    'bg-emerald-600 text-white border-emerald-600';
                  badgeIcon = (
                    <CheckCircle2
                      size={18}
                      className="text-emerald-600 shrink-0 mt-0.5"
                    />
                  );
                } else if (isSelected && !isCorrectOpt) {
                  optionStyle =
                    'bg-rose-50/90 border-rose-400 text-rose-900 opacity-90';
                  letterBadgeStyle = 'bg-rose-600 text-white border-rose-600';
                  badgeIcon = (
                    <XCircle
                      size={18}
                      className="text-rose-600 shrink-0 mt-0.5"
                    />
                  );
                } else {
                  optionStyle =
                    'border-slate-200/80 text-slate-500 opacity-65';
                  letterBadgeStyle =
                    'bg-slate-100 text-slate-400 border-slate-200';
                }
              } else if (isSelected) {
                optionStyle =
                  'border-blue-600 bg-blue-50/60 text-blue-950 ring-1 ring-blue-600/60';
                letterBadgeStyle = 'bg-blue-600 text-white border-blue-600';
              }

              const displayOptText = stripRedundantOptionPrefix(
                opt.text,
                opt.id
              );

              return (
                <label
                  key={opt.id}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all ${optionStyle} ${
                    isReview ? 'cursor-default' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${qId}`}
                    checked={isSelected}
                    disabled={isReview}
                    onChange={() => handleSingleSelect(opt.id)}
                    className="sr-only"
                  />
                  <span
                    className={`w-6 h-6 rounded-lg border text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 transition-colors ${letterBadgeStyle}`}
                  >
                    {opt.id.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0 text-sm sm:text-base select-none leading-relaxed">
                    <RichTextRenderer text={displayOptText} compact />
                  </div>
                  {badgeIcon}
                </label>
              );
            })}

            {hasUnmatchedMcqCorrectAnswer && (
              <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs sm:text-sm text-emerald-900 flex items-start gap-2">
                <CheckCircle2
                  size={16}
                  className="text-emerald-600 shrink-0 mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <strong className="font-bold block mb-0.5">
                    Đáp án chuẩn trong ngân hàng đề:
                  </strong>
                  <RichTextRenderer
                    text={question.correctAnswers.join(' ; ')}
                    compact
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* INPUT AREA: MULTIPLE CHOICE */}
        {question.type === 'multiple' && question.options && (
          <div className="space-y-2.5 pt-1">
            {question.options.map((opt) => {
              const selectedArray = Array.isArray(userAnswer)
                ? userAnswer
                : userAnswer
                ? [userAnswer]
                : [];
              const isSelected = selectedArray.some((u) =>
                areOptionValuesEquivalent(question.options, u, opt.id)
              );
              const isCorrectOpt = question.correctAnswers.some((c) =>
                areOptionValuesEquivalent(question.options, opt.id, c)
              );

              let optionStyle =
                'border-slate-200 hover:border-blue-300 hover:bg-slate-50/80 cursor-pointer text-slate-800';
              let letterBadgeStyle =
                'bg-slate-100 text-slate-700 border-slate-200';
              let badgeIcon = null;

              if (isReview) {
                if (isCorrectOpt) {
                  optionStyle =
                    'bg-emerald-50/90 border-emerald-500 text-emerald-950 font-medium ring-1 ring-emerald-500/50';
                  letterBadgeStyle =
                    'bg-emerald-600 text-white border-emerald-600';
                  badgeIcon = (
                    <CheckCircle2
                      size={18}
                      className="text-emerald-600 shrink-0 mt-0.5"
                    />
                  );
                } else if (isSelected && !isCorrectOpt) {
                  optionStyle =
                    'bg-rose-50/90 border-rose-400 text-rose-900 opacity-90';
                  letterBadgeStyle = 'bg-rose-600 text-white border-rose-600';
                  badgeIcon = (
                    <XCircle
                      size={18}
                      className="text-rose-600 shrink-0 mt-0.5"
                    />
                  );
                } else {
                  optionStyle =
                    'border-slate-200/80 text-slate-500 opacity-65';
                  letterBadgeStyle =
                    'bg-slate-100 text-slate-400 border-slate-200';
                }
              } else if (isSelected) {
                optionStyle =
                  'border-blue-600 bg-blue-50/60 text-blue-950 ring-1 ring-blue-600/60';
                letterBadgeStyle = 'bg-blue-600 text-white border-blue-600';
              }

              const displayOptText = stripRedundantOptionPrefix(
                opt.text,
                opt.id
              );

              return (
                <label
                  key={opt.id}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all ${optionStyle} ${
                    isReview ? 'cursor-default' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isReview}
                    onChange={() => handleMultipleSelect(opt.id)}
                    className="w-4 h-4 mt-1 text-blue-600 rounded focus:ring-blue-500 border-slate-300 shrink-0"
                  />
                  <span
                    className={`w-6 h-6 rounded-md border text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 transition-colors ${letterBadgeStyle}`}
                  >
                    {opt.id.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0 text-sm sm:text-base select-none leading-relaxed">
                    <RichTextRenderer text={displayOptText} compact />
                  </div>
                  {badgeIcon}
                </label>
              );
            })}
          </div>
        )}

        {/* INPUT AREA: FILL IN THE BLANK */}
        {question.type === 'fill' && (
          <div className="pt-1 space-y-2">
            <input
              type="text"
              value={typeof userAnswer === 'string' ? userAnswer : ''}
              disabled={isReview}
              onChange={(e) => handleFillChange(e.target.value)}
              placeholder="Nhập câu trả lời ngắn gọn của bạn vào đây..."
              className={`w-full p-3.5 text-sm sm:text-base border rounded-xl outline-none transition-all ${
                isReview
                  ? isCorrect
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-semibold'
                    : 'bg-rose-50 border-rose-400 text-rose-900 font-semibold'
                  : 'border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20'
              }`}
            />
            {isReview && !isCorrect && (
              <div className="mt-2 text-xs sm:text-sm text-emerald-800 bg-emerald-50 p-3 rounded-xl border border-emerald-200 flex items-center gap-2">
                <CheckCircle2
                  size={16}
                  className="text-emerald-600 shrink-0"
                />
                <span>
                  Đáp án chuẩn:{' '}
                  <strong className="font-mono">
                    {question.correctAnswers.join(' hoặc ')}
                  </strong>
                </span>
              </div>
            )}
          </div>
        )}

        {/* INPUT AREA: DROPDOWN */}
        {question.type === 'dropdown' && question.options && (
          <div className="pt-1 space-y-3">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              Chọn đáp án tương ứng cho từng vị trí:
            </p>
            {question.correctAnswers.map((correctTarget, slotIdx) => {
              const rawUserVal = Array.isArray(userAnswer)
                ? userAnswer[slotIdx] || ''
                : '';
              // Normalize userVal to option ID if it was saved as numeric index
              const resolvedUserIdx = resolveOptionIndex(
                question.options,
                rawUserVal
              );
              const selectValue =
                resolvedUserIdx !== -1 && question.options
                  ? question.options[resolvedUserIdx].id
                  : rawUserVal;

              const isSlotCorrect =
                isReview &&
                areOptionValuesEquivalent(
                  question.options,
                  rawUserVal,
                  correctTarget
                );

              const correctOptIdx = resolveOptionIndex(
                question.options,
                correctTarget
              );
              const correctOptLabel =
                correctOptIdx !== -1 && question.options
                  ? `${correctOptIdx + 1}. ${question.options[correctOptIdx].text}`
                  : String(correctTarget);

              return (
                <div
                  key={slotIdx}
                  className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 text-sm">
                    <span className="inline-flex items-center justify-center px-2.5 py-1 bg-teal-50 text-teal-800 border border-teal-200 rounded-lg font-mono font-bold text-xs w-fit shrink-0">
                      Vị trí [{slotIdx + 1}]
                    </span>
                    <select
                      disabled={isReview}
                      value={selectValue}
                      onChange={(e) =>
                        handleDropdownChange(slotIdx, e.target.value)
                      }
                      className={`flex-1 p-2.5 rounded-lg border text-sm outline-none transition-colors bg-white ${
                        isReview
                          ? isSlotCorrect
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-semibold'
                            : 'bg-rose-50 border-rose-400 text-rose-900'
                          : 'border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20'
                      }`}
                    >
                      <option value="">-- Chọn đáp án --</option>
                      {question.options?.map((opt, oIdx) => (
                        <option key={opt.id} value={opt.id}>
                          {oIdx + 1}. {opt.text}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isReview && !isSlotCorrect && (
                    <div className="text-xs text-emerald-800 bg-emerald-50/90 px-3 py-1.5 rounded-lg border border-emerald-200 flex items-center gap-1.5 font-medium">
                      <CheckCircle2
                        size={14}
                        className="text-emerald-600 shrink-0"
                      />
                      <span>
                        Đáp án đúng: <strong>{correctOptLabel}</strong>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* INPUT AREA: ESSAY */}
        {question.type === 'essay' && (
          <div className="pt-1 space-y-3">
            <textarea
              rows={5}
              value={typeof userAnswer === 'string' ? userAnswer : ''}
              disabled={isReview}
              onChange={(e) => handleEssayChange(e.target.value)}
              placeholder="Nhập dàn ý hoặc câu trả lời tự luận của bạn để tự đối chiếu sau khi nộp bài..."
              className="w-full p-3.5 text-sm sm:text-base border border-slate-300 rounded-xl outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 leading-relaxed disabled:bg-slate-50 disabled:text-slate-800"
            />
            {isReview && question.correctAnswers.length > 0 && (
              <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-xl space-y-2">
                <h4 className="font-bold text-sm text-blue-900 flex items-center gap-1.5">
                  <BookOpen size={16} className="text-blue-600" />
                  <span>Lời giải / Đáp án mẫu tham khảo:</span>
                </h4>
                <div className="text-sm text-slate-800">
                  <RichTextRenderer
                    text={question.correctAnswers.join('\n\n')}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Review Mode: Explanation and Suggestions */}
      {isReview && (question.explanation || (question.suggestion && !isCorrect && question.type !== 'essay')) && (
        <div
          className={`px-4 sm:px-6 py-4 border-t border-slate-200/80 text-sm space-y-3 ${
            isCorrect ? 'bg-emerald-50/30' : 'bg-slate-50/90'
          }`}
        >
          {question.explanation && (
            <div>
              <p className="font-bold text-slate-900 mb-1.5 flex items-center gap-1.5 text-xs sm:text-sm uppercase tracking-wider text-blue-800">
                <Sparkles size={15} className="text-blue-600 shrink-0" />
                <span>Giải thích chi tiết</span>
              </p>
              <div className="text-slate-700 leading-relaxed pl-0.5">
                <RichTextRenderer text={question.explanation} />
              </div>
            </div>
          )}

          {question.suggestion && !isCorrect && question.type !== 'essay' && (
            <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl text-amber-950 text-xs sm:text-sm flex items-start gap-2">
              <AlertCircle
                size={16}
                className="shrink-0 mt-0.5 text-amber-600"
              />
              <div className="min-w-0 flex-1">
                <strong className="block font-bold mb-0.5">
                  Gợi ý ôn tập:
                </strong>
                <RichTextRenderer text={question.suggestion} compact />
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
};

export const QuestionCard = React.memo(QuestionCardComponent);
