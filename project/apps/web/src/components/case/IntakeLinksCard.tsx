"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  IntakeLink,
  IntakeLinkStatus,
  IntakeFieldCategory,
} from "@/lib/api";

/**
 * Müvekkil Bilgi Formu Linki kartı (Faz 4.7 PR-B) — case detay sayfası.
 *
 * KAPSAM: yalnız link ÜRET / LİSTELE / İPTAL + üretim anında URL'i TEK sefer göster.
 * review / promote / field-approval / HYBRID adres YOK (ayrı PR-C/4.6c).
 *
 * Güvenlik: liste backend'den token/URL döndürmez → mevcut linkler tekrar
 * görüntülenemez (kart bunu kullanıcıya açıkça yazar). Tüm çağrılar authed
 * (lib/api.ts Bearer); tenant JWT'den, gövdede tenant taşınmaz.
 */

// Kategori → görünen etiket (PR-A public form ile aynı 9 kategori; statik, PII içermez).
const CATEGORY_LABELS: Record<IntakeFieldCategory, string> = {
  INCOME_SOURCE: "Gelir Kaynağı",
  COMMERCIAL_RELATION: "Ticari İlişki",
  FAMILY_CIRCLE: "Aile / Yakın Çevre",
  DIGITAL_FOOTPRINT: "Dijital İz (sosyal medya, web)",
  PAYMENT_HISTORY: "Tahsilat Geçmişi",
  STRATEGY: "Dosya Stratejisi",
  ADDRESS: "Adres",
  ASSET: "Varlık (araç, gayrimenkul vb.)",
  CONTACT: "İletişim (telefon, e-posta)",
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as IntakeFieldCategory[];

const STATUS_LABELS: Record<IntakeLinkStatus, string> = {
  ACTIVE: "Aktif",
  USED: "Kullanıldı",
  EXPIRED: "Süresi doldu",
  REVOKED: "İptal edildi",
};

const STATUS_CLASSES: Record<IntakeLinkStatus, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  USED: "bg-slate-100 text-slate-700",
  EXPIRED: "bg-amber-100 text-amber-800",
  REVOKED: "bg-red-100 text-red-700",
};

interface CaseClientLite {
  id: string;
  name: string;
  displayName?: string;
  isActive?: boolean;
}

function clientLabel(c: CaseClientLite): string {
  return c.displayName || c.name || "Müvekkil";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "süresiz";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("tr-TR");
}

/**
 * type=date ("YYYY-MM-DD") → seçilen günün YEREL sonu (23:59:59.999) → ISO.
 * Aksi halde new Date("YYYY-MM-DD") UTC gece-yarısı kabul edilir ve link yerel
 * kullanıcı için ~1 gün erken ölür (örn. İstanbul UTC+3 → günün 03:00'ünde).
 * Personelin "seçtiğim günün sonuna kadar geçerli" beklentisini karşılar.
 */
function endOfDayIso(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

export default function IntakeLinksCard({
  caseId,
  client,
  caseClients,
}: {
  caseId: string;
  client?: CaseClientLite;
  caseClients?: { client?: CaseClientLite }[];
}) {
  // Dosyanın benzersiz + aktif müvekkilleri (RFA-010: pasif olanlar dışlanır).
  const clientOptions = useMemo(() => {
    const map = new Map<string, CaseClientLite>();
    if (client) map.set(client.id, client);
    (caseClients ?? []).forEach((cc) => {
      if (cc.client) map.set(cc.client.id, cc.client);
    });
    return Array.from(map.values()).filter((c) => c.isActive !== false);
  }, [client, caseClients]);

  const [links, setLinks] = useState<IntakeLink[] | null>(null);
  const [listError, setListError] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  // Form alanları
  const [clientId, setClientId] = useState("");
  const [scope, setScope] = useState<Set<IntakeFieldCategory>>(new Set());
  const [expiresAt, setExpiresAt] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  // Üretim sonrası TEK seferlik URL gösterimi
  const [created, setCreated] = useState<{ url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState("");

  const loadLinks = useCallback(async () => {
    setListError("");
    try {
      const data = await api.listIntakeLinks(caseId);
      setLinks(data);
    } catch {
      setLinks([]);
      setListError("Linkler yüklenemedi.");
    }
  }, [caseId]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  // Form açılınca varsayılan müvekkil = ilk aktif müvekkil
  useEffect(() => {
    if (formOpen && !clientId && clientOptions.length > 0) {
      setClientId(clientOptions[0].id);
    }
  }, [formOpen, clientId, clientOptions]);

  const toggleCategory = (cat: IntakeFieldCategory) => {
    setScope((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const resetForm = () => {
    setScope(new Set());
    setExpiresAt("");
    setMaxUses("");
    setFormError("");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!clientId) {
      setFormError("Lütfen bir müvekkil seçin.");
      return;
    }
    if (scope.size === 0) {
      setFormError("Lütfen en az bir kategori seçin.");
      return;
    }
    const parsedMax = maxUses.trim() ? parseInt(maxUses, 10) : undefined;
    if (parsedMax !== undefined && (!Number.isInteger(parsedMax) || parsedMax < 1)) {
      setFormError("Maksimum kullanım 1 veya daha büyük olmalı.");
      return;
    }
    setCreating(true);
    try {
      const res = await api.createIntakeLink(caseId, {
        clientId,
        scope: Array.from(scope),
        expiresAt: expiresAt ? endOfDayIso(expiresAt) : undefined,
        maxUses: parsedMax,
      });
      setCreated({ url: res.intakeUrl });
      setCopied(false);
      setFormOpen(false);
      resetForm();
      await loadLinks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Link üretilemedi.";
      setFormError(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    setRevokeError("");
    try {
      await api.revokeIntakeLink(id);
      await loadLinks(); // yalnız BAŞARIDA yenile
    } catch (err) {
      // Sessiz kalma: personel "iptal edildi" sanmasın. Liste yenilenmez →
      // link gerçekte ACTIVE kalır ve listede öyle görünür (yanlış güven yok).
      const msg = err instanceof Error && err.message ? err.message : "Link iptal edilemedi.";
      setRevokeError(msg);
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-semibold text-slate-800">Müvekkil Bilgi Formu Linki</h3>
        <button
          type="button"
          onClick={() => {
            setFormOpen((v) => !v);
            setFormError("");
          }}
          className="text-sm font-medium text-slate-700 hover:text-slate-900"
        >
          {formOpen ? "Kapat" : "+ Yeni bilgi formu linki"}
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Müvekkile gönderilen güvenli link ile dış bilgi formu doldurulur. Link üretildiğinde
        müvekkile e-posta ile de gönderilir.
      </p>

      {/* Üretim sonrası TEK seferlik URL kutusu */}
      {created && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-sm font-medium text-green-800 mb-1">Link üretildi</p>
          <p className="text-xs text-green-700 mb-2">
            Bu link yalnız şimdi gösterilir; müvekkile e-posta ile de gönderildi. Kopyalayıp saklayın.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white border border-green-200 px-2 py-1 text-xs text-slate-700">
              {created.url}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-md bg-green-700 text-white px-3 py-1 text-xs font-medium hover:bg-green-800"
            >
              {copied ? "Kopyalandı" : "Kopyala"}
            </button>
          </div>
        </div>
      )}

      {/* Üretim formu */}
      {formOpen && (
        <form onSubmit={handleCreate} className="mb-4 rounded-lg border border-slate-200 p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Müvekkil</label>
            {clientOptions.length === 0 ? (
              <p className="text-sm text-red-600">Bu dosyada aktif müvekkil yok; link üretilemez.</p>
            ) : (
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {clientOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {clientLabel(c)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              İstenen bilgi kategorileri (en az bir)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {ALL_CATEGORIES.map((cat) => (
                <label key={cat} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={scope.has(cat)}
                    onChange={() => toggleCategory(cat)}
                    className="rounded border-slate-300"
                  />
                  {CATEGORY_LABELS[cat]}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Son kullanma (opsiyonel)</label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Maks. kullanım (varsayılan 1)</label>
              <input
                type="number"
                min={1}
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="1"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={creating || clientOptions.length === 0}
              className="rounded-md bg-slate-800 text-white px-4 py-2 text-sm font-medium hover:bg-slate-900 disabled:opacity-60"
            >
              {creating ? "Üretiliyor…" : "Oluştur"}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Vazgeç
            </button>
          </div>
        </form>
      )}

      {/* Mevcut linkler */}
      <div>
        <p className="text-xs text-slate-500 mb-2">
          Mevcut linkler güvenlik nedeniyle tekrar görüntülenemez. Gerekirse yeni link üretip eskisini iptal edin.
        </p>
        {listError && <p className="text-sm text-red-600 mb-2">{listError}</p>}
        {revokeError && <p className="text-sm text-red-600 mb-2">{revokeError}</p>}
        {links === null ? (
          <p className="text-sm text-slate-400">Yükleniyor…</p>
        ) : links.length === 0 ? (
          <p className="text-sm text-slate-400">Henüz link üretilmedi.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3 font-medium">Durum</th>
                  <th className="py-2 pr-3 font-medium">Kategoriler</th>
                  <th className="py-2 pr-3 font-medium">Oluşturma</th>
                  <th className="py-2 pr-3 font-medium">Son kullanma</th>
                  <th className="py-2 pr-3 font-medium">Kullanım</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[l.status]}`}>
                        {STATUS_LABELS[l.status]}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{l.scope.length} kategori</td>
                    <td className="py-2 pr-3 text-slate-600">{fmtDate(l.createdAt)}</td>
                    <td className="py-2 pr-3 text-slate-600">{fmtDate(l.expiresAt)}</td>
                    <td className="py-2 pr-3 text-slate-600">
                      {l.useCount}/{l.maxUses}
                    </td>
                    <td className="py-2 text-right">
                      {l.status === "ACTIVE" && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(l.id)}
                          disabled={revokingId === l.id}
                          className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-60"
                        >
                          {revokingId === l.id ? "İptal ediliyor…" : "İptal"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
