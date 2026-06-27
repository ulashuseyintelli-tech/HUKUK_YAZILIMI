"use client";

// K1-7-4: Personel Erişimi — admin self-service login-davet ekranı.
// Admin e-posta + ad/soyad + rol girer → [Davet Gönder] → backend pending User + UserInvite
// oluşturur ve parola-belirleme e-postasını OTOMATİK yollar (issue()). Personel kendi
// parolasını accept-invite sayfasında belirler. Ham token asla burada görünmez.
// Çift koruma: bu sayfa ADMIN değilse içerik göstermez; backend de JwtAuthGuard+AdminGuard
// + LOGIN_INVITE_PROVISIONING_ENABLED ile korur.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  UserPlus,
  Mail,
  RefreshCw,
  Ban,
  Check,
  Loader2,
  ShieldAlert,
  Send,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

interface InviteRow {
  inviteId: string;
  userId: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  consumed: boolean;
  revoked: boolean;
}

type Tone = "amber" | "green" | "gray" | "red";

function inviteStatus(i: InviteRow): { label: string; tone: Tone } {
  if (i.revoked) return { label: "İptal edildi", tone: "red" };
  if (i.consumed) return { label: "Kabul edildi", tone: "green" };
  if (new Date(i.expiresAt).getTime() < Date.now()) return { label: "Süresi doldu", tone: "gray" };
  return { label: "Bekliyor", tone: "amber" };
}

const TONE_CLASS: Record<Tone, string> = {
  amber: "bg-amber-100 text-amber-700",
  green: "bg-green-100 text-green-700",
  gray: "bg-gray-100 text-gray-600",
  red: "bg-red-100 text-red-700",
};

const ROLE_OPTIONS = [
  { value: "USER", label: "Kullanıcı (standart)" },
  { value: "VIEWER", label: "Görüntüleyici" },
  { value: "ADMIN", label: "Yönetici (admin)" },
];

function fmt(d: string): string {
  try {
    return new Date(d).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return d;
  }
}

export default function PersonelErisimPage() {
  const { user, loading: authLoading } = useAuth();

  const [form, setForm] = useState({ email: "", name: "", surname: "", role: "USER" });
  const [sending, setSending] = useState(false);
  const [rows, setRows] = useState<InviteRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isAdmin = user?.role === "ADMIN";

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      // status="all" → backend tüm davetleri döndürür (pending filtresi uygulamaz).
      const data = await api.listInvites("all");
      setRows(data as InviteRow[]);
    } catch (err: any) {
      setListError(err?.body?.message || err?.message || "Davetler yüklenemedi.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadList();
  }, [isAdmin, loadList]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const email = form.email.trim();
    const name = form.name.trim();
    if (!email || !name) {
      setFormError("E-posta ve ad zorunludur.");
      return;
    }
    setSending(true);
    try {
      const res = await api.createInvite({
        email,
        name,
        surname: form.surname.trim() || undefined,
        role: form.role,
      });
      flash(`Davet gönderildi: ${res.email} — parola belirleme e-postası yollandı.`);
      setForm({ email: "", name: "", surname: "", role: "USER" });
      await loadList();
    } catch (err: any) {
      setFormError(err?.body?.message || err?.message || "Davet gönderilemedi.");
    } finally {
      setSending(false);
    }
  };

  const handleResend = async (id: string) => {
    setBusyId(id);
    try {
      await api.resendInvite(id);
      flash("Davet yeniden gönderildi (yeni bağlantı; eski bağlantı geçersiz).");
      await loadList();
    } catch (err: any) {
      flash(err?.body?.message || err?.message || "Yeniden gönderilemedi.");
    } finally {
      setBusyId(null);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm("Bu daveti iptal etmek istediğinize emin misiniz? Bağlantı kullanılamaz olur.")) return;
    setBusyId(id);
    try {
      await api.revokeInvite(id);
      flash("Davet iptal edildi.");
      await loadList();
    } catch (err: any) {
      flash(err?.body?.message || err?.message || "İptal edilemedi.");
    } finally {
      setBusyId(null);
    }
  };

  const sorted = useMemo(
    () => [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [rows]
  );

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-16 rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <ShieldAlert className="h-8 w-8 text-amber-500 mx-auto mb-2" />
        <h2 className="font-semibold text-amber-800">Yetkiniz yok</h2>
        <p className="text-sm text-amber-700 mt-1">
          Personel erişim davetleri yalnızca yönetici (admin) tarafından yönetilebilir.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-6 space-y-6">
      {/* Başlık */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5">
          <UserPlus className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Personel Erişimi</h1>
          <p className="text-sm text-muted-foreground">
            Personele giriş daveti gönderin. Kişi e-postadaki bağlantıdan kendi parolasını belirler.
          </p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">
          <Check className="h-4 w-4 flex-shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Davet formu */}
      <form onSubmit={handleSend} className="rounded-xl border bg-white p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Send className="h-4 w-4 text-primary" />
          Yeni davet
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-gray-500">E-posta *</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="personel@buro.com"
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Rol</span>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-white"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Ad *</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Soyad</span>
            <input
              type="text"
              value={form.surname}
              onChange={(e) => setForm({ ...form, surname: e.target.value })}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            />
          </label>
        </div>

        {formError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            <Mail className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
            “Davet Gönder”e basınca parola-belirleme e-postası anında gider.
          </p>
          <button
            type="submit"
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Gönderiliyor…" : "Davet Gönder"}
          </button>
        </div>
      </form>

      {/* Davet listesi */}
      <div className="rounded-xl border bg-white">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-sm font-medium text-gray-700">Davetler</h2>
          <button
            onClick={loadList}
            disabled={listLoading}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${listLoading ? "animate-spin" : ""}`} />
            Yenile
          </button>
        </div>

        {listError ? (
          <div className="px-5 py-4 text-sm text-red-600">{listError}</div>
        ) : listLoading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Henüz davet yok. Yukarıdaki formdan ilk daveti gönderin.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr className="border-b">
                  <th className="text-left px-5 py-2 font-medium">E-posta</th>
                  <th className="text-left px-3 py-2 font-medium">Durum</th>
                  <th className="text-left px-3 py-2 font-medium">Gönderim</th>
                  <th className="text-left px-3 py-2 font-medium">Geçerlilik</th>
                  <th className="text-right px-5 py-2 font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((row) => {
                  const st = inviteStatus(row);
                  const canResend = !row.consumed;
                  const canRevoke = !row.consumed && !row.revoked;
                  const busy = busyId === row.inviteId;
                  return (
                    <tr key={row.inviteId} className="hover:bg-gray-50">
                      <td className="px-5 py-2.5">{row.email}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[11px] rounded-full px-2 py-0.5 ${TONE_CLASS[st.tone]}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs">{fmt(row.createdAt)}</td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs">{fmt(row.expiresAt)}</td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {canResend && (
                            <button
                              onClick={() => handleResend(row.inviteId)}
                              disabled={busy}
                              title="Yeniden gönder"
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                              Tekrar gönder
                            </button>
                          )}
                          {canRevoke && (
                            <button
                              onClick={() => handleRevoke(row.inviteId)}
                              disabled={busy}
                              title="İptal et"
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Ban className="h-3.5 w-3.5" />
                              İptal
                            </button>
                          )}
                          {!canResend && !canRevoke && <span className="text-xs text-gray-300">—</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
