// P3-1b — Guarded-Edge Outcome Envelope testleri (SAF builder).
import {
  buildGuardedEdgeOutcome,
  GuardedEdgeOutcomeEnvelope,
} from '../guided-edge/guarded-edge-outcome.envelope';
import { ActionCode } from '../../policy-engine/types/action-code.enum';
import {
  DecisionSource,
  GuidedOpenDecision,
} from '../../policy-engine/types/effective-permission.types';

describe('GuardedEdgeOutcomeEnvelope builder (P3-1b substrate)', () => {
  it('[1] axis HER ZAMAN GUIDED_OPEN_PERMISSION', () => {
    for (const outcome of Object.values(GuidedOpenDecision)) {
      const env = buildGuardedEdgeOutcome({
        outcome,
        actionCode: ActionCode.CHANGE_STATUS,
        target: { resourceType: 'CASE', caseId: 'c1' },
      });
      expect(env.axis).toBe('GUIDED_OPEN_PERMISSION');
    }
  });

  it('[2] yalnız mevcut GuidedOpenDecision değerlerini kullanır (yeni vocab YOK)', () => {
    const env = buildGuardedEdgeOutcome({
      outcome: GuidedOpenDecision.CONFIRM_REQUIRED,
      actionCode: ActionCode.CHANGE_STATUS,
      target: { resourceType: 'CASE', caseId: 'c1' },
    });
    expect(Object.values(GuidedOpenDecision)).toContain(env.outcome);
  });

  it('[3] geçerlilik/CPE sonucu Guided-Open permission olarak MODELLENEMEZ (throw)', () => {
    // CPE DecisionCode (ör. GATE_BLOCKED) kaçak olarak geçirilirse builder reddeder.
    expect(() =>
      buildGuardedEdgeOutcome({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        outcome: 'GATE_BLOCKED' as any,
        actionCode: ActionCode.UYAP_SEND,
        target: { resourceType: 'CASE', caseId: 'c1' },
      }),
    ).toThrow(/GuidedOpenDecision değil|projekte edilemez/);
  });

  it('[3] zarf hiçbir zaman VALIDITY eksenini üretmez', () => {
    const env: GuardedEdgeOutcomeEnvelope = buildGuardedEdgeOutcome({
      outcome: GuidedOpenDecision.HARDWARE_REQUIRED,
      actionCode: ActionCode.UYAP_SEND,
      target: { resourceType: 'CASE', caseId: 'c1' },
      decisionSource: DecisionSource.HARDWARE,
    });
    expect((env.axis as string)).not.toBe('VALIDITY');
    expect(env.axis).toBe('GUIDED_OPEN_PERMISSION');
  });

  it('target alanlarını (resourceType/caseId/resourceId) ve opsiyonelleri yansıtır', () => {
    const env = buildGuardedEdgeOutcome({
      outcome: GuidedOpenDecision.CONFIRM_REQUIRED,
      actionCode: ActionCode.EDIT_PARTIES,
      target: { resourceType: 'CASE_DEBTOR', resourceId: 'cd1' },
      reasonCode: 'L2_SENSITIVE_NON_MEMBER',
      message: 'Onay gerekiyor.',
      traceId: 't_x',
      decisionId: 'd_x',
      auditRef: 'cf_1',
      confirmation: { token: 'go.confirm.v1.x.y', expiresAt: '2026-06-26T00:00:00Z', bindingHash: 'h' },
    });
    expect(env.target).toEqual({ resourceType: 'CASE_DEBTOR', resourceId: 'cd1' });
    expect(env.target).not.toHaveProperty('caseId'); // verilmeyen opsiyonel eklenmez
    expect(env.reasonCode).toBe('L2_SENSITIVE_NON_MEMBER');
    expect(env.confirmation?.token).toBe('go.confirm.v1.x.y');
    expect(env.auditRef).toBe('cf_1');
  });

  it('confirmation verilmezse zarf onu içermez (ALLOW happy-path)', () => {
    const env = buildGuardedEdgeOutcome({
      outcome: GuidedOpenDecision.ALLOW,
      actionCode: ActionCode.CHANGE_STATUS,
      target: { resourceType: 'CASE', caseId: 'c1' },
    });
    expect(env).not.toHaveProperty('confirmation');
    expect(env.outcome).toBe(GuidedOpenDecision.ALLOW);
  });
});
