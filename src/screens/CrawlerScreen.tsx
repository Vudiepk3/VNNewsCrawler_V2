import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Code2,
  Copy,
  FileUp,
  Minus,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  NEWS_SOURCES,
  SAMPLE_URLS_BY_SOURCE,
  buildYamlPreview,
} from '../shared/types';
import type {
  CrawlConfig,
  CrawlProgressState,
  CrawlSession,
  NewsSourceId,
} from '../shared/types';
import { copyTextToClipboard, formatDateTime } from '../lib/shareUtils';

interface Props {
  config: CrawlConfig;
  progress: CrawlProgressState;
  sessions: CrawlSession[];
  onChangeConfig: (patch: Partial<CrawlConfig>) => void;
  onStartCrawl: () => void;
  onStopCrawl: () => void;
  onRetryFailed: () => void;
  onNotify: (type: 'success' | 'info' | 'warning' | 'error', message: string) => void;
  onOpenLibrary: () => void;
}

export const CrawlerScreen: React.FC<Props> = ({
  config,
  progress,
  sessions,
  onChangeConfig,
  onStartCrawl,
  onStopCrawl,
  onRetryFailed,
  onNotify,
  onOpenLibrary,
}) => {
  const [showYamlModal, setShowYamlModal] = useState(false);
  const [yamlCopied, setYamlCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentSource = NEWS_SOURCES[config.webname];
  const yamlContent = buildYamlPreview(config);

  const handleSelectSource = (sourceId: NewsSourceId) => {
    const firstCat = NEWS_SOURCES[sourceId].categories.find((c) => c.slug !== 'trang-chu' && c.slug !== 'all')?.slug || 'trang-chu';
    onChangeConfig({
      webname: sourceId,
      articleType: firstCat,
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      onChangeConfig({
        urlsText: config.urlsText ? `${config.urlsText.trim()}\n${text.trim()}` : text.trim(),
      });
      onNotify('success', `Đã nạp danh sách URL từ ${file.name}`);
    } catch {
      onNotify('error', 'Không thể đọc tệp .txt đã chọn');
    } finally {
      e.target.value = '';
    }
  };

  const handleLoadSampleUrls = () => {
    const samples = SAMPLE_URLS_BY_SOURCE[config.webname];
    onChangeConfig({
      urlsText: samples.join('\n'),
    });
    onNotify('info', `Đã nạp URL mẫu cho ${currentSource.displayName}`);
  };

  const handleCopyYaml = async () => {
    const ok = await copyTextToClipboard(yamlContent);
    if (ok) {
      setYamlCopied(true);
      onNotify('success', 'Đã sao chép cấu hình crawler_config.yml');
      setTimeout(() => setYamlCopied(false), 1800);
    }
  };

  const progressRatio =
    progress.totalDiscovered > 0
      ? Math.min(100, Math.round((progress.processedCount / progress.totalDiscovered) * 100))
      : 0;

  return (
    <div className="space-y-6">
      {/* Page Title Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Thu thập tin tức
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Quét bài viết, hình ảnh gốc và mốc thời gian từ VNExpress, Dân Trí, VietNamNet để đọc ngoại tuyến.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowYamlModal(true)}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Code2 className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <span>YAML</span>
        </button>
      </div>

      {/* Responsive 2-column grid on desktop */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: 4-Step Configuration */}
        <div className="space-y-5 lg:col-span-7">
          {/* Step 01: News Source */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              01. Chọn nguồn báo
            </h2>
            <div className="mt-3 grid grid-cols-3 gap-2.5">
              {(Object.keys(NEWS_SOURCES) as NewsSourceId[]).map((id) => {
                const src = NEWS_SOURCES[id];
                const active = config.webname === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={progress.isRunning}
                    onClick={() => handleSelectSource(id)}
                    className={`min-h-[48px] rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      active
                        ? 'border-red-700 bg-red-50/80 text-red-900 dark:border-red-500 dark:bg-red-950/40 dark:text-red-100'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="text-sm font-semibold whitespace-nowrap truncate">{src.displayName}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500 truncate dark:text-slate-400">
                      {src.domain}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 02: Crawl Mode */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              02. Chế độ thu thập
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                disabled={progress.isRunning}
                onClick={() => onChangeConfig({ task: 'type' })}
                className={`min-h-[42px] rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  config.task === 'type'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                Theo chuyên mục
              </button>
              <button
                type="button"
                disabled={progress.isRunning}
                onClick={() => onChangeConfig({ task: 'url' })}
                className={`min-h-[42px] rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  config.task === 'url'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                Theo URL
              </button>
            </div>
          </section>

          {/* Step 03: Category & Pages OR URL List */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            {config.task === 'type' ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    03. Chuyên mục & Số trang ({currentSource.categories.length - 2} chuyên mục)
                  </h2>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {currentSource.categories.map((cat) => {
                    const selected = config.articleType === cat.slug;
                    return (
                      <button
                        key={cat.slug}
                        type="button"
                        disabled={progress.isRunning}
                        onClick={() => onChangeConfig({ articleType: cat.slug })}
                        className={`min-h-[38px] rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          selected
                            ? 'border-red-700 bg-red-700 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      Số trang cần quét
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {config.articleType === 'trang-chu'
                        ? 'Trang chủ mặc định quét 1 trang'
                        : 'Quét từ trang 1 đến trang N (tối đa 20)'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={progress.isRunning || config.totalPages <= 1 || config.articleType === 'trang-chu'}
                      onClick={() => onChangeConfig({ totalPages: Math.max(1, config.totalPages - 1) })}
                      aria-label="Giảm số trang"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-10 text-center text-base font-semibold font-mono-data tabular-nums text-slate-900 dark:text-slate-100">
                      {config.articleType === 'trang-chu' ? 1 : config.totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={progress.isRunning || config.totalPages >= 20 || config.articleType === 'trang-chu'}
                      onClick={() => onChangeConfig({ totalPages: Math.min(20, config.totalPages + 1) })}
                      aria-label="Tăng số trang"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    03. Danh sách URL bài viết hoặc chuyên mục
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,text/plain"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <button
                      type="button"
                      disabled={progress.isRunning}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <FileUp className="h-3.5 w-3.5" />
                      <span>Nạp .txt</span>
                    </button>
                    <button
                      type="button"
                      disabled={progress.isRunning}
                      onClick={handleLoadSampleUrls}
                      className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      URL mẫu
                    </button>
                    {config.urlsText.trim() && (
                      <button
                        type="button"
                        disabled={progress.isRunning}
                        onClick={() => onChangeConfig({ urlsText: '' })}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-slate-700 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Xóa</span>
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  rows={5}
                  disabled={progress.isRunning}
                  value={config.urlsText}
                  onChange={(e) => onChangeConfig({ urlsText: e.target.value })}
                  placeholder={`Dán một hoặc nhiều URL (mỗi dòng 1 URL) từ VNExpress, Dân Trí, VietNamNet...\nVí dụ: https://vnexpress.net/khoa-hoc`}
                  className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-mono-data text-slate-900 placeholder:text-slate-400 focus:border-red-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />

                <label className="mt-3 flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5 dark:bg-slate-800/60">
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      Tự nhận diện báo theo tên miền
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Cho phép thu thập trộn nhiều nguồn báo trong cùng 1 lần chạy
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.autoDetectSourceInUrlMode}
                    disabled={progress.isRunning}
                    onChange={(e) => onChangeConfig({ autoDetectSourceInUrlMode: e.target.checked })}
                    className="h-5 w-5 accent-red-700"
                  />
                </label>
              </>
            )}
          </section>

          {/* Step 04: Workers & Primary Action */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  04. Số luồng song song (num_workers)
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Điều chỉnh từ 1 đến 8 luồng tải bài đồng thời
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={progress.isRunning || config.numWorkers <= 1}
                  onClick={() => onChangeConfig({ numWorkers: Math.max(1, config.numWorkers - 1) })}
                  aria-label="Giảm số luồng"
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-10 text-center text-base font-semibold font-mono-data tabular-nums text-slate-900 dark:text-slate-100">
                  {config.numWorkers}
                </span>
                <button
                  type="button"
                  disabled={progress.isRunning || config.numWorkers >= 8}
                  onClick={() => onChangeConfig({ numWorkers: Math.min(8, config.numWorkers + 1) })}
                  aria-label="Tăng số luồng"
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {config.numWorkers > 4 && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Chạy trên 4 luồng có thể khiến máy chủ báo giới hạn tốc độ (HTTP 429).</span>
              </div>
            )}

            <div className="mt-5">
              {progress.isRunning ? (
                <button
                  type="button"
                  onClick={onStopCrawl}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  <Square className="h-4 w-4 fill-current" />
                  <span>Dừng thu thập</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onStartCrawl}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-800 active:scale-[0.99]"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>Bắt đầu thu thập</span>
                </button>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Live Progress, Retry Failed & Recent Sessions */}
        <div className="space-y-5 lg:col-span-5">
          {/* Progress Card */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Tiến trình thu thập
              </h2>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {progress.phase === 'idle' && 'Sẵn sàng'}
                {progress.phase === 'discovering' && 'Đang tìm liên kết...'}
                {progress.phase === 'crawling' && 'Đang tải bài viết...'}
                {progress.phase === 'stopping' && 'Đang dừng...'}
                {progress.phase === 'completed' && 'Hoàn tất'}
                {progress.phase === 'error' && 'Có lỗi'}
              </span>
            </div>

            {progress.totalDiscovered > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span>Tiến độ bài viết</span>
                  <span className="font-mono-data tabular-nums">
                    {progress.processedCount}/{progress.totalDiscovered} ({progressRatio}%)
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-red-700 transition-all duration-200"
                    style={{ width: `${progressRatio}%` }}
                  />
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-5 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60">
                <div className="text-lg font-bold font-mono-data tabular-nums text-emerald-700 dark:text-emerald-400">
                  {progress.successCount}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Mới</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60">
                <div className="text-lg font-bold font-mono-data tabular-nums text-slate-700 dark:text-slate-200">
                  {progress.skippedCount}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Có sẵn</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60">
                <div className="text-lg font-bold font-mono-data tabular-nums text-blue-700 dark:text-blue-400">
                  {progress.imageCount}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Ảnh</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60">
                <div className="text-lg font-bold font-mono-data tabular-nums text-red-700 dark:text-red-400">
                  {progress.failedCount}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Lỗi</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60">
                <div className="text-lg font-bold font-mono-data tabular-nums text-slate-900 dark:text-slate-100">
                  {progress.activeWorkers}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Luồng</div>
              </div>
            </div>

            {progress.currentUrl && (
              <div className="mt-3 truncate rounded-lg bg-slate-50 px-3 py-2 text-xs font-mono-data text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                {progress.currentUrl}
              </div>
            )}

            {progress.lastSummary && !progress.isRunning && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {progress.lastSummary}
                </span>
                {progress.successCount + progress.skippedCount > 0 && (
                  <button
                    type="button"
                    onClick={onOpenLibrary}
                    className="text-xs font-semibold text-red-700 hover:underline dark:text-red-400"
                  >
                    Mở kho bài viết →
                  </button>
                )}
              </div>
            )}

            {/* Failed URLs & Retry */}
            {progress.failedUrls.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-red-700 dark:text-red-400">
                    URL thất bại ({progress.failedUrls.length})
                  </span>
                  {!progress.isRunning && (
                    <button
                      type="button"
                      onClick={onRetryFailed}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-300"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Thử lại các URL bị lỗi</span>
                    </button>
                  )}
                </div>
                <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-xs">
                  {progress.failedUrls.map((f, idx) => (
                    <li
                      key={`${f.url}-${idx}`}
                      className="rounded-lg bg-red-50/70 px-2.5 py-1.5 text-red-900 dark:bg-red-950/30 dark:text-red-200"
                    >
                      <div className="truncate font-mono-data">{f.url}</div>
                      <div className="text-[11px] opacity-80">{f.reason}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Recent Sessions */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Lịch sử phiên gần đây
            </h2>
            {sessions.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Chưa có phiên thu thập nào được ghi nhận.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {sessions.slice(0, 6).map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate dark:text-slate-100">
                        {NEWS_SOURCES[s.sourceId]?.displayName || s.sourceId} · {s.categorySlug}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {formatDateTime(s.createdAt)} · {(s.durationMs / 1000).toFixed(1)}s
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-mono-data tabular-nums">
                      <span className="text-emerald-700 dark:text-emerald-400">+{s.successCount}</span>
                      {s.skippedCount > 0 && (
                        <span className="ml-2 text-slate-500">/{s.skippedCount} sẵn</span>
                      )}
                      {s.failedCount > 0 && (
                        <span className="ml-2 text-red-600 dark:text-red-400">/{s.failedCount} lỗi</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* YAML Preview Modal */}
      {showYamlModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setShowYamlModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-slate-900 dark:border dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden dark:bg-slate-700" />
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                crawler_config.yml
              </h3>
              <button
                type="button"
                onClick={() => setShowYamlModal(false)}
                aria-label="Đóng"
                className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <pre className="mt-4 max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs font-mono-data text-slate-100">
              {yamlContent}
            </pre>

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handleCopyYaml}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-800"
              >
                {yamlCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span>{yamlCopied ? 'Đã sao chép' : 'Sao chép YAML'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowYamlModal(false)}
                className="min-h-[44px] rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
