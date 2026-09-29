"use client";

import { useEffect, useState } from "react";
import { api, type DebtorLedgerBalanceResultDTO } from "@/lib/api";

/**
 * K3-L Faz 1c (owner kararı 2026-09-29 "önce defterden, faiz ayrı") — borçlunun yalnız sorumlu olduğu kalemlerden
 * kalan borcu (kalıcı defterden; işleyen faiz HARİÇ). Ortak kalemin tahsilatı tüm sorumlular için düşer.
 */
export function DebtorLedgerBalanceCard({ caseId, caseDebtorId }: { caseId: string; caseDebtorId: string }) {
  const [data, setData] = useState<DebtorLedgerBalanceResultDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    // Senkron hatalar da (ör. istemci yok) yakalansın: çekmecenin diğer yüklemeleri gibi kart da sayfayı düşürmez.
    Promise.resolve()
      .then(() => api.getCaseDebtorLedgerBalances(caseId))
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || "Borçlu bakiyesi alınamadı.");
      });
    return () => {
      cancelled = true;
    };
  }, [caseId, caseDebtorId]);

  const own = data?.borclular.find((b) => b.caseDebtorId === caseDebtorId);
  const fmt = (amount: number, currency: string) =>
    `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

  return (
    <section
      aria-label="Borclu kalem bazli borc"
      data-testid="debtor-ledger-balance"
      className="bg-white border border-gray-200 rounded-lg p-2 space-y-1.5"
    >
      <h3 className="font-medium text-[11px] text-gray-800">Kalem Bazlı Borç (işleyen faiz hariç)</h3>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {!error && !data && <p className="text-xs text-gray-500">Yükleniyor…</p>}
      {data && !own && <p className="text-xs text-gray-500">Bu borçlu için etkin kayıt yok.</p>}
      {own && (
        <>
          <ul className="space-y-0.5 text-[11px]">
            {own.kalemler.map((kalem) => (
              <li key={kalem.claimItemId} data-testid="debtor-ledger-line" className="flex justify-between gap-2">
                <span className="text-gray-700">
                  {kalem.aciklama || kalem.kalemTuru}
                  {!kalem.ortak && <span className="ml-1 text-amber-700">(yalnız bu borçlu grubuna ait)</span>}
                </span>
                <span className="text-gray-900">kalan {fmt(kalem.kalan, kalem.paraBirimi)}</span>
              </li>
            ))}
          </ul>
          {own.toplamlar.map((toplam) => (
            <div
              key={toplam.paraBirimi}
              data-testid="debtor-ledger-total"
              className="flex justify-between border-t pt-1 text-[11px] font-semibold text-gray-900"
            >
              <span>Kalan</span>
              <span>{fmt(toplam.kalan, toplam.paraBirimi)}</span>
            </div>
          ))}
          <p className="text-[10px] text-gray-500">{data?.not}</p>
        </>
      )}
    </section>
  );
}
