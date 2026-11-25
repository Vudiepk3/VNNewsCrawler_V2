import React, { useMemo, useState } from 'react';
import {
  Copy,
  Download,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  RefreshCw,
  X,
} from 'lucide-react';
import type { ResultFileItem } from '../shared/types';
import {
  copyTextToClipboard,
  downloadSingleImage,
  exportTextFile,
  formatDateTime,
  formatFileSize,
  getRawFileUrl,
} from '../lib/shareUtils';

interface Props {
  files: ResultFileItem[];
  onRefresh: () => void;
  onNotify: (type: 'success' | 'info' | 'warning' | 'error', message: string) => void;
}

export const FilesScreen: React.FC<Props> = ({ files, onRefresh, onNotify }) => {
  const [previewText, setPreviewText] = useState<{ name: string; content: string } | null>(null);
  const [previewImage, setPreviewImage] = useState<ResultFileItem | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, ResultFileItem[]>();
    for (const f of files) {
      const list = map.get(f.directory) || [];
      list.push(f);
      map.set(f.directory, list);
    }
    return Array.from(map.entries());
  }, [files]);

  const handleOpenFile = async (file: ResultFileItem) => {
    if (file.isImage) {
      setPreviewImage(file);
      return;
    }
    if (file.isText) {
      try {
        const res = await fetch(`/api/files/content?path=${encodeURIComponent(file.relativePath)}`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { content: string };
        setPreviewText({ name: file.name, content: data.content });
      } catch {
        onNotify('error', 'Không thể đọc nội dung tệp');
      }
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Thư mục result/
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {files.length} tệp được phân cấp theo Nguồn báo / Tag bài viết
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Làm mới</span>
        </button>
      </div>

      {grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center dark:border-slate-800 dark:bg-slate-900">
          <FolderOpen className="h-10 w-10 text-slate-400" />
          <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
            Chưa có tệp trong result/
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Khi thu thập bài viết, tệp .txt và hình ảnh sẽ xuất hiện tại đây.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([dirName, items]) => (
            <section
              key={dirName}
              className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
                <h2 className="truncate text-xs font-semibold font-mono-data text-slate-800 dark:text-slate-200">
                  {dirName}
                </h2>
                <span className="shrink-0 text-xs font-mono-data tabular-nums text-slate-500">
                  {items.length} tệp
                </span>
              </div>

              <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((file) => (
                  <div
                    key={file.relativePath}
                    onClick={() => handleOpenFile(file)}
                    className="flex min-h-[54px] cursor-pointer items-center justify-between gap-3 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {file.isImage ? (
                        <img
                          src={getRawFileUrl(file.relativePath)}
                          alt={file.name}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {file.isText ? <FileText className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {file.name}
                        </div>
                        <div className="text-xs font-mono-data tabular-nums text-slate-500 dark:text-slate-400">
                          {formatFileSize(file.sizeBytes)} · {formatDateTime(file.modifiedAt)}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          if (file.isImage) {
                            await downloadSingleImage(file.relativePath, file.name);
                            onNotify('success', `Đã tải ${file.name}`);
                          } else {
                            const res = await fetch(`/api/files/content?path=${encodeURIComponent(file.relativePath)}`);
                            const data = (await res.json()) as { content: string };
                            exportTextFile(file.name, data.content);
                            onNotify('success', `Đã xuất ${file.name}`);
                          }
                        } catch {
                          onNotify('error', 'Không thể tải tệp');
                        }
                      }}
                      aria-label={`Tải ${file.name}`}
                      className="flex min-h-[38px] min-w-[38px] shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Text Preview Modal */}
      {previewText && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setPreviewText(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-t-3xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-slate-900 dark:border dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="truncate text-base font-semibold font-mono-data text-slate-900 dark:text-slate-100">
                {previewText.name}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewText(null)}
                className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <pre className="mt-4 flex-1 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-xs font-mono-data leading-relaxed text-slate-800 dark:bg-slate-950 dark:text-slate-200">
              {previewText.content}
            </pre>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={async () => {
                  await copyTextToClipboard(previewText.content);
                  onNotify('success', 'Đã sao chép nội dung tệp');
                }}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
              >
                <Copy className="h-4 w-4" />
                <span>Sao chép toàn bộ</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  exportTextFile(previewText.name, previewText.content);
                  onNotify('success', `Đã xuất ${previewText.name}`);
                }}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:text-slate-100"
              >
                <Download className="h-4 w-4" />
                <span>Tải xuống</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4 text-white"
          onClick={() => setPreviewImage(null)}
        >
          <div className="mb-3 flex w-full max-w-3xl items-center justify-between" onClick={(e) => e.stopPropagation()}>
            <span className="truncate text-sm font-mono-data">{previewImage.name}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  await downloadSingleImage(previewImage.relativePath, previewImage.name);
                  onNotify('success', `Đã tải ${previewImage.name}`);
                }}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25"
              >
                <Download className="h-4 w-4" />
                <span>Tải ảnh</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl bg-white/15 hover:bg-white/25"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <img
            src={getRawFileUrl(previewImage.relativePath)}
            alt={previewImage.name}
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] max-w-full rounded-xl object-contain"
          />
        </div>
      )}
    </div>
  );
};
