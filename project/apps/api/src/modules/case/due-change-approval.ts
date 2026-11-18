import { ConflictException } from '@nestjs/common';
import { CLAIM_ITEM_CASE_TARGET_TYPE } from '../claim-item/claim-item-approval.constants';
import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';
import type { CreateDueDto } from './dto/case.dto';

/**
 * Due (dosya kalemi) EKLEME talebi — owner kararı 19.11.2026: "Due üzerinden yeni alacak oluşturmayı da iki kişi onayı
 * kapsamına alıyorum… mevcut kalem oluşturma / onay altyapısını kullan… ikinci bir onay sistemi kurma."
 *
 * Model (borçlu sorumluluğu seçimiyle aynı desen):
 *  - AYNI işlem kodu (`CLAIM_ITEM_HIGH_IMPACT_CHANGE`), aynı onay geçidi, aynı iki kişi kuralı. Hedef dosyadır
 *    (`CLAIM_ITEM_CASE`). Talep kayıtlı niyetin SÜRÜMÜYLE ayrışır (`CASE_DUE_CHANGE_V1`).
 *  - Talep YALNIZ onay kaydı açar: Due satırı da kanonik kalem de OLUŞMAZ. Onaylanmamış alacak bu yüzden etkin borca,
 *    tahsilat dağıtımına ve dışa aktarıma giremez (ortada okunacak satır yoktur).
 *  - Onay yürütmesi (karar transaction'ı içinde, dosya kilidi altında) Due satırını ve — tür eşleniyorsa — kanonik kalemi
 *    dosya açılışıyla AYNI köprüden (`DUE_BRIDGE`) oluşturur. Kabul kuralları (tür, vekâlet ücreti kaynağı, faiz girişi,
 *    dosya para birimi) hem talepte hem yürütmede yeniden çalışır.
 *
 * SAF modül: veritabanı / servis bağımlılığı yok.
 *
 * Çağrıldığı yerler:
 * - CaseService.createDue() → POST /cases/:id/dues (talep niyeti + yinelenen talep anahtarı)
 * - CaseService.applyApprovedDueCreateInTx() → onay yürütmesi (niyet okuma + istek gövdesine geri çevirme)
 * - OfficeApprovalDomainSyncService.syncAfterDecision() → niyet sürümü ayrımı (`isCaseDueChangeIntent`)
 */
export const CASE_DUE_CHANGE_INTENT_VERSION = 'CASE_DUE_CHANGE_V1' as const;
export const CASE_DUE_CREATE_OPERATION = 'DUE_CREATE' as const;
export const CASE_DUE_CREATE_REASON =
  'Dosyaya yeni alacak kalemi eklenmesi yüksek etkili değişikliktir; iki kişi onayı gerekir.';

/**
 * `createDue`'nun OKUDUĞU istek alanları. Niyete yalnız bunlar girer; istekteki öteki alanlar (bugün de yok sayılan)
 * niyete taşınmaz — onaylayan, uygulanacak içeriğin tamamını görür.
 */
export const CASE_DUE_CREATE_FIELDS = [
  'type',
  'description',
  'amount',
  'dueDate',
  'currency',
  'interestType',
  'interestTypeCode',
  'interestRate',
  'interestAccrualStatus',
  'noInterestReason',
  'interestStartDate',
  'interestEndDate',
  'attorneyFeeBasis',
  'sourceDocumentNo',
  'hasKdv',
  'kdvRate',
  'isPrimary',
] as const;

export type CaseDueCreateField = (typeof CASE_DUE_CREATE_FIELDS)[number];
type CaseDueScalar = string | number | boolean | null;

/** Onaylanınca oluşturulacak Due'nun istek gövdesi (JSON'a güvenli; para birimi talep anında ÇÖZÜLMÜŞ değerdir). */
export type CaseDueCreatePayload = Partial<Record<CaseDueCreateField, CaseDueScalar>> & {
  type: string;
  amount: number;
  dueDate: string;
  currency: string;
};

export interface CaseDueCreateSavedIntent {
  version: typeof CASE_DUE_CHANGE_INTENT_VERSION;
  operation: typeof CASE_DUE_CREATE_OPERATION;
  caseId: string;
  due: CaseDueCreatePayload;
  reason: string;
}

/** Talep yanıtı: hiçbir Due / kalem oluşmadı; onay kaydı açıldı. */
export interface CaseDueCreateRequestResult {
  applied: false;
  approvalRequired: true;
  approvalRequestId: string;
  status: string;
  message: string;
}

export const CASE_DUE_CREATE_REQUESTED_MESSAGE =
  'Kalem ekleme talebi onaya gönderildi. İkinci bir kişinin onayından sonra dosyaya eklenir; o zamana kadar ' +
  'borca, tahsilat dağıtımına ve dışa aktarıma girmez.';

function isScalar(value: unknown): value is CaseDueScalar {
  return value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}

/**
 * İstek gövdesinden kayıtlı niyeti kurar. `currency`: talep anında çözülen para birimi (istek vermediyse dosyanınki);
 * yürütmede dosya para birimiyle YENİDEN karşılaştırılır. Tanımsız alan niyete girmez (özet kararlı kalsın).
 */
export function buildCaseDueCreateIntent(caseId: string, dto: CreateDueDto, currency: string): CaseDueCreateSavedIntent {
  const source = dto as unknown as Record<string, unknown>;
  const due: Record<string, CaseDueScalar> = {};
  for (const field of CASE_DUE_CREATE_FIELDS) {
    const value = field === 'currency' ? currency : source[field];
    if (value === undefined) continue;
    if (!isScalar(value)) {
      throw new ConflictException({ code: 'DUE_CREATE_INTENT_INVALID', message: `Kalem ekleme talebi alanı geçersiz: ${field}` });
    }
    due[field] = value;
  }
  return {
    version: CASE_DUE_CHANGE_INTENT_VERSION,
    operation: CASE_DUE_CREATE_OPERATION,
    caseId,
    due: due as CaseDueCreatePayload,
    reason: CASE_DUE_CREATE_REASON,
  };
}

/**
 * Aynı dosyada AYNI içerikli bekleyen talep ikinci kez açılmaz (aynı anahtar → mevcut talep döner). Farklı içerikli
 * talepler ayrı anahtar taşır; sonuçlanan talebin anahtarı onay altyapısınca boşaltılır (aynı kalem yeniden istenebilir).
 */
export function caseDueCreateIdempotencyKey(intent: CaseDueCreateSavedIntent): string {
  return `case-due-create:${intent.caseId}:${stableJsonHash(intent.due)}`;
}

/** Kayıtlı niyet bu ailedense (sürüm) true. Yapı doğrulaması `readCaseDueCreateIntent`'tedir. */
export function isCaseDueChangeIntent(savedIntent: unknown): boolean {
  return Boolean(
    savedIntent &&
      typeof savedIntent === 'object' &&
      (savedIntent as { version?: unknown }).version === CASE_DUE_CHANGE_INTENT_VERSION,
  );
}

const invalidIntent = (detail: string): ConflictException =>
  new ConflictException({ code: 'DUE_CREATE_INTENT_INVALID', message: `Kalem ekleme talebi kaydı geçersiz (${detail}); uygulanmadı.` });

/**
 * Onay yürütmesi için niyeti doğrulayarak okur: sürüm, işlem, hedef (dosya) ve alan kümesi. Beklenmeyen alan ya da
 * skaler olmayan değer → ret (kapalı-hata); talep onay bekler durumda kalır.
 */
export function readCaseDueCreateIntent(req: {
  readonly targetType: string;
  readonly targetRef: string;
  readonly savedIntent: unknown;
}): CaseDueCreateSavedIntent {
  const value = req.savedIntent as Partial<CaseDueCreateSavedIntent> | null;
  if (!value || typeof value !== 'object' || value.version !== CASE_DUE_CHANGE_INTENT_VERSION) throw invalidIntent('sürüm');
  if (value.operation !== CASE_DUE_CREATE_OPERATION) throw invalidIntent('işlem');
  if (typeof value.caseId !== 'string' || !value.caseId) throw invalidIntent('dosya');
  if (req.targetType !== CLAIM_ITEM_CASE_TARGET_TYPE || req.targetRef !== value.caseId) throw invalidIntent('hedef');
  const due = value.due as Record<string, unknown> | undefined;
  if (!due || typeof due !== 'object' || Array.isArray(due)) throw invalidIntent('içerik');
  const allowed = new Set<string>(CASE_DUE_CREATE_FIELDS);
  for (const [field, fieldValue] of Object.entries(due)) {
    if (!allowed.has(field)) throw invalidIntent(`alan ${field}`);
    if (!isScalar(fieldValue)) throw invalidIntent(`değer ${field}`);
  }
  if (typeof due.type !== 'string' || !due.type) throw invalidIntent('tür');
  if (typeof due.amount !== 'number') throw invalidIntent('tutar');
  if (typeof due.dueDate !== 'string' || !due.dueDate) throw invalidIntent('vade');
  if (typeof due.currency !== 'string' || !due.currency) throw invalidIntent('para birimi');
  return value as CaseDueCreateSavedIntent;
}

/** Kayıtlı niyeti `createDue`'nun işlediği istek gövdesine geri çevirir (yalnız kayıtlı alanlar). */
export function caseDueCreateDtoFromIntent(intent: CaseDueCreateSavedIntent): CreateDueDto {
  return { ...intent.due } as unknown as CreateDueDto;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Due GÜNCELLEME / SİLME talebi — owner kararı 19.11.2026: "Mali veya hukuki çıktıyı değiştiren alanları mevcut onay
// korumasına dahil et; kullanıcıya düzenleme yolu sunmadan yalnız düğmeleri kapatma."
//
// Kaleme ULAŞMAYAN ama Due satırından okuyan çıktıları (eski hesap özeti, açılış masrafı matrahı, belge tutarları,
// "UYAP'a Aktar" XML'i) değiştiren Due değişiklikleri aynı onaya talep olur ve onay yürütmesinde uygulanır:
//  - aynı kanonik kalem türüne eşlenen alt tür değişimi (ör. asıl alacak ↔ kira / prim),
//  - bağlı kalemi OLMAYAN Due'da (nafaka) tutar, para birimi, vade, faiz alanları ve silme.
// Açıklayıcı alanlar (açıklama, sıra, ana kalem, KDV, kesinleşme, kaynak belge no) onaya bağlanmaz.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const CASE_DUE_UPDATE_OPERATION = 'DUE_UPDATE' as const;
export const CASE_DUE_DELETE_OPERATION = 'DUE_DELETE' as const;
export const CASE_DUE_UPDATE_REASON =
  'Dosya kaleminde hesap ve dışa aktarım çıktısını değiştiren alan değişikliği yüksek etkili değişikliktir; iki kişi onayı gerekir.';
export const CASE_DUE_DELETE_REASON =
  'Bağlı alacak kalemi olmayan dosya kaleminin silinmesi yüksek etkili değişikliktir; iki kişi onayı gerekir.';

/** `updateDue`'nun OKUDUĞU istek alanları. Niyete yalnız bunlar girer. */
export const CASE_DUE_UPDATE_FIELDS = [
  'type',
  'description',
  'amount',
  'dueDate',
  'currency',
  'interestType',
  'interestTypeCode',
  'interestRate',
  'interestAccrualStatus',
  'noInterestReason',
  'interestStartDate',
  'interestEndDate',
  'sourceDocumentNo',
  'hasKdv',
  'kdvRate',
  'isFinalized',
  'finalizationDate',
  'finalizationNote',
  'sortOrder',
  'isPrimary',
] as const;
export type CaseDueUpdateField = (typeof CASE_DUE_UPDATE_FIELDS)[number];

/** Due satırından okuyan mali / hukuki çıktıları belirleyen Due sütunları (durum özeti bunlardan hesaplanır). */
export interface CaseDueEffectiveState {
  readonly type: string;
  readonly amount: unknown;
  readonly currency: string;
  readonly dueDate: Date | null;
  readonly interestType: string | null;
  readonly interestTypeCode: string | null;
  readonly interestRate: unknown;
  readonly interestStartDate: Date | null;
  readonly interestEndDate: Date | null;
}

const fixed2 = (value: unknown): string | null =>
  value === null || value === undefined ? null : Number(value as number).toFixed(2);
const isoDate = (value: Date | null | undefined): string | null => (value ? new Date(value).toISOString() : null);

/** Okunur + karşılaştırılabilir durum görüntüsü (tutar / oran iki hane, tarih ISO). */
export function caseDueEffectiveSnapshot(due: CaseDueEffectiveState): Record<string, string | null> {
  return {
    type: due.type,
    amount: fixed2(due.amount),
    currency: due.currency,
    dueDate: isoDate(due.dueDate),
    interestType: due.interestType ?? null,
    interestTypeCode: due.interestTypeCode ?? null,
    interestRate: fixed2(due.interestRate),
    interestStartDate: isoDate(due.interestStartDate),
    interestEndDate: isoDate(due.interestEndDate),
  };
}

/** Talep anındaki durum özeti; onay yürütmesi satır kilidi altında yeniden hesaplayıp karşılaştırır. */
export function caseDueStateDigest(due: CaseDueEffectiveState): string {
  return stableJsonHash(caseDueEffectiveSnapshot(due));
}

export interface CaseDueUpdateSavedIntent {
  version: typeof CASE_DUE_CHANGE_INTENT_VERSION;
  operation: typeof CASE_DUE_UPDATE_OPERATION;
  caseId: string;
  dueId: string;
  /** Kullanıcının gönderdiği değişiklik (yalnız `updateDue`'nun okuduğu alanlar). Yürütmede aynen yeniden işlenir. */
  patch: Partial<Record<CaseDueUpdateField, CaseDueScalar>>;
  /** Onaya tabi kılan alanlar (istek alan adlarıyla). */
  effectiveFields: string[];
  /** Talep anındaki Due durumu: yürütme `stateDigest` ile karşılaştırır; `before` onaylayanın okuması içindir. */
  stateDigest: string;
  before: Record<string, string | null>;
  reason: string;
}

export interface CaseDueDeleteSavedIntent {
  version: typeof CASE_DUE_CHANGE_INTENT_VERSION;
  operation: typeof CASE_DUE_DELETE_OPERATION;
  caseId: string;
  dueId: string;
  stateDigest: string;
  before: Record<string, string | null>;
  reason: string;
}

export type CaseDueChangeSavedIntent = CaseDueCreateSavedIntent | CaseDueUpdateSavedIntent | CaseDueDeleteSavedIntent;

/** Talep yanıtı (güncelleme / silme): hiçbir kayıt değişmedi; onay kaydı açıldı. */
export interface CaseDueChangeRequestResult {
  applied: false;
  approvalRequired: true;
  approvalRequestId: string;
  status: string;
  fields?: string[];
  message: string;
}

export const CASE_DUE_UPDATE_REQUESTED_MESSAGE =
  'Bu değişiklik hesap ve dışa aktarım çıktısını etkilediği için onaya gönderildi. İkinci bir kişinin onayından ' +
  'sonra uygulanır; o zamana kadar dosya kalemi değişmez.';
export const CASE_DUE_DELETE_REQUESTED_MESSAGE =
  'Silme talebi onaya gönderildi. İkinci bir kişinin onayından sonra uygulanır; o zamana kadar dosya kalemi yerinde kalır.';

export function buildCaseDueUpdateIntent(input: {
  readonly caseId: string;
  readonly dueId: string;
  readonly request: object;
  readonly effectiveFields: readonly string[];
  readonly due: CaseDueEffectiveState;
}): CaseDueUpdateSavedIntent {
  const source = input.request as Record<string, unknown>;
  const patch: Record<string, CaseDueScalar> = {};
  for (const field of CASE_DUE_UPDATE_FIELDS) {
    const value = source[field];
    if (value === undefined) continue;
    if (!isScalar(value)) {
      throw new ConflictException({ code: 'DUE_CHANGE_INTENT_INVALID', message: `Dosya kalemi talebi alanı geçersiz: ${field}` });
    }
    patch[field] = value;
  }
  return {
    version: CASE_DUE_CHANGE_INTENT_VERSION,
    operation: CASE_DUE_UPDATE_OPERATION,
    caseId: input.caseId,
    dueId: input.dueId,
    patch,
    effectiveFields: [...input.effectiveFields],
    stateDigest: caseDueStateDigest(input.due),
    before: caseDueEffectiveSnapshot(input.due),
    reason: CASE_DUE_UPDATE_REASON,
  };
}

export function buildCaseDueDeleteIntent(input: {
  readonly caseId: string;
  readonly dueId: string;
  readonly due: CaseDueEffectiveState & { readonly description: string | null };
}): CaseDueDeleteSavedIntent {
  return {
    version: CASE_DUE_CHANGE_INTENT_VERSION,
    operation: CASE_DUE_DELETE_OPERATION,
    caseId: input.caseId,
    dueId: input.dueId,
    stateDigest: caseDueStateDigest(input.due),
    before: { ...caseDueEffectiveSnapshot(input.due), description: input.due.description ?? null },
    reason: CASE_DUE_DELETE_REASON,
  };
}

/** Bir Due için aynı anda TEK bekleyen güncelleme ve TEK bekleyen silme talebi (kalem değişikliği yoluyla aynı kural). */
export const caseDueUpdateIdempotencyKey = (dueId: string): string => `case-due-update:${dueId}`;
export const caseDueDeleteIdempotencyKey = (dueId: string): string => `case-due-delete:${dueId}`;

/** Bekleyen talep içeriği karşılaştırması (durum görüntüsü hariç: aynı değişiklik yeniden gönderilirse aynı talep). */
export function caseDueUpdateComparable(intent: Pick<CaseDueUpdateSavedIntent, 'dueId' | 'patch'>): string {
  return stableJsonHash({ dueId: intent.dueId, patch: intent.patch });
}

const invalidChangeIntent = (detail: string): ConflictException =>
  new ConflictException({ code: 'DUE_CHANGE_INTENT_INVALID', message: `Dosya kalemi talebi kaydı geçersiz (${detail}); uygulanmadı.` });

export type CaseDueChangeOperation =
  | typeof CASE_DUE_CREATE_OPERATION
  | typeof CASE_DUE_UPDATE_OPERATION
  | typeof CASE_DUE_DELETE_OPERATION;

/** Kayıtlı niyetin işlemi (ekleme / güncelleme / silme); tanınmayan işlem → ret. */
export function caseDueChangeOperation(savedIntent: unknown): CaseDueChangeOperation {
  const operation = (savedIntent as { operation?: unknown } | null)?.operation;
  if (operation === CASE_DUE_CREATE_OPERATION || operation === CASE_DUE_UPDATE_OPERATION || operation === CASE_DUE_DELETE_OPERATION) {
    return operation;
  }
  throw invalidChangeIntent('işlem');
}

function readCommon(
  req: { readonly targetType: string; readonly targetRef: string; readonly savedIntent: unknown },
  operation: string,
): Record<string, unknown> {
  const value = req.savedIntent as Record<string, unknown> | null;
  if (!value || typeof value !== 'object' || value.version !== CASE_DUE_CHANGE_INTENT_VERSION) throw invalidChangeIntent('sürüm');
  if (value.operation !== operation) throw invalidChangeIntent('işlem');
  if (typeof value.caseId !== 'string' || !value.caseId) throw invalidChangeIntent('dosya');
  if (req.targetType !== CLAIM_ITEM_CASE_TARGET_TYPE || req.targetRef !== value.caseId) throw invalidChangeIntent('hedef');
  if (typeof value.dueId !== 'string' || !value.dueId) throw invalidChangeIntent('dosya kalemi');
  if (typeof value.stateDigest !== 'string' || !value.stateDigest) throw invalidChangeIntent('durum özeti');
  return value;
}

/** Onay yürütmesi için güncelleme niyetini doğrulayarak okur (beklenmeyen alan / skaler olmayan değer → ret). */
export function readCaseDueUpdateIntent(req: {
  readonly targetType: string;
  readonly targetRef: string;
  readonly savedIntent: unknown;
}): CaseDueUpdateSavedIntent {
  const value = readCommon(req, CASE_DUE_UPDATE_OPERATION);
  const patch = value.patch as Record<string, unknown> | undefined;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).length === 0) throw invalidChangeIntent('içerik');
  const allowed = new Set<string>(CASE_DUE_UPDATE_FIELDS);
  for (const [field, fieldValue] of Object.entries(patch)) {
    if (!allowed.has(field)) throw invalidChangeIntent(`alan ${field}`);
    if (!isScalar(fieldValue)) throw invalidChangeIntent(`değer ${field}`);
  }
  if (!Array.isArray(value.effectiveFields) || value.effectiveFields.length === 0) throw invalidChangeIntent('onaya tabi alanlar');
  return value as unknown as CaseDueUpdateSavedIntent;
}

/** Onay yürütmesi için silme niyetini doğrulayarak okur. */
export function readCaseDueDeleteIntent(req: {
  readonly targetType: string;
  readonly targetRef: string;
  readonly savedIntent: unknown;
}): CaseDueDeleteSavedIntent {
  return readCommon(req, CASE_DUE_DELETE_OPERATION) as unknown as CaseDueDeleteSavedIntent;
}
