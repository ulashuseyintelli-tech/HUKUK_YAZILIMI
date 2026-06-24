import { BalanceDisplayShadowDiffService } from '../balance-display-shadow-diff.service';
import type { BalanceDisplayShadowDiffReport } from '../balance-display-shadow-diff.types';
import type { CaseService } from '../../case/case.service';
import type { CaseBalanceService, CaseBalanceResult } from '../../interest-engine/orchestration/case-balance.service';
import { AncillaryType } from '../../interest-engine/types/domain.types';

const GENERATED_AT = '2026-06-24T10:00:00.000Z';

type GuardedPrimarySource = 'CANONICAL_PRIMARY_CANDIDATE' | 'LEGACY_FALLBACK';

interface GuardedPilotPolicy {
  featureFlagEnabled?: boolean;
  scenarioSupported?: boolean;
  paymentDesignationRequired?: boolean;
  unsupportedPeriodicObligation?: boolean;
  claimItemAuthorityContaminated?: boolean;
}

interface GuardedPilotDecision {
  primarySource: GuardedPrimarySource;
  reasonCodes: string[];
}

const HARD_NO_GO_CODES = [
  'FINAL_DEBT_STATES_MISSING',
  'FINAL_DEBT_STATES_CURRENCY_MISMATCH',
  'CURRENCY_MISMATCH',
  'CONTEXT_MISMATCH',
  'CANONICAL_CURRENCY_UNSAFE',
  'MULTI_CURRENCY_DISPLAY_UNSAFE',
  'OVERPAYMENT_BLOCKED',
  'RESTRICTED_PAYMENT_DISPLAY_UNSAFE',
  'NAFAKA_PRINCIPAL_DISPLAY_RISK',
] as const;

function legacySummary(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'tenant-1',
    caseId: 'case-1',
    currency: 'TRY',
    hesapTarihi: '2026-06-24',
    takipTarihi: '2026-01-01',
    kalemTuru: 'PRINCIPAL',
    asilAlacak: 750,
    takipOncesiFaiz: 0,
    takipSonrasiFaiz: 25,
    faizSegmentleri: { takipOncesi: [], takipSonrasi: [{ id: 'legacy-post' }] },
    toplamBorc: 975,
    sonBorc: 975,
    toplamTahsilat: 0,
    kalanBorc: 975,
    icraMasraflari: 50,
    vekaletUcreti: 150,
    pesinHarcHaricTahsilHarci: 0,
    canonicalShadow: {
      status: 'OK',
      source: 'computeCaseBalance',
      legacyCurrency: 'TRY',
    },
    ...overrides,
  };
}

function canonicalBalance(overrides: Partial<CaseBalanceResult> = {}): CaseBalanceResult {
  return {
    asOfDate: '2026-06-24',
    source: 'LEDGER',
    currencyResults: [
      {
        currency: 'TRY',
        result: {
          engineVersion: 'engine-v1',
          totalDue: 775,
          totalInterest: 25,
          allocations: [],
          segments: [{ id: 'seg-1' }],
          finalDebtStates: [
            {
              claimId: 'p1',
              currency: 'TRY',
              principal: 750,
              accruedInterest: 25,
              costs: {},
              ancillaries: {},
            },
          ],
        } as any,
      },
    ],
    projections: {
      costs: { [AncillaryType.HARC]: 50 },
      ancillaries: { [AncillaryType.VEKALET_UCRETI]: 150 },
    },
    diagnostics: { fatal: [], assembler: [], payments: [], currency: [], perCurrency: [] },
    overpayments: { held: [], blocked: [] },
    ...overrides,
  };
}

function canonicalWithoutFinalDebtStates(overrides: Partial<CaseBalanceResult> = {}): CaseBalanceResult {
  return canonicalBalance({
    currencyResults: [
      {
        currency: 'TRY',
        result: {
          engineVersion: 'engine-v1',
          totalDue: 775,
          totalInterest: 25,
          allocations: [],
          segments: [{ id: 'seg-1' }],
        } as any,
      },
    ],
    ...overrides,
  });
}

function canonicalWithFinalDebtCurrencyMismatch(): CaseBalanceResult {
  return canonicalBalance({
    currencyResults: [
      {
        currency: 'TRY',
        result: {
          engineVersion: 'engine-v1',
          totalDue: 775,
          totalInterest: 25,
          allocations: [],
          segments: [{ id: 'seg-1' }],
          finalDebtStates: [
            {
              claimId: 'p1',
              currency: 'USD',
              principal: 750,
              accruedInterest: 25,
              costs: {},
              ancillaries: {},
            },
          ],
        } as any,
      },
    ],
  });
}

function canonicalWithHeldOverpayment(): CaseBalanceResult {
  return canonicalBalance({
    overpayments: {
      held: [
        {
          id: 'op-held',
          collectionId: 'col-1',
          sourceLedgerEntryId: 'le-1',
          amount: 80,
          remainingAmount: 80,
          currency: 'TRY',
          status: 'HELD',
        },
      ],
      blocked: [],
    },
  } as Partial<CaseBalanceResult>);
}

function canonicalWithBlockedRestrictedPayment(): CaseBalanceResult {
  return canonicalBalance({
    overpayments: {
      held: [],
      blocked: [
        {
          id: 'timeline-1',
          collectionId: 'col-2',
          sourceLedgerEntryId: 'le-2',
          attemptedOverpaymentAmount: 40,
          currency: 'TRY',
          blockedReasons: [{ reason: 'RESTRICTED_PAYMENT_UNSUPPORTED' }],
          createdAt: '2026-06-24T09:00:00.000Z',
        },
      ],
    },
  } as Partial<CaseBalanceResult>);
}

function makeService(
  legacy: unknown = legacySummary(),
  canonical: CaseBalanceResult | Error = canonicalBalance(),
) {
  const mutators = {
    createLedgerEntry: jest.fn(),
    createLedgerAllocation: jest.fn(),
    createCollection: jest.fn(),
    createCollectionAllocation: jest.fn(),
    createCollectionOverpayment: jest.fn(),
    createDue: jest.fn(),
    createClaimItem: jest.fn(),
    persistCalculationSummary: jest.fn(),
    persistBalanceDisplay: jest.fn(),
  };
  const caseService = {
    getCalculationSummary: jest.fn().mockImplementation(async () => {
      if (legacy instanceof Error) throw legacy;
      return legacy;
    }),
    ...mutators,
  } as unknown as CaseService;
  const caseBalance = {
    computeCaseBalance: jest.fn().mockImplementation(async () => {
      if (canonical instanceof Error) throw canonical;
      return canonical;
    }),
    ...mutators,
  } as unknown as CaseBalanceService;

  return {
    service: new BalanceDisplayShadowDiffService(caseService, caseBalance),
    caseService,
    caseBalance,
    mutators,
  };
}

async function compare(
  legacy: unknown = legacySummary(),
  canonical: CaseBalanceResult | Error = canonicalBalance(),
): Promise<BalanceDisplayShadowDiffReport> {
  const { service } = makeService(legacy, canonical);
  return service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);
}

function issueCodes(report: BalanceDisplayShadowDiffReport): Set<string> {
  return new Set([
    ...report.diagnostics.map((diagnostic) => diagnostic.code),
    ...report.comparability.blockers.map((blocker) => blocker.code),
    ...report.comparability.warnings.map((warning) => warning.code),
    ...report.sources.canonicalBalanceDisplay.unsafeSources,
  ]);
}

function guardedPilotDecision(
  report: BalanceDisplayShadowDiffReport,
  policy: GuardedPilotPolicy = {},
): GuardedPilotDecision {
  const reasonCodes: string[] = [];
  const codes = issueCodes(report);
  const featureFlagEnabled = policy.featureFlagEnabled ?? true;
  const scenarioSupported = policy.scenarioSupported ?? true;

  if (!featureFlagEnabled) reasonCodes.push('FEATURE_FLAG_OFF');
  if (!scenarioSupported) reasonCodes.push('UNSUPPORTED_SCENARIO');
  if (policy.paymentDesignationRequired) reasonCodes.push('PAYMENT_DESIGNATION_REQUIRED');
  if (policy.unsupportedPeriodicObligation) reasonCodes.push('UNSUPPORTED_PERIODIC_OBLIGATION');
  if (policy.claimItemAuthorityContaminated || report.provenance.claimItemCollectedAmountUsedAsAuthority) {
    reasonCodes.push('CLAIM_ITEM_AUTHORITY_CONTAMINATION');
  }
  if (!report.sources.legacyCalculationSummary.available || !report.sources.canonicalBalanceDisplay.available) {
    reasonCodes.push('SHADOW_OR_CANONICAL_SOURCE_FAILURE');
  }
  if (!report.provenance.finalDebtStatesAvailable) {
    reasonCodes.push('FINAL_DEBT_STATES_REQUIRED');
  }
  if (!report.comparability.comparable) {
    reasonCodes.push('NOT_COMPARABLE');
  }
  if (report.currency === 'MULTI' || report.currency === 'UNKNOWN' || report.currency == null) {
    reasonCodes.push('DISPLAY_CURRENCY_UNSAFE');
  }
  for (const code of HARD_NO_GO_CODES) {
    if (codes.has(code)) reasonCodes.push(code);
  }

  return {
    primarySource: reasonCodes.length === 0 ? 'CANONICAL_PRIMARY_CANDIDATE' : 'LEGACY_FALLBACK',
    reasonCodes: [...new Set(reasonCodes)].sort(),
  };
}

function expectLegacyFallback(decision: GuardedPilotDecision, expectedReason: string): void {
  expect(decision.primarySource).toBe('LEGACY_FALLBACK');
  expect(decision.reasonCodes).toContain(expectedReason);
}

describe('guarded primary cutover minimal evidence pack', () => {
  it('eligible normal principal-only evidence can be classified as canonical primary candidate when the flag is on', async () => {
    const report = await compare();
    const decision = guardedPilotDecision(report, { featureFlagEnabled: true });

    expect(decision).toEqual({
      primarySource: 'CANONICAL_PRIMARY_CANDIDATE',
      reasonCodes: [],
    });
    expect(report.provenance.finalDebtStatesAvailable).toBe(true);
    expect(report.provenance.claimItemCollectedAmountUsedAsAuthority).toBe(false);
    expect(report.bucketDiffs.find((diff) => diff.bucket === 'PRINCIPAL')).toMatchObject({
      canonicalAmount: 750,
      canonicalDisplayable: true,
      status: 'MATCH',
      classification: 'EXACT_MATCH',
    });
  });

  it('feature flag off keeps legacy primary even for otherwise eligible evidence', async () => {
    const report = await compare();

    expectLegacyFallback(guardedPilotDecision(report, { featureFlagEnabled: false }), 'FEATURE_FLAG_OFF');
  });

  it('missing finalDebtStates falls back and does not fabricate principal authority', async () => {
    const report = await compare(legacySummary(), canonicalWithoutFinalDebtStates());

    expectLegacyFallback(guardedPilotDecision(report), 'FINAL_DEBT_STATES_MISSING');
    expectLegacyFallback(guardedPilotDecision(report), 'FINAL_DEBT_STATES_REQUIRED');
    expect(report.bucketDiffs.find((diff) => diff.bucket === 'PRINCIPAL')).toMatchObject({
      canonicalAmount: null,
      canonicalDisplayable: false,
      classification: 'MISSING_CANONICAL_FIELD',
    });
  });

  it('finalDebtStates currency mismatch falls back and leaves principal unavailable', async () => {
    const report = await compare(legacySummary(), canonicalWithFinalDebtCurrencyMismatch());

    expectLegacyFallback(guardedPilotDecision(report), 'FINAL_DEBT_STATES_CURRENCY_MISMATCH');
    expect(report.bucketDiffs.find((diff) => diff.bucket === 'PRINCIPAL')).toMatchObject({
      canonicalAmount: null,
      canonicalDisplayable: false,
    });
  });

  it('currency mismatch is non-comparable and never produces amount deltas', async () => {
    const report = await compare(legacySummary({ currency: 'USD' }), canonicalBalance());

    expectLegacyFallback(guardedPilotDecision(report), 'CURRENCY_MISMATCH');
    expectLegacyFallback(guardedPilotDecision(report), 'NOT_COMPARABLE');
    for (const diff of [...report.totals.diffs, ...report.bucketDiffs]) {
      expect(diff).toMatchObject({
        status: 'NOT_COMPARABLE',
        legacyAmount: null,
        canonicalAmount: null,
        delta: null,
        deltaPercent: null,
      });
    }
  });

  it('tenant/case context mismatch is non-comparable and falls back to legacy', async () => {
    const report = await compare(legacySummary({ tenantId: 'tenant-x', caseId: 'case-x' }), canonicalBalance());

    expectLegacyFallback(guardedPilotDecision(report), 'CONTEXT_MISMATCH');
    expectLegacyFallback(guardedPilotDecision(report), 'NOT_COMPARABLE');
    expect(report.comparability).toMatchObject({
      comparable: false,
      classification: 'CONTEXT_MISMATCH',
      severity: 'RED',
    });
  });

  it('ClaimItem collected/remaining contamination is fallback-only and never display authority', async () => {
    const report = await compare();
    const decision = guardedPilotDecision(report, { claimItemAuthorityContaminated: true });

    expectLegacyFallback(decision, 'CLAIM_ITEM_AUTHORITY_CONTAMINATION');
    expect(report.provenance.claimItemCollectedAmountUsedAsAuthority).toBe(false);
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY',
        classification: 'LEGACY_AUTHORITY_RISK',
      }),
    ]));
  });

  it('HELD overpayment is separate evidence and does not reduce outstanding debt', async () => {
    const report = await compare(legacySummary(), canonicalWithHeldOverpayment());

    expect(report.totals.canonical).toMatchObject({
      outstandingAmount: 975,
      heldOverpaymentAmount: 80,
    });
    expect(report.bucketDiffs.find((diff) => diff.bucket === 'HELD_OVERPAYMENT')).toMatchObject({
      canonicalAmount: 80,
      canonicalDisplayable: true,
      status: 'CANONICAL_ONLY',
    });
  });

  it('OVERPAYMENT_BLOCKED and restricted payment evidence fall back without creating display overpayment authority', async () => {
    const report = await compare(legacySummary(), canonicalWithBlockedRestrictedPayment());
    const decision = guardedPilotDecision(report, { paymentDesignationRequired: true });

    expectLegacyFallback(decision, 'OVERPAYMENT_BLOCKED');
    expectLegacyFallback(decision, 'RESTRICTED_PAYMENT_DISPLAY_UNSAFE');
    expectLegacyFallback(decision, 'PAYMENT_DESIGNATION_REQUIRED');
    expect(report.totals.canonical).not.toHaveProperty('blockedOverpaymentAmount');
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'OVERPAYMENT_BLOCKED' }),
      expect.objectContaining({ code: 'RESTRICTED_PAYMENT_DISPLAY_UNSAFE' }),
    ]));
  });

  it('unsupported periodic nafaka/kira scope remains outside guarded primary pilot', async () => {
    const report = await compare();

    expectLegacyFallback(
      guardedPilotDecision(report, { unsupportedPeriodicObligation: true }),
      'UNSUPPORTED_PERIODIC_OBLIGATION',
    );
  });

  it('shadow or canonical source failure falls back to legacy primary', async () => {
    const canonicalFailure = await compare(legacySummary(), new Error('engine down'));
    const legacyFailure = await compare(new Error('legacy down'), canonicalBalance());

    expectLegacyFallback(guardedPilotDecision(canonicalFailure), 'SHADOW_OR_CANONICAL_SOURCE_FAILURE');
    expectLegacyFallback(guardedPilotDecision(legacyFailure), 'SHADOW_OR_CANONICAL_SOURCE_FAILURE');
  });

  it('feature flag on with a hard no-go diagnostic still falls back to legacy', async () => {
    const report = await compare(legacySummary(), canonicalWithoutFinalDebtStates());

    expectLegacyFallback(
      guardedPilotDecision(report, { featureFlagEnabled: true }),
      'FINAL_DEBT_STATES_MISSING',
    );
  });

  it('unsupported first-pilot scenarios do not become canonical primary candidates by absence of blockers alone', async () => {
    const report = await compare();

    expectLegacyFallback(
      guardedPilotDecision(report, { scenarioSupported: false }),
      'UNSUPPORTED_SCENARIO',
    );
  });
});
