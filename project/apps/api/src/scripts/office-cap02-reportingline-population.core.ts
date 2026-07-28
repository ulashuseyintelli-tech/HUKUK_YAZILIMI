/**
 * OFFICE-P2-CAP02 REPORTINGLINE POPULATION — SAF ÇEKİRDEK.
 *
 * İki owner görevinin tooling katmanı tek modülde:
 *   STEP 7  OFFICE-P2-CAP02-REPORTINGLINE-POPULATION-INPUT-PACK-R01
 *           `buildPopulationInputPack()` — authorizable personel evreninden input paketi üretir.
 *   STEP 8  OFFICE-P2-CAP02-REPORTINGLINE-POPULATION-DRY-RUN-R01
 *           `dryRunPopulation()` — paketi hiçbir şey yazmadan graph seviyesinde doğrular.
 *
 * MİMARİ İLKE — bu dosya Prisma/NestJS import ETMEZ, DB'ye erişemez; repository durumu
 * dışarıdan snapshot olarak geçilir. Sistem saati ve `fs` kullanılmaz. Mutation riski
 * yapısal olarak yoktur.
 *
 * KANONİK KURALLAR (decision-log 2026-07-28 / OFFICE-DELIVERY-MANIFEST §11):
 *   AUTHORIZABLE PERSONNEL  aktif Lawyer|StaffMember + aktif same-tenant User binding
 *                           + authorization-graph is gereksinimi
 *   MANAGED                 managerUserId ZORUNLU
 *   TOP_LEVEL               managerUserId NULL
 *   UNCLASSIFIED            persist EDİLMEZ — aktif kaydın YOKLUĞUNDAN türetilir
 *   NON_AUTHORIZABLE        input'a ALINMAZ, graph dışında ayrı listelenir
 *   manager                 kendisi de aktif same-tenant User olmak ZORUNDA
 */

// ---------------------------------------------------------------------------
// STEP 7 — Input pack
// ---------------------------------------------------------------------------

export type PersistedDisposition = 'MANAGED' | 'TOP_LEVEL';

export interface PopulationInputRecord {
  tenantSlug: string;
  actorUserId: string;
  disposition: PersistedDisposition;
  managerUserId: string | null;
  /** ISO-8601. Sistem saati kullanılmaz; çağıran açıkça verir. */
  validFrom: string;
  authorityRef: string;
  evidenceRef: string;
}

/** Owner mapping pack'inden gelen, henüz input'a dönüşmemiş kişi kaydı. */
export interface AuthorizablePersonnelCandidate {
  tenantSlug: string;
  actorUserId: string | null;
  /** Owner disposition'ı. UNCLASSIFIED/NON_AUTHORIZABLE input'a girmez. */
  disposition: PersistedDisposition | 'UNCLASSIFIED' | 'NON_AUTHORIZABLE';
  managerUserId: string | null;
  validFrom: string;
  authorityRef: string;
  evidenceRef: string;
}

export type ExclusionReason =
  | 'UNCLASSIFIED_NOT_PERSISTED'
  | 'NON_AUTHORIZABLE_NO_USER_BINDING'
  | 'MISSING_ACTOR_USER_ID'
  | 'MISSING_AUTHORITY_REF'
  | 'MISSING_EVIDENCE_REF'
  | 'MANAGED_WITHOUT_MANAGER'
  | 'TOP_LEVEL_WITH_MANAGER';

export interface InputPackBuildResult {
  records: PopulationInputRecord[];
  excluded: Array<{ candidate: AuthorizablePersonnelCandidate; reason: ExclusionReason }>;
  /** Hiçbir aday hatalı biçimde dışlanmadıysa true (yalnız kanonik dışlamalar var). */
  wellFormed: boolean;
}

const CANONICAL_EXCLUSIONS: ReadonlySet<ExclusionReason> = new Set([
  'UNCLASSIFIED_NOT_PERSISTED',
  'NON_AUTHORIZABLE_NO_USER_BINDING',
]);

export function buildPopulationInputPack(
  candidates: ReadonlyArray<AuthorizablePersonnelCandidate>,
): InputPackBuildResult {
  const records: PopulationInputRecord[] = [];
  const excluded: InputPackBuildResult['excluded'] = [];

  for (const c of candidates) {
    if (c.disposition === 'UNCLASSIFIED') {
      excluded.push({ candidate: c, reason: 'UNCLASSIFIED_NOT_PERSISTED' });
      continue;
    }
    if (c.disposition === 'NON_AUTHORIZABLE') {
      excluded.push({ candidate: c, reason: 'NON_AUTHORIZABLE_NO_USER_BINDING' });
      continue;
    }
    if (!c.actorUserId) {
      excluded.push({ candidate: c, reason: 'MISSING_ACTOR_USER_ID' });
      continue;
    }
    if (!c.authorityRef) {
      excluded.push({ candidate: c, reason: 'MISSING_AUTHORITY_REF' });
      continue;
    }
    if (!c.evidenceRef) {
      excluded.push({ candidate: c, reason: 'MISSING_EVIDENCE_REF' });
      continue;
    }
    if (c.disposition === 'MANAGED' && !c.managerUserId) {
      excluded.push({ candidate: c, reason: 'MANAGED_WITHOUT_MANAGER' });
      continue;
    }
    if (c.disposition === 'TOP_LEVEL' && c.managerUserId) {
      excluded.push({ candidate: c, reason: 'TOP_LEVEL_WITH_MANAGER' });
      continue;
    }

    records.push({
      tenantSlug: c.tenantSlug,
      actorUserId: c.actorUserId,
      disposition: c.disposition,
      managerUserId: c.disposition === 'TOP_LEVEL' ? null : c.managerUserId,
      validFrom: c.validFrom,
      authorityRef: c.authorityRef,
      evidenceRef: c.evidenceRef,
    });
  }

  return {
    records,
    excluded,
    wellFormed: excluded.every((e) => CANONICAL_EXCLUSIONS.has(e.reason)),
  };
}

// ---------------------------------------------------------------------------
// STEP 8 — Dry-run
// ---------------------------------------------------------------------------

export interface PopulationUserSnapshot {
  userId: string;
  tenantId: string;
  isActive: boolean;
}

/** Halihazırda AKTİF (validUntil = null) ReportingLine satırı. */
export interface ActiveReportingLineSnapshot {
  tenantId: string;
  actorUserId: string;
  managerUserId: string | null;
  disposition: PersistedDisposition;
}

export interface PopulationSnapshot {
  tenantIdBySlug: Record<string, string>;
  users: PopulationUserSnapshot[];
  activeLines: ActiveReportingLineSnapshot[];
}

export type PopulationFailureCode =
  | 'TENANT_UNKNOWN'
  | 'ACTOR_NOT_FOUND'
  | 'ACTOR_INACTIVE'
  | 'ACTOR_TENANT_MISMATCH'
  | 'MANAGER_NOT_FOUND'
  | 'MANAGER_INACTIVE'
  | 'MANAGER_TENANT_MISMATCH'
  | 'MANAGED_WITHOUT_MANAGER'
  | 'TOP_LEVEL_WITH_MANAGER'
  | 'SELF_MANAGER'
  | 'CYCLE'
  | 'DUPLICATE_ACTOR_IN_INPUT'
  | 'EXISTING_ACTIVE_LINE_CONFLICT'
  | 'INVALID_VALID_FROM'
  | 'MISSING_AUTHORITY_REF'
  | 'MISSING_EVIDENCE_REF';

export type PopulationVerdict = 'PASS' | 'FAIL' | 'NO_OP';

export interface PopulationRecordResult {
  actorUserId: string;
  disposition: PersistedDisposition;
  verdict: PopulationVerdict;
  failures: PopulationFailureCode[];
}

export interface PopulationDryRunReport {
  total: number;
  pass: number;
  fail: number;
  noOp: number;
  eligibleForOperate: boolean;
  records: PopulationRecordResult[];
}

const isIsoInstant = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value) &&
  !Number.isNaN(Date.parse(value));

/**
 * `actor -> manager` kenarlarında `start`'tan başlayarak döngü var mı.
 * Kenar kaynağı: girdi paketi (öncelikli) + mevcut aktif satırlar (girdide ezilmeyenler).
 */
function reachesSelf(start: string, edges: ReadonlyMap<string, string>): boolean {
  const seen = new Set<string>();
  let node = edges.get(start);
  while (node) {
    if (node === start) return true;
    if (seen.has(node)) return false; // bizi içermeyen ayrı bir döngü
    seen.add(node);
    node = edges.get(node);
  }
  return false;
}

export function dryRunPopulation(
  input: ReadonlyArray<PopulationInputRecord>,
  snapshot: PopulationSnapshot,
): PopulationDryRunReport {
  const userIndex = new Map(snapshot.users.map((u) => [u.userId, u]));
  const activeByActor = new Map(snapshot.activeLines.map((l) => [l.actorUserId, l]));

  const actorSeen = new Map<string, number>();
  for (const r of input) actorSeen.set(r.actorUserId, (actorSeen.get(r.actorUserId) ?? 0) + 1);

  // Birleşik manager grafiği: girdi mevcut satırı EZER.
  const edges = new Map<string, string>();
  for (const line of snapshot.activeLines) {
    if (line.managerUserId) edges.set(line.actorUserId, line.managerUserId);
  }
  for (const r of input) {
    if (r.managerUserId) edges.set(r.actorUserId, r.managerUserId);
    else edges.delete(r.actorUserId); // TOP_LEVEL zinciri koparır
  }

  const records: PopulationRecordResult[] = input.map((r) => {
    const failures: PopulationFailureCode[] = [];
    const tenantId = snapshot.tenantIdBySlug[r.tenantSlug];
    if (!tenantId) failures.push('TENANT_UNKNOWN');

    if (!r.authorityRef) failures.push('MISSING_AUTHORITY_REF');
    if (!r.evidenceRef) failures.push('MISSING_EVIDENCE_REF');
    if (!isIsoInstant(r.validFrom)) failures.push('INVALID_VALID_FROM');

    const actor = userIndex.get(r.actorUserId);
    if (!actor) failures.push('ACTOR_NOT_FOUND');
    else {
      if (!actor.isActive) failures.push('ACTOR_INACTIVE');
      if (tenantId && actor.tenantId !== tenantId) failures.push('ACTOR_TENANT_MISMATCH');
    }

    if (r.disposition === 'MANAGED' && !r.managerUserId) failures.push('MANAGED_WITHOUT_MANAGER');
    if (r.disposition === 'TOP_LEVEL' && r.managerUserId) failures.push('TOP_LEVEL_WITH_MANAGER');

    if (r.managerUserId) {
      if (r.managerUserId === r.actorUserId) failures.push('SELF_MANAGER');
      const manager = userIndex.get(r.managerUserId);
      if (!manager) failures.push('MANAGER_NOT_FOUND');
      else {
        if (!manager.isActive) failures.push('MANAGER_INACTIVE');
        if (tenantId && manager.tenantId !== tenantId) failures.push('MANAGER_TENANT_MISMATCH');
      }
      if (reachesSelf(r.actorUserId, edges)) failures.push('CYCLE');
    }

    if ((actorSeen.get(r.actorUserId) ?? 0) > 1) failures.push('DUPLICATE_ACTOR_IN_INPUT');

    // IDEMPOTENCY: birebir aynı aktif satır zaten varsa yazım gereksizdir (NO_OP).
    // Farklı bir aktif satır varsa çakışmadır: mevcut kayıt önce kapatılmalı.
    const existing = activeByActor.get(r.actorUserId);
    let identical = false;
    if (existing) {
      identical =
        existing.disposition === r.disposition &&
        (existing.managerUserId ?? null) === (r.managerUserId ?? null) &&
        (!tenantId || existing.tenantId === tenantId);
      if (!identical) failures.push('EXISTING_ACTIVE_LINE_CONFLICT');
    }

    const verdict: PopulationVerdict =
      failures.length > 0 ? 'FAIL' : identical ? 'NO_OP' : 'PASS';

    return { actorUserId: r.actorUserId, disposition: r.disposition, verdict, failures };
  });

  const pass = records.filter((r) => r.verdict === 'PASS').length;
  const fail = records.filter((r) => r.verdict === 'FAIL').length;
  const noOp = records.filter((r) => r.verdict === 'NO_OP').length;

  return { total: records.length, pass, fail, noOp, eligibleForOperate: fail === 0, records };
}
