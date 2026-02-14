/**
 * LoadTestRunner — Senaryo orkestratörü + rapor üretici
 *
 * Synthetic Load Validation — Task 11.1
 *
 * - Inter-scenario: sequence (for...of) — sinyal izolasyonu
 * - Senaryo timeout: 60s, suite timeout: 5 min
 * - Abort semantics: unexpected 500, pool exhaustion, DB integrity breach → ABORT + FAIL
 * - Seed loglama: run başında + raporda
 *
 * @see .kiro/specs/synthetic-load-validation/design.md
 */

import {
  LoadTestReport,
  ScenarioResult,
  SuiteAbortError,
  AbortReason,
} from './load-test-report.types';
import { DbPoolMonitor } from './helpers/db-pool-monitor';

/** Scenario timeout: 60 seconds */
const SCENARIO_TIMEOUT_MS = 60_000;

/** Suite timeout: 5 minutes */
const SUITE_TIMEOUT_MS = 5 * 60_000;

/** Known error codes that are NOT unexpected 500s */
const KNOWN_ERROR_CODES = new Set([
  'SIMULATION_DISABLED',       // 503 — beklenen fail-closed
  'ESCALATION_STATE_CONFLICT', // 409 — beklenen CAS exhaustion
  'TOO_MANY_SIMULATIONS',      // 429 — beklenen rate limit
  'RUN_NOT_FOUND',             // 404 — beklenen
  'INCIDENT_NOT_FOUND',        // 404 — beklenen
  'DRIFT_DETECTED',            // 409 — beklenen
]);

export type ScenarioFn = () => Promise<ScenarioResult>;

export interface ScenarioEntry {
  scenarioId: string;
  name: string;
  run: ScenarioFn;
}

export class LoadTestRunner {
  private readonly scenarios: ScenarioEntry[] = [];

  constructor(
    private readonly seed: number,
    private readonly poolMonitor?: DbPoolMonitor,
  ) {}

  /** Register a scenario */
  addScenario(entry: ScenarioEntry): void {
    this.scenarios.push(entry);
  }

  /** Run all scenarios sequentially, produce report */
  async runAll(): Promise<LoadTestReport> {
    const startedAt = new Date().toISOString();
    const suiteStart = Date.now();
    const results: ScenarioResult[] = [];
    let abortReason: string | undefined;

    console.log(`[LoadTestRunner] Seed: ${this.seed}`);
    console.log(`[LoadTestRunner] Scenarios: ${this.scenarios.length}`);

    this.poolMonitor?.start();

    try {
      for (const entry of this.scenarios) {
        // Suite timeout check
        if (Date.now() - suiteStart > SUITE_TIMEOUT_MS) {
          abortReason = 'SUITE_TIMEOUT: 5 min exceeded';
          break;
        }

        const result = await this.runWithTimeout(entry);
        results.push(result);

        // Check for unexpected 500 → ABORT
        if (result.result === 'FAIL') {
          const hasUnexpected500 = result.errors.some(
            (e) => e.includes('500') && !this.isKnownError(e),
          );
          if (hasUnexpected500) {
            abortReason = `UNEXPECTED_500 in ${entry.scenarioId}: ${result.errors[0]}`;
            break;
          }
        }
      }
    } catch (err) {
      if (err instanceof SuiteAbortError) {
        abortReason = `${err.reason}: ${err.detail}`;
      } else {
        abortReason = `UNEXPECTED: ${(err as Error).message}`;
      }
    } finally {
      this.poolMonitor?.stop();
    }

    const warnings = this.poolMonitor?.getWarnings() ?? [];
    const overallResult = this.computeOverallResult(results, abortReason);

    const report: LoadTestReport = {
      startedAt,
      completedAt: new Date().toISOString(),
      overallResult,
      scenarios: results,
      dbPoolPeak: this.poolMonitor?.getPeakActiveConnections() ?? 0,
      dbPoolLimit: this.poolMonitor?.getPoolLimit() ?? 0,
      seed: this.seed,
      warnings,
      ...(abortReason ? { abortReason } : {}),
    };

    console.log(`[LoadTestRunner] Overall: ${overallResult}`);
    if (abortReason) console.log(`[LoadTestRunner] Abort: ${abortReason}`);
    if (warnings.length > 0) console.log(`[LoadTestRunner] Warnings:`, warnings);

    return report;
  }

  /** Run a single scenario with timeout */
  private async runWithTimeout(entry: ScenarioEntry): Promise<ScenarioResult> {
    const start = Date.now();

    try {
      const result = await Promise.race([
        entry.run(),
        this.timeout(entry.scenarioId),
      ]);
      return result;
    } catch (err) {
      if (err instanceof SuiteAbortError) throw err; // propagate abort
      return {
        scenarioId: entry.scenarioId,
        name: entry.name,
        result: 'FAIL',
        durationMs: Date.now() - start,
        details: {},
        errors: [(err as Error).message],
      };
    }
  }

  /** Timeout promise — rejects after SCENARIO_TIMEOUT_MS */
  private timeout(scenarioId: string): Promise<never> {
    return new Promise((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error(`Scenario ${scenarioId} timeout: exceeded ${SCENARIO_TIMEOUT_MS}ms`));
      }, SCENARIO_TIMEOUT_MS);
    });
  }

  /** Check if an error message corresponds to a known (non-unexpected) error */
  private isKnownError(errorMsg: string): boolean {
    return Array.from(KNOWN_ERROR_CODES).some((code) => errorMsg.includes(code));
  }

  /** Compute overall result */
  private computeOverallResult(
    results: ScenarioResult[],
    abortReason?: string,
  ): 'PASS' | 'FAIL' {
    if (abortReason) return 'FAIL';
    if (results.some((r) => r.result === 'FAIL')) return 'FAIL';
    return 'PASS';
  }
}
