/**
 * T0 Run Sheet — Artifact Validation Tests
 *
 * T0 Shadow Deploy Run Sheet — Task 3.1
 *
 * Validates that the T0 run sheet's artifact references are consistent
 * with actual files:
 *   - Alert rules (A1–A9) exist in guard-alerts.yml
 *   - Dashboard panels exist in guard-dashboard.json
 *   - Metric names appear in dashboard target expressions
 *
 * @see .kiro/specs/t0-shadow-deploy-runsheet/requirements.md — R7.1, R7.2, R7.3, R7.4
 * @see .kiro/specs/t0-shadow-deploy-runsheet/design.md — Property 1, 2, 3
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ============================================================================
// Reference lists — items referenced in the T0 run sheet
// ============================================================================

const REFERENCED_ALERT_NAMES = [
  'GuardCASConflictStorm',       // A1
  'GuardDBTimeoutSpike',         // A2
  'GuardClockSkewBreach',        // A3
  'GuardAlertFireLatencyBreach', // A4
  'GuardKillSwitchEnabled',      // A5
  'GuardShadowDriftHigh',        // A6
  'GuardShadowLatencyOverhead',  // A7
  'GuardDriftDetectedShadow',    // A8
  'GuardDriftDetectedEnforce',   // A8e
  'GuardDriftProviderError',     // A9
];

const REFERENCED_PANEL_TITLES = [
  'T0: Structural Drift Rate',
  'T0: Drift Provider Errors',
  'T0: HTTP 503 Trend (NR-3)',
];

const REFERENCED_METRICS = [
  'simulation_drift_total',
  'drift_provider_errors_total',
  'guard_decision_total',
  'guard_shadow_would_enforce_total',
  'guard_snapshot_duration_seconds',
  'kill_switch_state',
];

// ============================================================================
// Path resolution — 9 levels up from __tests__ to project root
// (matches guard-alerts-validation.spec.ts pattern)
// ============================================================================

const PROJECT_ROOT = path.resolve(__dirname, '../../../../../../../../../');
const ALERTS_PATH = path.join(PROJECT_ROOT, 'ops/prometheus/guard-alerts.yml');
const DASHBOARD_PATH = path.join(PROJECT_ROOT, 'ops/grafana/guard-dashboard.json');


// ============================================================================
// Helpers
// ============================================================================

/** Recursively extract all panel titles from dashboard JSON (handles collapsed rows) */
function extractAllPanelTitles(dashboardRoot: any): string[] {
  const titles: string[] = [];
  function walk(panels: any[]) {
    if (!panels) return;
    for (const panel of panels) {
      if (panel.title) titles.push(panel.title);
      if (panel.panels) walk(panel.panels); // collapsed row panels
    }
  }
  // dashboard JSON wraps panels under "dashboard" key
  const panels = dashboardRoot?.dashboard?.panels ?? dashboardRoot?.panels ?? [];
  walk(panels);
  return titles;
}

// ============================================================================
// Tests
// ============================================================================

describe('T0 Run Sheet — Artifact Validation', () => {
  // ==========================================================================
  // Property 1: Alert rule reference consistency
  // Feature: t0-shadow-deploy-runsheet, Property 1
  // **Validates: Requirements 7.1**
  // ==========================================================================
  describe('Alert Rule References', () => {
    let allAlertNames: string[];

    beforeAll(() => {
      const content = fs.readFileSync(ALERTS_PATH, 'utf-8');
      const parsed = yaml.load(content) as any;
      allAlertNames = [];
      if (parsed?.groups) {
        for (const group of parsed.groups) {
          if (group.rules) {
            for (const rule of group.rules) {
              if (rule.alert) allAlertNames.push(rule.alert);
            }
          }
        }
      }
    });

    it.each(REFERENCED_ALERT_NAMES)(
      'alert rule "%s" guard-alerts.yml içinde tanımlı olmalı',
      (alertName) => {
        expect(allAlertNames).toContain(alertName);
      },
    );
  });

  // ==========================================================================
  // Property 2: Dashboard panel reference consistency
  // Feature: t0-shadow-deploy-runsheet, Property 2
  // **Validates: Requirements 7.2**
  // ==========================================================================
  describe('Dashboard Panel References', () => {
    let allTitles: string[];

    beforeAll(() => {
      const content = fs.readFileSync(DASHBOARD_PATH, 'utf-8');
      const dashboardData = JSON.parse(content);
      allTitles = extractAllPanelTitles(dashboardData);
    });

    it.each(REFERENCED_PANEL_TITLES)(
      'panel "%s" guard-dashboard.json içinde mevcut olmalı',
      (panelTitle) => {
        expect(allTitles).toContain(panelTitle);
      },
    );
  });

  // ==========================================================================
  // Property 3: Metric reference consistency
  // Feature: t0-shadow-deploy-runsheet, Property 3
  // **Validates: Requirements 7.3**
  // ==========================================================================
  describe('Metric References', () => {
    let dashboardContent: string;

    beforeAll(() => {
      dashboardContent = fs.readFileSync(DASHBOARD_PATH, 'utf-8');
    });

    it.each(REFERENCED_METRICS)(
      'metrik "%s" dashboard target\'larında bulunmalı',
      (metricName) => {
        expect(dashboardContent).toContain(metricName);
      },
    );
  });
});
