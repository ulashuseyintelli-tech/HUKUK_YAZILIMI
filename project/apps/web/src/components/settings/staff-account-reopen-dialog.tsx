"use client";

// O-5b (owner 05.11.2026, A politikası): yeniden etkinleştirilmiş personelin KAPALI giriş hesabını açma onayı.
// Açılışta incelemeyi okur (GET /staff/:id/account-reopen-review); onaydan önce rol, oturum / parola / sıfırlama etkisi ve
// F02 büro geneli ALLOW izinleri gösterilir. Varsayılan: hiçbir izin korunmaz (işaretlenmeyen sona erer). DENY değişmez.
// "Vazgeç" hiçbir yazım isteği göndermez. İnceleme bu arada değiştiyse sunucu 409 döner; yeniden inceleme ister, otomatik
// yeniden deneme YOK. Yetki ve yazım sunucudadır (F01 + güncel ADMIN, tek transaction).

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  accountReopenResultMessage,
  blockedReasonMessage,
  buildStaffAccountReopenPayload,
  classifyStaffAccountReopenFailure,
  formatGrantDate,
  grantLabel,
  readStaffAccountReopenReview,
  reopenConsequences,
  type StaffAccountReopenReview,
} from "@/lib/staff-account-reopen";

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; review: StaffAccountReopenReview }
  | { kind: "done"; message: string };

export function StaffAccountReopenDialog({
  staffId,
  staffName,
  onClose,
  onDone,
}: {
  staffId: string;
  staffName: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [contactKeep, setContactKeep] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; refresh: boolean } | null>(null);

  const load = useCallback(async () => {
    setPhase({ kind: "loading" });
    setKeep(new Set());
    setContactKeep(new Set());
    setFailure(null);
    try {
      const review = readStaffAccountReopenReview(await api.get(`/staff/${staffId}/account-reopen-review`));
      setPhase(review ? { kind: "ready", review } : { kind: "error", message: "Giriş hesabı incelemesi okunamadı. Hiçbir değişiklik yapılmadı." });
    } catch (e: unknown) {
      setPhase({ kind: "error", message: classifyStaffAccountReopenFailure(e).message });
    }
  }, [staffId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string, on: boolean) =>
    setKeep((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const submit = async () => {
    if (busy || phase.kind !== "ready" || !phase.review.reopenable) return;
    setBusy(true);
    setFailure(null);
    try {
      const res = await api.post(`/staff/${staffId}/account-reopen`, buildStaffAccountReopenPayload(phase.review, keep, contactKeep));
      setPhase({ kind: "done", message: accountReopenResultMessage(res) });
      onDone?.();
    } catch (e: unknown) {
      setFailure(classifyStaffAccountReopenFailure(e));
    } finally {
      setBusy(false);
    }
  };

  const review = phase.kind === "ready" ? phase.review : null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="staff-account-reopen-title"
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-full overflow-y-auto p-5 text-sm"
      >
        <h3 id="staff-account-reopen-title" className="text-base font-semibold text-gray-900 mb-2">
          Giriş erişimini gözden geçir
        </h3>

        {phase.kind === "loading" && <p className="text-gray-600">İnceleme okunuyor…</p>}
        {phase.kind === "error" && <p role="alert" className="text-red-700">{phase.message}</p>}
        {phase.kind === "done" && <p role="status" className="text-emerald-700">{phase.message}</p>}

        {review && !review.reopenable && <p className="text-gray-700">{blockedReasonMessage(review.reason)}</p>}

        {review && review.reopenable && (
          <>
            <p className="text-gray-700">
              <b>{staffName}</b> adlı personelin kartı etkin, bağlı giriş hesabı <b>kapalı</b>. Onaylarsanız hesap açılır.
            </p>
            <ul aria-label="Hesap açmanın etkisi" className="mt-3 list-disc pl-5 space-y-1 text-gray-800">
              {reopenConsequences(review).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <fieldset className="mt-3 border-t pt-3" disabled={busy}>
              <legend className="font-medium mb-2">Korunacak büro geneli görünüm izinleri</legend>
              {review.allowGrants.length === 0 ? (
                <p className="text-gray-500">Bu hesapta büro geneli görünüm izni yok.</p>
              ) : (
                <div className="space-y-2">
                  {review.allowGrants.map((g) => (
                    <label key={g.id} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        aria-label={`${grantLabel(g.permissionKey)} iznini koru`}
                        checked={keep.has(g.id)}
                        onChange={(e) => toggle(g.id, e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block">{grantLabel(g.permissionKey)}</span>
                        <span className="block text-[11px] text-gray-500">
                          {g.startsInFuture ? `İleri tarihli: ${formatGrantDate(g.validFrom)} tarihinde başlar` : "Şu an geçerli"}
                          {g.validUntil ? ` · bitiş ${formatGrantDate(g.validUntil)}` : " · süresiz"}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            {review.contactAllowGrants !== undefined && <fieldset className="mt-3 border-t pt-3" disabled={busy}>
              <legend className="font-medium mb-2">Korunacak iletişim yazma izinleri (G1/G2)</legend>
              {review.contactAllowGrants.length === 0 ? <p className="text-gray-500">Bu hesapta iletişim yazma izni yok.</p>
                : review.contactAllowGrants.map(g => <label key={g.id} className="flex items-start gap-2 mb-2">
                  <input type="checkbox" aria-label={`${grantLabel(g.permissionKey)} iznini koru`} checked={contactKeep.has(g.id)}
                    disabled={g.validUntil === null || review.account?.role === 'VIEWER'}
                    onChange={e => setContactKeep(prev => { const next = new Set(prev); if (e.target.checked) next.add(g.id); else next.delete(g.id); return next; })} />
                  <span>{grantLabel(g.permissionKey)}<span className="block text-[11px] text-gray-500">
                    {g.startsInFuture ? `İleri tarihli: ${formatGrantDate(g.validFrom)}` : 'Şu an geçerli'} · bitiş {g.validUntil ? formatGrantDate(g.validUntil) : 'tanımsız; korunamaz'}
                  </span></span>
                </label>)}
            </fieldset>}
          </>
        )}

        {failure && (
          <p role="alert" className="mt-3 text-red-700">
            {failure.message}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {review?.reopenable && phase.kind === "ready" && !failure?.refresh && (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "Kaydediliyor…" : "Giriş hesabını aç"}
            </button>
          )}
          {failure?.refresh && (
            <button
              type="button"
              onClick={() => void load()}
              className="w-full px-3 py-2 rounded-lg bg-amber-100 text-amber-900 hover:bg-amber-200"
            >
              İncelemeyi yenile
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            {phase.kind === "done" || (review && !review.reopenable) || phase.kind === "error" ? "Kapat" : "Vazgeç"}
          </button>
        </div>
      </div>
    </div>
  );
}
