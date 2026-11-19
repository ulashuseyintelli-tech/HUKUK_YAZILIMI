"use client";

import {
  ATTORNEY_FEE_BASIS_LABELS,
  CLAIM_LIABILITY_BASIS_LABELS,
  INTEREST_ACCRUAL_STATUS_LABELS,
  INTEREST_START_PROVENANCE_LABELS,
  OPENING_LIABILITY_KIND_LABELS,
  humanizeClaimItemName,
} from "../claim-item-labels";
import type { OpeningClaimPreviewDTO } from "@/lib/case-opening-claims";

/**
 * Yeni dosya formu — AÇILIŞ ÖNİZLEMESİ (owner talimatı 2026-11-18). Kayıt oluşturmaz.
 *
 * Gösterdikleri: kalem tutarları toplamı, kalem bazında açılışta yazılacak durum ile onaya gidecek beyan, borçlu başına
 * dağılım ve girdi hataları. Bütün rakamlar ve hatalar SUNUCUDAN gelir; bileşen hesap yapmaz.
 *
 * - Belirlenmemiş bilgi sıfır ya da kesin gibi gösterilmez: "belirlenmedi" / "belirlenemedi" yazılır.
 * - Borçlu rakamları toplanarak dosya borcu üretilmez; dosya toplamı tek rakamdır.
 * - Onaya gidecek beyanlar "onay bekleyecek" diye ayrı gösterilir; açılışta kaleme yazılmış gibi sunulmaz.
 */
const money = (amount: number, currency: string) =>
  `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

const day = (iso: string | null) => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
};

export function OpeningClaimPreviewCard({
  preview,
  loading,
  error,
  stale,
  debtorNames,
  hasDeclarations,
  excludedInstrumentCount = 0,
  onRefresh,
}: {
  preview: OpeningClaimPreviewDTO | null;
  loading: boolean;
  error: string | null;
  /** Gösterilen önizleme güncel girdiye ait değil (yenisi bekleniyor). */
  stale: boolean;
  debtorNames: Readonly<Record<string, string>>;
  /** Formda onaya gidecek beyan var mı (varsa güncel önizleme olmadan dosya açılmaz). */
  hasDeclarations: boolean;
  /** Evrak kaydı olarak açılacak (çek / senet) kalem sayısı; önizleme toplamına dahil değildir. */
  excludedInstrumentCount?: number;
  onRefresh: () => void;
}) {
  const nameOf = (debtorId: string) => debtorNames[debtorId] || "Adsız borçlu";
  const itemLabel = (dueIndex: number) => {
    const item = preview?.kalemler.find((kalem) => kalem.dueIndex === dueIndex);
    const name = item ? item.aciklama || (item.kalemTuru ? humanizeClaimItemName(item.kalemTuru) : "Kalem") : "Kalem";
    return `${dueIndex + 1}. ${name}`;
  };
  const currency = preview?.paraBirimi ?? "TRY";
  const errorsByItem = new Map<number | null, string[]>();
  for (const hata of preview?.hatalar ?? []) {
    const list = errorsByItem.get(hata.dueIndex) ?? [];
    list.push(hata.mesaj);
    errorsByItem.set(hata.dueIndex, list);
  }
  const selectionBlocked = !!preview && !preview.secimYazmaAcik && preview.onayaGidecekSorumlulukSecimiSayisi > 0;

  return (
    <section data-testid="opening-preview-card" aria-label="Açılış önizlemesi" className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-blue-950">Açılış önizlemesi</h3>
          <p className="text-[11px] text-blue-900">Kayıt oluşturmaz. Rakamlar sunucuda hesaplanır.</p>
        </div>
        <div className="flex items-center gap-2">
          {(loading || stale) && (
            <span data-testid="opening-preview-stale" className="text-[11px] text-amber-800">
              {loading ? "Önizleme hesaplanıyor…" : "Girdi değişti; önizleme yenileniyor."}
            </span>
          )}
          <button
            type="button"
            data-testid="opening-preview-refresh"
            onClick={onRefresh}
            disabled={loading}
            className="rounded border border-blue-300 bg-white px-2 py-1 text-xs text-blue-900 hover:bg-blue-50 disabled:opacity-50"
          >
            Önizlemeyi yenile
          </button>
        </div>
      </div>

      {error && (
        <p data-testid="opening-preview-error" role="alert" className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
          Önizleme alınamadı: {error}
          {hasDeclarations ? " Onaya gidecek beyan varken önizleme olmadan dosya oluşturulmaz." : ""}
        </p>
      )}

      {preview && (
        <div className={`mt-2 space-y-3 ${stale ? "opacity-60" : ""}`}>
          {(errorsByItem.get(null)?.length ?? 0) > 0 && (
            <ul className="space-y-0.5 text-xs text-red-700">
              {errorsByItem.get(null)!.map((mesaj, index) => (
                <li key={index} data-testid="opening-preview-input-error">{mesaj}</li>
              ))}
            </ul>
          )}

          <div className="overflow-x-auto rounded border border-blue-100 bg-white">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b text-[11px] text-gray-500">
                  <th className="px-2 py-1 font-medium">Kalem</th>
                  <th className="px-2 py-1 text-right font-medium">Tutar</th>
                  <th className="px-2 py-1 font-medium">Faiz</th>
                  <th className="px-2 py-1 font-medium">Borçlu sorumluluğu</th>
                </tr>
              </thead>
              <tbody>
                {preview.kalemler.map((kalem) => {
                  const beyan = kalem.faiz.onayBekleyecekBeyan;
                  const secim = kalem.sorumluluk.onayBekleyecekSecim;
                  const errors = errorsByItem.get(kalem.dueIndex) ?? [];
                  return (
                    <tr key={kalem.dueIndex} data-testid="opening-preview-item" className="border-b align-top last:border-b-0">
                      <td className="px-2 py-1.5">
                        <span className="font-medium text-gray-900">{itemLabel(kalem.dueIndex)}</span>
                        {kalem.kalemTuru === null && <span className="block text-[11px] text-gray-500">Bu satırdan alacak kalemi üretilmez.</span>}
                        {kalem.kalemTuru === "ATTORNEY_FEE" && (
                          <span className="block text-[11px] text-gray-600">
                            Kaynak: {ATTORNEY_FEE_BASIS_LABELS[(kalem.vekaletUcretiKaynagi as "JUDGMENT_AWARDED" | "ENFORCEMENT_TARIFF" | null) ?? "UNKNOWN"]}
                          </span>
                        )}
                        {errors.map((mesaj, index) => (
                          <span key={index} data-testid="opening-preview-input-error" className="block text-[11px] text-red-700">
                            {mesaj}
                          </span>
                        ))}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right">{money(kalem.tutar, currency)}</td>
                      <td className="px-2 py-1.5">
                        <span>Açılışta: {INTEREST_ACCRUAL_STATUS_LABELS[kalem.faiz.acilisDurumu]}</span>
                        {kalem.faiz.anaparaKalemi && kalem.faiz.acilisDurumu === "UNKNOWN" && (
                          <span data-testid="opening-preview-principal-interest-note" className="block text-[11px] text-gray-600">
                            {beyan
                              ? "Asıl alacak kalemi: beyan onaylanana kadar kaleme faiz başlangıcı yazılmaz; bu sürede faiz hesabı eksik kalabilir."
                              : "Asıl alacak kalemi: faiz hesabı bu alana bağlı değildir; girilen faiz türü ve başlangıç tarihiyle bugünkü gibi hesaplanır."}
                          </span>
                        )}
                        {beyan && (
                          <span data-testid="opening-preview-pending-interest" className="block text-[11px] text-amber-800">
                            Onay bekleyecek: {INTEREST_ACCRUAL_STATUS_LABELS.ACCRUES}
                            {beyan.baslangic ? ` — başlangıç ${day(beyan.baslangic)}` : ""} — dayanak:{" "}
                            {INTEREST_START_PROVENANCE_LABELS[beyan.dayanak] ?? beyan.dayanak}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <span>Açılışta: {OPENING_LIABILITY_KIND_LABELS.BELIRLENMEDI}</span>
                        {secim && (
                          <span data-testid="opening-preview-pending-liability" className="block text-[11px] text-amber-800">
                            Onay bekleyecek: {OPENING_LIABILITY_KIND_LABELS[secim.tur] ?? secim.tur}
                            {secim.dayanak ? ` — dayanak: ${CLAIM_LIABILITY_BASIS_LABELS[secim.dayanak] ?? secim.dayanak}` : ""}
                            {secim.borclular.map((borclu) => (
                              <span key={borclu.debtorId} className="block text-gray-700">
                                {nameOf(borclu.debtorId)}:{" "}
                                {borclu.pay !== null
                                  ? `pay ${money(borclu.pay, currency)}`
                                  : borclu.sinirsiz
                                    ? "tavan yok (kalemin tamamı)"
                                    : borclu.tavan !== null
                                      ? `tavan ${money(borclu.tavan, currency)}`
                                      : "kalemin tamamı"}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded border border-blue-100 bg-white p-2 text-xs">
              <p className="font-medium text-gray-900">Dosya toplamı</p>
              <p data-testid="opening-preview-total" className="mt-0.5 text-base font-semibold text-blue-950">
                {money(preview.kalemTutarlariToplami, currency)}
              </p>
              <p className="text-[11px] leading-snug text-gray-600">{preview.aciklamalar.toplam}</p>
              {excludedInstrumentCount > 0 && (
                <p data-testid="opening-preview-instrument-note" className="mt-1 text-[11px] leading-snug text-gray-600">
                  {excludedInstrumentCount} çek / senet kalemi evrak kaydı olarak açılır ve bu toplama dahil değildir; bu kalemlerde faiz beyanı
                  ve sorumluluk seçimi dosya açıldıktan sonra yapılır.
                </p>
              )}
            </div>
            <div className="rounded border border-blue-100 bg-white p-2 text-xs">
              <p className="font-medium text-gray-900">Borçlu başına dağılım</p>
              {preview.borcluDagilimi.length === 0 ? (
                <p className="mt-0.5 text-gray-600">Dosyada borçlu yok.</p>
              ) : (
                <ul className="mt-1 space-y-1.5">
                  {preview.borcluDagilimi.map((borclu) => (
                    <li key={borclu.debtorId} data-testid="opening-preview-debtor">
                      <p className="font-medium text-gray-900">{nameOf(borclu.debtorId)}</p>
                      <ul className="text-[11px] text-gray-700">
                        {borclu.kalemler.map((satir) => (
                          <li key={satir.dueIndex}>
                            {itemLabel(satir.dueIndex)}: {OPENING_LIABILITY_KIND_LABELS[satir.durum] ?? satir.durum}
                            {satir.sorumlulukSiniri !== null && satir.durum !== "SECIMDE_YOK" ? ` — en çok ${money(satir.sorumlulukSiniri, currency)}` : ""}
                          </li>
                        ))}
                      </ul>
                      <p data-testid="opening-preview-debtor-total" className="text-[11px] font-medium text-gray-900">
                        {borclu.sorumlulukUstSiniri !== null
                          ? `Seçimler onaylanırsa kalem tutarları üzerinden en çok: ${money(borclu.sorumlulukUstSiniri, currency)}`
                          : `Borçlu toplamı belirlenemedi (${borclu.belirlenmeyenKalemSayisi} kalemin sorumluluğu belirlenmedi).`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {selectionBlocked && (
            <p data-testid="opening-preview-selection-disabled" role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
              Borçlu sorumluluğu seçimi bu ortamda kapalı. Seçim kaldırılmadan dosya oluşturulamaz; seçim dosya açıldıktan sonra yapılabilir.
            </p>
          )}

          {(preview.onayaGidecekFaizBeyaniSayisi > 0 || preview.onayaGidecekSorumlulukSecimiSayisi > 0) && (
            <p data-testid="opening-preview-approval-note" className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-900">
              {preview.aciklamalar.onay}
              {preview.onayaGidecekFaizBeyaniSayisi > 0 && preview.onayaGidecekSorumlulukSecimiSayisi > 0 ? ` ${preview.aciklamalar.onaySirasi}` : ""}
            </p>
          )}
          <p className="text-[11px] leading-snug text-gray-600">
            {preview.aciklamalar.kullaniciTercihi}{" "}
            <span data-testid="opening-preview-draft-panel-note">
              Kalem formundaki &quot;Hesap Özeti&quot; taslak bir ön hesaptır ve aynı kuralı uygular: onay bekleyen ya da faiz durumu
              belirlenmemiş faiz orada da hesaba katılmaz. Dosya açıldıktan sonraki hesap kayıtlı ve onaylanmış bilgilere göre yapılır.
            </span>
          </p>
        </div>
      )}
    </section>
  );
}
