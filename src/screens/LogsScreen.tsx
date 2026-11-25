import React, { useMemo, useState } from 'react';
import { Copy, Download, ScrollText, Trash2 } from 'lucide-react';
import type { CrawlLogEntry, LogLevel } from '../shared/types';
import { copyTextToClipboard, exportTextFile, formatDateTime } from '../lib/shareUtils';

interface Props {
  logs: CrawlLogEntry[];
  onClearLogs: () => Promise<void>;
  onNotify: (type: 'success' | 'info' | 'warning' | 'error', message: string) => void;
}

export const LogsScreen: React.FC<Props> = ({ logs, onClearLogs, onNotify }) => {
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'ALL'>('ALL');

  const filteredLogs = useMemo(() => {
    if (levelFilter === 'ALL') return logs;
    return logs.filter((l) => l.level === levelFilter);
  }, [logs, levelFilter]);

  const formatLogLine = (l: CrawlLogEntry) =>
    `[${formatDateTime(l.timestamp)}] [${l.level}] [${l.tag}] ${l.message}`;

  const handleCopyAll = async () => {
    const content = filteredLogs.map(formatLogLine).join('\n');
    if (!content) return;
    await copyTextToClipboard(content);
    onNotify('success', `Đã sao chép ${filteredLogs.length} dòng nhật ký`);
  };

  const handleExport = () => {
    const content = filteredLogs.map(formatLogLine).join('\n');
    exportTextFile('info.log', content);
    onNotify('success', 'Đã xuất tệp info.log');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Nhật ký (info.log)
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {filteredLogs.length} dòng log · Chạm vào từng dòng để sao chép nhanh
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={filteredLogs.length === 0}
            onClick={handleCopyAll}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Sao chép</span>
          </button>
          <button
            type="button"
            disabled={filteredLogs.length === 0}
            onClick={handleExport}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Xuất log</span>
          </button>
          <button
            type="button"
            disabled={logs.length === 0}
            onClick={onClearLogs}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Xóa</span>
          </button>
        </div>
      </div>

      {/* Level filter tabs */}
      <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
        {(['ALL', 'INFO', 'DEBUG', 'WARN', 'ERROR'] as const).map((lvl) => (
          <button
            key={lvl}
            type="button"
            onClick={() => setLevelFilter(lvl)}
            className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              levelFilter === lvl
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-50'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            {lvl === 'ALL' ? 'Tất cả' : lvl}
          </button>
        ))}
      </div>

      {filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center dark:border-slate-800 dark:bg-slate-900">
          <ScrollText className="h-10 w-10 text-slate-400" />
          <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
            Chưa có nhật ký nào
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Tiến trình thu thập sẽ ghi lại chi tiết từng bước tại đây.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:divide-slate-800">
          {filteredLogs.map((log) => {
            const levelClass = {
              INFO: 'text-emerald-700 dark:text-emerald-400',
              DEBUG: 'text-slate-500 dark:text-slate-400',
              WARN: 'text-amber-700 dark:text-amber-400',
              ERROR: 'text-red-700 dark:text-red-400',
            }[log.level];

            return (
              <button
                key={log.id}
                type="button"
                onClick={async () => {
                  await copyTextToClipboard(formatLogLine(log));
                  onNotify('info', 'Đã sao chép dòng nhật ký');
                }}
                className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <div className="flex items-center gap-2 text-xs font-mono-data tabular-nums">
                  <span className={`font-semibold ${levelClass}`}>{log.level}</span>
                  <span className="text-slate-400">·</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">{log.tag}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500">{formatDateTime(log.timestamp)}</span>
                </div>
                <div className="text-xs font-mono-data leading-relaxed text-slate-800 break-words dark:text-slate-200">
                  {log.message}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
