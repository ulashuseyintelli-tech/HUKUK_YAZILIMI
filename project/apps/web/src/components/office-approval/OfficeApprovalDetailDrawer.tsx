"use client";

// Office Approval detay drawer'ı — okuma + karar (P4 Decision UI). ErrorLogDetailDrawer ile AYNI desen
// (sağdan kayan panel + <pre> JSON gösterimi + CopyButton). Karar aksiyonları PENDING taleplerde,
// savedIntent'in ALTINDA (approver gördüğünü onaylar) — OfficeApprovalDecisionActions bileşeni.
import { useEffect, useState } from "react";
import Link from "next/link";
import { officeApprovalApi, type OfficeApprovalSummary, type OfficeApprovalDetail } from "@/lib/api/office-approval";
import { relativeTime } from "@/lib/relative-time";
import { useAuth } from "@/lib/auth-context";
import { STATUS_LABELS } from "./status-labels";
import { OfficeApprovalDecisionActions } from "./OfficeApprovalDecisionActions";
import { PayoutFinalizeAction } from "./PayoutFinalizeAction";
import { ApprovalIntentSummary } from "./ApprovalIntentSummary";
import { actionLabel, executionStatusLabel, reasonLabel, targetTypeLabel } from "./labels";
import { humanizeClaimItemName } from "@/components/claim-item/claim-item-labels";

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

function personValue(name: string | null | undefined, context: OfficeApprovalDetail["displayContext"]): string {
  if (name) return name;
  return context ? "Adı bulunamadı" : "Ad bilgisi alınamadı";
}

/**
 * Dosya satırı — yalnız sunucunun GÜNCEL bağlamından. Dosya numarası ve bağlantı yalnız aktörün görme kapsamındaysa;
 * aksi hâlde neden açıkça yazılır, kimlik / numara gösterilmez.
 */
function CaseContextField({ detail }: { detail: OfficeApprovalDetail }) {
  const context = detail.displayContext;
  if (!context) {
    return <Field label="Dosya" value="Dosya bilgisi alınamadı" />;
  }
  const caseContext = context.case;
  if (caseContext.status === "NOT_APPLICABLE") return null;
  if (caseContext.status === "NOT_FOUND") {
    return <Field label="Dosya" value="Hedef kayıt bulunamadı (silinmiş ya da erişilemiyor)" />;
  }
  if (caseContext.status === "NOT_VISIBLE" || !caseContext.caseId) {
    return <Field label="Dosya" value="Bu dosyayı görme yetkiniz yok; dosya bilgisi gösterilmiyor" />;
  }
  return (
    <>
      <div className="mb-3">
        <div className="text-xs text-gray-500 mb-0.5">Dosya (güncel kayıt)</div>
        <div className="text-sm">
          <Link
            href={`/cases/${encodeURIComponent(caseContext.caseId)}`}
            className="text-blue-700 underline"
            data-testid="approval-case-link"
          >
            {caseContext.fileNumber || "Dosya numarası yok"}
          </Link>
        </div>
      </div>
      {/* Açıklaması boş kalemde sunucu ham tür kodunu verir (ör. "PRINCIPAL"); gösterimde Türkçe ada çevrilir. */}
      {caseContext.claimItemLabel && <Field label="Kalem (güncel ad)" value={humanizeClaimItemName(caseContext.claimItemLabel)} />}
      {caseContext.intentCaseMatches === false && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          Kayıtlı niyetteki dosya ile hedefin güncel dosyası uyuşmuyor; talebi onaylamadan önce inceleyin.
        </div>
      )}
    </>
  );
}

function TechnicalDetails({ detail }: { detail: OfficeApprovalDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs text-gray-500 underline" aria-expanded={open}>
        {open ? "Teknik ayrıntıyı gizle" : "Teknik ayrıntı (kodlar ve kimlikler)"}
      </button>
      {open && (
        <div className="mt-2 rounded border bg-gray-50 p-3" data-testid="approval-technical-details">
          <Field label="İşlem kodu" value={detail.actionCode} mono />
          <Field label="Hedef türü kodu" value={detail.targetType} mono />
          <Field label="Hedef kimliği" value={detail.targetRef} mono />
          <Field label="Yürütme durumu kodu" value={detail.executionStatus} mono />
          <Field label="Talep eden kullanıcı kimliği" value={detail.requesterUserId} mono />
          {detail.approverUserId && <Field label="Karar veren kullanıcı kimliği" value={detail.approverUserId} mono />}
        </div>
      )}
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

  // Escape ile kapanır; üstte başka kalıcı pencere varsa ona bırakır (owner 18.11.2026, U-8).
  useEffect(() => {
    if (!requestId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelectorAll('[aria-modal="true"]').length > 1) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestId, onClose]);

  if (!requestId) return null;

  const statusLabel = detail ? STATUS_LABELS[detail.status] ?? detail.status : "";

  return (
    // Yerleşim (owner 18.11.2026, P02 kullanılabilirlik notu U-8): masaüstünde geniş; talep bilgileri ve "talep edilen
    // değişiklik" yan yana; karar düğmeleri altta sabit. Küçük ekranda tek sütun. İçerik ve kurallar AYNEN.
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Onay talebi detayı">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-xl lg:max-w-4xl bg-white h-full overflow-y-auto p-6 shadow-xl">
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
              <span className="px-2 py-0.5 rounded bg-gray-100">{executionStatusLabel(detail.executionStatus)}</span>
              {detail.hasReplacement && (
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700">Değişiklikle onaylanmış</span>
              )}
            </div>

            <div data-testid="approval-detail-columns" className="lg:grid lg:grid-cols-2 lg:gap-6">
            <div className="min-w-0" data-testid="approval-detail-facts">
            <Field label="İşlem" value={actionLabel(detail.actionCode, detail.savedIntent)} />
            <Field label="Hedef" value={targetTypeLabel(detail.targetType)} />
            <CaseContextField detail={detail} />
            <Field label="Talep eden" value={personValue(detail.displayContext?.requesterName, detail.displayContext)} />
            {detail.approverUserId && (
              <Field label="Karar veren" value={personValue(detail.displayContext?.approverName, detail.displayContext)} />
            )}
            {detail.reason && <Field label="Gerekçe" value={reasonLabel(detail.reason)} />}
            {detail.decisionNote && <Field label="Karar Notu" value={detail.decisionNote} />}

            <TimeField label="Oluşturulma" value={detail.createdAt} />
            <TimeField label="Karar Zamanı" value={detail.decidedAt} />
            <TimeField label="Yürütme Zamanı" value={detail.executedAt} />
            <TimeField label="Son Geçerlilik" value={detail.payoutExecution ? detail.payoutExecution.validUntil : detail.expiresAt} />

            <TechnicalDetails detail={detail} />

            {detail.financeVisibility?.applied && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Bazı mali alanlar görünürlük kuralı gereği maskelenmiştir ({detail.financeVisibility.level}).
              </div>
            )}
            </div>

            <div className="min-w-0 lg:border-l lg:pl-6" data-testid="approval-detail-intent">
            <div className="border-t pt-4 mt-4 lg:border-t-0 lg:pt-0 lg:mt-0">
              <ApprovalIntentSummary
                title="Talep edilen değişiklik (talep anındaki kayıt)"
                actionCode={detail.actionCode}
                savedIntent={detail.savedIntent}
                context={{ financeVisibility: detail.financeVisibility }}
                copyAriaLabel="savedIntent kopyala"
              />
            </div>

            {detail.replacementSavedIntent != null && (
              <ApprovalIntentSummary
                title="Onaylayanın değiştirdiği niyet (değişiklikle onay)"
                actionCode={detail.actionCode}
                savedIntent={detail.replacementSavedIntent}
                context={{ financeVisibility: detail.financeVisibility }}
                copyAriaLabel="replacementSavedIntent kopyala"
              />
            )}
            </div>
            </div>

            <div
              data-testid="approval-detail-actions"
              className="sticky bottom-0 -mx-6 -mb-6 mt-4 border-t bg-white px-6 py-3 empty:hidden"
            >
            <OfficeApprovalDecisionActions
              detail={detail}
              currentUserId={user?.id ?? null}
              onDecided={(updated) => {
                setDetail(updated);
                onDecided?.();
              }}
            />

            <PayoutFinalizeAction
              detail={detail}
              currentUserId={user?.id ?? null}
              onFinalized={(updated) => {
                setDetail(updated);
                onDecided?.();
              }}
            />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Liste satırından tıklanan özet, detay yüklenene kadar iskelet göstermek için kullanılabilir (opsiyonel prop).
export type { OfficeApprovalSummary };
