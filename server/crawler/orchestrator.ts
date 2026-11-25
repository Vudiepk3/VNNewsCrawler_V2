import { EventEmitter } from 'events';
import {
  NEWS_SOURCES,
  parseUrlsText,
} from '../../src/shared/types.ts';
import type {
  CrawlConfig,
  CrawlProgressState,
  FailedUrlItem,
  NewsSourceId,
} from '../../src/shared/types.ts';
import {
  addSession,
  appendLog,
  isArticleAlreadyDownloaded,
  saveArticleWithImages,
  saveDiscoveredUrls,
} from '../storage/resultManager.ts';
import { delay, fetchHtml, fetchImageBuffer } from './fetcher.ts';
import { discoverArticleUrls, parseArticleHtml } from './parser.ts';
import {
  buildCategoryPageUrl,
  detectSourceFromUrl,
  isAllowedCrawlUrl,
  isArticleUrl,
  normalizeUrl,
} from './sources.ts';

interface CrawlTarget {
  url: string;
  sourceId: NewsSourceId;
  categorySlug: string;
}

const initialProgress: CrawlProgressState = {
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

class CrawlOrchestrator extends EventEmitter {
  private state: CrawlProgressState = { ...initialProgress };
  private abortController: AbortController | null = null;

  public getState(): CrawlProgressState {
    return { ...this.state, failedUrls: [...this.state.failedUrls] };
  }

  private updateState(patch: Partial<CrawlProgressState>): void {
    this.state = { ...this.state, ...patch };
    this.emit('progress', this.getState());
  }

  public stop(): boolean {
    if (!this.state.isRunning || !this.abortController) return false;
    this.updateState({ phase: 'stopping' });
    this.abortController.abort();
    appendLog('WARN', 'Orchestrator', 'Người dùng đã yêu cầu dừng tiến trình thu thập');
    return true;
  }

  public async start(config: CrawlConfig): Promise<void> {
    if (this.state.isRunning) {
      throw new Error('Tiến trình thu thập đang chạy');
    }

    const startTime = Date.now();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.updateState({
      isRunning: true,
      phase: 'discovering',
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
    });

    try {
      const targets: CrawlTarget[] = [];

      if (config.task === 'type') {
        const source = NEWS_SOURCES[config.webname];
        const categoriesToCrawl =
          config.articleType === 'all'
            ? source.categories.filter((c) => c.slug !== 'all' && c.slug !== 'trang-chu').map((c) => c.slug)
            : [config.articleType];

        appendLog(
          'INFO',
          source.displayName,
          `Bắt đầu quét chuyên mục: ${categoriesToCrawl.join(', ')} (${config.totalPages} trang)`,
        );

        const seenUrls = new Set<string>();

        for (const catSlug of categoriesToCrawl) {
          if (signal.aborted) break;
          const pages = catSlug === 'trang-chu' ? 1 : config.totalPages;
          const discoveredForCat: string[] = [];

          for (let page = 1; page <= pages; page++) {
            if (signal.aborted) break;
            if (page >= 2) {
              await delay(650, signal);
            }
            const pageUrl = buildCategoryPageUrl(config.webname, catSlug, page);
            this.updateState({ currentUrl: pageUrl });
            try {
              const { html, finalUrl } = await fetchHtml(pageUrl, signal);
              const links = discoverArticleUrls(html, finalUrl, config.webname);
              for (const link of links) {
                if (!seenUrls.has(link)) {
                  seenUrls.add(link);
                  discoveredForCat.push(link);
                  targets.push({ url: link, sourceId: config.webname, categorySlug: catSlug });
                }
              }
              appendLog('DEBUG', source.displayName, `Trang ${page} (${catSlug}): tìm thấy ${links.length} bài`);
            } catch (err) {
              if (signal.aborted) break;
              const msg = err instanceof Error ? err.message : String(err);
              appendLog('WARN', source.displayName, `Lỗi quét ${pageUrl}: ${msg}`);
            }
          }

          if (discoveredForCat.length > 0) {
            saveDiscoveredUrls(`${catSlug}.txt`, discoveredForCat);
          }
        }
      } else {
        // URL mode
        const inputUrls = parseUrlsText(config.urlsText);
        if (inputUrls.length === 0) {
          throw new Error('Vui lòng nhập ít nhất 1 URL hợp lệ');
        }

        appendLog('INFO', 'URLMode', `Phân tích ${inputUrls.length} URL đầu vào`);
        const seenUrls = new Set<string>();
        const discoveredLinks: string[] = [];

        for (const rawUrl of inputUrls) {
          if (signal.aborted) break;
          if (!isAllowedCrawlUrl(rawUrl)) {
            this.recordFailed(rawUrl, config.webname, 'Tên miền không thuộc VNExpress, Dân Trí hoặc VietNamNet');
            continue;
          }

          const resolvedSource = config.autoDetectSourceInUrlMode
            ? detectSourceFromUrl(rawUrl) || config.webname
            : config.webname;

          if (isArticleUrl(resolvedSource, rawUrl)) {
            const clean = normalizeUrl(rawUrl);
            if (!seenUrls.has(clean)) {
              seenUrls.add(clean);
              targets.push({ url: clean, sourceId: resolvedSource, categorySlug: 'url-direct' });
            }
          } else {
            // Homepage or category page -> discover articles inside
            this.updateState({ currentUrl: rawUrl });
            try {
              const { html, finalUrl } = await fetchHtml(rawUrl, signal);
              const links = discoverArticleUrls(html, finalUrl, resolvedSource);
              appendLog('INFO', NEWS_SOURCES[resolvedSource].displayName, `Khám phá ${links.length} bài viết từ ${rawUrl}`);
              for (const link of links) {
                if (!seenUrls.has(link)) {
                  seenUrls.add(link);
                  discoveredLinks.push(link);
                  targets.push({ url: link, sourceId: resolvedSource, categorySlug: 'url-discovered' });
                }
              }
            } catch (err) {
              if (signal.aborted) break;
              const reason = err instanceof Error ? err.message : String(err);
              this.recordFailed(rawUrl, resolvedSource, reason);
            }
          }
        }

        if (discoveredLinks.length > 0) {
          saveDiscoveredUrls('url_discovered.txt', discoveredLinks);
        }
      }

      await this.processTargets(targets, config, startTime, signal);
    } catch (err) {
      if (signal.aborted) {
        this.updateState({
          isRunning: false,
          phase: 'completed',
          activeWorkers: 0,
          lastSummary: 'Đã dừng tiến trình thu thập',
        });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        appendLog('ERROR', 'Orchestrator', msg);
        this.updateState({
          isRunning: false,
          phase: 'error',
          activeWorkers: 0,
          lastSummary: msg,
        });
      }
    } finally {
      this.abortController = null;
    }
  }

  public async retryFailed(items: FailedUrlItem[], numWorkers: number): Promise<void> {
    if (this.state.isRunning) {
      throw new Error('Tiến trình thu thập đang chạy');
    }
    if (items.length === 0) return;

    const startTime = Date.now();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.updateState({
      isRunning: true,
      phase: 'crawling',
      totalDiscovered: items.length,
      processedCount: 0,
      successCount: 0,
      skippedCount: 0,
      imageCount: 0,
      failedCount: 0,
      activeWorkers: 0,
      currentUrl: '',
      failedUrls: [],
      lastSummary: '',
    });

    const targets: CrawlTarget[] = items.map((i) => ({
      url: i.url,
      sourceId: i.sourceId,
      categorySlug: 'retry',
    }));

    const fakeConfig: CrawlConfig = {
      webname: items[0].sourceId,
      task: 'url',
      urlsText: '',
      articleType: 'retry',
      totalPages: 1,
      numWorkers: Math.max(1, Math.min(8, numWorkers || 4)),
      autoDetectSourceInUrlMode: true,
    };

    try {
      await this.processTargets(targets, fakeConfig, startTime, signal);
    } finally {
      this.abortController = null;
    }
  }

  private recordFailed(url: string, sourceId: NewsSourceId, reason: string): void {
    const failedUrls = [...this.state.failedUrls, { url, sourceId, reason }];
    this.updateState({
      failedUrls,
      failedCount: failedUrls.length,
    });
    appendLog('ERROR', NEWS_SOURCES[sourceId].displayName, `Thất bại ${url}: ${reason}`);
  }

  private async processTargets(
    targets: CrawlTarget[],
    config: CrawlConfig,
    startTime: number,
    signal: AbortSignal,
  ): Promise<void> {
    this.updateState({
      phase: 'crawling',
      totalDiscovered: targets.length,
    });

    if (targets.length === 0) {
      const msg = this.state.failedCount > 0 ? 'Không tìm thấy bài viết hợp lệ' : 'Không có bài viết nào được tìm thấy';
      this.updateState({
        isRunning: false,
        phase: 'completed',
        lastSummary: msg,
      });
      return;
    }

    let cursor = 0;
    const workerCount = Math.min(Math.max(1, config.numWorkers), targets.length);

    const runWorker = async () => {
      while (!signal.aborted) {
        const idx = cursor++;
        if (idx >= targets.length) break;
        const target = targets[idx];

        this.updateState({
          activeWorkers: this.state.activeWorkers + 1,
          currentUrl: target.url,
        });

        try {
          if (isArticleAlreadyDownloaded(target.url, target.sourceId)) {
            this.updateState({
              skippedCount: this.state.skippedCount + 1,
              processedCount: this.state.processedCount + 1,
            });
            appendLog('INFO', NEWS_SOURCES[target.sourceId].displayName, `Bỏ qua (đã có sẵn): ${target.url}`);
          } else {
            const { html, finalUrl } = await fetchHtml(target.url, signal);
            const parsed = parseArticleHtml(html, finalUrl, target.sourceId);

            // Download images with concurrency cap 3
            const downloadedImages: { buffer: Buffer; extension: string }[] = [];
            let imgCursor = 0;
            const imgWorkers = Math.min(3, parsed.imageUrls.length);
            await Promise.all(
              Array.from({ length: imgWorkers }, async () => {
                while (!signal.aborted) {
                  const iIdx = imgCursor++;
                  if (iIdx >= parsed.imageUrls.length) break;
                  const imgUrl = parsed.imageUrls[iIdx];
                  try {
                    const imgData = await fetchImageBuffer(imgUrl, finalUrl, signal);
                    downloadedImages[iIdx] = imgData;
                  } catch {
                    // Ignore individual image download errors
                  }
                }
              }),
            );

            const validImages = downloadedImages.filter(Boolean);
            saveArticleWithImages(parsed, target.categorySlug, validImages);

            this.updateState({
              successCount: this.state.successCount + 1,
              imageCount: this.state.imageCount + validImages.length,
              processedCount: this.state.processedCount + 1,
            });

            appendLog(
              'INFO',
              NEWS_SOURCES[target.sourceId].displayName,
              `Đã lưu: "${parsed.title}" (${validImages.length} ảnh)`,
            );
          }
        } catch (err) {
          if (!signal.aborted) {
            const reason = err instanceof Error ? err.message : String(err);
            this.recordFailed(target.url, target.sourceId, reason);
            this.updateState({
              processedCount: this.state.processedCount + 1,
            });
          }
        } finally {
          this.updateState({
            activeWorkers: Math.max(0, this.state.activeWorkers - 1),
          });
        }
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

    const durationMs = Date.now() - startTime;
    const { successCount, skippedCount, imageCount, failedCount } = this.state;

    let lastSummary = '';
    if (signal.aborted) {
      lastSummary = 'Đã dừng tiến trình thu thập';
    } else if (successCount > 0 && skippedCount > 0) {
      lastSummary = `Tải xong! Lưu ${successCount} bài mới (${imageCount} ảnh), ${skippedCount} bài đã có sẵn`;
    } else if (successCount > 0) {
      lastSummary = `Tải xong! Đã lưu ${successCount} bài viết và ${imageCount} ảnh`;
    } else if (skippedCount > 0 && failedCount === 0) {
      lastSummary = skippedCount === 1 ? 'Bài viết đã có sẵn' : `Đã có sẵn ${skippedCount} bài viết`;
    } else {
      lastSummary = `Hoàn tất với ${failedCount} lỗi`;
    }

    addSession({
      sourceId: config.webname,
      taskMode: config.task,
      categorySlug: config.task === 'type' ? config.articleType : 'url',
      totalUrls: targets.length,
      successCount,
      skippedCount,
      failedCount,
      imageCount,
      durationMs,
    });

    appendLog('INFO', 'Orchestrator', `${lastSummary} (${(durationMs / 1000).toFixed(1)}s)`);

    this.updateState({
      isRunning: false,
      phase: 'completed',
      activeWorkers: 0,
      currentUrl: '',
      lastSummary,
    });
  }
}

export const crawlOrchestrator = new CrawlOrchestrator();
