import { createHash } from 'crypto';
import {
  AllocationComparisonResult,
  AllocationComparisonRow,
  buildAllocationComparisonContext,
  classifyAllocationComparison,
} from './allocation-drift-baseline';

export const ALLOCATION_EVIDENCE_CONTRACT_VERSION = 'RCV-WS04-P02-V1' as const;

export type AllocationEvidenceSource =
  | 'SYNTHETIC'
  | 'DISPOSABLE_POSTGRESQL'
  | 'REPRESENTATIVE';

export type AllocationEvidenceStatus =
  | 'PASS'
  | 'EXPECTED_NEGATIVE'
  | 'NOT_EXECUTED'
  | 'FAIL';

export interface AllocationFrozenInputV1 {
  contractVersion: typeof ALLOCATION_EVIDENCE_CONTRACT_VERSION;
  tenantId: string;
  caseId: string;
  currency: string;
  payment: {
    id: string;
    amountMinor: string;
    effectiveAt: string;
  };
  claimItems: Array<{
    id: string;
    itemType: string;
    currency: string;
    demandedAmountMinor: string;
    collectedAmountMinor: string;
    startAt: string;
    metadata: Record<string, unknown> | null;
  }>;
  interest: {
    calculationAt: string;
    accrualFingerprint: string;
    segmentFingerprint: string;
  };
  policy: {
    allocatorPolicy: string;
    policyVersion: string;
    ancillaryPriority: string[];
  };
  rounding: {
    minorUnit: number;
    mode: 'HALF_UP_AWAY_FROM_ZERO';
  };
}

export interface FrozenAllocationEvidenceVector {
  fingerprint: string | null;
  rows: AllocationEvidenceVectorRow[];
}

export interface AllocationEvidenceVectorRow {
  claimItemId: string;
  legalBucket: string;
  allocationOrder: number;
  amountMinor: string;
}

export interface AllocationEvidenceRecord {
  taskId: 'RCV-P2-WS04-P02';
  canonicalSourceSha: string;
  scenarioId: string;
  question: string;
  evidenceClass: AllocationEvidenceSource;
  status: AllocationEvidenceStatus;
  expectedClassification: string;
  actualClassification: string;
  inputFingerprint: string | null;
  allocatorIdentities: string[];
  policyIdentity: string;
  schemaIdentity: string;
  migrationIdentity: string;
  canonicalVector: AllocationEvidenceVectorRow[];
  candidateVector: AllocationEvidenceVectorRow[];
  provenance: {
    source: AllocationEvidenceSource;
    redactionStatus: 'NOT_REQUIRED_SYNTHETIC' | 'REDACTED' | 'NOT_EXECUTED';
  };
  artifactChecksums: string[];
  executionAuthorization: 'AUTHORIZED' | 'NOT_AUTHORIZED';
  evidence: string[];
}

export interface AllocationEvidenceManifest {
  contractVersion: typeof ALLOCATION_EVIDENCE_CONTRACT_VERSION;
  generatedAt: string;
  repositorySha: string;
  records: AllocationEvidenceRecord[];
  checksum: string;
}

export const ALLOCATION_PARITY_SCENARIOS_V1 = [
  'PM-01',
  'PM-02',
  'PM-03',
  'PM-04',
  'PM-05',
  'PM-06',
  'PM-07',
  'PM-08',
  'PM-09',
  'PM-10',
  'PM-11',
  'PM-12',
  'PM-13',
  'PM-14',
  'PM-15',
  'PM-16',
  'PM-17',
  'PM-18',
] as const;

export const ALLOCATION_MIXED_HISTORY_SCENARIOS_V1 = [
  'MH-01',
  'MH-02',
  'MH-03',
  'MH-04',
  'MH-05',
  'MH-06',
  'MH-07',
  'MH-08',
  'MH-09',
  'MH-10',
  'MH-11',
] as const;

export const ALLOCATION_MIXED_HISTORY_EXPECTED_V1 = {
  'MH-01': 'LEDGER_ONLY',
  'MH-02': 'COMPATIBILITY_ONLY',
  'MH-03': 'EQUALITY',
  'MH-04': 'FAIL_CLOSED_DRIFT',
  'MH-05': 'FAIL_CLOSED_DRIFT',
  'MH-06': 'FAIL_CLOSED_DRIFT',
  'MH-07': 'COMPATIBILITY_ONLY',
  'MH-08': 'CACHE_EQUALITY',
  'MH-09': 'CACHE_DRIFT',
  'MH-10': 'ALLOWED_DIVERGENCE',
  'MH-11': 'CASE_ISOLATED',
} as const;

export const REPRESENTATIVE_ALLOCATION_EVIDENCE_V1 = {
  source: 'REPRESENTATIVE',
  status: 'NOT_EXECUTED',
  authorization: 'NOT_AUTHORIZED',
  questions: [
    'production_allocator_activation_frequency',
    'production_mixed_history_population',
    'production_consumer_drift_distribution',
  ],
} as const;

export const PAID_DELTA_EVIDENCE_BOUNDARY_V1 = {
  grossReceiptFact: 'Collection.amount',
  allocatedPaymentFact: 'SUM(CONFIRMED LedgerAllocation.amount)',
  heldFact: 'CollectionOverpayment.remainingAmount where status=HELD',
  paidDelta: 'DIAGNOSTIC_ONLY',
  allocatorDefectEvidence: false,
  act28EvidenceGap:
    'Representative gross/allocated/HELD distributions are NOT_EXECUTED / NOT_AUTHORIZED.',
} as const;

export type CollectedAmountReferenceClass =
  | 'RECONCILED_CACHE'
  | 'COMPATIBILITY'
  | 'DISPLAY_ONLY'
  | 'OUTSIDE_CLAIM_ITEM_CACHE';

export const COLLECTED_AMOUNT_REFERENCE_MANIFEST_V1: ReadonlyArray<{
  path: string;
  classification: CollectedAmountReferenceClass;
  access:
    | 'READ'
    | 'WRITE'
    | 'READ_WRITE'
    | 'NEGATIVE_REFERENCE'
    | 'NON_CLAIM_ITEM';
  rationale: string;
}> = [
  {
    path: 'src/common/collection-confirmed.util.ts',
    classification: 'OUTSIDE_CLAIM_ITEM_CACHE',
    access: 'NON_CLAIM_ITEM',
    rationale: 'Confirmed Collection aggregate helper; ClaimItem cache reader değildir.',
  },
  {
    path: 'src/config/summary-engine-rules.yaml',
    classification: 'RECONCILED_CACHE',
    access: 'READ',
    rationale: 'Legacy summary expression reads ClaimItem.collectedAmount.',
  },
  {
    path: 'src/modules/automation/rule-engine.service.ts',
    classification: 'OUTSIDE_CLAIM_ITEM_CACHE',
    access: 'NON_CLAIM_ITEM',
    rationale: 'Workflow aggregate input; ClaimItem cache kaynağı değildir.',
  },
  {
    path: 'src/modules/automation/workflow-engine.service.ts',
    classification: 'OUTSIDE_CLAIM_ITEM_CACHE',
    access: 'NON_CLAIM_ITEM',
    rationale: 'Confirmed Collection toplamından türetilir.',
  },
  {
    path: 'src/modules/case/case-payment-preview.service.ts',
    classification: 'COMPATIBILITY',
    access: 'READ',
    rationale: 'ClaimItem cache üzerinden preview fallback hesaplar.',
  },
  {
    path: 'src/modules/claim-item/claim-item.service.ts',
    classification: 'RECONCILED_CACHE',
    access: 'READ',
    rationale: 'Mutation invariant ve immutable snapshot girdisi.',
  },
  {
    path: 'src/modules/client-notification/client-notification.service.ts',
    classification: 'DISPLAY_ONLY',
    access: 'NON_CLAIM_ITEM',
    rationale: 'Template placeholder; allocation authority üretmez.',
  },
  {
    path: 'src/modules/collection/collection-cancel-executor.ts',
    classification: 'RECONCILED_CACHE',
    access: 'WRITE',
    rationale: 'Canonical reversal yanında cache decrement/reset writer.',
  },
  {
    path: 'src/modules/icrabot/config/recovery-simulator.config.ts',
    classification: 'OUTSIDE_CLAIM_ITEM_CACHE',
    access: 'NON_CLAIM_ITEM',
    rationale: 'Simulation input contract; production ClaimItem cache reader değildir.',
  },
  {
    path: 'src/modules/icrabot/config/risk-scoring.config.ts',
    classification: 'OUTSIDE_CLAIM_ITEM_CACHE',
    access: 'NON_CLAIM_ITEM',
    rationale: 'Risk input contract; production ClaimItem cache reader değildir.',
  },
  {
    path: 'src/modules/interest-engine/assembler/claim-bucket-assembler.ts',
    classification: 'RECONCILED_CACHE',
    access: 'NEGATIVE_REFERENCE',
    rationale: 'Explicit negative reference; allocation base inputundan dışlar.',
  },
  {
    path: 'src/modules/interest-engine/orchestration/case-balance-display.ts',
    classification: 'DISPLAY_ONLY',
    access: 'NEGATIVE_REFERENCE',
    rationale: 'Explicit negative display-authority diagnostic.',
  },
  {
    path: 'src/modules/office-approval/office-approval-domain-sync.service.ts',
    classification: 'DISPLAY_ONLY',
    access: 'READ',
    rationale: 'Approval audit snapshot only.',
  },
  {
    path: 'src/modules/policy-engine/case-policy-engine.service.ts',
    classification: 'OUTSIDE_CLAIM_ITEM_CACHE',
    access: 'NON_CLAIM_ITEM',
    rationale: 'Collection-derived policy metric.',
  },
  {
    path: 'src/modules/policy-engine/fact-store/fact-store.service.ts',
    classification: 'OUTSIDE_CLAIM_ITEM_CACHE',
    access: 'NON_CLAIM_ITEM',
    rationale: 'Confirmed Collection aggregate fact.',
  },
  {
    path: 'src/modules/policy-engine/rule-engine/rule-engine.types.ts',
    classification: 'OUTSIDE_CLAIM_ITEM_CACHE',
    access: 'NON_CLAIM_ITEM',
    rationale: 'Policy metric type declaration.',
  },
  {
    path: 'src/modules/precautionary-order/precautionary-order.service.ts',
    classification: 'RECONCILED_CACHE',
    access: 'WRITE',
    rationale: 'New ClaimItem zero-value cache initializer.',
  },
  {
    path: 'src/modules/claim-item/formation-finalizer/transactional-claim-item-formation-finalizer.service.ts',
    classification: 'RECONCILED_CACHE',
    access: 'WRITE',
    rationale: 'New ClaimItem zero-value cache initializer.',
  },
  {
    path: 'src/modules/summary-engine/allocation-drift-baseline.ts',
    classification: 'RECONCILED_CACHE',
    access: 'READ',
    rationale: 'LedgerAllocation parity guard.',
  },
  {
    path: 'src/modules/summary-engine/allocation-evidence-qualification.ts',
    classification: 'RECONCILED_CACHE',
    access: 'NEGATIVE_REFERENCE',
    rationale: 'Consumer-complete evidence manifest; runtime consumer değildir.',
  },
  {
    path: 'src/modules/summary-engine/allocation-representative-replay-adapter.ts',
    classification: 'RECONCILED_CACHE',
    access: 'NEGATIVE_REFERENCE',
    rationale: 'P03 representative evidence adapter manifesti; runtime consumer değildir.',
  },
  {
    path: 'src/modules/summary-engine/summary-engine.service.ts',
    classification: 'RECONCILED_CACHE',
    access: 'READ_WRITE',
    rationale: 'Canonical allocation write reconciliation and legacy summary read.',
  },
] as const;

export function buildAllocationFrozenInputFingerprint(
  input: AllocationFrozenInputV1,
): string {
  assertFrozenInputComplete(input);
  const canonical = canonicalize({
    ...input,
    payment: {
      ...input.payment,
      effectiveAt: normalizeInstant(input.payment.effectiveAt),
    },
    claimItems: [...input.claimItems]
      .map((claimItem) => ({
        ...claimItem,
        startAt: normalizeInstant(claimItem.startAt),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    interest: {
      ...input.interest,
      calculationAt: normalizeInstant(input.interest.calculationAt),
    },
    policy: {
      ...input.policy,
      ancillaryPriority: [...input.policy.ancillaryPriority],
    },
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function classifyFrozenAllocationParity(input: {
  tenantId: string;
  caseId: string;
  currency: string;
  canonical: FrozenAllocationEvidenceVector;
  candidate: FrozenAllocationEvidenceVector;
  allowedDivergence?: AllocationComparisonRow[];
}): AllocationComparisonResult {
  const canonicalContext = buildAllocationComparisonContext({
    tenantId: input.tenantId,
    caseId: input.caseId,
    currency: input.currency,
    frozenInputId: input.canonical.fingerprint ?? '',
  });
  const candidateContext = buildAllocationComparisonContext({
    tenantId: input.tenantId,
    caseId: input.caseId,
    currency: input.currency,
    frozenInputId: input.candidate.fingerprint ?? '',
  });
  return classifyAllocationComparison({
    canonical: toComparisonRows(input.canonical.rows),
    candidate: toComparisonRows(input.candidate.rows),
    allowedDivergence: input.allowedDivergence,
    canonicalContext,
    candidateContext,
  });
}

export function buildAllocationEvidenceManifest(input: {
  generatedAt: string;
  repositorySha: string;
  records: AllocationEvidenceRecord[];
}): AllocationEvidenceManifest {
  const records = [...input.records].sort((left, right) =>
    left.scenarioId.localeCompare(right.scenarioId));
  const checksumPayload = canonicalize({
    contractVersion: ALLOCATION_EVIDENCE_CONTRACT_VERSION,
    repositorySha: input.repositorySha,
    records,
  });
  return {
    contractVersion: ALLOCATION_EVIDENCE_CONTRACT_VERSION,
    generatedAt: normalizeInstant(input.generatedAt),
    repositorySha: requireText('repositorySha', input.repositorySha),
    records,
    checksum: createHash('sha256').update(checksumPayload).digest('hex'),
  };
}

function toComparisonRows(
  rows: AllocationEvidenceVectorRow[],
): AllocationComparisonRow[] {
  return rows.map((row) => ({
    key: `${row.allocationOrder}:${row.claimItemId}:${row.legalBucket}`,
    amount: Number(BigInt(row.amountMinor)) / 100,
  }));
}

function assertFrozenInputComplete(input: AllocationFrozenInputV1): void {
  if (input.contractVersion !== ALLOCATION_EVIDENCE_CONTRACT_VERSION) {
    throw new Error('ALLOCATION_FROZEN_INPUT_VERSION_MISMATCH');
  }
  requireText('tenantId', input.tenantId);
  requireText('caseId', input.caseId);
  requireText('currency', input.currency);
  requireText('payment.id', input.payment.id);
  requireIntegerString('payment.amountMinor', input.payment.amountMinor);
  normalizeInstant(input.payment.effectiveAt);
  normalizeInstant(input.interest.calculationAt);
  requireText('interest.accrualFingerprint', input.interest.accrualFingerprint);
  requireText('interest.segmentFingerprint', input.interest.segmentFingerprint);
  requireText('policy.allocatorPolicy', input.policy.allocatorPolicy);
  requireText('policy.policyVersion', input.policy.policyVersion);
  for (const priority of input.policy.ancillaryPriority) {
    requireText('policy.ancillaryPriority', priority);
  }
  if (input.rounding.minorUnit !== 2) {
    throw new Error('ALLOCATION_FROZEN_INPUT_MINOR_UNIT_UNSUPPORTED');
  }
  if (input.claimItems.length === 0) {
    throw new Error('ALLOCATION_FROZEN_INPUT_CLAIM_ITEMS_MISSING');
  }
  const claimIds = new Set<string>();
  for (const claimItem of input.claimItems) {
    requireText('claimItem.id', claimItem.id);
    if (claimIds.has(claimItem.id)) {
      throw new Error('ALLOCATION_FROZEN_INPUT_DUPLICATE_CLAIM_ITEM');
    }
    claimIds.add(claimItem.id);
    requireText('claimItem.itemType', claimItem.itemType);
    requireText('claimItem.currency', claimItem.currency);
    normalizeInstant(claimItem.startAt);
    if (!Object.prototype.hasOwnProperty.call(claimItem, 'metadata')) {
      throw new Error('ALLOCATION_FROZEN_INPUT_EXPLICIT_NULL_REQUIRED:metadata');
    }
    if (claimItem.metadata === undefined) {
      throw new Error('ALLOCATION_FROZEN_INPUT_EXPLICIT_NULL_REQUIRED:metadata');
    }
    requireIntegerString(
      'claimItem.demandedAmountMinor',
      claimItem.demandedAmountMinor,
    );
    requireIntegerString(
      'claimItem.collectedAmountMinor',
      claimItem.collectedAmountMinor,
    );
  }
}

function canonicalize(value: unknown): string {
  if (value === undefined) {
    throw new Error('ALLOCATION_EVIDENCE_UNDEFINED_NOT_ALLOWED');
  }
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeInstant(value: string): string {
  const instant = new Date(requireText('instant', value));
  if (Number.isNaN(instant.getTime())) {
    throw new Error('ALLOCATION_EVIDENCE_INVALID_INSTANT');
  }
  return instant.toISOString();
}

function requireText(field: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`ALLOCATION_EVIDENCE_REQUIRED:${field}`);
  return normalized;
}

function requireIntegerString(field: string, value: string): void {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`ALLOCATION_EVIDENCE_MINOR_UNIT_REQUIRED:${field}`);
  }
}
