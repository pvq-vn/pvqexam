import React, { useState } from 'react';
import { Question, ReportType } from '../types/quiz';
import { reportService } from '../services/reportService';
import { authService } from '../services/authService';
import { AlertTriangle, X, CheckCircle2 } from 'lucide-react';

interface ErrorReportModalProps {
  question: Question;
  subjectCode: string;
  subjectId: string;
  onClose: () => void;
}

const REPORT_OPTIONS: { type: ReportType; label: string }[] = [
  { type: 'wrong_answer', label: 'Sai đáp án chuẩn' },
  { type: 'wrong_content', label: 'Sai nội dung câu hỏi' },
  { type: 'missing_image', label: 'Thiếu hình ảnh / link Drive hỏng' },
  { type: 'format_error', label: 'Lỗi định dạng / hiển thị công thức' },
  { type: 'wrong_explanation', label: 'Giải thích hoặc gợi ý sai' },
  { type: 'other', label: 'Lỗi khác' },
];

export const ErrorReportModal: React.FC<ErrorReportModalProps> = ({
  question,
  subjectCode,
  subjectId,
  onClose,
}) => {
  const [selectedType, setSelectedType] = useState<ReportType>('wrong_answer');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const user = await authService.getCurrentUser();
      await reportService.submitReport({
        userId: user?.id,
        userEmail: user?.email,
        subjectId,
        subjectCode,
        questionId: question.id,
        questionText: question.text.slice(0, 200),
        type: selectedType,
        description: description.trim(),
      });

      setSubmitted(true);
      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err) {
      setErrorMsg((err as Error).message || 'Gửi báo lỗi thất bại, vui lòng thử lại.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-sm">
            <AlertTriangle size={18} />
            <span>Báo lỗi câu hỏi (#{question.id})</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle2 size={48} className="text-emerald-500 mx-auto" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">Cảm ơn bạn đã báo lỗi!</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Thông tin báo lỗi đã được gửi đến ban quản trị môn học để kiểm tra và cập nhật ngân hàng đề.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="text-xs text-slate-500 dark:text-slate-400 p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 line-clamp-2">
              <strong>Nội dung:</strong> {question.text}
            </div>

            {/* Error types */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Chọn loại lỗi gặp phải:
              </label>
              <div className="space-y-2">
                {REPORT_OPTIONS.map((opt) => (
                  <label
                    key={opt.type}
                    className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs sm:text-sm cursor-pointer transition-colors ${
                      selectedType === opt.type
                        ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-400 dark:border-rose-700 text-rose-900 dark:text-rose-200 font-medium'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reportType"
                      value={opt.type}
                      checked={selectedType === opt.type}
                      onChange={() => setSelectedType(opt.type)}
                      className="text-rose-600 focus:ring-rose-500 w-3.5 h-3.5"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Mô tả chi tiết lỗi:
              </label>
              <textarea
                rows={3}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="VD: Câu hỏi này đáp án đúng phải là C theo slide bài giảng chương 3..."
                className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg text-xs sm:text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 leading-relaxed"
              />
            </div>

            {errorMsg && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                {errorMsg}
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting || !description.trim()}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors"
              >
                {submitting ? 'Đang gửi...' : 'GỬI BÁO LỖI'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
