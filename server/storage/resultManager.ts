import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_CRAWL_CONFIG,
  NEWS_SOURCES,
  getDisplayTimestamp,
} from '../../src/shared/types.ts';
import type {
  ArticleSortOrder,
  CrawlConfig,
  CrawlLogEntry,
  CrawlSession,
  CrawledArticle,
  LogLevel,
  NewsSourceId,
  ResultFileItem,
} from '../../src/shared/types.ts';
import type { ParsedArticle } from '../crawler/parser.ts';
import { normalizeUrl } from '../crawler/sources.ts';

export const RESULT_DIR = path.resolve(process.cwd(), 'result');
const STORE_PATH = path.join(RESULT_DIR, '.store.json');
const INFO_LOG_PATH = path.join(RESULT_DIR, 'info.log');

interface StoreSchema {
  config: CrawlConfig;
  articles: CrawledArticle[];
  logs: CrawlLogEntry[];
  sessions: CrawlSession[];
}

function ensureResultBaseDirs(): void {
  fs.mkdirSync(RESULT_DIR, { recursive: true });
  fs.mkdirSync(path.join(RESULT_DIR, 'urls'), { recursive: true });
  for (const src of Object.values(NEWS_SOURCES)) {
    fs.mkdirSync(path.join(RESULT_DIR, src.folderName), { recursive: true });
  }
}

function loadStore(): StoreSchema {
  ensureResultBaseDirs();
  if (!fs.existsSync(STORE_PATH)) {
    return {
      config: { ...DEFAULT_CRAWL_CONFIG },
      articles: [],
      logs: [],
      sessions: [],
    };
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoreSchema>;
    return {
      config: { ...DEFAULT_CRAWL_CONFIG, ...(parsed.config || {}) },
      articles: Array.isArray(parsed.articles) ? parsed.articles : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return {
      config: { ...DEFAULT_CRAWL_CONFIG },
      articles: [],
      logs: [],
      sessions: [],
    };
  }
}

let storeCache: StoreSchema = loadStore();

function persistStore(): void {
  ensureResultBaseDirs();
  const tmpPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(storeCache, null, 2), 'utf-8');
  fs.renameSync(tmpPath, STORE_PATH);
}

export function resolveSafeResultPath(relativePath: string): string {
  const cleaned = relativePath.replace(/^[/\\]+/, '');
  const resolved = path.resolve(RESULT_DIR, cleaned);
  if (resolved !== RESULT_DIR && !resolved.startsWith(RESULT_DIR + path.sep)) {
    throw new Error('Đường dẫn tệp không hợp lệ');
  }
  return resolved;
}

function stripVietnameseDiacritics(input: string): string {
  return input
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function buildArticleTag(url: string, title = ''): string {
  let slug = '';
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const lastSeg = segments[segments.length - 1] || '';
    slug = lastSeg.replace(/\.(html|htm|aspx|php)$/i, '');
  } catch {
    slug = '';
  }

  if (!slug && title) {
    slug = stripVietnameseDiacritics(title);
  }

  const sanitized = stripVietnameseDiacritics(slug)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const finalSlug = sanitized || `article-${Date.now()}`;
  if (finalSlug.length <= 100) {
    return finalSlug;
  }
  return `${finalSlug.slice(0, 62).replace(/-+$/g, '')}-${finalSlug.slice(-36).replace(/^-+/g, '')}`;
}

export function getConfig(): CrawlConfig {
  return storeCache.config;
}

export function saveConfig(partial: Partial<CrawlConfig>): CrawlConfig {
  storeCache.config = {
    ...storeCache.config,
    ...partial,
    totalPages: Math.max(1, Math.min(20, Number(partial.totalPages ?? storeCache.config.totalPages) || 1)),
    numWorkers: Math.max(1, Math.min(8, Number(partial.numWorkers ?? storeCache.config.numWorkers) || 4)),
  };
  persistStore();
  return storeCache.config;
}

export function appendLog(level: LogLevel, tag: string, message: string): CrawlLogEntry {
  const entry: CrawlLogEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    level,
    tag,
    message,
  };
  storeCache.logs = [entry, ...storeCache.logs].slice(0, 500);
  persistStore();

  try {
    ensureResultBaseDirs();
    const ts = new Date(entry.timestamp).toISOString();
    fs.appendFileSync(INFO_LOG_PATH, `[${ts}] [${level}] [${tag}] ${message}\n`, 'utf-8');
  } catch {
    // Ignore file log error
  }
  return entry;
}

export function getLogs(level?: LogLevel): CrawlLogEntry[] {
  if (!level) return storeCache.logs;
  return storeCache.logs.filter((l) => l.level === level);
}

export function clearLogs(): void {
  storeCache.logs = [];
  persistStore();
  try {
    if (fs.existsSync(INFO_LOG_PATH)) {
      fs.writeFileSync(INFO_LOG_PATH, '', 'utf-8');
    }
  } catch {
    // Ignore
  }
}

export function saveDiscoveredUrls(filename: string, urls: string[]): string {
  ensureResultBaseDirs();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const outPath = resolveSafeResultPath(path.join('urls', safeName));
  fs.writeFileSync(outPath, urls.join('\n') + (urls.length ? '\n' : ''), 'utf-8');
  return path.relative(RESULT_DIR, outPath).replace(/\\/g, '/');
}

export function isArticleAlreadyDownloaded(rawUrl: string, sourceId: NewsSourceId): boolean {
  const norm = normalizeUrl(rawUrl);
  const existing = storeCache.articles.find((a) => normalizeUrl(a.url) === norm);
  if (existing) {
    try {
      const fullTxt = resolveSafeResultPath(existing.txtFilePath);
      if (fs.existsSync(fullTxt)) return true;
    } catch {
      // fallback check below
    }
  }

  const tag = buildArticleTag(norm);
  const folder = NEWS_SOURCES[sourceId].folderName;
  const fallbackTxt = path.join(RESULT_DIR, folder, tag, `${tag}.txt`);
  return fs.existsSync(fallbackTxt);
}

export function saveArticleWithImages(
  parsed: ParsedArticle,
  categorySlug: string,
  downloadedImages: { buffer: Buffer; extension: string }[],
): CrawledArticle {
  const folderName = NEWS_SOURCES[parsed.sourceId].folderName;
  const articleTag = buildArticleTag(parsed.url, parsed.title);
  const articleDir = path.join(RESULT_DIR, folderName, articleTag);
  fs.mkdirSync(articleDir, { recursive: true });

  const localImagePaths: string[] = [];
  downloadedImages.forEach((img, index) => {
    const num = String(index + 1).padStart(2, '0');
    const fileName = `img_${num}.${img.extension}`;
    const absImgPath = path.join(articleDir, fileName);
    fs.writeFileSync(absImgPath, img.buffer);
    localImagePaths.push(path.relative(RESULT_DIR, absImgPath).replace(/\\/g, '/'));
  });

  const txtFileName = `${articleTag}.txt`;
  const absTxtPath = path.join(articleDir, txtFileName);
  const txtLines: string[] = [parsed.title];
  if (parsed.sapo) txtLines.push(parsed.sapo);
  if (parsed.paragraphs.length > 0) {
    txtLines.push(...parsed.paragraphs);
  }
  const imageSection =
    parsed.imageUrls.length > 0
      ? `\n\n[IMAGE_URLS]\n${parsed.imageUrls.join('\n')}\n`
      : '\n';

  fs.writeFileSync(absTxtPath, txtLines.join('\n') + imageSection, 'utf-8');
  const txtFilePath = path.relative(RESULT_DIR, absTxtPath).replace(/\\/g, '/');

  const now = Date.now();
  const existingIdx = storeCache.articles.findIndex(
    (a) => normalizeUrl(a.url) === normalizeUrl(parsed.url),
  );

  const record: CrawledArticle = {
    id: existingIdx >= 0 ? storeCache.articles[existingIdx].id : crypto.randomUUID(),
    url: normalizeUrl(parsed.url),
    sourceId: parsed.sourceId,
    categorySlug,
    articleTag,
    title: parsed.title,
    sapo: parsed.sapo,
    bodyText: parsed.bodyText,
    txtFilePath,
    wordCount: parsed.wordCount,
    imageUrls: parsed.imageUrls,
    localImagePaths,
    publishedAt: parsed.publishedAt,
    crawledAt: now,
  };

  if (existingIdx >= 0) {
    storeCache.articles[existingIdx] = record;
  } else {
    storeCache.articles.unshift(record);
  }
  persistStore();
  return record;
}

export function queryArticles(opts: {
  search?: string;
  source?: NewsSourceId | 'all';
  sort?: ArticleSortOrder;
}): CrawledArticle[] {
  let list = [...storeCache.articles];

  if (opts.source && opts.source !== 'all') {
    list = list.filter((a) => a.sourceId === opts.source);
  }

  if (opts.search && opts.search.trim()) {
    const q = opts.search.trim().toLowerCase();
    list = list.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.sapo.toLowerCase().includes(q) ||
        a.categorySlug.toLowerCase().includes(q),
    );
  }

  const sortMode = opts.sort || 'newest';
  list.sort((a, b) => {
    if (sortMode === 'crawled') {
      return b.crawledAt - a.crawledAt;
    }
    const ta = getDisplayTimestamp(a);
    const tb = getDisplayTimestamp(b);
    if (sortMode === 'oldest') {
      return ta - tb || a.crawledAt - b.crawledAt;
    }
    // newest
    return tb - ta || b.crawledAt - a.crawledAt;
  });

  return list;
}

export function getArticleById(id: string): CrawledArticle | null {
  return storeCache.articles.find((a) => a.id === id) || null;
}

export function deleteArticlesByIds(ids: string[]): number {
  const idSet = new Set(ids);
  const toDelete = storeCache.articles.filter((a) => idSet.has(a.id));
  if (toDelete.length === 0) return 0;

  for (const article of toDelete) {
    const pathsToRemove = [article.txtFilePath, ...article.localImagePaths];
    let parentDirToCheck: string | null = null;
    for (const rel of pathsToRemove) {
      try {
        const abs = resolveSafeResultPath(rel);
        if (!parentDirToCheck) parentDirToCheck = path.dirname(abs);
        if (fs.existsSync(abs)) {
          fs.unlinkSync(abs);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
    if (parentDirToCheck && fs.existsSync(parentDirToCheck)) {
      try {
        const remaining = fs.readdirSync(parentDirToCheck);
        if (remaining.length === 0) {
          fs.rmdirSync(parentDirToCheck);
        }
      } catch {
        // Ignore
      }
    }
  }

  storeCache.articles = storeCache.articles.filter((a) => !idSet.has(a.id));
  persistStore();
  return toDelete.length;
}

export function addSession(session: Omit<CrawlSession, 'id' | 'createdAt'>): CrawlSession {
  const item: CrawlSession = {
    ...session,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  storeCache.sessions = [item, ...storeCache.sessions].slice(0, 30);
  persistStore();
  return item;
}

export function getSessions(): CrawlSession[] {
  return storeCache.sessions;
}

export function listResultFiles(): ResultFileItem[] {
  ensureResultBaseDirs();
  const items: ResultFileItem[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const stat = fs.statSync(fullPath);
        const rel = path.relative(RESULT_DIR, fullPath).replace(/\\/g, '/');
        const dirRel = path.dirname(rel) === '.' ? 'result' : `result/${path.dirname(rel)}`;
        const lower = entry.name.toLowerCase();
        items.push({
          relativePath: rel,
          name: entry.name,
          directory: dirRel,
          sizeBytes: stat.size,
          modifiedAt: stat.mtimeMs,
          isImage: /\.(jpg|jpeg|png|webp|gif)$/i.test(lower),
          isText: /\.(txt|log|yml|yaml|json)$/i.test(lower),
        });
      }
    }
  }

  walk(RESULT_DIR);
  items.sort((a, b) => b.modifiedAt - a.modifiedAt);
  return items;
}
