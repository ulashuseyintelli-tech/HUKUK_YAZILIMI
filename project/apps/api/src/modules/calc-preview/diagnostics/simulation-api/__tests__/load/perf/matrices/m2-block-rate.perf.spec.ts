/**
 * M2 — Block-Rate Controlled Runs (Simulated — Opsiyon A)
 *
 * Performance Characterization — Task 14.1
 *
 * Pipeline doğrulama: dataset → bucket → tolerans → rapor.
 * Sabit RPS'te 4 bucket (0/10/50/90) koşulur.
 * Block kararı dataset'ten gelir (expectedBlock = ground truth).
 * Block olan kayıtlara blockPenaltyMs ek latency uygulanır.
 *
 * AdaptiveSweep KULLANILMAZ — M2 sabit RPS'te çalışır.
 *
 * @see .kiro/specs/perf-characterization/design.md — M2-1..M2-6
 * @see Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 15.5, 15.6
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PerfHarness } from '../perf-harness';
import { SplitTimer, computeHistogramStats } from '../helpers/split-timer';
import { EventLoopMonitor } from '../helpers/event-loop-monitor';
import {
  computeBaseLatencyMs,
  DEFAULT_BASE_LATENCY_CONFIG,
  DEFAULT_SIMULATED_CONFIG,
} from '../helpers/simulated-measure';
import { mulberry32 } from '../helpers/dataset-generator';
import {
  MatrixReport,
  BlockRateBucketResult,
  CpuSnapshot,
  MemorySnapshot,
} from '../perf-report.types';

jest.setTimeout(120_000);

// ============================================================================
// M2 Config
// ============================================================================

interface M2RunConfig {
  rps: number;
  durationSecPerBucket: number;
  blockPenaltyMs: number;
  phase7CostMs: number;
  tolerancePercent: number;
  windowSize: number;
  windowTolerancePct: number;
  seed: number;
}

const DEFAULT_M2_CONFIG: M2RunConfig = {
  rps: 50, // M1 sustainableRPS'in altında sabit değer
  durationSecPerBucket: 30, // simulated — gerçek bekleme yok
  blockPenaltyMs: 2.0,
  phase7CostMs: DEFAULT_SIMULATED_CONFIG.phase7CostMs,
  tolerancePercent: 2,
  windowSize: 100,
  windowTolerancePct: 10,
  seed: 42,
};

// ============================================================================
// Fixture types (JSON format)
// ============================================================================

interface FixtureMetadata {
  schemaVersion: string;
  generatorVersion: string;
  seed: number;
  recordCount: number;
  targetBlockRate: number;
  computedBlockRate: number;
  driftThreshold: number;
  windowSize: number;
  windowTolerancePct: number;
  withinTolerance: boolean;
  distributionFair: boolean;
  worstWindowIndex: number;
  worstWindowBlockRate: number;
  worstWindowDeviationPct: number;
}

interface FixtureRecord {
  id: number;
  expectedBlock: boolean;
}

interface BucketFixture {
  metadata: FixtureMetadata;
  records: FixtureRecord[];
}

// ============================================================================
// Bucket definitions
// ============================================================================

const BUCKETS = [
  { name: 'bucket-0', targetBlockRate: 0.00, file: 'bucket-0.json' },
  { name: 'bucket-10', targetBlockRate: 0.10, file: 'bucket-10.json' },
  { name: 'bucket-50', targetBlockRate: 0.50, file: 'bucket-50.json' },
  { name: 'bucket-90', targetBlockRate: 0.90, file: 'bucket-90.json' },
];

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures', 'block-rate-datasets');

// ============================================================================
// Helpers
// ============================================================================

function loadFixture(filename: string): BucketFixture {
  const filePath = path.join(FIXTURES_DIR, filename);
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as BucketFixture;
}

function runBucket(
  fixture: BucketFixture,
  config: M2RunConfig,
  splitTimer: SplitTimer,
  eventLoopMonitor: EventLoopMonitor,
): BlockRateBucketResult {
  const rng = mulberry32(config.seed);
  const { records, metadata } = fixture;
  const recordCount = records.length;
  const requestCount = Math.max(1, Math.round(config.rps * config.durationSecPerBucket));

  // Reset per bucket
  splitTimer.reset();
  eventLoopMonitor.snapshot(); // drain previous

  // CPU delta start
  const cpuBefore = process.cpuUsage();
  const wallStart = Date.now();

  // Latency arrays for block/accept split
  const blockLatencies: number[] = [];
  const acceptLatencies: number[] = [];
  const allLatencies: number[] = [];
  let blockCounter = 0;

  for (let i = 0; i < requestCount; i++) {
    const record = records[i % recordCount];
    const reqId = `m2_${metadata.targetBlockRate}_${i}`;

    // Base latency from shared model
    const baseLatency = computeBaseLatencyMs(config.rps, DEFAULT_BASE_LATENCY_CONFIG, rng);

    // Block penalty
    const isBlocked = record.expectedBlock;
    const blockPenalty = isBlocked ? config.blockPenaltyMs : 0;
    const totalLatency = Math.max(0, baseLatency + config.phase7CostMs + blockPenalty);

    // SplitTimer recording (Phase-7 ON pattern)
    splitTimer.startRequest(reqId);
    const costBase = config.phase7CostMs;
    splitTimer.recordSplit(reqId, 'snapshot_fetch', costBase * 0.375);
    splitTimer.recordSplit(reqId, 'drift_calc', costBase * 0.25);
    splitTimer.recordSplit(reqId, 'audit_write', costBase * 0.25);
    splitTimer.recordSplit(reqId, 'metrics_emit', costBase * 0.125);
    splitTimer.endRequest(reqId, totalLatency);

    // Collect latencies
    allLatencies.push(totalLatency);
    if (isBlocked) {
      blockLatencies.push(totalLatency);
      blockCounter++;
    } else {
      acceptLatencies.push(totalLatency);
    }
  }

  // CPU delta end
  const wallElapsed = Math.max(1, Date.now() - wallStart);
  const cpuAfter = process.cpuUsage(cpuBefore);
  const cores = os.cpus().length;
  const cpu: CpuSnapshot = {
    userPercent: Math.max(0, (cpuAfter.user / 1000 / wallElapsed / cores) * 100),
    systemPercent: Math.max(0, (cpuAfter.system / 1000 / wallElapsed / cores) * 100),
    totalPercent: Math.max(0, ((cpuAfter.user + cpuAfter.system) / 1000 / wallElapsed / cores) * 100),
  };

  // Memory snapshot
  const mem = process.memoryUsage();
  const memory: MemorySnapshot = {
    rssKB: Math.round(mem.rss / 1024),
    heapUsedMB: Math.round(mem.heapUsed / (1024 * 1024)),
    heapTotalMB: Math.round(mem.heapTotal / (1024 * 1024)),
    externalMB: Math.round(mem.external / (1024 * 1024)),
  };

  // Observed block rate
  const observedBlockRate = requestCount > 0 ? blockCounter / requestCount : 0;

  // Tolerance check — discrete correction: en az 1 request tolerans
  const allowedDelta = Math.max(Math.round((config.tolerancePercent / 100) * requestCount), 1) / requestCount;
  const withinTolerance = Math.abs(observedBlockRate - metadata.targetBlockRate) <= allowedDelta;

  // Distribution fairness from fixture metadata (already validated by P8b)
  const distributionFair = metadata.distributionFair;

  return {
    targetBlockRate: metadata.targetBlockRate,
    actualBlockRate: observedBlockRate,
    withinTolerance,
    distributionFair,
    worstWindowBlockRate: metadata.worstWindowBlockRate,
    worstWindowDeviationPct: metadata.worstWindowDeviationPct,
    latency: computeHistogramStats(allLatencies),
    blockLatency: computeHistogramStats(blockLatencies),
    acceptLatency: computeHistogramStats(acceptLatencies),
    cpu,
    memory,
    durationMin: config.durationSecPerBucket / 60,
    blockPenaltyAppliedMs: config.blockPenaltyMs,
    requestCount,
    blockCount: blockCounter,
  };
}

// ============================================================================
// Console Summary
// ============================================================================

function printConsoleSummary(results: BlockRateBucketResult[], seed: number): void {
  console.log('\n=== M2 Block-Rate Controlled Runs Summary ===');
  console.log(`Seed: ${seed}`);
  console.log('─'.repeat(100));
  console.log(
    'Bucket'.padEnd(10) +
    'Target'.padEnd(10) +
    'Observed'.padEnd(10) +
    'Tol'.padEnd(6) +
    'Fair'.padEnd(6) +
    'Reqs'.padEnd(8) +
    'Blocks'.padEnd(8) +
    'p50(all)'.padEnd(10) +
    'p99(all)'.padEnd(10) +
    'p99(blk)'.padEnd(10) +
    'p99(acc)'.padEnd(10) +
    'Δ(blk-acc)',
  );
  console.log('─'.repeat(100));

  for (const r of results) {
    const deltaP99 = r.blockLatency.count > 0 && r.acceptLatency.count > 0
      ? (r.blockLatency.p99 - r.acceptLatency.p99).toFixed(2)
      : 'N/A';
    console.log(
      `${(r.targetBlockRate * 100).toFixed(0)}%`.padEnd(10) +
      `${(r.targetBlockRate * 100).toFixed(1)}%`.padEnd(10) +
      `${(r.actualBlockRate * 100).toFixed(1)}%`.padEnd(10) +
      `${r.withinTolerance ? '✓' : '✗'}`.padEnd(6) +
      `${r.distributionFair ? '✓' : '✗'}`.padEnd(6) +
      `${r.requestCount}`.padEnd(8) +
      `${r.blockCount}`.padEnd(8) +
      `${r.latency.p50.toFixed(2)}`.padEnd(10) +
      `${r.latency.p99.toFixed(2)}`.padEnd(10) +
      `${r.blockLatency.p99.toFixed(2)}`.padEnd(10) +
      `${r.acceptLatency.p99.toFixed(2)}`.padEnd(10) +
      `${deltaP99}`,
    );
  }
  console.log('─'.repeat(100));
  console.log(`blockPenaltyMs: ${results[0]?.blockPenaltyAppliedMs ?? 'N/A'}`);
  console.log('================================================\n');
}

// ============================================================================
// Test
// ============================================================================

const outputDir = path.join(__dirname, '..', 'reports', '__test_m2__');

describe('M2 — Block-Rate Controlled Runs (Simulated)', () => {
  let harness: PerfHarness;
  const config = DEFAULT_M2_CONFIG;

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

  it('runs 4 buckets at fixed RPS and emits report + console summary', async () => {
    harness.eventLoopMonitor.start();

    const env = await harness.captureEnvironmentSnapshot();
    const report: MatrixReport = harness.createEmptyReport('M2', env);
    const bucketResults: BlockRateBucketResult[] = [];

    for (const bucket of BUCKETS) {
      // 1. Load fixture
      const fixture = loadFixture(bucket.file);

      // 2. Validate fixture metadata (P8a + P8b pre-check)
      expect(fixture.metadata.withinTolerance).toBe(true);
      expect(fixture.metadata.distributionFair).toBe(true);
      expect(fixture.metadata.targetBlockRate).toBe(bucket.targetBlockRate);
      expect(fixture.metadata.recordCount).toBeGreaterThan(0);

      // 2b. Tek kaynak invariant: block kararı yalnız dataset expectedBlock'tan gelir
      // Config'teki targetBlockRate sadece doğrulama içindir, block kararı üretmez
      expect(fixture.metadata.targetBlockRate).toBeCloseTo(
        fixture.records.filter((r) => r.expectedBlock).length / fixture.records.length,
        1, // 1 decimal precision — fixture P8a ile zaten ±%2 içinde
      );

      // 3. Run bucket
      const result = runBucket(fixture, config, harness.splitTimer, harness.eventLoopMonitor);

      // 4. Assert block rate tolerance (P8a runtime)
      expect(result.withinTolerance).toBe(true);
      expect(Math.abs(result.actualBlockRate - bucket.targetBlockRate)).toBeLessThanOrEqual(
        config.tolerancePercent / 100,
      );

      // 5. Assert distribution fairness (P8b — from fixture)
      // Garanti: her 100'lük pencerede block rate hedefin ±%10'u içinde
      // worstWindowDeviationPct kanıt metriği olarak raporda mevcut
      expect(result.distributionFair).toBe(true);
      expect(result.worstWindowDeviationPct).toBeLessThanOrEqual(
        config.windowTolerancePct / 100,
      );

      // 6. Assert block penalty visible in latency split
      if (bucket.targetBlockRate > 0 && bucket.targetBlockRate < 1) {
        // Block latency should be higher than accept latency by ~blockPenaltyMs
        expect(result.blockLatency.mean).toBeGreaterThan(result.acceptLatency.mean);
      }

      // 7. Assert counts
      expect(result.requestCount).toBe(Math.round(config.rps * config.durationSecPerBucket));
      expect(result.blockPenaltyAppliedMs).toBe(config.blockPenaltyMs);

      bucketResults.push(result);
    }

    // 8. Populate report
    report.blockRateBuckets = bucketResults;
    report.splitTimers = harness.splitTimer.snapshot();
    report.completedAt = new Date().toISOString();

    // 9. Save report
    const filePath = harness.saveReport(report, 'm2-block-rate-simulated.json');
    expect(fs.existsSync(filePath)).toBe(true);

    // 10. Verify report structure
    const loaded = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as MatrixReport;
    expect(loaded.matrixId).toBe('M2');
    expect(loaded.blockRateBuckets).toHaveLength(4);
    expect(loaded.seed).toBe(config.seed);
    for (const br of loaded.blockRateBuckets) {
      expect(br.withinTolerance).toBe(true);
      expect(br.distributionFair).toBe(true);
      expect(br.blockPenaltyAppliedMs).toBe(config.blockPenaltyMs);
      expect(br.requestCount).toBeGreaterThan(0);
    }

    // ── Guard 1: Bucket integrity (schema shape) ──
    for (const br of loaded.blockRateBuckets) {
      // Count bounds
      expect(br.blockCount).toBeGreaterThanOrEqual(0);
      expect(br.blockCount).toBeLessThanOrEqual(br.requestCount);
      expect(br.actualBlockRate).toBeGreaterThanOrEqual(0);
      expect(br.actualBlockRate).toBeLessThanOrEqual(1);

      // All numeric fields finite
      const histFields = [br.latency, br.blockLatency, br.acceptLatency];
      for (const h of histFields) {
        expect(Number.isFinite(h.p50)).toBe(true);
        expect(Number.isFinite(h.p95)).toBe(true);
        expect(Number.isFinite(h.p99)).toBe(true);
        expect(Number.isFinite(h.mean)).toBe(true);
        expect(Number.isFinite(h.count)).toBe(true);
      }
      expect(Number.isFinite(br.cpu.userPercent)).toBe(true);
      expect(Number.isFinite(br.cpu.systemPercent)).toBe(true);
      expect(Number.isFinite(br.cpu.totalPercent)).toBe(true);
      expect(Number.isFinite(br.memory.rssKB)).toBe(true);
      expect(Number.isFinite(br.memory.heapUsedMB)).toBe(true);
    }

    // ── Guard 2: Units invariant (latency ms) ──
    // Saniyeye kayma bug'ını yakalar — config-relative upper bound
    const baselineP99Ms = computeBaseLatencyMs(
      config.rps,
      DEFAULT_BASE_LATENCY_CONFIG,
      mulberry32(config.seed),
    );
    const latencyUpperBound = Math.max(10_000, baselineP99Ms * 100);
    for (const br of loaded.blockRateBuckets) {
      expect(br.latency.p99).toBeLessThan(latencyUpperBound);
      expect(br.blockLatency.p99).toBeLessThan(latencyUpperBound);
      expect(br.acceptLatency.p99).toBeLessThan(latencyUpperBound);
    }

    // ── Guard 3: Seed invariant ──
    expect(loaded.seed).toBe(config.seed);

    // 11. Console summary
    printConsoleSummary(bucketResults, config.seed);

    harness.eventLoopMonitor.stop();
  });
});
