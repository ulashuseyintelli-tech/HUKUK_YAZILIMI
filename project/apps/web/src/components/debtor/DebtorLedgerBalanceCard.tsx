"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type DebtorLedgerBalanceResultDTO } from "@/lib/api";
import { useGuardedAction } from "@/components/guarded-edge/use-guarded-action";

const HOLD_REASON_LABELS: Record<string, string> = {
  ON_BEHALF_DEBTOR_REQUIRED: "hesabına ödeme yapılan borçlu belirtilmedi",
  ON_BEHALF_DEBTOR_NOT_LIABLE: "belirtilen borçlunun sorumlu olduğu kalem yok",
};

/**
 * K3-L Faz 1c (owner kararı 2026-09-29 "önce defterden, faiz ayrı") — borçlunun yalnız sorumlu olduğu kalemlerden
 * kalan borcu (kalıcı defterden; işleyen faiz HARİÇ). Ortak kalemin tahsilatı tüm sorumlular için düşer.
 * K3-L tamamlama (owner GO 2026-09-29): mahsubu bekletilen tahsilat BU borçlu hesabına tamamlanabilir; yetki
 * kapısı tahsilat kaydıyla aynıdır (zarf dönerse onay modalı), sunucu aynı transaction'da mahsup eder.
 */
export function DebtorLedgerBalanceCard({
  caseId,
  caseDebtorId,
  onAllocationCompleted,
}: {
  caseId: string;
  caseDebtorId: string;
  onAllocationCompleted?: () => void;
}) {
  const [data, setData] = useState<DebtorLedgerBalanceResultDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const { run: runGuarded, modal: guardedModal } = useGuardedAction();

  const load = useCallback(() => {
    let cancelled = false;
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
  }, [caseId]);

  useEffect(() => {
    setData(null);
    setCompletionMessage(null);
    return load();
  }, [load, caseDebtorId]);

  const completeHeld = async (collectionId: string) => {
    if (completing) return;
    setCompleting(collectionId);
    setCompletionMessage(null);
    try {
      // Tahsilat kaydıyla aynı guarded-edge tüketicisi: zarf dönerse onay modalı, onaylanırsa AYNI girdiyle tek retry.
      const result = await runGuarded((confirmation) =>
        api.completeCollectionAllocation(caseId, collectionId, {
          caseDebtorId,
          confirmationToken: confirmation?.token,
        }),
      );
      if (result.status === "cancelled") return;
      if (result.status === "approval_pending") {
        setCompletionMessage(result.envelope.message || "İşlem onay talebine yönlendirildi; mahsup henüz yapılmadı.");
        return;
      }
      setCompletionMessage(
        result.data.replayed
          ? "Bu tahsilatın mahsubu daha önce bu borçlu hesabına tamamlanmıştı (yeni kayıt üretilmedi)."
          : `Mahsup tamamlandı: ${result.data.allocatedAmount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} bu borçlunun sorumlu olduğu kalemlere işlendi.`,
      );
      load();
      onAllocationCompleted?.();
    } catch (err: any) {
      setCompletionMessage(err?.message || "Mahsup tamamlanamadı.");
    } finally {
      setCompleting(null);
    }
  };

  const own = data?.borclular.find((b) => b.caseDebtorId === caseDebtorId);
  const held = data?.mahsubuBekleyenTahsilatlar ?? [];
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
          {held.length > 0 && (
            <div data-testid="debtor-ledger-held" className="space-y-1 rounded border border-amber-200 bg-amber-50 p-1.5">
              <p className="text-[10px] text-amber-800">
                Mahsubu bekleyen tahsilat: {held.map((h) => fmt(h.tutar, h.paraBirimi)).join(", ")} — hiçbir borçlunun
                kalanından düşülmedi.
              </p>
              <ul className="space-y-0.5">
                {held.map((h) => (
                  <li key={h.collectionId} data-testid="debtor-ledger-held-item" className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="text-amber-900">
                      {fmt(h.tutar, h.paraBirimi)} — {HOLD_REASON_LABELS[h.sebep] ?? h.sebep}
                    </span>
                    <button
                      type="button"
                      data-testid="debtor-ledger-complete-hold"
                      disabled={completing !== null}
                      onClick={() => completeHeld(h.collectionId)}
                      className="rounded border border-amber-400 bg-white px-1.5 py-0.5 text-[10px] font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                    >
                      {completing === h.collectionId ? "Mahsup ediliyor…" : "Bu borçlu hesabına mahsup et"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {completionMessage && (
            <p data-testid="debtor-ledger-completion-message" className="text-[10px] text-gray-800">
              {completionMessage}
            </p>
          )}
          <p className="text-[10px] text-gray-500">{data?.not}</p>
        </>
      )}
      {guardedModal}
    </section>
  );
}
