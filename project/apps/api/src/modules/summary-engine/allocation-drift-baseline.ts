import type { Prisma } from '@prisma/client';
import { fromCents, toCents } from '../interest-engine/allocation/minor-unit';

export const ALLOCATION_AUTHORITY_CONTRACT_V1 = {
  persistedLegalAllocation: 'LedgerAllocation',
  runtimeAllocation: 'CALCULATION_ONLY',
  collectionAllocation: 'COMPATIBILITY_PROJECTION',
  collectedAmount: 'RECONCILED_CACHE',
} as const;

export const ALLOCATION_AUTHORITY_INVENTORY_V1 = {
  persistedLegalWriters: [
    'src/modules/summary-engine/summary-engine.service.ts',
    'src/modules/collection/collection-cancel-executor.ts',
  ],
  compatibilityProjectionWriters: [
    'src/modules/collection/collection.service.ts',
  ],
  reconciledCacheWriters: [
    'src/modules/summary-engine/summary-engine.service.ts',
    'src/modules/collection/collection-cancel-executor.ts',
  ],
  runtimeCalculators: [
    'src/modules/interest-engine/allocation/allocation-engine.service.ts',
    'src/modules/interest-engine/allocation/tbk100-allocator.service.ts',
  ],
  canonicalAndCompatibilityReaders: [
    'src/modules/collection/collection.service.ts',
    'src/modules/interest-engine/calc-prep/payment-mapper.ts',
    'src/modules/interest-engine/orchestration/case-balance.service.ts',
  ],
} as const;

export type AllocationComparisonClass =
  | 'EQUALITY'
  | 'ALLOWED_DIVERGENCE'
  | 'NOT_COMPARABLE'
  | 'FAIL_CLOSED_DRIFT';

export interface AllocationComparisonContext {
  tenantId?: string;
  caseId?: string;
  currency?: string;
  frozenInputId?: string;
}

export interface AllocationComparisonRow {
  key: string;
  amount: unknown;
}

export interface AllocationComparisonDelta {
  key: string;
  canonicalAmount: number;
  candidateAmount: number;
  allowedDivergenceAmount: number;
  unexplainedDifference: number;
}

export interface AllocationComparisonResult {
  classification: AllocationComparisonClass;
  reason:
    | 'CENT_EXACT_EQUALITY'
    | 'EXPLICIT_ALLOWED_DIVERGENCE'
    | 'COMPARISON_CONTEXT_MISSING'
    | 'COMPARISON_CONTEXT_MISMATCH'
    | 'SAME_INPUT_VALUE_DRIFT';
  canonicalTotal: number;
  candidateTotal: number;
  allowedDivergenceTotal: number;
  deltas: AllocationComparisonDelta[];
}

export interface AllocationComparisonInput {
  canonical: AllocationComparisonRow[];
  candidate: AllocationComparisonRow[];
  canonicalContext: AllocationComparisonContext;
  candidateContext: AllocationComparisonContext;
  allowedDivergence?: AllocationComparisonRow[];
}

export interface CollectionAllocationProjectionDiagnosticInput {
  ledgerAllocation: AllocationComparisonRow[];
  collectionAllocation: AllocationComparisonRow[];
  context: AllocationComparisonContext;
  heldOverpayment?: AllocationComparisonRow[];
  comparisonContextComplete?: boolean;
}

export class AllocationDriftError extends Error {
  readonly code: 'ALLOCATION_DRIFT_DETECTED' | 'ALLOCATION_COMPARISON_NOT_COMPARABLE';

  constructor(
    readonly boundary: string,
    readonly comparison: AllocationComparisonResult,
  ) {
    const notComparable = comparison.classification === 'NOT_COMPARABLE';
    const code = notComparable
      ? 'ALLOCATION_COMPARISON_NOT_COMPARABLE'
      : 'ALLOCATION_DRIFT_DETECTED';
    super(`${code}: ${boundary} (${comparison.reason})`);
    this.name = 'AllocationDriftError';
    this.code = code;
  }
}

export function buildAllocationComparisonContext(input: {
  tenantId: string;
  caseId: string;
  currency: string;
  frozenInputId: string;
}): AllocationComparisonContext {
  return {
    tenantId: input.tenantId,
    caseId: input.caseId,
    currency: input.currency,
    frozenInputId: input.frozenInputId,
  };
}

export function classifyAllocationComparison(
  input: AllocationComparisonInput,
): AllocationComparisonResult {
  const contextState = compareContexts(input.canonicalContext, input.candidateContext);
  if (contextState !== 'MATCH') {
    return {
      classification: 'NOT_COMPARABLE',
      reason: contextState === 'MISSING'
        ? 'COMPARISON_CONTEXT_MISSING'
        : 'COMPARISON_CONTEXT_MISMATCH',
      canonicalTotal: sumRows(input.canonical),
      candidateTotal: sumRows(input.candidate),
      allowedDivergenceTotal: sumRows(input.allowedDivergence ?? []),
      deltas: [],
    };
  }

  const canonical = aggregateRows(input.canonical);
  const candidate = aggregateRows(input.candidate);
  const allowed = aggregateRows(input.allowedDivergence ?? []);
  const keys = [...new Set([...canonical.keys(), ...candidate.keys(), ...allowed.keys()])].sort();
  const deltas = keys.map((key) => {
    const canonicalAmount = canonical.get(key) ?? 0n;
    const candidateAmount = candidate.get(key) ?? 0n;
    const allowedDivergenceAmount = allowed.get(key) ?? 0n;
    return {
      key,
      canonicalAmount: fromCents(canonicalAmount),
      candidateAmount: fromCents(candidateAmount),
      allowedDivergenceAmount: fromCents(allowedDivergenceAmount),
      unexplainedDifference: fromCents(
        candidateAmount - canonicalAmount - allowedDivergenceAmount,
      ),
    };
  });

  const isEqual = deltas.every(
    (delta) => toCents(delta.candidateAmount) === toCents(delta.canonicalAmount),
  );
  const matchesAllowedDivergence = !isEqual && deltas.every(
    (delta) => toCents(delta.unexplainedDifference) === 0n,
  );

  return {
    classification: isEqual
      ? 'EQUALITY'
      : matchesAllowedDivergence
        ? 'ALLOWED_DIVERGENCE'
        : 'FAIL_CLOSED_DRIFT',
    reason: isEqual
      ? 'CENT_EXACT_EQUALITY'
      : matchesAllowedDivergence
        ? 'EXPLICIT_ALLOWED_DIVERGENCE'
        : 'SAME_INPUT_VALUE_DRIFT',
    canonicalTotal: fromCents(sumMap(canonical)),
    candidateTotal: fromCents(sumMap(candidate)),
    allowedDivergenceTotal: fromCents(sumMap(allowed)),
    deltas,
  };
}

export function diagnoseCollectionAllocationProjection(
  input: CollectionAllocationProjectionDiagnosticInput,
): AllocationComparisonResult {
  const candidateContext = input.comparisonContextComplete === false
    ? { ...input.context, frozenInputId: undefined }
    : input.context;
  return classifyAllocationComparison({
    canonical: input.ledgerAllocation,
    candidate: input.collectionAllocation,
    allowedDivergence: input.heldOverpayment,
    canonicalContext: input.context,
    candidateContext,
  });
}

export function assertWriteTimeAllocationComparison(
  boundary: string,
  comparison: AllocationComparisonResult,
  options: { allowExplicitDivergence?: boolean } = {},
): void {
  if (comparison.classification === 'EQUALITY') return;
  if (
    options.allowExplicitDivergence &&
    comparison.classification === 'ALLOWED_DIVERGENCE'
  ) {
    return;
  }
  throw new AllocationDriftError(boundary, comparison);
}

export async function reconcileLedgerAllocationWithCollectedAmountInTx(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    caseId: string;
    currency: string;
    frozenInputId: string;
    claimItemIds: string[];
    failClosedBoundary?: string;
  },
): Promise<AllocationComparisonResult> {
  const claimItemIds = [...new Set(input.claimItemIds)].sort();
  const context = buildAllocationComparisonContext(input);

  if (claimItemIds.length === 0) {
    return classifyAllocationComparison({
      canonical: [],
      candidate: [],
      canonicalContext: context,
      candidateContext: context,
    });
  }

  const [ledgerAllocations, claimItems] = await Promise.all([
    tx.ledgerAllocation.findMany({
      where: {
        claimItemId: { in: claimItemIds },
        ledgerEntry: {
          tenantId: input.tenantId,
          caseId: input.caseId,
          status: 'CONFIRMED',
        },
      },
      select: { claimItemId: true, amount: true },
    }),
    tx.claimItem.findMany({
      where: {
        id: { in: claimItemIds },
        tenantId: input.tenantId,
        caseId: input.caseId,
      },
      select: { id: true, collectedAmount: true },
    }),
  ]);

  const comparison = classifyAllocationComparison({
    canonical: ledgerAllocations.map((allocation) => ({
      key: allocation.claimItemId,
      amount: allocation.amount,
    })),
    candidate: claimItems.map((claimItem) => ({
      key: claimItem.id,
      amount: claimItem.collectedAmount,
    })),
    canonicalContext: context,
    candidateContext: context,
  });

  if (input.failClosedBoundary) {
    assertWriteTimeAllocationComparison(input.failClosedBoundary, comparison);
  }
  return comparison;
}

function compareContexts(
  canonical: AllocationComparisonContext,
  candidate: AllocationComparisonContext,
): 'MATCH' | 'MISSING' | 'MISMATCH' {
  const keys: Array<keyof AllocationComparisonContext> = [
    'tenantId',
    'caseId',
    'currency',
    'frozenInputId',
  ];
  if (keys.some((key) => !canonical[key] || !candidate[key])) return 'MISSING';
  return keys.every((key) => canonical[key] === candidate[key])
    ? 'MATCH'
    : 'MISMATCH';
}

function aggregateRows(rows: AllocationComparisonRow[]): Map<string, bigint> {
  const result = new Map<string, bigint>();
  for (const row of rows) {
    if (!row.key) continue;
    result.set(row.key, (result.get(row.key) ?? 0n) + toMinorUnits(row.amount));
  }
  return result;
}

function toMinorUnits(value: unknown): bigint {
  if (value && typeof value === 'object' && 'toString' in value) {
    return toCents(Number(value.toString()));
  }
  return toCents(Number(value));
}

function sumMap(values: Map<string, bigint>): bigint {
  let result = 0n;
  for (const value of values.values()) result += value;
  return result;
}

function sumRows(rows: AllocationComparisonRow[]): number {
  return fromCents(sumMap(aggregateRows(rows)));
}
