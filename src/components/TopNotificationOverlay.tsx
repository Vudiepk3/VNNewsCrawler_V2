import React from 'react';
import { AlertCircle, CheckCircle2, Info, X, AlertTriangle } from 'lucide-react';
import type { TopNotification } from '../shared/types';

interface Props {
  notifications: TopNotification[];
  onDismiss: (id: string) => void;
}

export const TopNotificationOverlay: React.FC<Props> = ({ notifications, onDismiss }) => {
  if (notifications.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed top-0 left-0 right-0 z-[110] flex flex-col items-center gap-2 px-4 pt-safe mt-2"
    >
      {notifications.map((item) => {
        const styleMap = {
          success:
            'bg-emerald-950 text-emerald-50 border-emerald-700/60 dark:bg-emerald-900 dark:text-emerald-50',
          info: 'bg-slate-900 text-slate-50 border-slate-700/60 dark:bg-slate-800 dark:text-slate-50',
          warning:
            'bg-amber-950 text-amber-50 border-amber-700/60 dark:bg-amber-900 dark:text-amber-50',
          error: 'bg-red-950 text-red-50 border-red-700/60 dark:bg-red-900 dark:text-red-50',
        }[item.type];

        const Icon = {
          success: CheckCircle2,
          info: Info,
          warning: AlertTriangle,
          error: AlertCircle,
        }[item.type];

        return (
          <div
            key={item.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg transition-all duration-200 ${styleMap}`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 leading-snug">{item.message}</span>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              aria-label="Đóng thông báo"
              className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg opacity-75 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
