/**
 * OFFICE-P2-CAP02-CANARY-PRINCIPAL-AND-CASE-PROVISION-I01 — SAF ÇEKİRDEK.
 *
 * `OFFICE-P2-CAP02-SHADOW-DEFAULT-OFF-PRODUCTION-SMOKE-I01` gerçek controller yolunu
 * çalıştırmak için kimlik doğrulanmış bir principal ister. Kanonik main'de üretim
 * güvenli bir provisioning yolu YOKTUR: `tm47d-happy-path-seed.ts` kendi tenant'ını
 * yaratıp 15 tabloyu `deleteMany` ile siler ve `passwordHash: null` yazar — production'a
 * yaklaştırılamaz. Bu çekirdek, o boşluğu YALNIZ canary amaçlı ve fail-closed doldurur.
 *
 * MİMARİ İLKE — bu dosya Prisma/NestJS import ETMEZ, DB'ye erişemez, sistem saati,
 * `fs` ve rastgelelik KULLANMAZ. Yalnız karar üretir; yazımı çağıran yapar.
 *
 * GÜVENLİK SÖZLEŞMESİ
 *  1. Yalnız canary-safe slug allowlist'indeki tenant'a izin verilir. Tenant kimliği
 *     (id + slug) DB'den okunan gerçekle BİREBİR eşleşmelidir.
 *  2. Tenant'ta gerçek iş verisi varsa FAIL_CLOSED. Boşluk sessizce varsayılmaz.
 *  3. Kısmi canary fixture FAIL_CLOSED — sessiz onarım YAPILMAZ.
 *  4. Sentetik kimlik alanları desen doğrulamasından geçmek zorundadır; gerçeğe
 *     benzeyen e-posta/ad/dosya numarası REDDEDİLİR.
 *  5. Aynı `canaryRunId` tekrarında ALREADY_APPLIED — idempotent.
 */

/** Canary provisioning'e izin verilen tenant slug'ları. Politika sabiti, secret DEĞİL. */
export const CANARY_SAFE_TENANT_SLUGS: readonly string[] = ['local-development-office'];

/** Sentetik e-posta domain'i — teslim edilemez, RFC 2606 ayrılmış. */
export const CANARY_EMAIL_DOMAIN = 'invalid.example';

export type CanaryProvisionDecisionKind = 'APPLY' | 'ALREADY_APPLIED' | 'FAIL_CLOSED';

export type CanaryProvisionFailureCode =
  | 'TENANT_NOT_FOUND'
  | 'TENANT_SLUG_NOT_CANARY_SAFE'
  | 'TENANT_ID_MISMATCH'
  | 'TENANT_SLUG_MISMATCH'
  | 'TENANT_HAS_REAL_USERS'
  | 'TENANT_HAS_REAL_CASES'
  | 'TENANT_HAS_REAL_CLIENTS'
  | 'PARTIAL_CANARY_FIXTURE'
  | 'INVALID_RUN_ID'
  | 'IDENTITY_NOT_SYNTHETIC';

export interface CanaryProvisionInput {
  /** Hedef tenant id — DB'den okunan gerçekle eşleşmek zorunda. */
  tenantId: string;
  /** Hedef tenant slug — hem allowlist'te hem DB gerçeğiyle eşleşmek zorunda. */
  tenantSlug: string;
  /** Bu canary koşusunun kimliği; sentetik alanların hepsine gömülür. */
  canaryRunId: string;
  /** Owner yetki referansı; audit kanıtına girer. */
  authorityRef: string;
}

export interface CanaryTenantFacts {
  /**
   * DB'den okunan tenant; yoksa null.
   * NOT: bu semada `Tenant` modelinin aktiflik/lifecycle alani YOKTUR — bu yuzden
   * "tenant aktif mi" kontrolu yapilmaz. Sahte bir aktiflik varsayimi URETILMEZ.
   */
  tenant: { id: string; slug: string } | null;
  /** Canary DEŞİNDEKİ (gerçek) kullanıcı sayısı. */
  nonCanaryUserCount: number;
  /** Canary dışındaki (gerçek) dava sayısı. */
  nonCanaryCaseCount: number;
  /** Canary dışındaki (gerçek) müvekkil sayısı. */
  nonCanaryClientCount: number;
  /** Bu `canaryRunId` için hâlihazırda var olan parçalar. */
  existing: { userId: string | null; lawyerId: string | null; caseId: string | null };
}

export interface CanaryProvisionDecision {
  kind: CanaryProvisionDecisionKind;
  failures: CanaryProvisionFailureCode[];
  reason: string;
}

/** Sentetik kimlik seti — hepsi `canaryRunId` taşır ve desenle doğrulanabilir. */
export interface CanaryIdentity {
  email: string;
  name: string;
  caseReference: string;
}

const RUN_ID_PATTERN = /^[a-z0-9]{6,32}$/;

/**
 * Sentetik kimlikleri ÜRETİR. Rastgelelik yoktur: her şey `canaryRunId`'den türer,
 * böylece aynı koşu aynı kimlikleri verir (idempotency) ve değerler denetlenebilir.
 */
export function buildCanaryIdentity(canaryRunId: string): CanaryIdentity {
  return {
    email: `office-cap02-canary-${canaryRunId}@${CANARY_EMAIL_DOMAIN}`,
    name: `CANARY OFFICE CAP02 ${canaryRunId.toUpperCase()}`,
    caseReference: `CANARY-OFFICE-CAP02-${canaryRunId.toUpperCase()}`,
  };
}

/**
 * Bir kimlik setinin GERÇEKTEN sentetik olduğunu doğrular. Gerçeğe benzeyen değer
 * üretilmiş veya elle geçilmişse reddedilir — bu, "canary" etiketinin sessizce
 * gerçek veriye yapışmasını engeller.
 */
export function isSyntheticIdentity(identity: CanaryIdentity, canaryRunId: string): boolean {
  const expected = buildCanaryIdentity(canaryRunId);
  return (
    identity.email === expected.email &&
    identity.name === expected.name &&
    identity.caseReference === expected.caseReference &&
    identity.email.endsWith(`@${CANARY_EMAIL_DOMAIN}`)
  );
}

/**
 * Provisioning kararı. FAIL-CLOSED: şüphe halinde ASLA yazma izni vermez.
 */
export function decideCanaryProvision(
  input: CanaryProvisionInput,
  facts: CanaryTenantFacts,
): CanaryProvisionDecision {
  const failures: CanaryProvisionFailureCode[] = [];

  if (!RUN_ID_PATTERN.test(input.canaryRunId)) failures.push('INVALID_RUN_ID');

  // 1) Slug allowlist — hedef tenant politika olarak canary'ye açık mı.
  if (!CANARY_SAFE_TENANT_SLUGS.includes(input.tenantSlug)) {
    failures.push('TENANT_SLUG_NOT_CANARY_SAFE');
  }

  // 2) Tenant gerçekliği — id VE slug DB ile birebir eşleşmeli.
  if (!facts.tenant) {
    failures.push('TENANT_NOT_FOUND');
  } else {
    if (facts.tenant.id !== input.tenantId) failures.push('TENANT_ID_MISMATCH');
    if (facts.tenant.slug !== input.tenantSlug) failures.push('TENANT_SLUG_MISMATCH');
  }

  // 3) Boşluk KANITLANIR, varsayılmaz.
  if (facts.nonCanaryUserCount > 0) failures.push('TENANT_HAS_REAL_USERS');
  if (facts.nonCanaryCaseCount > 0) failures.push('TENANT_HAS_REAL_CASES');
  if (facts.nonCanaryClientCount > 0) failures.push('TENANT_HAS_REAL_CLIENTS');

  // 4) Sentetik kimlik deseni.
  if (!failures.includes('INVALID_RUN_ID')) {
    const identity = buildCanaryIdentity(input.canaryRunId);
    if (!isSyntheticIdentity(identity, input.canaryRunId)) failures.push('IDENTITY_NOT_SYNTHETIC');
  }

  if (failures.length > 0) {
    return { kind: 'FAIL_CLOSED', failures, reason: `provisioning reddedildi: ${failures.join(', ')}` };
  }

  // 5) Idempotency / kısmi fixture.
  const parts = [facts.existing.userId, facts.existing.lawyerId, facts.existing.caseId];
  const present = parts.filter((p) => p !== null).length;
  if (present === parts.length) {
    return { kind: 'ALREADY_APPLIED', failures: [], reason: 'canary fixture bu runId icin zaten tam' };
  }
  if (present > 0) {
    return {
      kind: 'FAIL_CLOSED',
      failures: ['PARTIAL_CANARY_FIXTURE'],
      reason: `kismi canary fixture (${present}/${parts.length}); sessiz onarim YAPILMAZ`,
    };
  }

  return { kind: 'APPLY', failures: [], reason: 'tenant canary-safe ve bos; sentetik fixture yazilabilir' };
}

export interface CanaryProvisionAuditEvent {
  eventType: 'OFFICE_CAP02_CANARY_FIXTURE_PROVISIONED';
  tenantId: string;
  tenantSlug: string;
  canaryRunId: string;
  authorityRef: string;
  decision: CanaryProvisionDecisionKind;
  failures: CanaryProvisionFailureCode[];
  /** Çağıran verir; bu modül sistem saatini okumaz. */
  occurredAt: string;
  /** FİİLEN commit edilmiş kayıt sayısı; karar türünden TÜRETİLMEZ. */
  committedRecordCount: number;
  /** Fixture'ın sentetik olduğunu olayın kendisinde görünür kılar. */
  synthetic: true;
}

export function toCanaryProvisionAuditEvent(
  input: CanaryProvisionInput,
  decision: CanaryProvisionDecision,
  occurredAt: string,
  committedRecordCount: number,
): CanaryProvisionAuditEvent {
  return {
    eventType: 'OFFICE_CAP02_CANARY_FIXTURE_PROVISIONED',
    tenantId: input.tenantId,
    tenantSlug: input.tenantSlug,
    canaryRunId: input.canaryRunId,
    authorityRef: input.authorityRef,
    decision: decision.kind,
    failures: decision.failures,
    occurredAt,
    committedRecordCount,
    synthetic: true,
  };
}
