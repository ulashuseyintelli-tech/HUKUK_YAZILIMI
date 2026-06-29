import { CollectionDispositionLineType } from '@prisma/client';
import { FinanceApprovalIntentBuilder } from '../finance-approval-intent.builder';
import { FinanceRiskEngine } from '../finance-risk.engine';
import { FinanceRiskCollectionDispositionInput, FinanceRiskDecision, FinanceRiskReasonCode } from '../finance-risk.types';

const baseInput = (overrides: Partial<FinanceRiskCollectionDispositionInput> = {}): FinanceRiskCollectionDispositionInput => ({
  tenantId: 't1',
  dispositionId: 'd1',
  caseId: 'case1',
  collectionId: 'col1',
  status: 'HELD_PENDING_DISTRIBUTION',
  totalAmount: '100',
  currency: 'TRY',
  manualReversalRequiredAt: null,
  lines: [{ type: CollectionDispositionLineType.CLIENT_PAYABLE, amount: '100', caseClientId: 'cc1', note: null }],
  ...overrides,
});

describe('FinanceRiskEngine', () => {
  const engine = new FinanceRiskEngine();

  it('recommend normal dagitim icin ALLOW_DIRECT doner; domain invariantlarini bypass etmez', () => {
    const result = engine.evaluateCollectionDispositionRecommend(baseInput());
    expect(result.decision).toBe(FinanceRiskDecision.ALLOW_DIRECT);
    expect(result.canProceedDirectly).toBe(true);
    expect(result.canCreateOfficeApproval).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it('post normal dagitim icin REQUIRE_APPROVAL doner ve P4 davranisini korur', () => {
    const result = engine.evaluateCollectionDispositionPost(baseInput());
    expect(result.decision).toBe(FinanceRiskDecision.REQUIRE_APPROVAL);
    expect(result.canCreateOfficeApproval).toBe(true);
    expect(result.reasons).toEqual([expect.objectContaining({ code: FinanceRiskReasonCode.POLICY_REQUIRES_APPROVAL })]);
  });

  it('OTHER bucket REQUIRE_APPROVAL yerine MANUAL_REVIEW karari uretir', () => {
    const result = engine.evaluateCollectionDispositionPost(baseInput({
      lines: [
        { type: CollectionDispositionLineType.CLIENT_PAYABLE, amount: '75', caseClientId: 'cc1', note: null },
        { type: CollectionDispositionLineType.OTHER, amount: '25', caseClientId: null, note: 'manual' },
      ],
    }));
    expect(result.decision).toBe(FinanceRiskDecision.MANUAL_REVIEW);
    expect(result.requiresManualReview).toBe(true);
    expect(result.canCreateOfficeApproval).toBe(false);
    expect(result.reasons).toEqual([expect.objectContaining({ code: FinanceRiskReasonCode.OTHER_BUCKET_USED })]);
  });

  it('BLOCK priority MANUAL_REVIEW ve REQUIRE_APPROVAL ustunde kazanir', () => {
    const result = engine.evaluateCollectionDispositionPost(baseInput({
      totalAmount: '120',
      lines: [
        { type: CollectionDispositionLineType.CLIENT_PAYABLE, amount: '75', caseClientId: 'cc1', note: null },
        { type: CollectionDispositionLineType.OTHER, amount: '25', caseClientId: null, note: 'manual' },
      ],
    }));
    expect(result.decision).toBe(FinanceRiskDecision.BLOCK);
    expect(result.blocksMutation).toBe(true);
    expect(result.reasons.map((reason) => reason.code)).toEqual(expect.arrayContaining([
      FinanceRiskReasonCode.AMOUNT_MISMATCH,
      FinanceRiskReasonCode.OTHER_BUCKET_USED,
    ]));
  });

  it('manualReversalRequiredAt marker MANUAL_REVIEW sebebi uretir', () => {
    const result = engine.evaluateCollectionDispositionPost(baseInput({ manualReversalRequiredAt: new Date('2026-06-27T00:00:00.000Z') }));
    expect(result.decision).toBe(FinanceRiskDecision.MANUAL_REVIEW);
    expect(result.reasons).toEqual([expect.objectContaining({ code: FinanceRiskReasonCode.MANUAL_REVERSAL })]);
  });
});

describe('FinanceApprovalIntentBuilder', () => {
  it('savedIntent public risk reasons tasir; internalMessage persist etmez ve masking contract ekler', () => {
    const engine = new FinanceRiskEngine();
    const builder = new FinanceApprovalIntentBuilder();
    const riskEvaluation = engine.evaluateCollectionDispositionPost(baseInput());

    const intent = builder.buildCollectionDispositionPostIntent({ ...baseInput(), riskEvaluation });
    const blob = JSON.stringify(intent);

    expect(intent).toEqual(expect.objectContaining({
      version: 'S9H_COLLECTION_DISPOSITION_POST_INTENT_V1',
      policyVersion: 'S9H-1',
      targetType: 'COLLECTION_DISPOSITION',
      risk: expect.objectContaining({ decision: FinanceRiskDecision.REQUIRE_APPROVAL }),
      visibility: expect.objectContaining({
        version: 'S9H_FINANCE_APPROVAL_DETAIL_MASKING_V1',
        summaryContainsRawSavedIntent: false,
        detailRequiresServerSideMasking: true,
      }),
    }));
    expect(blob).not.toContain('internalMessage');
    expect(intent.risk.reasons[0]).toEqual(expect.objectContaining({
      code: FinanceRiskReasonCode.POLICY_REQUIRES_APPROVAL,
      publicMessage: 'Dagitim kesinlesmeden once yetkili onayi gerekir.',
    }));
  });

  it('OfficeApproval reason yalniz public mesajlardan uretilir', () => {
    const engine = new FinanceRiskEngine();
    const builder = new FinanceApprovalIntentBuilder();
    const riskEvaluation = engine.evaluateCollectionDispositionPost(baseInput());
    expect(builder.buildOfficeApprovalReason(riskEvaluation)).toBe('Dagitim kesinlesmeden once yetkili onayi gerekir.');
  });
});