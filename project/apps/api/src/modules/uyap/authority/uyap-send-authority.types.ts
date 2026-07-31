/**
 * UYAP-SEND-AUTHORITY-RESOLVER-I01 — UYAP_SEND hukuki yetki zinciri kontratları.
 *
 * Owner DECISION-1 (RATIFIED): **MODEL B — ACTING-LAWYER MATCHED POA.**
 * Office membership · personnel status · case assignment · responsible-lawyer ataması ·
 * admin/super-admin rolü · internal permission · client-provided `lawyerId` · başka avukata
 * ait POA → **tek başına execution authority DEĞİLDİR** (`UYAP-CONST-002`, `UYAP-BC-OFFICE-001`,
 * `UYAP-BC-CLIENT-001`).
 */

/** Fail-closed yetki reddi kodları. Dış yanıt GENERIC kalır; kod yalnız decision-log/evidence içindir. */
export type UyapAuthorityFailureCode =
  // acting lawyer (I01 resolver'dan devralınır)
  | "ACTING_LAWYER_NOT_RESOLVED"
  | "ACTING_LAWYER_AMBIGUOUS"
  | "LAWYER_TENANT_MISMATCH"
  // case / client
  | "CASE_NOT_FOUND"
  | "CASE_TENANT_MISMATCH"
  | "CASE_CLIENT_MISMATCH"
  | "CLIENT_TENANT_MISMATCH"
  // POA
  | "POWER_OF_ATTORNEY_MISSING"
  | "POWER_OF_ATTORNEY_NOT_EFFECTIVE"
  | "POWER_OF_ATTORNEY_EXPIRED"
  | "POWER_OF_ATTORNEY_REVOKED"
  | "POWER_OF_ATTORNEY_SCOPE_MISMATCH"
  | "POWER_OF_ATTORNEY_LAWYER_MISMATCH"
  | "AUTHORITY_RECORD_CONFLICT"
  // bağlam
  | "AUTHORITY_CONTEXT_INVALID";

/**
 * I15-D1 (OWNER LEGAL DECISION, RATIFIED): resolver'ın tanıdığı iki kanonik operasyon.
 * Serbest string ARTIK kabul edilmez — `operationType` bu iki değerden biri olmalıdır.
 * Yeni bir operasyon eklemek, o operasyon için POA scope-coverage haritasının owner
 * tarafından AYRICA ratifiye edilmesini gerektirir (bkz. `uyap-send-authority-resolver.service.ts`
 * içindeki `OPERATION_ALLOWED_POA_SCOPES`) — isimden otomatik yetki türetilmez.
 */
export const UyapSendAuthorityOperation = {
  UYAP_SEND: "UYAP_SEND",
  TRIGGER_HACIZ: "TRIGGER_HACIZ",
} as const;

export type UyapSendAuthorityOperationType =
  (typeof UyapSendAuthorityOperation)[keyof typeof UyapSendAuthorityOperation];

/**
 * Resolver girdisi — TAMAMI server-authoritative olmalıdır.
 * `clientId` KASITLI olarak yoktur: temsil ilişkisi case üzerinden çözülür, request body'den ALINMAZ.
 */
export interface UyapSendAuthorityContext {
  readonly tenantId: string;
  readonly authenticatedUserId: string;
  /** I01 `ActingLawyerResolverService` tarafından server-side çözülmüş olmalıdır. */
  readonly actingLawyerId: string;
  readonly caseId: string;
  readonly operationType: UyapSendAuthorityOperationType;
  readonly evaluatedAt: Date;
}

/**
 * Yetkiyi taşıyan POA referansı. **POA belge içeriği/serbest metni TAŞINMAZ** (PII minimizasyonu,
 * `UYAP-CONST-007`); yalnız kimlik + freshness alanları. I05 (TX-1 revalidation) bu snapshot'ı
 * karşılaştırma için kullanır.
 */
export interface AuthorityEvidenceRef {
  readonly poaId: string;
  readonly clientId: string;
  readonly tenantId: string;
  readonly poaLawyerId: string;
  /** freshness/TOCTOU karşılaştırması için sürüm göstergesi */
  readonly poaUpdatedAt: Date;
  readonly poaStatus: string;
  readonly poaScopeType: string;
  /**
   * UYAP-AUTHORITY-FRESHNESS-TX-I01 (additive): TX-1 revalidation'ın `updatedAt` DIŞINDA
   * SEMANTİK alan karşılaştırması yapabilmesi için yürürlük alanları. `updatedAt` tek
   * başına yeterli değildir (aynı milisaniye içinde değişim, saat kayması, `updatedAt`
   * tetiklemeyen raw yazma yolları). PII taşımaz — belge metni/açıklama KOPYALANMAZ.
   */
  readonly poaIsActive: boolean;
  readonly poaIsLimited: boolean;
  readonly poaDateIssued: Date | null;
  readonly poaValidUntil: Date | null;
}

/** Boolean yerine yapısal karar — denied kararlar da evidence zincirine bağlanabilsin diye. */
export interface UyapAuthorityDecision {
  readonly allowed: boolean;
  readonly tenantId: string;
  readonly userId: string;
  readonly actingLawyerId: string;
  readonly caseId: string;
  /** Tek client'lı case'lerde dolu; çok client'lı case'lerde `undefined` (evidence hepsini taşır). */
  readonly clientId?: string;
  readonly operationType: string;
  readonly evaluatedAt: Date;
  /** Deterministik sıralı (poaId ASC) — aynı girdi aynı evidence setini üretir. */
  readonly authorityEvidence: readonly AuthorityEvidenceRef[];
  readonly failureCode?: UyapAuthorityFailureCode;
  /** Kural sürümü — policy/evidence kayıtlarında taşınır. */
  readonly authorityVersion: string;
}

/** Bu resolver'ın uyguladığı kural setinin sürümü (evidence'a yazılır). */
export const UYAP_SEND_AUTHORITY_VERSION = "UYAP-SEND-AUTHORITY/v1";
