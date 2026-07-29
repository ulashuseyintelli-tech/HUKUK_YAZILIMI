/**
 * OFFICE-P2-CAP02-CANARY-FIXTURE-REACTIVATION-I01 — SAF ÇEKİRDEK.
 *
 * R01-G canary fixture'ı (User+Lawyer+Case) kanıt zinciri korunarak soft-delete
 * edildi (`isActive=false`; satırlar SİLİNMEDİ). R01-H fazları aynı principal'ı
 * yeniden gerektiriyor; provisioning çekirdeği ise tasarım gereği bu satırları
 * "gerçek veri" sayıp FAIL_CLOSED üretiyor (boşluk sessizce varsayılmaz).
 *
 * OWNER KARARI (2026-07-29, OPTION A): eski satırlar SİLİNMEZ (audit zinciri
 * korunur), ad hoc `isActive=true` güncellemesi YAPILMAZ; yalnız TAM kimliği
 * doğrulanmış mevcut fixture'a izin veren bounded, idempotent, fail-closed bir
 * reactivation runner kullanılır. Bu çekirdek o kararın karar mantığıdır.
 *
 * MİMARİ İLKE — bu dosya Prisma/NestJS import ETMEZ, DB'ye erişemez, sistem
 * saati, `fs` ve rastgelelik KULLANMAZ. Parolayı HİÇBİR biçimde görmez: parola
 * üretimi/hash'i yalnız IO runner'ındadır ve bu modülün hiçbir tipinde parola
 * alanı yoktur.
 *
 * GÜVENLİK SÖZLEŞMESİ
 *  1. Yalnız canary-safe slug allowlist'indeki tenant; DB'den okunan gerçek
 *     slug esas alınır (girdide slug yoktur — slug iddia edilemez).
 *  2. User/Lawyer/Case üçlüsünün TAMAMI beklenen ID'lerle ve `canaryRunId`'den
 *     türeyen sentetik kimlikle BİREBİR eşleşmek zorundadır.
 *  3. Tenant'ta fixture DIŞINDA User/Lawyer/Case veya HERHANGİ bir Client varsa
 *     FAIL_CLOSED — boşluk kanıtlanır, varsayılmaz.
 *  4. Optimistic concurrency: mutasyon yoluna yalnız, preflight'ta okunan
 *     `updatedAt` değerleri mutasyon anındaki fresh okumayla birebir aynıysa
 *     girilir (stale → FAIL_CLOSED). ALREADY_APPLIED yolunda yazım olmadığı
 *     için staleness kapısı uygulanmaz (yalnız mutasyon yolunun kapısıdır).
 *  5. Kısmi aktiflik (User aktif ↔ Lawyer pasif veya tersi) FAIL_CLOSED —
 *     sessiz onarım YAPILMAZ.
 *  6. Mutasyon kapsamı SABİTTİR: yalnız User + Lawyer (aktivasyon + parola
 *     rotasyonu + token sürüm artışı). Case, ReportingLine, CaseStatusHistory,
 *     DecisionLog ve audit geçmişi DOKUNULMAZDIR; yeni satır YARATILMAZ.
 */

import { buildCanaryIdentity, CANARY_SAFE_TENANT_SLUGS } from './office-cap02-canary-provision.core';

/** Provisioning çekirdeğiyle aynı desen; runId sözleşmesi tek kaynaktan sapmaz. */
const RUN_ID_PATTERN = /^[a-z0-9]{6,32}$/;

/**
 * Mutasyon kapsamının yapısal beyanı: reactivation YALNIZ bu modelleri yazar.
 * `Case` bilinçli olarak LİSTEDE YOKTUR ve testler bunu sabitler.
 */
export const CANARY_REACTIVATION_MUTABLE_MODELS: readonly ['User', 'Lawyer'] = ['User', 'Lawyer'];

export type CanaryReactivationDecisionKind = 'REACTIVATE' | 'ALREADY_APPLIED' | 'FAIL_CLOSED';

export type CanaryReactivationFailureCode =
  | 'INVALID_RUN_ID'
  | 'TENANT_NOT_FOUND'
  | 'TENANT_SLUG_NOT_CANARY_SAFE'
  | 'TENANT_ID_MISMATCH'
  | 'USER_NOT_FOUND'
  | 'USER_TENANT_MISMATCH'
  | 'USER_IDENTITY_NOT_SYNTHETIC'
  | 'USER_STALE_UPDATED_AT'
  | 'LAWYER_NOT_FOUND'
  | 'LAWYER_TENANT_MISMATCH'
  | 'LAWYER_NOT_BOUND_TO_EXPECTED_USER'
  | 'LAWYER_IDENTITY_NOT_SYNTHETIC'
  | 'LAWYER_RANK_NOT_PARTNER'
  | 'LAWYER_STALE_UPDATED_AT'
  | 'CASE_NOT_FOUND'
  | 'CASE_TENANT_MISMATCH'
  | 'CASE_IDENTITY_NOT_SYNTHETIC'
  | 'TENANT_HAS_NON_FIXTURE_USERS'
  | 'TENANT_HAS_NON_FIXTURE_LAWYERS'
  | 'TENANT_HAS_NON_FIXTURE_CASES'
  | 'TENANT_HAS_CLIENTS'
  | 'PARTIAL_ACTIVE_STATE';

export interface CanaryReactivationInput {
  /** Hedef tenant id — DB gerçeğiyle birebir eşleşmek zorunda. */
  tenantId: string;
  /** Sentetik kimliklerin türediği koşu kimliği (ör. r01g01). */
  canaryRunId: string;
  /** Reaktive edilebilecek TEK User'ın id'si. */
  expectedUserId: string;
  /** Reaktive edilebilecek TEK Lawyer'ın id'si. */
  expectedLawyerId: string;
  /** Fixture'ın Case'i — DOĞRULANIR ama ASLA yazılmaz. */
  expectedCaseId: string;
  /** Preflight'ta okunan User.updatedAt (ISO 8601); mutasyon yolunun CAS kapısı. */
  expectedUserUpdatedAt: string;
  /** Preflight'ta okunan Lawyer.updatedAt (ISO 8601); mutasyon yolunun CAS kapısı. */
  expectedLawyerUpdatedAt: string;
  /** Owner yetki referansı; audit kanıtına girer. */
  authorityRef: string;
}

/** DB'den okunan taze gerçekler (snapshot; bu modül DB'ye erişmez). */
export interface CanaryReactivationFacts {
  tenant: { id: string; slug: string } | null;
  user: {
    id: string;
    tenantId: string;
    email: string;
    isActive: boolean;
    /** ISO 8601 — çağıran Date'i toISOString ile çevirir. */
    updatedAt: string;
  } | null;
  lawyer: {
    id: string;
    tenantId: string;
    name: string;
    userId: string | null;
    lawyerRank: string;
    isActive: boolean;
    updatedAt: string;
  } | null;
  legalCase: { id: string; tenantId: string; fileNumber: string } | null;
  /** expectedUserId DIŞINDAKİ tenant User sayısı — 0 olmak zorunda. */
  otherUserCount: number;
  /** expectedLawyerId DIŞINDAKİ tenant Lawyer sayısı — 0 olmak zorunda. */
  otherLawyerCount: number;
  /** expectedCaseId DIŞINDAKİ tenant Case sayısı — 0 olmak zorunda. */
  otherCaseCount: number;
  /** Tenant'taki toplam Client sayısı — 0 olmak zorunda. */
  clientCount: number;
}

export interface CanaryReactivationDecision {
  kind: CanaryReactivationDecisionKind;
  failures: CanaryReactivationFailureCode[];
  reason: string;
}

/**
 * Reaktivasyon kararı. FAIL-CLOSED: şüphe halinde ASLA yazma izni vermez.
 * Karar sırası: kimlik/boşluk kapıları → aktiflik çatalı → (yalnız mutasyon
 * yolunda) staleness kapısı.
 */
export function decideCanaryReactivation(
  input: CanaryReactivationInput,
  facts: CanaryReactivationFacts,
): CanaryReactivationDecision {
  const failures: CanaryReactivationFailureCode[] = [];

  if (!RUN_ID_PATTERN.test(input.canaryRunId)) failures.push('INVALID_RUN_ID');
  // Kimlik türetimi yalnız geçerli runId ile anlamlı; geçersizse alan
  // karşılaştırmaları yanlış pozitif üretmesin diye boş sentinel kullanılır.
  const identity = RUN_ID_PATTERN.test(input.canaryRunId)
    ? buildCanaryIdentity(input.canaryRunId)
    : { email: '', name: '', caseReference: '' };

  // 1) Tenant gerçekliği + slug allowlist (slug DB'den gelir, iddia edilemez).
  if (!facts.tenant) {
    failures.push('TENANT_NOT_FOUND');
  } else {
    if (facts.tenant.id !== input.tenantId) failures.push('TENANT_ID_MISMATCH');
    if (!CANARY_SAFE_TENANT_SLUGS.includes(facts.tenant.slug)) {
      failures.push('TENANT_SLUG_NOT_CANARY_SAFE');
    }
  }

  // 2) User — tam kimlik.
  if (!facts.user) {
    failures.push('USER_NOT_FOUND');
  } else {
    if (facts.user.tenantId !== input.tenantId) failures.push('USER_TENANT_MISMATCH');
    if (facts.user.id !== input.expectedUserId || facts.user.email !== identity.email) {
      failures.push('USER_IDENTITY_NOT_SYNTHETIC');
    }
  }

  // 3) Lawyer — tam kimlik + beklenen User'a bağlılık + PARTNER rütbesi.
  if (!facts.lawyer) {
    failures.push('LAWYER_NOT_FOUND');
  } else {
    if (facts.lawyer.tenantId !== input.tenantId) failures.push('LAWYER_TENANT_MISMATCH');
    if (facts.lawyer.userId !== input.expectedUserId) failures.push('LAWYER_NOT_BOUND_TO_EXPECTED_USER');
    if (facts.lawyer.id !== input.expectedLawyerId || facts.lawyer.name !== identity.name) {
      failures.push('LAWYER_IDENTITY_NOT_SYNTHETIC');
    }
    if (facts.lawyer.lawyerRank !== 'PARTNER') failures.push('LAWYER_RANK_NOT_PARTNER');
  }

  // 4) Case — DOĞRULANIR (kimlik + tenant) ama hiçbir dalda yazılmaz.
  if (!facts.legalCase) {
    failures.push('CASE_NOT_FOUND');
  } else {
    if (facts.legalCase.tenantId !== input.tenantId) failures.push('CASE_TENANT_MISMATCH');
    if (
      facts.legalCase.id !== input.expectedCaseId ||
      facts.legalCase.fileNumber !== identity.caseReference
    ) {
      failures.push('CASE_IDENTITY_NOT_SYNTHETIC');
    }
  }

  // 5) Boşluk KANITLANIR: fixture dışında hiçbir kayıt olamaz.
  if (facts.otherUserCount > 0) failures.push('TENANT_HAS_NON_FIXTURE_USERS');
  if (facts.otherLawyerCount > 0) failures.push('TENANT_HAS_NON_FIXTURE_LAWYERS');
  if (facts.otherCaseCount > 0) failures.push('TENANT_HAS_NON_FIXTURE_CASES');
  if (facts.clientCount > 0) failures.push('TENANT_HAS_CLIENTS');

  if (failures.length > 0) {
    return { kind: 'FAIL_CLOSED', failures, reason: `reaktivasyon reddedildi: ${failures.join(', ')}` };
  }

  const user = facts.user!;
  const lawyer = facts.lawyer!;

  // 6) Aktiflik çatalı. Her iki satır da aktifse yazılacak bir şey yoktur —
  //    idempotent no-op. (Parola BİLİNMEDİĞİ için çağıran login zincirine
  //    devam ETMEMELİDİR; bu sözleşme runner çıktısında da açıkça yazılır.)
  if (user.isActive && lawyer.isActive) {
    return { kind: 'ALREADY_APPLIED', failures: [], reason: 'fixture zaten aktif; yazim yapilmaz (mevcut parola bilinmez)' };
  }
  if (user.isActive !== lawyer.isActive) {
    return {
      kind: 'FAIL_CLOSED',
      failures: ['PARTIAL_ACTIVE_STATE'],
      reason: `kismi aktiflik (user=${user.isActive}, lawyer=${lawyer.isActive}); sessiz onarim YAPILMAZ`,
    };
  }

  // 7) Staleness — YALNIZ mutasyon yolunun kapısı (bkz. sözleşme §4).
  if (user.updatedAt !== input.expectedUserUpdatedAt) {
    return {
      kind: 'FAIL_CLOSED',
      failures: ['USER_STALE_UPDATED_AT'],
      reason: 'User.updatedAt preflight degerinden sapmis; es zamanli degisiklik riski',
    };
  }
  if (lawyer.updatedAt !== input.expectedLawyerUpdatedAt) {
    return {
      kind: 'FAIL_CLOSED',
      failures: ['LAWYER_STALE_UPDATED_AT'],
      reason: 'Lawyer.updatedAt preflight degerinden sapmis; es zamanli degisiklik riski',
    };
  }

  return {
    kind: 'REACTIVATE',
    failures: [],
    reason: 'fixture kimligi birebir dogrulandi, tenant bos, her iki satir pasif; yalniz User+Lawyer reaktive edilebilir',
  };
}

export interface CanaryReactivationAuditEvent {
  eventType: 'OFFICE_CAP02_CANARY_FIXTURE_REACTIVATED';
  tenantId: string;
  canaryRunId: string;
  expectedUserId: string;
  expectedLawyerId: string;
  /** Case yalnız kimlik kanıtı olarak geçer; mutatedModels'e ASLA girmez. */
  expectedCaseId: string;
  authorityRef: string;
  decision: CanaryReactivationDecisionKind;
  failures: CanaryReactivationFailureCode[];
  /** Çağıran verir; bu modül sistem saatini okumaz. */
  occurredAt: string;
  /** FİİLEN commit edilmiş satır sayısı; karar türünden TÜRETİLMEZ. */
  committedRecordCount: number;
  /** FİİLEN yazılan modeller (commit sayılarından türetilir); Case burada olamaz. */
  mutatedModels: string[];
  /** Parola rotasyonu fiilen commit edildi mi (User satırı yazıldıysa true). */
  passwordRotated: boolean;
  /** Eski token'ların ölü kalması için tokenVersion fiilen artırıldı mı. */
  tokenVersionBumped: boolean;
  synthetic: true;
}

/**
 * Audit kanıtı. `committed*` alanları transaction'ın GERÇEK sonuç sayılarından
 * türetilir — karar türünden değil. Parola/hash bu olayda TAŞINMAZ.
 */
export function toCanaryReactivationAuditEvent(
  input: CanaryReactivationInput,
  decision: CanaryReactivationDecision,
  occurredAt: string,
  committed: { userRows: number; lawyerRows: number },
): CanaryReactivationAuditEvent {
  const mutatedModels: string[] = [];
  if (committed.userRows > 0) mutatedModels.push('User');
  if (committed.lawyerRows > 0) mutatedModels.push('Lawyer');
  return {
    eventType: 'OFFICE_CAP02_CANARY_FIXTURE_REACTIVATED',
    tenantId: input.tenantId,
    canaryRunId: input.canaryRunId,
    expectedUserId: input.expectedUserId,
    expectedLawyerId: input.expectedLawyerId,
    expectedCaseId: input.expectedCaseId,
    authorityRef: input.authorityRef,
    decision: decision.kind,
    failures: decision.failures,
    occurredAt,
    committedRecordCount: committed.userRows + committed.lawyerRows,
    mutatedModels,
    passwordRotated: committed.userRows > 0,
    tokenVersionBumped: committed.userRows > 0,
    synthetic: true,
  };
}
