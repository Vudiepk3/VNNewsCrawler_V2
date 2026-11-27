import { NEWS_SOURCES, parseUrlsText } from '../shared/types';
import type {
  CrawlConfig,
  CrawlLogEntry,
  CrawlProgressState,
  CrawlSession,
  CrawledArticle,
  FailedUrlItem,
  LogLevel,
  NewsSourceId,
} from '../shared/types';
import {
  cacheArticlesOffline,
  getLocalLogs,
  getLocalSessions,
  getOfflineCachedArticles,
  saveLocalLogs,
  saveLocalSessions,
} from './offlineCache';

function normalizeUrl(raw: string): string {
  return raw.trim().split('#')[0];
}

function detectSourceFromUrl(rawUrl: string): NewsSourceId | null {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (host === 'vnexpress.net' || host.endsWith('.vnexpress.net')) return 'vnexpress';
    if (host === 'dantri.com.vn' || host.endsWith('.dantri.com.vn')) return 'dantri';
    if (host === 'vietnamnet.vn' || host.endsWith('.vietnamnet.vn')) return 'vietnamnet';
    return null;
  } catch {
    return null;
  }
}

function isArticleUrl(sourceId: NewsSourceId, rawUrl: string): boolean {
  const clean = normalizeUrl(rawUrl);
  if (sourceId === 'vnexpress') {
    return /^https?:\/\/(?:www\.|m\.)?vnexpress\.net\/.+\.html$/i.test(clean);
  }
  if (sourceId === 'dantri') {
    if (/\/trang-\d+\.htm$/i.test(clean)) return false;
    return /^https?:\/\/(?:www\.|m\.)?dantri\.com\.vn\/.+-\d+\.htm$/i.test(clean);
  }
  return /^https?:\/\/(?:www\.|m\.)?vietnamnet\.vn\/.+\.html$/i.test(clean);
}

function buildCategoryPageUrl(sourceId: NewsSourceId, categorySlug: string, pageNum: number): string {
  const base = NEWS_SOURCES[sourceId].baseUrl;
  if (categorySlug === 'trang-chu') return base;
  if (sourceId === 'vnexpress') {
    return pageNum <= 1 ? `${base}/${categorySlug}` : `${base}/${categorySlug}-p${pageNum}`;
  }
  if (sourceId === 'dantri') {
    return pageNum <= 1 ? `${base}/${categorySlug}.htm` : `${base}/${categorySlug}/trang-${pageNum}.htm`;
  }
  return pageNum <= 1 ? `${base}/${categorySlug}` : `${base}/${categorySlug}-page${pageNum}`;
}

function buildArticleTag(url: string, title = ''): string {
  let slug = '';
  try {
    const segs = new URL(url).pathname.split('/').filter(Boolean);
    slug = (segs[segs.length - 1] || '').replace(/\.(html|htm|aspx|php)$/i, '');
  } catch {
    slug = '';
  }
  const base = (slug || title)
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const clean = base || `article-${Date.now()}`;
  if (clean.length <= 100) return clean;
  return `${clean.slice(0, 62).replace(/-+$/g, '')}-${clean.slice(-36).replace(/^-+/g, '')}`;
}

async function fetchHtmlViaProxy(targetUrl: string, signal: AbortSignal): Promise<string> {
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`,
  ];

  let lastErr: Error = new Error('Không thể tải trang từ trình duyệt');
  for (const proxyUrl of proxies) {
    if (signal.aborted) throw new Error('Aborted');
    try {
      const res = await fetch(proxyUrl, { signal });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      const text = await res.text();
      if (text && text.length > 200) {
        return text;
      }
    } catch (err) {
      if (signal.aborted) throw new Error('Aborted');
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr;
}

function parseVnDate(raw: string): number {
  if (!raw) return 0;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const ts = Date.parse(trimmed);
    if (!Number.isNaN(ts) && ts > 0) return ts;
  }
  const m = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\s,\-–]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${(m[4] || '00').padStart(2, '0')}:${(m[5] || '00').padStart(2, '0')}:${(m[6] || '00').padStart(2, '0')}+07:00`;
    const ts = Date.parse(iso);
    if (!Number.isNaN(ts) && ts > 0) return ts;
  }
  return 0;
}

function discoverLinksFromHtml(html: string, baseUri: string, sourceId: NewsSourceId): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const seen = new Set<string>();
  doc.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href) return;
    try {
      const abs = normalizeUrl(new URL(href, baseUri).toString());
      if (isArticleUrl(sourceId, abs)) {
        seen.add(abs);
      }
    } catch {
      // ignore invalid
    }
  });
  return Array.from(seen);
}

function parseArticleInBrowser(
  html: string,
  url: string,
  sourceId: NewsSourceId,
  categorySlug: string,
): CrawledArticle {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const firstText = (sels: string[]) => {
    for (const s of sels) {
      const el = doc.querySelector(s);
      const t = el?.textContent?.replace(/\s+/g, ' ').trim();
      if (t) return t;
    }
    return '';
  };

  let title = '';
  let sapo = '';
  let root: Element | null = null;
  let paragraphs: string[] = [];

  if (sourceId === 'vnexpress') {
    title =
      firstText(['h1.title-detail', 'h1.title-news', 'article h1', 'h1']) ||
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
      '';
    sapo =
      firstText(['p.description', '.description']) ||
      doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() ||
      '';
    root = doc.querySelector('article.fck_detail, .fck_detail, article');
    if (root) {
      const pNormal = Array.from(root.querySelectorAll('p.Normal'));
      const pList = pNormal.length > 0 ? pNormal : Array.from(root.querySelectorAll('p'));
      paragraphs = pList.map((p) => p.textContent?.replace(/\s+/g, ' ').trim() || '').filter(Boolean);
    }
  } else if (sourceId === 'dantri') {
    title =
      firstText(['h1.title-page.detail', 'h1.title-page', 'h1.e-magazine__title', 'article h1', 'h1']) ||
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
      '';
    sapo =
      firstText(['h2.singular-sapo', 'h2.e-magazine__sapo', '.singular-sapo']) ||
      doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() ||
      '';
    root = doc.querySelector('div.singular-content, div.e-magazine__body, div.dt-news__content, article');
    if (root) {
      paragraphs = Array.from(root.querySelectorAll('p'))
        .map((p) => p.textContent?.replace(/\s+/g, ' ').trim() || '')
        .filter(Boolean);
    }
  } else {
    title =
      firstText(['h1.content-detail-title', 'h1.title-detail', 'article h1', 'h1']) ||
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
      '';
    sapo =
      firstText(['h2.content-detail-sapo', 'h2.sm-sapo-mb-0', '.content-detail-sapo']) ||
      doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() ||
      '';
    root = doc.querySelector('div.maincontent, div.main-content, .content-detail-body, article');
    if (root) {
      paragraphs = Array.from(root.querySelectorAll('p'))
        .map((p) => p.textContent?.replace(/\s+/g, ' ').trim() || '')
        .filter(Boolean);
    }
  }

  if (!title) throw new Error('Không trích xuất được tiêu đề bài viết');

  const imgSeen = new Set<string>();
  const scope = root || doc.body;
  const addImg = (raw: string | null | undefined) => {
    if (!raw) return;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('data:') || trimmed.includes('.svg') || trimmed.includes('1x1')) return;
    try {
      imgSeen.add(new URL(trimmed, url).toString());
    } catch {
      // ignore
    }
  };
  scope.querySelectorAll('source').forEach((s) => {
    const srcset = s.getAttribute('data-srcset') || s.getAttribute('srcset');
    const first = srcset?.split(',')[0]?.trim().split(/\s+/)[0];
    addImg(first || s.getAttribute('data-src') || s.getAttribute('src'));
  });
  scope.querySelectorAll('img').forEach((img) => {
    addImg(
      img.getAttribute('data-src') ||
        img.getAttribute('data-original') ||
        img.getAttribute('data-lazy-src') ||
        img.getAttribute('src'),
    );
  });
  if (imgSeen.size === 0) {
    addImg(doc.querySelector('meta[property="og:image"]')?.getAttribute('content'));
  }

  let publishedAt = 0;
  const dateSels = [
    'span.date',
    '.header-content .date',
    'time.author-time',
    'div.bread-crumb-detail__time',
    'time[datetime]',
  ];
  for (const sel of dateSels) {
    const el = doc.querySelector(sel);
    if (!el) continue;
    const dt = el.getAttribute('datetime') || el.textContent || '';
    const ts = parseVnDate(dt);
    if (ts > 0) {
      publishedAt = ts;
      break;
    }
  }
  if (!publishedAt) {
    const metaDt =
      doc.querySelector('meta[property="article:published_time"], meta[name="pubdate"]')?.getAttribute('content') || '';
    publishedAt = parseVnDate(metaDt);
  }

  const imageUrls = Array.from(imgSeen);
  const bodyText = paragraphs.join('\n\n');
  const wordCount = [title, sapo, bodyText].filter(Boolean).join(' ').split(/\s+/).filter(Boolean).length;
  const articleTag = buildArticleTag(url, title);
  const folder = NEWS_SOURCES[sourceId].folderName;

  return {
    id: `${sourceId}-${articleTag}`,
    url: normalizeUrl(url),
    sourceId,
    categorySlug,
    articleTag,
    title,
    sapo,
    bodyText,
    txtFilePath: `${folder}/${articleTag}/${articleTag}.txt`,
    wordCount,
    imageUrls,
    localImagePaths: imageUrls,
    publishedAt,
    crawledAt: Date.now(),
  };
}

export async function runBrowserCrawl(
  config: CrawlConfig,
  signal: AbortSignal,
  onProgress: (state: CrawlProgressState) => void,
  overrideTargets?: FailedUrlItem[],
): Promise<{ articles: CrawledArticle[]; logs: CrawlLogEntry[]; sessions: CrawlSession[] }> {
  const startTime = Date.now();
  const existingArticles = await getOfflineCachedArticles();
  const existingLogs = await getLocalLogs();
  const existingSessions = await getLocalSessions();

  const newLogs: CrawlLogEntry[] = [...existingLogs];
  const pushLog = (level: LogLevel, tag: string, message: string) => {
    newLogs.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      level,
      tag,
      message,
    });
  };

  let state: CrawlProgressState = {
    isRunning: true,
    phase: overrideTargets ? 'crawling' : 'discovering',
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
  onProgress(state);

  const targets: { url: string; sourceId: NewsSourceId; categorySlug: string }[] = [];

  if (overrideTargets) {
    for (const item of overrideTargets) {
      targets.push({ url: item.url, sourceId: item.sourceId, categorySlug: 'retry' });
    }
  } else if (config.task === 'type') {
    const src = NEWS_SOURCES[config.webname];
    const cats =
      config.articleType === 'all'
        ? src.categories.filter((c) => c.slug !== 'all' && c.slug !== 'trang-chu').map((c) => c.slug)
        : [config.articleType];

    const seen = new Set<string>();
    for (const cat of cats) {
      if (signal.aborted) break;
      const pages = cat === 'trang-chu' ? 1 : config.totalPages;
      for (let p = 1; p <= pages; p++) {
        if (signal.aborted) break;
        const pageUrl = buildCategoryPageUrl(config.webname, cat, p);
        state = { ...state, currentUrl: pageUrl };
        onProgress(state);
        try {
          const html = await fetchHtmlViaProxy(pageUrl, signal);
          const links = discoverLinksFromHtml(html, pageUrl, config.webname);
          for (const link of links) {
            if (!seen.has(link)) {
              seen.add(link);
              targets.push({ url: link, sourceId: config.webname, categorySlug: cat });
            }
          }
        } catch (err) {
          pushLog('WARN', src.displayName, `Lỗi quét ${pageUrl}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  } else {
    const inputUrls = parseUrlsText(config.urlsText);
    const seen = new Set<string>();
    for (const rawUrl of inputUrls) {
      if (signal.aborted) break;
      const src = config.autoDetectSourceInUrlMode
        ? detectSourceFromUrl(rawUrl) || config.webname
        : config.webname;
      if (isArticleUrl(src, rawUrl)) {
        const clean = normalizeUrl(rawUrl);
        if (!seen.has(clean)) {
          seen.add(clean);
          targets.push({ url: clean, sourceId: src, categorySlug: 'url-direct' });
        }
      } else {
        state = { ...state, currentUrl: rawUrl };
        onProgress(state);
        try {
          const html = await fetchHtmlViaProxy(rawUrl, signal);
          const links = discoverLinksFromHtml(html, rawUrl, src);
          for (const link of links) {
            if (!seen.has(link)) {
              seen.add(link);
              targets.push({ url: link, sourceId: src, categorySlug: 'url-discovered' });
            }
          }
        } catch (err) {
          state = {
            ...state,
            failedUrls: [
              ...state.failedUrls,
              { url: rawUrl, sourceId: src, reason: err instanceof Error ? err.message : String(err) },
            ],
            failedCount: state.failedCount + 1,
          };
          onProgress(state);
        }
      }
    }
  }

  state = { ...state, phase: 'crawling', totalDiscovered: targets.length };
  onProgress(state);

  const byUrl = new Map<string, CrawledArticle>(
    existingArticles.map((a) => [normalizeUrl(a.url), a]),
  );

  let cursor = 0;
  const workerCount = Math.min(Math.max(1, config.numWorkers), Math.max(1, targets.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (!signal.aborted) {
        const idx = cursor++;
        if (idx >= targets.length) break;
        const target = targets[idx];
        state = { ...state, activeWorkers: state.activeWorkers + 1, currentUrl: target.url };
        onProgress(state);

        try {
          if (byUrl.has(normalizeUrl(target.url))) {
            state = {
              ...state,
              skippedCount: state.skippedCount + 1,
              processedCount: state.processedCount + 1,
            };
          } else {
            const html = await fetchHtmlViaProxy(target.url, signal);
            const parsed = parseArticleInBrowser(html, target.url, target.sourceId, target.categorySlug);
            byUrl.set(normalizeUrl(parsed.url), parsed);
            state = {
              ...state,
              successCount: state.successCount + 1,
              imageCount: state.imageCount + parsed.imageUrls.length,
              processedCount: state.processedCount + 1,
            };
            pushLog('INFO', NEWS_SOURCES[target.sourceId].displayName, `Đã lưu: "${parsed.title}"`);
          }
        } catch (err) {
          if (!signal.aborted) {
            const reason = err instanceof Error ? err.message : String(err);
            state = {
              ...state,
              failedCount: state.failedCount + 1,
              processedCount: state.processedCount + 1,
              failedUrls: [...state.failedUrls, { url: target.url, sourceId: target.sourceId, reason }],
            };
            pushLog('ERROR', NEWS_SOURCES[target.sourceId].displayName, `Thất bại ${target.url}: ${reason}`);
          }
        } finally {
          state = { ...state, activeWorkers: Math.max(0, state.activeWorkers - 1) };
          onProgress(state);
        }
      }
    }),
  );

  const updatedArticles = Array.from(byUrl.values()).sort((a, b) => b.crawledAt - a.crawledAt);
  await cacheArticlesOffline(updatedArticles);
  await saveLocalLogs(newLogs);

  const durationMs = Date.now() - startTime;
  const session: CrawlSession = {
    id: `${Date.now()}`,
    sourceId: config.webname,
    taskMode: config.task,
    categorySlug: config.task === 'type' ? config.articleType : 'url',
    totalUrls: targets.length,
    successCount: state.successCount,
    skippedCount: state.skippedCount,
    failedCount: state.failedCount,
    imageCount: state.imageCount,
    durationMs,
    createdAt: Date.now(),
  };
  const updatedSessions = [session, ...existingSessions].slice(0, 30);
  await saveLocalSessions(updatedSessions);

  const lastSummary = signal.aborted
    ? 'Đã dừng tiến trình thu thập'
    : state.successCount > 0
      ? `Tải xong! Đã lưu ${state.successCount} bài viết (${state.imageCount} ảnh)`
      : state.skippedCount > 0
        ? `Đã có sẵn ${state.skippedCount} bài viết`
        : targets.length === 0
          ? 'Không tìm thấy bài viết nào'
          : `Hoàn tất với ${state.failedCount} lỗi`;

  onProgress({
    ...state,
    isRunning: false,
    phase: 'completed',
    activeWorkers: 0,
    currentUrl: '',
    lastSummary,
  });

  return {
    articles: updatedArticles,
    logs: newLogs.slice(0, 500),
    sessions: updatedSessions,
  };
}
