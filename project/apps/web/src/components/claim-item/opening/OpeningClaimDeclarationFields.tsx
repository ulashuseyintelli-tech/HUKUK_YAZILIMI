"use client";

import {
  ATTORNEY_FEE_BASIS_LABELS,
  CLAIM_LIABILITY_BASIS_OPTIONS,
  INTEREST_ACCRUAL_STATUS_LABELS,
  INTEREST_START_PROVENANCE_OPTIONS,
  PROVENANCE_WITHOUT_START_DATE,
  type AttorneyFeeBasis,
  type InterestStartDateProvenanceCode,
} from "../claim-item-labels";
import {
  canMarkIlamSourced,
  emptyOpeningParty,
  hasInterestInput,
  isAttorneyFeeKind,
  normalizeOpeningClaimDeclaration,
  type OpeningClaimDeclaration,
  type OpeningLiabilityMode,
  type OpeningPartyForm,
} from "@/lib/case-opening-claims";

/**
 * Yeni dosya formu — kalemin AÇILIŞ BEYANLARI (owner talimatı 2026-11-18).
 *
 * Dört grup: vekâlet ücreti kaynağı · ilam bilgisi (ilamdan doğan fer'i kalem) · faiz · borçlu sorumluluğu.
 *
 * - Hiçbir alan ön seçili değildir. Yazılım ilamdan, borçlu rolünden ya da borçlu sayısından sonuç çıkarmaz; girilmeyen
 *   bilgi "belirlenmedi" kalır.
 * - Vekâlet ücreti kaynağı ve ilam bilgisi açılışta kaleme yazılır. "Faiz işler" beyanı ve sorumluluk seçimi kaleme
 *   yazılmaz; dosya oluşturulduktan sonra ikinci kişinin onayına gider.
 * - Bileşen HESAP YAPMAZ ve kural denetlemez: paylar, tavan sonuçları ve girdi hataları sunucunun açılış önizlemesinden
 *   gelir (bkz. `OpeningClaimPreviewCard`).
 * - Etiketler sonradan düzenlemeyle aynı kaynaktan (`claim-item-labels.ts`).
 */
export interface OpeningIlamInfo {
  mahkemeAdi?: string;
  esasNo?: string;
  kararNo?: string;
  ilamTarihi?: string;
  kesinlesmeTarihi?: string;
}

const MODE_OPTIONS: Array<{ value: "" | OpeningLiabilityMode; label: string; hint: string }> = [
  { value: "", label: "Belirlenmedi", hint: "Seçim yapılmaz; kalem seçimsiz açılır. Borçluya özgü kesin rakam üretilmez." },
  { value: "JOINT_AND_SEVERAL", label: "Müteselsil", hint: "Seçilen her borçlu kalemin tamamından sorumludur." },
  { value: "PROPORTIONAL", label: "Paylı sorumluluk", hint: "Her borçlu yalnız kendi payından sorumludur; paylar kalemin tam tutarından hesaplanır." },
  { value: "CAPPED", label: "Tutarla sınırlı", hint: "Borçlu, bu kalemin kayıtlı tutarından en çok belirtilen tavana kadar sorumludur." },
];

// `min-w-0`: fieldset'in varsayılan en küçük genişliği (içeriği kadar) yatay taşmaya yol açmasın.
const groupClass = "min-w-0 rounded-lg border border-gray-200 bg-white px-3 pb-2 pt-1";
const legendClass = "px-1 text-xs font-semibold text-gray-800";
const labelClass = "block text-[11px] font-medium text-gray-600 mb-0.5";
const inputClass = "w-full rounded border border-gray-300 px-2 py-1 text-xs";
const hintClass = "mt-1 text-[11px] leading-snug text-gray-500";

export function OpeningClaimDeclarationFields({
  kalemTuru,
  value,
  onChange,
  ilamBilgileri,
  onIlamChange,
  debtors,
  interestIsNone,
  unavailableReason = null,
  copySourceLabel = null,
  onCopyFromLast,
}: {
  kalemTuru: string;
  value: unknown;
  onChange: (next: OpeningClaimDeclaration) => void;
  ilamBilgileri?: OpeningIlamInfo | null;
  onIlamChange: (next: OpeningIlamInfo) => void;
  /** Dosyanın borçluları (kişi kimliği + ad). */
  debtors: ReadonlyArray<{ debtorId: string; name: string }>;
  /** Kalemde "faiz yok" seçili mi (faiz türü alanından). */
  interestIsNone: boolean;
  /** Dolu ise bu kalemde açılış beyanı alınamaz (ör. evrak kaydına yönlenen çek / senet); neden gösterilir. */
  unavailableReason?: string | null;
  /** Listede önceki kalem varsa beyanı oradan kopyalama düğmesi gösterilir (kullanıcının açık eylemi). */
  copySourceLabel?: string | null;
  onCopyFromLast?: () => void;
}) {
  const declaration = normalizeOpeningClaimDeclaration(value);
  const liability = declaration.sorumluluk;
  const update = (patch: Partial<OpeningClaimDeclaration>) => onChange({ ...declaration, ...patch });
  const updateLiability = (patch: Partial<OpeningClaimDeclaration["sorumluluk"]>) => update({ sorumluluk: { ...liability, ...patch } });
  const updateParty = (debtorId: string, patch: Partial<OpeningPartyForm>) =>
    updateLiability({ parties: { ...liability.parties, [debtorId]: { ...(liability.parties[debtorId] ?? emptyOpeningParty()), ...patch } } });
  const updateIlam = (patch: Partial<OpeningIlamInfo>) => onIlamChange({ ...(ilamBilgileri ?? {}), ...patch });

  if (unavailableReason) {
    return (
      <div data-testid="opening-declaration-unavailable" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        {unavailableReason}
      </div>
    );
  }

  const showFee = isAttorneyFeeKind(kalemTuru);
  const showIlam = canMarkIlamSourced(kalemTuru);
  const showInterest = hasInterestInput(kalemTuru);
  const basisNoteRequired = CLAIM_LIABILITY_BASIS_OPTIONS.find((option) => option.value === liability.basis)?.noteRequired === true;
  const startDateFromCase = declaration.faizDayanak === PROVENANCE_WITHOUT_START_DATE;

  return (
    <div data-testid="opening-declaration-fields" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-800">Açılış beyanları</p>
        {copySourceLabel && onCopyFromLast && (
          <button
            type="button"
            data-testid="opening-copy-from-last"
            onClick={onCopyFromLast}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
            title="İlam bilgisi, faiz beyanı ve sorumluluk seçimi kopyalanır; kopyalanan değerleri bu kalem için kontrol edin."
          >
            Listedeki son kalemden kopyala ({copySourceLabel})
          </button>
        )}
      </div>

      {/* Geniş ekranda gruplar yan yana: [kaynak | faiz] · [ilam] · [sorumluluk] — dikey uzunluk (iç kaydırma) azalır. */}
      <div className="grid gap-2 lg:grid-cols-6">
        {showFee && (
          <fieldset className={`${groupClass} lg:order-1 lg:col-span-2`} data-testid="opening-attorney-fee-basis-group">
            <legend className={legendClass}>Vekâlet ücretinin kaynağı</legend>
            <label className={labelClass} htmlFor="opening-attorney-fee-basis">
              Kaynak
            </label>
            <select
              id="opening-attorney-fee-basis"
              data-testid="opening-attorney-fee-basis"
              value={declaration.vekaletUcretiKaynagi}
              onChange={(e) => update({ vekaletUcretiKaynagi: e.target.value as "" | AttorneyFeeBasis })}
              className={inputClass}
            >
              <option value="">{ATTORNEY_FEE_BASIS_LABELS.UNKNOWN}</option>
              <option value="JUDGMENT_AWARDED">{ATTORNEY_FEE_BASIS_LABELS.JUDGMENT_AWARDED}</option>
              <option value="ENFORCEMENT_TARIFF">{ATTORNEY_FEE_BASIS_LABELS.ENFORCEMENT_TARIFF}</option>
            </select>
            <p className={hintClass}>Açılışta kaleme yazılır. Seçilmezse kaynak bilinmiyor kalır; açıklamadan ya da belge türünden çıkarım yapılmaz.</p>
          </fieldset>
        )}

        {showIlam && (
          <fieldset className={`${groupClass} lg:order-3 lg:col-span-6`} data-testid="opening-ilam-group">
            <legend className={legendClass}>İlam bilgisi</legend>
            <label className="flex items-center gap-2 text-xs text-gray-800">
              <input
                type="checkbox"
                data-testid="opening-ilam-sourced"
                checked={declaration.ilamKaynakli}
                onChange={(e) => update({ ilamKaynakli: e.target.checked })}
              />
              Bu kalem ilamdan doğuyor
            </label>
            {declaration.ilamKaynakli && (
              <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <div className="col-span-2">
                  <label className={labelClass} htmlFor="opening-ilam-court">Mahkeme</label>
                  <input id="opening-ilam-court" data-testid="opening-ilam-court" type="text" value={ilamBilgileri?.mahkemeAdi ?? ""} onChange={(e) => updateIlam({ mahkemeAdi: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="opening-ilam-esas">Esas no</label>
                  <input id="opening-ilam-esas" data-testid="opening-ilam-esas" type="text" value={ilamBilgileri?.esasNo ?? ""} onChange={(e) => updateIlam({ esasNo: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="opening-ilam-karar">Karar no</label>
                  <input id="opening-ilam-karar" data-testid="opening-ilam-karar" type="text" value={ilamBilgileri?.kararNo ?? ""} onChange={(e) => updateIlam({ kararNo: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="opening-ilam-date">Karar tarihi</label>
                  <input id="opening-ilam-date" data-testid="opening-ilam-date" type="date" value={ilamBilgileri?.ilamTarihi ?? ""} onChange={(e) => updateIlam({ ilamTarihi: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="opening-ilam-finalization">Kesinleşme tarihi</label>
                  <input id="opening-ilam-finalization" data-testid="opening-ilam-finalization" type="date" value={ilamBilgileri?.kesinlesmeTarihi ?? ""} onChange={(e) => updateIlam({ kesinlesmeTarihi: e.target.value })} className={inputClass} />
                </div>
              </div>
            )}
            <p className={hintClass}>
              Açılışta kaleme yazılır. Kesinleşme tarihi yalnız kayıttır; faiz başlangıcı bu alandan türetilmez. İlam belgesi dosya açıldıktan sonra
              Belgeler sekmesinden yüklenir.
            </p>
          </fieldset>
        )}

        {showInterest && (
          <fieldset className={`${groupClass} lg:order-2 ${showFee ? "lg:col-span-4" : "lg:col-span-6"}`} data-testid="opening-interest-group">
            <legend className={legendClass}>Faiz</legend>
            {interestIsNone ? (
              <p data-testid="opening-interest-none" className="text-xs text-gray-800">
                Faiz durumu: <span className="font-medium">{INTEREST_ACCRUAL_STATUS_LABELS.NO_INTEREST}</span> (faiz türü &quot;Faiz Yok&quot; seçili; gerekçe
                yukarıda). Değiştirmek için önce faiz türünü seçin.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div>
                    <label className={labelClass} htmlFor="opening-interest-status">Faiz durumu</label>
                    <select
                      id="opening-interest-status"
                      data-testid="opening-interest-status"
                      value={declaration.faizIsler ? "ACCRUES" : "UNKNOWN"}
                      onChange={(e) => update({ faizIsler: e.target.value === "ACCRUES" })}
                      className={inputClass}
                    >
                      <option value="UNKNOWN">{INTEREST_ACCRUAL_STATUS_LABELS.UNKNOWN}</option>
                      <option value="ACCRUES">{INTEREST_ACCRUAL_STATUS_LABELS.ACCRUES}</option>
                    </select>
                  </div>
                  {declaration.faizIsler && (
                    <>
                      <div>
                        <label className={labelClass} htmlFor="opening-interest-provenance">Başlangıcın dayanağı</label>
                        <select
                          id="opening-interest-provenance"
                          data-testid="opening-interest-provenance"
                          value={declaration.faizDayanak}
                          onChange={(e) => update({ faizDayanak: e.target.value as "" | InterestStartDateProvenanceCode })}
                          className={inputClass}
                        >
                          <option value="">Seçiniz</option>
                          {INTEREST_START_PROVENANCE_OPTIONS.map((option) => (
                            <option key={option.code} value={option.code}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="opening-interest-start">Başlangıç tarihi</label>
                        {startDateFromCase ? (
                          <p data-testid="opening-interest-start-from-case" className="rounded border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-600">
                            Takip tarihinden alınır
                          </p>
                        ) : (
                          <input
                            id="opening-interest-start"
                            data-testid="opening-interest-start"
                            type="date"
                            value={declaration.faizBaslangic}
                            onChange={(e) => update({ faizBaslangic: e.target.value })}
                            className={inputClass}
                          />
                        )}
                      </div>
                    </>
                  )}
                </div>
                <p className={hintClass}>
                  {declaration.faizIsler
                    ? "Faiz türü yukarıdaki \"Uygulanacak Faiz\" alanından alınır. Bu beyan kaleme yazılmaz: dosya oluşturulduktan sonra ikinci kişinin onayına gider; onaylanana kadar kalemin faizi \"belirlenmedi\" görünür ve hesaplanmaz."
                    : "\"Belirlenmedi\" ile \"faiz işlemez\" aynı şey değildir. Faiz işlemeyecekse faiz türünü \"Faiz Yok\" seçip gerekçe girin."}
                </p>
              </>
            )}
          </fieldset>
        )}

        <fieldset className={`${groupClass} lg:order-4 lg:col-span-6`} data-testid="opening-liability-group">
          <legend className={legendClass}>Borçlu sorumluluğu</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {MODE_OPTIONS.map((option) => (
              <label
                key={option.value || "none"}
                className={`flex items-start gap-2 rounded border px-2 py-1.5 text-xs ${liability.mode === option.value ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}
              >
                <input
                  type="radio"
                  name="opening-liability-mode"
                  data-testid={`opening-liability-mode-${option.value || "NONE"}`}
                  checked={liability.mode === option.value}
                  onChange={() => updateLiability({ mode: option.value })}
                />
                <span>
                  <span className="font-medium text-gray-900">{option.label}</span>
                  <span className="block text-[11px] leading-snug text-gray-600">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>

          {liability.mode && debtors.length === 0 && (
            <p data-testid="opening-liability-no-debtors" className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
              Dosyada borçlu yok. Sorumluluk seçimi için önce Borçlular adımında borçlu ekleyin.
            </p>
          )}

          {liability.mode && debtors.length > 0 && (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-gray-800">İlgili borçlular</p>
                {liability.mode === "PROPORTIONAL" && (
                  <div className="mt-1 flex flex-wrap gap-4 text-xs">
                    <label className="flex items-center gap-1">
                      <input type="radio" name="opening-liability-share-kind" data-testid="opening-liability-share-equal" checked={liability.shareKind === "EQUAL"} onChange={() => updateLiability({ shareKind: "EQUAL" })} />
                      Eşit pay
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="radio" name="opening-liability-share-kind" data-testid="opening-liability-share-percent" checked={liability.shareKind === "PERCENT"} onChange={() => updateLiability({ shareKind: "PERCENT" })} />
                      Oran gir (toplam tam 100,00)
                    </label>
                  </div>
                )}
                <ul className="mt-1 space-y-1">
                  {debtors.map((debtor) => {
                    const form = liability.parties[debtor.debtorId] ?? emptyOpeningParty();
                    return (
                      <li key={debtor.debtorId} className="flex flex-wrap items-center gap-2 rounded border border-gray-200 px-2 py-1.5 text-xs">
                        <label className="flex min-w-0 flex-1 items-center gap-2">
                          <input
                            type="checkbox"
                            data-testid={`opening-liability-party-${debtor.debtorId}`}
                            checked={form.selected}
                            onChange={(e) => updateParty(debtor.debtorId, { selected: e.target.checked })}
                          />
                          <span className="truncate">{debtor.name || "Adsız borçlu"}</span>
                        </label>
                        {liability.mode === "PROPORTIONAL" && liability.shareKind === "PERCENT" && form.selected && (
                          <input
                            aria-label={`${debtor.name} oran (%)`}
                            data-testid={`opening-liability-percent-${debtor.debtorId}`}
                            value={form.percent}
                            onChange={(e) => updateParty(debtor.debtorId, { percent: e.target.value })}
                            placeholder="%"
                            inputMode="decimal"
                            className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-xs"
                          />
                        )}
                        {liability.mode === "CAPPED" && form.selected && (
                          <>
                            <input
                              aria-label={`${debtor.name} tavan`}
                              data-testid={`opening-liability-limit-${debtor.debtorId}`}
                              // "Tavan yok" işaretliyken kutu boş görünür; yazılan değer saklanır, sunucuya gitmez.
                              value={form.unlimited ? "" : form.limit}
                              disabled={form.unlimited}
                              onChange={(e) => updateParty(debtor.debtorId, { limit: e.target.value })}
                              placeholder="Tavan"
                              inputMode="decimal"
                              className="w-28 rounded border border-gray-300 px-2 py-1 text-right text-xs disabled:bg-gray-100"
                            />
                            <label className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                data-testid={`opening-liability-unlimited-${debtor.debtorId}`}
                                checked={form.unlimited}
                                onChange={(e) => updateParty(debtor.debtorId, { unlimited: e.target.checked })}
                              />
                              Tavan yok
                            </label>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {liability.mode === "CAPPED" && (
                  <p className={hintClass}>Tavan yalnız bu kalemin kayıtlı tutarını kapsar; kaleme işleyen faiz ve diğer kalemler kapsam dışıdır.</p>
                )}
              </div>
              <div>
                <label className={labelClass} htmlFor="opening-liability-basis">Dayanak</label>
                <select
                  id="opening-liability-basis"
                  data-testid="opening-liability-basis"
                  value={liability.basis}
                  onChange={(e) => updateLiability({ basis: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Seçiniz</option>
                  {CLAIM_LIABILITY_BASIS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <textarea
                  aria-label="Dayanak açıklaması"
                  data-testid="opening-liability-basis-note"
                  value={liability.basisNote}
                  onChange={(e) => updateLiability({ basisNote: e.target.value })}
                  placeholder={basisNoteRequired ? "Açıklama (zorunlu)" : "Açıklama (isteğe bağlı)"}
                  rows={1}
                  className={`${inputClass} mt-1`}
                />
              </div>
            </div>
          )}

          <p className={hintClass} data-testid="opening-liability-note">
            Bu seçim kullanıcı tercihidir; yazılım ilam metninden, borçlu rolünden ya da borçlu sayısından sorumluluk türü çıkarmaz.
            {liability.mode
              ? " Seçim kaleme yazılmaz: dosya oluşturulduktan sonra ikinci kişinin onayına gider; onaylanana kadar kalem \"belirlenmedi\" görünür. Paylar ve girdi denetimi aşağıdaki açılış önizlemesinde gösterilir."
              : " Seçim dosya açıldıktan sonra da yapılabilir."}
          </p>
        </fieldset>
      </div>
    </div>
  );
}
