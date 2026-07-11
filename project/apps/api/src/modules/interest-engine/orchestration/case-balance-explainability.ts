import type { AllocationCategory, AllocationStep, Segment } from '../types/domain.types';
import type { FinalDebtState } from '../types/calculation.types';
import type { CaseBalanceResult } from './case-balance.service';
import type { CaseBalanceFeeProjection } from './case-balance-fee-projection';
import type {
  BalanceDisplayAuthority,
  BalanceDisplayBucket,
  BalanceDisplayDiagnostic,
  BalanceDisplayProvenance,
  BalanceDisplayTotals,
  CaseBalanceDisplayCurrency,
} from './case-balance-display';
import type { CaseBalanceSnapshotReadiness } from './case-balance-snapshot-readiness';

export interface CaseBalanceAllocationTraceItem {
  sequence: number;
  allocationIndex: number;
  category: AllocationCategory['category'];
  label: string;
  amountBefore: number;
  amountAllocated: number;
  amountAfter: number;
}

export interface CaseBalanceAllocationTraceStep {
  sequence: number;
  currency: string;
  paymentId: string;
  paymentDate: string;
  paymentAmount: number;
  claimBucketId: string;
  allocations: CaseBalanceAllocationTraceItem[];
  remainingPayment: number;
  newPrincipal: number;
  source: 'CALCULATION_RESULT_ALLOCATIONS';
}

export interface CaseBalanceInterestSegmentTrace {
  sequence: number;
  currency: string;
  claimBucketId: string;
  periodStart: string;
  periodEnd: string;
  days: number;
  rate: number;
  rateId: string;
  rateSource: string;
  principal: number;
  segmentInterest: number;
  phase: Segment['phase'] | 'UNSPECIFIED';
  dayCountRule: string | null;
  source: 'CALCULATION_RESULT_SEGMENTS';
}

export interface CaseBalancePrincipalSource {
  currency: string;
  claimId: string;
  amount: number;
  source: 'CALCULATION_RESULT_FINAL_DEBT_STATES';
}

export interface CaseBalanceProjectionSource {
  code: string;
  amount: number;
  currency: null;
  source: 'CASE_LEVEL_PROJECTION';
}

export interface CaseBalanceExplainabilitySources {
  principal: CaseBalancePrincipalSource[];
  interest: CaseBalanceInterestSegmentTrace[];
  costs: CaseBalanceProjectionSource[];
  ancillaries: CaseBalanceProjectionSource[];
  feeProjection: CaseBalanceFeeProjection;
}

export interface CaseBalanceExplainabilityTrace {
  kind: 'NON_AUTHORITATIVE_EXPLAINABILITY_TRACE';
  authority: 'NONE';
  persisted: false;
  orderPolicy: 'CURRENCY_ASC_THEN_CANONICAL_RESULT_ORDER';
  allocationSteps: CaseBalanceAllocationTraceStep[];
  interestSegments: CaseBalanceInterestSegmentTrace[];
  sources: CaseBalanceExplainabilitySources;
  readiness: CaseBalanceSnapshotReadiness;
  blockerCodes: CaseBalanceSnapshotReadiness['blockers'][number]['code'][];
}

export interface NonOfficialCaseBalanceSnapshot {
  kind: 'NON_OFFICIAL_CASE_BALANCE_SNAPSHOT';
  official: false;
  persisted: false;
  authority: 'NONE';
  generatedAt: string;
  tenantId: string;
  caseId: string;
  asOfDate: string;
  source: CaseBalanceResult['source'];
  displayStatus: 'OK' | 'UNAVAILABLE';
  displayAuthority: BalanceDisplayAuthority;
  unavailableReason?: string;
  officialSnapshotAvailable: false;
  readiness: CaseBalanceSnapshotReadiness;
  blockerCodes: CaseBalanceSnapshotReadiness['blockers'][number]['code'][];
  currency: string;
  currencies: CaseBalanceDisplayCurrency[];
  costs: number;
  ancillaries: number;
  feeProjection: CaseBalanceFeeProjection;
  buckets: BalanceDisplayBucket[];
  totals: BalanceDisplayTotals;
  diagnostics: BalanceDisplayDiagnostic[];
  provenance: BalanceDisplayProvenance;
  trace: CaseBalanceExplainabilityTrace;
}

export interface CaseBalanceExplainabilityDisplayView {
  generatedAt: string;
  status: 'OK' | 'UNAVAILABLE';
  authority: BalanceDisplayAuthority;
  unavailableReason?: string;
  snapshotAvailable: false;
  readiness: CaseBalanceSnapshotReadiness;
  currency: string;
  currencies: CaseBalanceDisplayCurrency[];
  costs: number;
  ancillaries: number;
  feeProjection: CaseBalanceFeeProjection;
  buckets: BalanceDisplayBucket[];
  totals: BalanceDisplayTotals;
  diagnostics: BalanceDisplayDiagnostic[];
  provenance: BalanceDisplayProvenance;
}

export interface BuildCaseBalanceExplainabilityInput {
  tenantId: string;
  caseId: string;
  balance: CaseBalanceResult;
  display: CaseBalanceExplainabilityDisplayView;
}

function compareCurrencyResult(
  a: CaseBalanceResult['currencyResults'][number],
  b: CaseBalanceResult['currencyResults'][number],
): number {
  return a.currency.localeCompare(b.currency);
}

function allocationTrace(
  step: AllocationStep,
  currency: string,
  sequence: number,
): CaseBalanceAllocationTraceStep {
  return {
    sequence,
    currency,
    paymentId: step.paymentId,
    paymentDate: step.paymentDate,
    paymentAmount: step.paymentAmount,
    claimBucketId: step.claimBucketId,
    allocations: (step.allocations ?? []).map((allocation, allocationIndex) => ({
      sequence: allocationIndex + 1,
      allocationIndex,
      category: allocation.category,
      label: allocation.label,
      amountBefore: allocation.amountBefore,
      amountAllocated: allocation.amountAllocated,
      amountAfter: allocation.amountAfter,
    })),
    remainingPayment: step.remainingPayment,
    newPrincipal: step.newPrincipal,
    source: 'CALCULATION_RESULT_ALLOCATIONS',
  };
}

function interestTrace(
  segment: Segment,
  currency: string,
  sequence: number,
): CaseBalanceInterestSegmentTrace {
  return {
    sequence,
    currency,
    claimBucketId: segment.claimBucketId,
    periodStart: segment.periodStart,
    periodEnd: segment.periodEnd,
    days: segment.days,
    rate: segment.rate,
    rateId: segment.rateId,
    rateSource: segment.rateSource,
    principal: segment.principal,
    segmentInterest: segment.segmentInterest,
    phase: segment.phase ?? 'UNSPECIFIED',
    dayCountRule: segment.dayCountRule ?? null,
    source: 'CALCULATION_RESULT_SEGMENTS',
  };
}

function principalSource(state: FinalDebtState): CaseBalancePrincipalSource {
  return {
    currency: state.currency,
    claimId: state.claimId,
    amount: state.principal,
    source: 'CALCULATION_RESULT_FINAL_DEBT_STATES',
  };
}

function projectionSources(
  projection: Partial<Record<string, number>>,
): CaseBalanceProjectionSource[] {
  return Object.entries(projection)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, amount]) => ({
      code,
      amount,
      currency: null,
      source: 'CASE_LEVEL_PROJECTION',
    }));
}

/**
 * Pure, additive explainability mapper. It only mirrors canonical calculation/display
 * evidence; it does not calculate, persist, hash, promote authority or create an
 * official snapshot.
 */
export function buildCaseBalanceExplainability(
  input: BuildCaseBalanceExplainabilityInput,
): {
  trace: CaseBalanceExplainabilityTrace;
  nonOfficialSnapshot: NonOfficialCaseBalanceSnapshot;
} {
  const orderedCurrencyResults = [...input.balance.currencyResults].sort(compareCurrencyResult);
  const allocationSteps: CaseBalanceAllocationTraceStep[] = [];
  const interestSegments: CaseBalanceInterestSegmentTrace[] = [];
  const principal: CaseBalancePrincipalSource[] = [];

  for (const currencyResult of orderedCurrencyResults) {
    for (const step of currencyResult.result?.allocations ?? []) {
      allocationSteps.push(allocationTrace(step, currencyResult.currency, allocationSteps.length + 1));
    }
    for (const segment of currencyResult.result?.segments ?? []) {
      interestSegments.push(interestTrace(segment, currencyResult.currency, interestSegments.length + 1));
    }
    principal.push(...(currencyResult.result?.finalDebtStates ?? []).map(principalSource));
  }
  principal.sort((a, b) => a.currency.localeCompare(b.currency) || a.claimId.localeCompare(b.claimId));

  const blockerCodes = input.display.readiness.blockers.map((blocker) => blocker.code);
  const trace: CaseBalanceExplainabilityTrace = {
    kind: 'NON_AUTHORITATIVE_EXPLAINABILITY_TRACE',
    authority: 'NONE',
    persisted: false,
    orderPolicy: 'CURRENCY_ASC_THEN_CANONICAL_RESULT_ORDER',
    allocationSteps,
    interestSegments,
    sources: {
      principal,
      interest: interestSegments,
      costs: projectionSources(input.balance.projections.costs),
      ancillaries: projectionSources(input.balance.projections.ancillaries),
      feeProjection: input.display.feeProjection,
    },
    readiness: input.display.readiness,
    blockerCodes,
  };

  const nonOfficialSnapshot: NonOfficialCaseBalanceSnapshot = {
    kind: 'NON_OFFICIAL_CASE_BALANCE_SNAPSHOT',
    official: false,
    persisted: false,
    authority: 'NONE',
    generatedAt: input.display.generatedAt,
    tenantId: input.tenantId,
    caseId: input.caseId,
    asOfDate: input.balance.asOfDate,
    source: input.balance.source,
    displayStatus: input.display.status,
    displayAuthority: input.display.authority,
    ...(input.display.unavailableReason
      ? { unavailableReason: input.display.unavailableReason }
      : {}),
    officialSnapshotAvailable: input.display.snapshotAvailable,
    readiness: input.display.readiness,
    blockerCodes,
    currency: input.display.currency,
    currencies: input.display.currencies,
    costs: input.display.costs,
    ancillaries: input.display.ancillaries,
    feeProjection: input.display.feeProjection,
    buckets: input.display.buckets,
    totals: input.display.totals,
    diagnostics: input.display.diagnostics,
    provenance: input.display.provenance,
    trace,
  };

  return { trace, nonOfficialSnapshot };
}
