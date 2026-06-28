'use client';

/**
 * B-2.2 — Müvekkil Muhasebesi dashboard'ı için ORTAK panel kontratı (frontend-only, salt-layout).
 *
 * İç scroll'un çalışması bu zincire bağlıdır (make-or-break = min-h-0):
 *   root   : flex flex-col overflow-hidden min-h-0 h-full   (yükseklik grid/flex PARENT'tan gelir; burada calc YOK)
 *   header : shrink-0                                        (başlık + aksiyon — scroll etmez)
 *   sub    : shrink-0 (opsiyonel)                            (filtre/açıklama bar — scroll body'ye GİRMEZ)
 *   body   : flex-1 min-h-0 overflow-auto                   (TEK scroll alanı; sticky thead burada çalışır)
 *   footer : shrink-0 (opsiyonel)                            (pagination/not — görünür kalır)
 *
 * Muhasebe davranışını DEĞİŞTİRMEZ; yalnız sunum/iskelet.
 */

import { type ReactNode } from 'react';
import { Card } from '@hukuk/ui';

interface AccountingPanelProps {
  /** Header sol taraf: ikon + başlık + sayaç badge + (varsa) spinner. */
  title: ReactNode;
  /** Header sağ taraf: aksiyon (örn. "Oluştur" butonu). */
  actions?: ReactNode;
  /** Header altında SABİT ikincil bar (filtre/açıklama). Scroll body'ye girmez. */
  subHeader?: ReactNode;
  /** Body altında SABİT footer (pagination/not). Scroll body'ye girmez. */
  footer?: ReactNode;
  /** İç scroll alanı (tablo). */
  children: ReactNode;
  /** Keyboard/AT erişimi için scroll bölgesinin etiketi. */
  ariaLabel: string;
  /** Panel kökü (grid/flex item sizing: min-h-0 / min-w-0 / flex-*) için ek sınıf. */
  className?: string;
  /** Scroll body için ek sınıf (örn. padding). Tablo panellerinde genelde boş. */
  bodyClassName?: string;
}

export function AccountingPanel({
  title,
  actions,
  subHeader,
  footer,
  children,
  ariaLabel,
  className,
  bodyClassName,
}: AccountingPanelProps) {
  return (
    <Card className={`flex min-h-0 h-full flex-col overflow-hidden ${className ?? ''}`}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">{title}</div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {subHeader ? (
        <div className="shrink-0 border-b bg-gray-50/50 px-4 py-2.5">{subHeader}</div>
      ) : null}
      <div
        className={`min-h-0 flex-1 overflow-auto ${bodyClassName ?? ''}`}
        style={{ scrollbarGutter: 'stable' }}
        tabIndex={0}
        role="region"
        aria-label={ariaLabel}
      >
        {children}
      </div>
      {footer ? <div className="shrink-0 border-t px-4 py-2">{footer}</div> : null}
    </Card>
  );
}

export default AccountingPanel;
