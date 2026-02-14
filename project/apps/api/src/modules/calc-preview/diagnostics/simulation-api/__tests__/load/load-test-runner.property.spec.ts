/**
 * Property 8: Rapor Bütünlüğü — 500 Propagasyonu (P8)
 *
 * Synthetic Load Validation — Task 11.2
 *
 * For any senaryo sonuç seti:
 * - Herhangi bir senaryo errors listesinde 500 içeriyorsa → overallResult = FAIL
 * - Tüm senaryolar PASS ise → overallResult = PASS
 *
 * Feature: synthetic-load-validation, Property 8: Rapor Bütünlüğü — 500 Propagasyonu
 *
 * @see .kiro/specs/synthetic-load-validation/design.md Property 8
 * @see .kiro/specs/synthetic-load-validation/requirements.md Req 8.2
 */

import * as fc from 'fast-check';
import { LoadTestRunner, ScenarioEntry } from './load-test-runner';
import type { ScenarioResult } from './load-test-report.types';

const TEST_SEED = 42;

/** Arbitrary that generates a scenario entry with configurable result */
function scenarioEntry(
  id: string,
  result: 'PASS' | 'FAIL',
  errors: string[] = [],
): ScenarioEntry {
  return {
    scenarioId: id,
    name: `Scenario ${id}`,
    run: async (): Promise<ScenarioResult> => ({
      scenarioId: id,
      name: `Scenario ${id}`,
      result,
      durationMs: 1,
      details: {},
      errors,
    }),
  };
}

describe('Property 8: 500 Propagation', () => {
  it('∀ scenario sets: any 500 in errors → overall FAIL', async () => {
    await fc.assert(
      fc.asyncProperty(
        // N scenarios (1-20)
        fc.integer({ min: 1, max: 20 }),
        // Index of the scenario that will have a 500 error (0-based)
        fc.integer({ min: 0, max: 19 }),
        async (N, errorIdx) => {
          const adjustedErrorIdx = errorIdx % N; // Ensure within bounds
          const runner = new LoadTestRunner(TEST_SEED);

          for (let i = 0; i < N; i++) {
            if (i === adjustedErrorIdx) {
              runner.addScenario(scenarioEntry(`SB-${i}`, 'FAIL', ['HTTP 500 unknown error']));
            } else {
              runner.addScenario(scenarioEntry(`SB-${i}`, 'PASS'));
            }
          }

          const report = await runner.runAll();

          // Invariant: any 500 → overall FAIL + ABORT
          expect(report.overallResult).toBe('FAIL');
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('∀ N ∈ [1,20]: all PASS scenarios → overall PASS', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }),
        async (N) => {
          const runner = new LoadTestRunner(TEST_SEED);

          for (let i = 0; i < N; i++) {
            runner.addScenario(scenarioEntry(`SB-${i}`, 'PASS'));
          }

          const report = await runner.runAll();

          // Invariant: all PASS → overall PASS
          expect(report.overallResult).toBe('PASS');
          expect(report.abortReason).toBeUndefined();
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});
