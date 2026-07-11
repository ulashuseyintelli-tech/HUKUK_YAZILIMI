/** ADR-014 PR-9 deterministic expected/actual normalization and assertion. */
import type {
  ScenarioGoldenExpectation,
  ScenarioGoldenObservation,
} from '../scenario-support/scenario-definition';
import type { CaseBalanceDisplay } from '../orchestration/case-balance-display';
import type { ScenarioEvidenceMismatch } from './scenario-evidence';

const toCents = (value: number | null): number | null =>
  value == null ? null : Math.round((value + Number.EPSILON) * 100);

export function normalizeScenarioDisplay(
  actual: CaseBalanceDisplay,
  definition?: { domainInput: { enforcementDate?: string } },
): ScenarioGoldenObservation {
  return {
    status: actual.status,
    authority: actual.authority,
    blockerCodes: [...new Set(
      actual.diagnostics.filter((diagnostic) => diagnostic.severity === 'BLOCKER').map((diagnostic) => diagnostic.code),
    )].sort(),
    readinessBlockerCodes: actual.readiness.blockers.map((blocker) => blocker.code),
    currencies: [...actual.currencies]
      .sort((a, b) => a.currency.localeCompare(b.currency))
      .map((row) => ({
        currency: row.currency,
        status: row.skipped ? 'SKIPPED' : 'OK',
        interestCents: toCents(row.interest) ?? 0,
        claimRemainingCents: toCents(row.claimRemaining) ?? 0,
        collectedCents: toCents(row.collected) ?? 0,
        skippedReason: row.skippedReason,
      })),
    totals: {
      totalDebtCents: toCents(actual.totals.totalDebtAmount),
      allocatedPaidCents: toCents(actual.totals.allocatedPaidAmount),
      outstandingCents: toCents(actual.totals.outstandingAmount),
      heldOverpaymentCents: toCents(actual.totals.heldOverpaymentAmount),
      grossReceivedCents: toCents(actual.totals.grossReceivedAmount),
    },
    feeProjection: {
      status: actual.feeProjection.status,
      authority: actual.feeProjection.authority,
      currency: actual.feeProjection.currency,
      totalProjectedCents: toCents(actual.feeProjection.totalProjectedAmount),
      groups: [...actual.feeProjection.groups]
        .sort((a, b) => a.currency.localeCompare(b.currency))
        .map((group) => ({
          currency: group.currency,
          status: group.status,
          totalProjectedCents: toCents(group.totalProjectedAmount),
          lineCents: group.lines.map((line) => toCents(line.amount)),
        })),
      diagnosticCodes: [...new Set(actual.feeProjection.diagnostics.map((diagnostic) => diagnostic.code))].sort(),
    },
    allocations: actual.trace.allocationSteps.map((step) => ({
      currency: step.currency,
      paymentId: step.paymentId,
      paymentDate: step.paymentDate,
      paymentCents: toCents(step.paymentAmount) ?? 0,
      categories: step.allocations.map((item) => ({
        category: item.category,
        allocatedCents: toCents(item.amountAllocated) ?? 0,
      })),
      remainingPaymentCents: toCents(step.remainingPayment) ?? 0,
      newPrincipalCents: toCents(step.newPrincipal) ?? 0,
    })),
    interestSegments: actual.trace.interestSegments.map((segment) => ({
      currency: segment.currency,
      periodStart: segment.periodStart,
      periodEnd: segment.periodEnd,
      principalCents: toCents(segment.principal) ?? 0,
      interestCents: toCents(segment.segmentInterest) ?? 0,
      // Case.caseDate DB'de required/default(now), Wave 0 enforcementDate ise
      // opsiyoneldir. Contract kaniti yoksa persistence default'u hukuki faz sayilmaz.
      phase: definition && definition.domainInput.enforcementDate == null
        ? 'UNSPECIFIED'
        : segment.phase ?? 'UNSPECIFIED',
    })),
    trace: {
      kind: actual.trace.kind,
      authority: actual.trace.authority,
      persisted: actual.trace.persisted,
      orderPolicy: actual.trace.orderPolicy,
    },
    nonOfficialSnapshot: {
      kind: actual.nonOfficialSnapshot.kind,
      official: actual.nonOfficialSnapshot.official,
      persisted: actual.nonOfficialSnapshot.persisted,
      authority: actual.nonOfficialSnapshot.authority,
      blockerCodes: actual.nonOfficialSnapshot.blockerCodes,
    },
  };
}

function collectMismatches(
  expected: unknown,
  actual: unknown,
  path: string,
  mismatches: ScenarioEvidenceMismatch[],
): void {
  if (Array.isArray(expected)) {
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      mismatches.push({ field: path, expected: JSON.stringify(expected), actual: JSON.stringify(actual) });
    }
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    const actualRecord = actual !== null && typeof actual === 'object'
      ? actual as Record<string, unknown>
      : {};
    for (const [key, value] of Object.entries(expected as Record<string, unknown>)) {
      collectMismatches(value, actualRecord[key], `${path}.${key}`, mismatches);
    }
    return;
  }
  if (expected !== actual) {
    mismatches.push({ field: path, expected: String(expected), actual: String(actual) });
  }
}

export function compareScenarioGoldenExpectation(
  expected: ScenarioGoldenExpectation,
  actual: ScenarioGoldenObservation,
): ScenarioEvidenceMismatch[] {
  const mismatches: ScenarioEvidenceMismatch[] = [];
  collectMismatches(expected, actual, 'golden', mismatches);
  return mismatches;
}
