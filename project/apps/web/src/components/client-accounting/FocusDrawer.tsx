'use client';

/**
 * B-2.3 — Panel Odak Drawer'ı (frontend-only, salt-layout). Bir Genel Cari dashboard panelinin
 * GENİŞ versiyonunu sağdan açılan overlay'de gösterir. Dashboard arka planda DEĞİŞMEZ (overlay; kalıcı panel YOK).
 *
 * - Esc / overlay-click / kapat butonu kapatır.
 * - Yalnız panel header'ındaki "Büyüt" aksiyonu açar (AccountingPanel yönetir; panel gövdesi açmaz).
 * - Body, AccountingPanel ile AYNI kontrat: flex-1 min-h-0 overflow-auto → sticky thead + iç scroll korunur.
 * - subHeader (filtre/açıklama) ve footer (pagination/not) sabit kalır.
 *
 * Muhasebe/veri DEĞİŞTİRMEZ; aynı panel içeriğini geniş alanda render eder.
 */

import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface FocusDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Header sol içerik (panel başlığı: ikon + ad + badge). */
  title: ReactNode;
  /** Geniş gövde (panelin tablosu/içeriği). */
  children: ReactNode;
  /** Header altı sabit bar (filtre/açıklama). */
  subHeader?: ReactNode;
  /** Body altı sabit footer (pagination/not). */
  footer?: ReactNode;
  ariaLabel: string;
  bodyClassName?: string;
}

export function FocusDrawer({ open, onClose, title, children, subHeader, footer, ariaLabel, bodyClassName }: FocusDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className="ml-auto flex h-full w-full flex-col bg-white shadow-xl lg:w-[82vw] lg:max-w-[1400px]"
      >
        {/* Header (sabit) */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-gray-50 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">{title}</div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded p-1 hover:bg-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* subHeader (sabit) */}
        {subHeader ? <div className="shrink-0 border-b bg-gray-50/50 px-4 py-2.5">{subHeader}</div> : null}
        {/* Body (tek iç scroll alanı; sticky thead burada çalışır) */}
        <div
          className={`min-h-0 flex-1 overflow-auto ${bodyClassName ?? ''}`}
          style={{ scrollbarGutter: 'stable' }}
          tabIndex={0}
          role="region"
          aria-label={ariaLabel}
        >
          {children}
        </div>
        {/* footer (sabit) */}
        {footer ? <div className="shrink-0 border-t px-4 py-2">{footer}</div> : null}
      </div>
    </div>
  );
}

export default FocusDrawer;
