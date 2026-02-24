/**
 * Stage-0 Dashboard Panel Query Validity
 *
 * Task 8.2 — Parses guard-dashboard.json and validates critical panels
 * exist with non-empty titles and at least one target with non-empty expr.
 *
 * @see .kiro/specs/stage-0-shadow-rollout/requirements.md — R7.1, R7.2, R7.3
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface DashboardTarget {
  expr?: string;
  legendFormat?: string;
}

interface DashboardPanel {
  title?: string;
  type?: string;
  targets?: DashboardTarget[];
  datasource?: { uid?: string; type?: string } | string;
  panels?: DashboardPanel[]; // collapsed row sub-panels
}

interface DashboardJson {
  dashboard: {
    title: string;
    panels: DashboardPanel[];
  };
}

// ============================================================================
// Critical Panels — 9 panels from design doc
// ============================================================================

const CRITICAL_PANELS = [
  'Guard Decision Distribution',
  'CAS Conflict Rate',
  'DB Timeout Rate',
  'Clock Skew (p99)',
  'Kill-Switch State',
  'SD-1: Structural Drift Rate (by type)',
  'SD-1: Drift Provider Errors',
  'Shadow Would-Enforce Rate',
  'Promote Gate — Pass/Fail',
];

// ============================================================================
// Helpers
// ============================================================================

function loadDashboard(): DashboardJson {
  const jsonPath = path.resolve(
    __dirname,
    '../../../../../../../../../ops/grafana/guard-dashboard.json',
  );
  const content = fs.readFileSync(jsonPath, 'utf-8');
  return JSON.parse(content) as DashboardJson;
}

function flattenPanels(panels: DashboardPanel[]): DashboardPanel[] {
  const result: DashboardPanel[] = [];
  for (const panel of panels) {
    result.push(panel);
    if (panel.panels) {
      result.push(...flattenPanels(panel.panels));
    }
  }
  return result;
}

// ============================================================================
// Tests
// ============================================================================

describe('Stage-0 Dashboard Panel Query Validity (Task 8.2)', () => {
  let dashboard: DashboardJson;
  let allPanels: DashboardPanel[];

  beforeAll(() => {
    dashboard = loadDashboard();
    allPanels = flattenPanels(dashboard.dashboard.panels);
  });

  it('should parse dashboard JSON without errors', () => {
    expect(dashboard).toBeDefined();
    expect(dashboard.dashboard).toBeDefined();
    expect(dashboard.dashboard.title).toBe(
      'Operational Guard — Pipeline Protection',
    );
  });

  it('should have panels array', () => {
    expect(Array.isArray(dashboard.dashboard.panels)).toBe(true);
    expect(dashboard.dashboard.panels.length).toBeGreaterThan(0);
  });

  describe('Critical Panel Existence', () => {
    const panelTitles = new Set<string>();

    beforeAll(() => {
      for (const panel of allPanels) {
        if (panel.title) panelTitles.add(panel.title);
      }
    });

    it.each(CRITICAL_PANELS)(
      '"%s" should exist in dashboard',
      (panelTitle) => {
        expect(panelTitles.has(panelTitle)).toBe(true);
      },
    );
  });

  describe('Critical Panel Query Validity', () => {
    it.each(CRITICAL_PANELS)(
      '"%s" should have at least one target with non-empty expr',
      (panelTitle) => {
        const panel = allPanels.find(p => p.title === panelTitle);
        expect(panel).toBeDefined();

        // Promote Gate is a stat panel with sub-targets in a different structure
        // but still should have targets
        const targets = panel!.targets ?? [];
        expect(targets.length).toBeGreaterThan(0);

        const hasValidExpr = targets.some(
          t => t.expr && t.expr.trim().length > 0,
        );
        expect(hasValidExpr).toBe(true);
      },
    );
  });

  describe('Datasource UID Consistency', () => {
    it('all panels with datasource should reference the same UID or use default', () => {
      const uids = new Set<string>();
      for (const panel of allPanels) {
        if (panel.datasource && typeof panel.datasource === 'object') {
          if (panel.datasource.uid) {
            uids.add(panel.datasource.uid);
          }
        }
      }
      // Either all panels use default (no explicit datasource) or all use same UID
      // 0 UIDs = all default, 1 UID = consistent, >1 = inconsistent
      expect(uids.size).toBeLessThanOrEqual(1);
    });
  });

  describe('Panel Count', () => {
    it('should have at least 9 critical panels', () => {
      const titles = new Set(allPanels.map(p => p.title).filter(Boolean));
      const found = CRITICAL_PANELS.filter(cp => titles.has(cp));
      expect(found.length).toBe(CRITICAL_PANELS.length);
    });
  });
});
