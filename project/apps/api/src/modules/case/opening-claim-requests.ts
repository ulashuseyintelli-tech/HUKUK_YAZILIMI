import { BadRequestException } from '@nestjs/common';
import { InterestStartDateProvenance } from '@prisma/client';
import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';
import { validateInterestAccrualState } from '../claim-item/interest-accrual-policy';
import { normalizeInterestWriteIntent } from '../claim-item/interest-write-admission';
import { classifyClaimItemType } from '../interest-engine/classification/claim-item-classifier';
import {
  EMPTY_ATTRIBUTION,
  evaluateItemLiability,
  fromKurus,
  kurusToFixed,
  legacyProjection,
  normalizeSelectionDraft,
  toKurus,
  type NormalizedSelection,
} from '../claim-liability/claim-liability.domain';
import { CLAIM_LIABILITY_KIND_LABEL, type ClaimLiabilityKindLabel } from '../claim-liability/claim-liability.read-model';
import { DueType, type DueDto } from './dto/case.dto';
import { mapDueTypeToClaimItemType } from './due-to-claim-item.mapper';

/**
 * DOSYA AÇILIŞINDA KALEM BEYANLARI — saf doğrulama ve önizleme (veritabanı erişimi YOK).
 *
 * Kapsam: yeni dosya açılırken kullanıcının kalem bazında AÇIKÇA girdiği iki beyan:
 *  - "faiz işler" beyanı (başlangıç tarihi + başlangıcın dayanağı),
 *  - borçlu sorumluluğu seçimi (müteselsil / paylı / tutarla sınırlı).
 *
 * İlkeler:
 *  - Açılış bu iki bilgiyi kaleme DOĞRUDAN YAZMAZ. Kalem bugünkü gibi oluşur (faiz durumu "belirlenmedi" ya da kayıtlı
 *    faizsiz; sorumluluk seçimi yok = "belirlenmedi"). Beyanlar, dosya kaydı tamamlandıktan sonra MEVCUT yüksek etkili
 *    kalem değişikliği onayına talep olarak gider (aynı işlem kodu, aynı iki kişi kuralı); onaylanana kadar hesaba girmez.
 *  - Alan kuralları sonradan düzenlemeyle AYNIDIR: faiz için `validateInterestAccrualState`, sorumluluk için
 *    `normalizeSelectionDraft`. Burada yeni hukuki kural tanımlanmaz.
 *  - Yazılım ilam metninden, borçlu rolünden ya da borçlu sayısından sonuç çıkarmaz; ön seçili değer yoktur. Beyan
 *    verilmeyen kalem "belirlenmedi" kalır; eksik bilgi sıfır ya da kesin sayılmaz.
 *  - Önizleme hiçbir kayıt oluşturmaz. Borçlu rakamları toplanarak dosya borcu üretilmez.
 */
export const OPENING_CLAIM_REQUESTS_VERSION = 'CASE_OPENING_CLAIM_REQUESTS_V1';

export interface OpeningInterestAccrualInput {
  readonly dueIndex: number;
  readonly interestStartDate?: string | null;
  readonly interestStartDateProvenance?: string | null;
}

export interface OpeningLiabilityPartyInput {
  readonly debtorId: string;
  readonly shareWeight?: number | null;
  readonly sharePercent?: string | null;
  readonly limitAmount?: string | null;
  readonly unlimited?: boolean | null;
}

export interface OpeningLiabilitySelectionInput {
  readonly dueIndex: number;
  readonly mode: string;
  readonly parties?: readonly OpeningLiabilityPartyInput[] | null;
  readonly basis?: string | null;
  readonly basisNote?: string | null;
}

export interface OpeningClaimRequestsInput {
  readonly interestAccruals?: readonly OpeningInterestAccrualInput[] | null;
  readonly liabilitySelections?: readonly OpeningLiabilitySelectionInput[] | null;
}

export type OpeningDueInput = Pick<
  DueDto,
  | 'type'
  | 'amount'
  | 'description'
  | 'interestType'
  | 'interestTypeCode'
  | 'interestRate'
  | 'interestAccrualStatus'
  | 'interestStartDate'
  | 'interestEndDate'
  | 'attorneyFeeBasis'
>;

export interface OpeningClaimPreviewError {
  /** Kararlı kod; sorumluluk girdisinde seçim alanının kendi kodları (ör. `BASIS_REQUIRED`) aynen taşınır. */
  readonly kod: string;
  readonly alan: 'FAIZ' | 'SORUMLULUK' | 'GENEL';
  readonly dueIndex: number | null;
  readonly debtorId: string | null;
  readonly mesaj: string;
}

export interface OpeningClaimPreviewParty {
  readonly debtorId: string;
  readonly pay: number | null;
  readonly payAgirligi: number | null;
  readonly tavan: number | null;
  readonly sinirsiz: boolean;
  /** Seçim onaylanırsa borçlunun bu kalemdeki sorumluluk sınırı (kalemin kayıtlı tutarı üzerinden). */
  readonly sorumlulukSiniri: number | null;
}

export interface OpeningClaimPreviewItem {
  readonly dueIndex: number;
  /** Oluşacak alacak kaleminin türü; `null` = bu satırdan alacak kalemi üretilmez (ör. nafaka takvimi). */
  readonly kalemTuru: string | null;
  readonly aciklama: string | null;
  readonly tutar: number;
  readonly vekaletUcretiKaynagi: string | null;
  readonly faiz: {
    /** Dosya açılışında kaleme yazılacak durum. "Faiz işler" açılışta YAZILMAZ. */
    readonly acilisDurumu: 'UNKNOWN' | 'NO_INTEREST';
    /**
     * Kalem motorun ASIL ALACAK sınıfında mı (tek otorite: claim-item-classifier). Asıl alacak kaleminde faiz hesabı
     * faiz durumu alanına bağlı değildir: açılışta girilen faiz türü + başlangıç tarihi varsa faiz bugünkü gibi hesaplanır
     * (yalnız "faiz işlemez" kaydı durdurur). Önizleme bu yüzden "belirlenmedi"yi tek başına "hesaplanmaz" diye sunmaz.
     */
    readonly anaparaKalemi: boolean;
    /** Onaya gidecek beyan; onaylanana kadar hesaba girmez. */
    readonly onayBekleyecekBeyan: {
      readonly durum: 'ACCRUES';
      readonly faizTuruKodu: string | null;
      readonly baslangic: string | null;
      readonly dayanak: string;
    } | null;
  };
  readonly sorumluluk: {
    /** Dosya açılışında kalem seçimsiz oluşur. */
    readonly acilisTuru: 'BELIRLENMEDI';
    /** Onaya gidecek seçim; onaylanana kadar hesaba girmez. */
    readonly onayBekleyecekSecim: {
      readonly tur: ClaimLiabilityKindLabel;
      readonly dayanak: string | null;
      readonly tavanKapsami: 'ITEM_AMOUNT' | null;
      readonly borclular: readonly OpeningClaimPreviewParty[];
    } | null;
  };
}

export interface OpeningClaimPreviewDebtorRow {
  readonly dueIndex: number;
  readonly durum: 'BELIRLENMEDI' | 'SECIMDE_YOK' | 'MUTESELSIL' | 'PAYLI' | 'TUTARLA_SINIRLI';
  /** Borçlunun bu kalemdeki sorumluluk sınırı; "belirlenmedi"de `null` (kesin rakam üretilmez). */
  readonly sorumlulukSiniri: number | null;
}

export interface OpeningClaimPreviewDebtor {
  readonly debtorId: string;
  readonly kalemler: readonly OpeningClaimPreviewDebtorRow[];
  /** Sorumluluğu belirlenmemiş kalem sayısı; sıfırdan büyükse borçlu toplamı üretilmez. */
  readonly belirlenmeyenKalemSayisi: number;
  /**
   * Seçimler onaylanırsa borçlunun kalem tutarları üzerinden sorumluluk üst sınırı. Bir kalem bile "belirlenmedi" ise
   * `null`. Müteselsil kalem her borçluda tam tutarla sayılır; bu rakamlar toplanarak dosya borcu ÜRETİLMEZ.
   */
  readonly sorumlulukUstSiniri: number | null;
}

export interface OpeningClaimPreview {
  readonly surum: typeof OPENING_CLAIM_REQUESTS_VERSION;
  readonly paraBirimi: string;
  readonly kalemler: readonly OpeningClaimPreviewItem[];
  /** Alacak kalemi üreten satırların kayıtlı tutarları toplamı. Faiz ve takip giderleri dahil DEĞİLDİR. */
  readonly kalemTutarlariToplami: number;
  readonly borcluDagilimi: readonly OpeningClaimPreviewDebtor[];
  readonly onayaGidecekFaizBeyaniSayisi: number;
  readonly onayaGidecekSorumlulukSecimiSayisi: number;
  readonly hatalar: readonly OpeningClaimPreviewError[];
  readonly uygulanabilir: boolean;
  /** Gösterilen girdinin özeti; dosya açılış isteği bu özetle gönderilir, girdi değiştiyse açılış reddedilir. */
  readonly onizlemeOzeti: string;
  readonly aciklamalar: typeof OPENING_CLAIM_PREVIEW_NOTES;
}

export const OPENING_CLAIM_PREVIEW_NOTES = Object.freeze({
  onay:
    'Faiz işler beyanı ve borçlu sorumluluğu seçimi dosya açılışında kaleme yazılmaz; dosyayla AYNI işlemde ikinci kişinin onayına gönderilir (talep açılamazsa dosya da oluşturulmaz). Onaylanana kadar faiz "belirlenmedi", sorumluluk "belirlenmedi" görünür ve hesaplara girmez.',
  kullaniciTercihi:
    'Bu bilgiler kullanıcı beyanıdır. Yazılım ilam metninden, borçlu rolünden ya da borçlu sayısından faiz ya da sorumluluk sonucu çıkarmaz.',
  toplam:
    'Dosyanın alacak toplamı tek rakamdır; borçlu rakamları toplanarak dosya borcu üretilmez. Toplam yalnız girilen kalem tutarlarını gösterir (kalem olarak girilmiş işlemiş faiz dahil); kalemlere işleyecek faiz ve takip giderleri dahil değildir.',
  tavanKapsami:
    'Tutarla sınırlı sorumlulukta tavan yalnız o kalemin kayıtlı tutarını kapsar; kaleme işleyen faiz ve diğer kalemler kapsam dışıdır.',
  onaySirasi:
    'Faiz beyanı ve sorumluluk seçimi ayrı taleplerdir; ayrı ayrı onaylanır ve onay sırası sonucu değiştirmez.',
});

const SELECTION_ERROR_MESSAGES: Record<string, string> = {
  MODE_INVALID: 'Sorumluluk türü geçersiz.',
  BASIS_REQUIRED: 'Sorumluluk seçimi için dayanak seçilmelidir.',
  BASIS_INVALID: 'Sorumluluk dayanağı geçersiz.',
  BASIS_NOTE_REQUIRED: 'Bu dayanak için açıklama zorunludur.',
  PARTY_COUNT_INVALID: 'Borçlu sayısı bu tür için uygun değil (paylı sorumlulukta en az iki borçlu).',
  PARTY_DUPLICATE: 'Aynı kişi bir seçimde iki kez yer alamaz.',
  PARTY_NOT_ACTIVE_CASE_DEBTOR: 'Seçilen borçlu bu dosyanın borçluları arasında değil.',
  UNDETERMINED_HAS_PARTIES: 'Belirlenmedi seçiminde borçlu seçilmez.',
  SHARE_INPUT_INVALID: 'Pay girdisi eksik ya da geçersiz.',
  SHARE_PERCENT_TOTAL_INVALID: 'Yüzdelerin toplamı tam 100,00 olmalıdır.',
  SHARE_AND_LIMIT_MIXED: 'Aynı kalemde pay ve tavan birlikte kullanılamaz.',
  LIMIT_INVALID: 'Tavan sıfırdan büyük olmalıdır.',
  LIMIT_AND_UNLIMITED_CONFLICT: 'Bir borçlu hem tavanlı hem tavansız olamaz.',
  ALL_PARTIES_UNLIMITED: 'Bütün borçlular tavansız olamaz; en az bir tavan girilmelidir.',
  FIELD_NOT_ALLOWED_FOR_MODE: 'Bu tür için geçerli olmayan bir alan gönderildi.',
};

/** Açılışta doğrulanmış plan: dosya kaydı tamamlandıktan sonra hangi talepler açılacak. */
export interface OpeningClaimPlan {
  readonly previewHash: string;
  readonly interestAccruals: ReadonlyArray<{
    readonly dueIndex: number;
    readonly interestStartDate: string | null;
    readonly interestStartDateProvenance: string;
  }>;
  /** Seçim, kişi (`Debtor.id`) kimlikleriyle; dosya borçlusu satırı kimliğine kayıt tamamlandıktan sonra çevrilir. */
  readonly liabilitySelections: ReadonlyArray<{
    readonly dueIndex: number;
    readonly mode: string;
    readonly basis: string | null;
    readonly basisNote: string | null;
    readonly parties: ReadonlyArray<{
      readonly debtorId: string;
      readonly shareWeight: number | null;
      readonly limitAmount: string | null;
      readonly unlimited: boolean;
    }>;
  }>;
}

export interface OpeningClaimEvaluation {
  readonly preview: OpeningClaimPreview;
  readonly plan: OpeningClaimPlan;
}

// Sonradan düzenlemedeki seçim gövdesiyle (ClaimLiabilityPartyDto) AYNI sayı kalıpları.
const SHARE_PERCENT_PATTERN = /^\d{1,3}([.,]\d{1,2})?$/;
const LIMIT_AMOUNT_PATTERN = /^\d{1,13}(\.\d{1,2})?$/;
const PROVENANCE_VALUES: readonly string[] = Object.values(InterestStartDateProvenance);
const WITHOUT_START_DATE = 'ENFORCEMENT_PROCEEDING_DATE';

function isoDay(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().slice(0, 10);
}

function validIndex(value: unknown, length: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length;
}

function messageOf(error: unknown): string {
  if (error instanceof BadRequestException) {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    const message = (response as { message?: unknown } | null)?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.filter((value) => typeof value === 'string').join(' ');
  }
  return error instanceof Error ? error.message : 'Girdi geçersiz.';
}

/**
 * Açılış beyanlarını doğrular ve önizlemeyi kurar (SAF).
 *
 * `debtorIds`: dosya borçlularının kişi kimlikleri (istekteki `caseDebtors[].debtorId`), istek sırasıyla.
 */
export function evaluateOpeningClaimRequests(input: {
  readonly currency: string;
  readonly dues: readonly OpeningDueInput[];
  readonly debtorIds: readonly string[];
  readonly requests: OpeningClaimRequestsInput | null | undefined;
}): OpeningClaimEvaluation {
  const { dues } = input;
  const currency = String(input.currency || 'TRY');
  const errors: OpeningClaimPreviewError[] = [];
  const itemTypes = dues.map((due) => mapDueTypeToClaimItemType(due.type as DueType));
  const amountsKurus = dues.map((due) => toKurus(due.amount));

  // Aynı kişi dosyada birden çok rolle yer alabilir; sorumluluk kişi düzeyindedir (tekrarsız liste, istek sırası).
  const debtorIds = [...new Set(input.debtorIds.filter((id) => typeof id === 'string' && id.length > 0))];
  const selectionDebtors = debtorIds.map((debtorId) => ({ caseDebtorId: debtorId, debtorId, active: true }));

  // ── Faiz işler beyanları ────────────────────────────────────────────────────────────────────────────────────────
  const accrualByDue = new Map<number, { interestStartDate: string | null; interestStartDateProvenance: string; interestTypeCode: string | null }>();
  for (const accrual of input.requests?.interestAccruals ?? []) {
    if (!validIndex(accrual?.dueIndex, dues.length)) {
      errors.push({ kod: 'DUE_INDEX_INVALID', alan: 'FAIZ', dueIndex: null, debtorId: null, mesaj: 'Faiz beyanı geçerli bir alacak kalemine bağlı değil.' });
      continue;
    }
    const index = accrual.dueIndex;
    if (accrualByDue.has(index)) {
      errors.push({ kod: 'DUE_INDEX_DUPLICATE', alan: 'FAIZ', dueIndex: index, debtorId: null, mesaj: 'Aynı kalem için birden çok faiz beyanı gönderilemez.' });
      continue;
    }
    const due = dues[index];
    if (itemTypes[index] === null) {
      errors.push({ kod: 'DUE_HAS_NO_CLAIM_ITEM', alan: 'FAIZ', dueIndex: index, debtorId: null, mesaj: 'Bu satırdan alacak kalemi üretilmez; faiz beyanı verilemez.' });
      continue;
    }
    if (due.interestAccrualStatus === 'NO_INTEREST') {
      errors.push({
        kod: 'INTEREST_ACCRUAL_NO_INTEREST_CONFLICT',
        alan: 'FAIZ',
        dueIndex: index,
        debtorId: null,
        mesaj: 'Kalem "faiz işlemez" olarak girilmiş; aynı kalem için "faiz işler" beyanı verilemez.',
      });
      continue;
    }
    if (due.interestStartDate || due.interestEndDate) {
      // Beyan edilen başlangıç onaya gider. Kaleme açılışta başka bir başlangıç / bitiş tarihi yazılırsa hesap, onay
      // beklenirken (ve "takip tarihi" dayanağında onaydan sonra da) beyan edilmeyen tarihi kullanır.
      errors.push({
        kod: 'INTEREST_ACCRUAL_DUE_DATES_CONFLICT',
        alan: 'FAIZ',
        dueIndex: index,
        debtorId: null,
        mesaj: '"Faiz işler" beyanı verilen kalemde açılışta faiz başlangıç / bitiş tarihi yazılmaz; başlangıç beyanla birlikte onaya gider.',
      });
      continue;
    }
    const startDate = isoDay(accrual.interestStartDate);
    const provenance = String(accrual.interestStartDateProvenance ?? '');
    const fail = (mesaj: string) => errors.push({ kod: 'INTEREST_ACCRUAL_INVALID', alan: 'FAIZ', dueIndex: index, debtorId: null, mesaj });
    // Okunur ön denetim (kurallar aşağıdaki ortak doğrulayıcıyla AYNI; yalnız ileti kullanıcı diliyle verilir).
    if (!due.interestTypeCode && !due.interestType) {
      fail('"Faiz işler" beyanı için kalemin faiz türü seçilmelidir (dosya faiz türüne düşülmez).');
      continue;
    }
    if (!PROVENANCE_VALUES.includes(provenance)) {
      fail('"Faiz işler" beyanı için faiz başlangıcının dayanağı seçilmelidir.');
      continue;
    }
    if (!startDate && provenance !== WITHOUT_START_DATE) {
      fail('"Faiz işler" beyanı için faiz başlangıç tarihi girilmelidir (dayanak "takip tarihi" ise tarih dosyadan alınır).');
      continue;
    }
    try {
      // Sonradan düzenlemeyle AYNI kurallar: tür kalemin kendi kaydından; "faiz işler" tür + dayanak + (takip tarihi
      // dayanağı dışında) başlangıç tarihi ister.
      const normalized = normalizeInterestWriteIntent({
        interestTypeCode: due.interestTypeCode ?? undefined,
        legacyInterestType: due.interestType ?? undefined,
        interestRate: due.interestRate ?? undefined,
      });
      const interestTypeCode = normalized.mode === 'VARIABLE' || normalized.mode === 'FIXED' ? normalized.interestTypeCode : null;
      const interestType = normalized.mode === 'VARIABLE' || normalized.mode === 'FIXED' ? normalized.legacyInterestType : null;
      const interestRate = normalized.mode === 'FIXED' ? normalized.interestRate : null;
      validateInterestAccrualState(
        {
          interestAccrualStatus: 'ACCRUES',
          interestType,
          interestTypeCode,
          interestRate,
          interestStartDate: startDate,
          interestStartDateProvenance: provenance || null,
        },
        false,
      );
      accrualByDue.set(index, { interestStartDate: startDate, interestStartDateProvenance: provenance, interestTypeCode });
    } catch (error) {
      fail(`"Faiz işler" beyanı kalemin faiz kaydıyla kabul edilmiyor: ${messageOf(error)}`);
    }
  }

  // ── Sorumluluk seçimleri ────────────────────────────────────────────────────────────────────────────────────────
  const selectionByDue = new Map<number, NormalizedSelection>();
  for (const draft of input.requests?.liabilitySelections ?? []) {
    if (!validIndex(draft?.dueIndex, dues.length)) {
      errors.push({ kod: 'DUE_INDEX_INVALID', alan: 'SORUMLULUK', dueIndex: null, debtorId: null, mesaj: 'Sorumluluk seçimi geçerli bir alacak kalemine bağlı değil.' });
      continue;
    }
    const index = draft.dueIndex;
    if (selectionByDue.has(index)) {
      errors.push({ kod: 'DUE_INDEX_DUPLICATE', alan: 'SORUMLULUK', dueIndex: index, debtorId: null, mesaj: 'Aynı kalem için birden çok sorumluluk seçimi gönderilemez.' });
      continue;
    }
    if (itemTypes[index] === null) {
      errors.push({ kod: 'DUE_HAS_NO_CLAIM_ITEM', alan: 'SORUMLULUK', dueIndex: index, debtorId: null, mesaj: 'Bu satırdan alacak kalemi üretilmez; sorumluluk seçimi yapılamaz.' });
      continue;
    }
    if (draft.mode === 'UNDETERMINED') {
      // "Belirlenmedi" saklanan bir değer değil, seçim kaydının yokluğudur: açılışta talep konusu olmaz.
      errors.push({
        kod: 'UNDETERMINED_NOT_A_REQUEST',
        alan: 'SORUMLULUK',
        dueIndex: index,
        debtorId: null,
        mesaj: 'Belirlenmedi için seçim gönderilmez; kalem seçimsiz açılır.',
      });
      continue;
    }
    if (selectionDebtors.length === 0) {
      errors.push({ kod: 'DEBTORS_REQUIRED', alan: 'SORUMLULUK', dueIndex: index, debtorId: null, mesaj: 'Sorumluluk seçimi için dosya borçluları gönderilmelidir.' });
      continue;
    }
    // Sayı biçimi (seçim gövdesindeki kalıplarla aynı): uymayan girdi alan kurallarına hiç sokulmaz.
    let formatError = false;
    for (const party of draft.parties ?? []) {
      const debtorId = String(party?.debtorId ?? '') || null;
      if (typeof party?.sharePercent === 'string' && !SHARE_PERCENT_PATTERN.test(party.sharePercent)) {
        errors.push({ kod: 'SHARE_INPUT_INVALID', alan: 'SORUMLULUK', dueIndex: index, debtorId, mesaj: SELECTION_ERROR_MESSAGES.SHARE_INPUT_INVALID });
        formatError = true;
      }
      if (typeof party?.limitAmount === 'string' && !LIMIT_AMOUNT_PATTERN.test(party.limitAmount)) {
        errors.push({ kod: 'LIMIT_INVALID', alan: 'SORUMLULUK', dueIndex: index, debtorId, mesaj: SELECTION_ERROR_MESSAGES.LIMIT_INVALID });
        formatError = true;
      }
    }
    if (formatError) continue;
    const { selection, errors: selectionErrors } = normalizeSelectionDraft(
      {
        claimItemId: `due:${index}`,
        mode: String(draft.mode ?? ''),
        basis: draft.basis ?? null,
        basisNote: draft.basisNote ?? null,
        parties: (draft.parties ?? []).map((party) => ({
          caseDebtorId: String(party?.debtorId ?? ''),
          shareWeight: party?.shareWeight ?? null,
          sharePercent: party?.sharePercent ?? null,
          limitAmount: party?.limitAmount ?? null,
          unlimited: party?.unlimited ?? null,
        })),
      },
      { caseDebtors: selectionDebtors, claimItemActive: true },
    );
    for (const selectionError of selectionErrors) {
      errors.push({
        kod: selectionError.code,
        alan: 'SORUMLULUK',
        dueIndex: index,
        debtorId: selectionError.caseDebtorId ?? null,
        mesaj: SELECTION_ERROR_MESSAGES[selectionError.code] ?? 'Sorumluluk seçimi geçersiz.',
      });
    }
    if (selection) selectionByDue.set(index, selection);
  }

  // ── Önizleme ────────────────────────────────────────────────────────────────────────────────────────────────────
  const activePersons = new Set(debtorIds);
  const kalemler: OpeningClaimPreviewItem[] = [];
  const limitByDueAndDebtor = new Map<number, Map<string, { kind: 'MUTESELSIL' | 'PAYLI' | 'TUTARLA_SINIRLI'; limitKurus: bigint | null }>>();
  let totalKurus = 0n;
  dues.forEach((due, index) => {
    const itemType = itemTypes[index];
    if (itemType !== null) totalKurus += amountsKurus[index];
    const accrual = accrualByDue.get(index) ?? null;
    const selection = selectionByDue.get(index) ?? null;
    let pending: OpeningClaimPreviewItem['sorumluluk']['onayBekleyecekSecim'] = null;
    if (selection) {
      const projected = legacyProjection(selection.mode, selection.parties.map((party) => party.debtorId));
      const evaluated = evaluateItemLiability(
        {
          claimItemId: `due:${index}`,
          demandedKurus: amountsKurus[index],
          collectedKurus: 0n,
          isAllDebtorsLiable: projected.isAllDebtorsLiable,
          liableDebtorIds: projected.liableDebtorIds,
          activeSet: { setId: null, version: 1, mode: selection.mode, parties: selection.parties },
          attribution: EMPTY_ATTRIBUTION,
        },
        activePersons,
      );
      const kind = CLAIM_LIABILITY_KIND_LABEL[evaluated.kind];
      const perDebtor = new Map<string, { kind: 'MUTESELSIL' | 'PAYLI' | 'TUTARLA_SINIRLI'; limitKurus: bigint | null }>();
      for (const party of evaluated.parties) {
        perDebtor.set(party.debtorId, { kind: kind as 'MUTESELSIL' | 'PAYLI' | 'TUTARLA_SINIRLI', limitKurus: party.remainingLiabilityKurus });
      }
      limitByDueAndDebtor.set(index, perDebtor);
      pending = {
        tur: kind,
        dayanak: selection.basis,
        tavanKapsami: selection.limitScope,
        borclular: evaluated.parties.map((party) => ({
          debtorId: party.debtorId,
          pay: party.shareKurus === null ? null : fromKurus(party.shareKurus),
          payAgirligi: party.shareWeight,
          tavan: party.limitKurus === null ? null : fromKurus(party.limitKurus),
          sinirsiz: party.unlimited,
          sorumlulukSiniri: party.remainingLiabilityKurus === null ? null : fromKurus(party.remainingLiabilityKurus),
        })),
      };
    }
    kalemler.push({
      dueIndex: index,
      kalemTuru: itemType,
      aciklama: due.description ?? null,
      tutar: fromKurus(amountsKurus[index]),
      vekaletUcretiKaynagi: due.attorneyFeeBasis ?? null,
      faiz: {
        acilisDurumu: due.interestAccrualStatus === 'NO_INTEREST' ? 'NO_INTEREST' : 'UNKNOWN',
        anaparaKalemi: itemType !== null && classifyClaimItemType(itemType).category === 'PRINCIPAL',
        onayBekleyecekBeyan: accrual
          ? { durum: 'ACCRUES', faizTuruKodu: accrual.interestTypeCode, baslangic: accrual.interestStartDate, dayanak: accrual.interestStartDateProvenance }
          : null,
      },
      sorumluluk: { acilisTuru: 'BELIRLENMEDI', onayBekleyecekSecim: pending },
    });
  });

  const borcluDagilimi: OpeningClaimPreviewDebtor[] = debtorIds.map((debtorId) => {
    const rows: OpeningClaimPreviewDebtorRow[] = [];
    let undetermined = 0;
    let upperBound = 0n;
    dues.forEach((_due, index) => {
      if (itemTypes[index] === null) return;
      const perDebtor = limitByDueAndDebtor.get(index);
      if (!perDebtor) {
        undetermined += 1;
        rows.push({ dueIndex: index, durum: 'BELIRLENMEDI', sorumlulukSiniri: null });
        return;
      }
      const entry = perDebtor.get(debtorId);
      if (!entry) {
        rows.push({ dueIndex: index, durum: 'SECIMDE_YOK', sorumlulukSiniri: 0 });
        return;
      }
      if (entry.limitKurus === null) {
        undetermined += 1;
        rows.push({ dueIndex: index, durum: entry.kind, sorumlulukSiniri: null });
        return;
      }
      upperBound += entry.limitKurus;
      rows.push({ dueIndex: index, durum: entry.kind, sorumlulukSiniri: fromKurus(entry.limitKurus) });
    });
    return {
      debtorId,
      kalemler: rows,
      belirlenmeyenKalemSayisi: undetermined,
      sorumlulukUstSiniri: undetermined > 0 ? null : fromKurus(upperBound),
    };
  });

  const plan: OpeningClaimPlan = {
    previewHash: '',
    interestAccruals: [...accrualByDue.entries()]
      .sort(([a], [b]) => a - b)
      .map(([dueIndex, accrual]) => ({
        dueIndex,
        interestStartDate: accrual.interestStartDate,
        interestStartDateProvenance: accrual.interestStartDateProvenance,
      })),
    liabilitySelections: [...selectionByDue.entries()]
      .sort(([a], [b]) => a - b)
      .map(([dueIndex, selection]) => ({
        dueIndex,
        mode: selection.mode,
        basis: selection.basis,
        basisNote: selection.basisNote,
        parties: selection.parties.map((party) => ({
          debtorId: party.debtorId,
          shareWeight: party.shareWeight,
          limitAmount: party.limitKurus === null ? null : kurusToFixed(party.limitKurus),
          unlimited: party.unlimited,
        })),
      })),
  };

  // Özet, kullanıcıya GÖSTERİLEN girdiyi bağlar: kalem türü / tutarı / faiz kaydı, borçlular ve doğrulanmış beyanlar.
  // Geçersiz girdide özet yine üretilir ama `uygulanabilir = false` olduğu için açılışta kullanılamaz.
  const onizlemeOzeti = stableJsonHash({
    v: OPENING_CLAIM_REQUESTS_VERSION,
    currency,
    dues: dues.map((due, index) => ({
      type: String(due.type),
      amount: kurusToFixed(amountsKurus[index]),
      interestType: due.interestType ?? null,
      interestTypeCode: due.interestTypeCode ?? null,
      interestRate: due.interestRate ?? null,
      interestAccrualStatus: due.interestAccrualStatus ?? null,
      attorneyFeeBasis: due.attorneyFeeBasis ?? null,
    })),
    debtorIds,
    interestAccruals: plan.interestAccruals,
    liabilitySelections: plan.liabilitySelections,
    errorCount: errors.length,
  });

  return {
    preview: {
      surum: OPENING_CLAIM_REQUESTS_VERSION,
      paraBirimi: currency,
      kalemler,
      kalemTutarlariToplami: fromKurus(totalKurus),
      borcluDagilimi,
      onayaGidecekFaizBeyaniSayisi: plan.interestAccruals.length,
      onayaGidecekSorumlulukSecimiSayisi: plan.liabilitySelections.length,
      hatalar: errors,
      uygulanabilir: errors.length === 0,
      onizlemeOzeti,
      aciklamalar: OPENING_CLAIM_PREVIEW_NOTES,
    },
    plan: { ...plan, previewHash: onizlemeOzeti },
  };
}

/** Açılış isteğinde beyan var mı (boş blok "beyan yok" sayılır). */
export function hasOpeningClaimRequests(requests: OpeningClaimRequestsInput | null | undefined): boolean {
  return (requests?.interestAccruals?.length ?? 0) > 0 || (requests?.liabilitySelections?.length ?? 0) > 0;
}
