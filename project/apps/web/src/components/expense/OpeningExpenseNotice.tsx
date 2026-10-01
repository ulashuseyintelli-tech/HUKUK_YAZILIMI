"use client";

/**
 * Açılış masraf talebi — "otomatik oluşturulmadı" uyarısı (dosya sayfası, kalıcı).
 *
 * Dövizli / karma dosyada sunucu otomatik açılış masraf talebini oluşturmaz (peşin harç matrahı TL olarak
 * hesaplanamaz). Dosyada hiç masraf talebi yokken neden ve tamamlanması gereken bilgi burada görünür; talep
 * oluşturulduğunda (elle de olsa) uyarı kalkar. Karar ve metin SUNUCUDANDIR; istemci hesap yapmaz, kur önermez.
 */

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { openingExpenseNoticeOf, type OpeningExpenseAutomationStatus } from "@/lib/opening-expense-status";

interface Props {
  caseId: string;
  refreshKey?: number | string;
}

export function OpeningExpenseNotice({ caseId, refreshKey }: Props) {
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

  const notice = openingExpenseNoticeOf(status);
  if (!notice) return null;

  return (
    <div data-testid="acilis-masraf-talebi-uyari" className="px-3 py-1 text-[10px] text-amber-800 bg-amber-50 border-b border-amber-200 flex-shrink-0">
      <div>{notice.message}</div>
      {notice.requiredInfo.length > 0 && (
        <div data-testid="acilis-masraf-talebi-gereken-bilgi" className="font-medium">
          Gereken bilgi: {notice.requiredInfo.join("; ")}
        </div>
      )}
    </div>
  );
}

export default OpeningExpenseNotice;
