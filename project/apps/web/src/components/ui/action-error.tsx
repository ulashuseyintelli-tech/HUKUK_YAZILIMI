'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';

/**
 * PR-2A — mutation hatasının GÖRÜNÜR yüzeyi.
 *
 * Bu depoda merkezî bir toast altyapısı yok; konvansiyon bileşen-içi yerel hata state'i
 * (emsal: `UyapPanel.handleHacizSubmit` → `setHacizError`). Bu bileşen o konvansiyonu tek
 * bir görünüme sabitler ki 23 çağrı noktası birbirinden ayrışmasın.
 *
 * `role="alert"` bilinçlidir: hata ekranın altında oluşsa bile ekran okuyucuya duyurulur.
 * `onRetry` yalnız tekrar denemenin ANLAMLI olduğu yerlerde verilir (ağ/geçici hata);
 * kural ihlali dönen yerlerde tekrar denemek aynı sonucu üretir, düğme gösterilmez.
 */
export function ActionError({
  message,
  onRetry,
  retrying = false,
  className = '',
}: {
  message: string | null | undefined;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  if (!message) return null;

  return (
    <div
      role="alert"
      data-testid="action-error"
      className={`flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 ${className}`}
    >
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="flex-1">{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          data-testid="action-error-retry"
          className="inline-flex shrink-0 items-center gap-1 rounded border border-red-300 px-1.5 py-0.5 font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          {retrying ? 'Deneniyor...' : 'Tekrar dene'}
        </button>
      ) : null}
    </div>
  );
}
