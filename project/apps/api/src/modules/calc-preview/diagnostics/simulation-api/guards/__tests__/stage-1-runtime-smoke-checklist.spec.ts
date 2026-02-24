/**
 * Stage-1 Runtime Smoke Checklist Validation (Task 1.1)
 *
 * Validates that all 6 runtime smoke phases have defined commands,
 * expected outputs, and evidence entry structure.
 * Validates phase ordering and exit gate conjunction.
 *
 * @see .kiro/specs/stage-1-runtime-baseline/requirements.md — R1–R6
 * @see .kiro/specs/stage-1-runtime-baseline/design.md — State Machine
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ============================================================================
// Types
// ============================================================================

interface RuntimeSmokePhase {
  id: string;
  name: string;
  order: number;
  commands: SmokeCommand[];
  evidenceEntries: EvidenceEntry[];
}

interface SmokeCommand {
  step: string;
  command: string;
  expectedOutput: string;
  failCondition: string;
}

interface EvidenceEntry {
  id: string;
  description: string;
  expected: string;
  status: 'PASS' | 'FAIL' | 'PENDING';
}

interface ExitGateResult {
  allPassed: boolean;
  phaseResults: Array<{ phase: string; passed: boolean; timestamp: string }>;
}

// ============================================================================
// Runtime Smoke Phase Definitions
// ============================================================================

const RUNTIME_SMOKE_PHASES: RuntimeSmokePhase[] = [
  {
    id: 'F1',
    name: 'Prometheus Scrape Health',
    order: 1,
    commands: [
      {
        step: '1.1 Scrape Target Health',
        command: 'curl -s http://$PROMETHEUS_HOST:9090/api/v1/targets',
        expectedOutput: 'all targets health=up',
        failCondition: 'any target health != up',
      },
      {
        step: '1.2 Rule Groups Loaded',
        command: 'curl -s http://$PROMETHEUS_HOST:9090/api/v1/rules',
        expectedOutput: '3 rule groups loaded, 0 eval errors',
        failCondition: 'missing groups or eval errors > 0',
      },
      {
        step: '1.3 Critical Metrics Non-Empty',
        command: 'curl -s http://$PROMETHEUS_HOST:9090/api/v1/query?query={__name__=~"guard_decision_total|simulation_drift_total|drift_provider_errors_total|kill_switch_state|http_responses_total"}',
        expectedOutput: 'at least 1 non-empty series per metric',
        failCondition: 'any critical metric returns empty result',
      },
      {
        step: '1.4 Metrics HELP/TYPE Declarations',
        command: 'curl -s http://$API_HOST/metrics',
        expectedOutput: 'HELP + TYPE for all 5 critical metrics',
        failCondition: 'missing HELP or TYPE declaration',
      },
    ],
    evidenceEntries: [
      { id: 'F1-E1', description: 'Scrape targets UP', expected: 'up{job}==1 for all targets', status: 'PENDING' },
      { id: 'F1-E2', description: 'Rule groups loaded', expected: '3 groups, 0 eval errors', status: 'PENDING' },
      { id: 'F1-E3', description: 'Critical metrics non-empty', expected: '5 metrics with data', status: 'PENDING' },
    ],
  },
  {
    id: 'F2',
    name: 'Rule Evaluation',
    order: 2,
    commands: [
      {
        step: '2.1 Rule Group Count',
        command: 'curl -s http://$PROMETHEUS_HOST:9090/api/v1/rules | python3 -c "..."',
        expectedOutput: 'groups: redrive_alerts, simulation_alerts, guard_alerts',
        failCondition: 'missing rule group',
      },
      {
        step: '2.2 Evaluation Errors',
        command: 'curl -s http://$PROMETHEUS_HOST:9090/api/v1/rules | python3 -c "..."',
        expectedOutput: 'evaluationErrors: 0',
        failCondition: 'evaluationErrors > 0',
      },
      {
        step: '2.3 Rules Evaluation Health',
        command: 'curl -s http://$PROMETHEUS_HOST:9090/api/v1/rules',
        expectedOutput: 'all rules evaluating without errors',
        failCondition: 'any rule evaluation failure',
      },
    ],
    evidenceEntries: [
      { id: 'F2-E1', description: 'Rules evaluation ok (upstream health)', expected: '3 groups, 0 eval errors, all rules healthy', status: 'PENDING' },
    ],
  },
  {
    id: 'F3',
    name: 'Alertmanager Routing',
    order: 3,
    commands: [
      {
        step: '3.1 Alertmanager Status',
        command: 'curl -s http://$ALERTMANAGER_HOST:9093/api/v2/status',
        expectedOutput: 'cluster status: ready, config loaded',
        failCondition: 'unhealthy status',
      },
      {
        step: '3.2 Route Test (amtool)',
        command: 'amtool config routes test --config.file=alertmanager.yml',
        expectedOutput: 'all 6 component/severity pairs resolve correctly',
        failCondition: 'any route mismatch',
      },
      {
        step: '3.3 Inhibition Rule Present',
        command: 'curl -s http://$ALERTMANAGER_HOST:9093/api/v2/status | python3 -c "..."',
        expectedOutput: 'inhibit_rules: critical→warning, equal=[component]',
        failCondition: 'inhibition rule missing',
      },
      {
        step: '3.4 PD Key Configured',
        command: 'curl -s http://$ALERTMANAGER_HOST:9093/api/v2/status | python3 -c "..."',
        expectedOutput: 'pagerduty-critical service_key: CONFIGURED (non-placeholder)',
        failCondition: 'service_key is placeholder or empty',
      },
    ],
    evidenceEntries: [
      { id: 'F3-E1', description: 'AM healthy + config loaded', expected: 'status: ready', status: 'PENDING' },
      { id: 'F3-E2', description: 'Route tree correct', expected: '6 routes + catch-all verified', status: 'PENDING' },
      { id: 'F3-E3', description: 'PD key non-placeholder', expected: 'service_key: CONFIGURED', status: 'PENDING' },
    ],
  },
  {
    id: 'F4',
    name: 'Grafana Dashboard',
    order: 4,
    commands: [
      {
        step: '4.1 Datasource UID Live',
        command: 'curl -sf -u $GRAFANA_USER:$GRAFANA_PASS http://$GRAFANA_HOST:3001/api/datasources',
        expectedOutput: 'Prometheus datasource UID bound to live instance',
        failCondition: 'UID is placeholder or URL is localhost',
      },
      {
        step: '4.2 Panel Rendering',
        command: 'curl -sf http://$GRAFANA_HOST:3001/api/dashboards/uid/guard-dashboard',
        expectedOutput: '≥5 of 9 critical panels rendering with data',
        failCondition: '< 5 panels rendering',
      },
    ],
    evidenceEntries: [
      { id: 'F4-E1', description: 'Datasource UID live', expected: 'UID bound to live Prometheus', status: 'PENDING' },
      { id: 'F4-E2', description: 'Panels rendering', expected: '≥5 panels with data', status: 'PENDING' },
    ],
  },
  {
    id: 'F5',
    name: 'S1 Live Delivery',
    order: 5,
    commands: [
      {
        step: '5.0 PD Safety Envelope',
        command: 'echo "PD Mode: $PD_MODE, Routing Key Fingerprint: $(echo $PD_ROUTING_KEY | sha256sum | cut -c1-12)"',
        expectedOutput: 'PD environment ready (sandbox or prod-fallback with safeguards)',
        failCondition: 'PD environment not configured',
      },
      {
        step: '5.0a PD Key / Receiver Binding Verified',
        command: 'curl -s http://$ALERTMANAGER_HOST:9093/api/v2/status | python3 -c "verify pagerduty-critical → routing key match"',
        expectedOutput: 'pagerduty-critical receiver bound to correct routing key',
        failCondition: 'receiver binding mismatch',
      },
      {
        step: '5.1 Inject db_write_timeout_total',
        command: 'synthetic event injection',
        expectedOutput: 'rate > 0.05/s sustained',
        failCondition: 'injection failed',
      },
      {
        step: '5.2 Wait for: 2m + Verify Firing',
        command: 'curl -s http://$PROMETHEUS_HOST:9090/api/v1/alerts | grep GuardDBTimeoutSpike',
        expectedOutput: 'state: firing',
        failCondition: 'alert not firing after 2m',
      },
      {
        step: '5.3 Verify AM Routing',
        command: 'curl -s http://$ALERTMANAGER_HOST:9093/api/v2/alerts | grep GuardDBTimeoutSpike',
        expectedOutput: 'receivers: [pagerduty-critical]',
        failCondition: 'wrong receiver',
      },
      {
        step: '5.4 Verify PD Delivery',
        command: 'PD API / dashboard check',
        expectedOutput: 'incident created, dedup_key verified',
        failCondition: 'no PD incident',
      },
      {
        step: '5.5 Dedup Check',
        command: 'PD incidents query (same fingerprint, 10m window)',
        expectedOutput: 'incidents_created == 1',
        failCondition: 'incidents_created > 1 (dedup failure)',
      },
    ],
    evidenceEntries: [
      { id: 'S1-E1', description: 'Prometheus firing', expected: 'GuardDBTimeoutSpike state: firing', status: 'PENDING' },
      { id: 'S1-E2', description: 'Alertmanager routing', expected: 'receivers: [pagerduty-critical]', status: 'PENDING' },
      { id: 'S1-E3', description: 'PD incident', expected: 'incident created with correct dedup_key', status: 'PENDING' },
      { id: 'S1-E4', description: 'PD dedup validation', expected: 'incidents_created == 1 for fingerprint in 10m', status: 'PENDING' },
      { id: 'PD-BIND', description: 'PD key/receiver binding verified', expected: 'pagerduty-critical → correct routing key', status: 'PENDING' },
    ],
  },
  {
    id: 'F6',
    name: 'S2 Inhibition Proof',
    order: 6,
    commands: [
      {
        step: '6.1 Fire RedriveRateCheckFailed (critical)',
        command: 'synthetic event injection',
        expectedOutput: 'critical alert firing',
        failCondition: 'critical not firing',
      },
      {
        step: '6.2 Fire RedriveTxDurationHigh (warning)',
        command: 'synthetic event injection',
        expectedOutput: 'warning alert firing',
        failCondition: 'warning not firing',
      },
      {
        step: '6.3 Wait 5m + Verify Both Firing',
        command: 'curl -s http://$PROMETHEUS_HOST:9090/api/v1/alerts',
        expectedOutput: 'both alerts in firing state',
        failCondition: 'either alert not firing',
      },
      {
        step: '6.4 Verify Inhibition',
        command: 'curl -s http://$ALERTMANAGER_HOST:9093/api/v2/alerts',
        expectedOutput: 'warning: status.inhibitedBy: [non-empty]',
        failCondition: 'inhibitedBy is empty',
      },
      {
        step: '6.5 Verify Cross-Component Non-Inhibition',
        command: 'verify guard critical does NOT suppress redrive warning',
        expectedOutput: 'cross-component inhibition does not apply',
        failCondition: 'cross-component inhibition detected',
      },
    ],
    evidenceEntries: [
      { id: 'S2-E1', description: 'Critical firing', expected: 'RedriveRateCheckFailed state: firing', status: 'PENDING' },
      { id: 'S2-E2', description: 'Warning firing', expected: 'RedriveTxDurationHigh state: firing', status: 'PENDING' },
      { id: 'S2-E3', description: 'Inhibition active', expected: 'inhibitedBy: [non-empty]', status: 'PENDING' },
      { id: 'S2-E4', description: 'PD received critical', expected: 'RedriveRateCheckFailed delivered to PD', status: 'PENDING' },
      { id: 'S2-E5', description: 'Slack NO warning', expected: 'RedriveTxDurationHigh NOT in slack-warning', status: 'PENDING' },
    ],
  },
];

const EXPECTED_PHASE_ORDER = ['Prometheus', 'Rule Eval', 'Alertmanager', 'Grafana', 'S1', 'S2'];

const CRITICAL_METRICS = [
  'guard_decision_total',
  'simulation_drift_total',
  'drift_provider_errors_total',
  'kill_switch_state',
  'http_responses_total',
];

// ============================================================================
// Exit Gate Logic
// ============================================================================

function evaluateExitGate(phaseResults: Array<{ phase: string; passed: boolean }>): ExitGateResult {
  const allPassed = phaseResults.every(r => r.passed);
  return {
    allPassed,
    phaseResults: phaseResults.map(r => ({
      ...r,
      timestamp: new Date().toISOString(),
    })),
  };
}

// ============================================================================
// Evidence Pack Header
// ============================================================================

interface EvidencePackHeader {
  environment: string;
  pdMode: string;
  receiverBinding: string;
  timestamp: string;
  operator: string;
}

function createEvidencePackHeader(
  environment: string,
  pdMode: string,
  routingKeyFingerprint: string,
  operator: string,
): EvidencePackHeader {
  return {
    environment,
    pdMode,
    receiverBinding: `pagerduty-critical → ${routingKeyFingerprint}`,
    timestamp: new Date().toISOString(),
    operator,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Stage-1 Runtime Smoke Checklist (Task 1.1)', () => {
  describe('Phase Definitions', () => {
    it('should have exactly 6 runtime smoke phases', () => {
      expect(RUNTIME_SMOKE_PHASES).toHaveLength(6);
    });

    it('each phase should have id, name, order, commands, and evidenceEntries', () => {
      for (const phase of RUNTIME_SMOKE_PHASES) {
        expect(phase.id).toBeDefined();
        expect(phase.name).toBeDefined();
        expect(typeof phase.order).toBe('number');
        expect(phase.commands.length).toBeGreaterThan(0);
        expect(phase.evidenceEntries.length).toBeGreaterThan(0);
      }
    });

    it('phase IDs should be F1 through F6', () => {
      const ids = RUNTIME_SMOKE_PHASES.map(p => p.id).sort();
      expect(ids).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6']);
    });
  });

  describe('Phase Ordering', () => {
    it('phases should be in strict order: Prometheus → Rule Eval → Alertmanager → Grafana → S1 → S2', () => {
      for (let i = 0; i < RUNTIME_SMOKE_PHASES.length - 1; i++) {
        expect(RUNTIME_SMOKE_PHASES[i].order).toBeLessThan(RUNTIME_SMOKE_PHASES[i + 1].order);
      }
    });

    it('phase names should match expected ordering keywords', () => {
      for (let i = 0; i < EXPECTED_PHASE_ORDER.length; i++) {
        const keyword = EXPECTED_PHASE_ORDER[i];
        expect(RUNTIME_SMOKE_PHASES[i].name).toContain(keyword);
      }
    });

    it('F1 (Prometheus) must precede F2 (Rule Eval)', () => {
      const f1 = RUNTIME_SMOKE_PHASES.find(p => p.id === 'F1')!;
      const f2 = RUNTIME_SMOKE_PHASES.find(p => p.id === 'F2')!;
      expect(f1.order).toBeLessThan(f2.order);
    });

    it('F4 (Grafana) must precede F5 (S1)', () => {
      const f4 = RUNTIME_SMOKE_PHASES.find(p => p.id === 'F4')!;
      const f5 = RUNTIME_SMOKE_PHASES.find(p => p.id === 'F5')!;
      expect(f4.order).toBeLessThan(f5.order);
    });
  });

  describe('Command Structure', () => {
    it('each command should have step, command, expectedOutput, failCondition', () => {
      for (const phase of RUNTIME_SMOKE_PHASES) {
        for (const cmd of phase.commands) {
          expect(cmd.step).toBeDefined();
          expect(cmd.step.length).toBeGreaterThan(0);
          expect(cmd.command).toBeDefined();
          expect(cmd.command.length).toBeGreaterThan(0);
          expect(cmd.expectedOutput).toBeDefined();
          expect(cmd.failCondition).toBeDefined();
        }
      }
    });

    it('F1 commands should reference Prometheus endpoints', () => {
      const f1 = RUNTIME_SMOKE_PHASES.find(p => p.id === 'F1')!;
      const allCommands = f1.commands.map(c => c.command).join(' ');
      expect(allCommands).toContain('9090');
    });

    it('F3 commands should reference Alertmanager endpoints', () => {
      const f3 = RUNTIME_SMOKE_PHASES.find(p => p.id === 'F3')!;
      const allCommands = f3.commands.map(c => c.command).join(' ');
      expect(allCommands).toContain('9093');
    });

    it('F5 should include PD Safety Envelope step', () => {
      const f5 = RUNTIME_SMOKE_PHASES.find(p => p.id === 'F5')!;
      const safetyStep = f5.commands.find(c => c.step.includes('Safety Envelope'));
      expect(safetyStep).toBeDefined();
    });

    it('F5 should include PD key/receiver binding verification step', () => {
      const f5 = RUNTIME_SMOKE_PHASES.find(p => p.id === 'F5')!;
      const bindStep = f5.commands.find(c => c.step.includes('Receiver Binding'));
      expect(bindStep).toBeDefined();
    });

    it('F5 should include dedup check step', () => {
      const f5 = RUNTIME_SMOKE_PHASES.find(p => p.id === 'F5')!;
      const dedupStep = f5.commands.find(c => c.step.includes('Dedup'));
      expect(dedupStep).toBeDefined();
    });
  });

  describe('Evidence Entry Structure', () => {
    it('each evidence entry should have id, description, expected, status', () => {
      for (const phase of RUNTIME_SMOKE_PHASES) {
        for (const entry of phase.evidenceEntries) {
          expect(entry.id).toBeDefined();
          expect(entry.description).toBeDefined();
          expect(entry.expected).toBeDefined();
          expect(['PASS', 'FAIL', 'PENDING']).toContain(entry.status);
        }
      }
    });

    it('S1 evidence should have 5 entries (S1-E1 through S1-E4 + PD-BIND)', () => {
      const f5 = RUNTIME_SMOKE_PHASES.find(p => p.id === 'F5')!;
      expect(f5.evidenceEntries.length).toBe(5);
      const ids = f5.evidenceEntries.map(e => e.id);
      expect(ids).toContain('S1-E1');
      expect(ids).toContain('S1-E2');
      expect(ids).toContain('S1-E3');
      expect(ids).toContain('S1-E4');
      expect(ids).toContain('PD-BIND');
    });

    it('S2 evidence should have 5 entries (S2-E1 through S2-E5)', () => {
      const f6 = RUNTIME_SMOKE_PHASES.find(p => p.id === 'F6')!;
      expect(f6.evidenceEntries.length).toBe(5);
      const ids = f6.evidenceEntries.map(e => e.id);
      expect(ids).toContain('S2-E1');
      expect(ids).toContain('S2-E2');
      expect(ids).toContain('S2-E3');
      expect(ids).toContain('S2-E4');
      expect(ids).toContain('S2-E5');
    });

    it('F2 evidence should include upstream rule-eval health (F2-E1)', () => {
      const f2 = RUNTIME_SMOKE_PHASES.find(p => p.id === 'F2')!;
      const f2e1 = f2.evidenceEntries.find(e => e.id === 'F2-E1');
      expect(f2e1).toBeDefined();
      expect(f2e1!.description).toContain('evaluation');
    });

    it('all evidence IDs should be unique across all phases', () => {
      const allIds = RUNTIME_SMOKE_PHASES.flatMap(p => p.evidenceEntries.map(e => e.id));
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });
  });

  describe('Exit Gate Conjunction', () => {
    it('all 6 phases PASS → exit gate PASS', () => {
      const results = RUNTIME_SMOKE_PHASES.map(p => ({ phase: p.id, passed: true }));
      const gate = evaluateExitGate(results);
      expect(gate.allPassed).toBe(true);
    });

    it('any single phase FAIL → exit gate FAIL', () => {
      for (let i = 0; i < RUNTIME_SMOKE_PHASES.length; i++) {
        const results = RUNTIME_SMOKE_PHASES.map((p, j) => ({
          phase: p.id,
          passed: j !== i,
        }));
        const gate = evaluateExitGate(results);
        expect(gate.allPassed).toBe(false);
      }
    });

    it('all phases FAIL → exit gate FAIL', () => {
      const results = RUNTIME_SMOKE_PHASES.map(p => ({ phase: p.id, passed: false }));
      const gate = evaluateExitGate(results);
      expect(gate.allPassed).toBe(false);
    });

    it('exit gate results should include timestamps', () => {
      const results = RUNTIME_SMOKE_PHASES.map(p => ({ phase: p.id, passed: true }));
      const gate = evaluateExitGate(results);
      for (const r of gate.phaseResults) {
        expect(r.timestamp).toBeDefined();
        expect(r.timestamp.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Evidence Pack Header', () => {
    it('should create header with environment, pdMode, receiverBinding', () => {
      const header = createEvidencePackHeader('staging', 'sandbox', 'abc123def456', 'sre-operator');
      expect(header.environment).toBe('staging');
      expect(header.pdMode).toBe('sandbox');
      expect(header.receiverBinding).toContain('pagerduty-critical');
      expect(header.receiverBinding).toContain('abc123def456');
      expect(header.operator).toBe('sre-operator');
      expect(header.timestamp).toBeDefined();
    });

    it('should support prod-fallback PD mode', () => {
      const header = createEvidencePackHeader('prod', 'prod-fallback', 'xyz789', 'sre-operator');
      expect(header.pdMode).toBe('prod-fallback');
    });
  });

  describe('Critical Metrics Coverage', () => {
    it('F1 should validate all 5 critical metrics', () => {
      const f1 = RUNTIME_SMOKE_PHASES.find(p => p.id === 'F1')!;
      const metricsCmd = f1.commands.find(c => c.step.includes('Critical Metrics'));
      expect(metricsCmd).toBeDefined();
      for (const metric of CRITICAL_METRICS) {
        expect(metricsCmd!.command).toContain(metric);
      }
    });
  });

  describe('PD Safety Envelope Validation', () => {
    it('F5 should have PD safety envelope as first step', () => {
      const f5 = RUNTIME_SMOKE_PHASES.find(p => p.id === 'F5')!;
      expect(f5.commands[0].step).toContain('Safety Envelope');
    });

    it('F5 dedup check should expect exactly 1 incident', () => {
      const f5 = RUNTIME_SMOKE_PHASES.find(p => p.id === 'F5')!;
      const dedupCmd = f5.commands.find(c => c.step.includes('Dedup'));
      expect(dedupCmd!.expectedOutput).toContain('1');
      expect(dedupCmd!.failCondition).toContain('> 1');
    });
  });
});
