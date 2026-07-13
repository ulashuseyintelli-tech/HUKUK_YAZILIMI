import { ClaimItemStatus, InterestAccrualStatus, InterestTypeCode } from '@prisma/client';

import { classifyDueClaimItemRelations } from '../due-claimitem-relation.classifier';
import {
  ClaimItemRelationSnapshot,
  DueRelationSnapshot,
} from '../faizt-projection.types';

const TENANT_ID = 'tenant-a';
const CASE_ID = 'case-a';

function due(
  overrides: Partial<DueRelationSnapshot> = {},
): DueRelationSnapshot {
  return Object.freeze({
    dueId: 'due-1',
    tenantId: TENANT_ID,
    caseId: CASE_ID,
    type: 'PRINCIPAL',
    amount: '100.00',
    currency: 'TRY',
    interestTypeCode: InterestTypeCode.LEGAL_3095,
    legacyInterestType: 'YASAL',
    interestRate: null,
    interestStartDate: '2026-01-01',
    interestAccrualStatus: InterestAccrualStatus.ACCRUES,
    exportEligible: true,
    ...overrides,
  });
}

function claim(
  overrides: Partial<ClaimItemRelationSnapshot> = {},
): ClaimItemRelationSnapshot {
  return Object.freeze({
    claimItemId: 'claim-1',
    tenantId: TENANT_ID,
    caseId: CASE_ID,
    itemType: 'PRINCIPAL',
    amount: '100',
    demandedAmount: '100.0',
    originalAmount: '75',
    currency: 'TRY',
    status: ClaimItemStatus.ACTIVE,
    interestTypeCode: InterestTypeCode.LEGAL_3095,
    legacyInterestType: 'YASAL',
    interestRate: null,
    interestStartDate: '2026-01-01',
    interestAccrualStatus: InterestAccrualStatus.ACCRUES,
    dueSyncSourceDueId: 'due-1',
    backfillSourceDueId: null,
    exportEligible: true,
    ...overrides,
  });
}

function classify(
  dues: readonly DueRelationSnapshot[],
  claims: readonly ClaimItemRelationSnapshot[],
) {
  return classifyDueClaimItemRelations({
    tenantId: TENANT_ID,
    caseId: CASE_ID,
    dues,
    claimItems: claims,
  });
}

describe('classifyDueClaimItemRelations', () => {
  it.each([
    ['dueSync', claim()],
    [
      'backfill',
      claim({ dueSyncSourceDueId: null, backfillSourceDueId: 'due-1' }),
    ],
  ])('classifies a strong %s marker as MATCHED_PAIR', (_label, item) => {
    const result = classify([due()], [item]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      classification: 'MATCHED_PAIR',
      dueIds: ['due-1'],
      claimItemIds: ['claim-1'],
      sourceExportEligible: true,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
  });

  it.each([
    ['tenant', claim({ tenantId: 'tenant-b' })],
    ['case', claim({ caseId: 'case-b' })],
  ])('fails closed for %s scope mismatch', (_label, item) => {
    expect(
      classify([due()], [item]).find(
        (result) => result.classification === 'UNCLASSIFIABLE',
      ),
    ).toMatchObject({
      classification: 'UNCLASSIFIABLE',
      sourceExportEligible: false,
    });
  });

  it('classifies multiple strong markers as DUPLICATE_PAIR', () => {
    const result = classify(
      [due()],
      [claim(), claim({ claimItemId: 'claim-2' })],
    );

    expect(result[0]).toMatchObject({
      classification: 'DUPLICATE_PAIR',
      claimItemIds: ['claim-1', 'claim-2'],
    });
  });

  it('does not heuristically pair unmarked sources', () => {
    const result = classify(
      [due()],
      [claim({ dueSyncSourceDueId: null, backfillSourceDueId: null })],
    );

    expect(result).toEqual([
      expect.objectContaining({
        classification: 'MARKER_MISSING',
        dueIds: ['due-1'],
        claimItemIds: ['claim-1'],
        reasons: ['UNMARKED_SOURCES_NOT_HEURISTICALLY_PAIRED'],
      }),
    ]);
  });

  it.each([
    ['DUE_ONLY', [due()], []],
    [
      'CLAIM_ITEM_ONLY',
      [],
      [claim({ dueSyncSourceDueId: null, backfillSourceDueId: null })],
    ],
  ])('classifies an isolated source as %s', (classification, dues, claims) => {
    expect(classify(dues, claims)[0].classification).toBe(classification);
  });

  it('preserves the exact NAFAKA Due-only exception', () => {
    expect(classify([due({ type: 'NAFAKA' })], [])[0]).toMatchObject({
      classification: 'NAFAKA_EXPECTED_DUE_ONLY',
      reasons: ['CANONICAL_NAFAKA_DUE_ONLY_EXCEPTION'],
    });
  });

  it('rejects a strong ClaimItem marker on NAFAKA', () => {
    expect(classify([due({ type: 'NAFAKA' })], [claim()])[0]).toMatchObject({
      classification: 'AMOUNT_OR_TYPE_DRIFT',
      reasons: ['NAFAKA_HAS_STRONG_CLAIM_ITEM_MARKER'],
    });
  });

  it('classifies conflicting markers and unknown Due types as unclassifiable', () => {
    const conflicting = classify(
      [],
      [claim({ dueSyncSourceDueId: 'due-1', backfillSourceDueId: 'due-2' })],
    );
    const unknown = classify([due({ type: 'UNKNOWN_TYPE' })], []);

    expect(conflicting[0].classification).toBe('UNCLASSIFIABLE');
    expect(unknown[0]).toMatchObject({
      classification: 'UNCLASSIFIABLE',
      reasons: ['UNKNOWN_DUE_TYPE'],
    });
  });

  it('carries lifecycle/export ineligibility without changing a valid relation identity', () => {
    expect(classify([due()], [claim({ exportEligible: false })])[0]).toMatchObject({
      classification: 'MATCHED_PAIR',
      sourceExportEligible: false,
    });
  });

  it.each([
    [
      'INTEREST_IDENTITY_DRIFT',
      claim({ interestTypeCode: InterestTypeCode.TTK_1530 }),
    ],
    ['AMOUNT_OR_TYPE_DRIFT', claim({ itemType: 'EXPENSE' })],
    ['AMOUNT_OR_TYPE_DRIFT', claim({ demandedAmount: '90', amount: '90' })],
  ])('detects %s independently of provenance amount', (classification, item) => {
    expect(classify([due()], [item])[0].classification).toBe(classification);
  });

  it('does not treat originalAmount provenance difference as current amount drift', () => {
    expect(
      classify([due({ amount: '125' })], [
        claim({ amount: '125', demandedAmount: '125', originalAmount: '100' }),
      ])[0].classification,
    ).toBe('MATCHED_PAIR');
  });

  it('fails closed when both sides contain the same invalid interest state', () => {
    expect(
      classify(
        [due({ interestRate: 'not-a-rate', interestStartDate: 'not-a-date' })],
        [claim({ interestRate: 'not-a-rate', interestStartDate: 'not-a-date' })],
      )[0],
    ).toMatchObject({
      classification: 'INTEREST_IDENTITY_DRIFT',
      reasons: expect.arrayContaining([
        'INTEREST_RATE_INVALID',
        'INTEREST_START_DATE_INVALID',
      ]),
    });
  });
});
