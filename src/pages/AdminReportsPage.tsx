import React, { useState, useEffect } from 'react';
import { reportService } from '../services/reportService';
import { ErrorReport, ReportStatus } from '../types/quiz';
import { ShieldAlert, CheckCircle, Clock, XCircle, AlertTriangle, Filter, Info, Calendar, Mail } from 'lucide-react';

export const AdminReportsPage: React.FC = () => {
  const [reports, setReports] = useState<ErrorReport[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    reportService.getReports().then((data) => {
      if (isMounted) {
        setReports(data);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleUpdateStatus = async (reportId: string, status: ReportStatus) => {
    await reportService.updateReportStatus(reportId, status);
    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? { ...r, status } : r))
    );
  };

  const filteredReports = reports.filter((r) => {
    if (filterStatus === 'all') return true;
    return r.status === filterStatus;
  });

  const getStatusBadge = (status: ReportStatus) => {
    switch (status) {
      case 'open':
        return (
          <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold flex items-center gap-1">
            <Clock size={12} /> Chưa xử lý (Mới)
          </span>
        );
      case 'reviewing':
        return (
          <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold flex items-center gap-1">
            <AlertTriangle size={12} /> Đang kiểm tra
          </span>
        );
      case 'resolved':
        return (
          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-semibold flex items-center gap-1">
            <CheckCircle size={12} /> Đã sửa trong GitHub
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold flex items-center gap-1">
            <XCircle size={12} /> Bỏ qua / Không lỗi
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
        return 'Thiếu hình ảnh / link Drive hỏng';
      case 'format_error':
        return 'Lỗi định dạng';
      case 'wrong_explanation':
        return 'Giải thích sai';
      default:
        return 'Lỗi khác';
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <ShieldAlert size={28} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100">
              Quản lý Báo lỗi Đề thi
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Dành cho Ban quản trị & Người sở hữu repository để rà soát lỗi
            </p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl self-start sm:self-center text-xs font-semibold">
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
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filterStatus === tab.id
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Principle Reminder Banner */}
      <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
        <Info size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong>Nguyên tắc Read-Only:</strong> Báo lỗi chỉ được lưu vào hệ thống cơ sở dữ liệu để ghi nhận phản hồi. Để cập nhật ngân hàng câu hỏi, bạn sẽ kiểm tra và trực tiếp chỉnh sửa file <code>exam.json</code> tương ứng trong kho lưu trữ GitHub. Website không bao giờ tự ý sửa dữ liệu nguồn.
        </div>
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="p-12 text-center text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          Đang tải danh sách báo lỗi...
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-2">
          <CheckCircle size={40} className="text-emerald-500 mx-auto" />
          <h3 className="font-bold text-slate-800 dark:text-slate-100">Không có báo lỗi nào ở trạng thái này</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Hiện tại các đề thi đều hoạt động bình thường hoặc đã được xử lý.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReports.map((report) => (
            <div
              key={report.id}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
            >
              {/* Card Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 font-mono font-bold text-xs rounded">
                    {report.subjectCode}
                  </span>
                  <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                    Câu hỏi #{report.questionId}
                  </span>
                  <span className="text-xs text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-2.5 py-0.5 rounded font-medium border border-rose-200 dark:border-rose-800">
                    {getReportTypeLabel(report.type)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {getStatusBadge(report.status)}
                </div>
              </div>

              {/* Question Preview & Report Details */}
              <div className="space-y-2 text-xs sm:text-sm">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-lg text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  <strong className="block text-slate-900 dark:text-slate-100 mb-1 text-xs">Nội dung câu hỏi:</strong>
                  <p className="line-clamp-2 leading-relaxed">{report.questionText}</p>
                </div>

                <div className="p-3 bg-rose-50/50 dark:bg-rose-950/30 rounded-lg text-rose-950 dark:text-rose-200 border border-rose-100 dark:border-rose-900/50">
                  <strong className="block text-rose-900 dark:text-rose-300 mb-1 text-xs">Mô tả của người báo:</strong>
                  <p className="leading-relaxed font-medium">{report.description}</p>
                </div>
              </div>

              {/* Meta & Status Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs text-slate-500 dark:text-slate-400">
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

                {/* Status action buttons */}
                <div className="flex items-center gap-1.5 self-end sm:self-center">
                  {report.status !== 'reviewing' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(report.id, 'reviewing')}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 font-semibold transition-colors"
                    >
                      Đánh dấu đang xử lý
                    </button>
                  )}

                  {report.status !== 'resolved' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(report.id, 'resolved')}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm transition-colors"
                    >
                      Đã sửa
                    </button>
                  )}

                  {report.status !== 'rejected' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(report.id, 'rejected')}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold transition-colors"
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
  );
};
