import type {
  RepresentativeCorpusBucketSeed,
  RepresentativeCorpusScenarioSeed,
} from './contracts';

function bucket(
  componentType: RepresentativeCorpusBucketSeed['componentType'],
  componentCode: string,
  balanceMinor: string,
  priorityRank: number,
  options: {
    readonly legalBasisRef?: string;
    readonly effectivePeriodRef?: string;
    readonly interestRuleRef?: string;
  } = {},
): RepresentativeCorpusBucketSeed {
  return Object.freeze({
    componentType,
    componentCode,
    balanceMinor,
    priorityRank,
    legalBasisRef: options.legalBasisRef ?? 'TBK-100',
    effectivePeriodRef: options.effectivePeriodRef ?? '2026-07',
    ...(options.interestRuleRef === undefined
      ? {}
      : { interestRuleRef: options.interestRuleRef }),
  });
}

type ScenarioDefaultField =
  | 'tenantId'
  | 'caseId'
  | 'currency'
  | 'minorUnit'
  | 'snapshotAsOfDate'
  | 'applicationEffectiveDate'
  | 'historyBoundaryRef'
  | 'envelopeMode'
  | 'expectedOutcome'
  | 'futureObligation';

const BASE: Readonly<Pick<RepresentativeCorpusScenarioSeed, ScenarioDefaultField>> =
  Object.freeze({
  tenantId: 'tenant-representative-01',
  caseId: 'case-representative-01',
  currency: 'TRY',
  minorUnit: 2,
  snapshotAsOfDate: '2026-07-31',
  applicationEffectiveDate: '2026-07-31',
  historyBoundaryRef: 'history:rcv-representative:v1',
  envelopeMode: 'CANONICAL',
  expectedOutcome: 'PLAN',
  futureObligation: 'NONE',
  });

function scenario(
  input: Omit<RepresentativeCorpusScenarioSeed, ScenarioDefaultField> &
    Partial<Pick<RepresentativeCorpusScenarioSeed, ScenarioDefaultField>>,
): RepresentativeCorpusScenarioSeed {
  return Object.freeze({
    ...BASE,
    ...input,
    sources: Object.freeze(input.sources.map((source) => Object.freeze({ ...source }))),
    buckets: Object.freeze(input.buckets),
  });
}

export const REPRESENTATIVE_CORPUS_SCENARIOS: readonly RepresentativeCorpusScenarioSeed[] =
  Object.freeze([
    scenario({
      scenarioId: '01-single-principal',
      title: 'Single principal bucket',
      purpose: 'Applies an incoming receipt to one principal bucket only.',
      collectionId: 'collection-representative-01',
      receiptAmountMinor: '10000',
      sources: [{ sourceReference: 'receivable:principal:01', sourceVersion: '1' }],
      buckets: [bucket('PRINCIPAL', 'PRINCIPAL_STANDARD', '15000', 40)],
    }),
    scenario({
      scenarioId: '02-principal-and-interest',
      title: 'Accrued interest precedes principal',
      purpose: 'Locks TBK100 component ordering before principal application.',
      collectionId: 'collection-representative-02',
      receiptAmountMinor: '8000',
      sources: [{ sourceReference: 'receivable:mixed:02', sourceVersion: '1' }],
      buckets: [
        bucket('PRINCIPAL', 'PRINCIPAL_STANDARD', '10000', 40),
        bucket('ACCRUED_INTEREST', 'INTEREST_DEFAULT', '2500', 30, {
          interestRuleRef: 'interest-rule:v1',
        }),
      ],
    }),
    scenario({
      scenarioId: '03-principal-and-cost',
      title: 'Cost precedes principal',
      purpose: 'Locks legal cost application before principal.',
      collectionId: 'collection-representative-03',
      receiptAmountMinor: '5000',
      sources: [{ sourceReference: 'receivable:mixed:03', sourceVersion: '1' }],
      buckets: [
        bucket('PRINCIPAL', 'PRINCIPAL_STANDARD', '10000', 40),
        bucket('COST', 'LEGAL_COST', '1500', 10),
      ],
    }),
    scenario({
      scenarioId: '04-all-components',
      title: 'All canonical legal components',
      purpose: 'Locks COST, ANCILLARY, ACCRUED_INTEREST, PRINCIPAL ordering.',
      collectionId: 'collection-representative-04',
      receiptAmountMinor: '6000',
      sources: [{ sourceReference: 'receivable:all:04', sourceVersion: '1' }],
      buckets: [
        bucket('PRINCIPAL', 'PRINCIPAL_STANDARD', '10000', 40),
        bucket('ACCRUED_INTEREST', 'INTEREST_DEFAULT', '2000', 30, {
          interestRuleRef: 'interest-rule:v1',
        }),
        bucket('ANCILLARY', 'ANCILLARY_STANDARD', '500', 20),
        bucket('COST', 'LEGAL_COST', '1000', 10),
      ],
    }),
    scenario({
      scenarioId: '05-partial-application',
      title: 'Partial bucket application',
      purpose: 'Preserves an exact remaining bucket balance after partial application.',
      collectionId: 'collection-representative-05',
      receiptAmountMinor: '3000',
      sources: [{ sourceReference: 'receivable:principal:05', sourceVersion: '1' }],
      buckets: [bucket('PRINCIPAL', 'PRINCIPAL_STANDARD', '10000', 40)],
    }),
    scenario({
      scenarioId: '06-exact-application',
      title: 'Exact receipt exhaustion',
      purpose: 'Applies the exact receipt with zero HELD remainder.',
      collectionId: 'collection-representative-06',
      receiptAmountMinor: '10000',
      sources: [{ sourceReference: 'receivable:exact:06', sourceVersion: '1' }],
      buckets: [
        bucket('PRINCIPAL', 'PRINCIPAL_STANDARD', '7000', 40),
        bucket('ACCRUED_INTEREST', 'INTEREST_DEFAULT', '2000', 30, {
          interestRuleRef: 'interest-rule:v1',
        }),
        bucket('COST', 'LEGAL_COST', '1000', 10),
      ],
    }),
    scenario({
      scenarioId: '07-overpayment-held',
      title: 'Excess receipt is held',
      purpose: 'Separates application from the excess HELD remainder.',
      collectionId: 'collection-representative-07',
      receiptAmountMinor: '8000',
      sources: [{ sourceReference: 'receivable:overpayment:07', sourceVersion: '1' }],
      buckets: [
        bucket('COST', 'LEGAL_COST', '1000', 10),
        bucket('PRINCIPAL', 'PRINCIPAL_STANDARD', '4000', 40),
      ],
    }),
    scenario({
      scenarioId: '08-full-held',
      title: 'No eligible outstanding balance',
      purpose: 'Produces a full HELD result without inventing a target.',
      collectionId: 'collection-representative-08',
      receiptAmountMinor: '2500',
      sources: [{ sourceReference: 'receivable:zero:08', sourceVersion: '1' }],
      buckets: [
        bucket('COST', 'LEGAL_COST', '0', 10),
        bucket('PRINCIPAL', 'PRINCIPAL_STANDARD', '0', 40),
      ],
    }),
    scenario({
      scenarioId: '09-multiple-receipts-history',
      title: 'Multiple prior receipt history',
      purpose: 'Carries an explicit multi-source history boundary into one receipt plan.',
      collectionId: 'collection-representative-09',
      receiptAmountMinor: '3000',
      historyBoundaryRef: 'history:multiple-receipts:v1',
      sources: [
        { sourceReference: 'receivable:principal:09', sourceVersion: '4' },
        { sourceReference: 'collection:prior:09-a', sourceVersion: '2' },
        { sourceReference: 'collection:prior:09-b', sourceVersion: '1' },
      ],
      buckets: [
        bucket('COST', 'LEGAL_COST', '500', 10),
        bucket('PRINCIPAL', 'PRINCIPAL_STANDARD', '9500', 40),
      ],
    }),
    scenario({
      scenarioId: '10-same-day-history',
      title: 'Same-day legal history',
      purpose: 'Pins deterministic application with multiple same-day source versions.',
      collectionId: 'collection-representative-10',
      receiptAmountMinor: '2000',
      historyBoundaryRef: 'history:same-day:v1',
      sources: [
        { sourceReference: 'receivable:same-day:10-a', sourceVersion: '2026-07-31T01' },
        { sourceReference: 'receivable:same-day:10-b', sourceVersion: '2026-07-31T02' },
      ],
      buckets: [
        bucket('ACCRUED_INTEREST', 'INTEREST_DEFAULT', '1200', 30, {
          interestRuleRef: 'interest-rule:v1',
        }),
        bucket('PRINCIPAL', 'PRINCIPAL_STANDARD', '8800', 40),
      ],
    }),
    scenario({
      scenarioId: '11-mixed-history',
      title: 'Mixed legal history sources',
      purpose: 'Preserves a complete mixed source/version set without legacy targets.',
      collectionId: 'collection-representative-11',
      receiptAmountMinor: '2500',
      historyBoundaryRef: 'history:mixed:v1',
      sources: [
        { sourceReference: 'receivable:formation:11', sourceVersion: '3' },
        { sourceReference: 'receivable:interest:11', sourceVersion: '5' },
        { sourceReference: 'receivable:cost:11', sourceVersion: '2' },
      ],
      buckets: [
        bucket('PRINCIPAL', 'PRINCIPAL_STANDARD', '8500', 40),
        bucket('ACCRUED_INTEREST', 'INTEREST_DEFAULT', '700', 30, {
          interestRuleRef: 'interest-rule:v1',
        }),
        bucket('ANCILLARY', 'ANCILLARY_STANDARD', '300', 20),
        bucket('COST', 'LEGAL_COST', '500', 10),
      ],
    }),
    scenario({
      scenarioId: '12-full-reversal-expectation',
      title: 'Full reversal evidence prerequisite',
      purpose: 'Provides the immutable APPLY baseline that a later exact-inverse reversal must bind.',
      collectionId: 'collection-representative-12',
      receiptAmountMinor: '5000',
      sources: [{ sourceReference: 'receivable:reversal-base:12', sourceVersion: '1' }],
      buckets: [
        bucket('COST', 'LEGAL_COST', '1000', 10),
        bucket('PRINCIPAL', 'PRINCIPAL_STANDARD', '4000', 40),
      ],
      futureObligation: 'FULL_REVERSAL_EXACT_INVERSE_TPA04E',
    }),
    scenario({
      scenarioId: '13-currency-mismatch',
      title: 'Currency mismatch rejection',
      purpose: 'Rejects a command whose currency differs from the canonical snapshot.',
      collectionId: 'collection-representative-13',
      receiptAmountMinor: '1000',
      commandCurrency: 'USD',
      sources: [{ sourceReference: 'receivable:currency:13', sourceVersion: '1' }],
      buckets: [bucket('PRINCIPAL', 'PRINCIPAL_STANDARD', '5000', 40)],
      expectedOutcome: 'SNAPSHOT_REJECTION',
      expectedErrorCode: 'CURRENCY_OR_MINOR_UNIT_INVALID',
    }),
    scenario({
      scenarioId: '14-semantic-replay-expectation',
      title: 'Semantic replay expectation',
      purpose: 'Pins a deterministic plan for later same-key same-hash replay evidence.',
      collectionId: 'collection-representative-14',
      receiptAmountMinor: '1000',
      sources: [{ sourceReference: 'receivable:replay:14', sourceVersion: '1' }],
      buckets: [bucket('PRINCIPAL', 'PRINCIPAL_STANDARD', '5000', 40)],
      futureObligation: 'WRITER_REPLAY_NO_NEW_EFFECT_TPA04F',
    }),
    scenario({
      scenarioId: '15-semantic-conflict-expectation',
      title: 'Semantic conflict expectation',
      purpose: 'Pins the baseline whose same-key different-hash writer path must fail closed.',
      collectionId: 'collection-representative-15',
      receiptAmountMinor: '1000',
      sources: [{ sourceReference: 'receivable:conflict:15', sourceVersion: '1' }],
      buckets: [bucket('PRINCIPAL', 'PRINCIPAL_STANDARD', '5000', 40)],
      futureObligation: 'WRITER_SEMANTIC_CONFLICT_TPA04F',
    }),
    scenario({
      scenarioId: '16-concurrent-command-expectation',
      title: 'Concurrent command expectation',
      purpose: 'Pins the plan identity for later single-winner transaction evidence.',
      collectionId: 'collection-representative-16',
      receiptAmountMinor: '1000',
      sources: [{ sourceReference: 'receivable:concurrency:16', sourceVersion: '1' }],
      buckets: [bucket('PRINCIPAL', 'PRINCIPAL_STANDARD', '5000', 40)],
      futureObligation: 'WRITER_CONCURRENCY_SINGLE_WINNER_TPA04F',
    }),
    scenario({
      scenarioId: '17-rounding-boundary',
      title: 'Single minor-unit boundary',
      purpose: 'Proves exact integer-minor application without decimal rounding or a universal minorUnit.',
      collectionId: 'collection-representative-17',
      currency: 'CHF',
      minorUnit: 3,
      receiptAmountMinor: '1',
      sources: [{ sourceReference: 'receivable:minor-unit:17', sourceVersion: '1' }],
      buckets: [bucket('COST', 'LEGAL_COST', '1', 10)],
    }),
    scenario({
      scenarioId: '18-legacy-evidence-unknown',
      title: 'Legacy evidence is unknown',
      purpose: 'Rejects absent canonical evidence instead of guessing from legacy allocation state.',
      collectionId: 'collection-representative-18',
      receiptAmountMinor: '1000',
      sources: [{ sourceReference: 'receivable:legacy-unknown:18', sourceVersion: 'unknown' }],
      buckets: [bucket('PRINCIPAL', 'PRINCIPAL_STANDARD', '5000', 40)],
      envelopeMode: 'ABSENT',
      expectedOutcome: 'SNAPSHOT_REJECTION',
      expectedErrorCode: 'SNAPSHOT_UNAVAILABLE',
    }),
    scenario({
      scenarioId: '19-cross-tenant-rejection',
      title: 'Cross-tenant rejection',
      purpose: 'Rejects a command tenant that does not own the canonical snapshot.',
      collectionId: 'collection-representative-19',
      receiptAmountMinor: '1000',
      commandTenantId: 'tenant-representative-other',
      sources: [{ sourceReference: 'receivable:tenant:19', sourceVersion: '1' }],
      buckets: [bucket('PRINCIPAL', 'PRINCIPAL_STANDARD', '5000', 40)],
      expectedOutcome: 'SNAPSHOT_REJECTION',
      expectedErrorCode: 'TENANT_CONTEXT_MISMATCH',
    }),
  ]);
