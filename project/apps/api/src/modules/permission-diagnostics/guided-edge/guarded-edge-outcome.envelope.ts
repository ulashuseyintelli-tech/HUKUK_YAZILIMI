// P3-1b — Guarded-Edge Outcome Envelope (backend-only tip + builder; SAF).
//
// Bu, mevcut `GuidedOpenDecision` (AXIS-P / Guided-Open) vocabulary'sinin HTTP PROJEKSİYONUDUR.
// YENİ bir permission modeli DEĞİLDİR. P3-0/P3-1a kararı: vocab zaten kodda (GuidedOpenDecision);
// eksik olan yalnız HTTP zarfı + confirm-token. Bu dosya zarfı sağlar.
//
// KESİN AYRIM: Geçerlilik (AXIS-V / CPE / hukuki-validity) reddi BU ZARFLA MODELLENMEZ.
//   - axis daima 'GUIDED_OPEN_PERMISSION'.
//   - 'VALIDITY' ekseni İLERİSİ İÇİN REZERVE; bu builder ASLA üretmez.
//   - CpeRequiredGuard/PolicyDecision'a DOKUNULMAZ.
//
// Hiçbir controller henüz bunu döndürmez (substrate-only). Enforcement YOK.

import { ActionCode } from '../../policy-engine/types/action-code.enum';
import {
  DecisionSource,
  GuidedOpenDecision,
} from '../../policy-engine/types/effective-permission.types';

/** Zarf ekseni. Bu fazda yalnız Guided-Open; VALIDITY gelecek projeksiyon için rezerve. */
export type OutcomeAxis = 'GUIDED_OPEN_PERMISSION' | 'VALIDITY';

/** Hedef kaynak referansı (caseId path'te olmayabilir; ör. caseDebtorId → resourceId). */
export interface GuardedEdgeTarget {
  resourceType: string;
  caseId?: string;
  resourceId?: string;
}

/** Confirm/approval/hardware akışında istemciye dönen onay bloğu. Ham request body İÇERMEZ. */
export interface GuardedEdgeConfirmation {
  token: string;
  expiresAt: string;
  bindingHash: string;
}

/** Guarded-Edge outcome zarfı (GuidedOpenDecision'ın HTTP projeksiyonu). */
export interface GuardedEdgeOutcomeEnvelope {
  axis: 'GUIDED_OPEN_PERMISSION';
  outcome: GuidedOpenDecision;
  actionCode: ActionCode;
  target: GuardedEdgeTarget;
  decisionSource?: DecisionSource;
  reasonCode?: string;
  message?: string;
  traceId?: string;
  decisionId?: string;
  auditRef?: string;
  confirmation?: GuardedEdgeConfirmation;
}

export interface BuildGuardedEdgeOutcomeInput {
  outcome: GuidedOpenDecision;
  actionCode: ActionCode;
  target: GuardedEdgeTarget;
  decisionSource?: DecisionSource;
  reasonCode?: string;
  message?: string;
  traceId?: string;
  decisionId?: string;
  auditRef?: string;
  confirmation?: GuardedEdgeConfirmation;
}

/** GuidedOpenDecision'ın geçerli değer kümesi (runtime guard için). */
const GUIDED_OPEN_OUTCOMES: ReadonlySet<string> = new Set<string>(
  Object.values(GuidedOpenDecision),
);

/**
 * Guarded-Edge outcome zarfı kurar. `axis` HER ZAMAN 'GUIDED_OPEN_PERMISSION'.
 *
 * GUARD: AXIS-V (CPE/hukuki-validity) sonuçları Guided-Open permission olarak PROJEKTE EDİLEMEZ.
 * Tip düzeyinde `outcome: GuidedOpenDecision` zorunlu; runtime'da da bir CPE DecisionCode (ör.
 * 'GATE_BLOCKED') kaçak olarak geçirilirse THROW eder → eksen karışması imkânsız.
 *
 * Çağrıldığı yerler:
 *  - (henüz YOK) — substrate-only; gelecekte guarded-edge route'ları enforce'a geçtiğinde.
 */
export function buildGuardedEdgeOutcome(
  input: BuildGuardedEdgeOutcomeInput,
): GuardedEdgeOutcomeEnvelope {
  if (!GUIDED_OPEN_OUTCOMES.has(input.outcome as unknown as string)) {
    throw new Error(
      `buildGuardedEdgeOutcome: '${String(input.outcome)}' bir GuidedOpenDecision değil; ` +
        `geçerlilik/CPE sonuçları 'GUIDED_OPEN_PERMISSION' eksenine projekte edilemez.`,
    );
  }

  const target: GuardedEdgeTarget = {
    resourceType: input.target.resourceType,
    ...(input.target.caseId !== undefined ? { caseId: input.target.caseId } : {}),
    ...(input.target.resourceId !== undefined ? { resourceId: input.target.resourceId } : {}),
  };

  return {
    axis: 'GUIDED_OPEN_PERMISSION',
    outcome: input.outcome,
    actionCode: input.actionCode,
    target,
    ...(input.decisionSource !== undefined ? { decisionSource: input.decisionSource } : {}),
    ...(input.reasonCode !== undefined ? { reasonCode: input.reasonCode } : {}),
    ...(input.message !== undefined ? { message: input.message } : {}),
    ...(input.traceId !== undefined ? { traceId: input.traceId } : {}),
    ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
    ...(input.auditRef !== undefined ? { auditRef: input.auditRef } : {}),
    ...(input.confirmation !== undefined ? { confirmation: input.confirmation } : {}),
  };
}
