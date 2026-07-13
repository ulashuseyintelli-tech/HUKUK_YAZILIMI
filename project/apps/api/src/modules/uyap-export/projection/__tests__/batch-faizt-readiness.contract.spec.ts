import { evaluateDormantFaiztBatchReadiness } from '../batch-faizt-readiness.contract';
import {
  FaiztProjectionResult,
  ProjectedFaiztInterest,
  RejectedFaiztProjection,
} from '../faizt-projection.types';

function projected(sourceId: string): ProjectedFaiztInterest {
  return Object.freeze({
    ok: true,
    status: 'PROJECTED',
    sourceId,
    sourceAuthority: 'CLAIM_ITEM_RICH',
    relationClassification: 'CLAIM_ITEM_ONLY',
    canonicalCode: 'LEGAL_3095',
    faiztCode: 'FAIZT00002',
    verification: 'OWNER_LEGAL_ACCEPTED',
    evidence: Object.freeze({
      kind: 'OWNER_DECISION',
      reference: 'PR-A4-3_D1_D9',
    }),
    interestRate: null,
    interestStartDate: '2026-01-01',
  });
}

function rejected(
  sourceId: string,
  status: RejectedFaiztProjection['status'],
): RejectedFaiztProjection {
  return Object.freeze({
    ok: false,
    status,
    sourceId,
    canonicalCode: null,
    relationClassification: 'UNCLASSIFIABLE',
    requiredContext: Object.freeze([]),
    detail: 'TEST_FAILURE',
  });
}

function noInterest(sourceId: string): FaiztProjectionResult {
  return Object.freeze({
    ok: true,
    status: 'NO_INTEREST',
    sourceId,
    relationClassification: 'CLAIM_ITEM_ONLY',
    omitInterestElement: true,
  });
}

describe('evaluateDormantFaiztBatchReadiness', () => {
  it('reports READY when every source is explicitly projectable', () => {
    expect(
      evaluateDormantFaiztBatchReadiness([
        { caseId: 'case-b', projections: [noInterest('claim-2')] },
        { caseId: 'case-a', projections: [projected('claim-1')] },
      ]),
    ).toEqual({
      status: 'READY',
      policy: 'REJECT_ENTIRE_BATCH',
      artifactProduced: false,
      caseCount: 2,
      projectionCount: 2,
      failures: [],
    });
  });

  it('rejects the entire batch for one failure and never returns a valid subset artifact', () => {
    expect(
      evaluateDormantFaiztBatchReadiness([
        {
          caseId: 'case-a',
          projections: [projected('claim-1'), rejected('claim-2', 'UNVERIFIED_FAIZT')],
        },
      ]),
    ).toEqual({
      status: 'REJECTED',
      policy: 'REJECT_ENTIRE_BATCH',
      artifactProduced: false,
      caseCount: 1,
      projectionCount: 2,
      failures: [
        {
          caseId: 'case-a',
          sourceId: 'claim-2',
          status: 'UNVERIFIED_FAIZT',
        },
      ],
    });
  });

  it('returns all failures in deterministic case/source/status order', () => {
    const input = [
      {
        caseId: 'case-b',
        projections: [
          rejected('claim-3', 'MISSING_START_DATE'),
          rejected('claim-1', 'INVALID_RATE'),
        ],
      },
      {
        caseId: 'case-a',
        projections: [rejected('claim-2', 'RELATION_DRIFT')],
      },
    ] as const;

    const first = evaluateDormantFaiztBatchReadiness(input);
    const second = evaluateDormantFaiztBatchReadiness(input);

    expect(first).toEqual(second);
    expect(first.status).toBe('REJECTED');
    expect(first.failures).toEqual([
      { caseId: 'case-a', sourceId: 'claim-2', status: 'RELATION_DRIFT' },
      { caseId: 'case-b', sourceId: 'claim-1', status: 'INVALID_RATE' },
      { caseId: 'case-b', sourceId: 'claim-3', status: 'MISSING_START_DATE' },
    ]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.failures)).toBe(true);
  });

  it.each([
    [[], 'BATCH_EMPTY'],
    [[{ caseId: 'case-a', projections: [] }], 'CASE_HAS_NO_PROJECTIONS'],
    [
      [
        { caseId: 'case-a', projections: [projected('claim-1')] },
        { caseId: 'case-a', projections: [projected('claim-2')] },
      ],
      'DUPLICATE_CASE_ID',
    ],
  ] as const)('fails closed instead of silently omitting batch structure (%s)', (input, status) => {
    expect(evaluateDormantFaiztBatchReadiness(input)).toMatchObject({
      status: 'REJECTED',
      artifactProduced: false,
      failures: expect.arrayContaining([expect.objectContaining({ status })]),
    });
  });
});
