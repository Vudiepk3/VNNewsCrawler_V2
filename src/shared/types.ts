export type NewsSourceId = 'vnexpress' | 'dantri' | 'vietnamnet';

export type CrawlTaskMode = 'type' | 'url';

export type ArticleSortOrder = 'newest' | 'crawled' | 'oldest';

export type LogLevel = 'INFO' | 'DEBUG' | 'WARN' | 'ERROR';

export interface CategoryOption {
  slug: string;
  label: string;
}

export interface NewsSourceMeta {
  id: NewsSourceId;
  displayName: string;
  folderName: string;
  domain: string;
  baseUrl: string;
  accentColor: string;
  categories: CategoryOption[];
}

export const NEWS_SOURCES: Record<NewsSourceId, NewsSourceMeta> = {
  vnexpress: {
    id: 'vnexpress',
    displayName: 'VNExpress',
    folderName: 'VNExpress',
    domain: 'vnexpress.net',
    baseUrl: 'https://vnexpress.net',
    accentColor: '#B91C1C',
    categories: [
      { slug: 'trang-chu', label: 'Trang chủ' },
      { slug: 'all', label: 'Tất cả (all)' },
      { slug: 'thoi-su', label: 'Thời sự' },
      { slug: 'du-lich', label: 'Du lịch' },
      { slug: 'the-gioi', label: 'Thế giới' },
      { slug: 'kinh-doanh', label: 'Kinh doanh' },
      { slug: 'khoa-hoc', label: 'Khoa học' },
      { slug: 'giai-tri', label: 'Giải trí' },
      { slug: 'the-thao', label: 'Thể thao' },
      { slug: 'phap-luat', label: 'Pháp luật' },
      { slug: 'giao-duc', label: 'Giáo dục' },
      { slug: 'suc-khoe', label: 'Sức khỏe' },
      { slug: 'doi-song', label: 'Đời sống' },
    ],
  },
  dantri: {
    id: 'dantri',
    displayName: 'Dân Trí',
    folderName: 'DanTri',
    domain: 'dantri.com.vn',
    baseUrl: 'https://dantri.com.vn',
    accentColor: '#0F766E',
    categories: [
      { slug: 'trang-chu', label: 'Trang chủ' },
      { slug: 'all', label: 'Tất cả (all)' },
      { slug: 'thoi-su', label: 'Thời sự' },
      { slug: 'xa-hoi', label: 'Xã hội' },
      { slug: 'the-gioi', label: 'Thế giới' },
      { slug: 'kinh-doanh', label: 'Kinh doanh' },
      { slug: 'bat-dong-san', label: 'Bất động sản' },
      { slug: 'the-thao', label: 'Thể thao' },
      { slug: 'lao-dong-viec-lam', label: 'Lao động - Việc làm' },
      { slug: 'tam-long-nhan-ai', label: 'Tấm lòng nhân ái' },
      { slug: 'suc-khoe', label: 'Sức khỏe' },
      { slug: 'van-hoa', label: 'Văn hóa' },
      { slug: 'giai-tri', label: 'Giải trí' },
      { slug: 'suc-manh-so', label: 'Sức mạnh số' },
      { slug: 'giao-duc', label: 'Giáo dục' },
      { slug: 'an-sinh', label: 'An sinh' },
      { slug: 'phap-luat', label: 'Pháp luật' },
    ],
  },
  vietnamnet: {
    id: 'vietnamnet',
    displayName: 'VietNamNet',
    folderName: 'VietNamNet',
    domain: 'vietnamnet.vn',
    baseUrl: 'https://vietnamnet.vn',
    accentColor: '#1D4ED8',
    categories: [
      { slug: 'trang-chu', label: 'Trang chủ' },
      { slug: 'all', label: 'Tất cả (all)' },
      { slug: 'thoi-su', label: 'Thời sự' },
      { slug: 'kinh-doanh', label: 'Kinh doanh' },
      { slug: 'the-thao', label: 'Thể thao' },
      { slug: 'van-hoa', label: 'Văn hóa' },
      { slug: 'giai-tri', label: 'Giải trí' },
      { slug: 'the-gioi', label: 'Thế giới' },
      { slug: 'doi-song', label: 'Đời sống' },
      { slug: 'giao-duc', label: 'Giáo dục' },
      { slug: 'suc-khoe', label: 'Sức khỏe' },
      { slug: 'thong-tin-truyen-thong', label: 'Thông tin & Truyền thông' },
      { slug: 'phap-luat', label: 'Pháp luật' },
      { slug: 'oto-xe-may', label: 'Ô tô - Xe máy' },
      { slug: 'bat-dong-san', label: 'Bất động sản' },
      { slug: 'du-lich', label: 'Du lịch' },
    ],
  },
};

export const SAMPLE_URLS_BY_SOURCE: Record<NewsSourceId, string[]> = {
  vnexpress: [
    'https://vnexpress.net/khoa-hoc',
    'https://vnexpress.net/thoi-su',
  ],
  dantri: [
    'https://dantri.com.vn/suc-manh-so.htm',
    'https://dantri.com.vn/thoi-su.htm',
  ],
  vietnamnet: [
    'https://vietnamnet.vn/thong-tin-truyen-thong',
    'https://vietnamnet.vn/kinh-doanh',
  ],
};

export interface CrawlConfig {
  webname: NewsSourceId;
  task: CrawlTaskMode;
  urlsText: string;
  articleType: string;
  totalPages: number;
  numWorkers: number;
  autoDetectSourceInUrlMode: boolean;
}

export const DEFAULT_CRAWL_CONFIG: CrawlConfig = {
  webname: 'vnexpress',
  task: 'type',
  urlsText: '',
  articleType: 'khoa-hoc',
  totalPages: 1,
  numWorkers: 4,
  autoDetectSourceInUrlMode: true,
};

export interface CrawledArticle {
  id: string;
  url: string;
  sourceId: NewsSourceId;
  categorySlug: string;
  articleTag: string;
  title: string;
  sapo: string;
  bodyText: string;
  txtFilePath: string;
  wordCount: number;
  imageUrls: string[];
  localImagePaths: string[];
  publishedAt: number;
  crawledAt: number;
}

export interface CrawlLogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  tag: string;
  message: string;
}

export interface CrawlSession {
  id: string;
  sourceId: NewsSourceId;
  taskMode: CrawlTaskMode;
  categorySlug: string;
  totalUrls: number;
  successCount: number;
  skippedCount: number;
  failedCount: number;
  imageCount: number;
  durationMs: number;
  createdAt: number;
}

export interface FailedUrlItem {
  url: string;
  sourceId: NewsSourceId;
  reason: string;
}

export interface CrawlProgressState {
  isRunning: boolean;
  phase: 'idle' | 'discovering' | 'crawling' | 'stopping' | 'completed' | 'error';
  totalDiscovered: number;
  processedCount: number;
  successCount: number;
  skippedCount: number;
  imageCount: number;
  failedCount: number;
  activeWorkers: number;
  currentUrl: string;
  failedUrls: FailedUrlItem[];
  lastSummary: string;
}

export interface ResultFileItem {
  relativePath: string;
  name: string;
  directory: string;
  sizeBytes: number;
  modifiedAt: number;
  isImage: boolean;
  isText: boolean;
}

export interface TopNotification {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
}

export function getDisplayTimestamp(article: Pick<CrawledArticle, 'publishedAt' | 'crawledAt'>): number {
  return article.publishedAt > 0 ? article.publishedAt : article.crawledAt;
}

export function parseUrlsText(urlsText: string): string[] {
  const tokens = urlsText
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tokens) {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const cleaned = withProto.split('#')[0];
    if (!seen.has(cleaned)) {
      seen.add(cleaned);
      result.push(cleaned);
    }
  }
  return result;
}

export function buildYamlPreview(config: CrawlConfig): string {
  const urls = parseUrlsText(config.urlsText);
  const urlsBlock =
    urls.length > 0
      ? urls.map((u) => `  - "${u}"`).join('\n')
      : '  []';

  return [
    `webname: "${config.webname}"`,
    `task: "${config.task}"`,
    `article_type: "${config.articleType}"`,
    `total_pages: ${config.totalPages}`,
    `num_workers: ${config.numWorkers}`,
    `auto_detect_source: ${config.autoDetectSourceInUrlMode}`,
    `urls:`,
    urlsBlock,
  ].join('\n');
}
