/**
 * M3 — Snapshot Path Pressure (Simulated Mode)
 *
 * Performance Characterization — Task 16.1
 *
 * Warm (cache hit) vs Cold (forced refresh) modlarını deterministik simüle eder.
 * Concurrency sweep: [1, 2, 4, 8, 16, 32] — latency modeline parametre olarak girer.
 * Gerçek async IO yok; p-limit/pool yok.
 *
 * Latency model:
 *   snapshotFetchMs = mode === 'warm'
 *     ? warmBaseMs × (1 + 0.1 × log2(concurrency))
 *     : coldBaseMs × (1 + 0.3 × log2(concurrency))
 *   totalLatencyMs = baseLatencyMs + phase7CostMs + snapshotFetchMs
 *
 * @see .kiro/specs/perf-characterization/design.md — Task 16 M3 section
 * @see Requirements 10.1, 10.2, 10.3, 10.4
 */

import * as fs from 'fs';
import * as path from 'path';
import { PerfHarness } from '../perf-harness';
import { SplitTimer, computeHistogramStats } from '../helpers/split-timer';
import { EventLoopMonitor } from '../helpers/event-loop-monitor';
import {
  computeBaseLatencyMs,
  DEFAULT_BASE_LATENCY_CONFIG,
} from '../helpers/simulated-measure';
import { mulberry32 } from '../helpers/dataset-generator';
import {
  MatrixReport,
  SnapshotPressureResult,
  PathResult,
  ConcurrencyStep,
} from '../perf-report.types';

jest.setTimeout(120_000);

// ============================================================================
// M3 Config
// ============================================================================

interface M3Config {
  matrixId: 'M3';
  modes: readonly ['warm', 'cold'];
  concurrencySteps: readonly number[];
  requestsPerStep: number;
  seed: number;
  warmBaseMs: number;
  coldBaseMs: number;
  phase7CostMs: number;
}

const DEFAULT_M3_CONFIG: M3Config = {
  matrixId: 'M3',
  modes: ['warm', 'cold'] as const,
  concurrencySteps: [1, 2, 4, 8, 16, 32],
  requestsPerStep: 100,
  seed: 42,
  warmBaseMs: 0.5,
  coldBaseMs: 8.0,
  phase7CostMs: 0.8,
};

// ============================================================================
// Step Runner
// ============================================================================

function runStep(
  mode: 'warm' | 'cold',
  concurrency: number,
  config: M3Config,
  splitTimer: SplitTimer,
  eventLoopMonitor: EventLoopMonitor,
  rng: () => number,
): { step: ConcurrencyStep; snapshotFetchLatencies: number[]; allLatencies: number[] } {
  // Runtime guard: concurrency >= 1
  if (concurrency < 1) {
    throw new Error(`concurrency must be >= 1, got ${concurrency}`);
  }

  // 1. Reset per step
  splitTimer.reset();
  eventLoopMonitor.snapshot(); // drain previous

  // 2. CPU delta start — not needed for ConcurrencyStep (no CPU field)
  // but wallStart kept for potential future use

  // 3. Latency arrays
  const snapshotFetchLatencies: number[] = [];
  const allLatencies: number[] = [];

  // 4. Request loop
  for (let i = 0; i < config.requestsPerStep; i++) {
    const reqId = `m3_${mode}_c${concurrency}_${i}`;
    splitTimer.startRequest(reqId);

    // Base latency from shared model (M0/M1/M2 tutarlı)
    const baseLatencyMs = computeBaseLatencyMs(50, DEFAULT_BASE_LATENCY_CONFIG, rng);

    // Snapshot fetch latency — concurrency penalty
    const baseMs = mode === 'warm' ? config.warmBaseMs : config.coldBaseMs;
    const k = mode === 'warm' ? 0.1 : 0.3;
    const jitter = (rng() * 2 - 1) * 0.05; // ±%5 bounded
    const snapshotFetchMs = baseMs * (1 + k * Math.log2(Math.max(1, concurrency))) * (1 + jitter);

    // Phase-7 splits (M1 pattern)
    const costBase = config.phase7CostMs;
    const fetchMs = snapshotFetchMs; // snapshot_fetch = actual snapshot fetch latency
    const calcMs = costBase * 0.25 * (1 + (rng() * 2 - 1) * 0.05);
    const auditMs = costBase * 0.25 * (1 + (rng() * 2 - 1) * 0.05);
    const emitMs = costBase * 0.125 * (1 + (rng() * 2 - 1) * 0.05);

    splitTimer.recordSplit(reqId, 'snapshot_fetch', fetchMs);
    splitTimer.recordSplit(reqId, 'drift_calc', calcMs);
    splitTimer.recordSplit(reqId, 'audit_write', auditMs);
    splitTimer.recordSplit(reqId, 'metrics_emit', emitMs);

    const totalLatencyMs = baseLatencyMs + config.phase7CostMs + snapshotFetchMs;
    splitTimer.endRequest(reqId, totalLatencyMs);

    snapshotFetchLatencies.push(snapshotFetchMs);
    allLatencies.push(totalLatencyMs);
  }

  // 5. EventLoop snapshot
  const eventLoop = eventLoopMonitor.snapshot();

  // 7. ConcurrencyStep result
  const step: ConcurrencyStep = {
    concurrency,
    snapshotFetchMs: computeHistogramStats(snapshotFetchLatencies),
    eventLoop,
  };

  return { step, snapshotFetchLatencies, allLatencies };
}


// ============================================================================
// Console Summary
// ============================================================================

function printConsoleSummary(
  steps: ConcurrencyStep[],
  warmPath: PathResult,
  coldPath: PathResult,
  coldPathP99ContributionMs: number,
  seed: number,
): void {
  console.log('\n=== M3 Snapshot Path Pressure Summary ===');
  console.log(`Seed: ${seed}`);
  console.log('─'.repeat(80));
  console.log(
    'Mode'.padEnd(8) +
    'Conc'.padEnd(8) +
    'Reqs'.padEnd(8) +
    'fetchP50'.padEnd(12) +
    'fetchP99'.padEnd(12) +
    'fetchMax'.padEnd(12) +
    'EL p99'.padEnd(10),
  );
  console.log('─'.repeat(80));

  // warm steps first (indices 0..5), then cold (6..11)
  const modes: Array<'warm' | 'cold'> = ['warm', 'cold'];
  let idx = 0;
  for (const mode of modes) {
    for (let i = 0; i < 6; i++) {
      const s = steps[idx++];
      console.log(
        mode.padEnd(8) +
        `${s.concurrency}`.padEnd(8) +
        `${s.snapshotFetchMs.count}`.padEnd(8) +
        `${s.snapshotFetchMs.p50.toFixed(2)}`.padEnd(12) +
        `${s.snapshotFetchMs.p99.toFixed(2)}`.padEnd(12) +
        `${s.snapshotFetchMs.max.toFixed(2)}`.padEnd(12) +
        `${s.eventLoop.p99Ms.toFixed(2)}`.padEnd(10),
      );
    }
  }

  console.log('─'.repeat(80));
  console.log(`Warm path aggregate — fetchP99: ${warmPath.snapshotFetchMs.p99.toFixed(2)}ms`);
  console.log(`Cold path aggregate — fetchP99: ${coldPath.snapshotFetchMs.p99.toFixed(2)}ms`);
  console.log(`Cold path p99 contribution: ${coldPathP99ContributionMs.toFixed(2)}ms`);
  console.log('================================================\n');
}

// ============================================================================
// Test
// ============================================================================

const outputDir = path.join(__dirname, '..', 'reports', '__test_m3__');

describe('M3 — Snapshot Path Pressure (Simulated)', () => {
  let harness: PerfHarness;
  const config = DEFAULT_M3_CONFIG;

  beforeAll(() => {
    harness = new PerfHarness(undefined, { seed: config.seed, outputDir });
  });

  afterAll(() => {
    harness.eventLoopMonitor.stop();
    if (fs.existsSync(outputDir)) {
      const files = fs.readdirSync(outputDir);
      for (const f of files) fs.unlinkSync(path.join(outputDir, f));
      try { fs.rmdirSync(outputDir); } catch { /* ignore */ }
    }
  });

  it('runs warm + cold sweeps across 6 concurrency levels and emits report', async () => {
    harness.eventLoopMonitor.start();

    const env = await harness.captureEnvironmentSnapshot();
    const report: MatrixReport = harness.createEmptyReport('M3', env);
    const rng = mulberry32(config.seed);

    const allSteps: ConcurrencyStep[] = [];
    const warmFetchAll: number[] = [];
    const coldFetchAll: number[] = [];

    // ── Warm sweep ──
    for (const concurrency of config.concurrencySteps) {
      const { step, snapshotFetchLatencies } = runStep(
        'warm', concurrency, config, harness.splitTimer, harness.eventLoopMonitor, rng,
      );
      allSteps.push(step);
      warmFetchAll.push(...snapshotFetchLatencies);
    }

    // ── Cold sweep ──
    for (const concurrency of config.concurrencySteps) {
      const { step, snapshotFetchLatencies } = runStep(
        'cold', concurrency, config, harness.splitTimer, harness.eventLoopMonitor, rng,
      );
      allSteps.push(step);
      coldFetchAll.push(...snapshotFetchLatencies);
    }

    // ── Aggregate PathResults ──
    const warmEventLoop = harness.eventLoopMonitor.snapshot();
    const warmPath: PathResult = {
      snapshotFetchMs: computeHistogramStats(warmFetchAll),
      eventLoop: warmEventLoop,
      pendingAsyncOps: 0, // simulated — gerçek async yok
    };

    const coldEventLoop = harness.eventLoopMonitor.snapshot();
    const coldPath: PathResult = {
      snapshotFetchMs: computeHistogramStats(coldFetchAll),
      eventLoop: coldEventLoop,
      pendingAsyncOps: 0,
    };

    const coldPathP99ContributionMs =
      coldPath.snapshotFetchMs.p99 - warmPath.snapshotFetchMs.p99;

    // ── Populate report ──
    const snapshotPressure: SnapshotPressureResult = {
      warmPath,
      coldPath,
      coldPathP99ContributionMs,
      concurrencySteps: allSteps,
    };
    report.snapshotPressure = snapshotPressure;
    report.splitTimers = harness.splitTimer.snapshot();
    report.completedAt = new Date().toISOString();

    // ── Save report ──
    const filePath = harness.saveReport(report, 'm3-snapshot-pressure-simulated.json');
    expect(fs.existsSync(filePath)).toBe(true);

    // ── Verify report structure ──
    const loaded = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as MatrixReport;
    expect(loaded.matrixId).toBe('M3');
    expect(loaded.snapshotPressure).not.toBeNull();
    const sp = loaded.snapshotPressure!;

    // ── Guard 1: Step count ──
    expect(sp.concurrencySteps).toHaveLength(12); // 2 modes × 6 concurrency

    // ── Guard 2: Finite numerics on ConcurrencyStep fields ──
    for (const step of sp.concurrencySteps) {
      expect(step.concurrency).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(step.snapshotFetchMs.p50)).toBe(true);
      expect(Number.isFinite(step.snapshotFetchMs.p95)).toBe(true);
      expect(Number.isFinite(step.snapshotFetchMs.p99)).toBe(true);
      expect(Number.isFinite(step.snapshotFetchMs.max)).toBe(true);
      expect(Number.isFinite(step.snapshotFetchMs.mean)).toBe(true);
      expect(Number.isFinite(step.snapshotFetchMs.count)).toBe(true);
      expect(step.snapshotFetchMs.count).toBe(config.requestsPerStep);
      expect(Number.isFinite(step.eventLoop.p50Ms)).toBe(true);
      expect(Number.isFinite(step.eventLoop.p99Ms)).toBe(true);
    }

    // ── Guard 3: Finite numerics on PathResult fields ──
    for (const pr of [sp.warmPath, sp.coldPath]) {
      expect(Number.isFinite(pr.snapshotFetchMs.p50)).toBe(true);
      expect(Number.isFinite(pr.snapshotFetchMs.p95)).toBe(true);
      expect(Number.isFinite(pr.snapshotFetchMs.p99)).toBe(true);
      expect(Number.isFinite(pr.snapshotFetchMs.max)).toBe(true);
      expect(Number.isFinite(pr.snapshotFetchMs.mean)).toBe(true);
      expect(Number.isFinite(pr.snapshotFetchMs.count)).toBe(true);
      expect(Number.isFinite(pr.eventLoop.p50Ms)).toBe(true);
      expect(Number.isFinite(pr.eventLoop.p99Ms)).toBe(true);
    }

    // ── Guard 4: Units invariant ──
    // snapshotFetchMs.p99 < Math.max(10_000, coldBaseMs * 100)
    const unitsUpperBound = Math.max(10_000, config.coldBaseMs * 100);
    for (const step of sp.concurrencySteps) {
      expect(step.snapshotFetchMs.p99).toBeLessThan(unitsUpperBound);
    }
    expect(sp.warmPath.snapshotFetchMs.p99).toBeLessThan(unitsUpperBound);
    expect(sp.coldPath.snapshotFetchMs.p99).toBeLessThan(unitsUpperBound);

    // ── Guard 5: Seed invariant ──
    expect(loaded.seed).toBe(config.seed);

    // ── Guard 6: coldPathP99ContributionMs (diagnostic — no hard assert) ──
    expect(Number.isFinite(sp.coldPathP99ContributionMs)).toBe(true);
    // Diagnostic log only — cold > warm expected but not enforced
    console.log(`[M3 diagnostic] coldPathP99ContributionMs = ${sp.coldPathP99ContributionMs.toFixed(2)}ms`);

    // ── Console summary ──
    printConsoleSummary(allSteps, warmPath, coldPath, coldPathP99ContributionMs, config.seed);

    harness.eventLoopMonitor.stop();
  });
});
