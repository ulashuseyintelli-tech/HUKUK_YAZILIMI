/**
 * OFFICE-P2-CAP02-REPORTINGLINE-INITIAL-POPULATION-I01 — SAF PLAN ÜRETİCİ.
 *
 * Owner'ın onayladığı organizasyonel ReportingLine graph'ını, `ReportingLineService`
 * çağrılarına dönüşecek deterministik bir plana çevirir. DB, NestJS ve sistem saati YOK.
 * ReportingLine yetkilendirme, permission, policy veya final onay hakkı üretmez.
 *
 * Owner-onaylı hedef graph (OFFICE-P2-CAP02-PERSONNEL-AND-SHADOW-FULL-ACTIVATION-OWNER-R01):
 *   Partner User  -> TOP_LEVEL, manager NULL
 *   Ege User      -> MANAGED,   manager = Partner User
 *
 * Sıra ÖNEMLİDİR: manager'ın kendi kaydı önce yazılır. Böylece MANAGED satırı
 * yazılırken amirin hiyerarşideki yeri zaten tanımlıdır.
 */

import type {
  PopulationDiffReport,
  PopulationInputRecord,
} from './office-cap02-reportingline-population.core';

export interface InitialPopulationConfig {
  tenantSlug: string;
  partnerUserId: string;
  managedUserId: string;
  /** ISO-8601; çağıran verir, bu modül sistem saatini okumaz. */
  validFrom: string;
  authorityRef: string;
  evidenceRef: string;
}

export interface PopulationActorDecision {
  actorUserId: string;
  disposition: 'MANAGED' | 'TOP_LEVEL';
  managerUserId: string | null;
}

export interface PopulationGraphConfig {
  tenantSlug: string;
  actors: PopulationActorDecision[];
  /** ISO-8601; çağıran verir, bu modül sistem saatini okumaz. */
  validFrom: string;
  authorityRef: string;
  evidenceRef: string;
}

export type PopulationStepKind = 'MARK_TOP_LEVEL' | 'ASSIGN_MANAGER';

export interface PopulationStep {
  kind: PopulationStepKind;
  actorUserId: string;
  /** MARK_TOP_LEVEL adımında daima null. */
  managerUserId: string | null;
}

export interface InitialPopulationPlan {
  /** `ReportingLineService` çağrı sırası. */
  steps: PopulationStep[];
  /** Aynı planın dry-run doğrulaması için input-pack biçimi. */
  records: PopulationInputRecord[];
}

export class InitialPopulationPlanError extends Error {}

/**
 * Self-contained owner graph'ını manager-first sıraya koyar. Her MANAGED aktörün
 * manager'ı aynı pakette açıkça bulunmalıdır; repository verisinden hiyerarşi türetilmez.
 */
export function buildPopulationGraphPlan(
  config: PopulationGraphConfig,
): InitialPopulationPlan {
  if (!config.tenantSlug) {
    throw new InitialPopulationPlanError('POPULATION_PLAN_MISSING_TENANT_SLUG');
  }
  if (!config.authorityRef || !config.evidenceRef) {
    throw new InitialPopulationPlanError('POPULATION_PLAN_MISSING_AUTHORITY');
  }
  if (config.actors.length === 0) {
    throw new InitialPopulationPlanError('POPULATION_PLAN_EMPTY_GRAPH');
  }

  const byActor = new Map<string, PopulationActorDecision>();
  for (const actor of config.actors) {
    if (!actor.actorUserId) {
      throw new InitialPopulationPlanError('POPULATION_PLAN_MISSING_USER_ID');
    }
    if (byActor.has(actor.actorUserId)) {
      throw new InitialPopulationPlanError('POPULATION_PLAN_DUPLICATE_ACTOR');
    }
    if (actor.disposition === 'TOP_LEVEL' && actor.managerUserId !== null) {
      throw new InitialPopulationPlanError('POPULATION_PLAN_TOP_LEVEL_WITH_MANAGER');
    }
    if (actor.disposition === 'MANAGED' && !actor.managerUserId) {
      throw new InitialPopulationPlanError('POPULATION_PLAN_MANAGED_WITHOUT_MANAGER');
    }
    if (actor.actorUserId === actor.managerUserId) {
      throw new InitialPopulationPlanError('POPULATION_PLAN_SELF_MANAGER');
    }
    byActor.set(actor.actorUserId, actor);
  }

  for (const actor of config.actors) {
    if (actor.managerUserId && !byActor.has(actor.managerUserId)) {
      throw new InitialPopulationPlanError('POPULATION_PLAN_MANAGER_NOT_IN_GRAPH');
    }
  }

  const ordered: PopulationActorDecision[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (actorUserId: string): void => {
    if (visited.has(actorUserId)) return;
    if (visiting.has(actorUserId)) {
      throw new InitialPopulationPlanError('POPULATION_PLAN_CYCLE');
    }
    visiting.add(actorUserId);
    const actor = byActor.get(actorUserId);
    if (!actor) {
      throw new InitialPopulationPlanError('POPULATION_PLAN_ACTOR_NOT_FOUND');
    }
    if (actor.managerUserId) visit(actor.managerUserId);
    visiting.delete(actorUserId);
    visited.add(actorUserId);
    ordered.push(actor);
  };
  for (const actor of config.actors) visit(actor.actorUserId);

  const steps: PopulationStep[] = ordered.map((actor) => ({
    kind: actor.disposition === 'TOP_LEVEL' ? 'MARK_TOP_LEVEL' : 'ASSIGN_MANAGER',
    actorUserId: actor.actorUserId,
    managerUserId: actor.managerUserId,
  }));
  const records: PopulationInputRecord[] = ordered.map((actor) => ({
    tenantSlug: config.tenantSlug,
    actorUserId: actor.actorUserId,
    disposition: actor.disposition,
    managerUserId: actor.managerUserId,
    validFrom: config.validFrom,
    authorityRef: config.authorityRef,
    evidenceRef: config.evidenceRef,
  }));

  return { steps, records };
}

export function buildInitialPopulationPlan(
  config: InitialPopulationConfig,
): InitialPopulationPlan {
  const { partnerUserId, managedUserId } = config;

  if (!partnerUserId || !managedUserId) {
    throw new InitialPopulationPlanError('POPULATION_PLAN_MISSING_USER_ID');
  }
  if (partnerUserId === managedUserId) {
    // Tek kisilik bir graph'ta MANAGED kurulamaz; self-manager yasaktir.
    throw new InitialPopulationPlanError('POPULATION_PLAN_SELF_MANAGER');
  }
  if (!config.authorityRef || !config.evidenceRef) {
    throw new InitialPopulationPlanError('POPULATION_PLAN_MISSING_AUTHORITY');
  }

  return buildPopulationGraphPlan({
    tenantSlug: config.tenantSlug,
    actors: [
      { actorUserId: partnerUserId, disposition: 'TOP_LEVEL', managerUserId: null },
      {
        actorUserId: managedUserId,
        disposition: 'MANAGED',
        managerUserId: partnerUserId,
      },
    ],
    validFrom: config.validFrom,
    authorityRef: config.authorityRef,
    evidenceRef: config.evidenceRef,
  });
}

/** Yalnız CREATE/REPLACE aktörleri seçer; NO_OP geçmişe anlamsız satır ekleyemez. */
export function selectPopulationStepsForOperate(
  plan: InitialPopulationPlan,
  diff: PopulationDiffReport,
): PopulationStep[] {
  const operationByActor = new Map(
    diff.records.map((record) => [record.actorUserId, record.operation]),
  );
  return plan.steps.filter((step) => {
    const operation = operationByActor.get(step.actorUserId);
    if (!operation) {
      throw new InitialPopulationPlanError('POPULATION_PLAN_DIFF_ACTOR_MISSING');
    }
    return operation === 'CREATE' || operation === 'REPLACE';
  });
}
