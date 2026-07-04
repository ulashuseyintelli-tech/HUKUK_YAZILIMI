"use client";

// P4 Decision UI — PENDING talep için karar aksiyonları (drawer altı bölümü).
// İlke: "approver gördüğünü onaylar" → aksiyonlar detail'de, savedIntent'in ALTINDA; liste satırından tek-tık onay YOK.
// Yetki backend'de otoriter (self-approval yasağı, approver-eligibility, requester-only cancel); burada yalnız
// backend davranışının görünürlük yansıması var: requester → geri çek, requester-olmayan görüntüleyici → karar
// (detail görünürlük kuralı gereği requester-olmayan görüntüleyici zaten eligible-approver'dır).
import { useState } from "react";
import { officeApprovalApi, type OfficeApprovalDetail } from "@/lib/api/office-approval";

type DecisionKind = "approve" | "reject" | "revision" | "approve-with-changes" | "cancel";

interface Props {
  detail: OfficeApprovalDetail;
  currentUserId: string | null;
  /** Karar başarıyla kaydedildiğinde güncel detail ile çağrılır (drawer içeriği + liste yenileme). */
  onDecided: (updated: OfficeApprovalDetail) => void;
}

const ACTION_LABELS: Record<DecisionKind, string> = {
  approve: "Onayla",
  reject: "Reddet",
  revision: "Revizyon İste",
  "approve-with-changes": "Değiştirerek Onayla",
  cancel: "Talebi Geri Çek",
};

/** Not alanı zorunlu mu? (backend DTO kuralının yansıması: reject/revision @MinLength(1)) */
const NOTE_REQUIRED: Record<DecisionKind, boolean> = {
  approve: false,
  reject: true,
  revision: true,
  "approve-with-changes": false,
  cancel: false,
};

function parseReplacementIntent(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function OfficeApprovalDecisionActions({ detail, currentUserId, onDecided }: Props) {
  const [activeAction, setActiveAction] = useState<DecisionKind | null>(null);
  const [note, setNote] = useState("");
  const [replacementJson, setReplacementJson] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (detail.status !== "PENDING_APPROVAL") return null;

  const isRequester = currentUserId !== null && currentUserId === detail.requesterUserId;

  const openAction = (kind: DecisionKind) => {
    setActiveAction(kind);
    setNote("");
    setError(null);
    if (kind === "approve-with-changes") {
      setReplacementJson(JSON.stringify(detail.savedIntent, null, 2));
    }
  };

  const closeAction = () => {
    if (submitting) return;
    setActiveAction(null);
    setError(null);
  };

  const submit = async () => {
    if (!activeAction || submitting) return; // double-submit koruması
    setError(null);

    let replacement: Record<string, unknown> = {};
    if (activeAction === "approve-with-changes") {
      const parsed = parseReplacementIntent(replacementJson);
      if (!parsed) {
        setError("Değiştirilmiş niyet geçerli bir JSON nesnesi olmalıdır.");
        return;
      }
      replacement = parsed;
    }

    setSubmitting(true);
    try {
      let updated: OfficeApprovalDetail;
      switch (activeAction) {
        case "approve":
          updated = await officeApprovalApi.approve(detail.id, note);
          break;
        case "reject":
          updated = await officeApprovalApi.reject(detail.id, note.trim());
          break;
        case "revision":
          updated = await officeApprovalApi.requestRevision(detail.id, note.trim());
          break;
        case "approve-with-changes":
          updated = await officeApprovalApi.approveWithChanges(detail.id, replacement, note);
          break;
        case "cancel":
          updated = await officeApprovalApi.cancel(detail.id);
          break;
      }
      setActiveAction(null);
      onDecided(updated);
    } catch (e: any) {
      setError(e?.message || "İşlem başarısız oldu");
    } finally {
      setSubmitting(false);
    }
  };

  const noteMissing = activeAction !== null && NOTE_REQUIRED[activeAction] && note.trim().length === 0;

  return (
    <div className="border-t pt-4 mt-4" data-testid="decision-actions">
      <div className="text-xs text-gray-500 mb-2">Karar</div>

      {activeAction === null ? (
        <div className="flex flex-wrap gap-2">
          {!isRequester && (
            <>
              <button
                type="button"
                onClick={() => openAction("approve")}
                className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm"
              >
                Onayla
              </button>
              <button
                type="button"
                onClick={() => openAction("approve-with-changes")}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm"
              >
                Değiştirerek Onayla
              </button>
              <button
                type="button"
                onClick={() => openAction("revision")}
                className="px-3 py-2 bg-amber-500 text-white rounded-lg text-sm"
              >
                Revizyon İste
              </button>
              <button
                type="button"
                onClick={() => openAction("reject")}
                className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm"
              >
                Reddet
              </button>
            </>
          )}
          {isRequester && (
            <button
              type="button"
              onClick={() => openAction("cancel")}
              className="px-3 py-2 bg-gray-600 text-white rounded-lg text-sm"
            >
              Talebi Geri Çek
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border p-3 bg-gray-50">
          <div className="text-sm font-medium mb-2">{ACTION_LABELS[activeAction]}</div>

          {activeAction === "cancel" && (
            <div className="text-sm text-gray-600 mb-2">Bu talebi geri çekmek istediğinize emin misiniz?</div>
          )}

          {activeAction === "approve-with-changes" && (
            <div className="mb-2">
              <label className="text-xs text-gray-500 block mb-1" htmlFor="oa-replacement-json">
                Değiştirilmiş Niyet (JSON) — orijinal niyet silinmez, değişiklik ayrı iz bırakır
              </label>
              <textarea
                id="oa-replacement-json"
                value={replacementJson}
                onChange={(e) => setReplacementJson(e.target.value)}
                rows={8}
                disabled={submitting}
                className="w-full border rounded-lg p-2 text-xs font-mono"
              />
            </div>
          )}

          {activeAction !== "cancel" && (
            <div className="mb-2">
              <label className="text-xs text-gray-500 block mb-1" htmlFor="oa-decision-note">
                {activeAction === "reject"
                  ? "Reddetme Gerekçesi (zorunlu)"
                  : activeAction === "revision"
                    ? "Revizyon Notu (zorunlu)"
                    : "Karar Notu (opsiyonel)"}
              </label>
              <textarea
                id="oa-decision-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                disabled={submitting}
                className="w-full border rounded-lg p-2 text-sm"
              />
            </div>
          )}

          {error && (
            <div className="mb-2 text-sm text-red-600" role="alert">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={submitting || noteMissing}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
            >
              {submitting ? "Kaydediliyor..." : ACTION_LABELS[activeAction]}
            </button>
            <button
              type="button"
              onClick={closeAction}
              disabled={submitting}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
