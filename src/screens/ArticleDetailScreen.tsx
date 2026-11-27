import React, { useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Minus,
  Plus,
  Share2,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { NEWS_SOURCES, getDisplayTimestamp } from '../shared/types';
import type { CrawledArticle } from '../shared/types';
import { TikTokPostModal } from '../components/TikTokPostModal';
import {
  buildArticleTxtExport,
  buildFullArticleText,
  copyTextToClipboard,
  downloadAllArticleImages,
  downloadSingleImage,
  exportTextFile,
  formatDateTime,
  formatRelativeTime,
  getRawFileUrl,
  shareArticleContent,
} from '../lib/shareUtils';

interface Props {
  article: CrawledArticle;
  onBack: () => void;
  onDeleteArticle: (id: string) => Promise<void>;
  onNotify: (type: 'success' | 'info' | 'warning' | 'error', message: string) => void;
}

export const ArticleDetailScreen: React.FC<Props> = ({
  article,
  onBack,
  onDeleteArticle,
  onNotify,
}) => {
  const [fontScale, setFontScale] = useState(1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTikTokModal, setShowTikTokModal] = useState(false);
  const [copySectionModal, setCopySectionModal] = useState<{ label: string; text: string } | null>(null);
  const [imageActionIndex, setImageActionIndex] = useState<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const pressTimer = useRef<number | null>(null);

  const paragraphs = article.bodyText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const sourceName = NEWS_SOURCES[article.sourceId]?.displayName || article.sourceId;
  const displayTs = getDisplayTimestamp(article);
  const imageCount = article.localImagePaths.length;

  const startHold = (cb: () => void) => {
    pressTimer.current = window.setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(15);
      cb();
    }, 450);
  };

  const cancelHold = () => {
    if (pressTimer.current !== null) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const handleCopyFull = async () => {
    const ok = await copyTextToClipboard(buildFullArticleText(article));
    onNotify(ok ? 'success' : 'error', ok ? 'Đã sao chép toàn bộ nội dung bài viết' : 'Không thể sao chép');
  };

  const handleDownloadFirstImage = async () => {
    if (imageCount === 0) return;
    try {
      await downloadSingleImage(article.localImagePaths[0]);
      onNotify('success', 'Đã tải ảnh #1 về máy');
    } catch {
      onNotify('error', 'Không thể tải ảnh #1');
    }
  };

  const handleDownloadAllImages = async () => {
    if (imageCount === 0) return;
    setIsBusy(true);
    try {
      const saved = await downloadAllArticleImages(article);
      onNotify('success', `Đã tải hết ${saved}/${imageCount} ảnh về máy`);
    } catch {
      onNotify('error', 'Không thể tải toàn bộ ảnh');
    } finally {
      setIsBusy(false);
    }
  };

  const handleTikTokClick = () => {
    if (imageCount === 0) {
      onNotify('warning', 'Không đăng được lên TikTok do bài viết không có ảnh!');
      return;
    }
    void copyTextToClipboard(buildFullArticleText(article));
    setShowTikTokModal(true);
  };

  const handleShare = async () => {
    try {
      const res = await shareArticleContent(article);
      if (res === 'copied') {
        onNotify('success', 'Đã sao chép nội dung và liên kết bài viết');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      onNotify('error', 'Không thể chia sẻ bài viết');
    }
  };

  return (
    <div className="mx-auto max-w-3xl pb-12">
      {/* Sticky TopAppBar */}
      <div className="sticky top-0 z-20 -mx-4 mb-5 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur-md md:mx-0 md:rounded-2xl md:border dark:border-slate-800 dark:bg-slate-900/95">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Quay lại</span>
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFontScale((s) => Math.max(0.85, Number((s - 0.1).toFixed(2))))}
            aria-label="Giảm cỡ chữ"
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-11 text-center text-xs font-mono-data tabular-nums text-slate-500">
            {Math.round(fontScale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setFontScale((s) => Math.min(1.4, Number((s + 0.1).toFixed(2))))}
            aria-label="Tăng cỡ chữ"
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleShare}
            aria-label="Chia sẻ bài viết"
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            aria-label="Xóa bài viết"
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Article Header */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-red-700 dark:text-red-400">{sourceName}</span>
          <span aria-hidden="true">·</span>
          <span>{article.categorySlug}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            {article.publishedAt > 0 ? 'Đăng' : 'Tải'} {formatDateTime(displayTs)} ({formatRelativeTime(displayTs)})
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{article.wordCount} từ</span>
        </div>

        <h1
          onPointerDown={() => startHold(() => setCopySectionModal({ label: 'Tiêu đề', text: article.title }))}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onContextMenu={(e) => {
            e.preventDefault();
            setCopySectionModal({ label: 'Tiêu đề', text: article.title });
          }}
          className="cursor-text text-2xl font-bold leading-tight text-slate-900 sm:text-3xl dark:text-slate-50"
          style={{ textWrap: 'balance' }}
        >
          {article.title}
        </h1>
      </header>

      {/* Primary 3-Button Action Block */}
      <div className="mt-5 space-y-2.5">
        <div className={`grid gap-2.5 ${imageCount > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button
            type="button"
            onClick={handleCopyFull}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <Copy className="h-4 w-4" />
            <span>Copy nội dung</span>
          </button>

          {imageCount > 0 && (
            <button
              type="button"
              disabled={isBusy}
              onClick={handleDownloadAllImages}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <Download className="h-4 w-4" />
              <span>Tải ảnh ({imageCount})</span>
            </button>
          )}
        </div>

        <button
          type="button"
          disabled={isBusy}
          onClick={handleTikTokClick}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-800"
        >
          <Video className="h-4 w-4" />
          <span>Đăng bài lên TikTok</span>
        </button>
      </div>

      {/* Cover Image with Floating "Tải ảnh #1" */}
      {imageCount > 0 && (
        <div className="relative mt-6 overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800">
          <img
            src={getRawFileUrl(article.localImagePaths[0])}
            alt={article.title}
            referrerPolicy="no-referrer"
            onClick={() => setLightboxIndex(0)}
            onPointerDown={() => startHold(() => setImageActionIndex(0))}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onContextMenu={(e) => {
              e.preventDefault();
              setImageActionIndex(0);
            }}
            className="max-h-[460px] w-full cursor-pointer object-cover"
          />
          <button
            type="button"
            onClick={handleDownloadFirstImage}
            className="absolute right-3 bottom-3 inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-black/75 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm hover:bg-black/90"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Tải ảnh #1</span>
          </button>
        </div>
      )}

      {/* Editorial Body */}
      <div
        className="font-serif-editorial mt-6 space-y-5 text-slate-800 dark:text-slate-200"
        style={{ fontSize: `${fontScale}rem`, lineHeight: 1.75 }}
      >
        {article.sapo && (
          <p
            onPointerDown={() => startHold(() => setCopySectionModal({ label: 'Tóm tắt (Sapo)', text: article.sapo }))}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onContextMenu={(e) => {
              e.preventDefault();
              setCopySectionModal({ label: 'Tóm tắt (Sapo)', text: article.sapo });
            }}
            className="cursor-text font-bold text-slate-900 dark:text-slate-100"
          >
            {article.sapo}
          </p>
        )}

        {paragraphs.map((para, idx) => (
          <p
            key={idx}
            onPointerDown={() => startHold(() => setCopySectionModal({ label: `Đoạn ${idx + 1}`, text: para }))}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onContextMenu={(e) => {
              e.preventDefault();
              setCopySectionModal({ label: `Đoạn ${idx + 1}`, text: para });
            }}
            className="cursor-text"
          >
            {para}
          </p>
        ))}
      </div>

      {/* Image Gallery */}
      {imageCount > 0 && (
        <section className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <ImageIcon className="h-4 w-4 text-slate-500" />
              <span>Hình ảnh trong bài ({imageCount})</span>
            </h2>
            <button
              type="button"
              disabled={isBusy}
              onClick={handleDownloadAllImages}
              className="text-xs font-semibold text-red-700 hover:underline dark:text-red-400"
            >
              Tải tất cả
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {article.localImagePaths.map((relPath, idx) => (
              <div
                key={relPath}
                className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
              >
                <img
                  src={getRawFileUrl(relPath)}
                  alt={`Ảnh ${idx + 1}`}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  onClick={() => setLightboxIndex(idx)}
                  onPointerDown={() => startHold(() => setImageActionIndex(idx))}
                  onPointerUp={cancelHold}
                  onPointerLeave={cancelHold}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setImageActionIndex(idx);
                  }}
                  className="h-full w-full cursor-pointer object-cover"
                />
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await downloadSingleImage(relPath);
                      onNotify('success', `Đã tải ảnh #${idx + 1}`);
                    } catch {
                      onNotify('error', 'Không thể tải ảnh');
                    }
                  }}
                  aria-label={`Tải ảnh ${idx + 1}`}
                  className="absolute right-2 bottom-2 flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg bg-black/70 text-white hover:bg-black/90"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bottom Utility Actions */}
      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
        <button
          type="button"
          onClick={handleCopyFull}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <Copy className="h-4 w-4" />
          <span>Copy hết</span>
        </button>

        <button
          type="button"
          onClick={() => {
            exportTextFile(`${article.articleTag}.txt`, buildArticleTxtExport(article));
            onNotify('success', `Đã xuất tệp ${article.articleTag}.txt`);
          }}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <FileText className="h-4 w-4" />
          <span>Lưu .txt</span>
        </button>

        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <ExternalLink className="h-4 w-4" />
          <span>Mở bài gốc</span>
        </a>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-slate-900 dark:border dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Xác nhận xóa bài viết
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Xóa bài viết này khỏi kho lưu trữ và dọn sạch tệp .txt cùng ảnh trong result/?
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="min-h-[44px] flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowDeleteConfirm(false);
                  await onDeleteArticle(article.id);
                  onBack();
                }}
                className="min-h-[44px] flex-1 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TikTok Post Studio Modal */}
      {showTikTokModal && (
        <TikTokPostModal
          article={article}
          onClose={() => setShowTikTokModal(false)}
          onNotify={onNotify}
        />
      )}

      {/* Long-Press Text Copy Options Modal */}
      {copySectionModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setCopySectionModal(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-slate-900 dark:border dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden dark:bg-slate-700" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Tùy chọn sao chép
            </h3>
            <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
              {copySectionModal.label}: {copySectionModal.text}
            </p>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={async () => {
                  await copyTextToClipboard(buildFullArticleText(article));
                  setCopySectionModal(null);
                  onNotify('success', 'Đã copy hết nội dung bài viết');
                }}
                className="min-h-[44px] w-full rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800"
              >
                Copy hết nội dung bài viết
              </button>
              <button
                type="button"
                onClick={async () => {
                  await copyTextToClipboard(copySectionModal.text);
                  setCopySectionModal(null);
                  onNotify('success', `Đã copy ${copySectionModal.label.toLowerCase()}`);
                }}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                Chỉ copy phần này ({copySectionModal.label})
              </button>
              <button
                type="button"
                onClick={async () => {
                  await copyTextToClipboard(buildArticleTxtExport(article));
                  setCopySectionModal(null);
                  onNotify('success', 'Đã copy toàn bộ nội dung kèm [IMAGE_URLS]');
                }}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Copy hết kèm URL ảnh (.txt)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Long-Press Image Context Modal */}
      {imageActionIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setImageActionIndex(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-slate-900 dark:border dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Tùy chọn hình ảnh #{imageActionIndex + 1}
            </h3>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={async () => {
                  const idx = imageActionIndex;
                  setImageActionIndex(null);
                  try {
                    await downloadSingleImage(article.localImagePaths[idx]);
                    onNotify('success', `Đã tải ảnh #${idx + 1}`);
                  } catch {
                    onNotify('error', 'Không thể tải ảnh');
                  }
                }}
                className="min-h-[44px] w-full rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800"
              >
                Tải ảnh về máy
              </button>
              <button
                type="button"
                onClick={() => {
                  const idx = imageActionIndex;
                  setImageActionIndex(null);
                  setLightboxIndex(idx);
                }}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:text-slate-100"
              >
                Xem ảnh phóng to
              </button>
              {article.imageUrls[imageActionIndex] && (
                <button
                  type="button"
                  onClick={async () => {
                    const url = article.imageUrls[imageActionIndex];
                    setImageActionIndex(null);
                    await copyTextToClipboard(url);
                    onNotify('success', 'Đã sao chép URL ảnh gốc');
                  }}
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  Sao chép URL ảnh
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-black/95 p-4 text-white"
          onClick={() => setLightboxIndex(null)}
        >
          <div className="flex w-full max-w-4xl items-center justify-between pt-safe" onClick={(e) => e.stopPropagation()}>
            <span className="text-sm font-mono-data tabular-nums">
              {lightboxIndex + 1} / {imageCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await downloadSingleImage(article.localImagePaths[lightboxIndex]);
                    onNotify('success', `Đã tải ảnh #${lightboxIndex + 1}`);
                  } catch {
                    onNotify('error', 'Không thể tải ảnh');
                  }
                }}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25"
              >
                <Download className="h-4 w-4" />
                <span>Tải ảnh</span>
              </button>
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                aria-label="Đóng trình xem ảnh"
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl bg-white/15 hover:bg-white/25"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="relative flex w-full max-w-5xl flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {imageCount > 1 && (
              <button
                type="button"
                onClick={() => setLightboxIndex((lightboxIndex - 1 + imageCount) % imageCount)}
                aria-label="Ảnh trước"
                className="absolute left-2 z-10 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/60 hover:bg-black/80"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}
            <img
              src={getRawFileUrl(article.localImagePaths[lightboxIndex])}
              alt={`Ảnh ${lightboxIndex + 1}`}
              referrerPolicy="no-referrer"
              className="max-h-[80vh] max-w-full rounded-lg object-contain"
            />
            {imageCount > 1 && (
              <button
                type="button"
                onClick={() => setLightboxIndex((lightboxIndex + 1) % imageCount)}
                aria-label="Ảnh tiếp theo"
                className="absolute right-2 z-10 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/60 hover:bg-black/80"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>
          <div className="pb-safe text-xs text-white/60">Chạm ra ngoài để đóng</div>
        </div>
      )}
    </div>
  );
};
