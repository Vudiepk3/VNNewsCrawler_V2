import JSZip from 'jszip';
import { NEWS_SOURCES } from '../shared/types';
import type { CrawledArticle } from '../shared/types';

export function getRawFileUrl(relativePath: string, download = false): string {
  if (/^(https?:|data:|blob:)/i.test(relativePath)) {
    return relativePath;
  }
  const params = new URLSearchParams({ path: relativePath });
  if (download) params.set('download', '1');
  return `/api/files/raw?${params.toString()}`;
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

export async function executeTikTokPost(
  article: CrawledArticle,
  mode: 'first' | 'all',
): Promise<{ status: 'shared_native' | 'downloaded_and_copied'; imageCount: number }> {
  const paths = article.localImagePaths;
  if (paths.length === 0) {
    throw new Error('Không đăng được lên TikTok do bài viết không có ảnh!');
  }

  const selectedPaths = mode === 'first' ? [paths[0]] : paths;
  const fullText = buildFullArticleText(article);
  await copyTextToClipboard(fullText);

  const imageFiles: File[] = [];
  for (let i = 0; i < selectedPaths.length; i++) {
    const rel = selectedPaths[i];
    const res = await fetch(getRawFileUrl(rel));
    if (!res.ok) {
      throw new Error('Không thể chuẩn bị tệp ảnh để đăng lên TikTok');
    }
    const blob = await res.blob();
    const fileName = rel.split('/').pop() || `tiktok_${i + 1}.jpg`;
    const mimeType = blob.type || 'image/jpeg';
    imageFiles.push(new File([blob], fileName, { type: mimeType }));
  }

  // On Android & iOS Safari/Chrome, navigator.share with files opens the native OS share sheet with TikTok
  if (
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: imageFiles })
  ) {
    try {
      await navigator.share({
        title: article.title,
        text: fullText,
        files: imageFiles,
      });
      return { status: 'shared_native', imageCount: imageFiles.length };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Đã hủy chia sẻ sang TikTok');
      }
      // Fall through to download fallback
    }
  }

  // Desktop / Web fallback: save image(s) + text already copied to clipboard
  if (selectedPaths.length === 1) {
    await downloadSingleImage(selectedPaths[0]);
  } else {
    await downloadAllArticleImages(article);
  }
  return { status: 'downloaded_and_copied', imageCount: imageFiles.length };
}
