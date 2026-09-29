/**
 * K3-L Faz 2 (owner GO 2026-09-29 §5) — resmi belge üretimi için SAF yardımcılar:
 *  - takip yolu (proceeding kind) çözümü: kanonik alanlar (Case.proceedingType → FormType → Case.type → subCategory)
 *    ve istemci yolundan gelen eski etiketler ('CEK', 'KAMBIYO_SENET', 'ILAMLI', …) TEK yerde çözülür;
 *  - alacak kalemi uygunluğu (yalnız ETKİN, sanal olmayan kalem belgeye girer);
 *  - toplamlar: listelenen HER kalem toplama girer (çek tazminatı, vekalet ücreti, vergiler dahil) → satırlar ile
 *    "toplam" tutar birbirini tutar; kanonik tutar `demandedAmount`;
 *  - borçlu rol etiketleri DebtorRole enum'una göre; avukat unvanı ('Av.') tek yerde soyulur (şablon ekler).
 *
 * Hukuki metin ÜRETİLMEZ; yalnız mevcut şablonlar doğru veriyle seçilir. Gerçek örnek belge/UYAP alanı doğrulanmadı.
 */

export type ProceedingKind = 'ILAMSIZ' | 'KAMBIYO_CEK' | 'KAMBIYO_SENET' | 'ILAMLI' | 'NAFAKA' | 'KIRA';

export interface ProceedingClassificationSource {
  readonly type?: string | null;
  readonly subCategory?: string | null;
  readonly proceedingType?: string | null;
  readonly formType?: {
    readonly procedureType?: string | null;
    readonly isKambiyo?: boolean | null;
    readonly isRental?: boolean | null;
    readonly hasJudgment?: boolean | null;
  } | null;
}

const CEK_INSTRUMENT_TYPES = new Set(['CEK']);

function kambiyoKind(source: ProceedingClassificationSource, instrumentTypes: readonly string[]): ProceedingKind {
  if (instrumentTypes.some((t) => CEK_INSTRUMENT_TYPES.has(String(t).toUpperCase()))) return 'KAMBIYO_CEK';
  if (instrumentTypes.length > 0) return 'KAMBIYO_SENET';
  if (source.type === 'CHECK') return 'KAMBIYO_CEK';
  if (source.type === 'BOND') return 'KAMBIYO_SENET';
  return 'KAMBIYO_SENET';
}

/**
 * Kanonik alanlardan takip yolu. Öncelik: subCategory NAFAKA → proceedingType → formType → Case.type → subCategory.
 * Karşılığı olmayan yollar (rehin/ipotek/iflas/kamu alacağı) için ayrı şablon yok → ILAMSIZ (bilinçli, kayıt altında).
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - TemplateEngineService.getCaseData() → TemplateData.proceedingKind
 * /// </remarks>
 */
export function resolveProceedingKind(
  source: ProceedingClassificationSource,
  instrumentTypes: readonly string[] = [],
): ProceedingKind {
  if (source.subCategory === 'NAFAKA') return 'NAFAKA';
  switch (source.proceedingType) {
    case 'CAMBIO':
      return kambiyoKind(source, instrumentTypes);
    case 'JUDGMENT_ENFORCEMENT':
      return 'ILAMLI';
    case 'RENT':
    case 'EVICTION':
      return 'KIRA';
    case 'GENERAL_EXECUTION':
      return source.subCategory === 'KIRA' ? 'KIRA' : 'ILAMSIZ';
    default:
      break;
  }
  const form = source.formType;
  if (form) {
    if (form.isKambiyo || form.procedureType === 'KAMBIYO') return kambiyoKind(source, instrumentTypes);
    if (form.procedureType === 'ILAMLI' || form.hasJudgment) return 'ILAMLI';
    if (form.isRental || form.procedureType === 'KIRA_ALACAK' || form.procedureType === 'TAHLIYE') return 'KIRA';
  }
  if (source.type === 'CHECK') return kambiyoKind(source, instrumentTypes.length ? instrumentTypes : ['CEK']);
  if (source.type === 'BOND') return kambiyoKind(source, instrumentTypes.length ? instrumentTypes : ['SENET']);
  if (source.type === 'RENTAL' || source.subCategory === 'KIRA') return 'KIRA';
  return resolveProceedingKindFromLabels(source.type, source.subCategory);
}

/**
 * Eski/istemci etiketlerinden takip yolu ('CEK', 'KAMBIYO_CEK', 'SENET', 'ILAMLI_GENEL', 'NAFAKA', 'KIRA' …).
 * İstemci verisiyle çalışan yol (POST /template-engine/takip-talebi/*) ve TemplateData.proceedingKind taşımayan
 * çağıranlar için. Tanınmayan → ILAMSIZ.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - TemplateEngineService.getTemplateCode()/generateOdemeEmri()/generateIcraEmri() (proceedingKind yoksa)
 * ///  - normalizeClientTemplateData()
 * /// </remarks>
 */
export function resolveProceedingKindFromLabels(caseType?: string | null, subCategory?: string | null): ProceedingKind {
  const labels = [subCategory, caseType].map((v) => String(v ?? '').toUpperCase());
  for (const label of labels) {
    if (label === 'CEK' || label === 'KAMBIYO_CEK' || label === 'CHECK') return 'KAMBIYO_CEK';
    if (label === 'SENET' || label === 'BONO' || label === 'KAMBIYO_SENET' || label === 'BOND') return 'KAMBIYO_SENET';
    if (label === 'NAFAKA' || label === 'ILAMLI_NAFAKA') return 'NAFAKA';
    if (label === 'ILAMLI' || label === 'ILAMLI_GENEL' || label === 'ILAM') return 'ILAMLI';
    if (label === 'KIRA' || label === 'RENTAL' || label === 'KIRA_ALACAK') return 'KIRA';
  }
  return 'ILAMSIZ';
}

export const TAKIP_TALEBI_TEMPLATE_BY_KIND: Readonly<Record<ProceedingKind, string>> = Object.freeze({
  ILAMSIZ: 'ORNEK_1_ILAMSIZ',
  KAMBIYO_CEK: 'ORNEK_1_KAMBIYO_CEK',
  KAMBIYO_SENET: 'ORNEK_1_KAMBIYO_SENET',
  ILAMLI: 'ORNEK_1_ILAMLI',
  NAFAKA: 'ORNEK_1_NAFAKA',
  KIRA: 'ORNEK_1_KIRA',
});

export function isKambiyoKind(kind: ProceedingKind): boolean {
  return kind === 'KAMBIYO_CEK' || kind === 'KAMBIYO_SENET';
}

/** Belgeye giren kalem: ETKİN ve sanal olmayan (status/isVirtual taşımayan eski kaynak — Due — olduğu gibi kabul). */
export function isTemplateEligibleClaimItem(item: { status?: string | null; isVirtual?: boolean | null }): boolean {
  if (item.status && String(item.status) !== 'ACTIVE') return false;
  if (item.isVirtual === true) return false;
  return true;
}

const CLAIM_ITEM_TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  PRINCIPAL: 'Asıl Alacak',
  ASIL_ALACAK: 'Asıl Alacak',
  KIRA_ALACAGI: 'Kira Alacağı',
  INTEREST: 'İşlemiş Faiz',
  ISLEMIS_FAIZ: 'İşlemiş Faiz',
  PRE_INTEREST: 'Takip Öncesi Faiz',
  POST_INTEREST: 'Takip Sonrası Faiz',
  EXPENSE: 'Masraf',
  MASRAF: 'Masraf',
  FEE: 'Harç',
  POSTAGE: 'Posta Gideri',
  STAMP: 'Damga Vergisi',
  ATTORNEY_FEE: 'Vekalet Ücreti',
  PENALTY: 'Cezai Şart',
  CHECK_PENALTY: 'Çek Tazminatı',
  CONTRACTUAL_PENALTY: 'Sözleşme Cezası',
  TAX_KDV: 'KDV',
  TAX_BSMV: 'BSMV',
  TAX_KKDF: 'KKDF',
  OTHER: 'Diğer Alacak',
});

export function getClaimItemTypeLabel(type: string): string {
  return CLAIM_ITEM_TYPE_LABELS[String(type).toUpperCase()] ?? 'Alacak Kalemi';
}

const PRINCIPAL_TYPES = new Set(['PRINCIPAL', 'ASIL_ALACAK', 'KIRA_ALACAGI']);
const INTEREST_TYPES = new Set(['INTEREST', 'ISLEMIS_FAIZ', 'PRE_INTEREST', 'POST_INTEREST']);

export interface TemplateTotals {
  principal: number;
  interest: number;
  fees: number;
  total: number;
  currency: string;
}

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Toplamlar: asıl alacak / faiz / fer'iler (masraf, harç, vekalet ücreti, cezai şart, ÇEK TAZMİNATI, vergiler, diğer).
 * Listelenen her kalem üç kovadan birine girer → total = tüm satırların toplamı; hiçbir kalem "satırda var, toplamda yok"
 * kalmaz. Fer'i tazminat fazladan hesaplanmaz; yalnız kayıtlı kalem toplanır.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - TemplateEngineService.getCaseData(), normalizeClientTemplateData()
 * /// </remarks>
 */
export function computeTemplateTotals(
  claimItems: ReadonlyArray<{ type: string; amount: number }>,
  currency: string,
): TemplateTotals {
  let principal = 0;
  let interest = 0;
  let fees = 0;
  for (const item of claimItems) {
    const amount = Number(item.amount) || 0;
    const type = String(item.type).toUpperCase();
    if (PRINCIPAL_TYPES.has(type)) principal += amount;
    else if (INTEREST_TYPES.has(type)) interest += amount;
    else fees += amount;
  }
  principal = money(principal);
  interest = money(interest);
  fees = money(fees);
  return { principal, interest, fees, total: money(principal + interest + fees), currency };
}

/** DebtorRole enum → belge etiketi (enum'da olmayan eski anahtarlar kaldırıldı; bilinmeyen ham kod DEĞİL 'Borçlu'). */
export const DEBTOR_ROLE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ASIL_BORCLU: 'Asıl Borçlu',
  MUSETEREK_BORCLU: 'Müşterek Borçlu',
  ADI_KEFIL: 'Adi Kefil',
  MUTESELSIL_KEFIL: 'Müteselsil Kefil',
  AVAL: 'Aval Veren',
  CIRANTA: 'Ciranta',
  LEHDAR: 'Lehdar',
  KESIDECI: 'Keşideci',
  MUHATAP: 'Muhatap',
  MIRASCI: 'Mirasçı',
  TASFIYE_MEMURU: 'Tasfiye Memuru',
  IFLAS_MASASI: 'İflas Masası',
});

export function getDebtorRoleLabelFromEnum(role?: string | null): string {
  if (!role) return 'Borçlu';
  return DEBTOR_ROLE_LABELS[String(role).toUpperCase()] ?? 'Borçlu';
}

/** 'Av.' / 'Av ' unvanını soyar; şablon ve Word/PDF üreticileri unvanı TEK kez kendileri ekler ('Av.Av.' biter). */
export function stripLawyerTitle(name: string | null | undefined): string {
  return String(name ?? '').replace(/^\s*av\.?\s*/i, '').trim();
}

/** İmzacı avukat önce: hasSignatureAuthority → isResponsible → kayıt sırası (kararlı). */
export function orderLawyersForSignature<T extends { hasSignatureAuthority?: boolean | null; isResponsible?: boolean | null }>(
  lawyers: readonly T[],
): T[] {
  const score = (l: T) => (l.hasSignatureAuthority ? 2 : 0) + (l.isResponsible ? 1 : 0);
  return [...lawyers].sort((a, b) => score(b) - score(a));
}

/** İstemci belge önizlemesinin ClaimItemType dışı tipleri (web formu) → kanonik tip. */
const CLIENT_CLAIM_TYPE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  COMPENSATION: 'CHECK_PENALTY',
  CEK_TAZMINATI: 'CHECK_PENALTY',
  COMMISSION: 'OTHER',
  KOMISYON: 'OTHER',
});

export function normalizeClientClaimItemType(type: string): string {
  const upper = String(type ?? '').toUpperCase();
  return CLIENT_CLAIM_TYPE_ALIASES[upper] ?? upper;
}

export const DRAFT_DOCUMENT_NOTICE =
  'TASLAK — onay bekliyor, gönderime hazır değil. Bu belge sunucu kaydına dayanmayan önizleme verisiyle üretildi; resmi belge dosya kaydından üretilir.';

/**
 * İstemci verisiyle üretilen takip talebi (POST /template-engine/takip-talebi/*) için normalizasyon: tip takma
 * adları, avukat unvanı, toplamlar SUNUCUDA kalemlerden yeniden hesaplanır (istemci toplamı ezilir), takip yolu
 * etiketten çözülür. Kayıt yazılmaz; çıktı TASLAK olarak işaretlenir.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - TemplateEngineService.generateTakipTalebiWord()/generateTakipTalebiPdf() (istemci yolu)
 * /// </remarks>
 */
export function normalizeClientTemplateData<T extends {
  claimItems: Array<{ type: string; description: string; amount: number; currency: string }>;
  totals: TemplateTotals;
  lawyers: Array<{ name: string }>;
  caseType: string;
  subCategory: string;
  proceedingKind?: ProceedingKind;
}>(data: T): T & { proceedingKind: ProceedingKind; isDraft: true } {
  const claimItems = (data.claimItems ?? []).map((item) => {
    const type = normalizeClientClaimItemType(item.type);
    return { ...item, type, description: item.description || getClaimItemTypeLabel(type), amount: Number(item.amount) || 0 };
  });
  const currency = data.totals?.currency || claimItems[0]?.currency || 'TRY';
  return {
    ...data,
    claimItems,
    totals: computeTemplateTotals(claimItems, currency),
    lawyers: (data.lawyers ?? []).map((l) => ({ ...l, name: stripLawyerTitle(l.name) })),
    proceedingKind: data.proceedingKind ?? resolveProceedingKindFromLabels(data.caseType, data.subCategory),
    isDraft: true,
  };
}
