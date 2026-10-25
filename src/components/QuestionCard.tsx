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
  ChevronDown,
} from 'lucide-react';
import { Question, QuestionEvaluation } from '../types/quiz';
import {
  areOptionValuesEquivalent,
  resolveOptionIndex,
} from '../engine/scoring';
import { resolveImageSource } from '../utils/driveImage';
import { RichTextRenderer } from './RichTextRenderer';

interface QuestionCardProps {
  question: Question;
  index: number;
  userAnswer?: string | string[];
  isFlagged: boolean;
  isReview: boolean;
  isAdmin?: boolean;
  evaluation?: QuestionEvaluation;
  shuffleOptions?: boolean;
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
  isAdmin = false,
  evaluation,
  shuffleOptions = false,
  onAnswerChange,
  onToggleFlag,
  onReportClick,
}) => {
  const qId = question.id;
  const isCorrect = evaluation?.isCorrect ?? false;
  const isUnanswered = evaluation?.isUnanswered ?? false;


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
  let cardBorder = 'border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700';
  let cardBg = 'bg-white dark:bg-slate-900';
  let headerBg = 'bg-slate-50/80 dark:bg-slate-900/90';

  if (isReview) {
    if (question.type === 'essay') {
      cardBorder = 'border-blue-200 dark:border-blue-800';
      headerBg = 'bg-blue-50/60 dark:bg-blue-950/40';
    } else if (isUnanswered) {
      cardBorder = 'border-amber-300 dark:border-amber-800';
      headerBg = 'bg-amber-50/80 dark:bg-amber-950/40';
    } else if (isCorrect) {
      cardBorder = 'border-emerald-300 dark:border-emerald-800';
      headerBg = 'bg-emerald-50/80 dark:bg-emerald-950/40';
    } else {
      cardBorder = 'border-rose-300 dark:border-rose-800';
      headerBg = 'bg-rose-50/80 dark:bg-rose-950/40';
    }
  } else if (isFlagged) {
    cardBorder = 'border-amber-400 dark:border-amber-500 ring-1 ring-amber-400/60 dark:ring-amber-500/50';
    cardBg = 'bg-amber-50/5 dark:bg-amber-950/20';
    headerBg = 'bg-amber-50/60 dark:bg-amber-950/30';
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
      className={`rounded-2xl border ${cardBorder} ${cardBg} shadow-xs overflow-hidden scroll-mt-24 transition-colors`}
    >
      {/* Question Card Header */}
      <div
        className={`px-4 sm:px-5 py-3 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap justify-between items-center gap-2 ${headerBg}`}
      >
        <div className="flex items-center flex-wrap gap-2">
          <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white font-bold text-xs sm:text-sm tracking-tight shadow-2xs">
            Câu {index + 1}
          </span>

          {question.points !== undefined && (
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              ({question.points} điểm)
            </span>
          )}

          {/* Type Badges */}
          {question.type === 'multiple' && (
            <span className="text-xs bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-2.5 py-0.5 rounded-full font-semibold">
              Chọn nhiều đáp án
            </span>
          )}
          {question.type === 'fill' && (
            <span className="text-xs bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 px-2.5 py-0.5 rounded-full font-semibold">
              Điền đáp án
            </span>
          )}
          {question.type === 'dropdown' && (
            <span className="text-xs bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800 px-2.5 py-0.5 rounded-full font-semibold">
              Ghép vị trí [1]..[n]
            </span>
          )}
          {question.type === 'essay' && (
            <span className="text-xs bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-2.5 py-0.5 rounded-full font-semibold">
              Tự luận — Đối chiếu lời giải
            </span>
          )}

          {(question.chapter_name || question.chapter !== undefined || question.topic) && (
            <span
              className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-md truncate max-w-[260px] font-medium"
              title={
                question.chapter_name ||
                question.topic ||
                `Chương ${question.chapter}`
              }
            >
              <Tag size={11} className="text-slate-400 dark:text-slate-500 shrink-0" />
              <span className="truncate">
                {question.chapter_name ||
                  (question.chapter !== undefined
                    ? `Chương ${question.chapter}`
                    : question.topic)}
              </span>
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

      {/* Admin Metadata Bar (Section 8.1) */}
      {isReview && isAdmin && (
        <div className="px-4 sm:px-5 py-2 bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700/80 text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider text-[10px]">
            Admin Metadata:
          </span>
          <span>
            Phạm vi: <strong className="text-slate-800 dark:text-slate-200">{question.scope || 'Chưa xác định'}</strong>
          </span>
          <span>
            ID nguồn: <strong className="text-slate-800 dark:text-slate-200">{question.originalNum !== undefined ? question.originalNum : (typeof question.id === 'number' ? question.id : 'Chưa xác định')}</strong>
          </span>
          <span>
            Nguồn: <strong className="text-slate-800 dark:text-slate-200">{question.sourceFile ? question.sourceFile.split('/').pop() : 'Chưa xác định'}</strong>
          </span>
        </div>
      )}

      {/* Check layout adaptation: side-by-side for compact diagrams & short options / dropdowns */}
      {(() => {
        const hasDedicatedImage = Boolean(
          question.driveImageId ||
          question.imageUrl ||
          (question.link && resolveImageSource(question.link)?.kind !== 'external-link')
        );
        const isMcq = (question.type === 'single' || question.type === 'multiple') && Boolean(question.options && question.options.length > 0);
        const areOptionsConcise = isMcq && (question.options?.every((opt) => (opt.text || '').trim().length <= 80) ?? false);
        const isDropdown = question.type === 'dropdown';
        const canDropdownSideBySide = hasDedicatedImage && isDropdown;
        const canUseSideBySide = (hasDedicatedImage && isMcq && areOptionsConcise) || canDropdownSideBySide;

        const renderSingleOptions = () => (
          <div className="space-y-2.5">
            {question.options?.map((opt) => {
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
                'border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 cursor-pointer text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900/60';
              let letterBadgeStyle =
                'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700';
              let badgeIcon = null;

              if (isReview) {
                if (isCorrectOpt) {
                  optionStyle =
                    'bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-500 text-emerald-950 dark:text-emerald-100 font-medium ring-1 ring-emerald-500/50';
                  letterBadgeStyle =
                    'bg-emerald-600 text-white border-emerald-600';
                  badgeIcon = (
                    <CheckCircle2
                      size={18}
                      className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                    />
                  );
                } else if (isSelected && !isCorrectOpt) {
                  optionStyle =
                    'bg-rose-50/90 dark:bg-rose-950/50 border-rose-400 text-rose-900 dark:text-rose-100 opacity-90';
                  letterBadgeStyle = 'bg-rose-600 text-white border-rose-600';
                  badgeIcon = (
                    <XCircle
                      size={18}
                      className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"
                    />
                  );
                } else {
                  optionStyle =
                    'border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 opacity-65';
                  letterBadgeStyle =
                    'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700';
                }
              } else if (isSelected) {
                optionStyle =
                  'border-blue-600 dark:border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 ring-1 ring-blue-600/60 dark:ring-blue-500/50';
                letterBadgeStyle = 'bg-blue-600 dark:bg-blue-500 text-white border-blue-600 dark:border-blue-500';
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
                  {!shuffleOptions ? (
                    <span
                      className={`w-6 h-6 rounded-lg border text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 transition-colors ${letterBadgeStyle}`}
                    >
                      {opt.id.toUpperCase()}
                    </span>
                  ) : (
                    <span
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                        isSelected
                          ? 'border-blue-600 bg-blue-600 dark:border-blue-500 dark:bg-blue-500'
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                      }`}
                    >
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-white"></span>
                      )}
                    </span>
                  )}
                  <div className="flex-1 min-w-0 text-sm sm:text-base select-none leading-relaxed text-slate-800 dark:text-slate-100">
                    <RichTextRenderer text={displayOptText} compact />
                  </div>
                  {badgeIcon}
                </label>
              );
            })}

            {hasUnmatchedMcqCorrectAnswer && (
              <div className="mt-2 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs sm:text-sm text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
                <CheckCircle2
                  size={16}
                  className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
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
        );

        const renderMultipleOptions = () => (
          <div className="space-y-2.5">
            {question.options?.map((opt) => {
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
                'border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 cursor-pointer text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900/60';
              let letterBadgeStyle =
                'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700';
              let badgeIcon = null;

              if (isReview) {
                if (isCorrectOpt) {
                  optionStyle =
                    'bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-500 text-emerald-950 dark:text-emerald-100 font-medium ring-1 ring-emerald-500/50';
                  letterBadgeStyle =
                    'bg-emerald-600 text-white border-emerald-600';
                  badgeIcon = (
                    <CheckCircle2
                      size={18}
                      className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                    />
                  );
                } else if (isSelected && !isCorrectOpt) {
                  optionStyle =
                    'bg-rose-50/90 dark:bg-rose-950/50 border-rose-400 text-rose-900 dark:text-rose-100 opacity-90';
                  letterBadgeStyle = 'bg-rose-600 text-white border-rose-600';
                  badgeIcon = (
                    <XCircle
                      size={18}
                      className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"
                    />
                  );
                } else {
                  optionStyle =
                    'border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 opacity-65';
                  letterBadgeStyle =
                    'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700';
                }
              } else if (isSelected) {
                optionStyle =
                  'border-blue-600 dark:border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 ring-1 ring-blue-600/60 dark:ring-blue-500/50';
                letterBadgeStyle = 'bg-blue-600 dark:bg-blue-500 text-white border-blue-600 dark:border-blue-500';
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
                    className="sr-only"
                  />
                  {!shuffleOptions ? (
                    <span
                      className={`w-6 h-6 rounded-md border text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 transition-colors ${letterBadgeStyle}`}
                    >
                      {opt.id.toUpperCase()}
                    </span>
                  ) : (
                    <span
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                        isSelected
                          ? 'border-blue-600 bg-blue-600 dark:border-blue-500 dark:bg-blue-500 text-white'
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                      }`}
                    >
                      {isSelected && (
                        <CheckCircle2 size={13} className="text-white" />
                      )}
                    </span>
                  )}
                  <div className="flex-1 min-w-0 text-sm sm:text-base select-none leading-relaxed text-slate-800 dark:text-slate-100">
                    <RichTextRenderer text={displayOptText} compact />
                  </div>
                  {badgeIcon}
                </label>
              );
            })}
          </div>
        );

        const renderDropdownSlots = () => {
          const slotsToRender =
            question.dropdownSlots && question.dropdownSlots.length > 0
              ? question.dropdownSlots
              : (question.correctAnswers.length > 0
                  ? question.correctAnswers
                  : ['']
                ).map((_, sIdx) => ({
                  label: `Vị trí [${sIdx + 1}]`,
                  choices: question.options || [],
                }));

          return (
            <div className="pt-1 space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={13} className="text-teal-600 dark:text-teal-400 shrink-0" />
                <span>Chọn đáp án tương ứng cho từng vị trí:</span>
              </p>

              <div className="space-y-2.5">
                {slotsToRender.map((slot, slotIdx) => {
                  const rawUserVal = Array.isArray(userAnswer)
                    ? userAnswer[slotIdx] || ''
                    : '';
                  const slotChoices =
                    slot.choices && slot.choices.length > 0
                      ? slot.choices
                      : question.options || [];

                  // Normalize userVal to option ID if it was saved as numeric index or text
                  const resolvedUserIdx = resolveOptionIndex(
                    slotChoices,
                    rawUserVal
                  );
                  const selectValue =
                    resolvedUserIdx !== -1 && slotChoices[resolvedUserIdx]
                      ? slotChoices[resolvedUserIdx].id
                      : rawUserVal;

                  const correctTarget = question.correctAnswers[slotIdx];
                  const isSlotCorrect =
                    isReview &&
                    areOptionValuesEquivalent(
                      slotChoices,
                      rawUserVal,
                      correctTarget
                    );

                  const correctOptIdx = resolveOptionIndex(
                    slotChoices,
                    correctTarget
                  );
                  const correctOptLabel =
                    correctOptIdx !== -1 && slotChoices[correctOptIdx]
                      ? `${correctOptIdx + 1}. ${slotChoices[correctOptIdx].text}`
                      : String(correctTarget || '');

                  const isSimpleBadge = /^(\[\d+\]|Vị trí \[\d+\]|\(\d+\))$/i.test(
                    (slot.label || '').trim()
                  );

                  const isImageLabel =
                    Boolean(slot.label) &&
                    Boolean(
                      resolveImageSource(slot.label)?.kind !== 'external-link' &&
                        resolveImageSource(slot.label)
                    );

                  return (
                    <div
                      key={slotIdx}
                      className={`p-3 sm:p-4 rounded-xl border transition-all ${
                        isReview
                          ? isSlotCorrect
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/80'
                            : 'bg-rose-50/50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800/80'
                          : 'bg-white dark:bg-slate-900/80 border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs'
                      }`}
                    >
                      <div
                        className={`flex ${
                          isImageLabel
                            ? 'flex-col gap-3'
                            : 'flex-col sm:flex-row sm:items-center justify-between gap-3'
                        }`}
                      >
                        {/* Slot label (Badge, text, or Drive Image) */}
                        <div
                          className={
                            isImageLabel
                              ? 'w-full'
                              : 'sm:max-w-[48%] flex-1 min-w-0'
                          }
                        >
                          {isSimpleBadge ? (
                            <span className="inline-flex items-center justify-center px-2.5 py-1 bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800 rounded-lg font-mono font-bold text-xs">
                              {slot.label || `Vị trí [${slotIdx + 1}]`}
                            </span>
                          ) : (
                            <div className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                              <RichTextRenderer
                                text={slot.label || `Vị trí [${slotIdx + 1}]`}
                                compact
                              />
                            </div>
                          )}
                        </div>

                        {/* Custom Styled Select with Dropdown Arrow */}
                        <div
                          className={`relative ${
                            isImageLabel ? 'w-full' : 'flex-1 sm:max-w-[50%]'
                          }`}
                        >
                          <select
                            disabled={isReview}
                            value={selectValue}
                            onChange={(e) =>
                              handleDropdownChange(slotIdx, e.target.value)
                            }
                            className={`w-full appearance-none pl-3.5 pr-9 py-2.5 rounded-xl border text-xs sm:text-sm font-medium outline-none transition-all cursor-pointer disabled:cursor-default ${
                              isReview
                                ? isSlotCorrect
                                  ? 'bg-emerald-100/70 dark:bg-emerald-900/40 border-emerald-500 text-emerald-950 dark:text-emerald-100 font-semibold'
                                  : 'bg-rose-100/70 dark:bg-rose-900/40 border-rose-400 text-rose-950 dark:text-rose-100 font-semibold'
                                : 'bg-slate-50 dark:bg-slate-800/90 hover:bg-slate-100/80 dark:hover:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 shadow-2xs'
                            }`}
                          >
                            <option value="">-- Chọn đáp án --</option>
                            {slotChoices.map((opt, oIdx) => (
                              <option
                                key={opt.id}
                                value={opt.id}
                                className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 py-1.5"
                              >
                                {oIdx + 1}. {opt.text}
                              </option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 dark:text-slate-500">
                            <ChevronDown size={15} />
                          </div>
                        </div>
                      </div>

                      {/* Review mode: Display correct answer if wrong */}
                      {isReview && !isSlotCorrect && (
                        <div className="mt-2.5 text-xs text-emerald-900 dark:text-emerald-200 bg-emerald-50/90 dark:bg-emerald-950/60 p-2.5 rounded-lg border border-emerald-300 dark:border-emerald-800/80 flex items-start gap-2 font-medium">
                          <CheckCircle2
                            size={15}
                            className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold block sm:inline">
                              Đáp án đúng:{' '}
                            </span>
                            <RichTextRenderer text={correctOptLabel} compact />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        };

        return (
          <div className="p-4 sm:p-6 space-y-4">
            {/* Top: Question text, formulas, code, tables */}
            <div className="text-sm sm:text-base text-slate-900 dark:text-slate-100 font-medium leading-relaxed">
              <RichTextRenderer
                text={question.text}
                code={question.code}
                table={question.table}
                link={canUseSideBySide ? undefined : question.link}
                driveImageId={canUseSideBySide ? undefined : question.driveImageId}
              />
            </div>

            {/* Side-by-Side arrangement for small image and short options / dropdowns */}
            {canUseSideBySide ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start pt-1">
                <div className="flex items-center justify-center p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-2xs md:sticky md:top-20">
                  <RichTextRenderer
                    link={question.link}
                    driveImageId={question.driveImageId}
                  />
                </div>
                <div className="space-y-4">
                  {question.type === 'single' && renderSingleOptions()}
                  {question.type === 'multiple' && renderMultipleOptions()}
                  {question.type === 'dropdown' && renderDropdownSlots()}
                </div>
              </div>
            ) : (
              <>
                {question.type === 'single' && renderSingleOptions()}
                {question.type === 'multiple' && renderMultipleOptions()}
                {question.type === 'dropdown' && renderDropdownSlots()}
              </>
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
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-100 font-semibold'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-400 text-rose-900 dark:text-rose-100 font-semibold'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20'
              }`}
            />
            {isReview && !isCorrect && (
              <div className="mt-2 text-xs sm:text-sm text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-start gap-2">
                <CheckCircle2
                  size={16}
                  className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <span className="font-semibold block sm:inline">
                    Đáp án chuẩn:{' '}
                  </span>
                  <RichTextRenderer
                    text={question.correctAnswers.join(' hoặc ')}
                    compact
                  />
                </div>
              </div>
            )}
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
              className="w-full p-3.5 text-sm sm:text-base border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-xl outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 leading-relaxed disabled:bg-slate-50 dark:disabled:bg-slate-950 disabled:text-slate-800 dark:disabled:text-slate-200"
            />
            {isReview && question.correctAnswers.length > 0 && (
              <div className="p-4 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl space-y-2">
                <h4 className="font-bold text-sm text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                  <BookOpen size={16} className="text-blue-600 dark:text-blue-400" />
                  <span>Lời giải / Đáp án mẫu tham khảo:</span>
                </h4>
                <div className="text-sm text-slate-800 dark:text-slate-200">
                  <RichTextRenderer
                    text={question.correctAnswers.join('\n\n')}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  })()}

      {/* Review Mode: Explanation and Suggestions */}
      {isReview && (question.explanation || (!isCorrect && question.type !== 'essay')) && (
        <div
          className={`px-4 sm:px-6 py-4 border-t border-slate-200/80 dark:border-slate-800 text-sm space-y-3 ${
            isCorrect ? 'bg-emerald-50/30 dark:bg-emerald-950/20' : 'bg-slate-50/90 dark:bg-slate-900/60'
          }`}
        >
          {question.explanation && (
            <div>
              <p className="font-bold text-slate-900 dark:text-slate-100 mb-1.5 flex items-center gap-1.5 text-xs sm:text-sm uppercase tracking-wider text-blue-800 dark:text-blue-400">
                <Sparkles size={15} className="text-blue-600 dark:text-blue-400 shrink-0" />
                <span>Giải thích chi tiết</span>
              </p>
              <div className="text-slate-700 dark:text-slate-300 leading-relaxed pl-0.5">
                <RichTextRenderer text={question.explanation} />
              </div>
            </div>
          )}

          {!isCorrect && question.type !== 'essay' && (
            <div className="p-3 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-950 dark:text-amber-200 text-xs sm:text-sm flex items-start gap-2">
              <AlertCircle
                size={16}
                className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"
              />
              <div className="min-w-0 flex-1">
                <strong className="block font-bold mb-0.5">
                  Gợi ý ôn tập:
                </strong>
                <RichTextRenderer
                  text={
                    question.chapter !== undefined && question.chapter_name
                      ? `Chương ${question.chapter}: ${question.chapter_name}`
                      : question.chapter !== undefined
                      ? `Chương ${question.chapter}`
                      : question.chapter_name
                      ? question.chapter_name
                      : question.suggestion || 'Xem lại slide bài giảng'
                  }
                  compact
                />
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
};

export const QuestionCard = React.memo(QuestionCardComponent);
