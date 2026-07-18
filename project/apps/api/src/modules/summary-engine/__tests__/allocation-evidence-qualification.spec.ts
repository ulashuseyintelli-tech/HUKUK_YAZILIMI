import { AncillaryType, InterestTypeCode } from '../../interest-engine/types/domain.types';
import {
  AllocationEngineService,
  ClaimDebtState,
} from '../../interest-engine/allocation/allocation-engine.service';
import {
  ClaimPriorityRule,
  ClaimPriorityService,
} from '../../interest-engine/allocation/claim-priority.service';
import {
  DebtState,
  TBK100AllocatorService,
} from '../../interest-engine/allocation/tbk100-allocator.service';
import {
  classifyClaimItemType,
} from '../../interest-engine/classification/claim-item-classifier';
import {
  ALLOCATION_EVIDENCE_CONTRACT_VERSION,
  ALLOCATION_MIXED_HISTORY_EXPECTED_V1,
  ALLOCATION_MIXED_HISTORY_SCENARIOS_V1,
  ALLOCATION_PARITY_SCENARIOS_V1,
  AllocationEvidenceRecord,
  AllocationFrozenInputV1,
  buildAllocationEvidenceManifest,
  buildAllocationFrozenInputFingerprint,
  classifyFrozenAllocationParity,
  PAID_DELTA_EVIDENCE_BOUNDARY_V1,
  REPRESENTATIVE_ALLOCATION_EVIDENCE_V1,
} from '../allocation-evidence-qualification';
import { SummaryEngineService } from '../summary-engine.service';

interface FrozenClaimItem {
  id: string;
  itemType: string;
  demandedAmount: number;
  collectedAmount?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}

interface ParityScenario {
  id: string;
  payment: number;
  currency?: string;
  claims: FrozenClaimItem[];
}

const POSITIVE_SCENARIOS: ParityScenario[] = [
  {
    id: 'PM-01',
    payment: 100,
    claims: [{ id: 'p1', itemType: 'PRINCIPAL', demandedAmount: 100 }],
  },
  {
    id: 'PM-02',
    payment: 40,
    claims: [{ id: 'p1', itemType: 'PRINCIPAL', demandedAmount: 100 }],
  },
  {
    id: 'PM-03',
    payment: 75,
    claims: [
      { id: 'p1', itemType: 'PRINCIPAL', demandedAmount: 50 },
      { id: 'p2', itemType: 'PRINCIPAL', demandedAmount: 50 },
    ],
  },
  {
    id: 'PM-04',
    payment: 100,
    claims: [
      { id: 'cost', itemType: 'FEE', demandedAmount: 10 },
      { id: 'anc', itemType: 'ATTORNEY_FEE', demandedAmount: 20 },
      { id: 'interest', itemType: 'INTEREST', demandedAmount: 30 },
      { id: 'principal', itemType: 'PRINCIPAL', demandedAmount: 80 },
    ],
  },
  {
    id: 'PM-05',
    payment: 45,
    claims: [
      { id: 'cost', itemType: 'EXPENSE', demandedAmount: 10 },
      { id: 'anc', itemType: 'PENALTY', demandedAmount: 15 },
      { id: 'interest', itemType: 'INTEREST', demandedAmount: 20 },
      { id: 'principal', itemType: 'PRINCIPAL', demandedAmount: 50 },
    ],
  },
  {
    id: 'PM-06',
    payment: 25,
    claims: [
      {
        id: 'principal',
        itemType: 'PRINCIPAL',
        demandedAmount: 100,
        collectedAmount: 25,
      },
    ],
  },
  {
    id: 'PM-07',
    payment: 60,
    claims: [
      { id: 'p1', itemType: 'PRINCIPAL', demandedAmount: 40 },
      { id: 'p2', itemType: 'PRINCIPAL', demandedAmount: 40 },
    ],
  },
  {
    id: 'PM-08',
    payment: 35,
    claims: [
      { id: 'pre', itemType: 'PRE_INTEREST', demandedAmount: 15 },
      { id: 'post', itemType: 'POST_INTEREST', demandedAmount: 20 },
      { id: 'principal', itemType: 'PRINCIPAL', demandedAmount: 50 },
    ],
  },
  {
    id: 'PM-09',
    payment: 25,
    claims: [
      {
        id: 'principal',
        itemType: 'PRINCIPAL',
        demandedAmount: 100,
        collectedAmount: 60,
      },
    ],
  },
  {
    id: 'PM-10',
    payment: 150,
    claims: [{ id: 'principal', itemType: 'PRINCIPAL', demandedAmount: 100 }],
  },
  {
    id: 'PM-11',
    payment: 20,
    claims: [
      {
        id: 'tax',
        itemType: 'TAX_KDV',
        demandedAmount: 20,
        metadata: { taxParentCategory: 'PRINCIPAL' },
      },
    ],
  },
  {
    id: 'PM-12',
    payment: 20,
    claims: [
      {
        id: 'tax-cost',
        itemType: 'TAX_BSMV',
        demandedAmount: 20,
        metadata: { taxParentCategory: 'COST' },
      },
    ],
  },
  {
    id: 'PM-13',
    payment: 10.01,
    currency: 'EUR',
    claims: [{ id: 'principal', itemType: 'PRINCIPAL', demandedAmount: 10.01, currency: 'EUR' }],
  },
  {
    id: 'PM-14',
    payment: 30,
    currency: 'CHF',
    claims: [
      { id: 'interest', itemType: 'INTEREST', demandedAmount: 10, currency: 'CHF' },
      { id: 'principal', itemType: 'PRINCIPAL', demandedAmount: 20, currency: 'CHF' },
    ],
  },
  {
    id: 'PM-15',
    payment: 0.01,
    claims: [{ id: 'principal', itemType: 'PRINCIPAL', demandedAmount: 0.01 }],
  },
  {
    id: 'PM-16',
    payment: 0.03,
    claims: [
      { id: 'fee', itemType: 'FEE', demandedAmount: 0.01 },
      { id: 'interest', itemType: 'INTEREST', demandedAmount: 0.01 },
      { id: 'principal', itemType: 'PRINCIPAL', demandedAmount: 0.01 },
    ],
  },
];

describe('WS04-P02 allocation evidence qualification contract', () => {
  it('AllocationFrozenInputV1 aynı semantik input için deterministik SHA-256 üretir', () => {
    const first = frozenInput(POSITIVE_SCENARIOS[3]);
    const reordered = {
      ...first,
      payment: {
        ...first.payment,
        effectiveAt: '2026-07-18T12:00:00.000+03:00',
      },
      claimItems: [...first.claimItems].reverse(),
    };

    expect(buildAllocationFrozenInputFingerprint(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(buildAllocationFrozenInputFingerprint(reordered))
      .toBe(buildAllocationFrozenInputFingerprint(first));
  });

  it('eksik nullable alanı sessizce atmaz; explicit null zorunludur', () => {
    const input = frozenInput(POSITIVE_SCENARIOS[0]);
    delete (
      input.claimItems[0] as Partial<AllocationFrozenInputV1['claimItems'][number]>
    ).metadata;

    expect(() => buildAllocationFrozenInputFingerprint(input))
      .toThrow('ALLOCATION_FROZEN_INPUT_EXPLICIT_NULL_REQUIRED:metadata');
  });

  it.each(POSITIVE_SCENARIOS)(
    '$id frozen same-input üzerinde iki aktif allocator için cent-exact parity üretir',
    (scenario) => {
      const evidence = runParity(scenario);
      expect(evidence.comparison).toMatchObject({
        classification: 'EQUALITY',
        reason: 'CENT_EXACT_EQUALITY',
      });
    },
  );

  it.each([
    ['NEG-01', scenario('NEG-01', 10, [{ id: 'unknown', itemType: 'UNMAPPED', demandedAmount: 10 }]), 'UNMAPPED_CLAIM_ITEM_TYPE'],
    ['NEG-02', {
      ...scenario('NEG-02', 10, [{ id: 'p', itemType: 'PRINCIPAL', demandedAmount: 10 }]),
      currency: 'TRY',
      claims: [{ id: 'p', itemType: 'PRINCIPAL', demandedAmount: 10, currency: 'EUR' }],
    }, 'CURRENCY_CONTEXT_MISMATCH'],
    ['NEG-03', scenario('NEG-03', 0, [{ id: 'p', itemType: 'PRINCIPAL', demandedAmount: 10 }]), 'PAYMENT_NOT_POSITIVE'],
    ['NEG-04', scenario('NEG-04', -0.001, [{ id: 'p', itemType: 'PRINCIPAL', demandedAmount: 10 }]), 'PAYMENT_NOT_POSITIVE'],
  ])('%s invalid input sessiz NOT_COMPARABLE yerine deterministic rejection üretir', (
    _id,
    input,
    error,
  ) => {
    expect(() => validateScenario(input as ParityScenario)).toThrow(error);
  });

  it('PM-17 aynı fingerprint altında bir kuruş injected farkı FAIL_CLOSED_DRIFT yapar', () => {
    const scenario = POSITIVE_SCENARIOS[0];
    const input = frozenInput(scenario);
    const fingerprint = buildAllocationFrozenInputFingerprint(input);
    const result = classifyFrozenAllocationParity({
      tenantId: input.tenantId,
      caseId: input.caseId,
      currency: input.currency,
      canonical: {
        fingerprint,
        rows: [vectorRow('p1', 'PRINCIPAL', 1, 100)],
      },
      candidate: {
        fingerprint,
        rows: [vectorRow('p1', 'PRINCIPAL', 1, 99.99)],
      },
    });

    expect(result).toMatchObject({
      classification: 'FAIL_CLOSED_DRIFT',
      reason: 'SAME_INPUT_VALUE_DRIFT',
    });
  });

  it('PM-18 eksik fingerprint bağlamını expected-negative NOT_COMPARABLE yapar', () => {
    const input = frozenInput(POSITIVE_SCENARIOS[0]);
    const fingerprint = buildAllocationFrozenInputFingerprint(input);
    const result = classifyFrozenAllocationParity({
      tenantId: input.tenantId,
      caseId: input.caseId,
      currency: input.currency,
      canonical: {
        fingerprint,
        rows: [vectorRow('p1', 'PRINCIPAL', 1, 100)],
      },
      candidate: {
        fingerprint: null,
        rows: [vectorRow('p1', 'PRINCIPAL', 1, 100)],
      },
    });

    expect(result).toMatchObject({
      classification: 'NOT_COMPARABLE',
      reason: 'COMPARISON_CONTEXT_MISSING',
    });
  });

  it('PM-01..18 ve MH-01..11 evidence manifestte tekil ve checksum ile mühürlüdür', () => {
    const schemaIdentity = checksumFile('prisma/schema.prisma');
    const migrationIdentity = checksumDirectory('prisma/migrations');
    const qualificationChecksum = checksumFile(
      'src/modules/summary-engine/allocation-evidence-qualification.ts',
    );
    const parityEvidence = new Map(
      POSITIVE_SCENARIOS.map((scenario) => [scenario.id, runParity(scenario)]),
    );
    const records: AllocationEvidenceRecord[] = [
      ...ALLOCATION_PARITY_SCENARIOS_V1.map((id) => {
        const executed = parityEvidence.get(id);
        const expectedNegativeVector = [vectorRow('p1', 'PRINCIPAL', 1, 100)];
        return {
        taskId: 'RCV-P2-WS04-P02' as const,
        canonicalSourceSha: 'c7af91d2b1e8376bb29cdab24802a1fca23b5600',
        scenarioId: id,
        question: `parity:${id}`,
        evidenceClass: 'SYNTHETIC' as const,
        status: id === 'PM-17' || id === 'PM-18'
          ? 'EXPECTED_NEGATIVE' as const
          : 'PASS' as const,
        expectedClassification: id === 'PM-17'
          ? 'FAIL_CLOSED_DRIFT'
          : id === 'PM-18'
            ? 'NOT_COMPARABLE'
            : 'EQUALITY',
        actualClassification: id === 'PM-17'
          ? 'FAIL_CLOSED_DRIFT' as const
          : id === 'PM-18'
            ? 'NOT_COMPARABLE' as const
            : 'EQUALITY' as const,
        inputFingerprint: id === 'PM-18'
          ? null
          : executed?.fingerprint ?? 'a'.repeat(64),
        allocatorIdentities: [
          `summary-engine.service.ts#${checksumFile('src/modules/summary-engine/summary-engine.service.ts')}`,
          `allocation-engine.service.ts#${checksumFile('src/modules/interest-engine/allocation/allocation-engine.service.ts')}`,
        ],
        policyIdentity: 'TBK100/P0',
        schemaIdentity,
        migrationIdentity,
        canonicalVector: executed?.canonicalVector ?? expectedNegativeVector,
        candidateVector: executed?.candidateVector ?? (
          id === 'PM-17'
            ? [vectorRow('p1', 'PRINCIPAL', 1, 99.99)]
            : expectedNegativeVector
        ),
        provenance: {
          source: 'SYNTHETIC' as const,
          redactionStatus: 'NOT_REQUIRED_SYNTHETIC' as const,
        },
        artifactChecksums: [qualificationChecksum],
        executionAuthorization: 'AUTHORIZED' as const,
        evidence: ['allocation-evidence-qualification.spec.ts'],
      };
      }),
      ...ALLOCATION_MIXED_HISTORY_SCENARIOS_V1.map((id) => ({
        taskId: 'RCV-P2-WS04-P02' as const,
        canonicalSourceSha: 'c7af91d2b1e8376bb29cdab24802a1fca23b5600',
        scenarioId: id,
        question: `mixed-history:${id}`,
        evidenceClass: 'DISPOSABLE_POSTGRESQL' as const,
        status: 'PASS' as const,
        expectedClassification: ALLOCATION_MIXED_HISTORY_EXPECTED_V1[id],
        actualClassification: ALLOCATION_MIXED_HISTORY_EXPECTED_V1[id],
        inputFingerprint: 'b'.repeat(64),
        allocatorIdentities: ['LedgerAllocation', 'CollectionAllocation'],
        policyIdentity: 'DA-4/CA-1/CM-1',
        schemaIdentity,
        migrationIdentity,
        canonicalVector: [],
        candidateVector: [],
        provenance: {
          source: 'DISPOSABLE_POSTGRESQL' as const,
          redactionStatus: 'NOT_REQUIRED_SYNTHETIC' as const,
        },
        artifactChecksums: [qualificationChecksum],
        executionAuthorization: 'AUTHORIZED' as const,
        evidence: ['allocation-evidence-qualification.db-gated.integration.spec.ts'],
      })),
      {
        taskId: 'RCV-P2-WS04-P02',
        canonicalSourceSha: 'c7af91d2b1e8376bb29cdab24802a1fca23b5600',
        scenarioId: 'REP-01',
        question: REPRESENTATIVE_ALLOCATION_EVIDENCE_V1.questions[0],
        evidenceClass: 'REPRESENTATIVE',
        status: 'NOT_EXECUTED',
        expectedClassification: 'NOT_EXECUTED',
        actualClassification: 'OUT_OF_SCOPE',
        inputFingerprint: null,
        allocatorIdentities: [],
        policyIdentity: 'DA-4/CA-1/CM-1',
        schemaIdentity: 'NOT_EXECUTED',
        migrationIdentity: 'NOT_EXECUTED',
        canonicalVector: [],
        candidateVector: [],
        provenance: {
          source: 'REPRESENTATIVE',
          redactionStatus: 'NOT_EXECUTED',
        },
        artifactChecksums: [],
        executionAuthorization: 'NOT_AUTHORIZED',
        evidence: ['authorization=NOT_AUTHORIZED'],
      },
    ];
    const first = buildAllocationEvidenceManifest({
      generatedAt: '2026-07-18T12:00:00.000Z',
      repositorySha: 'c7af91d2b1e8376bb29cdab24802a1fca23b5600',
      records,
    });
    const second = buildAllocationEvidenceManifest({
      generatedAt: '2026-07-18T13:00:00.000Z',
      repositorySha: 'c7af91d2b1e8376bb29cdab24802a1fca23b5600',
      records: [...records].reverse(),
    });

    expect(first.records.map((record) => record.scenarioId)).toEqual(
      [...records].map((record) => record.scenarioId).sort(),
    );
    expect(first.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(second.checksum).toBe(first.checksum);
    expect(REPRESENTATIVE_ALLOCATION_EVIDENCE_V1).toMatchObject({
      status: 'NOT_EXECUTED',
      authorization: 'NOT_AUTHORIZED',
    });
  });

  it('PAID_DELTA gross receipt, allocation ve HELD factlerinden ayrı diagnostic kalır', () => {
    expect(PAID_DELTA_EVIDENCE_BOUNDARY_V1).toEqual({
      grossReceiptFact: 'Collection.amount',
      allocatedPaymentFact: 'SUM(CONFIRMED LedgerAllocation.amount)',
      heldFact: 'CollectionOverpayment.remainingAmount where status=HELD',
      paidDelta: 'DIAGNOSTIC_ONLY',
      allocatorDefectEvidence: false,
      act28EvidenceGap:
        'Representative gross/allocated/HELD distributions are NOT_EXECUTED / NOT_AUTHORIZED.',
    });
  });
});

function scenario(
  id: string,
  payment: number,
  claims: FrozenClaimItem[],
): ParityScenario {
  return { id, payment, claims };
}

function validateScenario(input: ParityScenario): void {
  if (input.payment <= 0) throw new Error('PAYMENT_NOT_POSITIVE');
  const currency = input.currency ?? 'TRY';
  for (const claim of input.claims) {
    if ((claim.currency ?? currency) !== currency) {
      throw new Error('CURRENCY_CONTEXT_MISMATCH');
    }
    if (!resolveComponent(claim)) {
      throw new Error('UNMAPPED_CLAIM_ITEM_TYPE');
    }
  }
}

function frozenInput(input: ParityScenario): AllocationFrozenInputV1 {
  validateScenario(input);
  const currency = input.currency ?? 'TRY';
  return {
    contractVersion: ALLOCATION_EVIDENCE_CONTRACT_VERSION,
    tenantId: 'tenant-evidence',
    caseId: 'case-evidence',
    currency,
    payment: {
      id: `payment-${input.id}`,
      amountMinor: toMinorString(input.payment),
      effectiveAt: '2026-07-18T09:00:00.000Z',
    },
    claimItems: input.claims.map((claim, index) => ({
      id: claim.id,
      itemType: claim.itemType,
      currency: claim.currency ?? currency,
      demandedAmountMinor: toMinorString(claim.demandedAmount),
      collectedAmountMinor: toMinorString(claim.collectedAmount ?? 0),
      startAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      metadata: claim.metadata ?? null,
    })),
    interest: {
      calculationAt: '2026-07-18T09:00:00.000Z',
      accrualFingerprint: 'accrual-v1',
      segmentFingerprint: 'segments-v1',
    },
    policy: {
      allocatorPolicy: 'TBK100',
      policyVersion: 'P0',
      ancillaryPriority: Object.values(AncillaryType),
    },
    rounding: {
      minorUnit: 2,
      mode: 'HALF_UP_AWAY_FROM_ZERO',
    },
  };
}

function runParity(input: ParityScenario) {
  const frozen = frozenInput(input);
  const fingerprint = buildAllocationFrozenInputFingerprint(frozen);
  const allocator = new TBK100AllocatorService();
  const summary = new SummaryEngineService({} as never, allocator);
  const summaryComputation = (
    summary as unknown as {
      allocateWithTBK100(
        items: FrozenClaimItem[],
        paymentAmount: number,
      ): {
        allocations: Array<{
          claimItemId: string;
          amount: number;
          allocationOrder: number;
        }>;
      };
    }
  ).allocateWithTBK100(input.claims, input.payment);

  const engine = new AllocationEngineService(
    allocator,
    new ClaimPriorityService(),
  );
  const steps = engine.allocateSinglePayment(
    {
      id: frozen.payment.id,
      date: frozen.payment.effectiveAt.slice(0, 10),
      amount: input.payment,
      currency: frozen.currency as 'TRY' | 'USD' | 'EUR' | 'GBP' | 'CHF',
    },
    input.claims.map((claim, index) => buildClaimDebtState(claim, index)),
    { claimPriorityRule: ClaimPriorityRule.CUSTOM },
  );

  const canonicalVector = summaryComputation.allocations.map((allocation) => ({
    claimItemId: allocation.claimItemId,
    legalBucket: legalBucketFor(
      input.claims.find((claim) => claim.id === allocation.claimItemId)!,
    ),
    allocationOrder: allocation.allocationOrder,
    amountMinor: toMinorString(allocation.amount),
  }));
  const candidateVector = steps.map((step, index) => ({
    claimItemId: step.claimBucketId,
    legalBucket: step.allocations[0].category,
    allocationOrder: index + 1,
    amountMinor: toMinorString(step.allocations[0].amountAllocated),
  }));
  const comparison = classifyFrozenAllocationParity({
    tenantId: frozen.tenantId,
    caseId: frozen.caseId,
    currency: frozen.currency,
    canonical: {
      fingerprint,
      rows: canonicalVector,
    },
    candidate: {
      fingerprint,
      rows: candidateVector,
    },
  });
  return {
    fingerprint,
    canonicalVector,
    candidateVector,
    comparison,
  };
}

function buildClaimDebtState(
  claim: FrozenClaimItem,
  index: number,
): ClaimDebtState {
  const remaining = claim.demandedAmount - (claim.collectedAmount ?? 0);
  const component = resolveComponent(claim);
  if (!component) throw new Error('UNMAPPED_CLAIM_ITEM_TYPE');
  const debtState: DebtState = {
    principal: component.kind === 'PRINCIPAL' ? remaining : 0,
    accruedInterest: component.kind === 'INTEREST' ? remaining : 0,
    costs: new Map(),
    ancillaries: new Map(),
  };
  if (component.kind === 'COST') {
    debtState.costs.set(component.type, remaining);
  }
  if (component.kind === 'ANCILLARY') {
    debtState.ancillaries.set(component.type, remaining);
  }
  return {
    claimId: claim.id,
    claim: {
      id: claim.id,
      amount: Math.max(remaining, 0.01),
      currency: (claim.currency ?? 'TRY') as 'TRY' | 'USD' | 'EUR' | 'GBP' | 'CHF',
      startDate: `2026-01-${String(index + 1).padStart(2, '0')}`,
      interestType: InterestTypeCode.LEGAL_3095,
      dayCountBasis: 365,
      priority: index + 1,
    },
    debtState,
    segments: [],
  };
}

function resolveComponent(claim: FrozenClaimItem):
  | { kind: 'PRINCIPAL' }
  | { kind: 'INTEREST' }
  | { kind: 'COST'; type: AncillaryType }
  | { kind: 'ANCILLARY'; type: AncillaryType }
  | null {
  if (claim.itemType.startsWith('TAX_')) {
    const parent = claim.metadata?.taxParentCategory;
    if (parent === 'PRINCIPAL') return { kind: 'PRINCIPAL' };
    if (parent === 'INTEREST') return { kind: 'INTEREST' };
    if (parent === 'COST') return { kind: 'COST', type: AncillaryType.DIGER };
    if (parent === 'ANCILLARY') {
      return { kind: 'ANCILLARY', type: AncillaryType.DIGER };
    }
    return null;
  }
  const classification = classifyClaimItemType(claim.itemType);
  if (classification.category === 'PRINCIPAL') return { kind: 'PRINCIPAL' };
  if (classification.category === 'INTEREST') return { kind: 'INTEREST' };
  if (classification.category === 'COST' && classification.ancillaryType) {
    return { kind: 'COST', type: classification.ancillaryType };
  }
  if (classification.category === 'ANCILLARY' && classification.ancillaryType) {
    return { kind: 'ANCILLARY', type: classification.ancillaryType };
  }
  return null;
}

function toMinorString(value: number): string {
  return String(Math.round(value * 100));
}

function vectorRow(
  claimItemId: string,
  legalBucket: string,
  allocationOrder: number,
  amount: number,
) {
  return {
    claimItemId,
    legalBucket,
    allocationOrder,
    amountMinor: toMinorString(amount),
  };
}

function legalBucketFor(claim: FrozenClaimItem): string {
  const component = resolveComponent(claim);
  if (!component) throw new Error('UNMAPPED_CLAIM_ITEM_TYPE');
  return component.kind === 'COST' || component.kind === 'ANCILLARY'
    ? component.type
    : component.kind;
}

function checksumFile(relativePath: string): string {
  return createHash('sha256')
    .update(fs.readFileSync(path.join(process.cwd(), relativePath)))
    .digest('hex');
}

function checksumDirectory(relativePath: string): string {
  const root = path.join(process.cwd(), relativePath);
  const files = walkFiles(root)
    .map((file) => path.relative(root, file).replaceAll('\\', '/'))
    .sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(root, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function walkFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(fullPath));
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
