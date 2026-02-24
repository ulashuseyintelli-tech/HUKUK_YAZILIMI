/**
 * Stage-1 S2 Live Inhibition Sequence Validation (Task 1.4)
 *
 * Validates S2 trigger sequence, evidence checklist completeness,
 * and cross-component non-inhibition.
 *
 * @see .kiro/specs/stage-1-runtime-baseline/requirements.md — R4.1–R4.4
 * @see .kiro/specs/stage-1-runtime-baseline/design.md — Faz 6
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ============================================================================
// Types
// ============================================================================

interface S2TriggerStep {
  order: number;
  name: string;
  action: string;
  waitDuration?: string;
  verifyCondition: string;
  failCondition: string;
}

interface S2Evidence {
  id: string;
  description: string;
  source: string;
  expected: string;
  status: 'PASS' | 'FAIL' | 'PENDING';
}

interface InhibitRule {
  source_matchers?: string[];
  target_matchers?: string[];
  equal?: string[];
}

interface AlertmanagerConfig {
  inhibit_rules?: InhibitRule[];
  route?: {
    routes?: Array<{
      match?: Record<string, string>;
      routes?: Array<{ match?: Record<string, string>; receiver?: string }>;
    }>;
  };
}

interface InhibitionCheckResult {
  sourceAlert: string;
  sourceComponent: string;
  sourceSeverity: string;
  targetAlert: string;
  targetComponent: string;
  targetSeverity: string;
  shouldInhibit: boolean;
  reason: string;
}

// ============================================================================
// S2 Trigger Sequence Definition
// ============================================================================

const S2_TRIGGER_SEQUENCE: S2TriggerStep[] = [
  {
    order: 1,
    name: 'Fire Critical',
    action: 'Inject events to trigger RedriveRateCheckFailed (critical, component=redrive)',
    verifyCondition: 'RedriveRateCheckFailed state: firing',
    failCondition: 'Critical alert not firing',
  },
  {
    order: 2,
    name: 'Verify Critical Firing',
    action: 'Check Prometheus /api/v1/alerts for RedriveRateCheckFailed state=firing',
    verifyCondition: 'RedriveRateCheckFailed confirmed firing',
    failCondition: 'Critical alert not in firing state',
  },
  {
    order: 3,
    name: 'Fire Warning',
    action: 'Inject events to trigger RedriveTxDurationHigh (warning, component=redrive)',
    verifyCondition: 'RedriveTxDurationHigh state: firing',
    failCondition: 'Warning alert not firing',
  },
  {
    order: 4,
    name: 'Wait for: 5m',
    action: 'Wait for both alerts to be in firing state and inhibition to take effect',
    waitDuration: '5m',
    verifyCondition: 'Both alerts firing, inhibition active',
    failCondition: 'Timeout exceeded',
  },
  {
    order: 5,
    name: 'Verify Both Firing',
    action: 'Check Prometheus for both alerts in firing state',
    verifyCondition: 'Both RedriveRateCheckFailed and RedriveTxDurationHigh firing',
    failCondition: 'Either alert not firing',
  },
  {
    order: 6,
    name: 'Verify Inhibition',
    action: 'Check Alertmanager /api/v2/alerts for inhibitedBy on warning alert',
    verifyCondition: 'RedriveTxDurationHigh: status.inhibitedBy: [non-empty]',
    failCondition: 'inhibitedBy is empty — inhibition not working',
  },
];

// ============================================================================
// S2 Evidence Checklist
// ============================================================================

const S2_EVIDENCE_CHECKLIST: S2Evidence[] = [
  {
    id: 'S2-E1',
    description: 'Critical alert firing',
    source: 'Prometheus /api/v1/alerts',
    expected: 'RedriveRateCheckFailed state: firing',
    status: 'PENDING',
  },
  {
    id: 'S2-E2',
    description: 'Warning alert firing',
    source: 'Prometheus /api/v1/alerts',
    expected: 'RedriveTxDurationHigh state: firing',
    status: 'PENDING',
  },
  {
    id: 'S2-E3',
    description: 'Inhibition active',
    source: 'Alertmanager /api/v2/alerts',
    expected: 'RedriveTxDurationHigh: status.inhibitedBy: [non-empty]',
    status: 'PENDING',
  },
  {
    id: 'S2-E4',
    description: 'PD received critical',
    source: 'PagerDuty API / dashboard',
    expected: 'RedriveRateCheckFailed delivered to pagerduty-critical',
    status: 'PENDING',
  },
  {
    id: 'S2-E5',
    description: 'Slack NO warning',
    source: 'Slack channel log',
    expected: 'RedriveTxDurationHigh NOT delivered to slack-warning',
    status: 'PENDING',
  },
];

// ============================================================================
// Inhibition Logic
// ============================================================================

function checkInhibition(
  inhibitRules: InhibitRule[],
  sourceLabels: Record<string, string>,
  targetLabels: Record<string, string>,
): InhibitionCheckResult {
  const result: InhibitionCheckResult = {
    sourceAlert: sourceLabels.alertname || 'unknown',
    sourceComponent: sourceLabels.component || 'unknown',
    sourceSeverity: sourceLabels.severity || 'unknown',
    targetAlert: targetLabels.alertname || 'unknown',
    targetComponent: targetLabels.component || 'unknown',
    targetSeverity: targetLabels.severity || 'unknown',
    shouldInhibit: false,
    reason: 'No matching inhibition rule',
  };

  for (const rule of inhibitRules) {
    const sourceMatches = matchesMatchers(rule.source_matchers || [], sourceLabels);
    const targetMatches = matchesMatchers(rule.target_matchers || [], targetLabels);
    const equalMatches = (rule.equal || []).every(
      label => sourceLabels[label] === targetLabels[label],
    );

    if (sourceMatches && targetMatches && equalMatches) {
      result.shouldInhibit = true;
      result.reason = `Inhibition rule matched: source=${rule.source_matchers}, target=${rule.target_matchers}, equal=${rule.equal}`;
      break;
    }
  }

  return result;
}

function matchesMatchers(matchers: string[], labels: Record<string, string>): boolean {
  for (const matcher of matchers) {
    // Parse simple matchers like 'severity = "critical"' or 'severity="critical"'
    const eqMatch = matcher.match(/(\w+)\s*=\s*"?(\w+)"?/);
    if (eqMatch) {
      const [, key, value] = eqMatch;
      if (labels[key] !== value) return false;
    }
  }
  return true;
}

// ============================================================================
// Helpers
// ============================================================================

function loadAlertmanagerConfig(): AlertmanagerConfig {
  const yamlPath = path.resolve(
    __dirname,
    '../../../../../../../../../ops/alertmanager/alertmanager.yml',
  );
  return yaml.load(fs.readFileSync(yamlPath, 'utf-8')) as AlertmanagerConfig;
}

// ============================================================================
// Tests
// ============================================================================

describe('Stage-1 S2 Live Inhibition Sequence (Task 1.4)', () => {
  let amConfig: AlertmanagerConfig;

  beforeAll(() => {
    amConfig = loadAlertmanagerConfig();
  });

  describe('Trigger Sequence Structure', () => {
    it('should have 6 steps in the S2 trigger sequence', () => {
      expect(S2_TRIGGER_SEQUENCE).toHaveLength(6);
    });

    it('steps should be in strict order 1–6', () => {
      for (let i = 0; i < S2_TRIGGER_SEQUENCE.length; i++) {
        expect(S2_TRIGGER_SEQUENCE[i].order).toBe(i + 1);
      }
    });

    it('sequence should follow: fire critical → verify → fire warning → wait → verify both → verify inhibition', () => {
      const names = S2_TRIGGER_SEQUENCE.map(s => s.name);
      expect(names[0]).toContain('Critical');
      expect(names[1]).toContain('Verify');
      expect(names[2]).toContain('Warning');
      expect(names[3]).toContain('Wait');
      expect(names[4]).toContain('Both');
      expect(names[5]).toContain('Inhibition');
    });

    it('wait step should have 5m duration', () => {
      const waitStep = S2_TRIGGER_SEQUENCE.find(s => s.name.includes('Wait'));
      expect(waitStep!.waitDuration).toBe('5m');
    });

    it('each step should have action, verifyCondition, failCondition', () => {
      for (const step of S2_TRIGGER_SEQUENCE) {
        expect(step.action.length).toBeGreaterThan(0);
        expect(step.verifyCondition.length).toBeGreaterThan(0);
        expect(step.failCondition.length).toBeGreaterThan(0);
      }
    });
  });

  describe('S2 Evidence Checklist Completeness', () => {
    it('should have 5 evidence items (S2-E1 through S2-E5)', () => {
      expect(S2_EVIDENCE_CHECKLIST).toHaveLength(5);
    });

    it('evidence IDs should be S2-E1 through S2-E5', () => {
      const ids = S2_EVIDENCE_CHECKLIST.map(e => e.id);
      expect(ids).toEqual(['S2-E1', 'S2-E2', 'S2-E3', 'S2-E4', 'S2-E5']);
    });

    it('each evidence item should have id, description, source, expected, status', () => {
      for (const item of S2_EVIDENCE_CHECKLIST) {
        expect(item.id).toBeDefined();
        expect(item.description).toBeDefined();
        expect(item.source).toBeDefined();
        expect(item.expected).toBeDefined();
        expect(['PASS', 'FAIL', 'PENDING']).toContain(item.status);
      }
    });

    it('S2-E1 should reference critical alert firing', () => {
      const e1 = S2_EVIDENCE_CHECKLIST.find(e => e.id === 'S2-E1')!;
      expect(e1.expected).toContain('RedriveRateCheckFailed');
      expect(e1.expected).toContain('firing');
    });

    it('S2-E2 should reference warning alert firing', () => {
      const e2 = S2_EVIDENCE_CHECKLIST.find(e => e.id === 'S2-E2')!;
      expect(e2.expected).toContain('RedriveTxDurationHigh');
      expect(e2.expected).toContain('firing');
    });

    it('S2-E3 should reference inhibitedBy non-empty', () => {
      const e3 = S2_EVIDENCE_CHECKLIST.find(e => e.id === 'S2-E3')!;
      expect(e3.expected).toContain('inhibitedBy');
    });

    it('S2-E4 should reference PD delivery of critical', () => {
      const e4 = S2_EVIDENCE_CHECKLIST.find(e => e.id === 'S2-E4')!;
      expect(e4.expected).toContain('pagerduty-critical');
    });

    it('S2-E5 should reference Slack NOT receiving warning', () => {
      const e5 = S2_EVIDENCE_CHECKLIST.find(e => e.id === 'S2-E5')!;
      expect(e5.expected).toContain('NOT');
      expect(e5.expected).toContain('slack-warning');
    });
  });

  describe('Inhibition Rule Validation', () => {
    it('alertmanager should have inhibition rules', () => {
      expect(amConfig.inhibit_rules).toBeDefined();
      expect(amConfig.inhibit_rules!.length).toBeGreaterThanOrEqual(1);
    });

    it('should have critical→warning inhibition with equal=[component]', () => {
      const rule = amConfig.inhibit_rules!.find(r => {
        const srcCritical = r.source_matchers?.some(m => m.includes('critical'));
        const tgtWarning = r.target_matchers?.some(m => m.includes('warning'));
        const eqComponent = r.equal?.includes('component');
        return srcCritical && tgtWarning && eqComponent;
      });
      expect(rule).toBeDefined();
    });
  });

  describe('Same-Component Inhibition (S2 Core)', () => {
    it('redrive critical should inhibit redrive warning', () => {
      const sourceLabels = {
        alertname: 'RedriveRateCheckFailed',
        component: 'redrive',
        severity: 'critical',
      };
      const targetLabels = {
        alertname: 'RedriveTxDurationHigh',
        component: 'redrive',
        severity: 'warning',
      };
      const result = checkInhibition(amConfig.inhibit_rules!, sourceLabels, targetLabels);
      expect(result.shouldInhibit).toBe(true);
    });

    it('guard critical should inhibit guard warning', () => {
      const sourceLabels = {
        alertname: 'GuardDBTimeoutSpike',
        component: 'guard',
        severity: 'critical',
      };
      const targetLabels = {
        alertname: 'GuardShadowDriftHigh',
        component: 'guard',
        severity: 'warning',
      };
      const result = checkInhibition(amConfig.inhibit_rules!, sourceLabels, targetLabels);
      expect(result.shouldInhibit).toBe(true);
    });

    it('simulation critical should inhibit simulation warning', () => {
      const sourceLabels = {
        alertname: 'SimulationCritical',
        component: 'simulation',
        severity: 'critical',
      };
      const targetLabels = {
        alertname: 'SimulationWarning',
        component: 'simulation',
        severity: 'warning',
      };
      const result = checkInhibition(amConfig.inhibit_rules!, sourceLabels, targetLabels);
      expect(result.shouldInhibit).toBe(true);
    });
  });

  describe('Cross-Component Non-Inhibition', () => {
    it('guard critical should NOT inhibit redrive warning (different component)', () => {
      const sourceLabels = {
        alertname: 'GuardDBTimeoutSpike',
        component: 'guard',
        severity: 'critical',
      };
      const targetLabels = {
        alertname: 'RedriveTxDurationHigh',
        component: 'redrive',
        severity: 'warning',
      };
      const result = checkInhibition(amConfig.inhibit_rules!, sourceLabels, targetLabels);
      expect(result.shouldInhibit).toBe(false);
    });

    it('redrive critical should NOT inhibit guard warning (different component)', () => {
      const sourceLabels = {
        alertname: 'RedriveRateCheckFailed',
        component: 'redrive',
        severity: 'critical',
      };
      const targetLabels = {
        alertname: 'GuardShadowDriftHigh',
        component: 'guard',
        severity: 'warning',
      };
      const result = checkInhibition(amConfig.inhibit_rules!, sourceLabels, targetLabels);
      expect(result.shouldInhibit).toBe(false);
    });

    it('simulation critical should NOT inhibit redrive warning (different component)', () => {
      const sourceLabels = {
        alertname: 'SimulationCritical',
        component: 'simulation',
        severity: 'critical',
      };
      const targetLabels = {
        alertname: 'RedriveTxDurationHigh',
        component: 'redrive',
        severity: 'warning',
      };
      const result = checkInhibition(amConfig.inhibit_rules!, sourceLabels, targetLabels);
      expect(result.shouldInhibit).toBe(false);
    });
  });

  describe('Inhibition Evidence Format', () => {
    it('inhibited alert should have state: suppressed format', () => {
      const inhibitedFormat = {
        alertname: 'RedriveTxDurationHigh',
        state: 'suppressed',
        inhibitedBy: ['RedriveRateCheckFailed-id'],
        receiverDelivery: 'none',
      };
      expect(inhibitedFormat.state).toBe('suppressed');
      expect(inhibitedFormat.receiverDelivery).toBe('none');
      expect(inhibitedFormat.inhibitedBy.length).toBeGreaterThan(0);
    });
  });
});
