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
 * B-2.3 — opsiyonel `focusable`: header'a "Büyüt" aksiyonu ekler. Tıklanınca AYNI panel içeriği (title/subHeader/
 * body/footer) sağdan geniş FocusDrawer'da (overlay) açılır. YALNIZ "Büyüt" açar — panel gövdesine tıklamak AÇMAZ.
 * Dashboard arka planda değişmez; kalıcı yeni panel eklenmez.
 *
 * Muhasebe davranışını DEĞİŞTİRMEZ; yalnız sunum/iskelet.
 */

import { type ReactNode, useState } from 'react';
import { Card } from '@hukuk/ui';
import { Maximize2 } from 'lucide-react';
import { FocusDrawer } from './FocusDrawer';

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
  /** B-2.3: header'a "Büyüt" aksiyonu + odak drawer ekler. YALNIZ buton açar (gövde tıklaması değil). */
  focusable?: boolean;
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
  focusable,
}: AccountingPanelProps) {
  const [focused, setFocused] = useState(false);

  const headerRight =
    focusable || actions ? (
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {focusable ? (
          <button
            type="button"
            onClick={() => setFocused(true)}
            title="Büyüt"
            aria-label="Büyüt"
            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Büyüt</span>
          </button>
        ) : null}
      </div>
    ) : null;

  return (
    <>
      <Card className={`flex min-h-0 h-full flex-col overflow-hidden ${className ?? ''}`}>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">{title}</div>
          {headerRight}
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

      {/* B-2.3 — odak drawer: aynı panel içeriğinin geniş versiyonu (yalnız "Büyüt" ile açılır) */}
      {focusable ? (
        <FocusDrawer
          open={focused}
          onClose={() => setFocused(false)}
          ariaLabel={ariaLabel}
          title={title}
          subHeader={subHeader}
          footer={footer}
          bodyClassName={bodyClassName}
        >
          {children}
        </FocusDrawer>
      ) : null}
    </>
  );
}

export default AccountingPanel;
