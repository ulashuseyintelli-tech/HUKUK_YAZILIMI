"use client";

// F02-B-1 (owner kararı 29–30.10.2026; OK-34 / OD-08 B): kişi kartı içinde "Büro Geneli Görünüm İzinleri" bloğu — AVUKAT ve
// PERSONEL için ORTAK. Yalnız ADMIN görür/değiştirir (backend tx içinde güncel DB rolünü arar). İki AYRI anahtar:
// office.tasks.view_all (görevler) ve office.expenses.view_all (masraflar). Durumlar: varsayılan kapsam (grant yok) ·
// büro geneli (ALLOW) · açık ret (DENY; büro geneli verilse bile kapalı — DENY > ALLOW).
// Bu izinler MÜVEKKİL okuma ya da dosyaya bağlama yetkisi VERMEZ ve liste kapsamını henüz GENİŞLETMEZ: kapsam daraltması /
// etkinleştirme ayrı dilim ve ayrı yayın yetkisidir (G3: önce masraf, sonra görev). Otomatik toplu grant YOK — izin kişi
// başına bu ekrandan tanımlanır. Backend: GET/POST /office/view-all-permissions (+/revoke). Yeni endpoint dışında şema YOK.

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api, type WorkScopePermissionState, type WorkScopeResolution, type WorkScopeViewAllKey } from "@/lib/api";

const KEYS: Array<{ key: WorkScopeViewAllKey; label: string; hint: string }> = [
  { key: "office.tasks.view_all", label: "Görevler", hint: "Varsayılan: kendisine atanan / oluşturduğu görevler ve görevli olduğu dosyaların görevleri." },
  { key: "office.expenses.view_all", label: "Masraflar", hint: "Varsayılan: oluşturduğu / onayladığı masraflar ve görevli olduğu dosyaların masrafları." },
];

const EFFECT_LABEL: Record<WorkScopeResolution, string> = {
  NONE: "Varsayılan kapsam",
  ALLOW: "Büro geneli (tümünü görür)",
  DENY: "Açık ret (büro geneli kapalı)",
};

function fmt(d: string | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return d;
  }
}

export function WorkScopePermissionCard({
  personType,
  personId,
  formDirty,
}: {
  personType: "lawyer" | "staff";
  personId?: string;
  formDirty: boolean;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [state, setState] = useState<WorkScopePermissionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<WorkScopeViewAllKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAdmin || !personId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setState(await api.getWorkScopePermissions(personType, personId));
    } catch (e: unknown) {
      setState(null);
      setError((e as { body?: { message?: string }; message?: string })?.body?.message || (e as Error)?.message || "İzinler alınamadı");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, personId, personType]);

  useEffect(() => {
    void load();
  }, [load]);

  const change = async (key: WorkScopeViewAllKey, next: WorkScopeResolution) => {
    if (!personId) return;
    setBusyKey(key);
    setError(null);
    try {
      if (next === "NONE") await api.revokeWorkScopePermission({ personType, personId, key });
      else await api.setWorkScopePermission({ personType, personId, key, effect: next });
      setToast(`${KEYS.find((k) => k.key === key)?.label ?? key}: ${EFFECT_LABEL[next]}`);
      setTimeout(() => setToast(null), 3500);
      await load();
    } catch (e: unknown) {
      setError((e as { body?: { message?: string }; message?: string })?.body?.message || (e as Error)?.message || "İzin kaydedilemedi");
    } finally {
      setBusyKey(null);
    }
  };

  if (!isAdmin || !personId) return null;

  const disabledReason = formDirty
    ? "Önce formu kaydedin."
    : state && !state.linked
      ? "Bu kişinin giriş hesabı yok — önce davet gönderin."
      : null;

  return (
    <div className="mt-4 rounded-lg border bg-slate-50 p-3" data-testid="work-scope-permission-card">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Büro Geneli Görünüm İzinleri</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Görev ve masraf listelerinde büro genelini görme izni; ayrı ayrı verilir. Açık ret büro genelini kapatır.
            Müvekkil okuma ya da dosyaya bağlama yetkisi <strong>vermez</strong>.
          </p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="yükleniyor" />}
      </div>
      {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
      {toast && <p className="mt-2 text-xs text-green-700" role="status">{toast}</p>}
      {disabledReason && <p className="mt-2 text-[11px] text-amber-700" data-testid="work-scope-disabled-reason">{disabledReason}</p>}
      <div className="mt-2 space-y-2">
        {KEYS.map(({ key, label, hint }) => {
          const current = state?.permissions.find((p) => p.key === key);
          const value: WorkScopeResolution = current?.effect ?? "NONE";
          const disabled = loading || busyKey !== null || !!disabledReason || !state;
          return (
            <div key={key} className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium">{label}</div>
                <div className="text-[10px] text-muted-foreground">{hint}</div>
                {current?.validUntil && <div className="text-[10px] text-muted-foreground">Bitiş: {fmt(current.validUntil)}</div>}
              </div>
              <select
                aria-label={`${label} büro geneli görünüm izni`}
                data-testid={`work-scope-select-${key}`}
                className="text-xs border rounded px-2 py-1 bg-white disabled:opacity-50"
                value={value}
                disabled={disabled}
                onChange={(e) => void change(key, e.target.value as WorkScopeResolution)}
              >
                <option value="NONE">{EFFECT_LABEL.NONE}</option>
                <option value="ALLOW">{EFFECT_LABEL.ALLOW}</option>
                <option value="DENY">{EFFECT_LABEL.DENY}</option>
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
