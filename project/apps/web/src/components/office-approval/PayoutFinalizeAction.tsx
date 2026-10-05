"use client";

// Müvekkile ödeme talebi (CLIENT_PAYOUT_POST) — karar sahibi için onay kutusu çekmecesinde "Kesinleştir".
// Önceden: onaylandıktan sonra çekmecede hiçbir eylem yoktu ve talep sahibinin sayfasında da kart yoktu → onaylanan talep
// kesinleştirilemeden kalıyordu. Görünürlük YALNIZ kolaylıktır, yetki DEĞİLDİR: yetki, durum (yalnız APPROVED), payload-drift,
// tutar / borç sınırı ve büro kapıları sunucudadır (POST /client-payouts/:id/finalize); sunucunun reddi olduğu gibi gösterilir.
// Düğme yalnız KAYITLI karar sahibine (detail.approverUserId) gösterilir: onay anında sunucu onun ödeme onayı yetkisini
// denetlemiştir; yetkisi sonradan alınmışsa kesinleştirme sunucuda 403 ile reddedilir.
//
// İki ayrı istek, iki ayrı sonuç: (1) kesinleştirme — başarısızsa "başarısız"; (2) kesinleştirmeden SONRA detay yenileme —
// başarısız olursa ödeme YAPILMIŞTIR, kullanıcıya "başarısız" gösterilmez (yeni talep açıp ikinci ödeme riski doğar).
import { useContext, useRef, useState } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { officeApprovalApi, type OfficeApprovalDetail } from "@/lib/api/office-approval";
import { clientAccountingApi } from "@/lib/api/client-accounting";
import { isPayoutIntent } from "@/components/client-accounting/payout-intent";

const PAYOUT_ACTION_CODE = "CLIENT_PAYOUT_POST";

/** Kesinleştirme ödeme kaydı yazar; muhasebe görünümleri (borç, ödemeler, ekstre, defter) bayat kalmasın (kartla AYNI anahtarlar). */
const ACCOUNTING_QUERY_KEYS = [
  "client-accounting-outstanding",
  "client-accounting-payouts",
  "client-statement",
  "financial-statement",
  "client-payout-approval-requests",
  "client-payout-approval-request-details",
] as const;

interface Props {
  detail: OfficeApprovalDetail;
  currentUserId: string | null;
  /** Kesinleştirme başarılı: güncel detay ile çağrılır (çekmece içeriği + liste yenileme). */
  onFinalized: (updated: OfficeApprovalDetail) => void;
}

export function PayoutFinalizeAction({ detail, currentUserId, onFinalized }: Props) {
  // QueryClientProvider yoksa (yalıtılmış bileşen / test) sorgu tazeleme atlanır; uygulamada sağlayıcı her zaman vardır.
  const queryClient = useContext(QueryClientContext);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false); // eşzamanlı çift tıklama: state güncellemesi gelmeden ikinci tıklamayı da keser
  const [error, setError] = useState<string | null>(null);
  const [finalizedButNotRefreshed, setFinalizedButNotRefreshed] = useState(false);

  // Ödeme yapıldı ama detay yenilenemedi: düğme KAPALI, durum açık yazılır (tekrar kesinleştirme yönlendirilmez).
  if (finalizedButNotRefreshed) {
    return (
      <div className="border-t pt-4 mt-4" data-testid="payout-finalize-action">
        <div className="text-xs text-gray-500 mb-2">Ödeme</div>
        <p className="text-sm text-amber-800" role="status">
          Ödeme kesinleştirildi; ancak talep durumu yenilenemedi. Sayfayı yenileyin — talebi yeniden kesinleştirmeyin veya yeni talep açmayın.
        </p>
      </div>
    );
  }

  const intent = isPayoutIntent(detail.savedIntent) ? detail.savedIntent : null;
  const visible =
    detail.actionCode === PAYOUT_ACTION_CODE &&
    detail.status === "APPROVED" &&
    detail.executionStatus !== "SUCCEEDED" &&
    currentUserId !== null &&
    detail.approverUserId === currentUserId &&
    intent !== null;
  if (!visible || !intent) return null;

  const finalize = async () => {
    if (inFlight.current) return; // double-submit koruması
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      try {
        await clientAccountingApi.finalizePayout(detail.id, {
          caseId: intent.caseId,
          caseClientId: intent.caseClientId,
          amount: intent.amount,
          currency: intent.currency,
          note: intent.note ?? undefined,
          idempotencyKey: intent.idempotencyKey,
        });
      } catch (e: any) {
        setError(e?.message || "Kesinleştirme başarısız oldu.");
        return;
      }
      // Buradan sonra ödeme YAPILMIŞTIR.
      for (const key of ACCOUNTING_QUERY_KEYS) queryClient?.invalidateQueries({ queryKey: [key] });
      try {
        onFinalized(await officeApprovalApi.getDetail(detail.id));
      } catch {
        setFinalizedButNotRefreshed(true);
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="border-t pt-4 mt-4" data-testid="payout-finalize-action">
      <div className="text-xs text-gray-500 mb-2">Ödeme</div>
      <p className="text-sm text-gray-600 mb-2">
        Talep onaylandı; ödeme henüz kesinleştirilmedi. Kesinleştirince ödeme kaydı oluşur.
      </p>
      {error && (
        <div className="mb-2 text-sm text-red-600" role="alert">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={finalize}
        disabled={submitting}
        className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50"
      >
        {submitting ? "Kesinleştiriliyor..." : "Kesinleştir"}
      </button>
    </div>
  );
}
