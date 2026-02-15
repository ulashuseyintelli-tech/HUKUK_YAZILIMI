/**
 * M4 — GC Pressure (Simulated Mode)
 *
 * Performance Characterization — Task 17.1
 *
 * Stabil RPS altında 60 dk (simüle) yük ile heap büyüme trendi, allocation rate
 * ve leak tespiti. Gerçek 60 dk bekleme yok — 5 interval sentetik üretilir.
 * Her interval'de gerçek process.memoryUsage() + v8.getHeapStatistics() alınır.
 *
 * Leak simülasyonu: JS heap (Array.from unique objects) + external (Buffer.alloc).
 * Delta tabanlı — mutlak MB değerleri CI'da non-deterministic.
 *
 * @see .kiro/specs/perf-characterization/design.md — Task 17 M4 section
 * @see Requirements 11.1, 11.2, 11.3, 11.4, 11.5
 */

import * as fs from 'fs';
import * as path from 'path';
import * as v8 from 'v8';
import { PerfHarness } from '../perf-harness';
import {
  computeBaseLatencyMs,
  DEFAULT_BASE_LATENCY_CONFIG,
} from '../helpers/simulated-measure';
import { mulberry32 } from '../helpers/dataset-generator';
import {
  MatrixReport,
  HeapSnapshot,
  HeapTrend,
} from '../perf-report.types';

jest.setTimeout(120_000);

// ============================================================================
// M4 Config
// ============================================================================

interface M4Config {
  matrixId: 'M4';
  phase7Enabled: boolean;
  rps: number;
  durationMin: number;
  snapshotIntervalMin: number;
  intervalCount: number;
  requestsPerInterval: number;
  seed: number;
  phase7CostMs: number;
  // Leak simülasyon parametreleri
  leakPerIntervalMB: number;
  burstFactor: number;
  // Threshold tetikleyici (delta tabanlı)
  heapDeltaThresholdMB: number;
  heapGrowthThresholdPct: number;
  // Leak detection eşikleri
  leakSlopeThresholdMB: number;
  leakTotalThresholdMB: number;
  maxOldSpaceSizeMB: number;
}

const DEFAULT_M4_CONFIG: M4Config = {
  matrixId: 'M4',
  phase7Enabled: true,
  rps: 50,
  durationMin: 60,
  snapshotIntervalMin: 15,
  intervalCount: 5,           // 0, 15, 30, 45, 60 dk
  requestsPerInterval: 200,
  seed: 42,
  phase7CostMs: 0.8,
  leakPerIntervalMB: 2.0,
  burstFactor: 3.0,           // interval 2-3'te 6MB JS heap retention
  heapDeltaThresholdMB: 10,
  heapGrowthThresholdPct: 15,
  leakSlopeThresholdMB: 0.5,  // MB/interval
  leakTotalThresholdMB: 5.0,  // MB total delta
  maxOldSpaceSizeMB: 512,
};

// ============================================================================
// IntervalDelta — delta tabanlı metrikler
// ============================================================================

interface IntervalDelta {
  intervalIndex: number;
  simulatedMinute: number;
  heapUsedDeltaMB: number;
  heapTotalDeltaMB: number;
  externalDeltaMB: number;
  rssDeltaMB: number;
  retainedObjectCount: number;
  retainedBufferBytes: number;
}

// ============================================================================
// Helpers
// ============================================================================

/** Linear regression slope: y = mx + b, returns m */
function linearSlope(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/** Capture heap snapshot from real process */
function captureHeapSnapshot(
  trigger: 'interval' | 'threshold' | 'correlation',
): HeapSnapshot {
  const mem = process.memoryUsage();
  const heapStats = v8.getHeapStatistics();
  return {
    timestamp: new Date().toISOString(),
    trigger,
    heapUsedMB: mem.heapUsed / (1024 * 1024),
    heapTotalMB: mem.heapTotal / (1024 * 1024),
    externalMB: mem.external / (1024 * 1024),
    arrayBuffersMB: (mem.arrayBuffers ?? 0) / (1024 * 1024),
    v8HeapSizeLimit: heapStats.heap_size_limit,
    v8TotalHeapSize: heapStats.total_heap_size,
    v8UsedHeapSize: heapStats.used_heap_size,
    v8MallocedMemory: heapStats.malloced_memory,
  };
}

/** GC pause measurement — only if --expose-gc is available */
function measureGcPause(): number | null {
  if (typeof global.gc !== 'function') {
    return null; // --expose-gc not available
  }
  const start = process.hrtime.bigint();
  global.gc();
  const elapsed = Number(process.hrtime.bigint() - start) / 1e6; // ns → ms
  return elapsed;
}


// ============================================================================
// Console Summary
// ============================================================================

function printConsoleSummary(
  snapshots: HeapSnapshot[],
  deltas: IntervalDelta[],
  trend: HeapTrend,
  slopeMBPerInterval: number,
  slopeMBPerRequest: number,
  totalHeapUsedDeltaMB: number,
  totalExternalDeltaMB: number,
  config: M4Config,
): void {
  console.log('\n=== M4 GC Pressure Summary ===');
  console.log(`Seed: ${config.seed} | Duration: ${config.durationMin}min (simulated) | RPS: ${config.rps}`);
  console.log('─'.repeat(90));
  console.log(
    't(min)'.padEnd(8) +
    'trigger'.padEnd(12) +
    'heapUsedMB'.padEnd(12) +
    'ΔheapMB'.padEnd(10) +
    'externalMB'.padEnd(12) +
    'ΔextMB'.padEnd(10) +
    'rssDeltaMB'.padEnd(12) +
    'retObj'.padEnd(8) +
    'retBuf'.padEnd(10),
  );
  console.log('─'.repeat(90));

  let deltaIdx = 0;
  for (const snap of snapshots) {
    const d = deltaIdx < deltas.length ? deltas[deltaIdx] : null;
    // Match delta to interval snapshots only
    const isIntervalSnap = snap.trigger === 'interval' && d && d.intervalIndex === deltaIdx;
    console.log(
      `${d?.simulatedMinute ?? '?'}`.padEnd(8) +
      snap.trigger.padEnd(12) +
      snap.heapUsedMB.toFixed(1).padEnd(12) +
      `${d ? (d.heapUsedDeltaMB >= 0 ? '+' : '') + d.heapUsedDeltaMB.toFixed(2) : 'N/A'}`.padEnd(10) +
      snap.externalMB.toFixed(1).padEnd(12) +
      `${d ? (d.externalDeltaMB >= 0 ? '+' : '') + d.externalDeltaMB.toFixed(2) : 'N/A'}`.padEnd(10) +
      `${d ? (d.rssDeltaMB >= 0 ? '+' : '') + d.rssDeltaMB.toFixed(2) : 'N/A'}`.padEnd(12) +
      `${d?.retainedObjectCount ?? 'N/A'}`.padEnd(8) +
      `${d?.retainedBufferBytes ?? 'N/A'}`.padEnd(10),
    );
    if (isIntervalSnap) deltaIdx++;
  }

  console.log('─'.repeat(90));
  console.log('Heap Trend:');
  console.log(`  slopeMBPerInterval:   ${slopeMBPerInterval.toFixed(4)}`);
  console.log(`  slopeMBPerRequest:    ${slopeMBPerRequest.toFixed(6)}`);
  console.log(`  allocRateMBPerMin:    ${trend.allocRateMBPerMin.toFixed(4)}`);
  console.log(`  heapGrowthMBPerMin:   ${trend.heapGrowthMBPerMin.toFixed(4)}`);
  console.log(`  gcPauseEstimateMs:    ${trend.gcPauseEstimateMs !== null ? trend.gcPauseEstimateMs.toFixed(2) : 'N/A (no --expose-gc)'}`);
  console.log(`  isLeakSuspected:      ${trend.isLeakSuspected}`);
  console.log(`  totalHeapUsedDeltaMB: ${totalHeapUsedDeltaMB.toFixed(2)}`);
  console.log(`  totalExternalDeltaMB: ${totalExternalDeltaMB.toFixed(2)}`);
  console.log('================================================\n');
}

// ============================================================================
// Test
// ============================================================================

const outputDir = path.join(__dirname, '..', 'reports', '__test_m4__');

describe('M4 — GC Pressure (Simulated)', () => {
  let harness: PerfHarness;
  const config = DEFAULT_M4_CONFIG;

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

  it('runs 5 intervals with leak simulation and emits heap trend report', async () => {
    harness.eventLoopMonitor.start();

    const env = await harness.captureEnvironmentSnapshot();
    const report: MatrixReport = harness.createEmptyReport('M4', env);
    const rng = mulberry32(config.seed);

    // ── Baseline snapshot (t=0, before any allocation) ──
    const baselineSnap = captureHeapSnapshot('interval');
    const baselineHeapUsedMB = baselineSnap.heapUsedMB;
    const baselineExternalMB = baselineSnap.externalMB;
    const baselineRssMB = process.memoryUsage().rss / (1024 * 1024);

    const allSnapshots: HeapSnapshot[] = [];
    const intervalDeltas: IntervalDelta[] = [];

    // Retention arrays — references kept to prevent GC
    let jsRetained: any[][] = [];
    let bufRetained: Buffer[] = [];
    let totalRetainedObjects = 0;
    let totalRetainedBufferBytes = 0;

    // ── Interval loop ──
    for (let interval = 0; interval < config.intervalCount; interval++) {
      const simulatedMinute = interval * config.snapshotIntervalMin;

      // a. SplitTimer reset
      harness.splitTimer.reset();
      // b. EventLoopMonitor drain
      harness.eventLoopMonitor.snapshot();

      // c. Request simulation (M0/M1 latency model + phase-7 splits)
      for (let i = 0; i < config.requestsPerInterval; i++) {
        const reqId = `m4_int${interval}_${i}`;
        harness.splitTimer.startRequest(reqId);

        const baseLatencyMs = computeBaseLatencyMs(config.rps, DEFAULT_BASE_LATENCY_CONFIG, rng);
        const costBase = config.phase7CostMs;
        const fetchMs = costBase * 0.375 * (1 + (rng() * 2 - 1) * 0.05);
        const calcMs = costBase * 0.25 * (1 + (rng() * 2 - 1) * 0.05);
        const auditMs = costBase * 0.25 * (1 + (rng() * 2 - 1) * 0.05);
        const emitMs = costBase * 0.125 * (1 + (rng() * 2 - 1) * 0.05);

        harness.splitTimer.recordSplit(reqId, 'snapshot_fetch', fetchMs);
        harness.splitTimer.recordSplit(reqId, 'drift_calc', calcMs);
        harness.splitTimer.recordSplit(reqId, 'audit_write', auditMs);
        harness.splitTimer.recordSplit(reqId, 'metrics_emit', emitMs);

        const totalLatencyMs = baseLatencyMs + costBase + fetchMs;
        harness.splitTimer.endRequest(reqId, totalLatencyMs);
      }

      // d. Allocation pressure (interval > 0)
      if (interval > 0) {
        const isBurst = interval >= 2 && interval <= 3;
        const factor = isBurst ? config.burstFactor : 1.0;
        const jsHeapMB = config.leakPerIntervalMB * factor;
        const bufferMB = config.leakPerIntervalMB * 0.5;

        // JS heap: unique objects per slot (Risk A fix)
        const objectCount = Math.round(jsHeapMB * 1024 * 128); // ~128 objects per KB
        const arr = Array.from({ length: objectCount }, (_, i) => ({ x: i, v: rng() }));
        jsRetained.push(arr);
        totalRetainedObjects += objectCount;

        // External: Buffer
        const bufSize = Math.round(bufferMB * 1024 * 1024);
        const buf = Buffer.alloc(bufSize);
        bufRetained.push(buf);
        totalRetainedBufferBytes += bufSize;
      }

      // e. Heap snapshot (interval trigger)
      const snap = captureHeapSnapshot('interval');
      allSnapshots.push(snap);

      // f. IntervalDelta
      const currentRssMB = process.memoryUsage().rss / (1024 * 1024);
      const delta: IntervalDelta = {
        intervalIndex: interval,
        simulatedMinute,
        heapUsedDeltaMB: snap.heapUsedMB - baselineHeapUsedMB,
        heapTotalDeltaMB: snap.heapTotalMB - baselineSnap.heapTotalMB,
        externalDeltaMB: snap.externalMB - baselineExternalMB,
        rssDeltaMB: currentRssMB - baselineRssMB,
        retainedObjectCount: totalRetainedObjects,
        retainedBufferBytes: totalRetainedBufferBytes,
      };
      intervalDeltas.push(delta);

      // g. Threshold trigger (delta tabanlı)
      const heapUsedDelta = delta.heapUsedDeltaMB;
      const heapGrowthPct = baselineHeapUsedMB > 0
        ? (heapUsedDelta / baselineHeapUsedMB) * 100
        : 0;
      if (
        heapUsedDelta > config.heapDeltaThresholdMB
        || heapGrowthPct > config.heapGrowthThresholdPct
      ) {
        const thresholdSnap = captureHeapSnapshot('threshold');
        allSnapshots.push(thresholdSnap);
      }
    }

    // ── HeapTrend calculation (linear regression on intervalDeltas) ──
    const xs = intervalDeltas.map(d => d.intervalIndex);
    const heapUsedDeltas = intervalDeltas.map(d => d.heapUsedDeltaMB);
    const heapTotalDeltas = intervalDeltas.map(d => d.heapTotalDeltaMB);

    const slopeMBPerInterval = linearSlope(xs, heapUsedDeltas);
    const slopeMBPerRequest = slopeMBPerInterval / config.requestsPerInterval;
    const totalHeapUsedDeltaMB = heapUsedDeltas[heapUsedDeltas.length - 1] - heapUsedDeltas[0];
    const totalExternalDeltaMB = intervalDeltas[intervalDeltas.length - 1].externalDeltaMB
      - intervalDeltas[0].externalDeltaMB;

    const gcPause = measureGcPause();

    const heapTrend: HeapTrend = {
      allocRateMBPerMin: slopeMBPerInterval / config.snapshotIntervalMin,
      heapGrowthMBPerMin: linearSlope(xs, heapTotalDeltas) / config.snapshotIntervalMin,
      gcPauseEstimateMs: gcPause,
      isLeakSuspected:
        slopeMBPerInterval >= config.leakSlopeThresholdMB
        && totalHeapUsedDeltaMB >= config.leakTotalThresholdMB,
    };

    // ── Populate report ──
    report.heapSnapshots = allSnapshots;
    report.heapTrend = heapTrend;
    report.splitTimers = harness.splitTimer.snapshot();
    report.completedAt = new Date().toISOString();

    // Diagnostic extras → warnings
    report.warnings.push(JSON.stringify({
      m4Diagnostics: {
        baselineHeapUsedMB,
        baselineExternalMB,
        baselineRssMB,
        intervalDeltas,
        slopeMBPerInterval,
        slopeMBPerRequest,
        totalHeapUsedDeltaMB,
        totalExternalDeltaMB,
        retainedObjectCount: totalRetainedObjects,
        retainedBufferBytes: totalRetainedBufferBytes,
        gcAvailable: typeof global.gc === 'function',
      },
    }));

    // ── Save report ──
    const filePath = harness.saveReport(report, 'm4-gc-pressure-simulated.json');
    expect(fs.existsSync(filePath)).toBe(true);

    // ── Verify report structure ──
    const loaded = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as MatrixReport;
    expect(loaded.matrixId).toBe('M4');

    // ── Guard 1: Snapshot count ──
    expect(loaded.heapSnapshots.length).toBeGreaterThanOrEqual(5);

    // ── Guard 2: Finite numerics on HeapSnapshot ──
    for (const snap of loaded.heapSnapshots) {
      expect(Number.isFinite(snap.heapUsedMB)).toBe(true);
      expect(Number.isFinite(snap.heapTotalMB)).toBe(true);
      expect(Number.isFinite(snap.externalMB)).toBe(true);
      expect(Number.isFinite(snap.arrayBuffersMB)).toBe(true);
      expect(Number.isFinite(snap.v8HeapSizeLimit)).toBe(true);
      expect(Number.isFinite(snap.v8TotalHeapSize)).toBe(true);
      expect(Number.isFinite(snap.v8UsedHeapSize)).toBe(true);
      expect(Number.isFinite(snap.v8MallocedMemory)).toBe(true);
    }

    // ── Guard 3: HeapTrend finite ──
    const ht = loaded.heapTrend!;
    expect(ht).not.toBeNull();
    expect(Number.isFinite(ht.allocRateMBPerMin)).toBe(true);
    expect(Number.isFinite(ht.heapGrowthMBPerMin)).toBe(true);
    // gcPauseEstimateMs: null (no --expose-gc) or finite number
    expect(ht.gcPauseEstimateMs === null || Number.isFinite(ht.gcPauseEstimateMs)).toBe(true);
    expect(typeof ht.isLeakSuspected).toBe('boolean');

    // ── Guard 4: Monotonicity (diagnostic — no hard assert) ──
    console.log(`[M4 diagnostic] slopeMBPerInterval = ${slopeMBPerInterval.toFixed(4)}`);
    console.log(`[M4 diagnostic] isLeakSuspected = ${heapTrend.isLeakSuspected}`);

    // ── Guard 5: Seed invariant ──
    expect(loaded.seed).toBe(config.seed);

    // ── Guard 6: Timestamp ordering ──
    for (let i = 1; i < loaded.heapSnapshots.length; i++) {
      expect(loaded.heapSnapshots[i].timestamp >= loaded.heapSnapshots[i - 1].timestamp).toBe(true);
    }

    // ── Guard 7: Trigger validity ──
    const validTriggers = new Set(['interval', 'threshold', 'correlation']);
    for (const snap of loaded.heapSnapshots) {
      expect(validTriggers.has(snap.trigger)).toBe(true);
    }

    // ── Guard 8: Units invariant ──
    // MB/KB karışıklığı koruması — gerçek V8 heap limit'e göre
    const v8LimitMB = loaded.heapSnapshots[0].v8HeapSizeLimit / (1024 * 1024);
    const unitsUpperBound = Math.max(config.maxOldSpaceSizeMB * 4, v8LimitMB * 2);
    for (const snap of loaded.heapSnapshots) {
      expect(snap.heapUsedMB).toBeLessThan(unitsUpperBound);
    }

    // ── Guard 9: heapUsed vs external ayrımı ──
    const diagJson = JSON.parse(loaded.warnings.find(w => w.includes('m4Diagnostics'))!);
    const diag = diagJson.m4Diagnostics;
    expect(Number.isFinite(diag.totalHeapUsedDeltaMB)).toBe(true);
    expect(Number.isFinite(diag.totalExternalDeltaMB)).toBe(true);

    // ── Guard 10: Retention kanıtı ──
    expect(diag.retainedObjectCount).toBeGreaterThan(0);

    // ── Console summary ──
    printConsoleSummary(
      allSnapshots, intervalDeltas, heapTrend,
      slopeMBPerInterval, slopeMBPerRequest,
      totalHeapUsedDeltaMB, totalExternalDeltaMB, config,
    );

    // ── Cleanup: release retention arrays ──
    jsRetained = null as any;
    bufRetained = null as any;

    harness.eventLoopMonitor.stop();
  });
});
