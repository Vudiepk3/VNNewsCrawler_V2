import JSZip from 'jszip';
import { NEWS_SOURCES } from '../shared/types';
import type { CrawledArticle } from '../shared/types';

let activeApiBaseUrl = '';

export function setApiBaseUrl(url: string): void {
  activeApiBaseUrl = url.trim().replace(/\/+$/, '');
}

export function getApiBaseUrl(): string {
  return activeApiBaseUrl;
}

export function apiUrl(path: string): string {
  return activeApiBaseUrl ? `${activeApiBaseUrl}${path}` : path;
}

export function getRawFileUrl(relativePath: string, download = false): string {
  if (/^(https?:|data:|blob:)/i.test(relativePath)) {
    return relativePath;
  }
  const params = new URLSearchParams({ path: relativePath });
  if (download) params.set('download', '1');
  return apiUrl(`/api/files/raw?${params.toString()}`);
}

export function formatDateTime(ts: number): string {
  if (!ts) return 'Không rõ';
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export function formatRelativeTime(ts: number): string {
  if (!ts) return '';
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'vừa xong';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} ngày trước`;
  return formatDateTime(ts);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function buildFullArticleText(article: CrawledArticle): string {
  return [article.title, article.sapo, article.bodyText].filter(Boolean).join('\n\n');
}

export function buildArticleTxtExport(article: CrawledArticle): string {
  const main = [article.title, article.sapo, article.bodyText].filter(Boolean).join('\n');
  if (article.imageUrls.length > 0) {
    return `${main}\n\n[IMAGE_URLS]\n${article.imageUrls.join('\n')}\n`;
  }
  return `${main}\n`;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function exportTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  triggerBlobDownload(blob, filename);
}

export async function downloadSingleImage(relativePath: string, customName?: string): Promise<void> {
  const res = await fetch(getRawFileUrl(relativePath));
  if (!res.ok) throw new Error('Không thể tải tệp ảnh');
  const blob = await res.blob();
  const baseName = customName || relativePath.split('/').pop() || 'image.jpg';
  triggerBlobDownload(blob, baseName);
}

export async function downloadAllArticleImages(article: CrawledArticle): Promise<number> {
  const paths = article.localImagePaths;
  if (paths.length === 0) return 0;

  if (paths.length === 1) {
    const ext = paths[0].split('.').pop() || 'jpg';
    await downloadSingleImage(paths[0], `${article.articleTag}_01.${ext}`);
    return 1;
  }

  const zip = new JSZip();
  let added = 0;
  for (let i = 0; i < paths.length; i++) {
    const res = await fetch(getRawFileUrl(paths[i]));
    if (!res.ok) continue;
    const blob = await res.blob();
    const fileName = paths[i].split('/').pop() || `img_${String(i + 1).padStart(2, '0')}.jpg`;
    zip.file(fileName, blob);
    added++;
  }
  if (added === 0) throw new Error('Không thể tải ảnh từ bộ nhớ');
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerBlobDownload(zipBlob, `${article.articleTag}_images.zip`);
  return added;
}

export async function shareArticleContent(article: CrawledArticle): Promise<'shared' | 'copied'> {
  const fullText = buildFullArticleText(article);
  const sourceName = NEWS_SOURCES[article.sourceId].displayName;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: article.title,
        text: `${article.title}\n\n${article.sapo || ''}\n(${sourceName})`,
        url: article.url,
      });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
    }
  }
  await copyTextToClipboard(`${fullText}\n\nNguồn: ${article.url}`);
  return 'copied';
}

export interface TikTokPreparedImage {
  file: File;
  previewUrl: string;
  sourcePath: string;
}

export function buildTikTokCaption(article: CrawledArticle, compact = true): string {
  const sourceName = NEWS_SOURCES[article.sourceId]?.displayName || 'TinTuc';
  const sourceTag = sourceName.replace(/\s+/g, '');
  const full = buildFullArticleText(article);
  if (!compact) {
    return `${full}\n\n#${sourceTag} #tintuc #tinmoi #VNNewsCrawler`;
  }

  const base = [article.title, article.sapo].filter(Boolean).join('\n\n');
  const firstPara = article.bodyText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .find(Boolean);
  let text = firstPara && base.length < 700 ? `${base}\n\n${firstPara}` : base;
  if (text.length > 1800) {
    text = `${text.slice(0, 1797).trim()}...`;
  }
  return `${text}\n\nNguồn: ${sourceName}\n#${sourceTag} #tintuc #tinmoi`;
}

async function convertBlobToJpegFile(blob: Blob, fileName: string): Promise<File> {
  if (typeof document === 'undefined') {
    return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = objectUrl;
    });

    const maxDim = 1920;
    let width = img.naturalWidth || img.width || 1080;
    let height = img.naturalHeight || img.height || 1080;
    if (width > maxDim || height > maxDim) {
      const scale = Math.min(maxDim / width, maxDim / height);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const jpegBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
    );
    if (!jpegBlob) {
      return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
    }
    return new File([jpegBlob], fileName, { type: 'image/jpeg' });
  } catch {
    return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function prepareTikTokImages(
  article: CrawledArticle,
  mode: 'first' | 'all',
): Promise<TikTokPreparedImage[]> {
  const paths = article.localImagePaths;
  if (paths.length === 0) {
    throw new Error('Không đăng được lên TikTok do bài viết không có ảnh!');
  }

  const selected = mode === 'first' ? [paths[0]] : paths.slice(0, 10);
  const prepared: TikTokPreparedImage[] = [];

  for (let i = 0; i < selected.length; i++) {
    const rel = selected[i];
    const url = getRawFileUrl(rel);
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new Error(
        /^https?:\/\//i.test(rel)
          ? `Ảnh #${i + 1} bị trình duyệt chặn CORS khi tải trực tiếp từ báo. Hãy kết nối máy chủ Node.js hoặc nhấn giữ ảnh để lưu thủ công.`
          : `Không thể kết nối tải ảnh #${i + 1} để chuẩn bị đăng TikTok`,
      );
    }
    if (!res.ok) {
      throw new Error(`Không thể tải ảnh #${i + 1} để chuẩn bị đăng TikTok`);
    }
    const rawBlob = await res.blob();
    const outName = `${article.articleTag.slice(0, 40)}_tiktok_${String(i + 1).padStart(2, '0')}.jpg`;
    const file = await convertBlobToJpegFile(rawBlob, outName);
    const previewUrl = URL.createObjectURL(file);
    prepared.push({ file, previewUrl, sourcePath: rel });
  }

  return prepared;
}

export function canUseNativeFileShare(files: File[]): boolean {
  if (files.length === 0 || typeof navigator === 'undefined') return false;
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files });
  } catch {
    return false;
  }
}

export async function downloadImagesIndividually(images: TikTokPreparedImage[]): Promise<number> {
  for (let i = 0; i < images.length; i++) {
    triggerBlobDownload(images[i].file, images[i].file.name);
    if (i < images.length - 1) {
      await new Promise((r) => setTimeout(r, 280));
    }
  }
  return images.length;
}

function pickSupportedVideoMimeType(): { mimeType: string; ext: 'mp4' | 'webm' } | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return null;
  }
  const candidates: Array<{ mimeType: string; ext: 'mp4' | 'webm' }> = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4' },
    { mimeType: 'video/mp4', ext: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9', ext: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', ext: 'webm' },
    { mimeType: 'video/webm', ext: 'webm' },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return null;
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\.*$/, '')}...`;
  }
  return lines;
}

export async function createTikTokSlideshowVideo(
  article: CrawledArticle,
  images: TikTokPreparedImage[],
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  if (images.length === 0) {
    throw new Error('Không có ảnh để tạo video TikTok');
  }
  const format = pickSupportedVideoMimeType();
  if (!format) {
    throw new Error('Trình duyệt hiện tại không hỗ trợ xuất video trực tiếp (MediaRecorder)');
  }

  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.captureStream !== 'function') {
    throw new Error('Trình duyệt không hỗ trợ ghi hình từ canvas');
  }

  const slideImages = images.slice(0, 6);
  const loadedImgs = await Promise.all(
    slideImages.map(
      (item) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Không thể đọc ảnh cho video'));
          img.src = item.previewUrl;
        }),
    ),
  );

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType: format.mimeType,
    videoBitsPerSecond: 3_500_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  const stopPromise = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: format.mimeType }));
    };
    recorder.onerror = () => reject(new Error('Lỗi khi tạo tệp video TikTok'));
  });

  const sourceLabel = NEWS_SOURCES[article.sourceId]?.displayName || 'Tin Tức';
  const perSlideMs = slideImages.length === 1 ? 3500 : 2200;
  const totalMs = loadedImgs.length * perSlideMs;

  const drawFrame = (elapsedMs: number) => {
    const slideIdx = Math.min(loadedImgs.length - 1, Math.floor(elapsedMs / perSlideMs));
    const slideProgress = Math.min(1, (elapsedMs - slideIdx * perSlideMs) / perSlideMs);
    const img = loadedImgs[slideIdx];

    // Dark editorial backdrop
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 1280);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(1, '#020617');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 720, 1280);

    // Draw blurred ambient background copy of current image
    ctx.save();
    ctx.globalAlpha = 0.22;
    const bgScale = Math.max(720 / img.width, 1280 / img.height);
    const bgW = img.width * bgScale;
    const bgH = img.height * bgScale;
    ctx.drawImage(img, (720 - bgW) / 2, (1280 - bgH) / 2, bgW, bgH);
    ctx.restore();

    // Foreground sharp image with subtle Ken-Burns zoom
    const boxX = 36;
    const boxY = 170;
    const boxW = 648;
    const boxH = 660;
    const zoom = 1 + slideProgress * 0.05;
    const fitScale = Math.min(boxW / img.width, boxH / img.height);
    const drawW = img.width * fitScale * zoom;
    const drawH = img.height * fitScale * zoom;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 24);
    ctx.clip();
    ctx.fillStyle = '#111827';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.drawImage(
      img,
      boxX + (boxW - drawW) / 2,
      boxY + (boxH - drawH) / 2,
      drawW,
      drawH,
    );
    ctx.restore();

    // Top source pill
    ctx.fillStyle = '#b91c1c';
    ctx.beginPath();
    ctx.roundRect(36, 92, 190, 44, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(sourceLabel, 54, 121);

    // Slide counter
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '600 20px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${slideIdx + 1}/${loadedImgs.length}`, 684, 121);
    ctx.textAlign = 'left';

    // Bottom headline overlay card
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(36, 862, 648, 300, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 34px sans-serif';
    const titleLines = wrapCanvasText(ctx, article.title, 588, 4);
    titleLines.forEach((line, idx) => {
      ctx.fillText(line, 66, 924 + idx * 46);
    });

    ctx.fillStyle = '#fca5a5';
    ctx.font = '600 21px sans-serif';
    ctx.fillText('Xem toàn bộ nội dung ở phần mô tả', 66, 1126);
  };

  recorder.start(250);
  const startTs = performance.now();

  await new Promise<void>((resolve, reject) => {
    const step = () => {
      if (signal?.aborted) {
        if (recorder.state !== 'inactive') recorder.stop();
        reject(new Error('Đã hủy tạo video'));
        return;
      }
      const elapsed = performance.now() - startTs;
      drawFrame(Math.min(elapsed, totalMs));
      onProgress?.(Math.min(99, Math.round((elapsed / totalMs) * 100)));

      if (elapsed >= totalMs) {
        if (recorder.state !== 'inactive') recorder.stop();
        onProgress?.(100);
        resolve();
        return;
      }
      window.setTimeout(step, 33);
    };
    step();
  });

  const blob = await stopPromise;
  const filename = `${article.articleTag.slice(0, 50)}_tiktok.${format.ext}`;
  return { blob, filename, mimeType: format.mimeType };
}

export async function executeTikTokPost(
  article: CrawledArticle,
  mode: 'first' | 'all',
): Promise<{ status: 'shared_native' | 'downloaded_and_copied'; imageCount: number }> {
  const fullText = buildFullArticleText(article);
  await copyTextToClipboard(fullText);

  const prepared = await prepareTikTokImages(article, mode);
  const files = prepared.map((p) => p.file);

  try {
    if (canUseNativeFileShare(files)) {
      try {
        await navigator.share({ files });
        return { status: 'shared_native', imageCount: files.length };
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error('Đã hủy chia sẻ sang TikTok');
        }
      }
    }

    await downloadImagesIndividually(prepared);
    return { status: 'downloaded_and_copied', imageCount: files.length };
  } finally {
    prepared.forEach((p) => URL.revokeObjectURL(p.previewUrl));
  }
}
