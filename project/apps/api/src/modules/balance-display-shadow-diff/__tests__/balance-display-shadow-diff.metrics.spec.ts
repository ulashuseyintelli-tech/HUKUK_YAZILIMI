import { Registry } from 'prom-client';
import { BalanceDisplayShadowDiffMetrics } from '../balance-display-shadow-diff.metrics';
import type { BalanceDisplayShadowDiffReport } from '../balance-display-shadow-diff.types';

function report(overrides: Partial<BalanceDisplayShadowDiffReport> = {}): BalanceDisplayShadowDiffReport {
  return {
    sources: {
      legacyCalculationSummary: { available: true },
      canonicalBalanceDisplay: { available: true },
    },
    totals: {
      diffs: [{ code: 'OUTSTANDING_DELTA', status: 'MAJOR_DELTA', severity: 'RED' }],
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
    expect(output).not.toContain('tenant-secret');
    expect(output).not.toContain('case-secret');
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
});
