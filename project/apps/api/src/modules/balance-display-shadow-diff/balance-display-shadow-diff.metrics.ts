import { Inject, Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry } from 'prom-client';
import type { BalanceDisplayShadowDiffReport, ShadowAmountDiffStatus } from './balance-display-shadow-diff.types';
import { SHADOW_FINANCIAL_DIFF_FIELDS } from './balance-display-shadow-diff.types';

type RequestOutcome = 'READY' | 'BLOCKED' | 'SOURCE_UNAVAILABLE';
export type ShadowCalculationComponent = 'LEGACY' | 'CANONICAL' | 'SHADOW_COMPARE';
export type ShadowCalculationResult = 'SUCCESS' | 'ERROR';
type ComparisonResult = 'MATCH' | 'NON_ZERO' | 'NOT_COMPARABLE' | 'MISSING_SOURCE' | 'UNKNOWN';
type PrimaryDisplaySafetyResult = 'SAFE' | 'UNSAFE';
type IntegrityType = 'CURRENCY' | 'AUTHORITY';
type IntegrityResult =
  | 'MISMATCH'
  | 'UNSAFE'
  | 'FINAL_DEBT_STATE_MISMATCH'
  | 'CONTEXT_MISMATCH'
  | 'DISPLAY_UNSAFE'
  | 'AUTHORITY_CONTAMINATION';
type BlockerCategory =
  | 'FINANCIAL_DISCREPANCY'
  | 'MISSING_REQUIRED_EVIDENCE'
  | 'SOURCE_UNAVAILABLE'
  | 'CURRENCY_INTEGRITY'
  | 'AUTHORITY_INTEGRITY'
  | 'OTHER';

const REQUIRED_COMPARISON_EVIDENCE_FAILURES = new Set<string>([
  ...Object.keys(SHADOW_FINANCIAL_DIFF_FIELDS).map((code) => `MISSING_${code}_COMPARISON_EVIDENCE`),
  'MISSING_PAYMENT_ALLOCATION_COMPARISON_EVIDENCE',
  'MISSING_INTEREST_BASE_COMPARISON_EVIDENCE',
  'MISSING_FEE_PROJECTION_COMPARISON_EVIDENCE',
  'FINAL_DEBT_STATES_MISSING',
]);

const INTEGRITY_FAILURE_LABELS = {
  CURRENCY_MISMATCH: { integrity_type: 'CURRENCY', result: 'MISMATCH' },
  CANONICAL_CURRENCY_UNSAFE: { integrity_type: 'CURRENCY', result: 'UNSAFE' },
  FINAL_DEBT_STATES_CURRENCY_MISMATCH: {
    integrity_type: 'CURRENCY',
    result: 'FINAL_DEBT_STATE_MISMATCH',
  },
  CONTEXT_MISMATCH: { integrity_type: 'AUTHORITY', result: 'CONTEXT_MISMATCH' },
  CANONICAL_UNSAFE_FOR_PRIMARY_DISPLAY: { integrity_type: 'AUTHORITY', result: 'DISPLAY_UNSAFE' },
  CLAIM_ITEM_AUTHORITY_CONTAMINATION: {
    integrity_type: 'AUTHORITY',
    result: 'AUTHORITY_CONTAMINATION',
  },
} as const satisfies Record<string, { integrity_type: IntegrityType; result: IntegrityResult }>;

function financialField(code: string) {
  if (!Object.prototype.hasOwnProperty.call(SHADOW_FINANCIAL_DIFF_FIELDS, code)) return undefined;
  return SHADOW_FINANCIAL_DIFF_FIELDS[code as keyof typeof SHADOW_FINANCIAL_DIFF_FIELDS];
}

function integrityFailureLabels(code: string) {
  if (!Object.prototype.hasOwnProperty.call(INTEGRITY_FAILURE_LABELS, code)) return undefined;
  return INTEGRITY_FAILURE_LABELS[code as keyof typeof INTEGRITY_FAILURE_LABELS];
}

function comparisonResult(status: ShadowAmountDiffStatus): ComparisonResult {
  if (status === 'MATCH') return 'MATCH';
  if (status === 'MAJOR_DELTA' || status === 'MINOR_DELTA') return 'NON_ZERO';
  if (status === 'NOT_COMPARABLE') return 'NOT_COMPARABLE';
  if (status === 'LEGACY_ONLY' || status === 'CANONICAL_ONLY') return 'MISSING_SOURCE';
  return 'UNKNOWN';
}

function blockerCategory(code: string): BlockerCategory {
  if (financialField(code)) return 'FINANCIAL_DISCREPANCY';
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
  private readonly financialDiscrepanciesTotal: Counter;
  private readonly missingEvidenceTotal: Counter;
  private readonly integrityFailuresTotal: Counter;
  private readonly readinessBlockersTotal: Counter;
  private readonly primaryDisplaySafetyTotal: Counter;

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
    this.financialDiscrepanciesTotal = new Counter({
      name: 'adr014_financial_discrepancies_total',
      help: 'ADR-014 explicit non-zero financial discrepancies by bounded field/code',
      labelNames: ['financial_field', 'discrepancy_code'],
      registers: [registry],
    });
    this.missingEvidenceTotal = new Counter({
      name: 'adr014_missing_evidence_total',
      help: 'ADR-014 mandatory comparison or evidence absence by bounded failure code',
      labelNames: ['failure_code'],
      registers: [registry],
    });
    this.integrityFailuresTotal = new Counter({
      name: 'adr014_integrity_failures_total',
      help: 'ADR-014 currency and authority integrity failures by bounded type/result',
      labelNames: ['integrity_type', 'result'],
      registers: [registry],
    });
    this.readinessBlockersTotal = new Counter({
      name: 'adr014_readiness_blockers_total',
      help: 'ADR-014 readiness blockers by bounded category',
      labelNames: ['blocker_category'],
      registers: [registry],
    });
    this.primaryDisplaySafetyTotal = new Counter({
      name: 'adr014_primary_display_safety_total',
      help: 'ADR-014 safeForPrimaryDisplay distribution by bounded result',
      labelNames: ['result'],
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
      const field = financialField(diff.code);
      if (!field) continue;
      this.comparisonsTotal.inc({
        financial_field: field,
        comparison_result: comparisonResult(diff.status),
        severity: diff.severity,
      });
      if (diff.status === 'MAJOR_DELTA' || diff.status === 'MINOR_DELTA') {
        this.financialDiscrepanciesTotal.inc({
          financial_field: field,
          discrepancy_code: diff.code,
        });
      }
    }

    const blockerCodes = new Set(report.cutoverReadiness.blockers);
    for (const code of blockerCodes) {
      if (REQUIRED_COMPARISON_EVIDENCE_FAILURES.has(code)) {
        this.missingEvidenceTotal.inc({ failure_code: code });
      }
      const integrityLabels = integrityFailureLabels(code);
      if (integrityLabels) this.integrityFailuresTotal.inc(integrityLabels);
    }

    for (const category of new Set([...blockerCodes].map(blockerCategory))) {
      this.readinessBlockersTotal.inc({ blocker_category: category });
    }

    const safetyResult: PrimaryDisplaySafetyResult = report.cutoverReadiness.safeForPrimaryDisplay
      ? 'SAFE'
      : 'UNSAFE';
    this.primaryDisplaySafetyTotal.inc({ result: safetyResult });
  }
}
