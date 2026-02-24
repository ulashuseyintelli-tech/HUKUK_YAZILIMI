/**
 * Stage-0 Rollback Trigger Determinism & Exit Gate Conjunction
 *
 * Tasks 9.1 + 9.3 — Validates rollback step ordering, trigger conditions,
 * and exit gate AND semantics.
 *
 * @see .kiro/specs/stage-0-shadow-rollout/requirements.md — R9, R10
 */

// ============================================================================
// Rollback Model
// ============================================================================

const ROLLBACK_STEPS = [
  'disable-feature-flags',
  'rollback-deployment',
  'disable-alerts-silence',
  'revert-grafana-datasource',
] as const;

type RollbackStep = (typeof ROLLBACK_STEPS)[number];

interface RollbackTrigger {
  name: string;
  condition: string;
  check: (metrics: RollbackMetrics) => boolean;
}

interface RollbackMetrics {
  scrapeTargetDown: boolean;
  alertStormActive: boolean;
  metricsLatencyP95Ms: number;
  driftProviderErrorRate: number;
}

const ROLLBACK_TRIGGERS: RollbackTrigger[] = [
  {
    name: 'scrape-failure',
    condition: 'up{job}==0 for any scrape target',
    check: (m) => m.scrapeTargetDown,
  },
  {
    name: 'alert-storm',
    condition: 'sustained high-frequency alert firing',
    check: (m) => m.alertStormActive,
  },
  {
    name: 'latency-anomaly',
    condition: '/metrics p95 > 200ms sustained',
    check: (m) => m.metricsLatencyP95Ms > 200,
  },
  {
    name: 'provider-error-spike',
    condition: 'drift_provider_errors_total rate exceeds threshold',
    check: (m) => m.driftProviderErrorRate > 0,
  },
];

function shouldRollback(metrics: RollbackMetrics): boolean {
  return ROLLBACK_TRIGGERS.some(t => t.check(metrics));
}

function executeRollback(): RollbackStep[] {
  return [...ROLLBACK_STEPS];
}

// ============================================================================
// Exit Gate Model
// ============================================================================

interface ExitGateCriteria {
  scrapeTargetsStable: boolean;
  zeroRuleEvalErrors: boolean;
  s1RouteValidated: boolean;
  s2InhibitionValidated: boolean;
  grafanaPanelsRendering: boolean;
  metricsWithinBaseline: boolean;
  zeroRollbackEvents: boolean;
}

function evaluateExitGate(criteria: ExitGateCriteria): {
  pass: boolean;
  failedCriteria: string[];
} {
  const failedCriteria: string[] = [];
  const entries = Object.entries(criteria) as [keyof ExitGateCriteria, boolean][];

  for (const [key, value] of entries) {
    if (!value) failedCriteria.push(key);
  }

  return { pass: failedCriteria.length === 0, failedCriteria };
}

// ============================================================================
// Tests
// ============================================================================

describe('Stage-0 Rollback & Exit Gate (Tasks 9.1 + 9.3)', () => {
  describe('Rollback Step Ordering', () => {
    it('should execute steps in correct order', () => {
      const steps = executeRollback();
      expect(steps).toEqual([
        'disable-feature-flags',
        'rollback-deployment',
        'disable-alerts-silence',
        'revert-grafana-datasource',
      ]);
    });

    it('feature flags disabled before deployment rollback', () => {
      const steps = executeRollback();
      expect(steps.indexOf('disable-feature-flags')).toBeLessThan(
        steps.indexOf('rollback-deployment'),
      );
    });

    it('deployment rollback before alert silence', () => {
      const steps = executeRollback();
      expect(steps.indexOf('rollback-deployment')).toBeLessThan(
        steps.indexOf('disable-alerts-silence'),
      );
    });
  });

  describe('Rollback Trigger Conditions', () => {
    const HEALTHY: RollbackMetrics = {
      scrapeTargetDown: false,
      alertStormActive: false,
      metricsLatencyP95Ms: 50,
      driftProviderErrorRate: 0,
    };

    it('no rollback when all metrics healthy', () => {
      expect(shouldRollback(HEALTHY)).toBe(false);
    });

    it('rollback on scrape failure', () => {
      expect(shouldRollback({ ...HEALTHY, scrapeTargetDown: true })).toBe(true);
    });

    it('rollback on alert storm', () => {
      expect(shouldRollback({ ...HEALTHY, alertStormActive: true })).toBe(true);
    });

    it('rollback on latency anomaly (>200ms)', () => {
      expect(shouldRollback({ ...HEALTHY, metricsLatencyP95Ms: 250 })).toBe(true);
    });

    it('no rollback at exactly 200ms', () => {
      expect(shouldRollback({ ...HEALTHY, metricsLatencyP95Ms: 200 })).toBe(false);
    });

    it('rollback on provider error spike', () => {
      expect(shouldRollback({ ...HEALTHY, driftProviderErrorRate: 0.01 })).toBe(true);
    });

    it('should have exactly 4 trigger conditions', () => {
      expect(ROLLBACK_TRIGGERS).toHaveLength(4);
    });
  });

  describe('Exit Gate Conjunction (AND semantics)', () => {
    const ALL_PASS: ExitGateCriteria = {
      scrapeTargetsStable: true,
      zeroRuleEvalErrors: true,
      s1RouteValidated: true,
      s2InhibitionValidated: true,
      grafanaPanelsRendering: true,
      metricsWithinBaseline: true,
      zeroRollbackEvents: true,
    };

    it('gate passes when all criteria true', () => {
      const result = evaluateExitGate(ALL_PASS);
      expect(result.pass).toBe(true);
      expect(result.failedCriteria).toHaveLength(0);
    });

    it('gate fails when scrapeTargetsStable is false', () => {
      const result = evaluateExitGate({ ...ALL_PASS, scrapeTargetsStable: false });
      expect(result.pass).toBe(false);
      expect(result.failedCriteria).toContain('scrapeTargetsStable');
    });

    it('gate fails when s1RouteValidated is false', () => {
      const result = evaluateExitGate({ ...ALL_PASS, s1RouteValidated: false });
      expect(result.pass).toBe(false);
    });

    it('gate fails when s2InhibitionValidated is false', () => {
      const result = evaluateExitGate({ ...ALL_PASS, s2InhibitionValidated: false });
      expect(result.pass).toBe(false);
    });

    it('gate fails when any single criterion is false', () => {
      const keys = Object.keys(ALL_PASS) as (keyof ExitGateCriteria)[];
      for (const key of keys) {
        const criteria = { ...ALL_PASS, [key]: false };
        const result = evaluateExitGate(criteria);
        expect(result.pass).toBe(false);
        expect(result.failedCriteria).toContain(key);
      }
    });

    it('gate reports all failed criteria when multiple fail', () => {
      const result = evaluateExitGate({
        ...ALL_PASS,
        scrapeTargetsStable: false,
        s1RouteValidated: false,
        grafanaPanelsRendering: false,
      });
      expect(result.pass).toBe(false);
      expect(result.failedCriteria).toHaveLength(3);
    });

    it('exit gate has 7 criteria', () => {
      expect(Object.keys(ALL_PASS)).toHaveLength(7);
    });
  });
});
