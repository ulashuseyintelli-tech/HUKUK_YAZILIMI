/**
 * PR-EA-3A — EnforcementAction.tenantId/caseDebtorId backfill: SAF (DB'siz) sınıflandırıcı.
 * Tasarım: docs/design/enforcement-action-tenant-case-debtor-migration.md D3-D6 (Bölüm 8).
 *
 * Karar mantığı burada izole + saf tutulur (g6-backfill-classifier.ts deseni); profiler script'i
 * yalnız Prisma'yı bağlar, kararı bu modülden çağırır. Bu dosya hiçbir yazma yolu İÇERMEZ, hiçbir
 * IO/DB/sistem-saati erişimi yapmaz — yalnız girdi → karar dönüştürür.
 */

export type TenantBucket = "ALREADY_POPULATED" | "TENANT_DETERMINISTIC" | "INTEGRITY_FAILURE";

export type CaseDebtorBucket =
  | "ALREADY_POPULATED"
  | "CASE_DEBTOR_DETERMINISTIC"
  | "INFERABLE_SINGLE_ACTIVE"
  | "INFERABLE_SINGLE_PRIMARY"
  | "AMBIGUOUS"
  | "ORPHAN"
  | "INTEGRITY_FAILURE";

export type TargetDetailsObservation = "NULL" | "RECOGNIZED_DEBTOR_IDENTIFIER" | "UNRECOGNIZED_STRUCTURE";

export interface TenantDecision {
  bucket: TenantBucket;
  /** yalnız TENANT_DETERMINISTIC/ALREADY_POPULATED için dolu; diğerlerinde null */
  candidateTenantId: string | null;
  reason: string;
}

export interface CaseDebtorDecision {
  bucket: CaseDebtorBucket;
  /** ALREADY_POPULATED/CASE_DEBTOR_DETERMINISTIC/INFERABLE_* için dolu; AMBIGUOUS/ORPHAN/INTEGRITY_FAILURE'da null */
  candidateCaseDebtorId: string | null;
  reason: string;
}

export interface EnforcementActionClassification {
  tenant: TenantDecision;
  caseDebtor: CaseDebtorDecision;
}

export interface CaseDebtorLifecycleSignal {
  id: string;
  lifecycleStatus: "ACTIVE" | "PASSIVE";
  role: string;
}

export interface ClassifyEnforcementActionInput {
  caseId: string;
  tenantId: string | null;
  caseDebtorId: string | null;
  /** null = dangling caseId — FK Cascade altında yapısal olarak beklenmez, yalnız savunma amaçlı */
  parentCase: { id: string; tenantId: string } | null;
  /** Case'e ait TÜM CaseDebtor kayıtları (yalnız caseDebtorId boşken sınıflandırma sinyali olarak kullanılır) */
  caseDebtors: CaseDebtorLifecycleSignal[];
  /** caseDebtorId doluysa referans edilen kaydın kendisi; bulunamazsa null; caseDebtorId boşsa null (kullanılmaz) */
  referencedCaseDebtor: { id: string; caseId: string } | null;
}

const ASIL_BORCLU_ROLE = "ASIL_BORCLU";

function classifyTenant(input: ClassifyEnforcementActionInput): TenantDecision {
  if (!input.parentCase) {
    return {
      bucket: "INTEGRITY_FAILURE",
      candidateTenantId: null,
      reason: "caseId dangling (Case bulunamadı) — FK Cascade altında yapısal olarak beklenmez",
    };
  }
  if (input.tenantId !== null) {
    if (input.tenantId !== input.parentCase.tenantId) {
      return {
        bucket: "INTEGRITY_FAILURE",
        candidateTenantId: null,
        reason: "tenantId dolu ama Case.tenantId ile uyuşmuyor (tenant mismatch)",
      };
    }
    return {
      bucket: "ALREADY_POPULATED",
      candidateTenantId: input.tenantId,
      reason: "tenantId zaten dolu ve Case.tenantId ile tutarlı",
    };
  }
  return {
    bucket: "TENANT_DETERMINISTIC",
    candidateTenantId: input.parentCase.tenantId,
    reason: "Case.tenantId üzerinden %100 deterministik",
  };
}

function classifyCaseDebtor(input: ClassifyEnforcementActionInput): CaseDebtorDecision {
  if (input.caseDebtorId !== null) {
    if (!input.referencedCaseDebtor) {
      return {
        bucket: "INTEGRITY_FAILURE",
        candidateCaseDebtorId: null,
        reason: "caseDebtorId dolu ama referans edilen CaseDebtor kaydı bulunamadı",
      };
    }
    if (input.referencedCaseDebtor.caseId !== input.caseId) {
      return {
        bucket: "INTEGRITY_FAILURE",
        candidateCaseDebtorId: null,
        reason: "caseDebtorId dolu ama referans edilen CaseDebtor başka bir Case'e ait (cross-case)",
      };
    }
    return {
      bucket: "ALREADY_POPULATED",
      candidateCaseDebtorId: input.caseDebtorId,
      reason: "caseDebtorId zaten dolu ve aynı Case altında geçerli",
    };
  }

  const total = input.caseDebtors.length;
  if (total === 0) {
    return { bucket: "ORPHAN", candidateCaseDebtorId: null, reason: "Case'in hiç CaseDebtor kaydı yok" };
  }
  if (total === 1) {
    return {
      bucket: "CASE_DEBTOR_DETERMINISTIC",
      candidateCaseDebtorId: input.caseDebtors[0].id,
      reason: "Case üzerinde tam olarak 1 CaseDebtor — deterministik",
    };
  }

  const active = input.caseDebtors.filter((cd) => cd.lifecycleStatus === "ACTIVE");
  if (active.length === 1) {
    return {
      bucket: "INFERABLE_SINGLE_ACTIVE",
      candidateCaseDebtorId: active[0].id,
      reason: `${total} CaseDebtor arasında tek ACTIVE — INFERABLE (otomatik yazılmaz, owner-review kuyruğu)`,
    };
  }

  const primary = input.caseDebtors.filter((cd) => cd.role === ASIL_BORCLU_ROLE);
  if (primary.length === 1) {
    return {
      bucket: "INFERABLE_SINGLE_PRIMARY",
      candidateCaseDebtorId: primary[0].id,
      reason: `${total} CaseDebtor arasında tek ${ASIL_BORCLU_ROLE} — INFERABLE (otomatik yazılmaz, owner-review kuyruğu)`,
    };
  }

  return {
    bucket: "AMBIGUOUS",
    candidateCaseDebtorId: null,
    reason: `${total} CaseDebtor arasında tek bir makul aday yok — guess yasak, NULL kalır`,
  };
}

export function classifyEnforcementAction(input: ClassifyEnforcementActionInput): EnforcementActionClassification {
  return {
    tenant: classifyTenant(input),
    caseDebtor: classifyCaseDebtor(input),
  };
}

/**
 * targetDetails içeriğini yalnız GÖZLEMLER — hiçbir zaman tenant/caseDebtor sınıflandırmasını
 * etkilemez ve girdi olarak kullanılmaz (owner talimatı). "Tanınan" sayılması için açıkça
 * belgelenmiş bir debtorId/caseDebtorId alanı taşıması gerekir; bu bulgu dahi backfill kararını
 * DEĞİŞTİRMEZ, yalnız ayrı bir gözlem olarak raporlanır.
 */
export function observeTargetDetails(targetDetails: unknown): TargetDetailsObservation {
  if (targetDetails === null || targetDetails === undefined) return "NULL";
  if (typeof targetDetails !== "object" || Array.isArray(targetDetails)) return "UNRECOGNIZED_STRUCTURE";
  const record = targetDetails as Record<string, unknown>;
  if (typeof record.debtorId === "string" || typeof record.caseDebtorId === "string") {
    return "RECOGNIZED_DEBTOR_IDENTIFIER";
  }
  return "UNRECOGNIZED_STRUCTURE";
}
