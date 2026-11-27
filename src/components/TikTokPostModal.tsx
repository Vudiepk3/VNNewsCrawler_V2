import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Loader2,
  Share2,
  Video,
  X,
} from 'lucide-react';
import type { CrawledArticle } from '../shared/types';
import {
  buildTikTokCaption,
  canUseNativeFileShare,
  copyTextToClipboard,
  createTikTokSlideshowVideo,
  downloadImagesIndividually,
  prepareTikTokImages,
  triggerBlobDownload,
} from '../lib/shareUtils';
import type { TikTokPreparedImage } from '../lib/shareUtils';

interface Props {
  article: CrawledArticle;
  onClose: () => void;
  onNotify: (type: 'success' | 'info' | 'warning' | 'error', message: string) => void;
}

export const TikTokPostModal: React.FC<Props> = ({ article, onClose, onNotify }) => {
  const totalImages = article.localImagePaths.length;
  const [mode, setMode] = useState<'first' | 'all'>(totalImages > 1 ? 'all' : 'first');
  const [compactCaption, setCompactCaption] = useState(true);
  const [caption, setCaption] = useState(() => buildTikTokCaption(article, true));
  const [copiedCaption, setCopiedCaption] = useState(false);

  const [preparedImages, setPreparedImages] = useState<TikTokPreparedImage[]>([]);
  const [isPreparing, setIsPreparing] = useState(true);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [shareBlockedReason, setShareBlockedReason] = useState<string | null>(null);

  const [isDownloadingImages, setIsDownloadingImages] = useState(false);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const videoAbortRef = useRef<AbortController | null>(null);

  const isMobile = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }, []);

  const tiktokUploadUrl = isMobile
    ? 'https://www.tiktok.com/upload'
    : 'https://www.tiktok.com/tiktokstudio/upload?from=webapp';

  // Switch caption preset when user toggles compact/full
  const handleToggleCaptionMode = (compact: boolean) => {
    setCompactCaption(compact);
    setCaption(buildTikTokCaption(article, compact));
  };

  // Pre-fetch & normalize images to JPEG whenever mode changes
  useEffect(() => {
    let cancelled = false;
    let localItems: TikTokPreparedImage[] = [];

    setIsPreparing(true);
    setPrepError(null);
    setShareBlockedReason(null);

    prepareTikTokImages(article, mode)
      .then((items) => {
        if (cancelled) {
          items.forEach((p) => URL.revokeObjectURL(p.previewUrl));
          return;
        }
        localItems = items;
        setPreparedImages((prev) => {
          prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
          return items;
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPrepError(err instanceof Error ? err.message : 'Không thể chuẩn bị ảnh cho TikTok');
      })
      .finally(() => {
        if (!cancelled) setIsPreparing(false);
      });

    return () => {
      cancelled = true;
      localItems.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, [article, mode]);

  // Abort video encoding on close
  useEffect(() => {
    return () => {
      videoAbortRef.current?.abort();
    };
  }, []);

  const canShareFiles = useMemo(
    () => canUseNativeFileShare(preparedImages.map((p) => p.file)),
    [preparedImages],
  );

  const handleCopyCaption = async () => {
    const ok = await copyTextToClipboard(caption);
    if (ok) {
      setCopiedCaption(true);
      onNotify('success', 'Đã sao chép caption vào bộ nhớ tạm');
      window.setTimeout(() => setCopiedCaption(false), 1800);
    } else {
      onNotify('error', 'Không thể sao chép caption');
    }
  };

  // CRITICAL: Zero awaits before navigator.share() to preserve iOS/Android user activation!
  const handleNativeShare = () => {
    if (preparedImages.length === 0) return;
    const files = preparedImages.map((p) => p.file);

    void copyTextToClipboard(caption);

    try {
      navigator
        .share({ files })
        .then(() => {
          onNotify(
            'success',
            `Đã mở bảng chia sẻ ${files.length} ảnh sang TikTok (caption đã sao chép sẵn để dán)`,
          );
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') {
            onNotify('info', 'Đã hủy chia sẻ sang TikTok');
            return;
          }
          setShareBlockedReason(
            'Trình duyệt hoặc khung xem trước hiện tại không cho phép mở bảng chia sẻ tệp trực tiếp. Hãy dùng nút "Tải video TikTok 9:16" hoặc "Tải ảnh (.jpg)" bên dưới rồi bấm "Mở TikTok".',
          );
        });
    } catch {
      setShareBlockedReason(
        'Thiết bị không hỗ trợ chia sẻ tệp trực tiếp từ trình duyệt này. Hãy tải video hoặc ảnh (.jpg) rồi mở TikTok để đăng.',
      );
    }
  };

  const handleDownloadJpgs = async () => {
    if (preparedImages.length === 0) return;
    setIsDownloadingImages(true);
    try {
      await copyTextToClipboard(caption);
      const count = await downloadImagesIndividually(preparedImages);
      onNotify(
        'success',
        `Đã tải ${count} ảnh (.jpg) và sao chép caption. Mở TikTok và chọn ảnh vừa tải để đăng!`,
      );
    } catch {
      onNotify('error', 'Không thể tải tệp ảnh');
    } finally {
      setIsDownloadingImages(false);
    }
  };

  const handleCreateVideo = async () => {
    if (preparedImages.length === 0) return;
    const ac = new AbortController();
    videoAbortRef.current = ac;
    setVideoProgress(1);
    await copyTextToClipboard(caption);

    try {
      const { blob, filename } = await createTikTokSlideshowVideo(
        article,
        preparedImages,
        (pct) => setVideoProgress(pct),
        ac.signal,
      );
      triggerBlobDownload(blob, filename);
      onNotify(
        'success',
        'Đã tạo & tải video TikTok 9:16 kèm sao chép caption! Bấm "Mở TikTok" để tải video lên.',
      );
    } catch (err) {
      if (err instanceof Error && err.message === 'Đã hủy tạo video') return;
      onNotify('error', err instanceof Error ? err.message : 'Không thể tạo video slideshow');
    } finally {
      videoAbortRef.current = null;
      setVideoProgress(null);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tiktok-modal-title"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6 dark:border dark:border-slate-800 dark:bg-slate-900"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden dark:bg-slate-700" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-red-700">
              <Video className="h-4 w-4" />
            </div>
            <div>
              <h3 id="tiktok-modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Đăng bài lên TikTok
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chuẩn hóa ảnh JPG, tạo video 9:16 & sao chép caption
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode selector when > 1 image */}
        {totalImages > 1 && (
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setMode('first')}
              className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === 'first'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Chỉ ảnh bìa (#1)
            </button>
            <button
              type="button"
              onClick={() => setMode('all')}
              className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === 'all'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Tất cả ({Math.min(totalImages, 10)} ảnh)
            </button>
          </div>
        )}

        {/* Prepared Media Preview Strip */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
          {isPreparing ? (
            <div className="flex items-center gap-2 py-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin text-red-700 dark:text-red-400" />
              <span>Đang chuyển đổi ảnh sang định dạng JPG chuẩn TikTok...</span>
            </div>
          ) : prepError ? (
            <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{prepError}</span>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <ImageIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  Đã sẵn sàng {preparedImages.length} ảnh (.jpg)
                </span>
                {totalImages > 10 && mode === 'all' && (
                  <span className="text-[11px] text-slate-500">Tối đa 10 ảnh</span>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {preparedImages.map((img, idx) => (
                  <img
                    key={img.sourcePath + idx}
                    src={img.previewUrl}
                    alt={`TikTok ${idx + 1}`}
                    className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Editable Caption Box */}
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Caption đăng TikTok (tự copy khi bấm đăng)
            </span>
            <div className="flex items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => handleToggleCaptionMode(true)}
                className={`rounded-md px-2 py-1 font-medium ${
                  compactCaption
                    ? 'bg-red-700 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Ngắn gọn
              </button>
              <button
                type="button"
                onClick={() => handleToggleCaptionMode(false)}
                className={`rounded-md px-2 py-1 font-medium ${
                  !compactCaption
                    ? 'bg-red-700 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Đầy đủ
              </button>
            </div>
          </div>

          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs leading-relaxed text-slate-800 focus:border-red-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span className="tabular-nums">{caption.length} ký tự</span>
            <button
              type="button"
              onClick={handleCopyCaption}
              className="inline-flex items-center gap-1 font-semibold text-red-700 hover:underline dark:text-red-400"
            >
              {copiedCaption ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedCaption ? 'Đã sao chép' : 'Sao chép caption'}</span>
            </button>
          </div>
        </div>

        {/* Helpful feedback if native share is blocked by iframe / desktop browser */}
        {shareBlockedReason && (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
            {shareBlockedReason}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-5 space-y-2.5">
          {canShareFiles && (
            <button
              type="button"
              disabled={isPreparing || preparedImages.length === 0}
              onClick={handleNativeShare}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-800"
            >
              <Share2 className="h-4 w-4" />
              <span>Chia sẻ thẳng sang TikTok ({preparedImages.length} ảnh)</span>
            </button>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={isPreparing || preparedImages.length === 0 || videoProgress !== null}
              onClick={handleCreateVideo}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {videoProgress !== null ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-red-700 dark:text-red-400" />
                  <span>Đang tạo video {videoProgress}%</span>
                </>
              ) : (
                <>
                  <Film className="h-4 w-4 text-red-700 dark:text-red-400" />
                  <span>Tải Video TikTok 9:16</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isPreparing || preparedImages.length === 0 || isDownloadingImages}
              onClick={handleDownloadJpgs}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <Download className="h-4 w-4" />
              <span>
                {isDownloadingImages
                  ? 'Đang tải ảnh...'
                  : `Tải ${preparedImages.length} ảnh (.jpg)`}
              </span>
            </button>
          </div>

          <a
            href={tiktokUploadUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              void copyTextToClipboard(caption);
              onNotify('info', 'Đã sao chép caption. Đang mở trang tải lên TikTok...');
            }}
            className={`flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
              canShareFiles
                ? 'border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-red-700 dark:hover:bg-red-800'
            }`}
          >
            <ExternalLink className="h-4 w-4" />
            <span>{isMobile ? 'Mở TikTok để đăng bài' : 'Mở TikTok Studio (Web)'}</span>
          </a>

          <p className="text-center text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Mẹo: Trên máy tính (TikTok Web) chỉ hỗ trợ tải <strong>Video</strong> — hãy dùng nút{' '}
            <strong>Tải Video TikTok 9:16</strong>. Trên điện thoại có thể dùng <strong>Chia sẻ thẳng</strong> hoặc <strong>Tải ảnh (.jpg)</strong>.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
};
