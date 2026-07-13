import { Registry } from 'prom-client';
import { BalanceDisplayShadowDiffMetrics } from '../balance-display-shadow-diff.metrics';
import type { BalanceDisplayShadowDiffReport } from '../balance-display-shadow-diff.types';
import { SHADOW_FINANCIAL_DIFF_FIELDS } from '../balance-display-shadow-diff.types';

function report(overrides: Partial<BalanceDisplayShadowDiffReport> = {}): BalanceDisplayShadowDiffReport {
  return {
    sources: {
      legacyCalculationSummary: { available: true },
      canonicalBalanceDisplay: { available: true },
    },
    totals: {
      diffs: [{
        code: 'OUTSTANDING_DELTA',
        status: 'MAJOR_DELTA',
        severity: 'RED',
        legacyAmount: 12345.67,
        canonicalAmount: 99999.99,
        delta: 87654.32,
      }],
    },
    bucketDiffs: [{ code: 'EXPENSE_BUCKET_DELTA', status: 'NOT_COMPARABLE', severity: 'UNKNOWN_NEEDS_FOLLOWUP' }],
    cutoverReadiness: {
      safeForPrimaryDisplay: false,
      blockers: [
        'OUTSTANDING_DELTA',
        'EXPENSE_BUCKET_DELTA',
        'MISSING_INTEREST_BASE_COMPARISON_EVIDENCE',
        'CURRENCY_MISMATCH',
      ],
    },
    ...overrides,
  } as BalanceDisplayShadowDiffReport;
}

describe('BalanceDisplayShadowDiffMetrics', () => {
  it('bounded readiness/comparison label seti uretir ve tenant/case/amount tasimaz', async () => {
    const registry = new Registry();
    const metrics = new BalanceDisplayShadowDiffMetrics(registry);

    metrics.recordReport(report({ tenantId: 'tenant-secret', caseId: 'case-secret' }), 125);

    const output = await registry.metrics();
    expect(output).toContain('adr014_shadow_requests_total{outcome="BLOCKED"} 1');
    expect(output).toContain(
      'adr014_shadow_comparisons_total{financial_field="OUTSTANDING",comparison_result="NON_ZERO",severity="RED"} 1',
    );
    expect(output).toContain(
      'adr014_shadow_comparisons_total{financial_field="EXPENSE",comparison_result="NOT_COMPARABLE",severity="UNKNOWN_NEEDS_FOLLOWUP"} 1',
    );
    expect(output).toContain('adr014_readiness_blockers_total{blocker_category="FINANCIAL_DISCREPANCY"} 1');
    expect(output).toContain('adr014_readiness_blockers_total{blocker_category="MISSING_REQUIRED_EVIDENCE"} 1');
    expect(output).toContain('adr014_readiness_blockers_total{blocker_category="CURRENCY_INTEGRITY"} 1');
    expect(output).toContain(
      'adr014_financial_discrepancies_total{financial_field="OUTSTANDING",discrepancy_code="OUTSTANDING_DELTA"} 1',
    );
    expect(output).not.toContain(
      'adr014_financial_discrepancies_total{financial_field="EXPENSE",discrepancy_code="EXPENSE_BUCKET_DELTA"}',
    );
    expect(output).toContain(
      'adr014_missing_evidence_total{failure_code="MISSING_INTEREST_BASE_COMPARISON_EVIDENCE"} 1',
    );
    expect(output).toContain(
      'adr014_integrity_failures_total{integrity_type="CURRENCY",result="MISMATCH"} 1',
    );
    expect(output).toContain('adr014_primary_display_safety_total{result="UNSAFE"} 1');
    expect(output).not.toContain('tenant-secret');
    expect(output).not.toContain('case-secret');
    expect(output).not.toContain('12345.67');
    expect(output).not.toContain('99999.99');
    expect(output).not.toContain('87654.32');
  });

  it('yalniz allowlisted report sinyallerini yeni metric label olarak kullanir', async () => {
    const registry = new Registry();
    const metrics = new BalanceDisplayShadowDiffMetrics(registry);

    metrics.recordReport(report({
      cutoverReadiness: {
        safeForPrimaryDisplay: false,
        blockers: [
          'MISSING_PAYMENT_ALLOCATION_COMPARISON_EVIDENCE',
          'MISSING_PAYMENT_ALLOCATION_COMPARISON_EVIDENCE',
          'CLAIM_ITEM_AUTHORITY_CONTAMINATION',
          'MISSING_person-secret_COMPARISON_EVIDENCE',
        ],
      } as BalanceDisplayShadowDiffReport['cutoverReadiness'],
    }), 1);

    const output = await registry.metrics();
    expect(output).toContain(
      'adr014_missing_evidence_total{failure_code="MISSING_PAYMENT_ALLOCATION_COMPARISON_EVIDENCE"} 1',
    );
    expect(output).toContain(
      'adr014_integrity_failures_total{integrity_type="AUTHORITY",result="AUTHORITY_CONTAMINATION"} 1',
    );
    expect(output).not.toContain('person-secret');
  });

  it("non-zero discrepancy'yi mevcut comparison satiriyla bire bir sayar", async () => {
    const registry = new Registry();
    const metrics = new BalanceDisplayShadowDiffMetrics(registry);

    metrics.recordReport(report({
      totals: {
        diffs: [
          { code: 'TOTAL_DEBT_DELTA', status: 'MINOR_DELTA', severity: 'YELLOW' },
          { code: 'PAID_DELTA', status: 'MATCH', severity: 'GREEN' },
        ],
      } as BalanceDisplayShadowDiffReport['totals'],
      bucketDiffs: [],
      cutoverReadiness: {
        safeForPrimaryDisplay: false,
        blockers: ['TOTAL_DEBT_DELTA'],
      } as BalanceDisplayShadowDiffReport['cutoverReadiness'],
    }), 1);

    const output = await registry.metrics();
    expect(output).toContain(
      'adr014_shadow_comparisons_total{financial_field="TOTAL",comparison_result="NON_ZERO",severity="YELLOW"} 1',
    );
    expect(output).toContain(
      'adr014_financial_discrepancies_total{financial_field="TOTAL",discrepancy_code="TOTAL_DEBT_DELTA"} 1',
    );
    expect(output).not.toContain(
      'adr014_financial_discrepancies_total{financial_field="PAID",discrepancy_code="PAID_DELTA"}',
    );
  });

  it('bounded label cardinalityyi canonical allowlist ile sinirlar', async () => {
    const registry = new Registry();
    const metrics = new BalanceDisplayShadowDiffMetrics(registry);
    const financialCodes = Object.keys(SHADOW_FINANCIAL_DIFF_FIELDS);

    metrics.recordReport(report({
      totals: {
        diffs: financialCodes.map((code) => ({ code, status: 'MAJOR_DELTA', severity: 'RED' })),
      } as BalanceDisplayShadowDiffReport['totals'],
      bucketDiffs: [],
      cutoverReadiness: {
        safeForPrimaryDisplay: false,
        blockers: [
          ...financialCodes.map((code) => `MISSING_${code}_COMPARISON_EVIDENCE`),
          'MISSING_PAYMENT_ALLOCATION_COMPARISON_EVIDENCE',
          'MISSING_INTEREST_BASE_COMPARISON_EVIDENCE',
          'MISSING_FEE_PROJECTION_COMPARISON_EVIDENCE',
          'FINAL_DEBT_STATES_MISSING',
          'CURRENCY_MISMATCH',
          'CANONICAL_CURRENCY_UNSAFE',
          'FINAL_DEBT_STATES_CURRENCY_MISMATCH',
          'CONTEXT_MISMATCH',
          'CANONICAL_UNSAFE_FOR_PRIMARY_DISPLAY',
          'CLAIM_ITEM_AUTHORITY_CONTAMINATION',
        ],
      } as BalanceDisplayShadowDiffReport['cutoverReadiness'],
    }), 1);

    const discrepancies = await registry.getSingleMetric('adr014_financial_discrepancies_total')?.get();
    const missingEvidence = await registry.getSingleMetric('adr014_missing_evidence_total')?.get();
    const integrityFailures = await registry.getSingleMetric('adr014_integrity_failures_total')?.get();
    expect(discrepancies?.values).toHaveLength(financialCodes.length);
    expect(missingEvidence?.values).toHaveLength(financialCodes.length + 4);
    expect(integrityFailures?.values).toHaveLength(6);
  });

  it('prototype veya serbest kodlari financial label allowlistine almaz', async () => {
    const registry = new Registry();
    const metrics = new BalanceDisplayShadowDiffMetrics(registry);

    metrics.recordReport(report({
      totals: {
        diffs: [{ code: 'toString', status: 'MAJOR_DELTA', severity: 'RED' }],
      } as BalanceDisplayShadowDiffReport['totals'],
      bucketDiffs: [],
      cutoverReadiness: {
        safeForPrimaryDisplay: false,
        blockers: ['toString'],
      } as BalanceDisplayShadowDiffReport['cutoverReadiness'],
    }), 1);

    const output = await registry.metrics();
    expect(output).not.toContain('discrepancy_code="toString"');
    expect(output).not.toContain('financial_field="function');
  });

  it('blocker olmayan report icin yalniz SAFE dagilimini kaydeder', async () => {
    const registry = new Registry();
    const metrics = new BalanceDisplayShadowDiffMetrics(registry);

    metrics.recordReport(report({
      totals: { diffs: [] } as BalanceDisplayShadowDiffReport['totals'],
      bucketDiffs: [],
      cutoverReadiness: {
        safeForPrimaryDisplay: true,
        safeForOptInShadow: true,
        blockers: [],
        nextRequiredEvidence: [],
      },
    }), 1);

    const output = await registry.metrics();
    expect(output).toContain('adr014_primary_display_safety_total{result="SAFE"} 1');
    expect(output).not.toContain('adr014_primary_display_safety_total{result="UNSAFE"}');
  });

  it('source unavailable sonucunu READY veya BLOCKED olarak gizlemez', async () => {
    const registry = new Registry();
    const metrics = new BalanceDisplayShadowDiffMetrics(registry);

    metrics.recordReport(report({
      sources: {
        legacyCalculationSummary: { available: false },
        canonicalBalanceDisplay: { available: true },
      } as BalanceDisplayShadowDiffReport['sources'],
    }), 0);

    const output = await registry.metrics();
    expect(output).toContain('adr014_shadow_requests_total{outcome="SOURCE_UNAVAILABLE"} 1');
  });

  it('component durationlarini bounded component/result etiketleriyle saniye olarak kaydeder', async () => {
    const registry = new Registry();
    const metrics = new BalanceDisplayShadowDiffMetrics(registry);

    metrics.recordCalculationDuration('LEGACY', 'SUCCESS', 125);
    metrics.recordCalculationDuration('CANONICAL', 'ERROR', 250);
    metrics.recordCalculationDuration('SHADOW_COMPARE', 'SUCCESS', -5);

    const output = await registry.metrics();
    expect(output).toContain(
      'adr014_calculation_duration_seconds_sum{component="LEGACY",result="SUCCESS"} 0.125',
    );
    expect(output).toContain(
      'adr014_calculation_duration_seconds_count{component="LEGACY",result="SUCCESS"} 1',
    );
    expect(output).toContain(
      'adr014_calculation_duration_seconds_sum{component="CANONICAL",result="ERROR"} 0.25',
    );
    expect(output).toContain(
      'adr014_calculation_duration_seconds_sum{component="SHADOW_COMPARE",result="SUCCESS"} 0',
    );
    expect(output).not.toContain('tenant');
    expect(output).not.toContain('case');
    expect(output).not.toContain('amount');
  });
});
