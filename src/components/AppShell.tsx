import React from 'react';
import {
  BookOpen,
  FolderOpen,
  Globe,
  Moon,
  ScrollText,
  Sun,
  WifiOff,
} from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { PWAInstallButton } from './PWAInstallButton';

export type NavTab = 'crawler' | 'library' | 'files' | 'logs';

interface Props {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  articleCount: number;
  isCrawling: boolean;
  children: React.ReactNode;
}

const NAV_ITEMS: { id: NavTab; label: string; shortLabel: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'crawler', label: 'Thu thập', shortLabel: 'Thu thập', icon: Globe },
  { id: 'library', label: 'Kho bài viết', shortLabel: 'Kho bài', icon: BookOpen },
  { id: 'files', label: 'Thư mục', shortLabel: 'Thư mục', icon: FolderOpen },
  { id: 'logs', label: 'Nhật ký', shortLabel: 'Nhật ký', icon: ScrollText },
];

export const AppShell: React.FC<Props> = ({
  activeTab,
  onSelectTab,
  isDark,
  onToggleTheme,
  articleCount,
  isCrawling,
  children,
}) => {
  const isOnline = useOnlineStatus();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 md:flex">
      {/* Desktop / Tablet Sidebar Navigation Rail */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:border-r md:border-slate-200 md:bg-white dark:md:border-slate-800 dark:md:bg-slate-900">
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap dark:text-slate-50">
            VNNewsCrawler
          </span>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Điều hướng chính">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex min-h-[44px] w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-red-700 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </span>
                {item.id === 'library' && articleCount > 0 && (
                  <span
                    className={`text-xs font-mono-data tabular-nums ${
                      isActive ? 'text-red-100' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {articleCount}
                  </span>
                )}
                {item.id === 'crawler' && isCrawling && (
                  <span className="text-[11px] font-medium opacity-90">Đang chạy</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-slate-200 p-4 dark:border-slate-800">
          {!isOnline && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
              <WifiOff className="h-4 w-4 shrink-0" />
              <span>Ngoại tuyến — Đọc bài đã lưu</span>
            </div>
          )}
          <PWAInstallButton />
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Hỗ trợ Android, iOS Safari & Trình duyệt Web.
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-h-screen flex-1 flex-col">
        {/* Mobile Top App Bar (hidden on desktop) */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 pt-safe backdrop-blur-md md:hidden dark:border-slate-800 dark:bg-slate-900/90">
          <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap dark:text-slate-50">
            VNNewsCrawler
          </span>
          <div className="flex items-center gap-2">
            {!isOnline && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                <WifiOff className="h-3.5 w-3.5" />
                Ngoại tuyến
              </span>
            )}
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
              className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 pb-24 md:px-8 md:py-7 md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav
        aria-label="Thanh điều hướng di động"
        className="fixed bottom-0 left-0 right-0 z-40 grid h-16 grid-cols-4 items-center border-t border-slate-200 bg-white/95 pb-safe backdrop-blur-md md:hidden dark:border-slate-800 dark:bg-slate-900/95"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
                {item.shortLabel}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
