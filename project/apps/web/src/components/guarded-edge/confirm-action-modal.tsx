"use client";

// P3-2B: Guarded-Edge confirm modal — generic. Backend zarfı CONFIRM_REQUIRED dönerse gösterilir.
// Teknik alanlar (token/hash/actionCode/traceId) KULLANICIYA GÖSTERİLMEZ; yalnız envelope.message (veya sade varsayılan).

import { ShieldCheck, Loader2 } from "lucide-react";
import type { GuardedEdgeOutcomeEnvelope } from "@/lib/guarded-edge";

export function ConfirmActionModal({
  envelope,
  busy = false,
  onConfirm,
  onCancel,
}: {
  envelope: GuardedEdgeOutcomeEnvelope;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const description = envelope.message?.trim() || "Bu işlem için ek onay gerekiyor.";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-sm mx-4 shadow-xl">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <h3 className="font-semibold text-gray-800">İşlem onayı gerekiyor</h3>
          </div>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Onayla
          </button>
        </div>
      </div>
    </div>
  );
}
