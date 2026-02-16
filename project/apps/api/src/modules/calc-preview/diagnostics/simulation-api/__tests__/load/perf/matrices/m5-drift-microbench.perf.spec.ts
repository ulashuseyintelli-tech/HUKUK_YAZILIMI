/**
 * M5 — Drift Calc Micro-Benchmark (Simulated Mode)
 *
 * Performance Characterization — Task 18.3
 *
 * Float (epsilon-based) vs scaled-int (bps × 10.000) drift hesaplama
 * performans karşılaştırması. 3 varyant:
 *   1. floatCompute — mevcut epsilon yolu
 *   2. scaledIntCompute — önceden quantize edilmiş int input
 *   3. e2eScaledIntCompute — float→int quantize + int compute (end-to-end)
 *
 * Allocation-free kuralı: benchmark loop içinde yeni object/array yaratılmaz.
 * Empty loop baseline ile overhead subtraction uygulanır.
 * 3-run averaging + CV warning (>%20 → warning, hard-fail değil).
 * Migration kararı e2eSpeedupFactor üzerinden verilir.
 *
 * @see .kiro/specs/perf-characterization/design.md — Task 18 M5 section
 * @see Requirements 12.1, 12.2, 12.3, 12.4
 */

import * as fs from 'fs';
import * as path from 'path';
import { PerfHarness } from '../perf-harness';
import { mulberry32 } from '../helpers/dataset-generator';
import { MatrixReport, MicroBenchmarkResult } from '../perf-report.types';
import { M5DiagnosticsData, M5RunDetail } from '../composite-report.types';

jest.setTimeout(120_000);

// ============================================================================
// M5 Config
// ============================================================================

const M5_CONFIG = {
  matrixId: 'M5' as const,
  phase7Enabled: true,
  iterations: 1_000_000,
  warmupIterations: 10_000,
  benchmarkRuns: 3,
  seed: 42,
  metricCount: 10,
  driftThreshold: 0.15,
  epsilon: 1e-10,
  scaleFactor: 10_000,
  triggerThreshold: 0.01,
  forceInSimulated: true,
};

// ============================================================================
// Pure Benchmark Functions (allocation-free)
// ============================================================================

/**
 * Varyant 1: Epsilon-based float drift hesaplama.
 * Allocation-free: loop içinde yeni object/array yaratmaz.
 */
function floatCompute(
  baseline: Float64Array,
  current: Float64Array,
  epsilon: number,
): number {
  let totalDrift = 0;
  for (let i = 0; i < baseline.length; i++) {
    const diff = Math.abs(current[i] - baseline[i]);
    if (diff > epsilon) {
      totalDrift += diff;
    }
  }
  return totalDrift / baseline.length;
}

/**
 * Varyant 2: Integer arithmetic drift hesaplama (önceden quantize edilmiş input).
 * Allocation-free: loop içinde yeni object/array yaratmaz.
 */
function scaledIntCompute(
  baseline: Int32Array,
  current: Int32Array,
  scaleFactor: number,
): number {
  let totalDrift = 0;
  for (let i = 0; i < baseline.length; i++) {
    const diff = Math.abs(current[i] - baseline[i]);
    totalDrift += diff;
  }
  return totalDrift / baseline.length / scaleFactor;
}

/**
 * Varyant 3: Float → Int quantize + integer drift hesaplama (end-to-end).
 * Quantize adımı Math.round() kullanır — yeni array allocate etmez.
 */
function e2eScaledIntCompute(
  baseline: Float64Array,
  current: Float64Array,
  scaleFactor: number,
): number {
  let totalDrift = 0;
  for (let i = 0; i < baseline.length; i++) {
    const bScaled = Math.round(baseline[i] * scaleFactor);
    const cScaled = Math.round(current[i] * scaleFactor);
    const diff = Math.abs(cScaled - bScaled);
    totalDrift += diff;
  }
  return totalDrift / baseline.length / scaleFactor;
}

// ============================================================================
// Benchmark Helper — empty loop baseline + overhead subtraction
// ============================================================================

interface BenchmarkTimings {
  grossNs: bigint;
  netNs: bigint;
  emptyNs: bigint;
}

function benchmarkVariant(
  fn: () => void,
  iterations: number,
  warmupIterations: number,
): BenchmarkTimings {
  // 1. Warmup (JIT optimization — sonuçlar atılır)
  for (let i = 0; i < warmupIterations; i++) fn();

  // 2. Empty loop baseline
  const emptyStart = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) { /* noop */ }
  const emptyNs = process.hrtime.bigint() - emptyStart;

  // 3. Actual measurement
  const fnStart = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn();
  const grossNs = process.hrtime.bigint() - fnStart;

  // 4. Net = gross - empty (ölçüm overhead'i çıkarılmış)
  const netNs = grossNs > emptyNs ? grossNs - emptyNs : 0n;

  return { grossNs, netNs, emptyNs };
}

// ============================================================================
// Stats Helpers
// ============================================================================

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: number[]): number {
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function medianIndex(length: number): number {
  return Math.floor(length / 2);
}

// ============================================================================
// Console Summary
// ============================================================================

function printConsoleSummary(
  result: MicroBenchmarkResult,
  diagnostics: M5DiagnosticsData,
): void {
  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const fmtDec = (n: number) => n.toFixed(2);

  const floatOps = result.floatOpsPerSec;
  const intOps = result.scaledIntOpsPerSec;
  const e2eOps = result.e2eScaledIntOpsPerSec;

  // Median run'ın netNs'ini al
  const floatNetNs = diagnostics.runs.float[medianIndex(diagnostics.runs.float.length)]?.netNs ?? 0;
  const intNetNs = diagnostics.runs.scaledInt[medianIndex(diagnostics.runs.scaledInt.length)]?.netNs ?? 0;
  const e2eNetNs = diagnostics.runs.e2eScaledInt[medianIndex(diagnostics.runs.e2eScaledInt.length)]?.netNs ?? 0;

  // CV hesapla
  const floatCV = diagnostics.runs.float.length > 1
    ? (stddev(diagnostics.runs.float.map(r => r.opsPerSec)) / mean(diagnostics.runs.float.map(r => r.opsPerSec)) * 100)
    : 0;
  const intCV = diagnostics.runs.scaledInt.length > 1
    ? (stddev(diagnostics.runs.scaledInt.map(r => r.opsPerSec)) / mean(diagnostics.runs.scaledInt.map(r => r.opsPerSec)) * 100)
    : 0;
  const e2eCV = diagnostics.runs.e2eScaledInt.length > 1
    ? (stddev(diagnostics.runs.e2eScaledInt.map(r => r.opsPerSec)) / mean(diagnostics.runs.e2eScaledInt.map(r => r.opsPerSec)) * 100)
    : 0;

  console.log(`
=== M5 Drift Calc Micro-Benchmark Summary ===
Seed: ${M5_CONFIG.seed} | Iterations: ${fmt(M5_CONFIG.iterations)} | Metrics: ${M5_CONFIG.metricCount}
Trigger: ${result.triggerReason} (ratio=${fmtDec(result.triggerRatio)}, threshold=${M5_CONFIG.triggerThreshold}, wouldTrigger=${result.wouldTriggerByThreshold})
──────────────────────────────────────────────────────────────────
 Variant              ops/sec         netNs/op    emptyNs       CV%
──────────────────────────────────────────────────────────────────
 float                ${fmt(floatOps).padStart(15)}    ${fmtDec(floatNetNs / M5_CONFIG.iterations).padStart(8)}    ${fmt(diagnostics.emptyLoopNs).padStart(10)}    ${fmtDec(floatCV).padStart(5)}%
 scaledInt (pre-q)    ${fmt(intOps).padStart(15)}    ${fmtDec(intNetNs / M5_CONFIG.iterations).padStart(8)}    ${fmt(diagnostics.emptyLoopNs).padStart(10)}    ${fmtDec(intCV).padStart(5)}%
 e2eScaledInt         ${fmt(e2eOps).padStart(15)}    ${fmtDec(e2eNetNs / M5_CONFIG.iterations).padStart(8)}    ${fmt(diagnostics.emptyLoopNs).padStart(10)}    ${fmtDec(e2eCV).padStart(5)}%
──────────────────────────────────────────────────────────────────
Speedup (compute-only): ${fmtDec(result.speedupFactor)}x
Speedup (end-to-end):   ${fmtDec(result.e2eSpeedupFactor)}x
Migration priority:     ${result.migrationPriority}
GC available:           ${diagnostics.gcAvailable}
==============================================================
`);
}

// ============================================================================
// Test Suite
// ============================================================================

describe('M5 — Drift Calc Micro-Benchmark (Simulated Mode)', () => {
  let harness: PerfHarness;
  let report: MatrixReport;
  let microBenchmark: MicroBenchmarkResult;
  let m5Diagnostics: M5DiagnosticsData;

  beforeAll(async () => {
    harness = new PerfHarness(undefined, { seed: M5_CONFIG.seed });
    // ── 1. Tetikleme kararı ──
    // Simulated modda drift_calc_ms / request_duration_ms ≈ 0.003 → %1 altında
    // Force trigger: simulated modda her zaman çalıştır
    const simulatedDriftCalcMean = 0.2;   // ms (simulated split timer'dan)
    const simulatedRequestMean = 65.0;    // ms
    const triggerRatio = simulatedDriftCalcMean / simulatedRequestMean;
    const wouldTriggerByThreshold = triggerRatio >= M5_CONFIG.triggerThreshold;
    const triggerReason: 'threshold' | 'forced-simulated' =
      M5_CONFIG.forceInSimulated ? 'forced-simulated' : 'threshold';

    // ── 2. Input setup (allocation zone — benchmark dışında) ──
    const rng = mulberry32(M5_CONFIG.seed);
    const baselineFloat = new Float64Array(M5_CONFIG.metricCount);
    const currentFloat = new Float64Array(M5_CONFIG.metricCount);
    for (let i = 0; i < M5_CONFIG.metricCount; i++) {
      baselineFloat[i] = rng() * 100;  // 0–100 arası float
      currentFloat[i] = rng() * 100;
    }
    // Pre-quantized int arrays
    const baselineInt = Int32Array.from(baselineFloat, (v) =>
      Math.round(v * M5_CONFIG.scaleFactor),
    );
    const currentInt = Int32Array.from(currentFloat, (v) =>
      Math.round(v * M5_CONFIG.scaleFactor),
    );

    // ── 3. Pre-benchmark GC ──
    const gcAvailable = typeof global.gc === 'function';
    if (gcAvailable) {
      global.gc!();
    }

    // ── 4. Benchmark (3 run × 3 varyant) ──
    const floatRuns: M5RunDetail[] = [];
    const intRuns: M5RunDetail[] = [];
    const e2eRuns: M5RunDetail[] = [];

    for (let run = 0; run < M5_CONFIG.benchmarkRuns; run++) {
      const fResult = benchmarkVariant(
        () => floatCompute(baselineFloat, currentFloat, M5_CONFIG.epsilon),
        M5_CONFIG.iterations,
        M5_CONFIG.warmupIterations,
      );
      floatRuns.push({
        grossNs: Number(fResult.grossNs),
        netNs: Number(fResult.netNs),
        opsPerSec: fResult.netNs > 0n
          ? M5_CONFIG.iterations / (Number(fResult.netNs) / 1e9)
          : 0,
      });

      const iResult = benchmarkVariant(
        () => scaledIntCompute(baselineInt, currentInt, M5_CONFIG.scaleFactor),
        M5_CONFIG.iterations,
        M5_CONFIG.warmupIterations,
      );
      intRuns.push({
        grossNs: Number(iResult.grossNs),
        netNs: Number(iResult.netNs),
        opsPerSec: iResult.netNs > 0n
          ? M5_CONFIG.iterations / (Number(iResult.netNs) / 1e9)
          : 0,
      });

      const eResult = benchmarkVariant(
        () => e2eScaledIntCompute(baselineFloat, currentFloat, M5_CONFIG.scaleFactor),
        M5_CONFIG.iterations,
        M5_CONFIG.warmupIterations,
      );
      e2eRuns.push({
        grossNs: Number(eResult.grossNs),
        netNs: Number(eResult.netNs),
        opsPerSec: eResult.netNs > 0n
          ? M5_CONFIG.iterations / (Number(eResult.netNs) / 1e9)
          : 0,
      });
    }

    // ── 5. Hesaplama: medyan run'ın ops/sec'ini kullan ──
    const sortByOps = (a: M5RunDetail, b: M5RunDetail) => a.opsPerSec - b.opsPerSec;
    const floatSorted = [...floatRuns].sort(sortByOps);
    const intSorted = [...intRuns].sort(sortByOps);
    const e2eSorted = [...e2eRuns].sort(sortByOps);

    const mid = medianIndex(M5_CONFIG.benchmarkRuns);
    const floatOpsPerSec = floatSorted[mid].opsPerSec;
    const scaledIntOpsPerSec = intSorted[mid].opsPerSec;
    const e2eScaledIntOpsPerSec = e2eSorted[mid].opsPerSec;

    const speedupFactor = floatOpsPerSec > 0
      ? scaledIntOpsPerSec / floatOpsPerSec
      : 0;
    const e2eSpeedupFactor = floatOpsPerSec > 0
      ? e2eScaledIntOpsPerSec / floatOpsPerSec
      : 0;

    // Migration kararı e2eSpeedupFactor üzerinden
    const migrationPriority: 'high' | 'medium' | 'low' =
      e2eSpeedupFactor >= 2.0 ? 'high' :
      e2eSpeedupFactor >= 1.3 ? 'medium' : 'low';

    // ── 6. Varyasyon kontrolü (warning seviyesi) ──
    const noiseWarnings: string[] = [];
    const checkCV = (name: string, runs: M5RunDetail[]) => {
      const ops = runs.map((r) => r.opsPerSec);
      if (ops.length < 2) return;
      const m = mean(ops);
      if (m === 0) return;
      const cv = stddev(ops) / m;
      if (cv > 0.20) {
        noiseWarnings.push(`[m5-noise] variant=${name} cv=${(cv * 100).toFixed(1)}%`);
      }
    };
    checkCV('float', floatRuns);
    checkCV('scaledInt', intRuns);
    checkCV('e2eScaledInt', e2eRuns);

    // Empty loop ns (diagnostic — ilk float run'dan)
    const emptyLoopNs = floatRuns[0]
      ? floatRuns[0].grossNs - floatRuns[0].netNs
      : 0;

    // ── 7. Rapor oluştur ──
    microBenchmark = {
      triggered: true,
      triggerRatio,
      triggerReason,
      wouldTriggerByThreshold,
      floatOpsPerSec,
      scaledIntOpsPerSec,
      e2eScaledIntOpsPerSec,
      speedupFactor,
      e2eSpeedupFactor,
      migrationPriority,
      iterations: M5_CONFIG.iterations,
    };

    m5Diagnostics = {
      runs: {
        float: floatRuns,
        scaledInt: intRuns,
        e2eScaledInt: e2eRuns,
      },
      emptyLoopNs,
      inputConfig: {
        metricCount: M5_CONFIG.metricCount,
        seed: M5_CONFIG.seed,
      },
      gcAvailable,
      noiseWarnings,
    };

    report = harness.createEmptyReport(M5_CONFIG.matrixId, await harness.captureEnvironmentSnapshot());
    report.microBenchmark = microBenchmark;
    report.warnings.push(...noiseWarnings);

    // M5 diagnostics → warnings JSON (Task 20.5 pattern ile tutarlı)
    report.warnings.push(JSON.stringify({ m5Diagnostics: m5Diagnostics }));

    // Console summary
    printConsoleSummary(microBenchmark, m5Diagnostics);

    // Rapor kaydet
    harness.saveReport(report, `m5-drift-microbench-seed${M5_CONFIG.seed}.json`);
  });

  // ── Guard Assertions ──

  it('Guard 1: seed invariant', () => {
    expect(report.seed).toBe(M5_CONFIG.seed);
  });

  it('Guard 2: finite numerics — ops/sec > 0 ve Number.isFinite', () => {
    expect(microBenchmark.floatOpsPerSec).toBeGreaterThan(0);
    expect(microBenchmark.scaledIntOpsPerSec).toBeGreaterThan(0);
    expect(microBenchmark.e2eScaledIntOpsPerSec).toBeGreaterThan(0);
    expect(Number.isFinite(microBenchmark.floatOpsPerSec)).toBe(true);
    expect(Number.isFinite(microBenchmark.scaledIntOpsPerSec)).toBe(true);
    expect(Number.isFinite(microBenchmark.e2eScaledIntOpsPerSec)).toBe(true);
    expect(Number.isFinite(microBenchmark.speedupFactor)).toBe(true);
    expect(Number.isFinite(microBenchmark.e2eSpeedupFactor)).toBe(true);
  });

  it('Guard 3: speedupFactor tutarlılık (±%1 tolerans)', () => {
    const expectedSpeedup = microBenchmark.scaledIntOpsPerSec / microBenchmark.floatOpsPerSec;
    expect(Math.abs(microBenchmark.speedupFactor - expectedSpeedup)).toBeLessThan(
      expectedSpeedup * 0.01,
    );

    const expectedE2e = microBenchmark.e2eScaledIntOpsPerSec / microBenchmark.floatOpsPerSec;
    expect(Math.abs(microBenchmark.e2eSpeedupFactor - expectedE2e)).toBeLessThan(
      expectedE2e * 0.01,
    );
  });

  it('Guard 4: iterations doğru', () => {
    expect(microBenchmark.iterations).toBe(M5_CONFIG.iterations);
  });

  it('Guard 5: migrationPriority e2eSpeedupFactor ile uyumlu', () => {
    if (microBenchmark.e2eSpeedupFactor >= 2.0) {
      expect(microBenchmark.migrationPriority).toBe('high');
    } else if (microBenchmark.e2eSpeedupFactor >= 1.3) {
      expect(microBenchmark.migrationPriority).toBe('medium');
    } else {
      expect(microBenchmark.migrationPriority).toBe('low');
    }
  });

  it('Guard 6: empty loop sanity — emptyLoopNs < grossNs (netNs pozitif)', () => {
    // Her varyantın en az bir run'ında netNs > 0 olmalı
    const floatPositive = m5Diagnostics.runs.float.some((r) => r.netNs > 0);
    const intPositive = m5Diagnostics.runs.scaledInt.some((r) => r.netNs > 0);
    const e2ePositive = m5Diagnostics.runs.e2eScaledInt.some((r) => r.netNs > 0);
    expect(floatPositive).toBe(true);
    expect(intPositive).toBe(true);
    expect(e2ePositive).toBe(true);
  });

  it('Guard 7: trigger tutarlılık — forced-simulated + wouldTriggerByThreshold', () => {
    expect(microBenchmark.triggerReason).toBe('forced-simulated');
    expect(microBenchmark.triggered).toBe(true);
    // Simulated modda oran < %1 → wouldTriggerByThreshold = false
    expect(microBenchmark.triggerRatio).toBeLessThan(M5_CONFIG.triggerThreshold);
    expect(microBenchmark.wouldTriggerByThreshold).toBe(false);
  });

  it('Guard 8: varyasyon kontrolü — CV > %20 ise warning var (hard-fail değil)', () => {
    // Bu test sadece warning mekanizmasının çalıştığını doğrular
    // CV > %20 olsa bile test PASS — sadece warning üretilir
    for (const w of m5Diagnostics.noiseWarnings) {
      expect(w).toMatch(/\[m5-noise\] variant=\w+ cv=[\d.]+%/);
    }
  });

  it('Guard 9: diagnostics run count doğru', () => {
    expect(m5Diagnostics.runs.float).toHaveLength(M5_CONFIG.benchmarkRuns);
    expect(m5Diagnostics.runs.scaledInt).toHaveLength(M5_CONFIG.benchmarkRuns);
    expect(m5Diagnostics.runs.e2eScaledInt).toHaveLength(M5_CONFIG.benchmarkRuns);
  });

  it('Guard 10: rapor JSON kaydedildi ve yüklenebilir', () => {
    const reportDir = path.join(__dirname, '..', 'reports');
    const reportPath = path.join(reportDir, `m5-drift-microbench-seed${M5_CONFIG.seed}.json`);
    expect(fs.existsSync(reportPath)).toBe(true);

    const loaded = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as MatrixReport;
    expect(loaded.matrixId).toBe('M5');
    expect(loaded.microBenchmark).not.toBeNull();
    expect(loaded.microBenchmark!.triggered).toBe(true);
    expect(loaded.microBenchmark!.floatOpsPerSec).toBeGreaterThan(0);
  });
});
