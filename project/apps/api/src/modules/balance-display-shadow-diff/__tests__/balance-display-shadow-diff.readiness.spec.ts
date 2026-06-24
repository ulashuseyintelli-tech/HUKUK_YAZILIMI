import { BalanceDisplayShadowDiffService } from '../balance-display-shadow-diff.service';
import type {
  BalanceDisplayShadowDiffReport,
  ShadowDiffIssue,
} from '../balance-display-shadow-diff.types';
import type { CaseService } from '../../case/case.service';
import type { CaseBalanceService, CaseBalanceResult } from '../../interest-engine/orchestration/case-balance.service';
import { AncillaryType } from '../../interest-engine/types/domain.types';

type ReadinessClassification =
  | 'READY_FOR_CUTOVER'
  | 'EXPECTED_CANONICAL_DIFF'
  | 'LEGACY_AUTHORITY_RISK'
  | 'CANONICAL_BLOCKER'
  | 'MISSING_DATA'
  | 'UNSUPPORTED_SCENARIO';

interface ReadinessScenario {
  id: string;
  label: string;
  classification: ReadinessClassification;
  evidence: string;
}

const GENERATED_AT = '2026-06-24T10:00:00.000Z';

const REPRESENTATIVE_MATRIX: ReadinessScenario[] = [
  {
    id: 'normal-single-currency-principal',
    label: 'Normal single-currency principal claim',
    classification: 'CANONICAL_BLOCKER',
    evidence: 'FINAL_DEBT_STATES_MISSING blocks standalone principal authority.',
  },
  {
    id: 'interest-bearing-file',
    label: 'Interest-bearing file',
    classification: 'LEGACY_AUTHORITY_RISK',
    evidence: 'Legacy interest can be stub/empty while canonical accrued interest is separate.',
  },
  {
    id: 'expense-attorney-fee',
    label: 'Expense and attorney fee projection',
    classification: 'EXPECTED_CANONICAL_DIFF',
    evidence: 'Legacy summary and canonical case-level projections are different authorities.',
  },
  {
    id: 'held-overpayment',
    label: 'HELD overpayment',
    classification: 'EXPECTED_CANONICAL_DIFF',
    evidence: 'HELD overpayment is evidence, not outstanding debt reduction.',
  },
  {
    id: 'blocked-overpayment',
    label: 'Blocked/restricted overpayment',
    classification: 'CANONICAL_BLOCKER',
    evidence: 'OVERPAYMENT_BLOCKED and restricted payment diagnostics block primary cutover.',
  },
  {
    id: 'nafaka-periodic-due',
    label: 'Nafaka periodic due',
    classification: 'LEGACY_AUTHORITY_RISK',
    evidence: 'NAFAKA must not be blind PRINCIPAL materialization.',
  },
  {
    id: 'legacy-principal-nafaka',
    label: 'Legacy wrong PRINCIPAL nafaka row',
    classification: 'LEGACY_AUTHORITY_RISK',
    evidence: 'Scheduler avoids duplicate due; remediation remains separate.',
  },
  {
    id: 'reversal',
    label: 'Reversal',
    classification: 'MISSING_DATA',
    evidence: 'Collection reversal tests exist, but no dedicated shadow evidence row yet.',
  },
  {
    id: 'currency-mismatch',
    label: 'Currency mismatch',
    classification: 'CANONICAL_BLOCKER',
    evidence: 'Currency mismatch blocks amount comparison.',
  },
  {
    id: 'final-debt-states-missing',
    label: 'finalDebtStates missing',
    classification: 'CANONICAL_BLOCKER',
    evidence: 'Principal/outstanding breakdown cannot be invented without finalDebtStates.',
  },
  {
    id: 'claim-item-collected-authority-risk',
    label: 'ClaimItem collectedAmount authority risk',
    classification: 'LEGACY_AUTHORITY_RISK',
    evidence: 'ClaimItem collected projection must not become legal balance authority.',
  },
  {
    id: 'tenant-case-mismatch',
    label: 'Tenant/case mismatch',
    classification: 'CANONICAL_BLOCKER',
    evidence: 'Multitenant context mismatch is a hard no-go.',
  },
  {
    id: 'general-ilamsiz',
    label: 'General ilamsiz',
    classification: 'MISSING_DATA',
    evidence: 'Only generic principal-style evidence exists; needs named scenario evidence.',
  },
  {
    id: 'kambiyo',
    label: 'Kambiyo',
    classification: 'UNSUPPORTED_SCENARIO',
    evidence: 'No dedicated shadow evidence fixture.',
  },
  {
    id: 'kira',
    label: 'Kira',
    classification: 'UNSUPPORTED_SCENARIO',
    evidence: 'Rent/periodic semantics need separate evidence.',
  },
  {
    id: 'ilam',
    label: 'Ilam',
    classification: 'UNSUPPORTED_SCENARIO',
    evidence: 'Judgment-based debt needs separate evidence.',
  },
  {
    id: 'fatura',
    label: 'Fatura',
    classification: 'UNSUPPORTED_SCENARIO',
    evidence: 'Invoice document evidence must not become payment target authority.',
  },
  {
    id: 'ipotek-rehin',
    label: 'Ipotek / rehin',
    classification: 'UNSUPPORTED_SCENARIO',
    evidence: 'Collateral is not balance authority; no dedicated evidence fixture.',
  },
];

function legacySummary(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'tenant-1',
    caseId: 'case-1',
    hesapTarihi: '2026-06-24',
    takipTarihi: '2026-01-01',
    kalemTuru: 'PRINCIPAL',
    asilAlacak: 1000,
    takipOncesiFaiz: 0,
    takipSonrasiFaiz: 0,
    faizSegmentleri: { takipOncesi: [], takipSonrasi: [] },
    toplamBorc: 1300,
    sonBorc: 1350,
    toplamTahsilat: 100,
    kalanBorc: 1250,
    icraMasraflari: 50,
    vekaletUcreti: 150,
    pesinHarcHaricTahsilHarci: 25,
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
          totalDue: 900,
          totalInterest: 25,
          allocations: [{ paymentId: 'pay-1', paymentAmount: 100 }],
          segments: [{ id: 'seg-1' }],
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

function canonicalWithOverpaymentBlock(): CaseBalanceResult {
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

function issueCodes(report: BalanceDisplayShadowDiffReport): Set<string> {
  return new Set([
    ...report.diagnostics.map((diagnostic) => diagnostic.code),
    ...report.comparability.blockers.map((blocker) => blocker.code),
    ...report.comparability.warnings.map((warning) => warning.code),
    ...report.cutoverReadiness.blockers,
  ]);
}

function hasLegacyRisk(issue: ShadowDiffIssue): boolean {
  return (
    issue.classification === 'LEGACY_AUTHORITY_RISK' ||
    issue.code === 'LEGACY_INTEREST_STUB_OR_EMPTY' ||
    issue.code === 'CANONICAL_SHADOW_PRESENT_NOT_USED_AS_SOURCE' ||
    issue.code === 'CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY' ||
    issue.code === 'NAFAKA_PRINCIPAL_DISPLAY_RISK'
  );
}

function classifyReadiness(report: BalanceDisplayShadowDiffReport): ReadinessClassification {
  const codes = issueCodes(report);
  if (!report.sources.legacyCalculationSummary.available || !report.sources.canonicalBalanceDisplay.available) {
    return 'MISSING_DATA';
  }
  if (
    codes.has('CURRENCY_MISMATCH') ||
    codes.has('CONTEXT_MISMATCH') ||
    codes.has('CANONICAL_DISPLAY_UNAVAILABLE') ||
    codes.has('CANONICAL_DISPLAY_STATUS_UNAVAILABLE') ||
    codes.has('CANONICAL_UNSAFE_FOR_PRIMARY_DISPLAY') ||
    codes.has('FINAL_DEBT_STATES_MISSING') ||
    codes.has('FINAL_DEBT_STATES_CURRENCY_MISMATCH') ||
    codes.has('OVERPAYMENT_BLOCKED') ||
    codes.has('RESTRICTED_PAYMENT_DISPLAY_UNSAFE')
  ) {
    return 'CANONICAL_BLOCKER';
  }
  if (report.diagnostics.some(hasLegacyRisk)) {
    return 'LEGACY_AUTHORITY_RISK';
  }
  if (
    report.totals.diffs.some((diff) => diff.status !== 'MATCH') ||
    report.bucketDiffs.some((diff) => diff.status !== 'MATCH')
  ) {
    return 'EXPECTED_CANONICAL_DIFF';
  }
  return report.cutoverReadiness.safeForPrimaryDisplay ? 'READY_FOR_CUTOVER' : 'CANONICAL_BLOCKER';
}

describe('BalanceDisplayShadowDiff readiness audit matrix', () => {
  it('temsilci senaryo matrisini Faz 3E siniflandirmalariyla sabitler', () => {
    expect(REPRESENTATIVE_MATRIX).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'normal-single-currency-principal', classification: 'CANONICAL_BLOCKER' }),
        expect.objectContaining({ id: 'held-overpayment', classification: 'EXPECTED_CANONICAL_DIFF' }),
        expect.objectContaining({ id: 'blocked-overpayment', classification: 'CANONICAL_BLOCKER' }),
        expect.objectContaining({ id: 'nafaka-periodic-due', classification: 'LEGACY_AUTHORITY_RISK' }),
        expect.objectContaining({ id: 'reversal', classification: 'MISSING_DATA' }),
        expect.objectContaining({ id: 'currency-mismatch', classification: 'CANONICAL_BLOCKER' }),
        expect.objectContaining({ id: 'final-debt-states-missing', classification: 'CANONICAL_BLOCKER' }),
        expect.objectContaining({ id: 'claim-item-collected-authority-risk', classification: 'LEGACY_AUTHORITY_RISK' }),
        expect.objectContaining({ id: 'kira', classification: 'UNSUPPORTED_SCENARIO' }),
        expect.objectContaining({ id: 'ipotek-rehin', classification: 'UNSUPPORTED_SCENARIO' }),
      ]),
    );
    expect(REPRESENTATIVE_MATRIX.some((scenario) => scenario.classification === 'READY_FOR_CUTOVER')).toBe(false);
  });

  it('mevcut normal shadow evidence finalDebtStates eksigi nedeniyle primary cutover icin no-go kalir', async () => {
    const { service } = makeService();

    const report = await service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);

    expect(classifyReadiness(report)).toBe('CANONICAL_BLOCKER');
    expect(report.cutoverReadiness.safeForPrimaryDisplay).toBe(false);
    expect(report.cutoverReadiness.blockers).toContain('FINAL_DEBT_STATES_MISSING');
    expect(issueCodes(report)).toContain('CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY');
  });

  it('CB-01 finalDebtStates authority geldiyse finalDebtStates blocker kapanir ama primary cutover otomatik onaylanmaz', async () => {
    const { service } = makeService(
      legacySummary({ asilAlacak: 750 }),
      canonicalBalance({
        currencyResults: [
          {
            currency: 'TRY',
            result: {
              engineVersion: 'engine-v1',
              totalDue: 775,
              totalInterest: 25,
              allocations: [{ paymentId: 'pay-1', paymentAmount: 100 }],
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
        overpayments: { held: [], blocked: [] },
      }),
    );

    const report = await service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);

    expect(issueCodes(report)).not.toContain('FINAL_DEBT_STATES_MISSING');
    expect(report.cutoverReadiness.blockers).not.toContain('FINAL_DEBT_STATES_MISSING');
    expect(report.provenance.finalDebtStatesAvailable).toBe(true);
    expect(classifyReadiness(report)).toBe('LEGACY_AUTHORITY_RISK');
    expect(report.cutoverReadiness.safeForPrimaryDisplay).toBe(false);
  });

  it('HELD overpayment canonical divergence olarak gorunur fakat borctan dusulmez', async () => {
    const { service } = makeService(
      legacySummary(),
      canonicalBalance({
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
      } as Partial<CaseBalanceResult>),
    );

    const report = await service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);

    expect(report.totals.canonical).toMatchObject({
      heldOverpaymentAmount: 80,
      outstandingAmount: 1100,
    });
    expect(report.bucketDiffs.find((diff) => diff.bucket === 'HELD_OVERPAYMENT')).toMatchObject({
      classification: 'EXPECTED_CANONICAL_DIVERGENCE',
      status: 'CANONICAL_ONLY',
    });
    expect(report.totals.canonical).not.toHaveProperty('blockedOverpaymentAmount');
  });

  it('OVERPAYMENT_BLOCKED ve restricted payment sinyali primary cutover blocker olarak kalir', async () => {
    const { service } = makeService(legacySummary(), canonicalWithOverpaymentBlock());

    const report = await service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);

    expect(classifyReadiness(report)).toBe('CANONICAL_BLOCKER');
    expect(report.cutoverReadiness.blockers).toEqual(
      expect.arrayContaining(['FINAL_DEBT_STATES_MISSING', 'OVERPAYMENT_BLOCKED']),
    );
    expect(issueCodes(report)).toContain('RESTRICTED_PAYMENT_DISPLAY_UNSAFE');
  });

  it('legacy veya canonical source uretilemezse readiness MISSING_DATA olur', async () => {
    const missingLegacy = makeService(new Error('legacy missing'), canonicalBalance());
    const missingCanonical = makeService(legacySummary(), new Error('engine down'));

    const legacyReport = await missingLegacy.service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);
    const canonicalReport = await missingCanonical.service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);

    expect(classifyReadiness(legacyReport)).toBe('MISSING_DATA');
    expect(classifyReadiness(canonicalReport)).toBe('MISSING_DATA');
  });

  it('currency ve tenant/case mismatch amount diff yerine canonical blocker olarak siniflanir', async () => {
    const currencyMismatch = makeService(legacySummary({ currency: 'USD' }), canonicalBalance());
    const contextMismatch = makeService(legacySummary({ tenantId: 'tenant-x', caseId: 'case-x' }), canonicalBalance());
    const canonicalCurrencyUnsafe = makeService(
      legacySummary({ currency: 'TRY' }),
      canonicalBalance({
        currencyResults: [
          {
            currency: 'TRY',
            result: {
              engineVersion: 'engine-v1',
              totalDue: 900,
              totalInterest: 25,
              allocations: [{ paymentId: 'pay-1', paymentAmount: 100 }],
              segments: [{ id: 'seg-1' }],
            } as any,
          },
          {
            currency: 'USD',
            result: {
              engineVersion: 'engine-v1',
              totalDue: 50,
              totalInterest: 5,
              allocations: [],
              segments: [{ id: 'seg-usd' }],
            } as any,
          },
        ],
      }),
    );
    const canonicalCurrencyUnknown = makeService(
      legacySummary({ currency: 'TRY' }),
      canonicalBalance({ currencyResults: [] }),
    );

    const currencyReport = await currencyMismatch.service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);
    const contextReport = await contextMismatch.service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);
    const canonicalCurrencyReport = await canonicalCurrencyUnsafe.service.compare(
      'tenant-1',
      'case-1',
      '2026-06-24',
      GENERATED_AT,
    );
    const canonicalCurrencyUnknownReport = await canonicalCurrencyUnknown.service.compare(
      'tenant-1',
      'case-1',
      '2026-06-24',
      GENERATED_AT,
    );

    expect(classifyReadiness(currencyReport)).toBe('CANONICAL_BLOCKER');
    expect(classifyReadiness(contextReport)).toBe('CANONICAL_BLOCKER');
    expect(classifyReadiness(canonicalCurrencyReport)).toBe('CANONICAL_BLOCKER');
    expect(classifyReadiness(canonicalCurrencyUnknownReport)).toBe('CANONICAL_BLOCKER');
    expect(currencyReport.totals.diffs).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'NOT_COMPARABLE', delta: null, classification: 'CURRENCY_MISMATCH' }),
    ]));
    expect(contextReport.bucketDiffs).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'NOT_COMPARABLE', classification: 'CONTEXT_MISMATCH' }),
    ]));
    for (const diff of [...currencyReport.totals.diffs, ...currencyReport.bucketDiffs]) {
      expect(diff).toMatchObject({
        classification: 'CURRENCY_MISMATCH',
        status: 'NOT_COMPARABLE',
        legacyAmount: null,
        canonicalAmount: null,
        delta: null,
        deltaPercent: null,
      });
    }
    for (const diff of [...contextReport.totals.diffs, ...contextReport.bucketDiffs]) {
      expect(diff).toMatchObject({
        classification: 'CONTEXT_MISMATCH',
        status: 'NOT_COMPARABLE',
        legacyAmount: null,
        canonicalAmount: null,
        delta: null,
        deltaPercent: null,
      });
    }
    expect(currencyReport.cutoverReadiness.safeForPrimaryDisplay).toBe(false);
    expect(currencyReport.cutoverReadiness.safeForOptInShadow).toBe(false);
    expect(currencyReport.cutoverReadiness.blockers).toContain('CURRENCY_MISMATCH');
    expect(contextReport.cutoverReadiness.safeForPrimaryDisplay).toBe(false);
    expect(contextReport.cutoverReadiness.safeForOptInShadow).toBe(false);
    expect(contextReport.cutoverReadiness.blockers).toContain('CONTEXT_MISMATCH');
    for (const diff of [...canonicalCurrencyReport.totals.diffs, ...canonicalCurrencyReport.bucketDiffs]) {
      expect(diff).toMatchObject({
        classification: 'CANONICAL_UNSAFE',
        status: 'NOT_COMPARABLE',
        legacyAmount: null,
        canonicalAmount: null,
        delta: null,
        deltaPercent: null,
      });
    }
    expect(canonicalCurrencyReport.cutoverReadiness.safeForPrimaryDisplay).toBe(false);
    expect(canonicalCurrencyReport.cutoverReadiness.safeForOptInShadow).toBe(false);
    expect(canonicalCurrencyReport.cutoverReadiness.blockers).toContain('CANONICAL_CURRENCY_UNSAFE');
    for (const diff of [...canonicalCurrencyUnknownReport.totals.diffs, ...canonicalCurrencyUnknownReport.bucketDiffs]) {
      expect(diff).toMatchObject({
        classification: 'CANONICAL_UNSAFE',
        status: 'NOT_COMPARABLE',
        legacyAmount: null,
        canonicalAmount: null,
        delta: null,
        deltaPercent: null,
      });
    }
    expect(canonicalCurrencyUnknownReport.currency).toBe('UNKNOWN');
    expect(canonicalCurrencyUnknownReport.cutoverReadiness.safeForPrimaryDisplay).toBe(false);
    expect(canonicalCurrencyUnknownReport.cutoverReadiness.safeForOptInShadow).toBe(false);
    expect(canonicalCurrencyUnknownReport.cutoverReadiness.blockers).toContain('CANONICAL_CURRENCY_UNSAFE');
  });

  it('go/no-go sonucu kanit olmadan READY_FOR_CUTOVER uretmez', async () => {
    const reports = await Promise.all([
      makeService().service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT),
      makeService(legacySummary({ kalemTuru: 'NAFAKA', asilAlacak: 750 })).service.compare(
        'tenant-1',
        'case-1',
        '2026-06-24',
        GENERATED_AT,
      ),
      makeService(legacySummary({ currency: 'USD' })).service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT),
      makeService(legacySummary(), canonicalWithOverpaymentBlock()).service.compare(
        'tenant-1',
        'case-1',
        '2026-06-24',
        GENERATED_AT,
      ),
    ]);

    expect(reports.map(classifyReadiness)).not.toContain('READY_FOR_CUTOVER');
    for (const report of reports) {
      expect(report.mode).toBe('SHADOW_ONLY');
      expect(report.primaryDisplayUnchanged).toBe(true);
    }
  });
});
