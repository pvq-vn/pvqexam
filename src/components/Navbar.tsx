import React, { useState, useEffect } from 'react';
import { UserProfile, authService } from '../services/authService';
import { isSupabaseConfigured } from '../services/supabase';
import { GraduationCap, History, ShieldAlert, LogIn, LogOut, User, CheckCircle2, CloudOff, Sun, Moon } from 'lucide-react';

interface NavbarProps {
  currentUser: UserProfile | null;
  currentRoute: 'home' | 'quiz' | 'history' | 'admin';
  onNavigate: (route: 'home' | 'history' | 'admin') => void;
  onOpenAuth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  currentRoute,
  onNavigate,
  onOpenAuth,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('theme');
        if (saved === 'dark' || saved === 'light') return saved;
      } catch {}
      if (document.documentElement.classList.contains('dark')) return 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  const applyTheme = (targetTheme: 'light' | 'dark') => {
    if (targetTheme === 'dark') {
      document.documentElement.classList.add('dark');
      if (document.body) document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      if (document.body) document.body.classList.remove('dark');
    }
    try {
      localStorage.setItem('theme', targetTheme);
    } catch {}
  };

  // Keep DOM class and localStorage in sync whenever theme changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Keep theme state updated if system color scheme changes and no preference was saved
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      try {
        if (!localStorage.getItem('theme')) {
          const sysTheme = e.matches ? 'dark' : 'light';
          applyTheme(sysTheme);
          setTheme(sysTheme);
        }
      } catch {}
    };
    mediaQuery.addEventListener('change', handleMediaChange);

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'theme' && (e.newValue === 'dark' || e.newValue === 'light')) {
        applyTheme(e.newValue);
        setTheme(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      mediaQuery.removeEventListener('change', handleMediaChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const toggleTheme = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    setTheme(nextTheme);
    window.dispatchEvent(new CustomEvent('theme-change', { detail: { theme: nextTheme } }));
  };

  const handleLogout = async () => {
    await authService.logout();
    setShowDropdown(false);
    window.location.reload();
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Logo and Brand */}
        <div
          onClick={() => onNavigate('home')}
          className="flex items-center gap-2 sm:gap-2.5 cursor-pointer select-none group shrink-0"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
            <GraduationCap size={20} className="sm:size-[22px]" />
          </div>
          <div>
            <div className="flex items-center font-extrabold text-base sm:text-xl tracking-tight leading-none">
              <span className="text-red-600 dark:text-rose-500 font-black">pvq</span>
              <span className="text-slate-900 dark:text-white font-black">exam</span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 hidden sm:block mt-0.5 font-medium">
              Luyện thi trắc nghiệm & tự luận CNTT
            </p>
          </div>
        </div>

        {/* Center / Navigation Links */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
              currentRoute === 'home'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            Môn học
          </button>

          <button
            type="button"
            onClick={() => onNavigate('history')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 ${
              currentRoute === 'history'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <History size={16} />
            <span className="hidden sm:inline">Lịch sử</span>
          </button>

          {/* Admin Reports & Management link (only visible for admin) */}
          {currentUser?.isAdmin && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                currentRoute === 'admin'
                  ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-bold border border-rose-200 dark:border-rose-800'
                  : 'text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-950/30'
              }`}
              title="Bảng điều khiển quản trị hệ thống"
            >
              <ShieldAlert size={16} className="text-rose-500" />
              <span className="hidden md:inline">Báo lỗi & Quản trị</span>
            </button>
          )}
        </nav>

        {/* Right side: Theme Toggle, User Account / Auth & Storage status */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-90 transition-all shadow-2xs cursor-pointer select-none"
            title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            aria-label="Đổi giao diện sáng/tối"
          >
            {theme === 'dark' ? (
              <Sun size={17} className="text-amber-400" />
            ) : (
              <Moon size={17} className="text-slate-600" />
            )}
          </button>

          {/* Storage Mode indicator */}
          <div
            className="hidden lg:flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
            title={
              isSupabaseConfigured
                ? 'Đã kết nối Supabase Cloud Database'
                : 'Chế độ lưu trữ Offline/LocalStorage an toàn'
            }
          >
            {isSupabaseConfigured ? (
              <>
                <CheckCircle2 size={12} className="text-emerald-500" />
                <span>Supabase</span>
              </>
            ) : (
              <>
                <CloudOff size={12} className="text-amber-500" />
                <span>Offline</span>
              </>
            )}
          </div>

          {currentUser ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800"
              >
                <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold">
                  {currentUser.fullName ? currentUser.fullName[0].toUpperCase() : 'U'}
                </div>
                <span className="hidden sm:inline max-w-[120px] truncate">
                  {currentUser.fullName || currentUser.email}
                </span>
              </button>

              {showDropdown && (
                <div className="absolute right-0 mt-1.5 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 py-1.5 text-xs text-slate-700 dark:text-slate-200 z-50 animate-in fade-in zoom-in-95">
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                    <p className="font-bold text-slate-900 dark:text-white truncate">
                      {currentUser.fullName}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 truncate text-[11px]">
                      {currentUser.email}
                    </p>
                    {currentUser.isAdmin && (
                      <span className="mt-1 inline-block px-1.5 py-0.5 bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded text-[10px] font-bold">
                        Quản trị viên (Admin)
                      </span>
                    )}
                  </div>

                  {currentUser.isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowDropdown(false);
                        onNavigate('admin');
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-rose-50 dark:hover:bg-rose-950/50 flex items-center gap-2 text-rose-600 dark:text-rose-400 font-semibold cursor-pointer"
                    >
                      <ShieldAlert size={14} /> Quản trị & Báo lỗi
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowDropdown(false);
                      onNavigate('history');
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-2 cursor-pointer"
                  >
                    <History size={14} /> Lịch sử thi
                  </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center gap-2 font-medium"
                  >
                    <LogOut size={14} /> Đăng xuất
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm shadow-sm transition-colors"
            >
              <LogIn size={15} />
              <span className="hidden xs:inline">Đăng nhập</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
