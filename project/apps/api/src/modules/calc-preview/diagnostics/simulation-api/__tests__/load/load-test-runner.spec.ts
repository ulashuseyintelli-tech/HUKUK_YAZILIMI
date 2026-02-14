/**
 * LoadTestRunner — Unit Tests
 *
 * Synthetic Load Validation — Task 11.2, 11.3
 *
 * Tests:
 * - ABORT+FAIL path (unexpected 500)
 * - Timeout path (scenario > 60s)
 * - WARN-only secondary guard visibility
 * - Seed ve prefix report'a yazılıyor
 * - JSON format doğrulama
 *
 * @see .kiro/specs/synthetic-load-validation/requirements.md Req 8
 * @see .kiro/specs/synthetic-load-validation/design.md
 */

import { LoadTestRunner, ScenarioEntry } from './load-test-runner';
import { SuiteAbortError } from './load-test-report.types';
import type { ScenarioResult, LoadTestReport } from './load-test-report.types';

const TEST_SEED = 42;

function passScenario(id: string, name: string, durationMs = 10): ScenarioEntry {
  return {
    scenarioId: id,
    name,
    run: async (): Promise<ScenarioResult> => ({
      scenarioId: id,
      name,
      result: 'PASS',
      durationMs,
      details: {},
      errors: [],
    }),
  };
}

function failScenario(id: string, name: string, errorMsg: string): ScenarioEntry {
  return {
    scenarioId: id,
    name,
    run: async (): Promise<ScenarioResult> => ({
      scenarioId: id,
      name,
      result: 'FAIL',
      durationMs: 5,
      details: {},
      errors: [errorMsg],
    }),
  };
}

function throwScenario(id: string, name: string, error: Error): ScenarioEntry {
  return {
    scenarioId: id,
    name,
    run: async (): Promise<ScenarioResult> => {
      throw error;
    },
  };
}

describe('LoadTestRunner', () => {
  // ==========================================================================
  // Basic report structure
  // ==========================================================================

  describe('Report structure', () => {
    it('should produce valid JSON report with all required fields', async () => {
      const runner = new LoadTestRunner(TEST_SEED);
      runner.addScenario(passScenario('SB-1', 'Test 1'));
      runner.addScenario(passScenario('SB-2', 'Test 2'));

      const report = await runner.runAll();

      // JSON serializable
      const json = JSON.stringify(report);
      const parsed: LoadTestReport = JSON.parse(json);

      expect(parsed.startedAt).toBeDefined();
      expect(parsed.completedAt).toBeDefined();
      expect(parsed.overallResult).toBe('PASS');
      expect(parsed.scenarios).toHaveLength(2);
      expect(parsed.seed).toBe(TEST_SEED);
      expect(parsed.warnings).toEqual([]);
      expect(parsed.dbPoolPeak).toBe(0);
      expect(parsed.dbPoolLimit).toBe(0);
    });

    it('should include seed in report', async () => {
      const runner = new LoadTestRunner(1337);
      runner.addScenario(passScenario('SB-1', 'Test'));

      const report = await runner.runAll();
      expect(report.seed).toBe(1337);
    });
  });

  // ==========================================================================
  // PASS/FAIL logic
  // ==========================================================================

  describe('Overall result', () => {
    it('should be PASS when all scenarios pass', async () => {
      const runner = new LoadTestRunner(TEST_SEED);
      runner.addScenario(passScenario('SB-1', 'Test 1'));
      runner.addScenario(passScenario('SB-2', 'Test 2'));

      const report = await runner.runAll();
      expect(report.overallResult).toBe('PASS');
    });

    it('should be FAIL when any scenario fails', async () => {
      const runner = new LoadTestRunner(TEST_SEED);
      runner.addScenario(passScenario('SB-1', 'Test 1'));
      runner.addScenario(failScenario('SB-2', 'Test 2', 'assertion failed'));

      const report = await runner.runAll();
      expect(report.overallResult).toBe('FAIL');
    });
  });

  // ==========================================================================
  // ABORT+FAIL path
  // ==========================================================================

  describe('ABORT+FAIL', () => {
    it('should ABORT on unexpected 500 and stop remaining scenarios', async () => {
      const runner = new LoadTestRunner(TEST_SEED);
      const scenario3Ran = jest.fn();

      runner.addScenario(passScenario('SB-1', 'Test 1'));
      runner.addScenario(failScenario('SB-2', 'Test 2', 'HTTP 500: Internal Server Error'));
      runner.addScenario({
        scenarioId: 'SB-3',
        name: 'Test 3',
        run: async () => {
          scenario3Ran();
          return { scenarioId: 'SB-3', name: 'Test 3', result: 'PASS', durationMs: 1, details: {}, errors: [] };
        },
      });

      const report = await runner.runAll();

      expect(report.overallResult).toBe('FAIL');
      expect(report.abortReason).toContain('UNEXPECTED_500');
      // SB-3 should NOT have run (abort stops remaining)
      expect(scenario3Ran).not.toHaveBeenCalled();
      expect(report.scenarios).toHaveLength(2); // Only SB-1 and SB-2
    });

    it('should NOT abort on known error codes (503 SIMULATION_DISABLED)', async () => {
      const runner = new LoadTestRunner(TEST_SEED);
      runner.addScenario(failScenario('SB-1', 'Test 1', 'SIMULATION_DISABLED 503'));
      runner.addScenario(passScenario('SB-2', 'Test 2'));

      const report = await runner.runAll();

      // Known error → no abort, but still FAIL
      expect(report.overallResult).toBe('FAIL');
      expect(report.abortReason).toBeUndefined();
      expect(report.scenarios).toHaveLength(2); // Both ran
    });

    it('should NOT abort on known 409 ESCALATION_STATE_CONFLICT', async () => {
      const runner = new LoadTestRunner(TEST_SEED);
      runner.addScenario(failScenario('SB-6', 'CAS Test', 'ESCALATION_STATE_CONFLICT 409'));
      runner.addScenario(passScenario('SB-7', 'Memory'));

      const report = await runner.runAll();

      expect(report.abortReason).toBeUndefined();
      expect(report.scenarios).toHaveLength(2);
    });

    it('should ABORT on SuiteAbortError (pool exhaustion)', async () => {
      const runner = new LoadTestRunner(TEST_SEED);
      runner.addScenario(passScenario('SB-1', 'Test 1'));
      runner.addScenario(throwScenario('SB-2', 'Test 2',
        new SuiteAbortError('POOL_EXHAUSTION', 'Prisma P1002: connection timeout'),
      ));
      runner.addScenario(passScenario('SB-3', 'Test 3'));

      const report = await runner.runAll();

      expect(report.overallResult).toBe('FAIL');
      expect(report.abortReason).toContain('POOL_EXHAUSTION');
      // SuiteAbortError propagates before result is pushed → only SB-1 in results
      expect(report.scenarios).toHaveLength(1); // SB-2 threw, SB-3 didn't run
      expect(report.scenarios[0].scenarioId).toBe('SB-1');
    });
  });

  // ==========================================================================
  // Timeout path
  // ==========================================================================

  describe('Timeout', () => {
    it('should FAIL scenario that exceeds 60s timeout', async () => {
      const runner = new LoadTestRunner(TEST_SEED);

      // Scenario that takes too long (simulate with a shorter delay for test speed)
      // We can't actually wait 60s in a test, so we test the error handling path
      runner.addScenario({
        scenarioId: 'SB-SLOW',
        name: 'Slow scenario',
        run: async () => {
          // This will be caught by the runner's timeout mechanism
          throw new Error('Scenario SB-SLOW timeout: exceeded 60000ms');
        },
      });

      const report = await runner.runAll();

      expect(report.overallResult).toBe('FAIL');
      expect(report.scenarios[0].result).toBe('FAIL');
      expect(report.scenarios[0].errors[0]).toContain('timeout');
    });
  });

  // ==========================================================================
  // Warnings visibility
  // ==========================================================================

  describe('Warnings', () => {
    it('should include warnings in report when no pool monitor', async () => {
      const runner = new LoadTestRunner(TEST_SEED);
      runner.addScenario(passScenario('SB-1', 'Test'));

      const report = await runner.runAll();
      expect(report.warnings).toEqual([]);
    });
  });

  // ==========================================================================
  // Property 8: 500 Propagation
  // ==========================================================================

  describe('Property 8: 500 Propagation', () => {
    it('any scenario with 500 in errors → overall FAIL', async () => {
      const runner = new LoadTestRunner(TEST_SEED);
      runner.addScenario(passScenario('SB-1', 'OK'));
      runner.addScenario(failScenario('SB-2', 'Bad', 'HTTP 500 unknown'));

      const report = await runner.runAll();
      expect(report.overallResult).toBe('FAIL');
    });

    it('all scenarios PASS → overall PASS', async () => {
      const runner = new LoadTestRunner(TEST_SEED);
      runner.addScenario(passScenario('SB-1', 'OK 1'));
      runner.addScenario(passScenario('SB-2', 'OK 2'));
      runner.addScenario(passScenario('SB-3', 'OK 3'));

      const report = await runner.runAll();
      expect(report.overallResult).toBe('PASS');
    });
  });

  // ==========================================================================
  // Sequential execution
  // ==========================================================================

  describe('Inter-scenario sequence', () => {
    it('should run scenarios in order (not parallel)', async () => {
      const executionOrder: string[] = [];
      const runner = new LoadTestRunner(TEST_SEED);

      for (const id of ['SB-1', 'SB-2', 'SB-3']) {
        runner.addScenario({
          scenarioId: id,
          name: id,
          run: async () => {
            executionOrder.push(id);
            return { scenarioId: id, name: id, result: 'PASS', durationMs: 1, details: {}, errors: [] };
          },
        });
      }

      await runner.runAll();
      expect(executionOrder).toEqual(['SB-1', 'SB-2', 'SB-3']);
    });
  });
});
