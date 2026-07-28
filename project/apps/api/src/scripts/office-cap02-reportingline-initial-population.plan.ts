/**
 * OFFICE-P2-CAP02-REPORTINGLINE-INITIAL-POPULATION-I01 — SAF PLAN ÜRETİCİ.
 *
 * Owner'ın onayladığı ilk iki kişilik authorization graph'ını, `ReportingLineService`
 * çağrılarına dönüşecek deterministik bir plana çevirir. DB, NestJS ve sistem saati YOK.
 *
 * Owner-onaylı hedef graph (OFFICE-P2-CAP02-PERSONNEL-AND-SHADOW-FULL-ACTIVATION-OWNER-R01):
 *   Partner User  -> TOP_LEVEL, manager NULL
 *   Ege User      -> MANAGED,   manager = Partner User
 *
 * Sıra ÖNEMLİDİR: manager'ın kendi kaydı önce yazılır. Böylece MANAGED satırı
 * yazılırken amirin hiyerarşideki yeri zaten tanımlıdır.
 */

import type { PopulationInputRecord } from './office-cap02-reportingline-population.core';

export interface InitialPopulationConfig {
  tenantSlug: string;
  partnerUserId: string;
  managedUserId: string;
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

  const steps: PopulationStep[] = [
    { kind: 'MARK_TOP_LEVEL', actorUserId: partnerUserId, managerUserId: null },
    { kind: 'ASSIGN_MANAGER', actorUserId: managedUserId, managerUserId: partnerUserId },
  ];

  const base = {
    tenantSlug: config.tenantSlug,
    validFrom: config.validFrom,
    authorityRef: config.authorityRef,
    evidenceRef: config.evidenceRef,
  };

  const records: PopulationInputRecord[] = [
    { ...base, actorUserId: partnerUserId, disposition: 'TOP_LEVEL', managerUserId: null },
    { ...base, actorUserId: managedUserId, disposition: 'MANAGED', managerUserId: partnerUserId },
  ];

  return { steps, records };
}
