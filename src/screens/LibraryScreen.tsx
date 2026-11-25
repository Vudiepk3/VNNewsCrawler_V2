import React, { useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  Copy,
  Image as ImageIcon,
  Newspaper,
  Search,
  Share2,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { NEWS_SOURCES, getDisplayTimestamp } from '../shared/types';
import type { ArticleSortOrder, CrawledArticle, NewsSourceId } from '../shared/types';
import {
  buildFullArticleText,
  copyTextToClipboard,
  formatDateTime,
  formatRelativeTime,
  getRawFileUrl,
  shareArticleContent,
} from '../lib/shareUtils';

interface Props {
  articles: CrawledArticle[];
  search: string;
  sourceFilter: NewsSourceId | 'all';
  sortOrder: ArticleSortOrder;
  onChangeSearch: (value: string) => void;
  onChangeSourceFilter: (source: NewsSourceId | 'all') => void;
  onChangeSortOrder: (sort: ArticleSortOrder) => void;
  onSelectArticle: (article: CrawledArticle) => void;
  onDeleteArticles: (ids: string[]) => Promise<void>;
  onNotify: (type: 'success' | 'info' | 'warning' | 'error', message: string) => void;
  onGoCrawl: () => void;
}

export const LibraryScreen: React.FC<Props> = ({
  articles,
  search,
  sourceFilter,
  sortOrder,
  onChangeSearch,
  onChangeSourceFilter,
  onChangeSortOrder,
  onSelectArticle,
  onDeleteArticles,
  onNotify,
  onGoCrawl,
}) => {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null);
  const [brokenThumbs, setBrokenThumbs] = useState<Set<string>>(new Set());
  const longPressTimer = useRef<number | null>(null);

  const filteredArticles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = articles.filter((a) => {
      if (sourceFilter !== 'all' && a.sourceId !== sourceFilter) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.sapo.toLowerCase().includes(q) ||
        a.categorySlug.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortOrder === 'crawled') return b.crawledAt - a.crawledAt;
      const ta = getDisplayTimestamp(a);
      const tb = getDisplayTimestamp(b);
      if (sortOrder === 'oldest') return ta - tb || a.crawledAt - b.crawledAt;
      return tb - ta || b.crawledAt - a.crawledAt;
    });
  }, [articles, search, sourceFilter, sortOrder]);

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredArticles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredArticles.map((a) => a.id)));
    }
  };

  const startLongPress = (articleId: string) => {
    longPressTimer.current = window.setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(15);
      setSelectionMode(true);
      setSelectedIds((prev) => new Set(prev).add(articleId));
    }, 450);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleCopyArticle = async (e: React.MouseEvent, article: CrawledArticle) => {
    e.stopPropagation();
    const ok = await copyTextToClipboard(buildFullArticleText(article));
    onNotify(ok ? 'success' : 'error', ok ? 'Đã sao chép toàn bộ nội dung bài viết' : 'Không thể sao chép');
  };

  const handleShareArticle = async (e: React.MouseEvent, article: CrawledArticle) => {
    e.stopPropagation();
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

  const handleConfirmDelete = async () => {
    if (!confirmDeleteIds || confirmDeleteIds.length === 0) return;
    await onDeleteArticles(confirmDeleteIds);
    setConfirmDeleteIds(null);
    exitSelectionMode();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Kho bài viết
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {filteredArticles.length} bài viết đã lưu · Nhấn giữ thẻ bài để chọn nhiều và xóa
          </p>
        </div>

        {filteredArticles.length > 0 && (
          <button
            type="button"
            onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {selectionMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
            <span>{selectionMode ? 'Đóng chọn' : 'Chọn xóa'}</span>
          </button>
        )}
      </div>

      {/* Multi-select action bar */}
      {selectionMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 dark:border-red-900/60 dark:bg-red-950/30">
          <span className="text-sm font-semibold text-red-900 dark:text-red-100 tabular-nums">
            Đã chọn {selectedIds.size}/{filteredArticles.length} bài viết
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="min-h-[38px] rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-red-800 dark:bg-slate-900 dark:text-slate-100"
            >
              {selectedIds.size === filteredArticles.length ? 'Bỏ chọn' : 'Chọn tất cả'}
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => setConfirmDeleteIds(Array.from(selectedIds))}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-red-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Xóa ({selectedIds.size})</span>
            </button>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => onChangeSearch(e.target.value)}
            placeholder="Tìm theo tiêu đề, tóm tắt hoặc chuyên mục..."
            className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-4 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-700 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Source filter tabs */}
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
            {[
              { id: 'all' as const, label: 'Tất cả' },
              { id: 'vnexpress' as const, label: 'VNExpress' },
              { id: 'dantri' as const, label: 'Dân Trí' },
              { id: 'vietnamnet' as const, label: 'VietNamNet' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeSourceFilter(item.id)}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  sourceFilter === item.id
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-50'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Sort order tabs */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
            {[
              { id: 'newest' as const, label: 'Mới nhất' },
              { id: 'crawled' as const, label: 'Mới tải' },
              { id: 'oldest' as const, label: 'Cũ nhất' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeSortOrder(opt.id)}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  sortOrder === opt.id
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-50'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Article Grid */}
      {filteredArticles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center dark:border-slate-800 dark:bg-slate-900">
          <Newspaper className="h-10 w-10 text-slate-400" aria-hidden="true" />
          <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
            Kho bài viết đang trống
          </h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            Chưa có bài viết nào phù hợp. Hãy sang mục Thu thập để tải tin tức từ các báo tiếng Việt.
          </p>
          <button
            type="button"
            onClick={onGoCrawl}
            className="mt-5 min-h-[44px] rounded-xl bg-red-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800"
          >
            Thu thập ngay
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredArticles.map((article) => {
            const isSelected = selectedIds.has(article.id);
            const thumbPath = article.localImagePaths[0];
            const thumbBroken = brokenThumbs.has(article.id);
            const displayTs = getDisplayTimestamp(article);
            const timeLabel = article.publishedAt > 0 ? 'Đăng' : 'Tải';
            const sourceName = NEWS_SOURCES[article.sourceId]?.displayName || article.sourceId;

            return (
              <article
                key={article.id}
                onClick={() => (selectionMode ? toggleSelectId(article.id) : onSelectArticle(article))}
                onPointerDown={() => startLongPress(article.id)}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onPointerCancel={cancelLongPress}
                className={`group flex cursor-pointer flex-col justify-between rounded-2xl border bg-white p-4 transition-colors dark:bg-slate-900 ${
                  isSelected
                    ? 'border-red-700 bg-red-50/40 dark:border-red-500 dark:bg-red-950/20'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                }`}
              >
                <div>
                  {/* Thumbnail */}
                  <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                    {thumbPath && !thumbBroken ? (
                      <img
                        src={getRawFileUrl(thumbPath)}
                        alt={article.title}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        onError={() => setBrokenThumbs((prev) => new Set(prev).add(article.id))}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400 dark:from-slate-800 dark:to-slate-900 dark:text-slate-500">
                        <ImageIcon className="h-6 w-6" aria-hidden="true" />
                        <span className="text-[11px] font-medium">{sourceName}</span>
                      </div>
                    )}

                    {selectionMode && (
                      <div className="absolute top-2.5 left-2.5 rounded-lg bg-white/90 p-1.5 shadow-sm dark:bg-slate-900/90">
                        {isSelected ? (
                          <CheckSquare className="h-5 w-5 text-red-700 dark:text-red-400" />
                        ) : (
                          <Square className="h-5 w-5 text-slate-500" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Clean unboxed metadata (Zero-Pill Rule) */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-red-700 dark:text-red-400">{sourceName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{article.categorySlug}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      {timeLabel} {formatDateTime(displayTs)} ({formatRelativeTime(displayTs)})
                    </span>
                  </div>

                  <h3 className="mt-1.5 line-clamp-2 text-base font-bold leading-snug text-slate-900 dark:text-slate-100">
                    {article.title}
                  </h3>

                  {article.sapo && (
                    <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      {article.sapo}
                    </p>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <span className="text-xs font-mono-data tabular-nums text-slate-500 dark:text-slate-400">
                    {article.wordCount} từ · {article.localImagePaths.length} ảnh
                  </span>

                  {!selectionMode && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => handleCopyArticle(e, article)}
                        title="Sao chép nội dung"
                        aria-label="Sao chép nội dung"
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        <span>Sao chép</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleShareArticle(e, article)}
                        title="Chia sẻ"
                        aria-label="Chia sẻ bài viết"
                        className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteIds([article.id]);
                        }}
                        title="Xóa bài viết"
                        aria-label="Xóa bài viết"
                        className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteIds && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setConfirmDeleteIds(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-slate-900 dark:border dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Xác nhận xóa bài viết
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Bạn chắc chắn muốn xóa {confirmDeleteIds.length} bài viết cùng tệp .txt và ảnh cục bộ trong thư mục result/?
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteIds(null)}
                className="min-h-[44px] flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="min-h-[44px] flex-1 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
