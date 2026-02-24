/**
 * Stage-0 Alert Rule Inventory Completeness
 *
 * Task 6.3 — Parses all 3 alert rule YAML files and validates
 * all 22 expected alerts present in correct groups.
 *
 * @see .kiro/specs/stage-0-shadow-rollout/requirements.md — R3.1, R3.2, R3.3
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ============================================================================
// Types
// ============================================================================

interface AlertRule {
  alert: string;
  expr: string;
  for?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

interface AlertGroup {
  name: string;
  rules: AlertRule[];
}

// ============================================================================
// Expected Inventory — 22 alerts across 3 groups
// ============================================================================

const EXPECTED_INVENTORY: Record<string, string[]> = {
  redrive_alerts: [
    'RedriveRateCheckFailed',
    'RedriveTxDurationHigh',
    'RedriveKillSwitchActive',
    'RedriveDepthExceeded',
    'RedriveScrapeDown',
  ],
  simulation_alerts: [
    'PromoteFailureRateHigh',
    'DriftDetectedSpikeHigh',
    'EscalationChurnHigh',
    'EscalationConflictSpikeHigh',
    'Phase7FaultSpikeHigh',
    'Phase7BlockRateHigh',
    'SimulationKillSwitchActive',
  ],
  guard_alerts: [
    'GuardCASConflictStorm',
    'GuardDBTimeoutSpike',
    'GuardClockSkewBreach',
    'GuardAlertFireLatencyBreach',
    'GuardKillSwitchEnabled',
    'GuardShadowDriftHigh',
    'GuardShadowLatencyOverhead',
    'GuardDriftDetectedShadow',
    'GuardDriftDetectedEnforce',
    'GuardDriftProviderError',
  ],
};

const TOTAL_EXPECTED = Object.values(EXPECTED_INVENTORY).flat().length; // 22

// ============================================================================
// Helpers
// ============================================================================

const OPS_ROOT = path.resolve(__dirname, '../../../../../../../../../ops/prometheus');

function loadAlertFile(filename: string): AlertGroup[] {
  const content = fs.readFileSync(path.join(OPS_ROOT, filename), 'utf-8');
  const doc = yaml.load(content) as { groups: AlertGroup[] };
  return doc.groups;
}

function loadAllGroups(): Map<string, AlertGroup> {
  const map = new Map<string, AlertGroup>();
  const files = ['redrive-alerts.yml', 'simulation-alerts.yml', 'guard-alerts.yml'];
  for (const file of files) {
    for (const group of loadAlertFile(file)) {
      map.set(group.name, group);
    }
  }
  return map;
}

// ============================================================================
// Tests
// ============================================================================

describe('Stage-0 Alert Rule Inventory Completeness (Task 6.3)', () => {
  let groups: Map<string, AlertGroup>;

  beforeAll(() => {
    groups = loadAllGroups();
  });

  it('should load all 3 expected rule groups', () => {
    for (const groupName of Object.keys(EXPECTED_INVENTORY)) {
      expect(groups.has(groupName)).toBe(true);
    }
  });

  it(`should contain exactly ${TOTAL_EXPECTED} alert rules total`, () => {
    let total = 0;
    for (const groupName of Object.keys(EXPECTED_INVENTORY)) {
      total += groups.get(groupName)!.rules.length;
    }
    expect(total).toBe(TOTAL_EXPECTED);
  });

  describe('redrive_alerts (5 alerts)', () => {
    it.each(EXPECTED_INVENTORY.redrive_alerts)(
      '%s should exist in redrive_alerts group',
      (alertName) => {
        const group = groups.get('redrive_alerts')!;
        const names = group.rules.map(r => r.alert);
        expect(names).toContain(alertName);
      },
    );
  });

  describe('simulation_alerts (7 alerts)', () => {
    it.each(EXPECTED_INVENTORY.simulation_alerts)(
      '%s should exist in simulation_alerts group',
      (alertName) => {
        const group = groups.get('simulation_alerts')!;
        const names = group.rules.map(r => r.alert);
        expect(names).toContain(alertName);
      },
    );
  });

  describe('guard_alerts (10 alerts)', () => {
    it.each(EXPECTED_INVENTORY.guard_alerts)(
      '%s should exist in guard_alerts group',
      (alertName) => {
        const group = groups.get('guard_alerts')!;
        const names = group.rules.map(r => r.alert);
        expect(names).toContain(alertName);
      },
    );
  });

  describe('Required fields validation', () => {
    it('every alert should have non-empty expr', () => {
      for (const group of groups.values()) {
        for (const rule of group.rules) {
          expect(rule.expr).toBeDefined();
          expect(rule.expr.trim().length).toBeGreaterThan(0);
        }
      }
    });

    it('every alert should have severity label', () => {
      for (const group of groups.values()) {
        for (const rule of group.rules) {
          expect(rule.labels).toBeDefined();
          expect(rule.labels!.severity).toBeDefined();
        }
      }
    });

    it('every alert should have team label', () => {
      for (const group of groups.values()) {
        for (const rule of group.rules) {
          expect(rule.labels!.team).toBe('backend');
        }
      }
    });

    it('every alert should have component label', () => {
      for (const group of groups.values()) {
        for (const rule of group.rules) {
          expect(rule.labels!.component).toBeDefined();
          expect(['redrive', 'simulation', 'guard']).toContain(
            rule.labels!.component,
          );
        }
      }
    });

    it('every alert should have summary annotation', () => {
      for (const group of groups.values()) {
        for (const rule of group.rules) {
          expect(rule.annotations).toBeDefined();
          expect(rule.annotations!.summary).toBeDefined();
          expect(rule.annotations!.summary.trim().length).toBeGreaterThan(0);
        }
      }
    });

    it('every alert should have description annotation', () => {
      for (const group of groups.values()) {
        for (const rule of group.rules) {
          expect(rule.annotations!.description).toBeDefined();
          expect(rule.annotations!.description.trim().length).toBeGreaterThan(0);
        }
      }
    });

    it('every alert should have runbook annotation', () => {
      for (const group of groups.values()) {
        for (const rule of group.rules) {
          expect(rule.annotations!.runbook).toBeDefined();
          expect(rule.annotations!.runbook.trim().length).toBeGreaterThan(0);
        }
      }
    });
  });
});
