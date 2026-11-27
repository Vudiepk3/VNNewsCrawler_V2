import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from './components/AppShell';
import type { NavTab } from './components/AppShell';
import { TopNotificationOverlay } from './components/TopNotificationOverlay';
import { cacheArticlesOffline, getOfflineCachedArticles } from './lib/offlineCache';
import { ArticleDetailScreen } from './screens/ArticleDetailScreen';
import { CrawlerScreen } from './screens/CrawlerScreen';
import { FilesScreen } from './screens/FilesScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { LogsScreen } from './screens/LogsScreen';
import { DEFAULT_CRAWL_CONFIG } from './shared/types';
import type {
  ArticleSortOrder,
  CrawlConfig,
  CrawlLogEntry,
  CrawlProgressState,
  CrawlSession,
  CrawledArticle,
  NewsSourceId,
  ResultFileItem,
  TopNotification,
} from './shared/types';

const INITIAL_PROGRESS: CrawlProgressState = {
  isRunning: false,
  phase: 'idle',
  totalDiscovered: 0,
  processedCount: 0,
  successCount: 0,
  skippedCount: 0,
  imageCount: 0,
  failedCount: 0,
  activeWorkers: 0,
  currentUrl: '',
  failedUrls: [],
  lastSummary: '',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('crawler');
  const [selectedArticle, setSelectedArticle] = useState<CrawledArticle | null>(null);
  const [config, setConfig] = useState<CrawlConfig>(DEFAULT_CRAWL_CONFIG);
  const [progress, setProgress] = useState<CrawlProgressState>(INITIAL_PROGRESS);
  const [articles, setArticles] = useState<CrawledArticle[]>([]);
  const [files, setFiles] = useState<ResultFileItem[]>([]);
  const [logs, setLogs] = useState<CrawlLogEntry[]>([]);
  const [sessions, setSessions] = useState<CrawlSession[]>([]);
  const [notifications, setNotifications] = useState<TopNotification[]>([]);

  // Library filters
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<NewsSourceId | 'all'>('all');
  const [sortOrder, setSortOrder] = useState<ArticleSortOrder>('newest');

  // Theme
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('vncrawler_theme');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem('vncrawler_theme', isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage failure
    }
  }, [isDark]);

  const notify = useCallback((type: TopNotification['type'], message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setNotifications((prev) => [{ id, type, message }, ...prev].slice(0, 3));
    window.setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 3200);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const refreshAllData = useCallback(async () => {
    try {
      const [articlesRes, filesRes, logsRes, sessionsRes] = await Promise.all([
        fetch('/api/articles'),
        fetch('/api/files'),
        fetch('/api/logs'),
        fetch('/api/sessions'),
      ]);

      if (articlesRes.ok) {
        const list = (await articlesRes.json()) as CrawledArticle[];
        setArticles(list);
        void cacheArticlesOffline(list);
      }
      if (filesRes.ok) {
        setFiles((await filesRes.json()) as ResultFileItem[]);
      }
      if (logsRes.ok) {
        setLogs((await logsRes.json()) as CrawlLogEntry[]);
      }
      if (sessionsRes.ok) {
        setSessions((await sessionsRes.json()) as CrawlSession[]);
      }
    } catch {
      // Offline fallback from IndexedDB
      const cached = await getOfflineCachedArticles();
      if (cached.length > 0) {
        setArticles(cached);
      }
    }
  }, []);

  // Load initial config and data
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          setConfig((await res.json()) as CrawlConfig);
        }
      } catch {
        // Ignore offline
      }
      await refreshAllData();
    })();
  }, [refreshAllData]);

  // Subscribe to SSE crawl progress stream
  const prevRunningRef = useRef(false);
  useEffect(() => {
    const es = new EventSource('/api/crawl/stream');

    es.onmessage = (event) => {
      try {
        const next = JSON.parse(event.data) as CrawlProgressState;
        setProgress(next);

        if (prevRunningRef.current && !next.isRunning) {
          void refreshAllData();
          if (next.lastSummary) {
            const type: TopNotification['type'] =
              next.phase === 'error'
                ? 'error'
                : next.failedCount > 0 && next.successCount === 0
                  ? 'warning'
                  : next.successCount === 0 && next.skippedCount > 0
                    ? 'info'
                    : 'success';
            notify(type, next.lastSummary);
          }
        }
        prevRunningRef.current = next.isRunning;
      } catch {
        // Ignore malformed frame
      }
    };

    return () => {
      es.close();
    };
  }, [notify, refreshAllData]);

  const handleChangeConfig = (patch: Partial<CrawlConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      void fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      }).catch(() => {});
      return next;
    });
  };

  const handleStartCrawl = async () => {
    if (config.task === 'url' && !config.urlsText.trim()) {
      notify('warning', 'Vui lòng nhập ít nhất 1 URL trước khi bắt đầu');
      return;
    }
    try {
      const res = await fetch('/api/crawl/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        notify('error', err.error || 'Không thể bắt đầu thu thập');
        return;
      }
      const data = (await res.json()) as { state?: CrawlProgressState };
      if (data.state) {
        prevRunningRef.current = true;
        setProgress(data.state);
      }
    } catch {
      notify('error', 'Không có kết nối máy chủ để thu thập');
    }
  };

  const handleStopCrawl = async () => {
    try {
      await fetch('/api/crawl/stop', { method: 'POST' });
    } catch {
      notify('error', 'Không thể gửi lệnh dừng');
    }
  };

  const handleRetryFailed = async () => {
    if (progress.failedUrls.length === 0) return;
    try {
      const res = await fetch('/api/crawl/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: progress.failedUrls,
          numWorkers: config.numWorkers,
        }),
      });
      if (res.ok) {
        prevRunningRef.current = true;
        notify('info', `Đang thử lại ${progress.failedUrls.length} URL bị lỗi`);
      }
    } catch {
      notify('error', 'Không thể thử lại lúc này');
    }
  };

  const handleDeleteArticles = async (ids: string[]) => {
    try {
      const res = await fetch('/api/articles/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error();
      if (selectedArticle && ids.includes(selectedArticle.id)) {
        setSelectedArticle(null);
      }
      await refreshAllData();
      notify('success', ids.length === 1 ? 'Đã xóa bài viết thành công' : `Đã xóa ${ids.length} bài viết`);
    } catch {
      notify('error', 'Không thể xóa bài viết');
    }
  };

  const handleClearLogs = async () => {
    try {
      await fetch('/api/logs', { method: 'DELETE' });
      setLogs([]);
      notify('info', 'Đã xóa toàn bộ nhật ký');
    } catch {
      notify('error', 'Không thể xóa nhật ký');
    }
  };

  const handleSelectTab = (tab: NavTab) => {
    setSelectedArticle(null);
    setActiveTab(tab);
    if (tab === 'library' || tab === 'files' || tab === 'logs') {
      void refreshAllData();
    }
  };

  return (
    <>
      <TopNotificationOverlay notifications={notifications} onDismiss={dismissNotification} />
      <AppShell
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        isDark={isDark}
        onToggleTheme={() => setIsDark((d) => !d)}
        articleCount={articles.length}
        isCrawling={progress.isRunning}
      >
        {selectedArticle ? (
          <ArticleDetailScreen
            article={selectedArticle}
            onBack={() => setSelectedArticle(null)}
            onDeleteArticle={(id) => handleDeleteArticles([id])}
            onNotify={notify}
          />
        ) : activeTab === 'crawler' ? (
          <CrawlerScreen
            config={config}
            progress={progress}
            sessions={sessions}
            onChangeConfig={handleChangeConfig}
            onStartCrawl={handleStartCrawl}
            onStopCrawl={handleStopCrawl}
            onRetryFailed={handleRetryFailed}
            onNotify={notify}
            onOpenLibrary={() => handleSelectTab('library')}
          />
        ) : activeTab === 'library' ? (
          <LibraryScreen
            articles={articles}
            search={search}
            sourceFilter={sourceFilter}
            sortOrder={sortOrder}
            onChangeSearch={setSearch}
            onChangeSourceFilter={setSourceFilter}
            onChangeSortOrder={setSortOrder}
            onSelectArticle={(article) => setSelectedArticle(article)}
            onDeleteArticles={handleDeleteArticles}
            onNotify={notify}
            onGoCrawl={() => handleSelectTab('crawler')}
          />
        ) : activeTab === 'files' ? (
          <FilesScreen files={files} onRefresh={() => void refreshAllData()} onNotify={notify} />
        ) : (
          <LogsScreen logs={logs} onClearLogs={handleClearLogs} onNotify={notify} />
        )}
      </AppShell>
    </>
  );
}
