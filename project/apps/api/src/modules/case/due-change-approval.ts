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
