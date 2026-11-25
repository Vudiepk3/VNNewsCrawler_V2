import React, { useState } from 'react';
import { Download, Share, PlusSquare, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface Props {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<Props> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          compact
            ? 'inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
            : 'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-200/80 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:hover:bg-slate-700'
        }
      >
        <Download className="h-4 w-4 text-red-700 dark:text-red-400" aria-hidden="true" />
        <span>{isIOS ? 'Cài lên iPhone / iPad' : 'Cài đặt ứng dụng'}</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-slate-900 dark:border dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden dark:bg-slate-700" />
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <Smartphone className="h-5 w-5 text-red-700 dark:text-red-400" aria-hidden="true" />
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {isIOS ? 'Cài đặt trên iOS (iPhone / iPad)' : 'Cài đặt lên Android, iOS & Máy tính'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Đóng hướng dẫn"
                className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <p className="flex items-start gap-2.5">
                  <Share className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span>
                    1. Mở trang này bằng <strong>Safari</strong>, sau đó chạm nút <strong>Chia sẻ (Share)</strong> ở thanh dưới cùng.
                  </span>
                </p>
                <p className="flex items-start gap-2.5">
                  <PlusSquare className="mt-0.5 h-4 w-4 shrink-0 text-slate-800 dark:text-slate-200" />
                  <span>
                    2. Cuộn xuống và chọn <strong>Thêm vào Màn hình chính (Add to Home Screen)</strong> để dùng như ứng dụng iOS độc lập.
                  </span>
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
                <p>
                  • <strong>Android (Chrome):</strong> Mở menu <strong>⋮</strong> của trình duyệt và chọn <strong>Cài đặt ứng dụng / Thêm vào màn hình chính</strong>.
                </p>
                <p>
                  • <strong>iOS (Safari):</strong> Chạm biểu tượng <strong>Chia sẻ</strong> rồi chọn <strong>Thêm vào Màn hình chính</strong>.
                </p>
                <p>
                  • <strong>Web (Chrome / Edge):</strong> Nhấn biểu tượng cài đặt ở thanh địa chỉ trình duyệt để mở ở cửa sổ riêng và đọc ngoại tuyến.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 min-h-[44px] w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}
    </>
  );
};
