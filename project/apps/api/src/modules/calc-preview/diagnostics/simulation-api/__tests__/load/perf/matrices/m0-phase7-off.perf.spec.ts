/**
 * M0 — Phase-7 OFF Baseline
 *
 * Performance Characterization — Task 12.1 (Checkpoint-2)
 *
 * İki mod:
 * - DRY_RUN (default): Harness skeleton + rapor pipeline doğrulaması
 * - SIMULATED: SimulatedMeasureGenerator ile adaptive sweep, 3-run repeatability
 *
 * Checkpoint-2 hedefi:
 * - SustainableRPS bulunmuş ve rapora yazılmış
 * - envHash sabit (aynı makinede ardışık run'larda)
 * - 3-run p99 varyasyonu <%10 (measure only)
 * - Rapor JSON tek şemada çıkar
 *
 * @see .kiro/specs/perf-characterization/design.md — M0, C2-1..C2-6
 */

import * as fs from 'fs';
import * as path from 'path';
import { PerfHarness, RepeatabilityResult } from '../perf-harness';
import {
  SweepConfig,
  DEFAULT_SWEEP_CONFIG,
} from '../helpers/adaptive-sweep';
import {
  SimulatedMeasureGenerator,
  DEFAULT_SIMULATED_CONFIG,
} from '../helpers/simulated-measure';
import { MatrixReport } from '../perf-report.types';

jest.setTimeout(120_000);

const outputDir = path.join(__dirname, '..', 'reports', '__test__');

// ============================================================================
// Checkpoint-2 sweep config — kısa step süresi (C2-6)
// ============================================================================
const C2_SWEEP_CONFIG: SweepConfig = {
  ...DEFAULT_SWEEP_CONFIG,
  stepDurationSec: Number(process.env.PERF_STEP_DURATION_SEC) || 10,
};

// ============================================================================
// DRY_RUN testleri — Checkpoint-1'den taşınan
// ============================================================================

describe('M0 — Phase-7 OFF Baseline (Dry-Run)', () => {
  let harness: PerfHarness;

  beforeAll(() => {
    harness = new PerfHarness(undefined, { seed: 42, outputDir });
  });

  afterAll(() => {
    if (fs.existsSync(outputDir)) {
      const files = fs.readdirSync(outputDir);
      for (const f of files) fs.unlinkSync(path.join(outputDir, f));
      try { fs.rmdirSync(outputDir); } catch { /* ignore */ }
    }
  });

  it('environment snapshot doğru alanları içerir', async () => {
    const env = await harness.captureEnvironmentSnapshot();
    expect(env.nodeVersion).toMatch(/^v\d+/);
    expect(env.cpuCores).toBeGreaterThan(0);
    expect(env.totalMemoryMB).toBeGreaterThan(0);
    expect(env.perfSeed).toBe(42);
  });

  it('envHash sabit — gitSha/capturedAt/seed değişse bile (C2-2)', async () => {
    const env1 = await harness.captureEnvironmentSnapshot();
    // capturedAt farklı olacak
    await new Promise((r) => setTimeout(r, 10));
    const env2 = await harness.captureEnvironmentSnapshot();

    const hash1 = PerfHarness.computeEnvHash(env1);
    const hash2 = PerfHarness.computeEnvHash(env2);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(12);
  });

  it('rapor metadata alanları mevcut ve doğru formatta', async () => {
    const env = await harness.captureEnvironmentSnapshot();
    const report = harness.createEmptyReport('M0', env);
    expect(report.metadata.schemaVersion).toBe('1.0.0');
    expect(report.metadata.runId).toMatch(/^perf_42_/);
    expect(report.metadata.environmentSnapshotHash).toHaveLength(12);
    expect(report.matrixId).toBe('M0');
  });

  it('SplitTimer percentile sıralaması korunur', () => {
    const timer = harness.splitTimer;
    timer.reset();
    for (let i = 0; i < 10; i++) {
      const reqId = `dry_${i}`;
      timer.startRequest(reqId);
      timer.recordSplit(reqId, 'snapshot_fetch', 2 + i);
      timer.recordSplit(reqId, 'drift_calc', 1 + i * 0.5);
      timer.recordSplit(reqId, 'audit_write', 3);
      timer.recordSplit(reqId, 'metrics_emit', 0.5);
      timer.endRequest(reqId, 10 + i);
    }
    const snap = timer.snapshot();
    for (const key of Object.keys(snap) as (keyof typeof snap)[]) {
      const s = snap[key];
      expect(s.p50).toBeLessThanOrEqual(s.p95);
      expect(s.p95).toBeLessThanOrEqual(s.p99);
      expect(s.p99).toBeLessThanOrEqual(s.max);
    }
  });

  it('rapor JSON kaydedilip okunabiliyor', async () => {
    const env = await harness.captureEnvironmentSnapshot();
    const report = harness.createEmptyReport('M0', env);
    report.completedAt = new Date().toISOString();
    const filePath = harness.saveReport(report, 'm0-dry-run.json');
    expect(fs.existsSync(filePath)).toBe(true);
    const loaded = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as MatrixReport;
    expect(loaded.matrixId).toBe('M0');
    expect(loaded.metadata.schemaVersion).toBe('1.0.0');
  });
});

// ============================================================================
// SIMULATED RUN — Adaptive sweep + 3-run repeatability
// ============================================================================

describe('M0 — Phase-7 OFF Baseline (Simulated Run)', () => {
  let harness: PerfHarness;

  beforeAll(() => {
    harness = new PerfHarness(undefined, { seed: 42, outputDir });
  });

  afterAll(() => {
    harness.eventLoopMonitor.stop();
    if (fs.existsSync(outputDir)) {
      const files = fs.readdirSync(outputDir);
      for (const f of files) fs.unlinkSync(path.join(outputDir, f));
      try { fs.rmdirSync(outputDir); } catch { /* ignore */ }
    }
  });

  it('adaptive sweep ile sustainableRPS bulunur ve breakpoint bracket oluşur', async () => {
    harness.eventLoopMonitor.start();

    const simGen = new SimulatedMeasureGenerator(
      harness.splitTimer,
      harness.eventLoopMonitor,
      { ...DEFAULT_SIMULATED_CONFIG, seed: 42 },
    );

    const measureFn = simGen.createMeasureFn();
    const result = await harness.adaptiveSweep.run(C2_SWEEP_CONFIG, measureFn);

    // En az 3 step olmalı
    expect(result.steps.length).toBeGreaterThanOrEqual(3);

    // SustainableRPS > 0 olmalı
    expect(result.sustainableRPS).toBeGreaterThan(0);

    // Capacity envelope üretilmiş olmalı
    expect(result.capacityEnvelope.length).toBe(result.steps.length);

    // Breakpoint varsa bracket kontrolü
    if (result.breakpointRPS !== null) {
      expect(result.breakpointRPS).toBeGreaterThan(result.sustainableRPS);
      const bpIndex = result.steps.findIndex((s) => s.isBreakpoint);
      expect(bpIndex).toBeGreaterThanOrEqual(0);
      // Breakpoint sonrası en az 3 bracketing noktası
      const bracketCount = result.steps.length - bpIndex - 1;
      expect(bracketCount).toBeGreaterThanOrEqual(C2_SWEEP_CONFIG.narrowPoints);
    }

    // Rapor üret
    const env = await harness.captureEnvironmentSnapshot();
    const report = harness.createEmptyReport('M0', env);
    report.sweep = result;
    report.splitTimers = harness.splitTimer.snapshot();
    report.completedAt = new Date().toISOString();

    const filePath = harness.saveReport(report, 'm0-simulated.json');
    expect(fs.existsSync(filePath)).toBe(true);

    // Console summary
    console.log('\n=== M0 Simulated Run Summary ===');
    console.log(`Steps: ${result.steps.length}`);
    console.log(`SustainableRPS: ${result.sustainableRPS}`);
    console.log(`BreakpointRPS: ${result.breakpointRPS ?? 'N/A'}`);
    console.log(`Capacity envelope: ${result.capacityEnvelope.map((c) => `${c.rps}→p99:${c.p99Ms.toFixed(1)}`).join(' | ')}`);
    if (result.breakpointRPS !== null) {
      const bpStep = result.steps.find((s) => s.isBreakpoint);
      console.log(`Breakpoint reason: ${bpStep?.breakpointReason ?? 'unknown'}`);
    }
    console.log('================================\n');

    harness.eventLoopMonitor.stop();
  });

  it('3-run repeatability — p99 varyasyonu <%10 (measure only)', async () => {
    const runOnce = async (): Promise<MatrixReport> => {
      // Not: eventLoopMonitor.start() runWithRepeatability tarafından çağrılır
      // Burada tekrar çağırmıyoruz — double-start resource leak yapar

      const simGen = new SimulatedMeasureGenerator(
        harness.splitTimer,
        harness.eventLoopMonitor,
        { ...DEFAULT_SIMULATED_CONFIG, seed: 42 },
      );

      const measureFn = simGen.createMeasureFn();
      const sweepResult = await harness.adaptiveSweep.run(C2_SWEEP_CONFIG, measureFn);

      const env = await harness.captureEnvironmentSnapshot();
      const report = harness.createEmptyReport('M0', env);
      report.sweep = sweepResult;
      report.splitTimers = harness.splitTimer.snapshot();
      report.completedAt = new Date().toISOString();

      return report;
    };

    // İlk start — runWithRepeatability her run arasında stop/start yapar
    harness.eventLoopMonitor.start();

    const result: RepeatabilityResult = await harness.runWithRepeatability(runOnce, {
      minRuns: 3,
      maxRuns: 5,
    });

    // Debug: her run'ın ortak RPS noktalarındaki p99 değerleri
    console.log('\n=== M0 Repeatability Summary ===');
    console.log(`Runs: ${result.runs.length}`);
    console.log(`p99 variance: ${(result.p99Variance * 100).toFixed(2)}%`);
    console.log(`EL p99 variance: ${(result.eventLoopP99Variance * 100).toFixed(2)}% (informational)`);
    console.log(`Stable: ${result.isStable}`);
    const allRpsPerRun = result.runs.map(
      (r) => (r.sweep?.steps ?? []).map((s) => `${s.rps}→p99:${s.latency.p99.toFixed(1)}/el:${s.eventLoop.p99Ms.toFixed(3)}`).join(' | '),
    );
    for (let i = 0; i < allRpsPerRun.length; i++) {
      console.log(`Run ${i}: ${allRpsPerRun[i]}`);
    }
    if (result.warnings.length > 0) {
      console.log(`Warnings: ${result.warnings.join('; ')}`);
    }
    console.log('================================\n');

    // En az 3 run tamamlanmış olmalı
    expect(result.runs.length).toBeGreaterThanOrEqual(3);

    // p99 varyasyonu <%10
    expect(result.p99Variance).toBeLessThan(0.10);

    // Stable olmalı
    expect(result.isStable).toBe(true);

    // Tüm run'ların envHash'i aynı olmalı
    const hashes = result.runs.map((r) => r.metadata.environmentSnapshotHash);
    expect(new Set(hashes).size).toBe(1);

    // Tüm run'larda sustainableRPS > 0
    for (const run of result.runs) {
      expect(run.sweep?.sustainableRPS).toBeGreaterThan(0);
    }

    // Console summary
    console.log(`SustainableRPS per run: ${result.runs.map((r) => r.sweep?.sustainableRPS).join(', ')}`);
    console.log(`envHash: ${hashes[0]}`);

    harness.eventLoopMonitor.stop();
  });
});
