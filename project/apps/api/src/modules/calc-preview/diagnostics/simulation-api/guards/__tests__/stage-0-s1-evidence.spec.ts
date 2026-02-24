/**
 * Stage-0 S1 Evidence Collection — GuardDBTimeoutSpike Route Validation
 *
 * Task 3.1 — Validates that GuardDBTimeoutSpike (severity=critical, component=guard)
 * resolves to pagerduty-critical receiver via parsed alertmanager config.
 * Validates evidence checklist structure (S1-E1 through S1-E4).
 * Validates PagerDuty dedup key derivation from group_by.
 *
 * @see .kiro/specs/stage-0-shadow-rollout/requirements.md — R5.1, R5.2, R5.3
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

interface AlertmanagerRoute {
  receiver?: string;
  match?: Record<string, string>;
  group_by?: string[];
  repeat_interval?: string;
  continue?: boolean;
  routes?: AlertmanagerRoute[];
}

interface AlertmanagerConfig {
  receivers?: Array<{ name: string; pagerduty_configs?: Array<{ service_key?: string; description?: string; details?: Record<string, string> }> }>;
  route?: AlertmanagerRoute;
}

// ============================================================================
// S1 Evidence Checklist Model
// ============================================================================

interface S1Evidence {
  id: string;
  description: string;
  command: string;
  expected: string;
  status: 'PASS' | 'FAIL' | 'PENDING';
}

const S1_EVIDENCE_CHECKLIST: S1Evidence[] = [
  {
    id: 'S1-E1',
    description: 'Prometheus alert firing',
    command: 'curl .../api/v1/alerts | grep GuardDBTimeoutSpike',
    expected: 'state: firing',
    status: 'PENDING',
  },
  {
    id: 'S1-E2',
    description: 'Alertmanager routing',
    command: 'curl .../api/v2/alerts | grep GuardDBTimeoutSpike',
    expected: 'receivers: [pagerduty-critical]',
    status: 'PENDING',
  },
  {
    id: 'S1-E3',
    description: 'PagerDuty incident',
    command: 'PD dashboard screenshot',
    expected: 'Incident opened, dedup_key = GuardDBTimeoutSpike/guard',
    status: 'PENDING',
  },
  {
    id: 'S1-E4',
    description: 'PD dedup validation',
    command: 'PD event detail',
    expected: 'fingerprint = hash(alertname=GuardDBTimeoutSpike, component=guard)',
    status: 'PENDING',
  },
];

// ============================================================================
// Helpers
// ============================================================================

function loadGuardAlertRules(): { groups: AlertGroup[] } {
  const yamlPath = path.resolve(
    __dirname,
    '../../../../../../../../../ops/prometheus/guard-alerts.yml',
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

function resolveReceiver(
  route: AlertmanagerRoute,
  labels: Record<string, string>,
): string {
  const receiver = route.receiver ?? 'slack-default';
  if (!route.routes || route.routes.length === 0) return receiver;

  for (const child of route.routes) {
    if (child.match && Object.entries(child.match).every(([k, v]) => labels[k] === v)) {
      const childResult = resolveReceiver(child, labels);
      if (childResult) return childResult;
      if (!child.continue) return child.receiver ?? receiver;
    }
  }
  return receiver;
}

// ============================================================================
// Tests
// ============================================================================

describe('Stage-0 S1 Evidence — GuardDBTimeoutSpike Route Validation (Task 3.1)', () => {
  let guardRules: { groups: AlertGroup[] };
  let amConfig: AlertmanagerConfig;
  let dbTimeoutAlert: AlertRule | undefined;

  beforeAll(() => {
    guardRules = loadGuardAlertRules();
    amConfig = loadAlertmanagerConfig();

    const allRules = guardRules.groups.flatMap(g => g.rules);
    dbTimeoutAlert = allRules.find(r => r.alert === 'GuardDBTimeoutSpike');
  });

  describe('Alert Rule Existence', () => {
    it('GuardDBTimeoutSpike should exist in guard_alerts group', () => {
      expect(dbTimeoutAlert).toBeDefined();
    });

    it('should have severity=critical label', () => {
      expect(dbTimeoutAlert!.labels!.severity).toBe('critical');
    });

    it('should have component=guard label', () => {
      expect(dbTimeoutAlert!.labels!.component).toBe('guard');
    });

    it('should have team=backend label', () => {
      expect(dbTimeoutAlert!.labels!.team).toBe('backend');
    });

    it('should have for: 2m condition', () => {
      expect(dbTimeoutAlert!.for).toBe('2m');
    });

    it('should have expr referencing db_write_timeout_total', () => {
      expect(dbTimeoutAlert!.expr).toContain('db_write_timeout_total');
    });
  });

  describe('Route Resolution — S1 Core', () => {
    it('GuardDBTimeoutSpike labels should resolve to pagerduty-critical', () => {
      const labels = {
        team: 'backend',
        component: 'guard',
        severity: 'critical',
        alertname: 'GuardDBTimeoutSpike',
      };
      const resolved = resolveReceiver(amConfig.route!, labels);
      expect(resolved).toBe('pagerduty-critical');
    });

    it('guard critical route should have repeat_interval: 1h', () => {
      const guardRoute = amConfig.route!.routes!.find(
        r => r.match?.component === 'guard',
      );
      const criticalRoute = guardRoute!.routes!.find(
        r => r.match?.severity === 'critical',
      );
      expect(criticalRoute!.repeat_interval).toBe('1h');
    });
  });

  describe('PagerDuty Dedup Key Derivation', () => {
    it('root group_by should include alertname and component', () => {
      const groupBy = amConfig.route!.group_by!;
      expect(groupBy).toContain('alertname');
      expect(groupBy).toContain('component');
    });

    it('PD dedup key is derived from group_by → (alertname, component) pair', () => {
      // PagerDuty dedup_key = Alertmanager group key hash
      // group_by: [alertname, component] → unique key per (alertname, component)
      // For GuardDBTimeoutSpike: dedup_key = hash(GuardDBTimeoutSpike, guard)
      const groupBy = amConfig.route!.group_by!;
      const dedupFields = { alertname: 'GuardDBTimeoutSpike', component: 'guard' };

      // Verify all dedup fields are in group_by
      for (const field of Object.keys(dedupFields)) {
        expect(groupBy).toContain(field);
      }
    });

    it('pagerduty-critical receiver should have service_key configured', () => {
      const pdReceiver = amConfig.receivers!.find(r => r.name === 'pagerduty-critical');
      expect(pdReceiver).toBeDefined();
      expect(pdReceiver!.pagerduty_configs).toBeDefined();
      expect(pdReceiver!.pagerduty_configs!.length).toBeGreaterThan(0);
      // service_key is a placeholder in config — just verify field exists
      expect(pdReceiver!.pagerduty_configs![0].service_key).toBeDefined();
    });

    it('pagerduty-critical receiver details should include component field', () => {
      const pdReceiver = amConfig.receivers!.find(r => r.name === 'pagerduty-critical');
      const details = pdReceiver!.pagerduty_configs![0].details;
      expect(details).toBeDefined();
      expect(details!.component).toBeDefined();
    });
  });

  describe('S1 Evidence Checklist Structure', () => {
    it('should have 4 evidence items (S1-E1 through S1-E4)', () => {
      expect(S1_EVIDENCE_CHECKLIST).toHaveLength(4);
    });

    it('each evidence item should have id, description, command, expected, status', () => {
      for (const item of S1_EVIDENCE_CHECKLIST) {
        expect(item.id).toBeDefined();
        expect(item.description).toBeDefined();
        expect(item.command).toBeDefined();
        expect(item.expected).toBeDefined();
        expect(item.status).toBeDefined();
        expect(['PASS', 'FAIL', 'PENDING']).toContain(item.status);
      }
    });

    it('S1-E1 should reference Prometheus alert firing', () => {
      const e1 = S1_EVIDENCE_CHECKLIST.find(e => e.id === 'S1-E1');
      expect(e1!.description).toContain('Prometheus');
      expect(e1!.expected).toContain('firing');
    });

    it('S1-E2 should reference Alertmanager routing', () => {
      const e2 = S1_EVIDENCE_CHECKLIST.find(e => e.id === 'S1-E2');
      expect(e2!.description).toContain('Alertmanager');
      expect(e2!.expected).toContain('pagerduty-critical');
    });

    it('S1-E3 should reference PagerDuty incident with dedup_key', () => {
      const e3 = S1_EVIDENCE_CHECKLIST.find(e => e.id === 'S1-E3');
      expect(e3!.expected).toContain('dedup_key');
    });

    it('S1-E4 should reference PD fingerprint derivation', () => {
      const e4 = S1_EVIDENCE_CHECKLIST.find(e => e.id === 'S1-E4');
      expect(e4!.expected).toContain('fingerprint');
      expect(e4!.expected).toContain('GuardDBTimeoutSpike');
    });
  });
});
