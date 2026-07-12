import { Inject, Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry } from 'prom-client';
import type { BalanceDisplayShadowDiffReport, ShadowAmountDiffStatus } from './balance-display-shadow-diff.types';
import { SHADOW_FINANCIAL_DIFF_FIELDS } from './balance-display-shadow-diff.types';

type RequestOutcome = 'READY' | 'BLOCKED' | 'SOURCE_UNAVAILABLE';
export type ShadowCalculationComponent = 'LEGACY' | 'CANONICAL' | 'SHADOW_COMPARE';
export type ShadowCalculationResult = 'SUCCESS' | 'ERROR';
type ComparisonResult = 'MATCH' | 'NON_ZERO' | 'NOT_COMPARABLE' | 'MISSING_SOURCE' | 'UNKNOWN';
type BlockerCategory =
  | 'FINANCIAL_DISCREPANCY'
  | 'MISSING_REQUIRED_EVIDENCE'
  | 'SOURCE_UNAVAILABLE'
  | 'CURRENCY_INTEGRITY'
  | 'AUTHORITY_INTEGRITY'
  | 'OTHER';

function comparisonResult(status: ShadowAmountDiffStatus): ComparisonResult {
  if (status === 'MATCH') return 'MATCH';
  if (status === 'MAJOR_DELTA' || status === 'MINOR_DELTA') return 'NON_ZERO';
  if (status === 'NOT_COMPARABLE') return 'NOT_COMPARABLE';
  if (status === 'LEGACY_ONLY' || status === 'CANONICAL_ONLY') return 'MISSING_SOURCE';
  return 'UNKNOWN';
}

function blockerCategory(code: string): BlockerCategory {
  if (code in SHADOW_FINANCIAL_DIFF_FIELDS) return 'FINANCIAL_DISCREPANCY';
  if (code.startsWith('MISSING_') && code.endsWith('_COMPARISON_EVIDENCE')) return 'MISSING_REQUIRED_EVIDENCE';
  if (code.includes('UNAVAILABLE') || code === 'LEGACY_UNAVAILABLE') return 'SOURCE_UNAVAILABLE';
  if (code.includes('CURRENCY')) return 'CURRENCY_INTEGRITY';
  if (code.includes('AUTHORITY') || code.includes('CONTEXT')) return 'AUTHORITY_INTEGRITY';
  return 'OTHER';
}

@Injectable()
export class BalanceDisplayShadowDiffMetrics {
  private readonly requestsTotal: Counter;
  private readonly durationSeconds: Histogram;
  private readonly calculationDurationSeconds: Histogram;
  private readonly comparisonsTotal: Counter;
  private readonly readinessBlockersTotal: Counter;

  constructor(@Inject('PROM_REGISTRY') registry: Registry) {
    this.requestsTotal = new Counter({
      name: 'adr014_shadow_requests_total',
      help: 'ADR-014 shadow comparison requests by bounded outcome',
      labelNames: ['outcome'],
      registers: [registry],
    });
    this.durationSeconds = new Histogram({
      name: 'adr014_shadow_request_duration_seconds',
      help: 'ADR-014 shadow comparison duration in seconds',
      labelNames: ['outcome'],
      registers: [registry],
    });
    this.calculationDurationSeconds = new Histogram({
      name: 'adr014_calculation_duration_seconds',
      help: 'ADR-014 calculation component duration in seconds by bounded component/result',
      labelNames: ['component', 'result'],
      registers: [registry],
    });
    this.comparisonsTotal = new Counter({
      name: 'adr014_shadow_comparisons_total',
      help: 'ADR-014 financial comparison outcomes by bounded field/result/severity',
      labelNames: ['financial_field', 'comparison_result', 'severity'],
      registers: [registry],
    });
    this.readinessBlockersTotal = new Counter({
      name: 'adr014_readiness_blockers_total',
      help: 'ADR-014 readiness blockers by bounded category',
      labelNames: ['blocker_category'],
      registers: [registry],
    });
  }

  recordCalculationDuration(
    component: ShadowCalculationComponent,
    result: ShadowCalculationResult,
    durationMs: number,
  ): void {
    this.calculationDurationSeconds.observe({ component, result }, Math.max(0, durationMs) / 1000);
  }

  recordReport(report: BalanceDisplayShadowDiffReport, durationMs: number): void {
    const sourceUnavailable =
      !report.sources.legacyCalculationSummary.available || !report.sources.canonicalBalanceDisplay.available;
    const outcome: RequestOutcome = sourceUnavailable
      ? 'SOURCE_UNAVAILABLE'
      : report.cutoverReadiness.safeForPrimaryDisplay
        ? 'READY'
        : 'BLOCKED';

    this.requestsTotal.inc({ outcome });
    this.durationSeconds.observe({ outcome }, Math.max(0, durationMs) / 1000);

    for (const diff of [...report.totals.diffs, ...report.bucketDiffs]) {
      const field = SHADOW_FINANCIAL_DIFF_FIELDS[diff.code as keyof typeof SHADOW_FINANCIAL_DIFF_FIELDS];
      if (!field) continue;
      this.comparisonsTotal.inc({
        financial_field: field,
        comparison_result: comparisonResult(diff.status),
        severity: diff.severity,
      });
    }

    for (const category of new Set(report.cutoverReadiness.blockers.map(blockerCategory))) {
      this.readinessBlockersTotal.inc({ blocker_category: category });
    }
  }
}
