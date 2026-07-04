"use client";

// Office Approval detay drawer'ı — okuma + karar (P4 Decision UI). ErrorLogDetailDrawer ile AYNI desen
// (sağdan kayan panel + <pre> JSON gösterimi + CopyButton). Karar aksiyonları PENDING taleplerde,
// savedIntent'in ALTINDA (approver gördüğünü onaylar) — OfficeApprovalDecisionActions bileşeni.
import { useEffect, useState } from "react";
import { officeApprovalApi, type OfficeApprovalSummary, type OfficeApprovalDetail } from "@/lib/api/office-approval";
import { relativeTime } from "@/lib/relative-time";
import { useAuth } from "@/lib/auth-context";
import { STATUS_LABELS } from "./status-labels";
import { OfficeApprovalDecisionActions } from "./OfficeApprovalDecisionActions";
import { ApprovalIntentSummary } from "./ApprovalIntentSummary";

interface Props {
  requestId: string | null;
  onClose: () => void;
  /** Bir karar kaydedildiğinde çağrılır (üst liste yenilemesi için). Drawer içeriği zaten yerinde güncellenir. */
  onDecided?: () => void;
}

function fmt(d?: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString("tr-TR");
  } catch {
    return String(d);
  }
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="mb-3">
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className={`text-sm break-words whitespace-pre-wrap ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function TimeField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="mb-3">
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className="text-sm" title={fmt(value)}>
        {value ? relativeTime(value) : "-"}
      </div>
    </div>
  );
}

export function OfficeApprovalDetailDrawer({ requestId, onClose, onDecided }: Props) {
  const [detail, setDetail] = useState<OfficeApprovalDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!requestId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    officeApprovalApi
      .getDetail(requestId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || "Detay yüklenemedi");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  if (!requestId) return null;

  const statusLabel = detail ? STATUS_LABELS[detail.status] ?? detail.status : "";

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label="Onay talebi detayı">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-xl bg-white h-full overflow-y-auto p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Onay Talebi Detayı</h2>
          <button type="button" onClick={onClose} aria-label="Kapat" className="text-gray-400 hover:text-gray-700">
            ✕
          </button>
        </div>

        {loading && <div className="p-4 text-center text-gray-500">Yükleniyor...</div>}
        {error && <div className="p-4 text-center text-red-600 text-sm">{error}</div>}

        {detail && !loading && !error && (
          <>
            <div className="flex items-center gap-2 mb-4 text-xs">
              <span className="px-2 py-0.5 rounded bg-gray-100">{statusLabel}</span>
              <span className="px-2 py-0.5 rounded bg-gray-100">{detail.executionStatus}</span>
              {detail.hasReplacement && (
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700">Değişiklikle onaylanmış</span>
              )}
            </div>

            <Field label="Aksiyon Kodu" value={detail.actionCode} mono />
            <Field label="Hedef Tür" value={detail.targetType} mono />
            <Field label="Hedef Referans" value={detail.targetRef} mono />
            <Field label="Talep Eden" value={detail.requesterUserId} mono />
            {detail.approverUserId && <Field label="Karar Veren" value={detail.approverUserId} mono />}
            {detail.reason && <Field label="Gerekçe" value={detail.reason} />}
            {detail.decisionNote && <Field label="Karar Notu" value={detail.decisionNote} />}

            <TimeField label="Oluşturulma" value={detail.createdAt} />
            <TimeField label="Karar Zamanı" value={detail.decidedAt} />
            <TimeField label="Yürütme Zamanı" value={detail.executedAt} />
            <TimeField label="Son Geçerlilik" value={detail.expiresAt} />

            {detail.financeVisibility?.applied && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Bazı mali alanlar görünürlük kuralı gereği maskelenmiştir ({detail.financeVisibility.level}).
              </div>
            )}

            <div className="border-t pt-4 mt-4">
              <ApprovalIntentSummary
                title="Kayıtlı Niyet (savedIntent)"
                actionCode={detail.actionCode}
                savedIntent={detail.savedIntent}
                context={{ financeVisibility: detail.financeVisibility }}
                copyAriaLabel="savedIntent kopyala"
              />
            </div>

            {detail.replacementSavedIntent != null && (
              <ApprovalIntentSummary
                title="Değiştirilmiş Niyet (replacementSavedIntent)"
                actionCode={detail.actionCode}
                savedIntent={detail.replacementSavedIntent}
                context={{ financeVisibility: detail.financeVisibility }}
                copyAriaLabel="replacementSavedIntent kopyala"
              />
            )}

            <OfficeApprovalDecisionActions
              detail={detail}
              currentUserId={user?.id ?? null}
              onDecided={(updated) => {
                setDetail(updated);
                onDecided?.();
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

// Liste satırından tıklanan özet, detay yüklenene kadar iskelet göstermek için kullanılabilir (opsiyonel prop).
export type { OfficeApprovalSummary };
