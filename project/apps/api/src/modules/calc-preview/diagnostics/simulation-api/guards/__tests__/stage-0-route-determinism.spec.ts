/**
 * Stage-0 Route Tree Determinism Validation
 *
 * Task 2.1 — Parses alertmanager.yml and validates all 6 routing cases
 * plus catch-all and inhibition rule presence.
 *
 * Evidence: Route tree deterministically maps (component, severity) → receiver.
 * Blocking dependency: Task 1 (guard route addition) must be complete.
 *
 * @see .kiro/specs/stage-0-shadow-rollout/requirements.md — R4.2, R4.3, R5.1
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ============================================================================
// Types
// ============================================================================

interface AlertmanagerRoute {
  receiver?: string;
  match?: Record<string, string>;
  match_re?: Record<string, string>;
  group_by?: string[];
  group_wait?: string;
  group_interval?: string;
  repeat_interval?: string;
  continue?: boolean;
  routes?: AlertmanagerRoute[];
}

interface InhibitRule {
  source_matchers?: string[];
  target_matchers?: string[];
  equal?: string[];
}

interface AlertmanagerConfig {
  global?: Record<string, unknown>;
  receivers?: Array<{ name: string; [key: string]: unknown }>;
  route?: AlertmanagerRoute;
  inhibit_rules?: InhibitRule[];
}

// ============================================================================
// Helpers
// ============================================================================

function loadAlertmanagerConfig(): AlertmanagerConfig {
  const yamlPath = path.resolve(
    __dirname,
    '../../../../../../../../../ops/alertmanager/alertmanager.yml',
  );
  const content = fs.readFileSync(yamlPath, 'utf-8');
  return yaml.load(content) as AlertmanagerConfig;
}

/**
 * Simplified Alertmanager route resolver.
 * Walks the route tree top-down, matching labels against `match` fields.
 * Returns the receiver name for the first matching leaf route.
 */
function resolveReceiver(
  route: AlertmanagerRoute,
  labels: Record<string, string>,
): string {
  const receiver = route.receiver ?? 'slack-default';

  if (!route.routes || route.routes.length === 0) {
    return receiver;
  }

  for (const child of route.routes) {
    if (matchesRoute(child, labels)) {
      // Recurse into child — if child has sub-routes, keep walking
      const childResult = resolveReceiver(child, labels);
      // If child matched and has a receiver (leaf or nested match), return it
      if (childResult) {
        return childResult;
      }
      // If continue: false (default), stop walking siblings
      if (!child.continue) {
        return child.receiver ?? receiver;
      }
    }
  }

  return receiver;
}

function matchesRoute(
  route: AlertmanagerRoute,
  labels: Record<string, string>,
): boolean {
  if (!route.match) return true;
  for (const [key, value] of Object.entries(route.match)) {
    if (labels[key] !== value) return false;
  }
  return true;
}

// ============================================================================
// Expected routing table — 6 deterministic cases + catch-all
// ============================================================================

const ROUTING_CASES: Array<{
  description: string;
  labels: Record<string, string>;
  expectedReceiver: string;
}> = [
  {
    description: 'component=redrive, severity=critical → pagerduty-critical',
    labels: { team: 'backend', component: 'redrive', severity: 'critical' },
    expectedReceiver: 'pagerduty-critical',
  },
  {
    description: 'component=redrive, severity=warning → slack-warning',
    labels: { team: 'backend', component: 'redrive', severity: 'warning' },
    expectedReceiver: 'slack-warning',
  },
  {
    description: 'component=simulation, severity=critical → pagerduty-critical',
    labels: { team: 'backend', component: 'simulation', severity: 'critical' },
    expectedReceiver: 'pagerduty-critical',
  },
  {
    description: 'component=simulation, severity=warning → slack-warning',
    labels: { team: 'backend', component: 'simulation', severity: 'warning' },
    expectedReceiver: 'slack-warning',
  },
  {
    description: 'component=guard, severity=critical → pagerduty-critical (Stage-0 S1)',
    labels: { team: 'backend', component: 'guard', severity: 'critical' },
    expectedReceiver: 'pagerduty-critical',
  },
  {
    description: 'component=guard, severity=warning → slack-warning (Stage-0)',
    labels: { team: 'backend', component: 'guard', severity: 'warning' },
    expectedReceiver: 'slack-warning',
  },
  {
    description: 'unmatched labels → slack-default (catch-all)',
    labels: { team: 'unknown', component: 'unknown', severity: 'info' },
    expectedReceiver: 'slack-default',
  },
];

// ============================================================================
// Tests
// ============================================================================

describe('Stage-0 Route Tree Determinism (Task 2.1)', () => {
  let config: AlertmanagerConfig;

  beforeAll(() => {
    config = loadAlertmanagerConfig();
  });

  it('should parse alertmanager.yml without errors', () => {
    expect(config).toBeDefined();
    expect(config.route).toBeDefined();
    expect(config.receivers).toBeDefined();
    expect(Array.isArray(config.receivers)).toBe(true);
  });

  it('should have 3 receivers: slack-default, pagerduty-critical, slack-warning', () => {
    const receiverNames = config.receivers!.map(r => r.name).sort();
    expect(receiverNames).toEqual(
      ['pagerduty-critical', 'slack-default', 'slack-warning'].sort(),
    );
  });

  it('should have 3 component route blocks: redrive, simulation, guard', () => {
    const topRoutes = config.route!.routes ?? [];
    const components = topRoutes
      .map(r => r.match?.component)
      .filter(Boolean)
      .sort();
    expect(components).toEqual(['guard', 'redrive', 'simulation'].sort());
  });

  it('should use group_by: [alertname, component] at root level', () => {
    expect(config.route!.group_by).toEqual(['alertname', 'component']);
  });

  // Parametric routing validation — all 7 cases
  describe.each(ROUTING_CASES)(
    'Route: $description',
    ({ labels, expectedReceiver }) => {
      it(`should resolve to ${expectedReceiver}`, () => {
        const resolved = resolveReceiver(config.route!, labels);
        expect(resolved).toBe(expectedReceiver);
      });
    },
  );

  // S1 specific: GuardDBTimeoutSpike → pagerduty-critical
  it('S1 evidence: GuardDBTimeoutSpike labels resolve to pagerduty-critical', () => {
    const s1Labels = {
      team: 'backend',
      component: 'guard',
      severity: 'critical',
      alertname: 'GuardDBTimeoutSpike',
    };
    const resolved = resolveReceiver(config.route!, s1Labels);
    expect(resolved).toBe('pagerduty-critical');
  });

  // Inhibition rule validation
  describe('Inhibition Rules', () => {
    it('should have at least one inhibition rule', () => {
      expect(config.inhibit_rules).toBeDefined();
      expect(config.inhibit_rules!.length).toBeGreaterThanOrEqual(1);
    });

    it('should have critical→warning inhibition with equal: [component]', () => {
      const rule = config.inhibit_rules!.find(r => {
        const srcHasCritical = r.source_matchers?.some(m =>
          m.includes('critical'),
        );
        const tgtHasWarning = r.target_matchers?.some(m =>
          m.includes('warning'),
        );
        const eqHasComponent = r.equal?.includes('component');
        return srcHasCritical && tgtHasWarning && eqHasComponent;
      });
      expect(rule).toBeDefined();
    });
  });

  // Guard route structure validation
  describe('Guard Route Structure', () => {
    it('guard route should have group_by: [alertname, component]', () => {
      const guardRoute = config.route!.routes!.find(
        r => r.match?.component === 'guard',
      );
      expect(guardRoute).toBeDefined();
      expect(guardRoute!.group_by).toEqual(['alertname', 'component']);
    });

    it('guard route should have critical and warning sub-routes', () => {
      const guardRoute = config.route!.routes!.find(
        r => r.match?.component === 'guard',
      );
      const subRoutes = guardRoute!.routes ?? [];
      const severities = subRoutes
        .map(r => r.match?.severity)
        .filter(Boolean)
        .sort();
      expect(severities).toEqual(['critical', 'warning']);
    });

    it('guard critical sub-route should have repeat_interval: 1h', () => {
      const guardRoute = config.route!.routes!.find(
        r => r.match?.component === 'guard',
      );
      const criticalRoute = guardRoute!.routes!.find(
        r => r.match?.severity === 'critical',
      );
      expect(criticalRoute!.repeat_interval).toBe('1h');
    });
  });
});
