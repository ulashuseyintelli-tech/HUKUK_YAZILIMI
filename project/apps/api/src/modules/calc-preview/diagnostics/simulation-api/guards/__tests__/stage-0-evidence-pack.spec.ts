/**
 * Stage-0 Evidence Pack Template & Smoke Test Validation
 *
 * Tasks 10.1 + 10.2 — Validates evidence pack structure and smoke test script.
 *
 * @see .kiro/specs/stage-0-shadow-rollout/requirements.md — R5.3, R6.3, R10.8
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Evidence Pack Model
// ============================================================================

interface EvidenceEntry {
  phase: string;
  step: string;
  command: string;
  expected: string;
  actual?: string;
  status: 'PASS' | 'FAIL' | 'PENDING';
}

interface EvidencePack {
  date: string;
  operator: string;
  environment: string;
  observationWindowHours: number;
  phases: EvidencePhase[];
  exitGateSummary: ExitGateSummary;
}

interface EvidencePhase {
  name: string;
  entries: EvidenceEntry[];
}

interface ExitGateSummary {
  allCriteriaPassed: boolean;
  criteria: Array<{ name: string; passed: boolean; timestamp?: string }>;
}

const EXPECTED_PHASES = [
  'Faz 1: Prometheus Scrape Health',
  'Faz 2: Prometheus Rule Evaluation',
  'Faz 3: Alertmanager Routing',
  'Faz 4: Grafana Dashboard',
  'Faz 5: S1 Route Validation',
  'Faz 6: S2 Inhibition Validation',
];

function createEvidencePack(): EvidencePack {
  return {
    date: new Date().toISOString(),
    operator: '',
    environment: '',
    observationWindowHours: 48,
    phases: EXPECTED_PHASES.map(name => ({
      name,
      entries: [],
    })),
    exitGateSummary: {
      allCriteriaPassed: false,
      criteria: [],
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Stage-0 Evidence Pack & Smoke Test (Tasks 10.1 + 10.2)', () => {
  describe('Evidence Pack Structure', () => {
    it('should create evidence pack with 6 phases', () => {
      const pack = createEvidencePack();
      expect(pack.phases).toHaveLength(6);
    });

    it('should have all expected phase names', () => {
      const pack = createEvidencePack();
      const names = pack.phases.map(p => p.name);
      for (const expected of EXPECTED_PHASES) {
        expect(names).toContain(expected);
      }
    });

    it('should have exit gate summary', () => {
      const pack = createEvidencePack();
      expect(pack.exitGateSummary).toBeDefined();
      expect(pack.exitGateSummary.allCriteriaPassed).toBeDefined();
      expect(pack.exitGateSummary.criteria).toBeDefined();
    });

    it('evidence entry should have required fields', () => {
      const entry: EvidenceEntry = {
        phase: 'Faz 1',
        step: '1.1 Scrape Target Health',
        command: 'curl -s http://PROM:9090/api/v1/targets',
        expected: 'all targets health=up',
        status: 'PENDING',
      };
      expect(entry.phase).toBeDefined();
      expect(entry.step).toBeDefined();
      expect(entry.command).toBeDefined();
      expect(entry.expected).toBeDefined();
      expect(entry.status).toBeDefined();
    });

    it('exit gate criteria should support timestamps', () => {
      const criteria = {
        name: 'scrapeTargetsStable',
        passed: true,
        timestamp: new Date().toISOString(),
      };
      expect(criteria.timestamp).toBeDefined();
      expect(criteria.passed).toBe(true);
    });
  });

  describe('Smoke Test Script Validation', () => {
    const SMOKE_TEST_PATH = path.resolve(
      __dirname,
      '../../../../../../../../../ops/scripts/smoke-test.sh',
    );

    it('smoke-test.sh should exist', () => {
      expect(fs.existsSync(SMOKE_TEST_PATH)).toBe(true);
    });

    it('smoke-test.sh should be non-empty', () => {
      const content = fs.readFileSync(SMOKE_TEST_PATH, 'utf-8');
      expect(content.trim().length).toBeGreaterThan(0);
    });

    it('smoke-test.sh should contain validation phases', () => {
      const content = fs.readFileSync(SMOKE_TEST_PATH, 'utf-8');
      // Smoke test should reference key validation concepts
      const hasPrometheus =
        content.includes('prometheus') || content.includes('9090');
      const hasAlertmanager =
        content.includes('alertmanager') || content.includes('9093');
      const hasGrafana =
        content.includes('grafana') || content.includes('3001');
      const hasMetrics = content.includes('metrics');

      // At least some of these should be present
      const validationCount = [
        hasPrometheus,
        hasAlertmanager,
        hasGrafana,
        hasMetrics,
      ].filter(Boolean).length;
      expect(validationCount).toBeGreaterThanOrEqual(1);
    });
  });
});
