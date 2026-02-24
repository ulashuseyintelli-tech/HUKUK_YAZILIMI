/**
 * Stage-1 S1 Live Trigger Sequence Validation (Task 1.3)
 *
 * Validates S1 trigger sequence, evidence checklist completeness,
 * PD dedup key derivation, PD safety envelope, and dedup failure condition.
 *
 * @see .kiro/specs/stage-1-runtime-baseline/requirements.md — R3.1–R3.7, R6.4
 * @see .kiro/specs/stage-1-runtime-baseline/design.md — Faz 5, PD Safety Envelope
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ============================================================================
// Types
// ============================================================================

interface S1TriggerStep {
  order: number;
  name: string;
  action: string;
  waitDuration?: string;
  verifyCondition: string;
  failCondition: string;
}

interface S1Evidence {
  id: string;
  description: string;
  source: string;
  expected: string;
  status: 'PASS' | 'FAIL' | 'PENDING';
}

interface PDSafetyEnvelope {
  mode: 'sandbox' | 'prod-fallback';
  serviceName: string;
  routingKeyFingerprint: string;
  safeguards: PDSafeguard[];
}

interface PDSafeguard {
  name: string;
  required: boolean;
  description: string;
}

interface DedupCheckResult {
  fingerprint: string;
  windowMinutes: number;
  incidentsCreated: number;
  passed: boolean;
  failReason?: string;
}

interface AlertmanagerConfig {
  receivers?: Array<{
    name: string;
    pagerduty_configs?: Array<{ service_key?: string; details?: Record<string, string> }>;
  }>;
  route?: {
    group_by?: string[];
    routes?: Array<{
      match?: Record<string, string>;
      routes?: Array<{ match?: Record<string, string>; receiver?: string }>;
    }>;
  };
}

// ============================================================================
// S1 Trigger Sequence Definition
// ============================================================================

const S1_TRIGGER_SEQUENCE: S1TriggerStep[] = [
  {
    order: 1,
    name: 'Baseline Check',
    action: 'Verify no pre-existing GuardDBTimeoutSpike firing',
    verifyCondition: 'GuardDBTimeoutSpike state != firing',
    failCondition: 'Alert already firing before injection',
  },
  {
    order: 2,
    name: 'Inject Events',
    action: 'Inject db_write_timeout_total events above threshold (rate > 0.05/s)',
    verifyCondition: 'Events injected, rate sustained',
    failCondition: 'Injection failed or rate not sustained',
  },
  {
    order: 3,
    name: 'Wait for: 2m',
    action: 'Wait for Prometheus for: 2m condition to be met',
    waitDuration: '2m',
    verifyCondition: 'Timer elapsed',
    failCondition: 'Timeout exceeded without alert transition',
  },
  {
    order: 4,
    name: 'Verify Firing',
    action: 'Check Prometheus /api/v1/alerts for GuardDBTimeoutSpike state=firing',
    verifyCondition: 'GuardDBTimeoutSpike state: firing',
    failCondition: 'Alert not in firing state',
  },
  {
    order: 5,
    name: 'Verify Routing',
    action: 'Check Alertmanager /api/v2/alerts for receiver=pagerduty-critical',
    verifyCondition: 'receivers: [pagerduty-critical]',
    failCondition: 'Wrong receiver or alert not routed',
  },
  {
    order: 6,
    name: 'Verify PD Delivery',
    action: 'Check PagerDuty for incident creation + dedup key',
    verifyCondition: 'PD incident created, dedup_key matches fingerprint',
    failCondition: 'No PD incident or dedup_key mismatch',
  },
];

// ============================================================================
// S1 Evidence Checklist
// ============================================================================

const S1_EVIDENCE_CHECKLIST: S1Evidence[] = [
  {
    id: 'S1-E1',
    description: 'Prometheus alert firing',
    source: 'Prometheus /api/v1/alerts',
    expected: 'GuardDBTimeoutSpike state: firing',
    status: 'PENDING',
  },
  {
    id: 'S1-E2',
    description: 'Alertmanager routing',
    source: 'Alertmanager /api/v2/alerts',
    expected: 'receivers: [pagerduty-critical]',
    status: 'PENDING',
  },
  {
    id: 'S1-E3',
    description: 'PagerDuty incident',
    source: 'PD dashboard / API',
    expected: 'Incident created with dedup_key = hash(GuardDBTimeoutSpike, guard)',
    status: 'PENDING',
  },
  {
    id: 'S1-E4',
    description: 'PD dedup validation',
    source: 'PD event detail',
    expected: 'incidents_created == 1 for same fingerprint within 10m',
    status: 'PENDING',
  },
];

// ============================================================================
// PD Safety Envelope
// ============================================================================

function createSandboxEnvelope(serviceName: string, keyFingerprint: string): PDSafetyEnvelope {
  return {
    mode: 'sandbox',
    serviceName,
    routingKeyFingerprint: keyFingerprint,
    safeguards: [
      { name: 'Separate routing key', required: true, description: 'Sandbox service uses separate routing key from production' },
    ],
  };
}

function createProdFallbackEnvelope(serviceName: string, keyFingerprint: string): PDSafetyEnvelope {
  return {
    mode: 'prod-fallback',
    serviceName,
    routingKeyFingerprint: keyFingerprint,
    safeguards: [
      { name: 'STAGE1-TEST prefix', required: true, description: 'Incident title prefix: [STAGE1-TEST]' },
      { name: 'Maintenance window', required: true, description: 'Maintenance/suppression window opened before trigger' },
      { name: 'Auto-resolve', required: true, description: 'Auto-resolve or auto-ack rule configured (timeout ≤ 10m)' },
      { name: 'Manual close step', required: true, description: 'Runbook includes mandatory manual close step' },
    ],
  };
}

// ============================================================================
// Dedup Check Logic
// ============================================================================

function evaluateDedupCheck(fingerprint: string, incidentsCreated: number, windowMinutes: number): DedupCheckResult {
  const passed = incidentsCreated === 1;
  return {
    fingerprint,
    windowMinutes,
    incidentsCreated,
    passed,
    failReason: passed ? undefined : `Dedup failure: incidents_created=${incidentsCreated} (expected 1) for fingerprint ${fingerprint} within ${windowMinutes}m`,
  };
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

describe('Stage-1 S1 Live Trigger Sequence (Task 1.3)', () => {
  let amConfig: AlertmanagerConfig;

  beforeAll(() => {
    amConfig = loadAlertmanagerConfig();
  });

  describe('Trigger Sequence Structure', () => {
    it('should have 6 steps in the S1 trigger sequence', () => {
      expect(S1_TRIGGER_SEQUENCE).toHaveLength(6);
    });

    it('steps should be in strict order 1–6', () => {
      for (let i = 0; i < S1_TRIGGER_SEQUENCE.length; i++) {
        expect(S1_TRIGGER_SEQUENCE[i].order).toBe(i + 1);
      }
    });

    it('sequence should follow: baseline → inject → wait → verify firing → verify routing → verify PD', () => {
      const names = S1_TRIGGER_SEQUENCE.map(s => s.name);
      expect(names[0]).toContain('Baseline');
      expect(names[1]).toContain('Inject');
      expect(names[2]).toContain('Wait');
      expect(names[3]).toContain('Firing');
      expect(names[4]).toContain('Routing');
      expect(names[5]).toContain('PD Delivery');
    });

    it('wait step should have 2m duration', () => {
      const waitStep = S1_TRIGGER_SEQUENCE.find(s => s.name.includes('Wait'));
      expect(waitStep!.waitDuration).toBe('2m');
    });

    it('each step should have action, verifyCondition, failCondition', () => {
      for (const step of S1_TRIGGER_SEQUENCE) {
        expect(step.action.length).toBeGreaterThan(0);
        expect(step.verifyCondition.length).toBeGreaterThan(0);
        expect(step.failCondition.length).toBeGreaterThan(0);
      }
    });
  });

  describe('S1 Evidence Checklist Completeness', () => {
    it('should have 4 evidence items (S1-E1 through S1-E4)', () => {
      expect(S1_EVIDENCE_CHECKLIST).toHaveLength(4);
    });

    it('evidence IDs should be S1-E1, S1-E2, S1-E3, S1-E4', () => {
      const ids = S1_EVIDENCE_CHECKLIST.map(e => e.id);
      expect(ids).toEqual(['S1-E1', 'S1-E2', 'S1-E3', 'S1-E4']);
    });

    it('each evidence item should have id, description, source, expected, status', () => {
      for (const item of S1_EVIDENCE_CHECKLIST) {
        expect(item.id).toBeDefined();
        expect(item.description).toBeDefined();
        expect(item.source).toBeDefined();
        expect(item.expected).toBeDefined();
        expect(['PASS', 'FAIL', 'PENDING']).toContain(item.status);
      }
    });

    it('S1-E1 should reference Prometheus firing', () => {
      const e1 = S1_EVIDENCE_CHECKLIST.find(e => e.id === 'S1-E1')!;
      expect(e1.source).toContain('Prometheus');
      expect(e1.expected).toContain('firing');
    });

    it('S1-E2 should reference Alertmanager routing to pagerduty-critical', () => {
      const e2 = S1_EVIDENCE_CHECKLIST.find(e => e.id === 'S1-E2')!;
      expect(e2.source).toContain('Alertmanager');
      expect(e2.expected).toContain('pagerduty-critical');
    });

    it('S1-E3 should reference PD incident with dedup_key', () => {
      const e3 = S1_EVIDENCE_CHECKLIST.find(e => e.id === 'S1-E3')!;
      expect(e3.expected).toContain('dedup_key');
    });

    it('S1-E4 should reference dedup validation (incidents_created == 1)', () => {
      const e4 = S1_EVIDENCE_CHECKLIST.find(e => e.id === 'S1-E4')!;
      expect(e4.expected).toContain('incidents_created');
      expect(e4.expected).toContain('1');
    });
  });

  describe('PD Dedup Key Derivation', () => {
    it('alertmanager group_by should include alertname and component', () => {
      const groupBy = amConfig.route!.group_by!;
      expect(groupBy).toContain('alertname');
      expect(groupBy).toContain('component');
    });

    it('dedup key for GuardDBTimeoutSpike should be derived from (alertname, component)', () => {
      const groupBy = amConfig.route!.group_by!;
      const dedupFields = { alertname: 'GuardDBTimeoutSpike', component: 'guard' };
      for (const field of Object.keys(dedupFields)) {
        expect(groupBy).toContain(field);
      }
    });

    it('pagerduty-critical receiver should have details with component field', () => {
      const pdReceiver = amConfig.receivers!.find(r => r.name === 'pagerduty-critical');
      expect(pdReceiver).toBeDefined();
      expect(pdReceiver!.pagerduty_configs![0].details).toBeDefined();
      expect(pdReceiver!.pagerduty_configs![0].details!.component).toBeDefined();
    });
  });

  describe('PD Safety Envelope — Sandbox', () => {
    it('sandbox envelope should have mode=sandbox', () => {
      const env = createSandboxEnvelope('stage1-test-service', 'abc123');
      expect(env.mode).toBe('sandbox');
    });

    it('sandbox envelope should have separate routing key safeguard', () => {
      const env = createSandboxEnvelope('stage1-test-service', 'abc123');
      expect(env.safeguards).toHaveLength(1);
      expect(env.safeguards[0].name).toContain('routing key');
    });

    it('sandbox envelope should store service name and key fingerprint', () => {
      const env = createSandboxEnvelope('stage1-test-service', 'abc123');
      expect(env.serviceName).toBe('stage1-test-service');
      expect(env.routingKeyFingerprint).toBe('abc123');
    });
  });

  describe('PD Safety Envelope — Prod Fallback', () => {
    it('prod fallback envelope should have mode=prod-fallback', () => {
      const env = createProdFallbackEnvelope('prod-service', 'xyz789');
      expect(env.mode).toBe('prod-fallback');
    });

    it('prod fallback should require 4 safeguards', () => {
      const env = createProdFallbackEnvelope('prod-service', 'xyz789');
      expect(env.safeguards).toHaveLength(4);
    });

    it('prod fallback should require STAGE1-TEST prefix', () => {
      const env = createProdFallbackEnvelope('prod-service', 'xyz789');
      const prefixGuard = env.safeguards.find(s => s.name.includes('STAGE1-TEST'));
      expect(prefixGuard).toBeDefined();
      expect(prefixGuard!.required).toBe(true);
    });

    it('prod fallback should require maintenance window', () => {
      const env = createProdFallbackEnvelope('prod-service', 'xyz789');
      const mwGuard = env.safeguards.find(s => s.name.includes('Maintenance'));
      expect(mwGuard).toBeDefined();
      expect(mwGuard!.required).toBe(true);
    });

    it('prod fallback should require auto-resolve', () => {
      const env = createProdFallbackEnvelope('prod-service', 'xyz789');
      const arGuard = env.safeguards.find(s => s.name.includes('Auto-resolve'));
      expect(arGuard).toBeDefined();
      expect(arGuard!.required).toBe(true);
    });

    it('prod fallback should require manual close step', () => {
      const env = createProdFallbackEnvelope('prod-service', 'xyz789');
      const mcGuard = env.safeguards.find(s => s.name.includes('Manual close'));
      expect(mcGuard).toBeDefined();
      expect(mcGuard!.required).toBe(true);
    });

    it('all prod fallback safeguards should be required', () => {
      const env = createProdFallbackEnvelope('prod-service', 'xyz789');
      for (const sg of env.safeguards) {
        expect(sg.required).toBe(true);
      }
    });
  });

  describe('Dedup Failure Condition', () => {
    it('incidents_created == 1 → PASS', () => {
      const result = evaluateDedupCheck('hash(GuardDBTimeoutSpike,guard)', 1, 10);
      expect(result.passed).toBe(true);
      expect(result.failReason).toBeUndefined();
    });

    it('incidents_created == 0 → FAIL', () => {
      const result = evaluateDedupCheck('hash(GuardDBTimeoutSpike,guard)', 0, 10);
      expect(result.passed).toBe(false);
      expect(result.failReason).toContain('Dedup failure');
    });

    it('incidents_created == 2 → FAIL (dedup failure)', () => {
      const result = evaluateDedupCheck('hash(GuardDBTimeoutSpike,guard)', 2, 10);
      expect(result.passed).toBe(false);
      expect(result.failReason).toContain('Dedup failure');
      expect(result.failReason).toContain('incidents_created=2');
    });

    it('incidents_created == 5 → FAIL', () => {
      const result = evaluateDedupCheck('hash(GuardDBTimeoutSpike,guard)', 5, 10);
      expect(result.passed).toBe(false);
    });

    it('dedup check should use 10m window', () => {
      const result = evaluateDedupCheck('hash(GuardDBTimeoutSpike,guard)', 1, 10);
      expect(result.windowMinutes).toBe(10);
    });

    it('dedup check should include fingerprint in result', () => {
      const result = evaluateDedupCheck('hash(GuardDBTimeoutSpike,guard)', 1, 10);
      expect(result.fingerprint).toBe('hash(GuardDBTimeoutSpike,guard)');
    });
  });
});
