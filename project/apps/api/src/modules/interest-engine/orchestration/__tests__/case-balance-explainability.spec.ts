import { AncillaryType } from '../../types/domain.types';
import { makeBalance } from '../../scenario-support/scenario-builder';
import { toCaseBalanceDisplay } from '../case-balance-display';

const GENERATED_AT = '2026-07-11T12:00:00.000Z';

function allocation(
  paymentId: string,
  paymentDate: string,
  claimBucketId: string,
  category: 'INTEREST' | 'PRINCIPAL',
) {
  return {
    paymentId,
    paymentDate,
    paymentAmount: 100,
    allocations: [{
      category,
      label: category,
      amountBefore: 1000,
      amountAllocated: 100,
      amountAfter: 900,
    }],
    remainingPayment: 0,
    newPrincipal: category === 'PRINCIPAL' ? 900 : 1000,
    claimBucketId,
  };
}

function segment(currencyClaimId: string, phase: 'PRE_ENFORCEMENT' | 'POST_ENFORCEMENT') {
  return {
    claimBucketId: currencyClaimId,
    periodStart: '2026-06-01',
    periodEnd: '2026-06-11',
    days: 10,
    rate: 0.24,
    rateId: `rate-${currencyClaimId}`,
    rateSource: 'TEST_RATE',
    principal: 1000,
    segmentInterest: 6.58,
    phase,
    dayCountRule: 'Actual/365',
  };
}

describe('ADR-014 PR-8b case balance explainability', () => {
  it('canonical allocation/segment sonucunu deterministik trace eder ve kaynaklari ayri tutar', () => {
    const feeProjection = {
      status: 'AVAILABLE',
      authority: 'SOURCE_PROJECTION_ONLY',
      policyStatus: 'OWNER_GATED',
      aggregation: 'PER_CURRENCY_ONLY',
      currency: 'TRY',
      totalProjectedAmount: 25,
      groups: [{
        currency: 'TRY',
        status: 'AVAILABLE',
        totalProjectedAmount: 25,
        lines: [{
          sourceItemId: 'fee-1',
          itemType: 'FEE',
          category: 'COST',
          code: AncillaryType.HARC,
          amount: 25,
          currency: 'TRY',
          source: 'PERSISTED_CLAIM_ITEM',
          status: 'AVAILABLE',
        }],
      }],
      diagnostics: [],
    } as const;
    const balance = makeBalance({
      currencyResults: [
        {
          currency: 'TRY',
          grossPrincipal: 1000,
          result: {
            totalInterest: 13.16,
            totalDue: 900,
            allocations: [
              allocation('payment-2', '2026-06-20', 'try-2', 'PRINCIPAL'),
              allocation('payment-1', '2026-06-10', 'try-1', 'INTEREST'),
            ],
            segments: [segment('try-1', 'PRE_ENFORCEMENT')],
            finalDebtStates: [{
              claimId: 'try-1',
              currency: 'TRY',
              principal: 900,
              accruedInterest: 0,
              costs: {},
              ancillaries: {},
            }],
            engineVersion: 'engine-v1',
          } as never,
        },
        {
          currency: 'EUR',
          grossPrincipal: 500,
          result: {
            totalInterest: 6.58,
            totalDue: 506.58,
            allocations: [allocation('eur-payment', '2026-06-15', 'eur-1', 'INTEREST')],
            segments: [segment('eur-1', 'POST_ENFORCEMENT')],
            finalDebtStates: [{
              claimId: 'eur-1',
              currency: 'EUR',
              principal: 500,
              accruedInterest: 6.58,
              costs: {},
              ancillaries: {},
            }],
            engineVersion: 'engine-v1',
          } as never,
        },
      ],
      projections: {
        costs: { [AncillaryType.TEBLIGAT_MASRAFI]: 12 },
        ancillaries: { [AncillaryType.VEKALET_UCRETI]: 30 },
      },
      feeProjection: feeProjection as never,
    });

    const display = toCaseBalanceDisplay({
      tenantId: 'tenant-1',
      caseId: 'case-1',
      balance,
      generatedAt: GENERATED_AT,
    });

    expect(display.trace).toMatchObject({
      kind: 'NON_AUTHORITATIVE_EXPLAINABILITY_TRACE',
      authority: 'NONE',
      persisted: false,
      orderPolicy: 'CURRENCY_ASC_THEN_CANONICAL_RESULT_ORDER',
      blockerCodes: [],
    });
    expect(display.trace.allocationSteps.map((step) => [
      step.sequence,
      step.currency,
      step.paymentId,
      step.claimBucketId,
    ])).toEqual([
      [1, 'EUR', 'eur-payment', 'eur-1'],
      [2, 'TRY', 'payment-2', 'try-2'],
      [3, 'TRY', 'payment-1', 'try-1'],
    ]);
    expect(display.trace.allocationSteps[1].allocations).toEqual([
      expect.objectContaining({ sequence: 1, allocationIndex: 0, category: 'PRINCIPAL' }),
    ]);
    expect(display.trace.interestSegments.map((row) => [row.sequence, row.currency, row.phase])).toEqual([
      [1, 'EUR', 'POST_ENFORCEMENT'],
      [2, 'TRY', 'PRE_ENFORCEMENT'],
    ]);
    expect(display.trace.sources).toMatchObject({
      principal: [
        { currency: 'EUR', claimId: 'eur-1', amount: 500, source: 'CALCULATION_RESULT_FINAL_DEBT_STATES' },
        { currency: 'TRY', claimId: 'try-1', amount: 900, source: 'CALCULATION_RESULT_FINAL_DEBT_STATES' },
      ],
      costs: [{
        code: AncillaryType.TEBLIGAT_MASRAFI,
        amount: 12,
        currency: null,
        source: 'CASE_LEVEL_PROJECTION',
      }],
      ancillaries: [{
        code: AncillaryType.VEKALET_UCRETI,
        amount: 30,
        currency: null,
        source: 'CASE_LEVEL_PROJECTION',
      }],
      feeProjection,
    });
    expect(display.trace.sources.feeProjection).toBe(display.feeProjection);
    expect(display.trace.sources.interest).toBe(display.trace.interestSegments);
  });

  it('non-official snapshot display/readiness kanitini kayipsiz tasir, blocker gizlemez ve authority uretmez', () => {
    const balance = makeBalance({
      currencyResults: [{
        currency: 'TRY',
        result: null,
        skippedReason: 'NO_BUCKETS',
        grossPrincipal: 0,
      }],
      diagnostics: {
        fatal: [{ code: 'NO_BUCKETS', caseId: 'case-blocked' }],
        assembler: [],
        payments: [],
        currency: [],
        perCurrency: [],
      },
    });

    const display = toCaseBalanceDisplay({
      tenantId: 'tenant-blocked',
      caseId: 'case-blocked',
      balance,
      generatedAt: GENERATED_AT,
    });
    const snapshot = display.nonOfficialSnapshot;

    expect(snapshot).toMatchObject({
      kind: 'NON_OFFICIAL_CASE_BALANCE_SNAPSHOT',
      official: false,
      persisted: false,
      authority: 'NONE',
      tenantId: 'tenant-blocked',
      caseId: 'case-blocked',
      displayStatus: 'UNAVAILABLE',
      displayAuthority: 'UNSAFE_FOR_PRIMARY_DISPLAY',
      unavailableReason: 'NO_BUCKETS',
      officialSnapshotAvailable: false,
      blockerCodes: ['NO_BUCKETS'],
      readiness: {
        status: 'BLOCKED',
        snapshotAvailable: false,
        primaryDisplayEligible: false,
      },
    });
    expect(snapshot.currencies).toBe(display.currencies);
    expect(snapshot.buckets).toBe(display.buckets);
    expect(snapshot.totals).toBe(display.totals);
    expect(snapshot.diagnostics).toBe(display.diagnostics);
    expect(snapshot.feeProjection).toBe(display.feeProjection);
    expect(snapshot.trace).toBe(display.trace);
    expect(snapshot.trace.blockerCodes).toEqual(['NO_BUCKETS']);
    expect(snapshot).not.toHaveProperty('inputHash');
    expect(snapshot).not.toHaveProperty('id');
  });
});
