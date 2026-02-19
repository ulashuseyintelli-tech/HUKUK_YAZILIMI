/**
 * Property 1: Guard Metric Exposition Tutarlılığı
 *
 * Feature: i0-metrics-runway
 * Validates: Requirements 7.1, 2.2
 *
 * For any metric name referenced in guard-dashboard.json T0 Shadow Deploy row,
 * that metric name MUST appear in GET /metrics output.
 *
 * This is a structural property test — it parses the dashboard JSON
 * and validates metric name presence.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Feature: i0-metrics-runway — Property 1: Guard Metric Exposition Tutarlılığı', () => {
  // T0 row expected metric names (from guard-dashboard.json T0 Shadow Deploy row)
  const T0_EXPECTED_METRICS = [
    'simulation_drift_total',
    'drift_provider_errors_total',
    'http_responses_total',
  ];

  it('T0 row panel PromQL expressions should reference only I0-defined metrics', () => {
    const dashboardPath = path.resolve(
      __dirname,
      '../../../../../../ops/grafana/guard-dashboard.json',
    );
    const raw = fs.readFileSync(dashboardPath, 'utf-8');
    const dashboard = JSON.parse(raw);

    // Find T0 Shadow Deploy row
    const t0Row = dashboard.dashboard.panels.find(
      (p: any) => p.title === 'T0 Shadow Deploy' && p.type === 'row',
    );
    expect(t0Row).toBeDefined();
    expect(t0Row.panels).toBeDefined();

    // Extract metric names from PromQL expressions
    const metricNames = new Set<string>();
    for (const panel of t0Row.panels) {
      for (const target of panel.targets) {
        // Extract metric name from PromQL: first word-like token before { or [
        const match = target.expr.match(/\b([a-z_][a-z0-9_]*)\b/);
        if (match) {
          // Skip PromQL functions
          const name = match[1];
          if (!['sum', 'rate', 'histogram_quantile', 'avg', 'count', 'absent'].includes(name)) {
            metricNames.add(name);
          } else {
            // Try to find the actual metric name after the function
            const innerMatch = target.expr.match(/\b((?:simulation|drift|http|guard|kill)[a-z0-9_]*)\b/);
            if (innerMatch) metricNames.add(innerMatch[1]);
          }
        }
      }
    }

    // Every T0 metric referenced in dashboard must be in our expected list
    for (const name of metricNames) {
      expect(T0_EXPECTED_METRICS).toContain(name);
    }

    // Every expected metric must be referenced in dashboard
    for (const expected of T0_EXPECTED_METRICS) {
      expect(metricNames.has(expected)).toBe(true);
    }
  });
});
