import { NEWS_SOURCES } from '../../src/shared/types.ts';
import type { NewsSourceId } from '../../src/shared/types.ts';

const ALLOWED_CRAWL_HOSTS = new Set<string>([
  'vnexpress.net',
  'www.vnexpress.net',
  'm.vnexpress.net',
  'dantri.com.vn',
  'www.dantri.com.vn',
  'm.dantri.com.vn',
  'vietnamnet.vn',
  'www.vietnamnet.vn',
  'm.vietnamnet.vn',
]);

export function normalizeUrl(rawUrl: string): string {
  return rawUrl.trim().split('#')[0];
}

export function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }

  // Block private IPv4 ranges & link-local metadata IP (169.254.169.254)
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, aStr, bStr] = ipv4Match;
    const a = Number(aStr);
    const b = Number(bStr);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }

  // Block IPv6 link-local / unique local
  if (host.startsWith('fe80:') || host.startsWith('fc00:') || host.startsWith('fd')) {
    return true;
  }

  return false;
}

export function isAllowedCrawlUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (isPrivateOrLoopbackHost(host)) return false;
    return ALLOWED_CRAWL_HOSTS.has(host);
  } catch {
    return false;
  }
}

export function isSafeImageUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (isPrivateOrLoopbackHost(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function detectSourceFromUrl(rawUrl: string): NewsSourceId | null {
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

export function isArticleUrl(sourceId: NewsSourceId, rawUrl: string): boolean {
  const clean = normalizeUrl(rawUrl);
  switch (sourceId) {
    case 'vnexpress':
      return /^https?:\/\/(?:www\.|m\.)?vnexpress\.net\/.+\.html$/i.test(clean);
    case 'dantri':
      if (/\/trang-\d+\.htm$/i.test(clean)) return false;
      return /^https?:\/\/(?:www\.|m\.)?dantri\.com\.vn\/.+-\d+\.htm$/i.test(clean);
    case 'vietnamnet':
      return /^https?:\/\/(?:www\.|m\.)?vietnamnet\.vn\/.+\.html$/i.test(clean);
    default:
      return false;
  }
}

export function buildCategoryPageUrl(sourceId: NewsSourceId, categorySlug: string, pageNum: number): string {
  const base = NEWS_SOURCES[sourceId].baseUrl;
  if (categorySlug === 'trang-chu') {
    return base;
  }

  switch (sourceId) {
    case 'vnexpress':
      return pageNum <= 1 ? `${base}/${categorySlug}` : `${base}/${categorySlug}-p${pageNum}`;
    case 'dantri':
      return pageNum <= 1 ? `${base}/${categorySlug}.htm` : `${base}/${categorySlug}/trang-${pageNum}.htm`;
    case 'vietnamnet':
      return pageNum <= 1 ? `${base}/${categorySlug}` : `${base}/${categorySlug}-page${pageNum}`;
  }
}
