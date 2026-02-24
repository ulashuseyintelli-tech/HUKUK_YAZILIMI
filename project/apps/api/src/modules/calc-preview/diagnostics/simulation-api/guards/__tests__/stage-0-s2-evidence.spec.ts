/**
 * Stage-0 S2 Evidence Collection — Inhibition Validation
 *
 * Task 3.2 — Validates inhibition model:
 *   RedriveRateCheckFailed (critical, redrive) suppresses
 *   RedriveTxDurationHigh (warning, redrive) via equal: [component]
 *
 * Also validates cross-component inhibition does NOT apply.
 * Evidence checklist: S2-E1 through S2-E5.
 *
 * @see .kiro/specs/stage-0-shadow-rollout/requirements.md — R6.1, R6.2, R6.3
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

interface InhibitRule {
  source_matchers?: string[];
  target_matchers?: string[];
  equal?: string[];
}

interface AlertmanagerConfig {
  inhibit_rules?: InhibitRule[];
  route?: { routes?: Array<{ match?: Record<string, string> }> };
}

// ============================================================================
// S2 Evidence Checklist Model
// ============================================================================

interface S2Evidence {
  id: string;
  description: string;
  command: string;
  expected: string;
  status: 'PASS' | 'FAIL' | 'PENDING';
}

const S2_EVIDENCE_CHECKLIST: S2Evidence[] = [
  {
    id: 'S2-E1',
    description: 'Prometheus: both alerts firing',
    command: 'curl .../api/v1/alerts',
    expected: 'RedriveRateCheckFailed: firing, RedriveTxDurationHigh: firing',
    status: 'PENDING',
  },
  {
    id: 'S2-E2',
    description: 'Alertmanager: inhibition active',
    command: 'curl .../api/v2/alerts',
    expected: 'RedriveTxDurationHigh.status.inhibitedBy: [non-empty]',
    status: 'PENDING',
  },
  {
    id: 'S2-E3',
    description: 'PD: critical delivered',
    command: 'PD dashboard',
    expected: 'RedriveRateCheckFailed incident present',
    status: 'PENDING',
  },
  {
    id: 'S2-E4',
    description: 'Slack: warning NOT delivered',
    command: 'Slack channel screenshot',
    expected: '#redrive-alerts: NO RedriveTxDurationHigh message',
    status: 'PENDING',
  },
  {
    id: 'S2-E5',
    description: 'Inhibition evidence format',
    command: 'Alertmanager API/UI',
    expected: 'state: suppressed, receiver delivery: none',
    status: 'PENDING',
  },
];

// ============================================================================
// Helpers
// ============================================================================

function loadRedriveAlertRules(): { groups: AlertGroup[] } {
  const yamlPath = path.resolve(
    __dirname,
    '../../../../../../../../../ops/prometheus/redrive-alerts.yml',
  );
  return yaml.load(fs.readFileSync(yamlPath, 'utf-8')) as { groups: AlertGroup[] };
}

function loadAlertmanagerConfig(): AlertmanagerConfig {
  const yamlPath = path.resolve(
    __dirname,
    '../../../../../../../../../ops/alertmanager/alertmanager.yml',
  );
  return yaml.load(fs.readFileSync(yamlPath, 'utf-8')) as AlertmanagerConfig;
}

/**
 * Simulates Alertmanager inhibition logic:
 * If source alert (critical) and target alert (warning) share the same
 * value for all `equal` fields, the target is suppressed.
 */
function isInhibited(
  inhibitRules: InhibitRule[],
  sourceLabels: Record<string, string>,
  targetLabels: Record<string, string>,
): boolean {
  for (const rule of inhibitRules) {
    const srcMatch = rule.source_matchers?.every(m => {
      const [key, val] = parseMatcher(m);
      return sourceLabels[key] === val;
    });
    const tgtMatch = rule.target_matchers?.every(m => {
      const [key, val] = parseMatcher(m);
      return targetLabels[key] === val;
    });
    const eqMatch = rule.equal?.every(
      field => sourceLabels[field] === targetLabels[field],
    );

    if (srcMatch && tgtMatch && eqMatch) return true;
  }
  return false;
}

function parseMatcher(matcher: string): [string, string] {
  // Handles: 'severity = "critical"' or 'severity="critical"'
  const cleaned = matcher.replace(/\s/g, '').replace(/"/g, '');
  const [key, val] = cleaned.split('=');
  return [key, val];
}

// ============================================================================
// Tests
// ============================================================================

describe('Stage-0 S2 Evidence — Inhibition Validation (Task 3.2)', () => {
  let redriveRules: { groups: AlertGroup[] };
  let amConfig: AlertmanagerConfig;
  let rateCheckFailed: AlertRule | undefined;
  let txDurationHigh: AlertRule | undefined;

  beforeAll(() => {
    redriveRules = loadRedriveAlertRules();
    amConfig = loadAlertmanagerConfig();

    const allRules = redriveRules.groups.flatMap(g => g.rules);
    rateCheckFailed = allRules.find(r => r.alert === 'RedriveRateCheckFailed');
    txDurationHigh = allRules.find(r => r.alert === 'RedriveTxDurationHigh');
  });

  describe('Inhibitor Alert — RedriveRateCheckFailed', () => {
    it('should exist in redrive_alerts group', () => {
      expect(rateCheckFailed).toBeDefined();
    });

    it('should have severity=critical', () => {
      expect(rateCheckFailed!.labels!.severity).toBe('critical');
    });

    it('should have component=redrive', () => {
      expect(rateCheckFailed!.labels!.component).toBe('redrive');
    });

    it('should have for: 0m (instant fire)', () => {
      expect(rateCheckFailed!.for).toBe('0m');
    });
  });

  describe('Target Alert — RedriveTxDurationHigh', () => {
    it('should exist in redrive_alerts group', () => {
      expect(txDurationHigh).toBeDefined();
    });

    it('should have severity=warning', () => {
      expect(txDurationHigh!.labels!.severity).toBe('warning');
    });

    it('should have component=redrive', () => {
      expect(txDurationHigh!.labels!.component).toBe('redrive');
    });
  });

  describe('Inhibition Rule — Same Component Suppression', () => {
    it('inhibit_rules should contain critical→warning rule with equal: [component]', () => {
      const rule = amConfig.inhibit_rules!.find(r => {
        const srcCritical = r.source_matchers?.some(m => m.includes('critical'));
        const tgtWarning = r.target_matchers?.some(m => m.includes('warning'));
        const eqComponent = r.equal?.includes('component');
        return srcCritical && tgtWarning && eqComponent;
      });
      expect(rule).toBeDefined();
    });

    it('RedriveRateCheckFailed (critical) should inhibit RedriveTxDurationHigh (warning) — same component', () => {
      const sourceLabels = rateCheckFailed!.labels!;
      const targetLabels = txDurationHigh!.labels!;

      const inhibited = isInhibited(
        amConfig.inhibit_rules!,
        sourceLabels,
        targetLabels,
      );
      expect(inhibited).toBe(true);
    });
  });

  describe('Cross-Component Inhibition — Must NOT Apply', () => {
    it('guard critical should NOT inhibit redrive warning (different component)', () => {
      const guardCriticalLabels = {
        severity: 'critical',
        team: 'backend',
        component: 'guard',
      };
      const redriveWarningLabels = txDurationHigh!.labels!;

      const inhibited = isInhibited(
        amConfig.inhibit_rules!,
        guardCriticalLabels,
        redriveWarningLabels,
      );
      expect(inhibited).toBe(false);
    });

    it('simulation critical should NOT inhibit redrive warning (different component)', () => {
      const simCriticalLabels = {
        severity: 'critical',
        team: 'backend',
        component: 'simulation',
      };
      const redriveWarningLabels = txDurationHigh!.labels!;

      const inhibited = isInhibited(
        amConfig.inhibit_rules!,
        simCriticalLabels,
        redriveWarningLabels,
      );
      expect(inhibited).toBe(false);
    });
  });

  describe('S2 Evidence Checklist Structure', () => {
    it('should have 5 evidence items (S2-E1 through S2-E5)', () => {
      expect(S2_EVIDENCE_CHECKLIST).toHaveLength(5);
    });

    it('each evidence item should have required fields', () => {
      for (const item of S2_EVIDENCE_CHECKLIST) {
        expect(item.id).toBeDefined();
        expect(item.description).toBeDefined();
        expect(item.command).toBeDefined();
        expect(item.expected).toBeDefined();
        expect(item.status).toBeDefined();
      }
    });

    it('S2-E1 should reference both alerts firing in Prometheus', () => {
      const e1 = S2_EVIDENCE_CHECKLIST.find(e => e.id === 'S2-E1');
      expect(e1!.expected).toContain('RedriveRateCheckFailed');
      expect(e1!.expected).toContain('RedriveTxDurationHigh');
    });

    it('S2-E2 should reference inhibitedBy in Alertmanager', () => {
      const e2 = S2_EVIDENCE_CHECKLIST.find(e => e.id === 'S2-E2');
      expect(e2!.expected).toContain('inhibitedBy');
    });

    it('S2-E4 should reference Slack channel with NO delivery', () => {
      const e4 = S2_EVIDENCE_CHECKLIST.find(e => e.id === 'S2-E4');
      expect(e4!.expected).toContain('NO');
    });

    it('S2-E5 should reference suppressed state and delivery=none', () => {
      const e5 = S2_EVIDENCE_CHECKLIST.find(e => e.id === 'S2-E5');
      expect(e5!.expected).toContain('suppressed');
      expect(e5!.expected).toContain('none');
    });
  });
});
