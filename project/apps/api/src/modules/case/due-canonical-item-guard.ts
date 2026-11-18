import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DueType, UpdateDueDto } from './dto/case.dto';
import { mapDueTypeToClaimItemType } from './due-to-claim-item.mapper';

/**
 * Due (dosya kalemi) yazım yolunun bağlı KANONİK alacak kalemine etkisi — owner kararı 18.11.2026 (K1 / K2 / K3).
 *
 * Kural:
 *  - Due isteği, bağlı kanonik kalemde YÜKSEK ETKİLİ değişiklik (tutar, tür, para birimi, vade, faiz alanları) ya da
 *    iptal GEREKTİRİYORSA hiçbir yazımdan ÖNCE reddedilir (409). Bu değişiklikler yalnız kalem ucundan
 *    (`PUT / DELETE /claim-items/:id`) ve mevcut iki kişi onayıyla yapılır; ikinci bir onay yolu KURULMAZ.
 *  - İsteğin TAŞIMADIĞI alan değişmez: Due'daki boş / eski değer kaleme YAZILMAZ.
 *  - Aynı değerin gönderilmesi değişiklik sayılmaz: gönderilen değer Due'da kayıtlı değere eşitse o alan yok sayılır
 *    (kalem farklı olsa da kaleme dokunulmaz). Gönderilen değer Due'dan farklı ama kalemdeki değere EŞİTSE yalnız Due
 *    yazılır (kalem değişmez).
 *  - Kaleme yalnız düşük etkili alanlar (açıklama, sıra) yansır.
 *
 * SAF modül: veritabanı / servis bağımlılığı yok; karar girdi satırlarından üretilir.
 *
 * Çağrıldığı yerler:
 * - CaseService.updateDue() → PATCH /cases/:id/dues/:dueId (yazımdan önce plan + ret)
 * - CaseService.deleteDue() → DELETE /cases/:id/dues/:dueId (istisna sınıfları)
 * - CaseService.assertDueWriteAuthorityInTx() → POST / PATCH / DELETE /cases/:id/dues[/:dueId] (yetki reddi)
 */

export const DUE_CHANGE_REQUIRES_CLAIM_ITEM_APPROVAL = 'DUE_CHANGE_REQUIRES_CLAIM_ITEM_APPROVAL';
export const DUE_DELETE_REQUIRES_CLAIM_ITEM_CANCEL_APPROVAL = 'DUE_DELETE_REQUIRES_CLAIM_ITEM_CANCEL_APPROVAL';
export const DUE_EDIT_BLOCKED_BY_PENDING_CLAIM_ITEM_APPROVAL = 'DUE_EDIT_BLOCKED_BY_PENDING_CLAIM_ITEM_APPROVAL';
export const DUE_WRITE_FORBIDDEN = 'DUE_WRITE_FORBIDDEN';

/** Kanonik kalemde yüksek etkili sayılan ve Due isteğiyle değiştirilemeyen alanlar (Due isteği alan adlarıyla). */
export const DUE_HIGH_IMPACT_FIELDS = [
  'type',
  'amount',
  'currency',
  'dueDate',
  'interestTypeCode',
  'interestType',
  'interestRate',
  'interestAccrualStatus',
  'noInterestReason',
  'interestStartDate',
  'interestEndDate',
] as const;

export type DueHighImpactField = (typeof DUE_HIGH_IMPACT_FIELDS)[number];

const FIELD_LABELS: Record<DueHighImpactField, string> = {
  type: 'tür',
  amount: 'tutar',
  currency: 'para birimi',
  dueDate: 'vade tarihi',
  interestTypeCode: 'faiz türü',
  interestType: 'faiz türü',
  interestRate: 'faiz oranı',
  interestAccrualStatus: 'faiz durumu',
  noInterestReason: 'faizsizlik gerekçesi',
  interestStartDate: 'faiz başlangıç tarihi',
  interestEndDate: 'faiz bitiş tarihi',
};

/** Kullanıcıya gösterilen, yinelenmeyen alan adları ("tutar, vade tarihi"). */
export function describeDueHighImpactFields(fields: readonly DueHighImpactField[]): string {
  return [...new Set(fields.map((field) => FIELD_LABELS[field]))].join(', ');
}

export interface DueRowForCanonicalGuard {
  readonly type: string;
  readonly description: string | null;
  readonly amount: unknown;
  readonly dueDate: Date;
  readonly currency: string;
  readonly interestType: string | null;
  readonly interestTypeCode: string | null;
  readonly interestRate: unknown;
  readonly interestStartDate: Date | null;
  readonly interestEndDate: Date | null;
  readonly sortOrder: number;
}

export interface BoundClaimItemForCanonicalGuard {
  readonly id: string;
  readonly itemType: string;
  readonly amount: unknown;
  readonly demandedAmount: unknown;
  readonly currency: string;
  readonly dueDate: Date | null;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly interestType: string | null;
  readonly interestTypeCode: string | null;
  readonly interestRate: unknown;
  readonly interestStartDate: Date | null;
  readonly interestEndDate: Date | null;
  readonly interestAccrualStatus: string;
  readonly noInterestReason: string | null;
}

/** `normalizeDueInterestForWrite` çıktısının Due'ya yazılacak faiz üçlüsü (yalnız istek faiz alanı taşıyorsa dolu). */
export interface DueNormalizedInterestWrite {
  readonly interestTypeCode?: string | null;
  readonly interestType?: string | null;
  readonly interestRate?: number | null;
}

export interface DueCanonicalUpdatePlan {
  /** Bağlı kanonik kalemde yüksek etkili değişiklik gerektiren istek alanları; boş değilse istek REDDEDİLİR. */
  readonly highImpactFields: readonly DueHighImpactField[];
  /** Kaleme yansıyacak düşük etkili alanlar (yalnız değişenler). Boşsa kaleme hiç yazılmaz. */
  readonly claimItemPatch: Readonly<{ description?: string | null; sortOrder?: number }>;
}

const MONEY_SCALE = 2; // Due.amount / ClaimItem.amount Decimal(15,2); faiz oranı Decimal(5,2)

function toDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value as Prisma.Decimal.Value).toDecimalPlaces(MONEY_SCALE);
}

/** Tutar / oran: sütun ölçeğinde (2 hane) karşılaştırılır; iki taraf da boşsa eşittir. */
export function sameDecimal(left: unknown, right: unknown): boolean {
  const a = toDecimal(left);
  const b = toDecimal(right);
  if (a === null || b === null) return a === b;
  return a.equals(b);
}

/** Tarih: aynı an (epoch) ise eşittir; iki taraf da boşsa eşittir. Dize istek değeri `new Date()` ile okunur. */
export function sameInstant(left: Date | string | null | undefined, right: Date | string | null | undefined): boolean {
  const a = left === null || left === undefined || left === '' ? null : new Date(left).getTime();
  const b = right === null || right === undefined || right === '' ? null : new Date(right).getTime();
  return a === b;
}

function sameText(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left ?? null) === (right ?? null);
}

function has(input: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key) && (input as Record<string, unknown>)[key] !== undefined;
}

/**
 * Due güncelleme isteğinin bağlı kanonik kaleme etkisini planlar. `claimItem` yoksa (kanonik kalem üretmeyen tür)
 * plan boştur: Due kendi alanlarıyla güncellenir.
 */
export function planDueCanonicalUpdate(input: {
  readonly due: DueRowForCanonicalGuard;
  readonly claimItem: BoundClaimItemForCanonicalGuard | null;
  readonly request: UpdateDueDto;
  /** İstek faiz türü / oranı / durumu / gerekçesi taşıyorsa normalize edilmiş faiz üçlüsü; taşımıyorsa boş nesne. */
  readonly normalizedInterest: DueNormalizedInterestWrite;
}): DueCanonicalUpdatePlan {
  const { due, claimItem, request, normalizedInterest } = input;
  if (!claimItem) return { highImpactFields: [], claimItemPatch: {} };

  const violations = new Set<DueHighImpactField>();
  /** `dueSame`: istek Due'daki değeri yineliyor → alan yok sayılır. Aksi hâlde kalem aynı değerde değilse ihlal. */
  const check = (field: DueHighImpactField, dueSame: boolean, itemSame: boolean): void => {
    if (!dueSame && !itemSame) violations.add(field);
  };

  if (has(request, 'type')) {
    const requested = request.type as DueType;
    const mapped = mapDueTypeToClaimItemType(requested);
    check('type', requested === due.type, mapped !== null && mapped === claimItem.itemType);
  }
  if (has(request, 'amount')) {
    check(
      'amount',
      sameDecimal(request.amount, due.amount),
      sameDecimal(request.amount, claimItem.demandedAmount) && sameDecimal(request.amount, claimItem.amount),
    );
  }
  if (has(request, 'currency')) {
    check('currency', sameText(request.currency, due.currency), sameText(request.currency, claimItem.currency));
  }
  // Boş vade "gönderilmedi" sayılır (mevcut yazım kuralı: boş değer Due'da vadeyi değiştirmez).
  if (has(request, 'dueDate') && request.dueDate) {
    check('dueDate', sameInstant(request.dueDate, due.dueDate), sameInstant(request.dueDate, claimItem.dueDate));
  }

  if (has(normalizedInterest, 'interestTypeCode')) {
    check(
      'interestTypeCode',
      sameText(normalizedInterest.interestTypeCode, due.interestTypeCode),
      sameText(normalizedInterest.interestTypeCode, claimItem.interestTypeCode),
    );
  }
  if (has(normalizedInterest, 'interestType')) {
    check(
      'interestType',
      sameText(normalizedInterest.interestType, due.interestType),
      sameText(normalizedInterest.interestType, claimItem.interestType),
    );
  }
  if (has(normalizedInterest, 'interestRate')) {
    check(
      'interestRate',
      sameDecimal(normalizedInterest.interestRate, due.interestRate),
      sameDecimal(normalizedInterest.interestRate, claimItem.interestRate),
    );
  }
  // Faiz durumu ve faizsizlik gerekçesi Due'da SAKLANMAZ: gönderildiyse yalnız kalemdeki değerle karşılaştırılır.
  if (has(request, 'interestAccrualStatus')) {
    check('interestAccrualStatus', false, request.interestAccrualStatus === claimItem.interestAccrualStatus);
  }
  if (has(request, 'noInterestReason')) {
    check('noInterestReason', false, sameText(request.noInterestReason?.trim() || null, claimItem.noInterestReason));
  }
  // Boş faiz tarihi "gönderilmedi" sayılır (mevcut yazım kuralı: Due ucu faiz tarihini boşaltamaz).
  if (has(request, 'interestStartDate') && request.interestStartDate) {
    check(
      'interestStartDate',
      sameInstant(request.interestStartDate, due.interestStartDate),
      sameInstant(request.interestStartDate, claimItem.interestStartDate),
    );
  }
  if (has(request, 'interestEndDate') && request.interestEndDate) {
    check(
      'interestEndDate',
      sameInstant(request.interestEndDate, due.interestEndDate),
      sameInstant(request.interestEndDate, claimItem.interestEndDate),
    );
  }

  const claimItemPatch: { description?: string | null; sortOrder?: number } = {};
  if (
    has(request, 'description') &&
    !sameText(request.description, due.description) &&
    !sameText(request.description, claimItem.description)
  ) {
    claimItemPatch.description = request.description ?? null;
  }
  if (has(request, 'sortOrder') && request.sortOrder !== due.sortOrder && request.sortOrder !== claimItem.sortOrder) {
    claimItemPatch.sortOrder = request.sortOrder;
  }

  return {
    highImpactFields: DUE_HIGH_IMPACT_FIELDS.filter((field) => violations.has(field)),
    claimItemPatch,
  };
}

const CANONICAL_SCREEN = '"Alacak Kalemleri (Kanonik)" panelinde';
const NOTHING_CHANGED = 'Hiçbir kayıt değiştirilmedi.';

/** Due isteği bağlı kanonik kalemde yüksek etkili değişiklik gerektiriyor: yazımdan önce ret + kalem ucuna yönlendirme. */
export class DueChangeRequiresClaimItemApprovalException extends ConflictException {
  constructor(claimItemId: string, fields: readonly DueHighImpactField[]) {
    super({
      statusCode: 409,
      error: 'Due Change Requires Claim Item Approval',
      code: DUE_CHANGE_REQUIRES_CLAIM_ITEM_APPROVAL,
      message:
        `Bu değişiklik (${describeDueHighImpactFields(fields)}) bağlı alacak kaleminin onaya tabi bilgisini değiştirir ve ` +
        `bu pencereden yapılamaz. Değişikliği ${CANONICAL_SCREEN} kalemi düzenleyip "Onaya Gönder" ile isteyin; ` +
        `ikinci bir kişinin onayıyla uygulanır. ${NOTHING_CHANGED}`,
      claimItemId,
      fields: [...fields],
      canonicalAction: { method: 'PUT', path: `/claim-items/${claimItemId}` },
    });
    this.name = 'DueChangeRequiresClaimItemApprovalException';
  }
}

/** Due silme isteği bağlı ETKİN kanonik kalemin iptalini gerektiriyor: yazımdan önce ret. */
export class DueDeleteRequiresClaimItemCancelException extends ConflictException {
  constructor(claimItemId: string) {
    super({
      statusCode: 409,
      error: 'Due Delete Requires Claim Item Cancel Approval',
      code: DUE_DELETE_REQUIRES_CLAIM_ITEM_CANCEL_APPROVAL,
      message:
        `Bu dosya kalemine bağlı etkin bir alacak kalemi var; silme, o kalemin iptalini gerektirir ve iki kişi onayına ` +
        `tabidir. Önce ${CANONICAL_SCREEN} kalemin silinmesini isteyin; onaylandıktan sonra dosya kalemi silinebilir. ` +
        NOTHING_CHANGED,
      claimItemId,
      canonicalAction: { method: 'DELETE', path: `/claim-items/${claimItemId}` },
    });
    this.name = 'DueDeleteRequiresClaimItemCancelException';
  }
}

/**
 * Bağlı kalemde bekleyen onay talebi varken kaleme yansıyacak Due değişikliği: yazımdan önce ret. Kaleme yapılan her
 * yazım bekleyen talebin durum özetini bayatlatır ve talebi onaylanamaz bırakır; Due yolu bunu sessizce yapamaz.
 */
export class DueEditBlockedByPendingClaimItemApprovalException extends ConflictException {
  constructor(claimItemId: string) {
    super({
      statusCode: 409,
      error: 'Due Edit Blocked By Pending Claim Item Approval',
      code: DUE_EDIT_BLOCKED_BY_PENDING_CLAIM_ITEM_APPROVAL,
      message:
        `Bağlı alacak kaleminde bekleyen bir onay talebi var. Talep sonuçlanmadan bu dosya kaleminde kaleme yansıyan ` +
        `değişiklik yapılamaz (değişiklik bekleyen talebi geçersiz kılardı). Önce Onay Kutusu'ndaki talebi ` +
        `sonuçlandırın. ${NOTHING_CHANGED}`,
      claimItemId,
    });
    this.name = 'DueEditBlockedByPendingClaimItemApprovalException';
  }
}

/** Due yazımı için dosya düzeyi mali yazma yetkisi yok. `reasonCode` kalem yazma kapısının ret sözlüğündendir. */
export class DueWriteForbiddenException extends ForbiddenException {
  constructor(reasonCode: string) {
    super({
      statusCode: 403,
      error: 'Due Write Forbidden',
      code: DUE_WRITE_FORBIDDEN,
      reasonCode,
      message:
        'Dosya kalemi eklemek, değiştirmek veya silmek için bu dosyada mali düzenleme yetkisi gerekir. ' +
        'Yetki, dosya ekibindeki kaydınızdan verilir; büro yöneticinize başvurun. ' +
        NOTHING_CHANGED,
    });
    this.name = 'DueWriteForbiddenException';
  }
}
