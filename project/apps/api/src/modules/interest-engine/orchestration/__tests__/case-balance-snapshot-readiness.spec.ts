import { makeBalance } from '../../scenario-support/scenario-builder';
import { buildCaseBalanceSnapshotReadiness } from '../case-balance-snapshot-readiness';

describe('ADR-014 PR-8a snapshot/readiness blocker coverage', () => {
  it.each([
    [
      'REVERSAL_INTEGRITY',
      makeBalance({
        diagnostics: {
          fatal: [{ code: 'REVERSAL_INTEGRITY_INVALID', caseId: 'c' }],
          assembler: [],
          payments: [{ code: 'REVERSAL_AMOUNT_MISMATCH', paymentId: 'r1' }],
          currency: [],
          perCurrency: [],
        },
      }),
    ],
    [
      'NO_BUCKETS',
      makeBalance({
        currencyResults: [{ currency: 'TRY', result: null, skippedReason: 'NO_BUCKETS', grossPrincipal: 0 }],
      }),
    ],
    [
      'TBK100_ALLOCATION',
      makeBalance({
        diagnostics: {
          fatal: [],
          assembler: [],
          payments: [{ code: 'ZERO_OR_NEGATIVE_PAYMENT', paymentId: 'p1', detail: 'amount=-1' }],
          currency: [],
          perCurrency: [],
        },
      }),
    ],
    [
      'INTEREST_BASE',
      makeBalance({
        currencyResults: [{ currency: 'TRY', result: null, skippedReason: 'ENGINE_ERROR', grossPrincipal: 100 }],
        diagnostics: {
          fatal: [],
          assembler: [],
          payments: [],
          currency: [],
          perCurrency: [{ currency: 'TRY', code: 'E_RATE_COVERAGE_GAP', message: 'rate gap' }],
        },
      }),
    ],
    [
      'CURRENCY_INTEGRITY',
      makeBalance({
        diagnostics: {
          fatal: [{ code: 'CURRENCY_UNSUPPORTED', caseId: 'c' }],
          assembler: [],
          payments: [],
          currency: [{ code: 'CURRENCY_UNSUPPORTED', currency: 'JPY' }],
          perCurrency: [],
        },
      }),
    ],
  ] as const)('%s blocker typed ve fail-closed tasinir', (expectedCode, balance) => {
    const readiness = buildCaseBalanceSnapshotReadiness(balance);

    expect(readiness).toMatchObject({
      status: 'BLOCKED',
      snapshotAvailable: false,
      primaryDisplayEligible: false,
    });
    expect(readiness.blockers.map((blocker) => blocker.code)).toEqual([expectedCode]);
    expect(readiness.blockers[0].sourceCodes.length).toBeGreaterThan(0);
  });

  it('birden fazla blocker canonical dependency sirasinda tekil ve deterministik kalir', () => {
    const readiness = buildCaseBalanceSnapshotReadiness(makeBalance({
      currencyResults: [
        { currency: 'TRY', result: null, skippedReason: 'NO_BUCKETS', grossPrincipal: 0 },
        { currency: 'USD', result: null, skippedReason: 'ENGINE_ERROR', grossPrincipal: 100 },
      ],
      diagnostics: {
        fatal: [
          { code: 'CURRENCY_UNSUPPORTED', caseId: 'c' },
          { code: 'REVERSAL_INTEGRITY_INVALID', caseId: 'c' },
          { code: 'NO_BUCKETS', caseId: 'c' },
        ],
        assembler: [],
        payments: [
          { code: 'ZERO_OR_NEGATIVE_PAYMENT', paymentId: 'p2' },
          { code: 'REVERSAL_SIGN_INVALID', paymentId: 'r1' },
        ],
        currency: [{ code: 'CURRENCY_UNSUPPORTED', currency: 'JPY' }],
        perCurrency: [{ currency: 'USD', code: 'E_RATE_COVERAGE_GAP', message: 'rate gap' }],
      },
    }));

    expect(readiness.blockers.map((blocker) => blocker.code)).toEqual([
      'REVERSAL_INTEGRITY',
      'NO_BUCKETS',
      'TBK100_ALLOCATION',
      'INTEREST_BASE',
      'CURRENCY_INTEGRITY',
    ]);
  });

  it('blocker yokken official snapshot uydurmaz ve shadow-only icin UNSAFE sinyali verir', () => {
    expect(buildCaseBalanceSnapshotReadiness(makeBalance())).toEqual({
      status: 'UNSAFE',
      snapshotAvailable: false,
      primaryDisplayEligible: false,
      blockers: [],
    });
  });
});
