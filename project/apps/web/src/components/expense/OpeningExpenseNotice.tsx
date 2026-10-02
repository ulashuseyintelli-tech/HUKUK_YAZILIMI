"use client";

/**
 * Açılış masraf talebi uyarıları (dosya sayfası, kalıcı). Karar ve metin SUNUCUDANDIR; istemci hesap yapmaz, kur ya da
 * neden üretmez.
 *
 * 1. "Otomatik oluşturulmadı": dövizli / karma dosyada sunucu otomatik açılış masraf talebini oluşturmaz (peşin harç
 *    matrahı TL olarak hesaplanamaz). Dosyada hiç masraf talebi yokken neden ve tamamlanması gereken bilgi burada
 *    görünür; talep oluşturulduğunda (elle de olsa) uyarı kalkar.
 * 2. "Masraf e-postası gönderilemedi": talep oluşmuş ama istenen masraf e-postası gönderilememişse (talep hâlâ
 *    gönderilmemiş durumda) neden ve gereken bilgi burada görünür. E-posta gönderildiyse ya da hiç istenmediyse
 *    sunucu alan göndermez ve hiçbir şey çizilmez.
 */

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import {
  openingExpenseEmailNoticeOf,
  openingExpenseNoticeOf,
  type OpeningExpenseAutomationStatus,
} from "@/lib/opening-expense-status";

interface Props {
  caseId: string;
  refreshKey?: number | string;
  /** "Otomatik oluşturulmadı" uyarısı gösterilsin mi? (Hesap Özeti yalnız para birimi kısıtlı dosyada açar.) */
  calculationNotice?: boolean;
}

export function OpeningExpenseNotice({ caseId, refreshKey, calculationNotice = true }: Props) {
  const [status, setStatus] = useState<OpeningExpenseAutomationStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!caseId) return;
    let active = true;
    (async () => {
      try {
        const response = await apiClient.get<OpeningExpenseAutomationStatus>(`/expense-requests/case/${caseId}/opening-status`);
        if (!active) return;
        setStatus(response?.data ?? null);
        setLoadFailed(false);
      } catch {
        if (!active) return;
        setStatus(null);
        setLoadFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [caseId, refreshKey]);

  if (loadFailed) {
    // Okuma hatası "uyarı yok" ile karıştırılmaz
    return (
      <div data-testid="acilis-masraf-talebi-durum-okunamadi" className="px-3 py-1 text-[10px] text-gray-500 border-b flex-shrink-0">
        Açılış masraf talebi durumu okunamadı.
      </div>
    );
  }

  const notice = calculationNotice ? openingExpenseNoticeOf(status) : null;
  const emailNotice = openingExpenseEmailNoticeOf(status);
  if (!notice && !emailNotice) return null;

  return (
    <>
      {notice && (
        <div data-testid="acilis-masraf-talebi-uyari" className="px-3 py-1 text-[10px] text-amber-800 bg-amber-50 border-b border-amber-200 flex-shrink-0">
          <div>{notice.message}</div>
          {notice.requiredInfo.length > 0 && (
            <div data-testid="acilis-masraf-talebi-gereken-bilgi" className="font-medium">
              Gereken bilgi: {notice.requiredInfo.join("; ")}
            </div>
          )}
        </div>
      )}
      {emailNotice && (
        <div data-testid="acilis-masraf-eposta-uyari" role="alert" className="px-3 py-1 text-[10px] text-amber-800 bg-amber-50 border-b border-amber-200 flex-shrink-0">
          <div>{emailNotice.message}</div>
          {emailNotice.requiredInfo.length > 0 && (
            <div data-testid="acilis-masraf-eposta-gereken-bilgi" className="font-medium">
              Gereken bilgi: {emailNotice.requiredInfo.join("; ")}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default OpeningExpenseNotice;
