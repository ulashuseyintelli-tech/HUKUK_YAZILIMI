/**
 * OFFICE-P2-CAP02-HIERARCHY-DIVERGENCE-EVIDENCE-R02 — SAF ÇEKİRDEK.
 *
 * R01-H, nötr telemetrinin canlıda çalıştığını YALNIZ tek bir kombinasyonla
 * (`MISSING_HIERARCHY` / `UNCOMPARABLE`) kanıtladı. Kalan dört telemetri kovası
 * canlı veride ölçülemiyor: TELLİ HUKUK'ta yalnız `TOP_LEVEL+SELF_AUTHORITY` ve
 * `MANAGED+REQUIRES_APPROVAL` (ikisi de SAME_CLASS) mevcut; `DIFFERENT_CLASS`
 * üreten iki kombinasyon üretim verisinde HİÇ YOK.
 *
 * OWNER KARARI (2026-07-30):
 *   KARAR 1 = 1A → sentetik ReportingLine graph'ı ile ölçüm (gerçek tenant mutasyonu 0)
 *   KARAR 2 = 2A → `ReportingLine` KALICI olarak organizational fact + neutral telemetry
 * Bu çekirdek, dört aktörlü sentetik fixture'ın YAZILABİLİR olup olmadığına karar
 * verir. Hiçbir authorization politikası ÜRETMEZ.
 *
 * NEDEN YENİ ÇEKİRDEK: `office-cap02-canary-provision.core.ts` tenant'ın TAMAMEN
 * boş olmasını şart koşar (`nonCanaryUserCount === 0`) ve TEK aktör üretir. R01-G/H
 * fixture'ı (pasif, kanıt zinciri korunuyor) tenant'ta durduğu ve bu görev DÖRT
 * aktör gerektirdiği için o çekirdek yapısal olarak kullanılamaz. Bu dosya o boşluğu
 * daha dar bir sözleşmeyle doldurur: "beklenen fixture" = 4 yeni aktör + AÇIKÇA
 * beyan edilmiş legacy (pasif) satırlar; bunun DIŞINDA her kayıt FAIL_CLOSED.
 *
 * MİMARİ İLKE — Prisma/NestJS import ETMEZ, DB'ye erişmez, sistem saati/`fs`/
 * rastgelelik KULLANMAZ, parolayı HİÇ görmez.
 */

import { CANARY_SAFE_TENANT_SLUGS } from './office-cap02-canary-provision.core';

/** Dört aktörün sabit etiketleri. Sıra anlamlıdır: A kök amir, C/D onun altındadır. */
export const DIVERGENCE_ACTOR_KEYS = ['A', 'B', 'C', 'D'] as const;
export type DivergenceActorKey = (typeof DIVERGENCE_ACTOR_KEYS)[number];

/** Sentetik e-posta domain'i — teslim edilemez, RFC 2606 ayrılmış. */
export const DIVERGENCE_EMAIL_DOMAIN = 'invalid.example';

const RUN_ID_PATTERN = /^[a-z0-9]{6,32}$/;

/**
 * Aktör profilleri. `lawyerRank` ve `userRole` değerleri şemadaki GERÇEK enum
 * değerleridir (`LawyerRank`: PARTNER|MANAGER|AUTHORIZED|LAWYER|INTERN,
 * `UserRole`: ADMIN|USER|VIEWER — fresh schema'dan doğrulandı).
 *
 * `expectedIncumbent` bir POLİTİKA DEĞİLDİR: yürürlükteki
 * `OfficeApprovalShadowService.computeDecision()` davranışının BEKLENTİSİDİR
 * (PARTNER → ALLOW/SELF_AUTHORITY; diğer avukat → WOULD_REQUIRE_APPROVAL).
 * `expectedComparison` de politika değil, telemetri kovası beklentisidir.
 *
 * `userRole`: yalnız A ADMIN'dir; ReportingLine yüzeyi (`/reporting-lines/*`)
 * AdminGuard + servis içi `assertAdmin` ister. B/C/D bilinçli olarak USER'dır —
 * böylece admin yetkisi telemetri sonucuna karışmaz.
 */
export interface DivergenceActorProfile {
  key: DivergenceActorKey;
  userRole: 'ADMIN' | 'USER';
  lawyerRank: 'PARTNER' | 'AUTHORIZED';
  disposition: 'TOP_LEVEL' | 'MANAGED';
  /** MANAGED ise amir aktörün anahtarı; TOP_LEVEL ise null. */
  managerKey: DivergenceActorKey | null;
  expectedIncumbent: 'SELF_AUTHORITY' | 'REQUIRES_APPROVAL';
  expectedComparison: 'SAME_CLASS' | 'DIFFERENT_CLASS';
}

export const DIVERGENCE_ACTOR_MATRIX: readonly DivergenceActorProfile[] = [
  {
    key: 'A',
    userRole: 'ADMIN',
    lawyerRank: 'PARTNER',
    disposition: 'TOP_LEVEL',
    managerKey: null,
    expectedIncumbent: 'SELF_AUTHORITY',
    expectedComparison: 'SAME_CLASS',
  },
  {
    key: 'B',
    userRole: 'USER',
    lawyerRank: 'AUTHORIZED',
    disposition: 'TOP_LEVEL',
    managerKey: null,
    expectedIncumbent: 'REQUIRES_APPROVAL',
    expectedComparison: 'DIFFERENT_CLASS',
  },
  {
    key: 'C',
    userRole: 'USER',
    lawyerRank: 'PARTNER',
    disposition: 'MANAGED',
    managerKey: 'A',
    expectedIncumbent: 'SELF_AUTHORITY',
    expectedComparison: 'DIFFERENT_CLASS',
  },
  {
    key: 'D',
    userRole: 'USER',
    lawyerRank: 'AUTHORIZED',
    disposition: 'MANAGED',
    managerKey: 'A',
    expectedIncumbent: 'REQUIRES_APPROVAL',
    expectedComparison: 'SAME_CLASS',
  },
];

export interface DivergenceIdentity {
  key: DivergenceActorKey;
  email: string;
  lawyerName: string;
  caseReference: string;
}

/** Sentetik kimlikleri ÜRETİR. Rastgelelik yok: her şey `runId`+`key`'den türer. */
export function buildDivergenceIdentity(
  runId: string,
  key: DivergenceActorKey,
): DivergenceIdentity {
  const lower = key.toLowerCase();
  return {
    key,
    email: `office-cap02-divergence-${lower}-${runId}@${DIVERGENCE_EMAIL_DOMAIN}`,
    lawyerName: `CANARY OFFICE CAP02 DIVERGENCE ${key}`,
    caseReference: `CANARY-OFFICE-CAP02-DIVERGENCE-${key}-${runId.toUpperCase()}`,
  };
}

export function buildDivergenceIdentities(runId: string): DivergenceIdentity[] {
  return DIVERGENCE_ACTOR_KEYS.map((k) => buildDivergenceIdentity(runId, k));
}

export type DivergenceDecisionKind = 'APPLY' | 'ALREADY_APPLIED' | 'FAIL_CLOSED';

export type DivergenceFailureCode =
  | 'INVALID_RUN_ID'
  | 'TENANT_NOT_FOUND'
  | 'TENANT_SLUG_NOT_CANARY_SAFE'
  | 'TENANT_ID_MISMATCH'
  | 'TENANT_HAS_UNDECLARED_USERS'
  | 'TENANT_HAS_UNDECLARED_LAWYERS'
  | 'TENANT_HAS_UNDECLARED_CASES'
  | 'TENANT_HAS_CLIENTS'
  | 'TENANT_HAS_STAFF'
  | 'LEGACY_FIXTURE_STILL_ACTIVE'
  | 'PARTIAL_DIVERGENCE_FIXTURE'
  | 'ACTIVE_REPORTINGLINE_PRESENT';

export interface DivergenceFixtureFacts {
  tenant: { id: string; slug: string } | null;
  /**
   * Bu `runId` için hâlihazırda var olan parça sayısı (User+Lawyer+Case toplamı).
   * Tam fixture = 12 (4 aktör × 3 kayıt). 0 → yazılabilir, 12 → ALREADY_APPLIED,
   * arası → kısmi (sessiz onarım YAPILMAZ).
   */
  existingFixturePartCount: number;
  /**
   * Beklenen fixture DIŞINDA ve BEYAN EDİLEN legacy satırlar dışında kalan kayıtlar.
   * Sıfır olmak ZORUNDA — tenant izolasyonu varsayılmaz, kanıtlanır.
   */
  undeclaredUserCount: number;
  undeclaredLawyerCount: number;
  undeclaredCaseCount: number;
  /** Tenant'taki toplam Client / StaffMember — ikisi de 0 olmak zorunda. */
  clientCount: number;
  staffCount: number;
  /**
   * Beyan edilen legacy (R01-G/H) satırlarından hâlâ AKTİF olanların sayısı.
   * 0 olmak zorunda: geçmiş fixture pasif kalmalı, bu koşu onu diriltmez.
   */
  activeLegacyPrincipalCount: number;
  /** Tenant'taki AKTİF ReportingLine satırı (validUntil null). Temiz başlangıç şartı. */
  activeReportingLineCount: number;
}

export interface DivergenceDecision {
  kind: DivergenceDecisionKind;
  failures: DivergenceFailureCode[];
  reason: string;
}

/** Tam fixture: 4 aktör × (User + Lawyer + Case). */
export const DIVERGENCE_FIXTURE_PART_TOTAL = DIVERGENCE_ACTOR_KEYS.length * 3;

/**
 * Fixture yazım kararı. FAIL-CLOSED: şüphe halinde ASLA yazma izni vermez.
 */
export function decideDivergenceFixture(
  input: { tenantId: string; runId: string },
  facts: DivergenceFixtureFacts,
): DivergenceDecision {
  const failures: DivergenceFailureCode[] = [];

  if (!RUN_ID_PATTERN.test(input.runId)) failures.push('INVALID_RUN_ID');

  // 1) Tenant gerçekliği + canary-safe slug (slug DB'den gelir, iddia edilemez).
  if (!facts.tenant) {
    failures.push('TENANT_NOT_FOUND');
  } else {
    if (facts.tenant.id !== input.tenantId) failures.push('TENANT_ID_MISMATCH');
    if (!CANARY_SAFE_TENANT_SLUGS.includes(facts.tenant.slug)) {
      failures.push('TENANT_SLUG_NOT_CANARY_SAFE');
    }
  }

  // 2) İzolasyon KANITLANIR: beklenen fixture + beyan edilen legacy dışında hiçbir kayıt olamaz.
  if (facts.undeclaredUserCount > 0) failures.push('TENANT_HAS_UNDECLARED_USERS');
  if (facts.undeclaredLawyerCount > 0) failures.push('TENANT_HAS_UNDECLARED_LAWYERS');
  if (facts.undeclaredCaseCount > 0) failures.push('TENANT_HAS_UNDECLARED_CASES');
  if (facts.clientCount > 0) failures.push('TENANT_HAS_CLIENTS');
  if (facts.staffCount > 0) failures.push('TENANT_HAS_STAFF');

  // 3) Geçmiş fixture pasif kalmalı — bu koşu onu diriltmez.
  if (facts.activeLegacyPrincipalCount > 0) failures.push('LEGACY_FIXTURE_STILL_ACTIVE');

  // 4) Temiz graph başlangıcı: önceden aktif disposition varsa ölçüm kirlenir.
  if (facts.activeReportingLineCount > 0) failures.push('ACTIVE_REPORTINGLINE_PRESENT');

  if (failures.length > 0) {
    return { kind: 'FAIL_CLOSED', failures, reason: `fixture reddedildi: ${failures.join(', ')}` };
  }

  // 5) Idempotency / kısmi fixture.
  if (facts.existingFixturePartCount === DIVERGENCE_FIXTURE_PART_TOTAL) {
    return { kind: 'ALREADY_APPLIED', failures: [], reason: 'divergence fixture bu runId icin zaten tam' };
  }
  if (facts.existingFixturePartCount > 0) {
    return {
      kind: 'FAIL_CLOSED',
      failures: ['PARTIAL_DIVERGENCE_FIXTURE'],
      reason: `kismi fixture (${facts.existingFixturePartCount}/${DIVERGENCE_FIXTURE_PART_TOTAL}); sessiz onarim YAPILMAZ`,
    };
  }

  return {
    kind: 'APPLY',
    failures: [],
    reason: 'tenant canary-safe, beyan disi kayit yok, legacy pasif, aktif disposition yok',
  };
}

// ---------------------------------------------------------------------------
// GRAPH DOĞRULAMA — yazımdan SONRA bağımsız olarak sınanacak invariantlar
// ---------------------------------------------------------------------------

export type GraphFailureCode =
  | 'ACTIVE_ROW_COUNT_MISMATCH'
  | 'TOP_LEVEL_COUNT_MISMATCH'
  | 'MANAGED_COUNT_MISMATCH'
  | 'TOP_LEVEL_HAS_MANAGER'
  | 'MANAGED_MISSING_MANAGER'
  | 'SELF_MANAGER'
  | 'DUPLICATE_ACTOR'
  | 'CROSS_TENANT_ROW'
  | 'CYCLE_DETECTED'
  | 'UNEXPECTED_ACTOR';

export interface GraphRow {
  tenantId: string;
  actorUserId: string;
  managerUserId: string | null;
  disposition: 'TOP_LEVEL' | 'MANAGED';
}

/**
 * Yazılan graph'ın beklenen şekle UYDUĞUNU bağımsız olarak doğrular.
 * Beklenen: 2 TOP_LEVEL (manager null) + 2 MANAGED (manager = A). Döngü yok.
 */
export function validateDivergenceGraph(
  tenantId: string,
  expectedActorUserIds: readonly string[],
  rows: readonly GraphRow[],
): { ok: boolean; failures: GraphFailureCode[] } {
  const failures: GraphFailureCode[] = [];

  if (rows.length !== DIVERGENCE_ACTOR_KEYS.length) failures.push('ACTIVE_ROW_COUNT_MISMATCH');

  const topLevel = rows.filter((r) => r.disposition === 'TOP_LEVEL');
  const managed = rows.filter((r) => r.disposition === 'MANAGED');
  if (topLevel.length !== 2) failures.push('TOP_LEVEL_COUNT_MISMATCH');
  if (managed.length !== 2) failures.push('MANAGED_COUNT_MISMATCH');

  if (topLevel.some((r) => r.managerUserId !== null)) failures.push('TOP_LEVEL_HAS_MANAGER');
  if (managed.some((r) => r.managerUserId === null)) failures.push('MANAGED_MISSING_MANAGER');
  if (rows.some((r) => r.managerUserId !== null && r.managerUserId === r.actorUserId)) {
    failures.push('SELF_MANAGER');
  }
  if (rows.some((r) => r.tenantId !== tenantId)) failures.push('CROSS_TENANT_ROW');

  const actorIds = rows.map((r) => r.actorUserId);
  if (new Set(actorIds).size !== actorIds.length) failures.push('DUPLICATE_ACTOR');
  if (actorIds.some((id) => !expectedActorUserIds.includes(id))) failures.push('UNEXPECTED_ACTOR');

  // Döngü: her aktörden amir zinciri yukarı yürünür; kendine dönerse döngü.
  const managerOf = new Map(rows.map((r) => [r.actorUserId, r.managerUserId]));
  for (const start of actorIds) {
    let current = managerOf.get(start) ?? null;
    const seen = new Set<string>([start]);
    let depth = 0;
    while (current && depth < DIVERGENCE_ACTOR_KEYS.length + 2) {
      if (seen.has(current)) {
        failures.push('CYCLE_DETECTED');
        break;
      }
      seen.add(current);
      current = managerOf.get(current) ?? null;
      depth++;
    }
  }

  const unique = Array.from(new Set(failures));
  return { ok: unique.length === 0, failures: unique };
}

// ---------------------------------------------------------------------------
// AUDIT KANITI
// ---------------------------------------------------------------------------

export interface DivergenceFixtureAuditEvent {
  eventType: 'OFFICE_CAP02_DIVERGENCE_FIXTURE_PROVISIONED';
  tenantId: string;
  runId: string;
  authorityRef: string;
  decision: DivergenceDecisionKind;
  failures: DivergenceFailureCode[];
  /** Çağıran verir; bu modül sistem saatini okumaz. */
  occurredAt: string;
  /** FİİLEN commit edilmiş kayıt sayısı; karar türünden TÜRETİLMEZ. */
  committedRecordCount: number;
  actorKeys: string[];
  synthetic: true;
}

export function toDivergenceFixtureAuditEvent(
  input: { tenantId: string; runId: string; authorityRef: string },
  decision: DivergenceDecision,
  occurredAt: string,
  committedRecordCount: number,
): DivergenceFixtureAuditEvent {
  return {
    eventType: 'OFFICE_CAP02_DIVERGENCE_FIXTURE_PROVISIONED',
    tenantId: input.tenantId,
    runId: input.runId,
    authorityRef: input.authorityRef,
    decision: decision.kind,
    failures: decision.failures,
    occurredAt,
    committedRecordCount,
    actorKeys: [...DIVERGENCE_ACTOR_KEYS],
    synthetic: true,
  };
}
