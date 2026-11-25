import * as cheerio from 'cheerio';
import type { NewsSourceId } from '../../src/shared/types.ts';
import { isArticleUrl, normalizeUrl } from './sources.ts';

export interface ParsedArticle {
  url: string;
  sourceId: NewsSourceId;
  title: string;
  sapo: string;
  paragraphs: string[];
  bodyText: string;
  imageUrls: string[];
  publishedAt: number;
  wordCount: number;
}

function resolveAbsoluteUrl(baseUri: string, raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('javascript:')) return null;
  try {
    return new URL(trimmed, baseUri).toString();
  } catch {
    return null;
  }
}

function firstSrcsetUrl(srcset: string | undefined): string | null {
  if (!srcset) return null;
  const firstEntry = srcset.split(',')[0]?.trim();
  if (!firstEntry) return null;
  return firstEntry.split(/\s+/)[0] || null;
}

function shouldSkipImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.startsWith('data:image/') ||
    lower.includes('.svg') ||
    lower.includes('1x1') ||
    lower.includes('blank.gif') ||
    lower.includes('transparent.png') ||
    lower.includes('/icon/')
  );
}

export function extractArticleImageUrls(
  $: cheerio.CheerioAPI,
  contentRoot: cheerio.Cheerio<any>,
  baseUri: string,
): string[] {
  const root = contentRoot.length > 0 ? contentRoot : $('body');
  const seen = new Set<string>();

  const addCandidate = (raw: string | undefined | null) => {
    const abs = resolveAbsoluteUrl(baseUri, raw || undefined);
    if (!abs || shouldSkipImageUrl(abs)) return;
    seen.add(abs);
  };

  // Priority containers: .vnn-content-image, figure.image, figure.tplCaption, figure, picture
  root.find('.vnn-content-image, figure.image, figure.tplCaption, figure, picture').each((_, el) => {
    const container = $(el);
    let foundInSource = false;

    container.find('source').each((__, srcEl) => {
      const s = $(srcEl);
      const raw =
        firstSrcsetUrl(s.attr('data-srcset')) ||
        firstSrcsetUrl(s.attr('srcset')) ||
        s.attr('data-src') ||
        s.attr('src');
      if (raw) {
        addCandidate(raw);
        foundInSource = true;
      }
    });

    if (!foundInSource) {
      container.find('img').each((__, imgEl) => {
        const img = $(imgEl);
        const raw =
          img.attr('data-src') ||
          img.attr('data-original') ||
          img.attr('data-lazy-src') ||
          firstSrcsetUrl(img.attr('data-srcset')) ||
          img.attr('src');
        addCandidate(raw);
      });
    }
  });

  // Standalone <img> outside containers
  root.find('img').each((_, imgEl) => {
    const img = $(imgEl);
    if (img.closest('.vnn-content-image, figure, picture').length > 0) return;
    const raw =
      img.attr('data-src') ||
      img.attr('data-original') ||
      img.attr('data-lazy-src') ||
      firstSrcsetUrl(img.attr('data-srcset')) ||
      img.attr('src');
    addCandidate(raw);
  });

  // Fallback og:image if no content images found
  if (seen.size === 0) {
    const ogImg = $('meta[property="og:image"]').attr('content');
    addCandidate(ogImg);
  }

  return Array.from(seen);
}

export function parseVietnameseDateString(raw: string): number {
  if (!raw) return 0;
  const trimmed = raw.trim();

  // Try ISO-8601 directly if it contains 'T' or '-'
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const ts = Date.parse(trimmed);
    if (!Number.isNaN(ts) && ts > 0) return ts;
  }

  // Match Vietnamese date formats: "Thứ ba, 24/11/2026, 14:35 (GMT+7)" or "24/11/2026 - 12:30"
  const vnMatch = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\s,\-–]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (vnMatch) {
    const day = vnMatch[1].padStart(2, '0');
    const month = vnMatch[2].padStart(2, '0');
    const year = vnMatch[3];
    const hour = (vnMatch[4] || '00').padStart(2, '0');
    const minute = (vnMatch[5] || '00').padStart(2, '0');
    const second = (vnMatch[6] || '00').padStart(2, '0');
    const isoGmt7 = `${year}-${month}-${day}T${hour}:${minute}:${second}+07:00`;
    const ts = Date.parse(isoGmt7);
    if (!Number.isNaN(ts) && ts > 0) return ts;
  }

  const parsed = Date.parse(trimmed);
  return !Number.isNaN(parsed) && parsed > 0 ? parsed : 0;
}

export function extractPublishedTimestamp($: cheerio.CheerioAPI, sourceId: NewsSourceId): number {
  const selectorsBySource: Record<NewsSourceId, string[]> = {
    vnexpress: ['span.date', '.header-content .date', 'time[datetime]'],
    dantri: ['time.author-time', 'time.e-magazine__meta-time', '.author-wrap time', '.author-time', 'time[datetime]'],
    vietnamnet: ['div.bread-crumb-detail__time', '.bread-crumb-detail__time', '.article-detail-time', 'time[datetime]'],
  };

  for (const sel of selectorsBySource[sourceId]) {
    const el = $(sel).first();
    if (el.length > 0) {
      const dtAttr = el.attr('datetime');
      if (dtAttr) {
        const ts = parseVietnameseDateString(dtAttr);
        if (ts > 0) return ts;
      }
      const txt = el.text();
      if (txt) {
        const ts = parseVietnameseDateString(txt);
        if (ts > 0) return ts;
      }
    }
  }

  // Meta tag fallbacks
  const metaSelectors = [
    'meta[property="article:published_time"]',
    'meta[name="pubdate"]',
    'meta[itemprop="datePublished"]',
    'meta[property="og:updated_time"]',
  ];
  for (const sel of metaSelectors) {
    const content = $(sel).attr('content');
    if (content) {
      const ts = parseVietnameseDateString(content);
      if (ts > 0) return ts;
    }
  }

  // JSON-LD fallback
  let jsonLdTs = 0;
  $('script[type="application/ld+json"]').each((_, scriptEl) => {
    if (jsonLdTs > 0) return;
    const rawJson = $(scriptEl).html() || '';
    const match = rawJson.match(/"datePublished"\s*:\s*"([^"]+)"/);
    if (match?.[1]) {
      const ts = parseVietnameseDateString(match[1]);
      if (ts > 0) jsonLdTs = ts;
    }
  });

  return jsonLdTs;
}

function firstNonEmptyText($: cheerio.CheerioAPI, selectors: string[]): string {
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length > 0) {
      const text = el.text().replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
  }
  return '';
}

function extractParagraphs($: cheerio.CheerioAPI, rootSelectors: string[]): { root: cheerio.Cheerio<any>; paragraphs: string[] } {
  for (const sel of rootSelectors) {
    const root = $(sel).first();
    if (root.length > 0) {
      const pTags = root.find('p');
      const lines: string[] = [];
      pTags.each((_, p) => {
        const text = $(p).text().replace(/\s+/g, ' ').trim();
        if (text) lines.push(text);
      });
      if (lines.length > 0) {
        return { root, paragraphs: lines };
      }
    }
  }
  return { root: $('article').first(), paragraphs: [] };
}

export function discoverArticleUrls(html: string, baseUri: string, sourceId: NewsSourceId): string[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();

  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    const abs = resolveAbsoluteUrl(baseUri, href);
    if (!abs) return;
    const clean = normalizeUrl(abs);
    if (isArticleUrl(sourceId, clean)) {
      seen.add(clean);
    }
  });

  return Array.from(seen);
}

export function parseArticleHtml(html: string, url: string, sourceId: NewsSourceId): ParsedArticle {
  const $ = cheerio.load(html);

  let title = '';
  let sapo = '';
  let contentResult: { root: cheerio.Cheerio<any>; paragraphs: string[] } = { root: $('body'), paragraphs: [] };

  if (sourceId === 'vnexpress') {
    title =
      firstNonEmptyText($, ['h1.title-detail', 'h1.title-news', 'h1.title_news_detail', 'article h1', 'header h1', 'h1']) ||
      ($('meta[property="og:title"]').attr('content') || '').trim();
    sapo =
      firstNonEmptyText($, ['p.description', '.description']) ||
      ($('meta[property="og:description"]').attr('content') || '').trim();

    const fckRoot = $('article.fck_detail').first();
    if (fckRoot.length > 0) {
      const normalLines: string[] = [];
      fckRoot.find('p.Normal').each((_, p) => {
        const t = $(p).text().replace(/\s+/g, ' ').trim();
        if (t) normalLines.push(t);
      });
      if (normalLines.length > 0) {
        contentResult = { root: fckRoot, paragraphs: normalLines };
      } else {
        contentResult = extractParagraphs($, ['article.fck_detail', '.fck_detail', 'article']);
      }
    } else {
      contentResult = extractParagraphs($, ['.fck_detail', 'article']);
    }
  } else if (sourceId === 'dantri') {
    title =
      firstNonEmptyText($, ['h1.title-page.detail', 'h1.title-page', 'h1.e-magazine__title', 'h1.dt-news__title', 'article h1', 'main h1', 'h1']) ||
      ($('meta[property="og:title"]').attr('content') || '').trim();
    sapo =
      firstNonEmptyText($, ['h2.singular-sapo', 'h2.e-magazine__sapo', '.singular-sapo', '.e-magazine__sapo', '.dt-news__sapo']) ||
      ($('meta[property="og:description"]').attr('content') || '').trim();
    contentResult = extractParagraphs($, ['div.singular-content', 'div.e-magazine__body', 'div.dt-news__content', 'article.singular-container', 'article']);
  } else {
    title =
      firstNonEmptyText($, ['h1.content-detail-title', 'h1.title-detail', 'article h1', 'main h1', 'h1']) ||
      ($('meta[property="og:title"]').attr('content') || '').trim();
    sapo =
      firstNonEmptyText($, ['h2.content-detail-sapo', 'h2.sm-sapo-mb-0', '.content-detail-sapo']) ||
      ($('meta[property="og:description"]').attr('content') || '').trim();
    contentResult = extractParagraphs($, ['div.maincontent', 'div.main-content', '.content-detail-body', 'article']);
  }

  if (!title) {
    throw new Error('Không trích xuất được tiêu đề bài viết');
  }

  const imageUrls = extractArticleImageUrls($, contentResult.root, url);
  const publishedAt = extractPublishedTimestamp($, sourceId);
  const bodyText = contentResult.paragraphs.join('\n\n');
  const fullPlainText = [title, sapo, bodyText].filter(Boolean).join(' ');
  const wordCount = fullPlainText ? fullPlainText.split(/\s+/).filter(Boolean).length : 0;

  return {
    url: normalizeUrl(url),
    sourceId,
    title,
    sapo,
    paragraphs: contentResult.paragraphs,
    bodyText,
    imageUrls,
    publishedAt,
    wordCount,
  };
}
