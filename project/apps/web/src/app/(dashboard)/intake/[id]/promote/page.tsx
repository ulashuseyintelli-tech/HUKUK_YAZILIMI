"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  api,
  IntakeSubmissionDetail,
  IntakeSubmissionField,
  IntakeFieldCategory,
  PromoteAddressInput,
} from "@/lib/api";

/**
 * Müvekkil Bilgi Formu — Kanoniğe Aktarım / Promote (Faz 4.7 PR-C2b) — personel/JWT.
 *
 * ⛔ KIRMIZI ÇİZGİ: YALNIZ FIELD-LEVEL promote. submission-level / toplu promote YOK
 *   (lib/api.ts'te submission-level promote metodu yok; CI-7 yapısal enforce eder).
 *   - soft-6 → ClientIntelStatement (api.promoteSoftField, #178)
 *   - ADDRESS → DebtorAddress HYBRID (api.promoteAddressField, #168; personel street/city girer)
 *   - ASSET/CONTACT → aktarım ucu YOK (4.6c) → rozet + DISABLED
 * Review (onay/ret) ile promote (aktarım) AYRI işlerdir (review ekranı: /intake/[id]).
 * Yalnız APPROVED + henüz aktarılmamış alanlar, TEK TEK + KALICI açık-onayla aktarılır.
 */

const CATEGORY_LABELS: Record<IntakeFieldCategory, string> = {
  INCOME_SOURCE: "Gelir Kaynağı",
  COMMERCIAL_RELATION: "Ticari İlişki",
  FAMILY_CIRCLE: "Aile / Yakın Çevre",
  DIGITAL_FOOTPRINT: "Dijital İz",
  PAYMENT_HISTORY: "Tahsilat Geçmişi",
  STRATEGY: "Dosya Stratejisi",
  ADDRESS: "Adres",
  ASSET: "Varlık",
  CONTACT: "İletişim",
};

// 6 yumuşak istihbarat kategorisi → promote-soft (ClientIntelStatement).
// ADDRESS ayrı (HYBRID); ASSET/CONTACT henüz aktarılamaz (4.6c).
const SOFT_CATEGORIES = new Set<IntakeFieldCategory>([
  "INCOME_SOURCE",
  "COMMERCIAL_RELATION",
  "FAMILY_CIRCLE",
  "DIGITAL_FOOTPRINT",
  "PAYMENT_HISTORY",
  "STRATEGY",
]);
const PROMOTE_DISABLED = new Set<IntakeFieldCategory>(["ASSET", "CONTACT"]);

interface DebtorOption {
  id: string;
  label: string;
}

type ConfirmTarget = { field: IntakeSubmissionField; kind: "soft" | "address" };

function fmtDateTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("tr-TR");
}

export default function IntakePromotePage({ params }: { params: { id: string } }) {
  const [sub, setSub] = useState<IntakeSubmissionDetail | null>(null);
  const [debtors, setDebtors] = useState<DebtorOption[]>([]);
  const [debtorId, setDebtorId] = useState("");
  const [caseLabel, setCaseLabel] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  // Adres HYBRID alanları (yalnız ADDRESS promote onay modalında girilir; ham value korunur)
  const [addr, setAddr] = useState({ street: "", city: "", district: "", postalCode: "", country: "" });

  const load = useCallback(async () => {
    setError("");
    try {
      const d = await api.getIntakeSubmission(params.id);
      setSub(d);
      // CaseDebtor listesi → aktarım hedefi (debtorId = Debtor.id, caseDebtorId DEĞİL).
      try {
        const cd = await api.getCaseDebtors(d.caseId);
        const opts = (cd.items ?? []).map((it) => ({ id: it.id, label: it.displayName }));
        setDebtors(opts);
        setDebtorId((prev) => prev || (opts[0]?.id ?? ""));
      } catch {
        setDebtors([]);
      }
      // Okunabilir başlık (best-effort).
      try {
        const c = (await api.getCase(d.caseId)) as {
          fileNumber?: string;
          client?: { displayName?: string; name?: string };
        };
        const name = c?.client?.displayName || c?.client?.name;
        setCaseLabel(`${c?.fileNumber ?? d.caseId}${name ? " · " + name : ""}`);
      } catch {
        setCaseLabel(d.caseId);
      }
    } catch {
      setNotFound(true);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const openConfirm = (field: IntakeSubmissionField) => {
    setError("");
    if (!debtorId) {
      setError("Önce aktarım hedefi borçluyu seçin.");
      return;
    }
    if (field.category === "ADDRESS") {
      setAddr({ street: "", city: "", district: "", postalCode: "", country: "" });
      setConfirmTarget({ field, kind: "address" });
    } else {
      setConfirmTarget({ field, kind: "soft" });
    }
  };

  const doPromote = async () => {
    if (!confirmTarget || !debtorId) return;
    if (confirmTarget.kind === "address" && (!addr.street.trim() || !addr.city.trim())) {
      setError("Adres aktarımı için sokak ve il (street/city) zorunludur.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (confirmTarget.kind === "soft") {
        await api.promoteSoftField(confirmTarget.field.id, debtorId);
      } else {
        const input: PromoteAddressInput = {
          debtorId,
          street: addr.street.trim(),
          city: addr.city.trim(),
          district: addr.district.trim() || undefined,
          postalCode: addr.postalCode.trim() || undefined,
          country: addr.country.trim() || undefined,
        };
        await api.promoteAddressField(confirmTarget.field.id, input);
      }
      setConfirmTarget(null);
      await load(); // yalnız BAŞARIDA yenile; promotedRefId dolunca alan "Aktarıldı" olur
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aktarım başarısız.");
    } finally {
      setBusy(false);
    }
  };

  if (notFound) {
    return (
      <div className="max-w-3xl mx-auto">
        <Link href="/intake" className="text-sm text-blue-600 hover:text-blue-800">← Kuyruğa dön</Link>
        <p className="mt-4 text-slate-600">Gönderim bulunamadı.</p>
      </div>
    );
  }
  if (!sub) {
    return <p className="text-sm text-slate-400 p-6">Yükleniyor…</p>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link href={`/intake/${sub.id}`} className="text-sm text-blue-600 hover:text-blue-800">← İncelemeye dön</Link>

      <div className="mt-3">
        <h1 className="text-xl font-semibold text-slate-800">Kanoniğe Aktarım (Promote)</h1>
        <p className="text-sm text-slate-500">
          <Link href={`/cases/${sub.caseId}`} className="underline hover:text-slate-700">
            {caseLabel || sub.caseId}
          </Link>
        </p>
      </div>

      {/* Kırmızı çizgi / kalıcılık uyarısı */}
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Aktarım <strong>KALICIDIR ve geri alınamaz</strong>. Yalnız <strong>onaylanmış</strong> alanlar,
        seçilen borçluya <strong>tek tek</strong> aktarılır. Toplu / gönderim-düzeyi aktarım yoktur;
        inceleme (onay/ret) ile aktarım ayrı adımlardır.
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {/* Aktarım hedefi: CaseDebtor (zorunlu) */}
      <div className="mt-4">
        <label className="block text-xs font-medium text-slate-600 mb-1">Aktarım hedefi borçlu</label>
        {debtors.length === 0 ? (
          <p className="text-sm text-red-600">Bu dosyada borçlu yok; aktarım yapılamaz.</p>
        ) : (
          <select
            value={debtorId}
            onChange={(e) => setDebtorId(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {debtors.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Alanlar */}
      <div className="mt-4 space-y-2">
        {sub.fields.length === 0 ? (
          <p className="text-sm text-slate-400">Bu gönderimde alan yok.</p>
        ) : (
          sub.fields.map((f) => {
            const promoted = !!f.promotedRefId;
            const approved = f.reviewStatus === "APPROVED";
            const isSoft = SOFT_CATEGORIES.has(f.category);
            const isAddress = f.category === "ADDRESS";
            const isDisabledCat = PROMOTE_DISABLED.has(f.category);
            return (
              <div key={f.id} className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-700">
                        {CATEGORY_LABELS[f.category] ?? f.category}
                      </span>
                      {promoted ? (
                        <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium bg-green-100 text-green-800">
                          Aktarıldı{f.promotedRefType ? ` · ${f.promotedRefType}` : ""}
                        </span>
                      ) : approved ? (
                        <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium bg-blue-100 text-blue-800">
                          Onaylı · aktarıma hazır
                        </span>
                      ) : (
                        <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-600">
                          Aktarım için önce onaylanmalı
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{f.value}</p>
                    {promoted && (f.promotedAt || f.promotedById) && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        {f.promotedAt ? `Aktarım: ${fmtDateTime(f.promotedAt)}` : ""}
                        {f.promotedById ? ` · ${f.promotedById}` : ""}
                      </p>
                    )}
                  </div>

                  {/* Aktarım kontrolü — yalnız APPROVED & aktarılmamış alanlarda */}
                  {!promoted && approved && (
                    <div className="shrink-0">
                      {isDisabledCat ? (
                        <button
                          type="button"
                          disabled
                          title="Bu kategori henüz aktarılamaz (yakında)"
                          className="rounded-md border border-slate-200 text-slate-400 px-2.5 py-1 text-xs font-medium cursor-not-allowed"
                        >
                          Toplandı — aktarılamaz
                        </button>
                      ) : isSoft || isAddress ? (
                        <button
                          type="button"
                          onClick={() => openConfirm(f)}
                          disabled={busy || !debtorId}
                          className="rounded-md border border-slate-800 bg-slate-800 text-white px-2.5 py-1 text-xs font-medium hover:bg-slate-900 disabled:opacity-50"
                        >
                          {isAddress ? "Adres olarak aktar" : "Aktar"}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* KALICI açık-onay modalı (her promote tek tek) */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-800">Aktarımı onayla</h3>
            <p className="mt-1 text-xs text-slate-500">
              <strong>{CATEGORY_LABELS[confirmTarget.field.category]}</strong> alanı seçilen borçluya
              kanoniğe <strong>KALICI</strong> olarak aktarılacak. Bu işlem geri alınamaz.
            </p>
            <p className="mt-2 rounded bg-slate-50 border border-slate-200 px-2 py-1 text-sm text-slate-700 whitespace-pre-wrap break-words">
              {confirmTarget.field.value}
            </p>

            {confirmTarget.kind === "address" && (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] text-slate-500">
                  Adres yapısal alanlarını girin (ham beyan korunur; otomatik ayrıştırma yoktur).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    aria-label="Sokak"
                    placeholder="Sokak / cadde *"
                    value={addr.street}
                    onChange={(e) => setAddr((s) => ({ ...s, street: e.target.value }))}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    aria-label="İl"
                    placeholder="İl *"
                    value={addr.city}
                    onChange={(e) => setAddr((s) => ({ ...s, city: e.target.value }))}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    aria-label="İlçe"
                    placeholder="İlçe"
                    value={addr.district}
                    onChange={(e) => setAddr((s) => ({ ...s, district: e.target.value }))}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    aria-label="Posta kodu"
                    placeholder="Posta kodu"
                    value={addr.postalCode}
                    onChange={(e) => setAddr((s) => ({ ...s, postalCode: e.target.value }))}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                disabled={busy}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={doPromote}
                disabled={busy}
                className="rounded-md bg-slate-800 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-900 disabled:opacity-60"
              >
                {busy ? "Aktarılıyor…" : "Kalıcı olarak aktar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
