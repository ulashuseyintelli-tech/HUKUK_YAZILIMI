"use client";

// Müvekkile ödeme talebi (CLIENT_PAYOUT_POST) — karar sahibi için onay kutusu çekmecesinde "Kesinleştir".
// Önceden: onaylandıktan sonra çekmecede hiçbir eylem yoktu ve talep sahibinin sayfasında da kart yoktu → onaylanan talep
// kesinleştirilemeden kalıyordu. Görünürlük YALNIZ kolaylıktır, yetki DEĞİLDİR: yetki, durum (yalnız APPROVED), payload-drift,
// tutar / borç sınırı ve büro kapıları sunucudadır (POST /client-payouts/:id/finalize); sunucunun reddi olduğu gibi gösterilir.
// Düğme yalnız KAYITLI karar sahibine (detail.approverUserId) gösterilir: onay anında sunucu onun ödeme onayı yetkisini
// denetlemiştir; yetkisi sonradan alınmışsa kesinleştirme sunucuda 403 ile reddedilir.
import { useState } from "react";
import { officeApprovalApi, type OfficeApprovalDetail } from "@/lib/api/office-approval";
import { clientAccountingApi } from "@/lib/api/client-accounting";
import { isPayoutIntent } from "@/components/client-accounting/payout-intent";

const PAYOUT_ACTION_CODE = "CLIENT_PAYOUT_POST";

interface Props {
  detail: OfficeApprovalDetail;
  currentUserId: string | null;
  /** Kesinleştirme başarılı: güncel detay ile çağrılır (çekmece içeriği + liste yenileme). */
  onFinalized: (updated: OfficeApprovalDetail) => void;
}

export function PayoutFinalizeAction({ detail, currentUserId, onFinalized }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (submitting) return; // double-submit koruması
    setSubmitting(true);
    setError(null);
    try {
      await clientAccountingApi.finalizePayout(detail.id, {
        caseId: intent.caseId,
        caseClientId: intent.caseClientId,
        amount: intent.amount,
        currency: intent.currency,
        note: intent.note ?? undefined,
        idempotencyKey: intent.idempotencyKey,
      });
      onFinalized(await officeApprovalApi.getDetail(detail.id));
    } catch (e: any) {
      setError(e?.message || "Kesinleştirme başarısız oldu.");
    } finally {
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
