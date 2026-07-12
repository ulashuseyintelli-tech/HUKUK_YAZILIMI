import { Injectable, Logger } from '@nestjs/common';
import type { BalanceDisplayShadowDiffReport, ShadowAmountDiffStatus } from './balance-display-shadow-diff.types';
import {
  buildAdr014OperationalEvent,
  type Adr014OperationalEventComponent,
  type Adr014OperationalEventFailureCode,
  type BuildAdr014OperationalEventInput,
} from './balance-display-shadow-diff.events';

const MISSING_EVIDENCE_FAILURE_CODES: Readonly<Record<string, Adr014OperationalEventFailureCode>> = {
  MISSING_PAYMENT_ALLOCATION_COMPARISON_EVIDENCE: 'MISSING_PAYMENT_ALLOCATION_EVIDENCE',
  MISSING_INTEREST_BASE_COMPARISON_EVIDENCE: 'MISSING_INTEREST_BASE_EVIDENCE',
  MISSING_FEE_PROJECTION_COMPARISON_EVIDENCE: 'MISSING_FEE_PROJECTION_EVIDENCE',
};

function includesCode(codes: readonly string[], fragment: string): boolean {
  return codes.some((code) => code.includes(fragment));
}

function includesStatus(statuses: readonly ShadowAmountDiffStatus[], expected: readonly ShadowAmountDiffStatus[]): boolean {
  return statuses.some((status) => expected.includes(status));
}

export function failureCodeForShadowReport(
  report: BalanceDisplayShadowDiffReport,
): Adr014OperationalEventFailureCode {
  const blockerCodes = report.cutoverReadiness.blockers;
  if (includesCode(blockerCodes, 'CURRENCY')) return 'CURRENCY_INTEGRITY_FAILURE';
  if (includesCode(blockerCodes, 'AUTHORITY') || includesCode(blockerCodes, 'CONTEXT')) {
    return 'AUTHORITY_INTEGRITY_FAILURE';
  }

  const statuses = [...report.totals.diffs, ...report.bucketDiffs].map((diff) => diff.status);
  if (includesStatus(statuses, ['MAJOR_DELTA', 'MINOR_DELTA'])) return 'NON_ZERO_FINANCIAL_DELTA';
  if (includesStatus(statuses, ['LEGACY_ONLY', 'CANONICAL_ONLY'])) return 'MANDATORY_COMPARISON_UNKNOWN';
  if (includesStatus(statuses, ['NOT_COMPARABLE'])) return 'MANDATORY_FIELD_NOT_COMPARABLE';

  for (const code of blockerCodes) {
    const mapped = MISSING_EVIDENCE_FAILURE_CODES[code];
    if (mapped) return mapped;
  }
  return 'READINESS_BLOCKED';
}

@Injectable()
export class BalanceDisplayShadowDiffEventLogger {
  private readonly logger = new Logger(BalanceDisplayShadowDiffEventLogger.name);

  recordComparisonStarted(): void {
    this.emit({
      eventType: 'ADR014_SHADOW_COMPARISON_STARTED',
      severity: 'INFO',
      component: 'SHADOW_COMPARE',
      operation: 'COMPARE',
      result: 'SUCCESS',
      failureCode: 'NONE',
    });
  }

  recordComponent(component: Exclude<Adr014OperationalEventComponent, 'SHADOW_COMPARE'>, succeeded: boolean): void {
    this.emit({
      eventType: succeeded ? 'ADR014_SHADOW_COMPONENT_COMPLETED' : 'ADR014_SHADOW_COMPONENT_FAILED',
      severity: succeeded ? 'INFO' : 'CRITICAL',
      component,
      operation: 'CALCULATE',
      result: succeeded ? 'SUCCESS' : 'ERROR',
      failureCode: succeeded ? 'NONE' : component === 'LEGACY' ? 'LEGACY_SOURCE_ERROR' : 'CANONICAL_SOURCE_ERROR',
    });
  }

  recordReport(report: BalanceDisplayShadowDiffReport): void {
    const legacyAvailable = report.sources.legacyCalculationSummary.available;
    const canonicalAvailable = report.sources.canonicalBalanceDisplay.available;
    if (!legacyAvailable || !canonicalAvailable) {
      this.emit({
        eventType: 'ADR014_SHADOW_COMPARISON_UNAVAILABLE',
        severity: 'HARD_STOP',
        component: 'SHADOW_COMPARE',
        operation: 'COMPARE',
        result: 'UNAVAILABLE',
        failureCode: !legacyAvailable ? 'LEGACY_SOURCE_UNAVAILABLE' : 'CANONICAL_SOURCE_UNAVAILABLE',
      });
      return;
    }

    if (!report.cutoverReadiness.safeForPrimaryDisplay) {
      this.emit({
        eventType: 'ADR014_SHADOW_COMPARISON_BLOCKED',
        severity: 'HARD_STOP',
        component: 'SHADOW_COMPARE',
        operation: 'EVALUATE_READINESS',
        result: 'BLOCKED',
        failureCode: failureCodeForShadowReport(report),
      });
      return;
    }

    this.emit({
      eventType: 'ADR014_SHADOW_COMPARISON_COMPLETED',
      severity: 'INFO',
      component: 'SHADOW_COMPARE',
      operation: 'COMPARE',
      result: 'SUCCESS',
      failureCode: 'NONE',
    });
  }

  private emit(input: BuildAdr014OperationalEventInput): void {
    try {
      const event = buildAdr014OperationalEvent(input);
      const serialized = JSON.stringify(event);
      if (event.severity === 'INFO') this.logger.log(serialized);
      else if (event.severity === 'WARNING') this.logger.warn(serialized);
      else this.logger.error(serialized);
    } catch {
      // Non-durable operational telemetry must never mutate the business result.
    }
  }
}
