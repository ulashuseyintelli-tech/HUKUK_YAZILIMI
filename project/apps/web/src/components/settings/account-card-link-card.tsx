"use client";

// F02 K-A1 B-1 (owner kararı 31.10.2026; karar listesi R04 §B B-1 seçenek (b) "dar ürün ucu"): kişi kartı içinde "Giriş Hesabı Bağlama"
// bloğu — AVUKAT ve PERSONEL için ORTAK. Yalnız ADMIN görür / kullanır (backend: JwtAuthGuard + ViewerWriteDenyGuard + AdminGuard).
// Amaç (Paket A E-2): geçiş öncesi KARTSIZ AKTİF hesabı mevcut karta bağlamak; K-A1 kimlik bayrağı açılınca bu hesap duyarlı onaylarda
// 403 almaz (kartta geçerli TCKN varsa). Backend: GET /auth/account-card-links/unlinked-users (adaylar) + POST /auth/account-card-links.
// Kart zaten bir hesaba bağlıysa (personUserId) yalnız durum gösterir. Hesabın ad / soyad / rol / parola DEĞİŞMEZ; e-posta GÖNDERİLMEZ;
// yeni endpoint dışında şema / migration YOK; müvekkil okuma ya da dosyaya bağlama yetkisi VERMEZ.

import { useCallback, useEffect, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api, type AccountCardLinkResult, type UnlinkedAccountRow } from "@/lib/api";

export const ACCOUNT_CARD_LINK_TEXT = {
  title: "Giriş Hesabı Bağlama",
  hint: "Mevcut kartsız giriş hesabını bu kişi kartına bağlar (yalnız ADMIN). Hesabın ad, soyad, rol ve parolası değişmez; e-posta gönderilmez.",
  linked: "Bu karta bağlı bir giriş hesabı var.",
  empty: "Bağlanabilecek kartsız aktif hesap yok.",
  readyTrue: "Bağlandı. Kartta geçerli TCKN var: kişi kimliği kanıtı hazır.",
  readyFalse: "Bağlandı. Kartta geçerli TCKN YOK: kimlik kanıtı için kartın TCKN alanını doldurun.",
  dirty: "Önce formu kaydedin.",
  button: "Hesabı karta bağla",
  pending: "(bekleyen davet)",
} as const;

function errMessage(e: unknown, fallback: string): string {
  return (e as { body?: { message?: string }; message?: string })?.body?.message || (e as Error)?.message || fallback;
}

export function AccountCardLinkCard({
  personType,
  personId,
  personUserId,
  formDirty,
  onLinked,
}: {
  personType: "lawyer" | "staff";
  personId?: string;
  personUserId?: string | null;
  formDirty: boolean;
  onLinked?: (result: AccountCardLinkResult) => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [linkedUserId, setLinkedUserId] = useState<string | null>(personUserId ?? null);
  const [candidates, setCandidates] = useState<UnlinkedAccountRow[] | null>(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { setLinkedUserId(personUserId ?? null); }, [personUserId, personId]);

  const load = useCallback(async () => {
    if (!isAdmin || !personId || linkedUserId) return;
    setLoading(true);
    setError(null);
    try {
      setCandidates(await api.listUnlinkedAccounts());
    } catch (e: unknown) {
      setCandidates(null);
      setError(errMessage(e, "Hesap adayları alınamadı"));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, personId, linkedUserId]);

  useEffect(() => { void load(); }, [load]);

  const link = async () => {
    if (!personId || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.linkAccountToCard(
        personType === "lawyer" ? { userId: selected, lawyerId: personId } : { userId: selected, staffMemberId: personId },
      );
      setLinkedUserId(res.userId);
      setToast(res.identityProofReady ? ACCOUNT_CARD_LINK_TEXT.readyTrue : ACCOUNT_CARD_LINK_TEXT.readyFalse);
      onLinked?.(res);
    } catch (e: unknown) {
      setError(errMessage(e, "Hesap bağlanamadı"));
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin || !personId) return null;

  return (
    <div className="mt-4 rounded-lg border bg-slate-50 p-3" data-testid="account-card-link-card">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold flex items-center gap-1"><Link2 className="h-3.5 w-3.5" aria-hidden="true" />{ACCOUNT_CARD_LINK_TEXT.title}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{ACCOUNT_CARD_LINK_TEXT.hint}</p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="yükleniyor" />}
      </div>
      {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
      {toast && <p className="mt-2 text-xs text-green-700" role="status" data-testid="account-card-link-toast">{toast}</p>}
      {linkedUserId ? (
        <p className="mt-2 text-xs text-slate-700" data-testid="account-card-link-linked">{ACCOUNT_CARD_LINK_TEXT.linked}</p>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <select
            aria-label="Bağlanacak giriş hesabı"
            data-testid="account-card-link-select"
            className="text-xs border rounded px-2 py-1 bg-white disabled:opacity-50 flex-1"
            value={selected}
            disabled={loading || busy || formDirty || !candidates || candidates.length === 0}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">{candidates && candidates.length === 0 ? ACCOUNT_CARD_LINK_TEXT.empty : "Hesap seçin…"}</option>
            {(candidates ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.surname} {c.name} · {c.email} · {c.role}{c.pendingInvite ? ` ${ACCOUNT_CARD_LINK_TEXT.pending}` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid="account-card-link-button"
            className="text-xs px-2 py-1 rounded bg-primary text-white disabled:opacity-50"
            disabled={loading || busy || formDirty || !selected}
            onClick={() => void link()}
          >
            {busy ? "…" : ACCOUNT_CARD_LINK_TEXT.button}
          </button>
        </div>
      )}
      {formDirty && !linkedUserId && <p className="mt-2 text-[11px] text-amber-700" data-testid="account-card-link-disabled-reason">{ACCOUNT_CARD_LINK_TEXT.dirty}</p>}
    </div>
  );
}
