import { DEFAULT_CRAWL_CONFIG } from '../shared/types';
import type {
  CrawlConfig,
  CrawlLogEntry,
  CrawlSession,
  CrawledArticle,
} from '../shared/types';

const DB_NAME = 'vnnewscrawler_offline_v2';
const STORE_ARTICLES = 'articles';
const STORE_KV = 'kv';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ARTICLES)) {
        db.createObjectStore(STORE_ARTICLES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_KV)) {
        db.createObjectStore(STORE_KV);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheArticlesOffline(articles: CrawledArticle[]): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_ARTICLES, 'readwrite');
    const store = tx.objectStore(STORE_ARTICLES);
    store.clear();
    for (const article of articles) {
      store.put(article);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore offline storage errors
  }
}

export async function getOfflineCachedArticles(): Promise<CrawledArticle[]> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_ARTICLES, 'readonly');
    const store = tx.objectStore(STORE_ARTICLES);
    const req = store.getAll();
    const result = await new Promise<CrawledArticle[]>((resolve, reject) => {
      req.onsuccess = () => resolve((req.result as CrawledArticle[]) || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return [];
  }
}

async function getKv<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_KV, 'readonly');
    const store = tx.objectStore(STORE_KV);
    const req = store.get(key);
    const result = await new Promise<T>((resolve, reject) => {
      req.onsuccess = () => resolve((req.result as T) ?? fallback);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return fallback;
  }
}

async function setKv<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_KV, 'readwrite');
    const store = tx.objectStore(STORE_KV);
    store.put(value, key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore
  }
}

export async function getLocalConfig(): Promise<CrawlConfig> {
  return getKv<CrawlConfig>('config', { ...DEFAULT_CRAWL_CONFIG });
}

export async function saveLocalConfig(config: CrawlConfig): Promise<void> {
  await setKv('config', config);
}

export async function getLocalLogs(): Promise<CrawlLogEntry[]> {
  return getKv<CrawlLogEntry[]>('logs', []);
}

export async function saveLocalLogs(logs: CrawlLogEntry[]): Promise<void> {
  await setKv('logs', logs.slice(0, 500));
}

export async function getLocalSessions(): Promise<CrawlSession[]> {
  return getKv<CrawlSession[]>('sessions', []);
}

export async function saveLocalSessions(sessions: CrawlSession[]): Promise<void> {
  await setKv('sessions', sessions.slice(0, 30));
}
