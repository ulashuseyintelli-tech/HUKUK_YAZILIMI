/**
 * M1 — Phase-7 ON Baseline
 *
 * Performance Characterization — Task 13.1
 *
 * M0 ile birebir aynı parametreler (seed, stepDurationSec, sweep config).
 * Phase-7 ON: split timer'lar non-zero, ek latency maliyet enjekte edilir.
 * OverheadDelta: M0 vs M1 eşlenmiş RPS noktalarında hesaplanır.
 *
 * Simulated modda Phase-7 maliyeti:
 * - snapshot_fetch: ~0.3ms
 * - drift_calc: ~0.2ms
 * - audit_write: ~0.2ms
 * - metrics_emit: ~0.1ms
 * - Toplam: ~0.8ms/request ek maliyet
 *
 * @see .kiro/specs/perf-characterization/design.md — M1, C2-1
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
import { MatrixReport, OverheadDelta } from '../perf-report.types';

jest.setTimeout(120_000);

const outputDir = path.join(__dirname, '..', 'reports', '__test__');

// ============================================================================
// M0 ile birebir aynı sweep config (C2-6 step süresi dahil)
// ============================================================================
const C2_SWEEP_CONFIG: SweepConfig = {
  ...DEFAULT_SWEEP_CONFIG,
  stepDurationSec: Number(process.env.PERF_STEP_DURATION_SEC) || 10,
};

// Phase-7 ON simulated config — M0 ile aynı seed/breakpoint, phase7Enabled=true
const M1_SIMULATED_CONFIG = {
  ...DEFAULT_SIMULATED_CONFIG,
  seed: 42,
  phase7Enabled: true,
  phase7CostMs: 0.8, // ~0.8ms/request ek maliyet
};

// ============================================================================
// Helper: M0 raporu üret (delta hesaplama için)
// ============================================================================
async function generateM0Report(harness: PerfHarness): Promise<MatrixReport> {
  const simGen = new SimulatedMeasureGenerator(
    harness.splitTimer,
    harness.eventLoopMonitor,
    { ...DEFAULT_SIMULATED_CONFIG, seed: 42, phase7Enabled: false },
  );
  const measureFn = simGen.createMeasureFn();
  const sweepResult = await harness.adaptiveSweep.run(C2_SWEEP_CONFIG, measureFn);

  const env = await harness.captureEnvironmentSnapshot();
  const report = harness.createEmptyReport('M0', env);
  report.sweep = sweepResult;
  report.splitTimers = harness.splitTimer.snapshot();
  report.completedAt = new Date().toISOString();
  return report;
}

// ============================================================================
// M1 Simulated Run
// ============================================================================

describe('M1 — Phase-7 ON Baseline (Simulated Run)', () => {
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

  it('adaptive sweep ile sustainableRPS bulunur ve split timers non-zero', async () => {
    harness.eventLoopMonitor.start();

    const simGen = new SimulatedMeasureGenerator(
      harness.splitTimer,
      harness.eventLoopMonitor,
      M1_SIMULATED_CONFIG,
    );

    const measureFn = simGen.createMeasureFn();
    const result = await harness.adaptiveSweep.run(C2_SWEEP_CONFIG, measureFn);

    // En az 3 step olmalı
    expect(result.steps.length).toBeGreaterThanOrEqual(3);

    // SustainableRPS > 0 olmalı
    expect(result.sustainableRPS).toBeGreaterThan(0);

    // Phase-7 ON: split timers non-zero olmalı (wiring doğrulaması)
    const lastSustainableStep = result.steps
      .filter((s) => !s.isBreakpoint)
      .pop();
    expect(lastSustainableStep).toBeDefined();
    if (lastSustainableStep) {
      expect(lastSustainableStep.splitTimers.phase7_snapshot_fetch_ms.p95).toBeGreaterThan(0);
      expect(lastSustainableStep.splitTimers.phase7_drift_calc_ms.p95).toBeGreaterThan(0);
      expect(lastSustainableStep.splitTimers.phase7_audit_write_ms.p95).toBeGreaterThan(0);
      expect(lastSustainableStep.splitTimers.phase7_metrics_emit_ms.p95).toBeGreaterThan(0);
    }

    // Rapor üret
    const env = await harness.captureEnvironmentSnapshot();
    const report = harness.createEmptyReport('M1', env);
    report.sweep = result;
    report.splitTimers = harness.splitTimer.snapshot();
    report.completedAt = new Date().toISOString();

    const filePath = harness.saveReport(report, 'm1-simulated.json');
    expect(fs.existsSync(filePath)).toBe(true);

    // Console summary
    console.log('\n=== M1 Simulated Run Summary ===');
    console.log(`Steps: ${result.steps.length}`);
    console.log(`SustainableRPS: ${result.sustainableRPS}`);
    console.log(`BreakpointRPS: ${result.breakpointRPS ?? 'N/A'}`);
    console.log(`Capacity envelope: ${result.capacityEnvelope.map((c) => `${c.rps}→p99:${c.p99Ms.toFixed(1)}`).join(' | ')}`);
    if (result.breakpointRPS !== null) {
      const bpStep = result.steps.find((s) => s.isBreakpoint);
      console.log(`Breakpoint reason: ${bpStep?.breakpointReason ?? 'unknown'}`);
    }
    // Phase-7 split breakdown
    const snap = harness.splitTimer.snapshot();
    console.log(`Phase-7 splits (p95): fetch=${snap.phase7_snapshot_fetch_ms.p95.toFixed(3)}ms, calc=${snap.phase7_drift_calc_ms.p95.toFixed(3)}ms, audit=${snap.phase7_audit_write_ms.p95.toFixed(3)}ms, emit=${snap.phase7_metrics_emit_ms.p95.toFixed(3)}ms`);
    console.log('================================\n');

    harness.eventLoopMonitor.stop();
  });

  it('3-run repeatability — p99 varyasyonu <%10 (measure only)', async () => {
    const runOnce = async (): Promise<MatrixReport> => {
      const simGen = new SimulatedMeasureGenerator(
        harness.splitTimer,
        harness.eventLoopMonitor,
        M1_SIMULATED_CONFIG,
      );

      const measureFn = simGen.createMeasureFn();
      const sweepResult = await harness.adaptiveSweep.run(C2_SWEEP_CONFIG, measureFn);

      const env = await harness.captureEnvironmentSnapshot();
      const report = harness.createEmptyReport('M1', env);
      report.sweep = sweepResult;
      report.splitTimers = harness.splitTimer.snapshot();
      report.completedAt = new Date().toISOString();
      return report;
    };

    harness.eventLoopMonitor.start();

    const result: RepeatabilityResult = await harness.runWithRepeatability(runOnce, {
      minRuns: 3,
      maxRuns: 5,
    });

    console.log('\n=== M1 Repeatability Summary ===');
    console.log(`Runs: ${result.runs.length}`);
    console.log(`p99 variance: ${(result.p99Variance * 100).toFixed(2)}%`);
    console.log(`Stable: ${result.isStable}`);
    console.log(`SustainableRPS per run: ${result.runs.map((r) => r.sweep?.sustainableRPS).join(', ')}`);
    console.log('================================\n');

    expect(result.runs.length).toBeGreaterThanOrEqual(3);
    expect(result.p99Variance).toBeLessThan(0.10);
    expect(result.isStable).toBe(true);

    // Tüm run'ların envHash'i aynı olmalı
    const hashes = result.runs.map((r) => r.metadata.environmentSnapshotHash);
    expect(new Set(hashes).size).toBe(1);

    harness.eventLoopMonitor.stop();
  });

  it('OverheadDelta: M1 - M0 eşlenmiş RPS noktalarında hesaplanır', async () => {
    harness.eventLoopMonitor.start();

    // M0 raporu üret (Phase-7 OFF)
    const m0Report = await generateM0Report(harness);

    // SplitTimer + EL reset
    harness.splitTimer.reset();
    harness.eventLoopMonitor.stop();
    harness.eventLoopMonitor.start();

    // M1 raporu üret (Phase-7 ON)
    const simGen = new SimulatedMeasureGenerator(
      harness.splitTimer,
      harness.eventLoopMonitor,
      M1_SIMULATED_CONFIG,
    );
    const measureFn = simGen.createMeasureFn();
    const m1Sweep = await harness.adaptiveSweep.run(C2_SWEEP_CONFIG, measureFn);

    const env = await harness.captureEnvironmentSnapshot();
    const m1Report = harness.createEmptyReport('M1', env);
    m1Report.sweep = m1Sweep;
    m1Report.splitTimers = harness.splitTimer.snapshot();
    m1Report.completedAt = new Date().toISOString();
    m1Report.baselineMatrixRef = m0Report.metadata.runId;

    // Delta hesapla
    const delta: OverheadDelta = harness.computeOverheadDelta(m0Report, m1Report);

    // Sanity assertions
    // Δp99 >= 0 (Phase-7 ON ek maliyet ekler)
    expect(delta.deltaP99Ms).toBeGreaterThanOrEqual(0);

    // Phase-7 split timers non-zero (M1'de aktif, M0'da 0)
    expect(delta.splitTimerBreakdown.phase7_drift_calc_ms.p95).toBeGreaterThan(0);
    expect(delta.splitTimerBreakdown.phase7_snapshot_fetch_ms.p95).toBeGreaterThan(0);

    // Per-RPS deltas mevcut
    expect(delta.perRPSDeltas.length).toBeGreaterThan(0);

    // Her eşlenmiş noktada snapshot_fetch delta > 0 (M0'da 0, M1'de >0)
    for (const d of delta.perRPSDeltas) {
      expect(d.deltaSnapshotFetchP95Ms).toBeGreaterThan(0);
      expect(d.deltaDriftCalcP95Ms).toBeGreaterThan(0);
    }

    // baselineMatrixRef set edilmiş
    expect(m1Report.baselineMatrixRef).toBe(m0Report.metadata.runId);

    // Rapor kaydet
    harness.saveReport(m1Report, 'm1-with-delta.json');

    // Console summary — OverheadDelta tablosu
    console.log('\n=== OverheadDelta Summary (M1 - M0) ===');
    console.log(`SustainableRPS delta: ${delta.sustainableRPSDelta}`);
    console.log(`Δp99 (at sustainable): ${delta.deltaP99Ms.toFixed(2)}ms`);
    console.log(`ΔCPU%: ${delta.deltaCpuPercent.toFixed(3)}%`);
    console.log(`ΔEL p99: ${delta.deltaEventLoopP99Ms.toFixed(2)}ms`);
    console.log(`Phase-7 breakdown (p95): fetch=${delta.splitTimerBreakdown.phase7_snapshot_fetch_ms.p95.toFixed(3)}ms, calc=${delta.splitTimerBreakdown.phase7_drift_calc_ms.p95.toFixed(3)}ms, audit=${delta.splitTimerBreakdown.phase7_audit_write_ms.p95.toFixed(3)}ms, emit=${delta.splitTimerBreakdown.phase7_metrics_emit_ms.p95.toFixed(3)}ms`);
    console.log(`\nPer-RPS Delta Table:`);
    console.log(`${'RPS'.padStart(8)} | ${'Δp50'.padStart(8)} | ${'Δp95'.padStart(8)} | ${'Δp99'.padStart(8)} | ${'Δfetch95'.padStart(9)} | ${'Δcalc95'.padStart(8)} | ${'ΔCPU%'.padStart(8)} | ${'ΔRSS MB'.padStart(8)}`);
    console.log('-'.repeat(85));
    for (const d of delta.perRPSDeltas) {
      console.log(
        `${d.rps.toFixed(1).padStart(8)} | ${d.deltaP50Ms.toFixed(2).padStart(8)} | ${d.deltaP95Ms.toFixed(2).padStart(8)} | ${d.deltaP99Ms.toFixed(2).padStart(8)} | ${d.deltaSnapshotFetchP95Ms.toFixed(3).padStart(9)} | ${d.deltaDriftCalcP95Ms.toFixed(3).padStart(8)} | ${d.deltaCpuTotalPercent.toFixed(3).padStart(8)} | ${d.deltaRssMB.toFixed(0).padStart(8)}`,
      );
    }
    console.log('========================================\n');

    harness.eventLoopMonitor.stop();
  });
});
