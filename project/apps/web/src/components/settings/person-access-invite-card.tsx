"use client";

// K1-7-4B: Kişi kartı içinde "Giriş Erişimi" bloğu — AVUKAT ve PERSONEL için ORTAK davet componenti.
// Davet aksiyonu YALNIZ kaydedilmiş kişi bilgisinden üretilir (form dirty ise buton disabled).
// Sadece ADMIN görür. Backend /auth/invites (createInvite/listInvites/resendInvite/revokeInvite)
// kullanılır — yeni endpoint/migration/şema YOK. Profil link (Lawyer.userId/StaffMember.userId) burada YAZILMAZ.
//
// Eşleştirme notu: backend list() e-postayı MASKELİ döndürür (redactEmail). Bu yüzden eşleştirme,
// aynı redaction client tarafında uygulanıp `redactEmail(normalize(email)) === invite.email` ile yapılır.
// Redaction lossy olduğundan teorik collision olabilir (aynı ilk-2-harf + domain) — küçük büroda pratikte nadir.

import { useCallback, useEffect, useState } from "react";
import { Mail, RefreshCw, Ban, Check, Loader2, Send } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

interface InviteRow {
  inviteId: string;
  userId: string;
  email: string; // maskeli
  expiresAt: string;
  createdAt: string;
  consumed: boolean;
  revoked: boolean;
}

// Backend user-invite-token.util.ts redactEmail ile AYNI mantık olmalı (eşleştirme buna dayanır).
function redactEmail(email: string): string {
  const s = String(email ?? "");
  const at = s.indexOf("@");
  if (at <= 0) return "***";
  const head = s.slice(0, Math.min(2, at));
  return `${head}***${s.slice(at)}`;
}

function normalizeEmail(e: string | null | undefined): string {
  return String(e ?? "").trim().toLowerCase();
}

type Status = "none" | "pending" | "accepted" | "revoked" | "expired";

function deriveStatus(inv: InviteRow | null): Status {
  if (!inv) return "none";
  if (inv.revoked) return "revoked";
  if (inv.consumed) return "accepted";
  if (new Date(inv.expiresAt).getTime() < Date.now()) return "expired";
  return "pending";
}

function fmt(d?: string): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return d;
  }
}

const STATUS_LABEL: Record<Status, string> = {
  none: "Davet gönderilmedi",
  pending: "Cevap bekleniyor",
  accepted: "Kabul edildi",
  revoked: "İptal edildi",
  expired: "Süresi doldu",
};

const STATUS_TONE: Record<Status, string> = {
  none: "bg-gray-100 text-gray-600",
  pending: "bg-amber-100 text-amber-700",
  accepted: "bg-green-100 text-green-700",
  revoked: "bg-red-100 text-red-700",
  expired: "bg-gray-100 text-gray-600",
};

export function PersonAccessInviteCard({
  personType,
  personId,
  firstName,
  lastName,
  email,
  formDirty,
}: {
  personType: "lawyer" | "staff";
  personId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  formDirty: boolean;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ambiguous, setAmbiguous] = useState(false); // aynı maskeye düşen >1 davet → mutasyon güvenliği

  const savedEmail = normalizeEmail(email);
  const hasEmail = savedEmail.length > 0;

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setError(null);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      if (!hasEmail) {
        setInvite(null);
        setAmbiguous(false);
        return;
      }
      const rows = (await api.listInvites("all")) as InviteRow[];
      const want = redactEmail(savedEmail);
      const matches = rows
        .filter((r) => r.email === want)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setInvite(matches[0] ?? null);
      // Maskeli e-posta lossy → aynı maskeye birden fazla davet düşerse hangi kişi olduğu KESİN değil.
      setAmbiguous(matches.length > 1);
    } catch (err: any) {
      setError(err?.body?.message || err?.message || "Davet durumu okunamadı.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, hasEmail, savedEmail]);

  // personId/email değişince (modal başka kişiye açılınca) yeniden yükle.
  useEffect(() => {
    load();
  }, [load, personId]);

  if (!isAdmin || !personId) return null;

  const status = deriveStatus(invite);

  // Davet GÖNDEREN aksiyonlar için ortak engel: e-posta yok veya kaydedilmemiş değişiklik var.
  const sendBlockedReason = !hasEmail
    ? "Giriş daveti için önce e-posta girin."
    : formDirty
      ? "Davet göndermek için önce kişi bilgilerini kaydedin."
      : null;
  const sendDisabled = busy || !!sendBlockedReason;

  const doCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createInvite({
        email: String(email ?? "").trim(),
        name: (firstName ?? "").trim(),
        surname: (lastName ?? "").trim() || undefined,
        role: "USER",
      });
      flash("Giriş daveti gönderildi — parola belirleme e-postası yollandı.");
      await load();
    } catch (err: any) {
      setError(err?.body?.message || err?.message || "Davet gönderilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const doResend = async () => {
    if (!invite) return;
    setBusy(true);
    setError(null);
    try {
      await api.resendInvite(invite.inviteId);
      flash("Davet yeniden gönderildi (yeni bağlantı; eski bağlantı geçersiz).");
      await load();
    } catch (err: any) {
      setError(err?.body?.message || err?.message || "Yeniden gönderilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const doRevoke = async () => {
    if (!invite) return;
    if (!window.confirm("Bu giriş davetini iptal etmek istediğinize emin misiniz? Bağlantı kullanılamaz olur.")) return;
    setBusy(true);
    setError(null);
    try {
      await api.revokeInvite(invite.inviteId);
      flash("Giriş daveti iptal edildi.");
      await load();
    } catch (err: any) {
      setError(err?.body?.message || err?.message || "İptal edilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const btnBase =
    "inline-flex items-center gap-1 rounded px-2.5 py-1 text-[12px] font-medium disabled:opacity-50 disabled:cursor-not-allowed";
  const spin = busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null;

  return (
    <div className="mt-1 rounded-lg border border-stone-200 bg-stone-50 p-3 text-[12px]">
      <div className="mb-2 flex items-center gap-2">
        <Mail className="h-3.5 w-3.5 text-stone-500" />
        <span className="font-semibold text-gray-700">Giriş Erişimi</span>
        {!loading && (
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${STATUS_TONE[status]}`}>
            {STATUS_LABEL[status]}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-1 text-stone-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Davet durumu yükleniyor…
        </div>
      ) : (
        <>
          {/* Durum + tarih satırları */}
          {status === "none" && (
            <p className="text-stone-600">Bu kişiye henüz giriş daveti gönderilmedi.</p>
          )}
          {status === "pending" && invite && (
            <div className="space-y-0.5 text-stone-600">
              <p>Gönderildi: {fmt(invite.createdAt)}</p>
              <p>Geçerlilik: {fmt(invite.expiresAt)}</p>
            </div>
          )}
          {status === "accepted" && invite && (
            <p className="text-stone-600">Kabul edildi (geçerlilik: {fmt(invite.expiresAt)}).</p>
          )}
          {status === "revoked" && (
            <p className="text-stone-600">Bu davet iptal edildi.</p>
          )}
          {status === "expired" && invite && (
            <p className="text-stone-600">Geçerlilik doldu: {fmt(invite.expiresAt)}.</p>
          )}

          {/* Aksiyon butonları */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {status === "none" && (
              <button
                type="button"
                onClick={doCreate}
                disabled={sendDisabled}
                className={`${btnBase} bg-primary text-white hover:bg-primary/90`}
              >
                {spin ?? <Send className="h-3.5 w-3.5" />}
                Giriş Daveti Gönder
              </button>
            )}
            {/* pending/expired/revoked → resend. revoke() User'ı SİLMEZ → issue() Conflict atar,
                bu yüzden revoked'da da yeni davet = resend (revokedAt:null + yeni token). */}
            {(status === "pending" || status === "expired" || status === "revoked") && (
              <button
                type="button"
                onClick={doResend}
                disabled={sendDisabled || ambiguous}
                className={`${btnBase} ${
                  status === "revoked"
                    ? "bg-primary text-white hover:bg-primary/90"
                    : "border border-blue-300 text-blue-700 hover:bg-blue-50"
                }`}
              >
                {spin ?? <RefreshCw className="h-3.5 w-3.5" />}
                {status === "revoked" ? "Yeni Davet Gönder" : "Tekrar Gönder"}
              </button>
            )}
            {status === "pending" && (
              <button
                type="button"
                onClick={doRevoke}
                disabled={busy || ambiguous}
                className={`${btnBase} border border-red-300 text-red-700 hover:bg-red-50`}
              >
                <Ban className="h-3.5 w-3.5" />
                İptal Et
              </button>
            )}
          </div>

          {/* Belirsiz eşleşme: aynı maskeye birden fazla davet → yanlış kişiyi mutasyondan kaçın. */}
          {ambiguous && (
            <p className="mt-1.5 text-[11px] text-amber-600">
              Aynı e-posta maskesine sahip birden fazla davet bulundu — kişi kesin ayırt edilemediği için
              gönder/iptal devre dışı. (Profil bağlama gelince netleşecek.)
            </p>
          )}

          {/* Engel açıklaması (yalnız gönderen aksiyon varken) */}
          {sendBlockedReason && status !== "accepted" && (
            <p className="mt-1.5 text-[11px] text-amber-600">{sendBlockedReason}</p>
          )}

          {/* Toast / hata */}
          {toast && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-green-600">
              <Check className="h-3.5 w-3.5" /> {toast}
            </p>
          )}
          {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}
