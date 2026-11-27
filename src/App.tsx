import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from './components/AppShell';
import type { NavTab } from './components/AppShell';
import { TopNotificationOverlay } from './components/TopNotificationOverlay';
import { runBrowserCrawl } from './lib/browserCrawler';
import {
  cacheArticlesOffline,
  getLocalConfig,
  getLocalLogs,
  getLocalSessions,
  getOfflineCachedArticles,
  saveLocalConfig,
  saveLocalLogs,
} from './lib/offlineCache';
import { ArticleDetailScreen } from './screens/ArticleDetailScreen';
import { CrawlerScreen } from './screens/CrawlerScreen';
import { FilesScreen } from './screens/FilesScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { LogsScreen } from './screens/LogsScreen';
import { DEFAULT_CRAWL_CONFIG, NEWS_SOURCES } from './shared/types';
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

function buildVirtualFilesFromArticles(articles: CrawledArticle[]): ResultFileItem[] {
  const items: ResultFileItem[] = [];
  for (const a of articles) {
    const folder = NEWS_SOURCES[a.sourceId]?.folderName || a.sourceId;
    const dir = `result/${folder}/${a.articleTag}`;
    items.push({
      relativePath: a.txtFilePath,
      name: `${a.articleTag}.txt`,
      directory: dir,
      sizeBytes: new Blob([a.title + a.sapo + a.bodyText]).size,
      modifiedAt: a.crawledAt,
      isImage: false,
      isText: true,
    });
    a.localImagePaths.forEach((imgPath, idx) => {
      items.push({
        relativePath: imgPath,
        name: `img_${String(idx + 1).padStart(2, '0')}.jpg`,
        directory: dir,
        sizeBytes: 0,
        modifiedAt: a.crawledAt,
        isImage: true,
        isText: false,
      });
    });
  }
  return items;
}

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
  const [hasServerBackend, setHasServerBackend] = useState<boolean | null>(null);

  const browserAbortRef = useRef<AbortController | null>(null);

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

  const refreshLocalData = useCallback(async () => {
    const [cachedArticles, localLogs, localSessions] = await Promise.all([
      getOfflineCachedArticles(),
      getLocalLogs(),
      getLocalSessions(),
    ]);
    setArticles(cachedArticles);
    setFiles(buildVirtualFilesFromArticles(cachedArticles));
    setLogs(localLogs);
    setSessions(localSessions);
  }, []);

  const refreshAllData = useCallback(
    async (serverAvailable?: boolean) => {
      const useServer = serverAvailable ?? hasServerBackend;
      if (!useServer) {
        await refreshLocalData();
        return;
      }

      try {
        const [articlesRes, filesRes, logsRes, sessionsRes] = await Promise.all([
          fetch('/api/articles'),
          fetch('/api/files'),
          fetch('/api/logs'),
          fetch('/api/sessions'),
        ]);

        if (articlesRes.ok && articlesRes.headers.get('content-type')?.includes('application/json')) {
          const list = (await articlesRes.json()) as CrawledArticle[];
          setArticles(list);
          void cacheArticlesOffline(list);
        }
        if (filesRes.ok && filesRes.headers.get('content-type')?.includes('application/json')) {
          setFiles((await filesRes.json()) as ResultFileItem[]);
        }
        if (logsRes.ok && logsRes.headers.get('content-type')?.includes('application/json')) {
          setLogs((await logsRes.json()) as CrawlLogEntry[]);
        }
        if (sessionsRes.ok && sessionsRes.headers.get('content-type')?.includes('application/json')) {
          setSessions((await sessionsRes.json()) as CrawlSession[]);
        }
      } catch {
        await refreshLocalData();
      }
    },
    [hasServerBackend, refreshLocalData],
  );

  // Detect whether Express backend (/api/health) exists or running on static GitHub Pages
  useEffect(() => {
    void (async () => {
      let serverOk = false;
      try {
        const res = await fetch('/api/health');
        if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
          const data = (await res.json()) as { ok?: boolean };
          serverOk = Boolean(data.ok);
        }
      } catch {
        serverOk = false;
      }

      setHasServerBackend(serverOk);

      if (serverOk) {
        try {
          const cfgRes = await fetch('/api/config');
          if (cfgRes.ok && cfgRes.headers.get('content-type')?.includes('application/json')) {
            setConfig((await cfgRes.json()) as CrawlConfig);
          }
        } catch {
          // ignore
        }
      } else {
        setConfig(await getLocalConfig());
      }

      await refreshAllData(serverOk);
    })();
  }, [refreshAllData]);

  // Subscribe to SSE crawl progress stream ONLY when Express backend is active
  const prevRunningRef = useRef(false);
  useEffect(() => {
    if (hasServerBackend !== true) return;

    const es = new EventSource('/api/crawl/stream');

    es.onmessage = (event) => {
      try {
        const next = JSON.parse(event.data) as CrawlProgressState;
        setProgress(next);

        if (prevRunningRef.current && !next.isRunning) {
          void refreshAllData(true);
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
  }, [hasServerBackend, notify, refreshAllData]);

  const handleChangeConfig = (patch: Partial<CrawlConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      if (hasServerBackend) {
        void fetch('/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        }).catch(() => {});
      } else {
        void saveLocalConfig(next);
      }
      return next;
    });
  };

  const handleStartCrawl = async () => {
    if (config.task === 'url' && !config.urlsText.trim()) {
      notify('warning', 'Vui lòng nhập ít nhất 1 URL trước khi bắt đầu');
      return;
    }

    if (hasServerBackend) {
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
      return;
    }

    // Browser-mode crawl for static deployments (GitHub Pages)
    const ac = new AbortController();
    browserAbortRef.current = ac;
    try {
      const result = await runBrowserCrawl(config, ac.signal, (nextState) => {
        setProgress(nextState);
        if (!nextState.isRunning && nextState.lastSummary) {
          notify(nextState.failedCount > 0 && nextState.successCount === 0 ? 'warning' : 'success', nextState.lastSummary);
        }
      });
      setArticles(result.articles);
      setFiles(buildVirtualFilesFromArticles(result.articles));
      setLogs(result.logs);
      setSessions(result.sessions);
    } catch {
      notify('error', 'Không thể hoàn tất thu thập trên trình duyệt');
    } finally {
      browserAbortRef.current = null;
    }
  };

  const handleStopCrawl = async () => {
    if (hasServerBackend) {
      try {
        await fetch('/api/crawl/stop', { method: 'POST' });
      } catch {
        notify('error', 'Không thể gửi lệnh dừng');
      }
      return;
    }
    browserAbortRef.current?.abort();
  };

  const handleRetryFailed = async () => {
    if (progress.failedUrls.length === 0) return;
    if (hasServerBackend) {
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
      return;
    }

    const ac = new AbortController();
    browserAbortRef.current = ac;
    try {
      const result = await runBrowserCrawl(
        config,
        ac.signal,
        (nextState) => setProgress(nextState),
        progress.failedUrls,
      );
      setArticles(result.articles);
      setFiles(buildVirtualFilesFromArticles(result.articles));
      setLogs(result.logs);
      setSessions(result.sessions);
    } finally {
      browserAbortRef.current = null;
    }
  };

  const handleDeleteArticles = async (ids: string[]) => {
    if (hasServerBackend) {
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
        await refreshAllData(true);
        notify('success', ids.length === 1 ? 'Đã xóa bài viết thành công' : `Đã xóa ${ids.length} bài viết`);
      } catch {
        notify('error', 'Không thể xóa bài viết');
      }
      return;
    }

    const idSet = new Set(ids);
    const remaining = articles.filter((a) => !idSet.has(a.id));
    await cacheArticlesOffline(remaining);
    setArticles(remaining);
    setFiles(buildVirtualFilesFromArticles(remaining));
    if (selectedArticle && idSet.has(selectedArticle.id)) {
      setSelectedArticle(null);
    }
    notify('success', ids.length === 1 ? 'Đã xóa bài viết thành công' : `Đã xóa ${ids.length} bài viết`);
  };

  const handleClearLogs = async () => {
    if (hasServerBackend) {
      try {
        await fetch('/api/logs', { method: 'DELETE' });
        setLogs([]);
        notify('info', 'Đã xóa toàn bộ nhật ký');
      } catch {
        notify('error', 'Không thể xóa nhật ký');
      }
      return;
    }
    await saveLocalLogs([]);
    setLogs([]);
    notify('info', 'Đã xóa toàn bộ nhật ký');
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
          <FilesScreen
            files={files}
            articles={articles}
            onRefresh={() => void refreshAllData()}
            onNotify={notify}
          />
        ) : (
          <LogsScreen logs={logs} onClearLogs={handleClearLogs} onNotify={notify} />
        )}
      </AppShell>
    </>
  );
}
