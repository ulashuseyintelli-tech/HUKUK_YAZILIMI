import { InterestAccrualStatus, InterestTypeCode } from '@prisma/client';

import { resolveDormantFaiztProjection } from '../faizt-interest-projection.adapter';
import {
  ClaimItemFaiztProjectionInput,
  NafakaDueFaiztProjectionInput,
  ReceivableRelationResult,
} from '../faizt-projection.types';

function relation(
  overrides: Partial<ReceivableRelationResult> = {},
): ReceivableRelationResult {
  return Object.freeze({
    classification: 'MATCHED_PAIR',
    tenantId: 'tenant-a',
    caseId: 'case-a',
    dueIds: Object.freeze(['due-1']),
    claimItemIds: Object.freeze(['claim-1']),
    sourceExportEligible: true,
    reasons: Object.freeze([]),
    ...overrides,
  });
}

function claimInput(
  overrides: Partial<ClaimItemFaiztProjectionInput> = {},
): ClaimItemFaiztProjectionInput {
  return Object.freeze({
    sourceKind: 'CLAIM_ITEM',
    claimItemId: 'claim-1',
    tenantId: 'tenant-a',
    caseId: 'case-a',
    relation: relation(),
    interestTypeCode: InterestTypeCode.LEGAL_3095,
    legacyInterestType: 'YASAL',
    interestRate: null,
    interestStartDate: '2026-01-15',
    interestAccrualStatus: InterestAccrualStatus.ACCRUES,
    sourceMarker: Object.freeze({
      dueSyncSourceDueId: 'due-1',
      backfillSourceDueId: null,
    }),
    exportEligible: true,
    ...overrides,
  });
}

function nafakaInput(
  overrides: Partial<NafakaDueFaiztProjectionInput> = {},
): NafakaDueFaiztProjectionInput {
  return Object.freeze({
    sourceKind: 'NAFAKA_DUE',
    dueId: 'due-nafaka',
    tenantId: 'tenant-a',
    caseId: 'case-a',
    dueType: 'NAFAKA',
    relation: relation({
      classification: 'NAFAKA_EXPECTED_DUE_ONLY',
      dueIds: Object.freeze(['due-nafaka']),
      claimItemIds: Object.freeze([]),
    }),
    interestTypeCode: null,
    legacyInterestType: null,
    interestRate: null,
    interestStartDate: null,
    interestAccrualStatus: null,
    exportEligible: true,
    ...overrides,
  });
}

describe('resolveDormantFaiztProjection', () => {
  it.each([
    [InterestTypeCode.LEGAL_3095, 'YASAL', 'FAIZT00002'],
    [InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, 'TICARI', 'FAIZT00007'],
    [InterestTypeCode.TTK_1530, null, 'FAIZT00017'],
  ] as const)(
    'projects the accepted %s cell directly from the canonical crosswalk',
    (interestTypeCode, legacyInterestType, faiztCode) => {
      const input = claimInput({ interestTypeCode, legacyInterestType });
      const first = resolveDormantFaiztProjection(input);
      const second = resolveDormantFaiztProjection(input);

      expect(first).toEqual(second);
      expect(first).toMatchObject({
        ok: true,
        status: 'PROJECTED',
        canonicalCode: interestTypeCode,
        faiztCode,
        interestStartDate: '2026-01-15',
        interestRate: null,
        sourceAuthority: 'CLAIM_ITEM_RICH',
      });
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.isFrozen(input)).toBe(true);
    },
  );

  it('returns explicit NO_INTEREST only for a coherent canonical no-interest state', () => {
    const result = resolveDormantFaiztProjection(
      claimInput({
        relation: relation({ classification: 'CLAIM_ITEM_ONLY', dueIds: [] }),
        sourceMarker: Object.freeze({
          dueSyncSourceDueId: null,
          backfillSourceDueId: null,
        }),
        interestTypeCode: null,
        legacyInterestType: null,
        interestRate: null,
        interestStartDate: null,
        interestAccrualStatus: InterestAccrualStatus.NO_INTEREST,
      }),
    );

    expect(result).toEqual({
      ok: true,
      status: 'NO_INTEREST',
      sourceId: 'claim-1',
      relationClassification: 'CLAIM_ITEM_ONLY',
      omitInterestElement: true,
    });
  });

  it.each([
    [InterestTypeCode.CONTRACTUAL, 18],
    [InterestTypeCode.COMMERCIAL_FIXED, 24.5],
    [InterestTypeCode.MEVDUAT_TL_BANKALARCA, null],
    [InterestTypeCode.MEVDUAT_USD_BANKALARCA, null],
    [InterestTypeCode.MEVDUAT_EUR_BANKALARCA, null],
    [InterestTypeCode.MEVDUAT_TL_KAMU, null],
    [InterestTypeCode.MEVDUAT_USD_KAMU, null],
    [InterestTypeCode.MEVDUAT_EUR_KAMU, null],
  ] as const)('blocks the code-less FAIZT cell for %s', (interestTypeCode, rate) => {
    expect(
      resolveDormantFaiztProjection(
        claimInput({ interestTypeCode, legacyInterestType: null, interestRate: rate }),
      ),
    ).toMatchObject({
      ok: false,
      status: 'UNVERIFIED_FAIZT',
      canonicalCode: interestTypeCode,
    });
  });

  it.each([
    [null, null, 'UNKNOWN_CANONICAL_CODE'],
    ['NOT_A_CANONICAL_CODE', null, 'UNKNOWN_CANONICAL_CODE'],
    [null, 'YASAL', 'LEGACY_AMBIGUOUS'],
    [null, 'UNKNOWN_LEGACY', 'LEGACY_AMBIGUOUS'],
  ] as const)(
    'fails closed for canonical=%s legacy=%s',
    (interestTypeCode, legacyInterestType, status) => {
      expect(
        resolveDormantFaiztProjection(
          claimInput({ interestTypeCode, legacyInterestType }),
        ),
      ).toMatchObject({ ok: false, status });
    },
  );

  it.each([
    [0, 'INVALID_RATE'],
    [-5, 'INVALID_RATE'],
    [null, 'INVALID_RATE'],
    [undefined, 'INVALID_RATE'],
    [Number.NaN, 'INVALID_RATE'],
    [Number.POSITIVE_INFINITY, 'INVALID_RATE'],
    ['not-a-number', 'INVALID_RATE'],
  ] as const)('rejects invalid contractual rate %s', (interestRate, status) => {
    expect(
      resolveDormantFaiztProjection(
        claimInput({
          interestTypeCode: InterestTypeCode.CONTRACTUAL,
          legacyInterestType: null,
          interestRate,
        }),
      ),
    ).toMatchObject({ ok: false, status });
  });

  it.each([18, 18.75, '18.50'])(
    'accepts positive contractual rate semantics before blocking unverified mapping (%s)',
    (interestRate) => {
      expect(
        resolveDormantFaiztProjection(
          claimInput({
            interestTypeCode: InterestTypeCode.CONTRACTUAL,
            legacyInterestType: null,
            interestRate,
          }),
        ),
      ).toMatchObject({ ok: false, status: 'UNVERIFIED_FAIZT' });
    },
  );

  it.each([null, 'not-a-date', new Date(Number.NaN)])(
    'requires an explicit valid canonical start date (%s)',
    (interestStartDate) => {
      const input = {
        ...claimInput({ interestStartDate }),
        dueDate: '2026-01-15',
      };
      expect(resolveDormantFaiztProjection(input)).toMatchObject({
        ok: false,
        status: 'MISSING_START_DATE',
      });
    },
  );

  it('rejects rich/legacy mismatch while allowing rich with null legacy', () => {
    expect(
      resolveDormantFaiztProjection(
        claimInput({
          interestTypeCode: InterestTypeCode.CONTRACTUAL,
          legacyInterestType: 'YASAL',
          interestRate: 18,
        }),
      ),
    ).toMatchObject({ ok: false, status: 'RICH_LEGACY_MISMATCH' });
    expect(
      resolveDormantFaiztProjection(
        claimInput({
          interestTypeCode: InterestTypeCode.TTK_1530,
          legacyInterestType: null,
        }),
      ),
    ).toMatchObject({ ok: true, status: 'PROJECTED' });
  });

  it('never converts missing or conflicting no-interest data into omission', () => {
    expect(
      resolveDormantFaiztProjection(
        claimInput({ interestTypeCode: null, legacyInterestType: null }),
      ),
    ).toMatchObject({ ok: false, status: 'UNKNOWN_CANONICAL_CODE' });
    expect(
      resolveDormantFaiztProjection(
        claimInput({
          interestAccrualStatus: InterestAccrualStatus.NO_INTEREST,
          interestTypeCode: InterestTypeCode.LEGAL_3095,
        }),
      ),
    ).toMatchObject({ ok: false, status: 'INVALID_INTEREST_STATE' });
  });

  it.each([
    ['DUPLICATE_PAIR', 'RELATION_DUPLICATE'],
    ['AMOUNT_OR_TYPE_DRIFT', 'RELATION_DRIFT'],
    ['INTEREST_IDENTITY_DRIFT', 'RELATION_DRIFT'],
    ['MARKER_MISSING', 'RELATION_MARKER_MISSING'],
    ['UNCLASSIFIABLE', 'RELATION_UNCLASSIFIABLE'],
  ] as const)('maps relation %s to %s', (classification, status) => {
    expect(
      resolveDormantFaiztProjection(
        claimInput({ relation: relation({ classification }) }),
      ),
    ).toMatchObject({ ok: false, status });
  });

  it('returns SOURCE_NOT_EXPORTABLE for lifecycle-ineligible valid sources', () => {
    expect(
      resolveDormantFaiztProjection(claimInput({ exportEligible: false })),
    ).toMatchObject({ ok: false, status: 'SOURCE_NOT_EXPORTABLE' });
  });

  it('rejects a relation snapshot whose strong marker does not prove the pair', () => {
    expect(
      resolveDormantFaiztProjection(
        claimInput({
          sourceMarker: Object.freeze({
            dueSyncSourceDueId: 'due-other',
            backfillSourceDueId: null,
          }),
        }),
      ),
    ).toMatchObject({ ok: false, status: 'RELATION_UNCLASSIFIABLE' });
  });

  it('classifies NAFAKA exactly and blocks mapping without guessing or omitting', () => {
    expect(resolveDormantFaiztProjection(nafakaInput())).toMatchObject({
      ok: false,
      status: 'NAFAKA_MAPPING_BLOCKED',
      canonicalCode: null,
    });
    expect(
      resolveDormantFaiztProjection(
        nafakaInput({ relation: relation({ classification: 'DUPLICATE_PAIR' }) }),
      ),
    ).toMatchObject({ ok: false, status: 'RELATION_DUPLICATE' });
  });
});
