"use client";

import { useEffect, useMemo, useState } from "react";
import {
  api,
  type ClaimLiabilityHistoryDTO,
  type ClaimLiabilityKindDTO,
  type ClaimLiabilityModeDTO,
  type ClaimLiabilityPreviewDTO,
  type ClaimLiabilitySelectionInputDTO,
  type ClaimLiabilityStateDTO,
} from "@/lib/api";
import { toActionErrorMessage } from "@/lib/action-error";
import { humanizeClaimItemName } from "./claim-item-labels";

/**
 * Seçimlik kalem bazlı borçlu sorumluluğu — seçim çekmecesi (tek kalem ya da "dosyadaki kalemlere uygula").
 *
 * - Dört seçenek; hiçbiri ön seçili DEĞİLDİR. Yazılım ilam metninden, rolden ya da borçlu sayısından tür çıkarmaz.
 * - İstemci HESAP YAPMAZ: önce / sonra rakamları, engeller ve girdi hataları sunucu önizlemesinden gelir.
 * - Seçim doğrudan yazılmaz; mevcut yüksek etkili kalem değişikliği onayına gider (iki kişi kuralı).
 * - Toplu uygulama tek talep olarak onaylanır (ya hep ya hiç). Saklanan bir dosya varsayılanı yoktur.
 */
export const CLAIM_LIABILITY_KIND_LABELS: Record<ClaimLiabilityKindDTO, string> = {
  BELIRLENMEDI: "Belirlenmedi",
  KAYITTAN_KISITLI: "Kayıttan kısıtlı",
  MUTESELSIL: "Müteselsil",
  PAYLI: "Paylı",
  TUTARLA_SINIRLI: "Tutarla sınırlı",
};

const MODE_OPTIONS: Array<{ value: ClaimLiabilityModeDTO; label: string; hint: string }> = [
  { value: "JOINT_AND_SEVERAL", label: "Müteselsil", hint: "Seçilen her borçlu kalemin ortak kalanının tamamından sorumludur." },
  { value: "PROPORTIONAL", label: "Paylı", hint: "Paylar kalemin tam tutarından hesaplanır; bir borçlunun ödemesi diğerinin payını kapatmaz." },
  { value: "CAPPED", label: "Tutarla sınırlı", hint: "Borçlu, bu kalemin kayıtlı tutarından en çok belirtilen tutara kadar sorumludur." },
  { value: "UNDETERMINED", label: "Belirlenmedi", hint: "Tür seçilmez; ödeme bugünkü kurallarla kalemi azaltır, borçluya özgü kesin bakiye üretilmez." },
];

const BASIS_OPTIONS: Array<{ value: string; label: string; noteRequired?: boolean }> = [
  { value: "COURT_JUDGMENT", label: "İlam / mahkeme kararı" },
  { value: "CONTRACT", label: "Sözleşme" },
  { value: "STATUTE", label: "Kanun hükmü" },
  { value: "NEGOTIABLE_INSTRUMENT", label: "Kambiyo senedi" },
  { value: "LAWYER_ASSESSMENT", label: "Avukat değerlendirmesi", noteRequired: true },
  { value: "OTHER", label: "Diğer", noteRequired: true },
];

const INPUT_ERROR_LABELS: Record<string, string> = {
  MODE_INVALID: "Sorumluluk türü geçersiz.",
  BASIS_REQUIRED: "Dayanak seçilmelidir.",
  BASIS_INVALID: "Dayanak geçersiz.",
  BASIS_NOTE_REQUIRED: "Bu dayanak için açıklama zorunludur.",
  PARTY_COUNT_INVALID: "Borçlu sayısı bu tür için uygun değil (paylıda en az iki borçlu).",
  PARTY_DUPLICATE: "Aynı kişi bir seçimde iki kez yer alamaz.",
  PARTY_NOT_ACTIVE_CASE_DEBTOR: "Seçilen borçlu bu dosyanın etkin borçlusu değil.",
  UNDETERMINED_HAS_PARTIES: "Belirlenmedi seçiminde borçlu seçilmez.",
  SHARE_INPUT_INVALID: "Pay girdisi eksik ya da geçersiz.",
  SHARE_PERCENT_TOTAL_INVALID: "Yüzdelerin toplamı tam 100,00 olmalıdır.",
  SHARE_AND_LIMIT_MIXED: "Aynı kalemde pay ve tavan birlikte kullanılamaz.",
  LIMIT_INVALID: "Tavan sıfırdan büyük olmalıdır.",
  LIMIT_AND_UNLIMITED_CONFLICT: "Bir borçlu hem tavanlı hem tavansız olamaz.",
  ALL_PARTIES_UNLIMITED: "Bütün borçlular tavansız olamaz; en az bir tavan girilmelidir.",
  FIELD_NOT_ALLOWED_FOR_MODE: "Bu tür için geçerli olmayan bir alan gönderildi.",
  CLAIM_ITEM_NOT_ACTIVE: "Kalem etkin değil; seçim yapılamaz.",
};

const BLOCKER_LABELS: Record<string, string> = {
  UNATTRIBUTED_COLLECTION: "Geçmiş tahsilatın hangi borçlu hesabına yapıldığı kayıtlı değil",
  ATTRIBUTED_TO_NON_PARTY: "Geçmiş tahsilat seçimde olmayan borçlu hesabına kayıtlı",
  ATTRIBUTION_EXCEEDS_SHARE: "Borçlu hesabına sayılan tutar yeni payı aşıyor",
  ATTRIBUTION_EXCEEDS_LIMIT: "Borçlu hesabına sayılan tutar tavanı aşıyor",
  NEGATIVE_ATTRIBUTION: "Borçlu hesabındaki mahsup eksiye düşmüş",
  COUNTER_LEDGER_MISMATCH: "Kalemin tahsil sayacı defter kayıtlarıyla uyuşmuyor",
};

interface PartyForm {
  selected: boolean;
  percent: string;
  limit: string;
  unlimited: boolean;
}

const emptyParty = (selected = false): PartyForm => ({ selected, percent: "", limit: "", unlimited: false });

/**
 * Kayıtlı pay ağırlığını okunur biçimde yazar. Ağırlıklar oranı saklar (ör. %60 → 6000 / 10000); ham sayı kullanıcıya
 * bir şey söylemez. Oran iki ondalıkla TAM ifade edilebiliyorsa yüzde, edilemiyorsa (ör. üçte bir) kesir yazılır —
 * yuvarlanmış bir yüzde gösterilmez. Yalnız gösterimdir; pay tutarı sunucuda hesaplanır.
 */
export function formatShare(weight: number, totalWeight: number): string {
  if (!(totalWeight > 0) || !(weight >= 0)) return String(weight);
  const basisPoints = weight * 10000;
  if (basisPoints % totalWeight === 0) {
    return `%${(basisPoints / totalWeight / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${weight} / ${totalWeight}`;
}

export function ClaimLiabilitySelectionDrawer({
  caseId,
  state,
  claimItemIds,
  presetJointAll = false,
  onClose,
  onRequested,
}: {
  caseId: string;
  state: ClaimLiabilityStateDTO;
  /** Bir kalem → tek kalem seçimi; birden çok → "dosyadaki kalemlere uygula" (tek talep, ya hep ya hiç). */
  claimItemIds: string[];
  /**
   * Toplu müteselsil kısa yolu: tür "Müteselsil" ve bütün etkin borçlular seçili gelir. Dayanak ve onay YİNE istenir;
   * bu bir dosya varsayılanı değildir.
   */
  presetJointAll?: boolean;
  onClose: () => void;
  onRequested: (message: string) => void;
}) {
  const activeDebtors = useMemo(() => state.borclular.filter((b) => b.etkin), [state.borclular]);
  const bulk = claimItemIds.length > 1;
  const [mode, setMode] = useState<ClaimLiabilityModeDTO | null>(presetJointAll ? "JOINT_AND_SEVERAL" : null);
  const [shareKind, setShareKind] = useState<"EQUAL" | "PERCENT" | null>(null);
  const [parties, setParties] = useState<Record<string, PartyForm>>(() =>
    Object.fromEntries(activeDebtors.map((b) => [b.caseDebtorId, emptyParty(presetJointAll)])),
  );
  const [basis, setBasis] = useState("");
  const [basisNote, setBasisNote] = useState("");
  const [preview, setPreview] = useState<ClaimLiabilityPreviewDTO | null>(null);
  const [busy, setBusy] = useState<"preview" | "request" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ClaimLiabilityHistoryDTO | null>(null);

  // Tek kalemde seçim geçmişi (salt okuma). Yüklenemezse çekmece çalışmaya devam eder.
  useEffect(() => {
    if (bulk) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => api.getClaimLiabilityHistory(caseId, claimItemIds[0]))
      .then((result) => {
        if (!cancelled) setHistory(result);
      })
      .catch(() => {
        if (!cancelled) setHistory(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bulk, caseId, claimItemIds]);

  // Formdaki her değişiklik önizlemeyi geçersiz kılar: onaya yalnız ÖNİZLENEN seçim gönderilir.
  const invalidate = () => {
    setPreview(null);
    setError(null);
  };
  const updateParty = (caseDebtorId: string, patch: Partial<PartyForm>) => {
    setParties((prev) => ({ ...prev, [caseDebtorId]: { ...(prev[caseDebtorId] ?? emptyParty()), ...patch } }));
    invalidate();
  };

  const fmt = (amount: number, currency: string) =>
    `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  const fmtOrDash = (amount: number | null, currency: string) => (amount === null ? "—" : fmt(amount, currency));

  const buildSelections = (): ClaimLiabilitySelectionInputDTO[] | null => {
    if (!mode) return null;
    const chosen = activeDebtors.filter((b) => parties[b.caseDebtorId]?.selected);
    const partyInputs =
      mode === "UNDETERMINED"
        ? undefined
        : chosen.map((b) => {
            const form = parties[b.caseDebtorId];
            if (mode === "PROPORTIONAL") {
              return shareKind === "PERCENT"
                ? { caseDebtorId: b.caseDebtorId, sharePercent: form.percent.trim().replace(",", ".") }
                : shareKind === "EQUAL"
                  ? { caseDebtorId: b.caseDebtorId, shareWeight: 1 }
                  : { caseDebtorId: b.caseDebtorId };
            }
            if (mode === "CAPPED") {
              return form.unlimited
                ? { caseDebtorId: b.caseDebtorId, unlimited: true }
                : { caseDebtorId: b.caseDebtorId, ...(form.limit.trim() ? { limitAmount: form.limit.trim().replace(",", ".") } : {}) };
            }
            return { caseDebtorId: b.caseDebtorId };
          });
    return claimItemIds.map((claimItemId) => ({
      claimItemId,
      mode,
      ...(partyInputs ? { parties: partyInputs } : {}),
      ...(mode !== "UNDETERMINED" && basis ? { basis } : {}),
      ...(basisNote.trim() ? { basisNote: basisNote.trim() } : {}),
    }));
  };

  const handlePreview = async () => {
    const selections = buildSelections();
    if (!selections) {
      setError("Önce sorumluluk türünü seçin.");
      return;
    }
    setBusy("preview");
    setError(null);
    try {
      setPreview(await api.previewClaimLiability(caseId, selections));
    } catch (err) {
      setPreview(null);
      setError(toActionErrorMessage(err, "Önizleme alınamadı."));
    } finally {
      setBusy(null);
    }
  };

  const handleRequest = async () => {
    const selections = buildSelections();
    if (!selections || !preview?.uygulanabilir) return;
    setBusy("request");
    setError(null);
    try {
      const result = await api.requestClaimLiability(caseId, { selections, onizlemeOzeti: preview.onizlemeOzeti });
      const skipped = result.atlananKalemler?.length ?? 0;
      onRequested(
        skipped > 0
          ? `Borçlu sorumluluğu seçimi ${result.uygulanacakKalemSayisi ?? selections.length - skipped} kalem için onaya gönderildi; ${skipped} kalem zaten aynı seçimde olduğu için atlandı. Seçim, onaylandığında uygulanır; o zamana kadar hesap değişmez.`
          : "Borçlu sorumluluğu seçimi onaya gönderildi. Seçim, onaylandığında uygulanır; o zamana kadar hesap değişmez.",
      );
    } catch (err) {
      setError(toActionErrorMessage(err, "Seçim onaya gönderilemedi."));
    } finally {
      setBusy(null);
    }
  };

  const targetItems = state.kalemler.filter((k) => claimItemIds.includes(k.claimItemId));
  const basisNoteRequired = BASIS_OPTIONS.find((option) => option.value === basis)?.noteRequired === true;

  return (
    // Ortalanmış pencere (uygulamadaki diğer kalem pencereleriyle aynı düzen). Sağ kenara yaslı çekmece, sağ alttaki
    // yüzen "Hızlı İşlemler" düğmesinin altında kalıyordu: düğme "Onaya gönder"in üstüne binip tıklamayı yutuyordu
    // (çalışan arayüzde ölçüldü). Pencere ekranın %90'ını aşmaz ve işlem düğmeleri sola yaslıdır.
    // Yerleşim (owner 18.11.2026, P02 kullanılabilirlik notu U-6): geniş ekranda iki sütun (seçim / dayanak + önizleme); yalnız
    // gövde kayar, işlem düğmeleri altta sabit ve SOLA yaslı kalır (yüzen düğme kuralı korunur). Küçük ekranda tek sütun.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4" data-testid="claim-liability-drawer">
      <div
        className="w-full max-w-2xl lg:max-w-5xl max-h-[90vh] flex flex-col rounded-xl bg-white"
        role="dialog"
        aria-modal="true"
        aria-label="Borçlu sorumluluğu seçimi"
        onKeyDown={(e) => {
          if (e.key === "Escape" && busy === null) {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b px-5 pt-5 pb-3">
          <div>
            <h3 className="text-lg font-semibold">{bulk ? "Dosyadaki kalemlere uygula" : "Borçlu sorumluluğu"}</h3>
            <p className="text-xs text-gray-600">
              {bulk
                ? `${targetItems.length} kalem için tek onay talebi oluşturulur; bir kalem engelliyse hiçbirine yazılmaz.`
                : targetItems[0]?.aciklama || humanizeClaimItemName(targetItems[0]?.kalemTuru ?? "")}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded border px-2 py-1 text-xs hover:bg-gray-50">
            Kapat
          </button>
        </div>

        <div
          data-testid="claim-liability-body"
          className="overflow-y-auto px-5 py-4 space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6"
        >
        <div className="space-y-4 min-w-0" data-testid="claim-liability-column-selection">
        <p data-testid="claim-liability-user-choice-note" className="rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
          Bu seçim kullanıcı tercihidir. Yazılım ilam metninden, borçlu rolünden ya da borçlu sayısından sorumluluk türü
          çıkarmaz. Dosyanın alacak toplamı tek rakamdır; borçlu rakamları toplanarak dosya borcu üretilmez.
        </p>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Sorumluluk türü</legend>
          {MODE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-start gap-2 rounded border px-3 py-2 text-sm hover:bg-gray-50">
              <input
                type="radio"
                name="claim-liability-mode"
                data-testid={`claim-liability-mode-${option.value}`}
                checked={mode === option.value}
                onChange={() => {
                  setMode(option.value);
                  invalidate();
                }}
              />
              <span>
                <span className="font-medium">{option.label}</span>
                <span className="block text-xs text-gray-600">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {mode === "CAPPED" && (
          <p data-testid="claim-liability-cap-scope-note" className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {state.aciklamalar.tavanKapsami}
          </p>
        )}

        {mode && mode !== "UNDETERMINED" && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Borçlular</p>
            {mode === "PROPORTIONAL" && (
              <div className="flex gap-4 text-xs">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="claim-liability-share-kind"
                    data-testid="claim-liability-share-equal"
                    checked={shareKind === "EQUAL"}
                    onChange={() => {
                      setShareKind("EQUAL");
                      invalidate();
                    }}
                  />
                  Eşit pay
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="claim-liability-share-kind"
                    data-testid="claim-liability-share-percent"
                    checked={shareKind === "PERCENT"}
                    onChange={() => {
                      setShareKind("PERCENT");
                      invalidate();
                    }}
                  />
                  Yüzde gir (toplam tam 100,00)
                </label>
              </div>
            )}
            <ul className="space-y-1">
              {activeDebtors.map((debtor) => {
                const form = parties[debtor.caseDebtorId] ?? emptyParty();
                return (
                  <li key={debtor.caseDebtorId} className="flex flex-wrap items-center gap-2 rounded border px-3 py-2 text-sm">
                    <label className="flex flex-1 items-center gap-2">
                      <input
                        type="checkbox"
                        data-testid={`claim-liability-party-${debtor.caseDebtorId}`}
                        checked={form.selected}
                        onChange={(e) => updateParty(debtor.caseDebtorId, { selected: e.target.checked })}
                      />
                      <span>{debtor.ad}</span>
                    </label>
                    {mode === "PROPORTIONAL" && shareKind === "PERCENT" && form.selected && (
                      <input
                        aria-label={`${debtor.ad} yüzde`}
                        data-testid={`claim-liability-percent-${debtor.caseDebtorId}`}
                        value={form.percent}
                        onChange={(e) => updateParty(debtor.caseDebtorId, { percent: e.target.value })}
                        placeholder="%"
                        inputMode="decimal"
                        className="w-24 rounded border px-2 py-1 text-right text-xs"
                      />
                    )}
                    {mode === "CAPPED" && form.selected && (
                      <>
                        <input
                          aria-label={`${debtor.ad} tavan`}
                          data-testid={`claim-liability-limit-${debtor.caseDebtorId}`}
                          // "Tavan yok" işaretliyken kutu BOŞ görünür: eski rakam "tavan yok" ile yan yana durup
                          // yanıltmasın. Yazılan değer saklanır; işaret kaldırılırsa geri gelir. Sunucuya gitmez.
                          value={form.unlimited ? "" : form.limit}
                          disabled={form.unlimited}
                          onChange={(e) => updateParty(debtor.caseDebtorId, { limit: e.target.value })}
                          placeholder="Tavan"
                          inputMode="decimal"
                          className="w-32 rounded border px-2 py-1 text-right text-xs disabled:bg-gray-100"
                        />
                        <label className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            data-testid={`claim-liability-unlimited-${debtor.caseDebtorId}`}
                            checked={form.unlimited}
                            onChange={(e) => updateParty(debtor.caseDebtorId, { unlimited: e.target.checked })}
                          />
                          Tavan yok
                        </label>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        </div>

        <div className="space-y-4 min-w-0" data-testid="claim-liability-column-review">
        {mode && mode !== "UNDETERMINED" && (
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="claim-liability-basis">
              Dayanak
            </label>
            <select
              id="claim-liability-basis"
              data-testid="claim-liability-basis"
              value={basis}
              onChange={(e) => {
                setBasis(e.target.value);
                invalidate();
              }}
              className="w-full rounded border px-3 py-2 text-sm"
            >
              <option value="">Seçiniz</option>
              {BASIS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <textarea
              aria-label="Dayanak açıklaması"
              data-testid="claim-liability-basis-note"
              value={basisNote}
              onChange={(e) => {
                setBasisNote(e.target.value);
                invalidate();
              }}
              placeholder={basisNoteRequired ? "Açıklama (zorunlu)" : "Açıklama (isteğe bağlı)"}
              className="w-full rounded border px-3 py-2 text-sm"
              rows={2}
            />
          </div>
        )}

        {error && (
          <p data-testid="claim-liability-error" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        {preview && (
          <div data-testid="claim-liability-preview" className="space-y-3 rounded border border-blue-200 bg-blue-50 p-3 text-xs">
            <p className="font-semibold text-blue-900">Önizleme — kayıt oluşturmaz</p>
            {preview.kalemler.map((kalem) => (
              <div key={kalem.claimItemId} className="space-y-1 rounded bg-white p-2">
                <p className="font-medium">
                  {/* Açıklaması boş kalemde ham tür kodu yerine Türkçe ad (ör. ATTORNEY_FEE → Vekalet Ücreti). */}
                  {kalem.aciklama || humanizeClaimItemName(kalem.kalemTuru)} — {CLAIM_LIABILITY_KIND_LABELS[kalem.oncekiTur]} →{" "}
                  {kalem.sonrakiTur ? CLAIM_LIABILITY_KIND_LABELS[kalem.sonrakiTur] : "—"}
                </p>
                <p className="text-gray-600">
                  Tutar {fmt(kalem.tutar, kalem.paraBirimi)} · tahsil edilen {fmt(kalem.tahsilEdilen, kalem.paraBirimi)} · ortak
                  kalan {fmt(kalem.ortakKalan, kalem.paraBirimi)}
                </p>
                {kalem.girdiHatalari.map((hata, index) => (
                  <p key={`${hata.kod}-${index}`} data-testid="claim-liability-input-error" className="text-red-700">
                    {INPUT_ERROR_LABELS[hata.kod] ?? hata.kod}
                  </p>
                ))}
                {kalem.engeller.map((engel, index) => (
                  <p key={`${engel.kod}-${index}`} data-testid="claim-liability-blocker" className="text-red-700">
                    İşlem durdu: {BLOCKER_LABELS[engel.kod] ?? engel.kod}
                    {engel.borcluAdi ? ` (${engel.borcluAdi})` : ""}
                    {engel.tutar !== null ? ` — ${fmt(engel.tutar, kalem.paraBirimi)}` : ""}
                    {engel.sinir !== null ? ` / sınır ${fmt(engel.sinir, kalem.paraBirimi)}` : ""}.
                  </p>
                ))}
                {kalem.degisiklikYok && (
                  <p data-testid="claim-liability-no-change" className="text-amber-800">
                    {/* Toplu uygulamada değişmeyen kalem engel değildir: talebe girmez, öteki kalemler gönderilir. */}
                    {preview.uygulanabilir
                      ? "Seçim mevcut durumla aynı; bu kalem atlanır (talebe girmez)."
                      : "Seçim mevcut durumla aynı; değişiklik yok."}
                  </p>
                )}
                {kalem.borclular.length > 0 && (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="py-0.5 pr-2 font-normal">Borçlu</th>
                        <th className="py-0.5 pr-2 font-normal text-right">Hesabına sayılan geçmiş mahsup</th>
                        <th className="py-0.5 pr-2 font-normal text-right">Önceki kalan sorumluluk</th>
                        <th className="py-0.5 font-normal text-right">Sonraki kalan sorumluluk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kalem.borclular.map((row) => (
                        <tr key={row.caseDebtorId} data-testid="claim-liability-preview-row">
                          <td className="py-0.5 pr-2">{row.ad}</td>
                          <td className="py-0.5 pr-2 text-right">{fmt(row.borcluHesabinaMahsup, kalem.paraBirimi)}</td>
                          <td className="py-0.5 pr-2 text-right">{fmtOrDash(row.oncekiKalanSorumluluk, kalem.paraBirimi)}</td>
                          <td className="py-0.5 text-right">{fmtOrDash(row.sonrakiKalanSorumluluk, kalem.paraBirimi)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
            <p className="text-gray-600">
              Seçim geçmiş tahsilatları taşımaz ve yeniden atfetmez; oranlar yeniden ölçeklenmez. {state.aciklamalar.asanOdeme}
            </p>
          </div>
        )}

        {/* Yalnız toplu uygulamada: tek kalemde "değişiklik yok" satırı zaten yeterlidir. */}
        {preview && preview.uygulamaTuru === "BULK" && (preview.atlananKalemSayisi ?? 0) > 0 && (
          <p data-testid="claim-liability-skip-summary" className="text-xs text-amber-800">
            {preview.uygulanabilir
              ? `${preview.uygulanacakKalemSayisi ?? 0} kalem onaya gönderilecek; ${preview.atlananKalemSayisi} kalem zaten aynı seçimde olduğu için atlanacak.`
              : (preview.uygulanacakKalemSayisi ?? 0) === 0
                ? "Seçilen kalemlerin hepsi zaten bu seçimde; gönderilecek değişiklik yok."
                : `${preview.atlananKalemSayisi} kalem zaten aynı seçimde; öteki kalemlerdeki sorun giderilmeden talep gönderilemez.`}
          </p>
        )}

        {!bulk && history && history.surumler.length > 0 && (
          <div data-testid="claim-liability-history" className="space-y-1 border-t pt-3 text-xs">
            <p className="font-medium">Değişiklik geçmişi</p>
            <ul className="space-y-1">
              {history.surumler.map((surum) => (
                <li key={surum.id} className="rounded border px-2 py-1">
                  <span className="font-medium">
                    Sürüm {surum.surum} — {CLAIM_LIABILITY_KIND_LABELS[surum.tur]}
                  </span>{" "}
                  <span className="text-gray-600">
                    ({surum.durum === "ACTIVE" ? "etkin" : "kapandı"}; {new Date(surum.kararZamani).toLocaleDateString("tr-TR")})
                  </span>
                  {surum.taraflar.length > 0 && (
                    <span className="block text-gray-600">
                      {surum.taraflar
                        .map((taraf) =>
                          taraf.payAgirligi !== null
                            ? `${taraf.ad} (pay ${formatShare(
                                taraf.payAgirligi,
                                surum.taraflar.reduce((sum, other) => sum + (other.payAgirligi ?? 0), 0),
                              )})`
                            : taraf.sinirsiz
                              ? `${taraf.ad} (tavan yok)`
                              : taraf.tavan !== null
                                ? `${taraf.ad} (tavan ${taraf.tavan.toLocaleString("tr-TR", { minimumFractionDigits: 2 })})`
                                : taraf.ad,
                        )
                        .join(", ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        </div>
        </div>

        <div className="flex justify-start gap-2 border-t px-5 py-3" data-testid="claim-liability-actions">
          <button
            type="button"
            data-testid="claim-liability-preview-button"
            onClick={handlePreview}
            disabled={busy !== null || !mode}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === "preview" ? "Önizleniyor…" : "Önizle"}
          </button>
          <button
            type="button"
            data-testid="claim-liability-request-button"
            onClick={handleRequest}
            disabled={busy !== null || !preview?.uygulanabilir}
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy === "request" ? "Gönderiliyor…" : "Onaya gönder"}
          </button>
        </div>
      </div>
    </div>
  );
}
