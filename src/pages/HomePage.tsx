import React, { useState, useRef, useEffect } from 'react';
import { SUBJECT_CATALOG } from '../data/subjectCatalog';
import { Subject } from '../types/quiz';
import {
  BookOpen,
  Search,
  Sparkles,
  ChevronRight,
  Layers,
  X,
  Award,
} from 'lucide-react';

interface HomePageProps {
  onSelectSubject: (subject: Subject) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onSelectSubject }) => {
  const [selectedSemester, setSelectedSemester] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const semesters = ['all', '2026.2', '2026.1', '2025.2'];

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
            HUST IT1 QUIZ ENGINE
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
              ✓ 6.600+ Câu hỏi có đáp án & giải thích
            </span>
            <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
              ✓ Tái tạo đề thi chuẩn xác bằng Seed
            </span>
          </div>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <section className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Semester Tabs */}
        <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-2xs overflow-x-auto">
          {semesters.map((sem) => (
            <button
              key={sem}
              type="button"
              onClick={() => setSelectedSemester(sem)}
              className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                selectedSemester === sem
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
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
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm mã môn, tên môn (Nhấn / để tìm)..."
            className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs sm:text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 shadow-2xs transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-md"
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
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-8 space-y-3">
            <BookOpen size={40} className="text-slate-300 mx-auto" />
            <h3 className="font-bold text-slate-700">
              Không tìm thấy môn học phù hợp
            </h3>
            <p className="text-xs text-slate-500">
              Thử tìm kiếm với từ khóa khác hoặc chọn &quot;Tất cả kỳ học&quot;.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedSemester('all');
                setSearchQuery('');
              }}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
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
                className="group bg-white rounded-2xl border border-slate-200/90 hover:border-blue-500 p-5 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="px-2.5 py-1 bg-blue-50 border border-blue-200/80 text-blue-700 rounded-lg text-xs font-mono font-bold">
                      {subj.code}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {subj.badge && (
                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Award size={11} />
                          {subj.badge}
                        </span>
                      )}
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                        Kỳ {subj.semester}
                      </span>
                    </div>
                  </div>

                  <h3 className="font-bold text-slate-900 text-base sm:text-lg group-hover:text-blue-600 transition-colors leading-snug mb-2">
                    {subj.name}
                  </h3>

                  <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed mb-4">
                    {subj.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                    <Layers size={14} className="text-slate-400" />
                    <span>{subj.examFiles.length} bộ ngân hàng đề</span>
                  </div>

                  <span className="text-xs font-bold text-blue-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                    Cấu hình & Thi <ChevronRight size={14} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
