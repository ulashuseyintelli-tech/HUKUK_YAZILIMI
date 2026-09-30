/**
 * K3-L Faz 2 (owner GO 2026-09-29 §5 + owner kararı 2026-09-30) — resmi belge üretimi için SAF yardımcılar.
 *
 * TAKİP YOLU SEÇİMİ (owner kararı 2026-09-30): şablon, AÇIKÇA SEÇİLMİŞ takip yolu ve belge türüne dayanır.
 *  - "Çek dosyası → kambiyo" OTOMATİK VARSAYIMI YOKTUR: dosya türü (CHECK/BOND), enstrüman kaydı veya kalem türü
 *    ('CEK') tek başına takip yolunu BELİRLEMEZ — alacaklı çekle genel haciz yolunu da seçebilir.
 *  - Açık seçim kaynakları (öncelik sırasıyla): Case.proceedingType (kanonik) → Case.takipTuru.code (kullanıcının
 *    "Takip Türü" seçimi) → seçilen form (Case.formType ya da Case.subType form kodu) → Case.subType açık etiketi.
 *  - Açık seçim YOKSA kambiyo SEÇİLMEZ: önceki davranış (ilamsız) korunur ve seçimin açık olmadığı SESSİZ BIRAKILMAZ
 *    (selection.explicit=false + uyarı kodu; denetim kaydına ve yanıt başlığına yansır).
 *  - Belge türü (çek / senet) yalnız takip yolu AÇIKÇA kambiyo olduğunda alt şablonu belirler.
 *
 * DİĞER: alacak kalemi uygunluğu (yalnız ETKİN, sanal olmayan); toplamlar (listelenen HER kalem toplama girer;
 * kanonik tutar `demandedAmount`); rol etiketleri DebtorRole enum'undan; avukat unvanı tek yerde soyulur.
 *
 * Hukuki metin ÜRETİLMEZ; yalnız mevcut şablonlar seçilir. Şablon biçimi gerçek örnek belge / UYAP şemasıyla
 * DOĞRULANMADI — üretilen belge adliye/UYAP kabulü tamamlanmış SAYILMAZ.
 */

export type ProceedingKind =
  | 'ILAMSIZ'
  | 'KAMBIYO_CEK'
  | 'KAMBIYO_SENET'
  /** Takip yolu açıkça kambiyo, ama belge türü (çek/senet) belirlenemedi → takip talebi şablonu SEÇİLEMEZ */
  | 'KAMBIYO_BELGE_TURU_BELIRSIZ'
  | 'ILAMLI'
  | 'NAFAKA'
  | 'KIRA';

export type ProceedingSelectionBasis =
  | 'PROCEEDING_TYPE' // Case.proceedingType (kanonik takip türü)
  | 'TAKIP_TURU' // Case.takipTuru.code — kullanıcının "Takip Türü" seçimi
  | 'FORM_TYPE' // seçilen form (Case.formType ya da Case.subType form kodu)
  | 'SUB_TYPE_LABEL' // Case.subType üzerindeki açık takip yolu etiketi
  | 'CLIENT_LABEL' // istemci verisindeki açık takip yolu etiketi / form kategorisi
  | 'LEGACY_SUBCATEGORY' // NAFAKA / KIRA alt kategorisi (önceki davranış; kambiyo ile ilgisi yok)
  | 'NOT_SELECTED'; // açık seçim yok → ilamsız (kambiyo SEÇİLMEZ)

export type ProceedingSelectionWarning =
  | 'TAKIP_YOLU_ACIKCA_SECILMEMIS'
  | 'KAMBIYO_SENEDI_VAR_TAKIP_YOLU_SECILMEDI'
  | 'TAKIP_YOLU_ICIN_OZEL_SABLON_YOK'
  | 'KAMBIYO_BELGE_TURU_BELIRSIZ'
  | 'KAMBIYO_BELGE_TURU_KARISIK';

export interface ProceedingSelection {
  readonly kind: ProceedingKind;
  readonly basis: ProceedingSelectionBasis;
  /** true: takip yolu açıkça seçilmiş bir kayda dayanıyor */
  readonly explicit: boolean;
  readonly warnings: readonly ProceedingSelectionWarning[];
}

export interface ProceedingClassificationSource {
  readonly type?: string | null;
  readonly subCategory?: string | null;
  readonly subType?: string | null;
  readonly proceedingType?: string | null;
  /** Case.takipTuru.code */
  readonly takipTuruCode?: string | null;
  /** Case.executionPath (HACIZ / IFLAS / REHIN / IPOTEK / TAHLIYE) — alacaklının seçtiği takip yolu */
  readonly executionPath?: string | null;
  readonly formType?: {
    readonly code?: string | null;
    readonly procedureType?: string | null;
    readonly isKambiyo?: boolean | null;
    readonly isRental?: boolean | null;
    readonly hasJudgment?: boolean | null;
  } | null;
}

type DocumentKind = 'CEK' | 'SENET';

function documentKindOfInstrument(type: string): DocumentKind | null {
  const upper = String(type ?? '').toUpperCase();
  if (upper === 'CEK') return 'CEK';
  if (upper === 'SENET' || upper === 'BONO' || upper === 'POLICE') return 'SENET';
  return null;
}

/**
 * BELGE TÜRÜ (yalnız takip yolu açıkça kambiyo iken kullanılır): önce dosyadaki kambiyo senedi kayıtları; yoksa dosya
 * türü (CHECK/BOND) ya da istemci etiketi. Çek ve senet BİRLİKTE ise belge türü tek değildir → belirsiz.
 */
function resolveDocumentKind(
  instrumentTypes: readonly string[],
  fallbackLabels: readonly (string | null | undefined)[],
): { kind: DocumentKind | null; mixed: boolean } {
  const fromInstruments = new Set(instrumentTypes.map(documentKindOfInstrument).filter((k): k is DocumentKind => k !== null));
  if (fromInstruments.size === 1) return { kind: [...fromInstruments][0], mixed: false };
  if (fromInstruments.size > 1) return { kind: null, mixed: true };
  for (const raw of fallbackLabels) {
    const label = String(raw ?? '').toUpperCase();
    if (label === 'CHECK' || label === 'CEK' || label === 'KAMBIYO_CEK') return { kind: 'CEK', mixed: false };
    if (label === 'BOND' || label === 'SENET' || label === 'BONO' || label === 'KAMBIYO_SENET') return { kind: 'SENET', mixed: false };
  }
  return { kind: null, mixed: false };
}

function kambiyoSelection(
  basis: ProceedingSelectionBasis,
  instrumentTypes: readonly string[],
  fallbackLabels: readonly (string | null | undefined)[],
): ProceedingSelection {
  const doc = resolveDocumentKind(instrumentTypes, fallbackLabels);
  if (doc.kind === 'CEK') return { kind: 'KAMBIYO_CEK', basis, explicit: true, warnings: [] };
  if (doc.kind === 'SENET') return { kind: 'KAMBIYO_SENET', basis, explicit: true, warnings: [] };
  return {
    kind: 'KAMBIYO_BELGE_TURU_BELIRSIZ',
    basis,
    explicit: true,
    warnings: [doc.mixed ? 'KAMBIYO_BELGE_TURU_KARISIK' : 'KAMBIYO_BELGE_TURU_BELIRSIZ'],
  };
}

const NO_DEDICATED_TEMPLATE: readonly ProceedingSelectionWarning[] = ['TAKIP_YOLU_ICIN_OZEL_SABLON_YOK'];

/** Açık bir takip yolu ETİKETİ (takip türü kodu / form kategorisi / alt tür) → seçim; tanınmayan → null. */
function selectionFromExplicitLabel(
  rawLabel: string | null | undefined,
  basis: ProceedingSelectionBasis,
  instrumentTypes: readonly string[],
  documentLabels: readonly (string | null | undefined)[],
): ProceedingSelection | null {
  const label = String(rawLabel ?? '').trim().toUpperCase();
  if (!label) return null;
  const plain = (kind: ProceedingKind, warnings: readonly ProceedingSelectionWarning[] = []): ProceedingSelection => ({
    kind,
    basis,
    explicit: true,
    warnings,
  });
  switch (label) {
    case 'KAMBIYO_CEK':
      return plain('KAMBIYO_CEK');
    case 'KAMBIYO_SENET':
      return plain('KAMBIYO_SENET');
    case 'KAMBIYO':
      return kambiyoSelection(basis, instrumentTypes, documentLabels);
    case 'ILAMSIZ':
    case 'ILAMSIZ_GENEL':
    case 'GENEL_ICRA':
      return plain('ILAMSIZ');
    case 'ILAMSIZ_KIRA':
    case 'ILAMSIZ_TAHLIYE':
    case 'KIRA_ALACAK':
    case 'TAHLIYE':
      return plain('KIRA');
    case 'ILAMLI':
    case 'ILAMLI_GENEL':
      return plain('ILAMLI');
    case 'ILAMLI_NAFAKA':
      return plain('NAFAKA');
    case 'REHIN_TASINIR':
    case 'REHIN_TASINMAZ':
    case 'IPOTEK_REHIN':
    case 'IPOTEK':
    case 'REHIN':
    case 'IFLAS':
    case 'IFLAS_ADI':
    case 'IFLAS_KAMBIYO':
      // Açık seçim var ama bu yol için ayrı şablon YOK → önceki davranış (ilamsız şablon), uyarıyla
      return plain('ILAMSIZ', NO_DEDICATED_TEMPLATE);
    default:
      return null;
  }
}

function withNafaka(selection: ProceedingSelection, subCategory?: string | null): ProceedingSelection {
  // Nafaka alt kategorisi (önceki davranış): ilamlı / ilamsız seçimde nafaka şablonu; kambiyo seçimine dokunmaz
  if (String(subCategory ?? '').toUpperCase() !== 'NAFAKA') return selection;
  if (selection.kind === 'ILAMLI' || selection.kind === 'ILAMSIZ') return { ...selection, kind: 'NAFAKA' };
  return selection;
}

/** Haciz yolu DIŞINDA seçilmiş yollar için (iflas / rehin / ipotek) ayrı şablon yoktur. */
const NON_HACIZ_EXECUTION_PATHS = new Set(['IFLAS', 'REHIN', 'IPOTEK']);
/** Haciz yolu olmayan form kodları (İflas Yoluyla Kambiyo Takibi vb.) */
const NON_HACIZ_FORM_CODES = new Set(['FORM_12']);

/**
 * Alacaklının seçtiği takip yolu haciz DEĞİLSE (iflas / rehin / ipotek), haciz yoluna özgü kambiyo şablonu (Örnek 10)
 * SEÇİLMEZ: bu yollar için ayrı şablon yok → önceki davranış (ilamsız şablon) + uyarı. Nafaka / ilamlı / kira seçimine
 * dokunulmaz.
 */
function withExecutionPath(selection: ProceedingSelection, source: ProceedingClassificationSource): ProceedingSelection {
  const path = String(source.executionPath ?? '').toUpperCase();
  const formCode = String(source.formType?.code ?? source.subType ?? '').toUpperCase();
  if (!NON_HACIZ_EXECUTION_PATHS.has(path) && !NON_HACIZ_FORM_CODES.has(formCode)) return selection;
  if (!isKambiyoKind(selection.kind) && selection.kind !== 'ILAMSIZ') return selection;
  const warnings = selection.warnings
    .filter((w) => w !== 'KAMBIYO_BELGE_TURU_BELIRSIZ' && w !== 'KAMBIYO_BELGE_TURU_KARISIK')
    .concat(selection.warnings.includes('TAKIP_YOLU_ICIN_OZEL_SABLON_YOK') ? [] : ['TAKIP_YOLU_ICIN_OZEL_SABLON_YOK']);
  return { ...selection, kind: 'ILAMSIZ', warnings };
}

function notSelected(hasKambiyoDocument: boolean): ProceedingSelection {
  return {
    kind: 'ILAMSIZ',
    basis: 'NOT_SELECTED',
    explicit: false,
    warnings: hasKambiyoDocument
      ? ['TAKIP_YOLU_ACIKCA_SECILMEMIS', 'KAMBIYO_SENEDI_VAR_TAKIP_YOLU_SECILMEDI']
      : ['TAKIP_YOLU_ACIKCA_SECILMEMIS'],
  };
}

/**
 * Dosya kaydından takip yolu seçimi. Dosya türü / enstrüman kaydı tek başına kambiyo SEÇTİRMEZ.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - TemplateEngineService.getCaseData() → TemplateData.proceedingSelection / proceedingKind
 * /// </remarks>
 */
export function resolveProceedingSelection(
  source: ProceedingClassificationSource,
  instrumentTypes: readonly string[] = [],
): ProceedingSelection {
  const documentLabels = [source.type];
  const done = (selection: ProceedingSelection) => withExecutionPath(withNafaka(selection, source.subCategory), source);

  switch (String(source.proceedingType ?? '').toUpperCase()) {
    case 'CAMBIO':
      return done(kambiyoSelection('PROCEEDING_TYPE', instrumentTypes, documentLabels));
    case 'JUDGMENT_ENFORCEMENT':
      return done({ kind: 'ILAMLI', basis: 'PROCEEDING_TYPE', explicit: true, warnings: [] });
    case 'RENT':
    case 'EVICTION':
      return done({ kind: 'KIRA', basis: 'PROCEEDING_TYPE', explicit: true, warnings: [] });
    case 'GENERAL_EXECUTION':
      return done({ kind: 'ILAMSIZ', basis: 'PROCEEDING_TYPE', explicit: true, warnings: [] });
    case 'PLEDGE':
    case 'MORTGAGE':
    case 'BANKRUPTCY':
    case 'PUBLIC_RECEIVABLE':
      return done({ kind: 'ILAMSIZ', basis: 'PROCEEDING_TYPE', explicit: true, warnings: NO_DEDICATED_TEMPLATE });
    default:
      break;
  }

  const byTakipTuru = selectionFromExplicitLabel(source.takipTuruCode, 'TAKIP_TURU', instrumentTypes, documentLabels);
  if (byTakipTuru) return done(byTakipTuru);
  if (String(source.takipTuruCode ?? '').toUpperCase() === 'NAFAKA') {
    return { kind: 'NAFAKA', basis: 'TAKIP_TURU', explicit: true, warnings: [] };
  }

  const form = source.formType;
  if (form) {
    if (form.isKambiyo || form.procedureType === 'KAMBIYO') {
      return done(kambiyoSelection('FORM_TYPE', instrumentTypes, documentLabels));
    }
    if (form.procedureType === 'ILAMLI' || form.hasJudgment) {
      return done({ kind: 'ILAMLI', basis: 'FORM_TYPE', explicit: true, warnings: [] });
    }
    if (form.isRental || form.procedureType === 'KIRA_ALACAK' || form.procedureType === 'TAHLIYE') {
      return done({ kind: 'KIRA', basis: 'FORM_TYPE', explicit: true, warnings: [] });
    }
    if (form.procedureType === 'ILAMSIZ') {
      return done({ kind: 'ILAMSIZ', basis: 'FORM_TYPE', explicit: true, warnings: [] });
    }
    if (form.procedureType) {
      return done({ kind: 'ILAMSIZ', basis: 'FORM_TYPE', explicit: true, warnings: NO_DEDICATED_TEMPLATE });
    }
  }

  const bySubType = selectionFromExplicitLabel(source.subType, 'SUB_TYPE_LABEL', instrumentTypes, documentLabels);
  if (bySubType) return done(bySubType);

  const subCategory = String(source.subCategory ?? '').toUpperCase();
  if (subCategory === 'NAFAKA') return { kind: 'NAFAKA', basis: 'LEGACY_SUBCATEGORY', explicit: true, warnings: [] };
  if (subCategory === 'KIRA') return { kind: 'KIRA', basis: 'LEGACY_SUBCATEGORY', explicit: true, warnings: [] };

  const hasKambiyoDocument =
    instrumentTypes.some((t) => documentKindOfInstrument(t) !== null) || source.type === 'CHECK' || source.type === 'BOND';
  return withExecutionPath(notSelected(hasKambiyoDocument), source);
}

/**
 * İstemci verisindeki etiketlerden takip yolu (POST /template-engine/takip-talebi/*; TemplateData.proceedingSelection
 * taşımayan çağıranlar). Yalnız AÇIK takip yolu etiketleri (takip türü kodu, form kategorisi 'KAMBIYO' vb.) seçim
 * yaptırır; kalem/belge türü etiketi ('CEK', 'SENET', 'CHECK', 'BOND') tek başına kambiyo SEÇTİRMEZ, yalnız açık
 * kambiyo seçiminde belge türünü belirler.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - TemplateEngineService.resolveSelection() (proceedingSelection yoksa)
 * ///  - normalizeClientTemplateData()
 * /// </remarks>
 */
export function resolveProceedingSelectionFromLabels(
  caseType?: string | null,
  subCategory?: string | null,
): ProceedingSelection {
  const documentLabels = [subCategory, caseType];
  const upperLabels = [subCategory, caseType].map((l) => String(l ?? '').toUpperCase());
  // Önceki davranış korunur: nafaka / kira etiketi (alt kategori önce) kendi şablonunu seçer
  if (upperLabels.includes('NAFAKA')) return { kind: 'NAFAKA', basis: 'LEGACY_SUBCATEGORY', explicit: true, warnings: [] };
  if (upperLabels.includes('KIRA')) return { kind: 'KIRA', basis: 'LEGACY_SUBCATEGORY', explicit: true, warnings: [] };
  for (const label of [subCategory, caseType]) {
    const selection = selectionFromExplicitLabel(label, 'CLIENT_LABEL', [], documentLabels);
    if (selection) return selection;
  }
  const hasKambiyoDocument = documentLabels.some((l) =>
    ['CEK', 'SENET', 'BONO', 'CHECK', 'BOND'].includes(String(l ?? '').toUpperCase()),
  );
  return notSelected(hasKambiyoDocument);
}

/** Takip talebi şablonu; belge türü belirsiz kambiyoda şablon YOK (çağıran açık hata verir). */
export const TAKIP_TALEBI_TEMPLATE_BY_KIND: Readonly<Record<ProceedingKind, string | null>> = Object.freeze({
  ILAMSIZ: 'ORNEK_1_ILAMSIZ',
  KAMBIYO_CEK: 'ORNEK_1_KAMBIYO_CEK',
  KAMBIYO_SENET: 'ORNEK_1_KAMBIYO_SENET',
  KAMBIYO_BELGE_TURU_BELIRSIZ: null,
  ILAMLI: 'ORNEK_1_ILAMLI',
  NAFAKA: 'ORNEK_1_NAFAKA',
  KIRA: 'ORNEK_1_KIRA',
});

export function isKambiyoKind(kind: ProceedingKind): boolean {
  return kind === 'KAMBIYO_CEK' || kind === 'KAMBIYO_SENET' || kind === 'KAMBIYO_BELGE_TURU_BELIRSIZ';
}

/**
 * Belgeye giren kalem = TALEP EDİLEN alacak: iptal (CANCELLED) ve feragat (WAIVED) edilmiş ya da sanal kalem girmez.
 * Tahsil edilmiş (COLLECTED) kalem talep edilen alacağın parçasıdır ve tutarı `demandedAmount` olarak KALIR — resmi
 * belge "kalan bakiye" belgesi değildir. status/isVirtual taşımayan eski kaynak (Due) olduğu gibi kabul edilir.
 */
const EXCLUDED_CLAIM_ITEM_STATUSES = new Set(['CANCELLED', 'WAIVED']);

export function isTemplateEligibleClaimItem(item: { status?: string | null; isVirtual?: boolean | null }): boolean {
  if (item.status && EXCLUDED_CLAIM_ITEM_STATUSES.has(String(item.status).toUpperCase())) return false;
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
  // Due (eski kaynak) türleri
  NAFAKA: 'Nafaka',
  KIRA: 'Kira Alacağı',
  AIDAT: 'Aidat',
  PRIM: 'Prim',
  VEKALET_UCRETI: 'Vekalet Ücreti',
  HARC: 'Harç',
  TAZMINAT: 'Tazminat',
  CEZAI_SART: 'Cezai Şart',
  KOMISYON: 'Komisyon',
});

export function getClaimItemTypeLabel(type: string): string {
  return CLAIM_ITEM_TYPE_LABELS[String(type).toUpperCase()] ?? 'Alacak Kalemi';
}

// Asıl alacak niteliğindeki türler (ClaimItem + eski Due türleri)
const PRINCIPAL_TYPES = new Set(['PRINCIPAL', 'ASIL_ALACAK', 'KIRA_ALACAGI', 'NAFAKA', 'KIRA', 'AIDAT', 'PRIM']);
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
 * kalmaz. Fer'i tazminat fazladan hesaplanmaz; yalnız kayıtlı kalem toplanır. Toplam DOSYA düzeyindedir: borçlu
 * sorumluluğuna göre borçlu başına farklı tutar ÜRETİLMEZ (iç sorumluluk hesabı dış belge düzeninden ayrıdır).
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

/**
 * Baştaki avukat unvanını soyar: 'Av.' / 'Av ' / 'Avukat ' (ardından nokta YA DA boşluk zorunlu → 'Avni', 'Avşar',
 * 'Ava' gibi adlara dokunulmaz).
 */
export function stripLawyerTitle(name: string | null | undefined): string {
  return String(name ?? '').replace(/^\s*(?:av\.\s*|av\s+|avukat\s+)/i, '').trim();
}

/**
 * Unvanlı ad — TEK kez 'Av.' (veride unvan olsa da olmasa da). Veri modeli önceki biçimi korur (`Av.Ad Soyad`):
 * unvanı veriden BEKLEYEN tüketiciler (PDF vekil satırı, imza satırları, UDF/XML, dilekçeler) değişmez; unvanı
 * KENDİSİ ekleyen yerler (şablonlardaki `Av.{{lawyer.name}}`, Word) bu yardımcıyla çift unvan üretmez.
 */
export function formatLawyerTitled(name: string | null | undefined, separator = ''): string {
  const bare = stripLawyerTitle(name);
  return bare ? `Av.${separator}${bare}` : '';
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
  COMMISSION: 'OTHER',
  KOMISYON: 'OTHER',
});

export function normalizeClientClaimItemType(type: string): string {
  const upper = String(type ?? '').toUpperCase();
  return CLIENT_CLAIM_TYPE_ALIASES[upper] ?? upper;
}

export const DRAFT_DOCUMENT_NOTICE =
  'TASLAK — onay bekliyor, gönderime hazır değil. Bu belge dosya kaydına dayanmayan önizleme verisiyle üretildi.';

export const DRAFT_EXCLUDED_PENALTY_NOTICE =
  'Çek tazminatı bu taslakta yer almaz: kayıtlı alacak kalemi değildir (kesin kalem yalnız onayla oluşur).';

export const DRAFT_SERVER_PENALTY_NOTICE =
  'Çek tazminatı sunucu hesabıyla TASLAK olarak gösterilmiştir: kayıtlı alacak kalemi değildir (kesin kalem yalnız onayla oluşur).';

export const DRAFT_SERVER_PENALTY_LINE_LABEL = 'Çek Tazminatı (TASLAK — onay bekliyor)';

/**
 * Sunucunun TASLAK çek tazminatı hesabı (previewCekFormation sonucu) — istemci belge önizlemesine girdi.
 *  - HESAPLANDI: tutar sunucuda, karşılıksız çek kayıtları ve borçlu rollerinden hesaplandı.
 *  - VERI_EKSIK: girdi eksik → tutar ÜRETİLMEZ (kör "asıl alacak × %10" yok); sebep taslakta not olarak yazılır.
 */
export type ServerDraftPenalty =
  | { status: 'HESAPLANDI'; amount: number; currency: string; previewHash: string }
  | { status: 'VERI_EKSIK'; reason: string; previewHash: string };

/** İstemcinin gönderdiği, KAYITLI kalemden gelmeyen çek tazminatı satırı türleri (istemci hesabı) */
const CLIENT_PENALTY_TYPES = new Set(['COMPENSATION', 'CEK_TAZMINATI', 'CHECK_PENALTY']);

/**
 * İstemci verisiyle üretilen takip talebi (POST /template-engine/takip-talebi/*) için normalizasyon:
 *  - istemcinin kendi hesapladığı ÇEK TAZMİNATI satırı (kör "asıl alacak × %10") belgeye ve toplama GİRMEZ: kayıtlı
 *    kalem değildir; `draftExcludedItems` içinde raporlanır ve taslakta not olarak belirtilir;
 *  - toplamlar SUNUCUDA kalan kalemlerden yeniden hesaplanır (istemci toplamı ezilir);
 *  - takip yolu yalnız AÇIK etiketten çözülür; avukat adı veride değiştirilmez (unvan üretim yerinde tek kez);
 *  - K3-L Faz 2b: SUNUCU taslak hesabı verildiyse (`serverDraftPenalty`) çek tazminatı satırı O tutarla, açıkça
 *    "TASLAK — onay bekliyor" etiketiyle eklenir ve toplama girer; istemcinin kendi satırı yine kullanılmaz;
 *  - kayıt yazılmaz; çıktı TASLAK olarak işaretlenir.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - TemplateEngineService.generateTakipTalebiWord()/generateTakipTalebiPdf() (istemci yolu)
 * /// </remarks>
 */
export function normalizeClientTemplateData<T extends {
  claimItems: Array<{ type: string; description: string; amount: number; currency: string }>;
  totals: TemplateTotals;
  caseType: string;
  subCategory: string;
  proceedingKind?: ProceedingKind;
  proceedingSelection?: ProceedingSelection;
}>(
  data: T,
  serverDraftPenalty?: ServerDraftPenalty | null,
): T & {
  proceedingKind: ProceedingKind;
  proceedingSelection: ProceedingSelection;
  isDraft: true;
  draftExcludedItems: Array<{ type: string; amount: number; currency: string; reason: 'NOT_A_RECORDED_CLAIM_ITEM' }>;
  draftComputedItems: Array<{ type: 'CHECK_PENALTY'; amount: number; currency: string; source: 'SERVER_PREVIEW'; previewHash: string }>;
  draftPenaltyNotice?: string;
} {
  const draftExcludedItems: Array<{ type: string; amount: number; currency: string; reason: 'NOT_A_RECORDED_CLAIM_ITEM' }> = [];
  const claimItems: T['claimItems'] = [];
  for (const item of data.claimItems ?? []) {
    const rawType = String(item.type ?? '').toUpperCase();
    if (CLIENT_PENALTY_TYPES.has(rawType)) {
      draftExcludedItems.push({ type: rawType, amount: Number(item.amount) || 0, currency: item.currency, reason: 'NOT_A_RECORDED_CLAIM_ITEM' });
      continue;
    }
    const type = normalizeClientClaimItemType(item.type);
    claimItems.push({ ...item, type, description: item.description || getClaimItemTypeLabel(type), amount: Number(item.amount) || 0 });
  }
  const currency = data.totals?.currency || claimItems[0]?.currency || 'TRY';
  const draftComputedItems: Array<{ type: 'CHECK_PENALTY'; amount: number; currency: string; source: 'SERVER_PREVIEW'; previewHash: string }> = [];
  let draftPenaltyNotice: string | undefined;
  if (serverDraftPenalty?.status === 'HESAPLANDI' && serverDraftPenalty.amount > 0) {
    // Sunucu hesabı: satır açıkça TASLAK etiketlidir; kesin kalem (ClaimItem) DEĞİLDİR
    claimItems.push({
      type: 'CHECK_PENALTY',
      description: DRAFT_SERVER_PENALTY_LINE_LABEL,
      amount: serverDraftPenalty.amount,
      currency: serverDraftPenalty.currency,
    } as T['claimItems'][number]);
    draftComputedItems.push({
      type: 'CHECK_PENALTY',
      amount: serverDraftPenalty.amount,
      currency: serverDraftPenalty.currency,
      source: 'SERVER_PREVIEW',
      previewHash: serverDraftPenalty.previewHash,
    });
    draftPenaltyNotice = DRAFT_SERVER_PENALTY_NOTICE;
  } else if (serverDraftPenalty?.status === 'VERI_EKSIK') {
    draftPenaltyNotice = `Çek tazminatı bu taslakta yer almaz: ${serverDraftPenalty.reason}`;
  } else if (draftExcludedItems.length > 0) {
    draftPenaltyNotice = DRAFT_EXCLUDED_PENALTY_NOTICE;
  }
  const proceedingSelection = data.proceedingSelection ?? resolveProceedingSelectionFromLabels(data.caseType, data.subCategory);
  return {
    ...data,
    claimItems,
    totals: computeTemplateTotals(claimItems, currency),
    proceedingSelection,
    proceedingKind: proceedingSelection.kind,
    isDraft: true,
    draftExcludedItems,
    draftComputedItems,
    ...(draftPenaltyNotice ? { draftPenaltyNotice } : {}),
  };
}
