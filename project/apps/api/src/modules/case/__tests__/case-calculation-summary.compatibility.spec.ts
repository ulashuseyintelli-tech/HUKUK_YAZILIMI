import {
  CASE_CALCULATION_SUMMARY_COMPATIBILITY_VERSION,
  buildCaseCalculationSummaryCompatibilityAdapter,
  buildUnavailableCaseCalculationSummaryCompatibilityAdapter,
  type LegacyCalculationSummaryCompatibilityInput,
} from '../case-calculation-summary.compatibility';
import { toCaseBalanceDisplay } from '../../interest-engine/orchestration/case-balance-display';
import {
  buildCaseBalanceFeeProjection,
  type CaseBalanceFeeProjection,
} from '../../interest-engine/orchestration/case-balance-fee-projection';
import type { CaseBalanceResult } from '../../interest-engine/orchestration/case-balance.service';

const GENERATED_AT = '2026-07-12T08:00:00.000Z';

function projection(sourceItems: Array<Record<string, unknown>> = [
  {
    sourceItemId: 'cost-1',
    itemType: 'COST',
    category: 'COST',
    code: 'HARC',
    amount: 40,
    currency: 'TRY',
    sourceStatus: 'AVAILABLE',
  },
  {
    sourceItemId: 'fee-1',
    itemType: 'ATTORNEY_FEE',
    category: 'ANCILLARY',
    code: 'VEKALET_UCRETI',
    amount: 60,
    currency: 'TRY',
    sourceStatus: 'AVAILABLE',
  },
]): CaseBalanceFeeProjection {
  return buildCaseBalanceFeeProjection({
    sourceItems: sourceItems as never,
    currencyResults: [{ currency: 'TRY', resultAvailable: true }],
  });
}

function makeBalance(overrides: Partial<CaseBalanceResult> = {}): CaseBalanceResult {
  return {
    asOfDate: '2026-07-12',
    source: 'LEDGER',
    currencyResults: [
      {
        currency: 'TRY',
        grossPrincipal: 1000,
        result: {
          caseId: 'case-1',
          calculatedAt: GENERATED_AT,
          asOfDate: '2026-07-12',
          totalInterest: 30,
          preEnforcementInterest: 10,
          postEnforcementInterest: 20,
          totalDue: 860,
          segments: [
            {
              claimBucketId: 'claim-1',
              periodStart: '2026-01-01',
              periodEnd: '2026-03-01',
              days: 59,
              rate: 0.24,
              rateId: 'rate-1',
              rateSource: 'TEST',
              principal: 1000,
              segmentInterest: 10,
              phase: 'PRE_ENFORCEMENT',
            },
            {
              claimBucketId: 'claim-1',
              periodStart: '2026-03-01',
              periodEnd: '2026-07-12',
              days: 133,
              rate: 0.24,
              rateId: 'rate-1',
              rateSource: 'TEST',
              principal: 850,
              segmentInterest: 20,
              phase: 'POST_ENFORCEMENT',
            },
          ],
          allocations: [
            {
              paymentId: 'payment-1',
              paymentDate: '2026-03-01',
              paymentAmount: 200,
              claimBucketId: 'claim-1',
              allocations: [
                {
                  category: 'INTEREST',
                  componentType: 'INTEREST',
                  label: 'Interest',
                  amountBefore: 50,
                  amountAllocated: 50,
                  amountAfter: 0,
                },
                {
                  category: 'PRINCIPAL',
                  componentType: 'PRINCIPAL',
                  label: 'Principal',
                  amountBefore: 1000,
                  amountAllocated: 150,
                  amountAfter: 850,
                },
              ],
              remainingPayment: 0,
              newPrincipal: 850,
            },
          ],
          finalDebtStates: [
            {
              claimId: 'claim-1',
              currency: 'TRY',
              principal: 850,
              accruedInterest: 10,
              costs: {},
              ancillaries: {},
            },
          ],
          policyWarnings: [],
          legalText: '',
          interestType: 'LEGAL_3095',
          auditLogId: '',
          inputHash: 'input-hash',
          rateTableVersion: 'rates-v1',
          engineVersion: 'engine-v1',
          ruleVersion: 'rule-v1',
          dayCountRule: '365',
          roundingMode: 'HALF_UP',
          roundingScope: 'PER_SEGMENT',
          gapPolicy: 'BLOCK',
        } as never,
      },
    ],
    projections: { costs: { HARC: 40 }, ancillaries: { VEKALET_UCRETI: 60 } },
    feeProjection: projection(),
    diagnostics: { fatal: [], assembler: [], payments: [], currency: [], perCurrency: [] },
    overpayments: { held: [], blocked: [] },
    ...overrides,
  };
}

function makeLegacy(overrides: Partial<LegacyCalculationSummaryCompatibilityInput> = {}): LegacyCalculationSummaryCompatibilityInput {
  return {
    caseId: 'case-1',
    hesapTarihi: '2026-07-12',
    asilAlacak: 1000,
    tazminat: 100,
    komisyon: 3,
    takipOncesiFaiz: 10,
    takipTutari: 1113,
    basvurmaHarci: 738.5,
    vekaletHarci: 105,
    pesinHarc: 120,
    dosyaGideri: 50,
    tebligatGideri: 252,
    vekaletPulu: 165.6,
    icraMasraflari: 40,
    pesinHarcDahilTahsilHarci: 50,
    pesinHarcHaricTahsilHarci: 45,
    vekaletUcreti: 60,
    takipSonrasiFaiz: 20,
    toplamBorc: 1130,
    sonBorc: 1175,
    toplamTahsilat: 200,
    kalanBorc: 975,
    kalanAnapara: 850,
    ...overrides,
  };
}

function adapt(balance: CaseBalanceResult, legacy = makeLegacy()) {
  const display = toCaseBalanceDisplay({
    tenantId: 'tenant-1',
    caseId: 'case-1',
    balance,
    generatedAt: GENERATED_AT,
  });
  return {
    display,
    adapter: buildCaseCalculationSummaryCompatibilityAdapter({ legacy, display }),
  };
}

describe('ADR-014 PR-10 case calculation-summary compatibility adapter', () => {
  it('maps principal, PRE/POST interest, costs, payment and currency without mutating legacy fields', () => {
    const legacy = makeLegacy();
    const before = structuredClone(legacy);
    const { adapter } = adapt(makeBalance(), legacy);

    expect(legacy).toEqual(before);
    expect(adapter).toMatchObject({
      contractVersion: CASE_CALCULATION_SUMMARY_COMPATIBILITY_VERSION,
      mode: 'ADDITIVE_SHADOW_ONLY',
      status: 'AVAILABLE',
      consumerSwitchAuthorized: false,
      primaryAuthorityPromoted: false,
      primaryDisplayEligible: false,
      legacyFieldsPreserved: true,
      parity: { status: 'PARTIAL' },
    });
    expect(adapter.mappedFields).toMatchObject({
      asilAlacak: { status: 'AVAILABLE', amount: 1000, currency: 'TRY' },
      takipOncesiFaiz: { status: 'AVAILABLE', amount: 10, currency: 'TRY' },
      takipSonrasiFaiz: { status: 'AVAILABLE', amount: 20, currency: 'TRY' },
      icraMasraflari: { status: 'AVAILABLE', amount: 40, currency: 'TRY' },
      vekaletUcreti: { status: 'AVAILABLE', amount: 60, currency: 'TRY' },
      toplamTahsilat: { status: 'AVAILABLE', amount: 200, currency: 'TRY' },
      kalanAnapara: { status: 'AVAILABLE', amount: 850, currency: 'TRY' },
    });
    expect(adapter.canonical?.currencyResults).toEqual([
      expect.objectContaining({
        currency: 'TRY',
        grossPrincipal: 1000,
        remainingPrincipal: 850,
        totalInterest: 30,
        preEnforcementInterest: 10,
        postEnforcementInterest: 20,
        claimRemaining: 860,
        allocatedPayment: 200,
        interestReconciled: true,
      }),
    ]);
    expect(adapter.canonical).toMatchObject({ tenantId: 'tenant-1', caseId: 'case-1' });
  });

  it.each(['NOT_CALCULATED', 'UNAVAILABLE'] as const)(
    'fee projection %s iken harc alanlarinda zero fallback uretmez',
    (status) => {
      const feeProjection = status === 'NOT_CALCULATED'
        ? projection([])
        : buildCaseBalanceFeeProjection({
          sourceItems: [],
          currencyResults: [],
          globalBlockerCodes: ['NO_BUCKETS'],
        });
      const { adapter } = adapt(makeBalance({ feeProjection }));

      expect(adapter.canonical?.feeProjection.status).toBe(status);
      for (const field of [
        'basvurmaHarci',
        'vekaletHarci',
        'pesinHarc',
        'pesinHarcDahilTahsilHarci',
        'pesinHarcHaricTahsilHarci',
      ] as const) {
        expect(adapter.mappedFields[field].amount).toBeNull();
        expect(adapter.mappedFields[field].amount).not.toBe(0);
        expect(adapter.mappedFields[field].status).toBe(status);
      }
    },
  );

  it('legacy/canonical numeric conflictte adapter fail-closed olur', () => {
    const { adapter } = adapt(makeBalance(), makeLegacy({ asilAlacak: 999 }));

    expect(adapter.status).toBe('BLOCKED');
    expect(adapter.primaryDisplayEligible).toBe(false);
    expect(adapter.parity.status).toBe('CONFLICT');
    expect(adapter.diagnostics).toContainEqual(expect.objectContaining({
      code: 'LEGACY_CANONICAL_CONFLICT',
      severity: 'BLOCKER',
    }));
  });

  it.each([
    {
      expected: 'REVERSAL_INTEGRITY',
      overrides: {
        currencyResults: [],
        diagnostics: {
          fatal: [{ code: 'REVERSAL_INTEGRITY_INVALID', caseId: 'case-1' }],
          assembler: [],
          payments: [{ code: 'REVERSAL_AMOUNT_MISMATCH' }],
          currency: [],
          perCurrency: [],
        },
      },
    },
    {
      expected: 'NO_BUCKETS',
      overrides: {
        currencyResults: [{ currency: 'TRY', grossPrincipal: 0, result: null, skippedReason: 'NO_BUCKETS' }],
        diagnostics: {
          fatal: [{ code: 'NO_BUCKETS', caseId: 'case-1' }],
          assembler: [],
          payments: [],
          currency: [],
          perCurrency: [],
        },
      },
    },
    {
      expected: 'CURRENCY_INTEGRITY',
      overrides: {
        diagnostics: {
          fatal: [],
          assembler: [],
          payments: [],
          currency: [{ code: 'CURRENCY_MISMATCH' }],
          perCurrency: [],
        },
      },
    },
  ])('propagates $expected blocker without hiding canonical evidence', ({ expected, overrides }) => {
    const { adapter } = adapt(makeBalance(overrides as Partial<CaseBalanceResult>));

    expect(adapter.status).toBe('BLOCKED');
    expect(adapter.canonical?.blockers.map((blocker) => blocker.code)).toContain(expected);
    expect(adapter.canonical?.readiness.primaryDisplayEligible).toBe(false);
  });

  it('multi-currency results remain separate and scalar legacy mapping is unavailable', () => {
    const tryResult = makeBalance().currencyResults[0];
    const usdResult = {
      ...tryResult,
      currency: 'USD',
      grossPrincipal: 500,
      result: {
        ...tryResult.result!,
        finalDebtStates: [{
          ...tryResult.result!.finalDebtStates[0],
          claimId: 'claim-usd',
          currency: 'USD',
          principal: 500,
        }],
      },
    };
    const { adapter } = adapt(makeBalance({ currencyResults: [tryResult, usdResult] }));

    expect(adapter.status).toBe('BLOCKED');
    expect(adapter.canonical?.currencyResults.map((entry) => entry.currency)).toEqual(['TRY', 'USD']);
    expect(adapter.mappedFields.asilAlacak).toMatchObject({ status: 'UNAVAILABLE', amount: null });
    expect(adapter.diagnostics).toContainEqual(expect.objectContaining({
      code: 'SCALAR_CONTRACT_MULTI_CURRENCY_UNAVAILABLE',
    }));
  });

  it('trace ve non-official snapshot additive kalir ve authority uretmez', () => {
    const { display, adapter } = adapt(makeBalance());

    expect(adapter.canonical?.trace).toBe(display.trace);
    expect(adapter.canonical?.trace).toMatchObject({ authority: 'NONE', persisted: false });
    expect(adapter.canonical?.nonOfficialSnapshot).toBe(display.nonOfficialSnapshot);
    expect(adapter.canonical?.nonOfficialSnapshot).toMatchObject({
      official: false,
      authority: 'NONE',
      persisted: false,
    });
    expect(adapter.canonical?.displayAuthority).toBe('SHADOW_ONLY');
  });

  it('canonical service sonucu yoksa typed UNAVAILABLE contract doner', () => {
    const adapter = buildUnavailableCaseCalculationSummaryCompatibilityAdapter({
      reason: 'CANONICAL_COMPUTE_FAILED',
    });

    expect(adapter).toMatchObject({
      status: 'UNAVAILABLE',
      canonical: null,
      parity: { status: 'UNAVAILABLE', entries: [] },
      unavailableReason: 'CANONICAL_COMPUTE_FAILED',
      primaryDisplayEligible: false,
    });
    expect(Object.values(adapter.mappedFields).every((field) =>
      field.status === 'UNAVAILABLE' && field.amount === null)).toBe(true);
  });
});
