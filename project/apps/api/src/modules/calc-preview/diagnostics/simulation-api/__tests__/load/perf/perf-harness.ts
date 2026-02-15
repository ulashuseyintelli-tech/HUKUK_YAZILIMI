/**
 * PerfHarness — Performans karakterizasyon orkestratörü
 *
 * Performance Characterization — Task 9.2
 *
 * LoadTestRunner'ı extend eder. Instrumentation helper'ları orkestre eder.
 * runMatrix(), computeOverheadDelta(), captureEnvironmentSnapshot(), saveReport().
 *
 * @see .kiro/specs/perf-characterization/design.md — Bileşen 7
 */

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { LoadTestRunner } from '../load-test-runner';
import { DbPoolMonitor } from '../helpers/db-pool-monitor';
import { SplitTimer } from './helpers/split-timer';
import { EventLoopMonitor } from './helpers/event-loop-monitor';
import { WarmupValidator } from './helpers/warmup-validator';
import { AdaptiveSweep, SweepConfig, DEFAULT_SWEEP_CONFIG } from './helpers/adaptive-sweep';
import {
  MatrixId,
  MatrixReport,
  OverheadDelta,
  PerRPSOverheadDelta,
  EnvironmentSnapshot,
  ReportMetadata,
} from './perf-report.types';

// ============================================================================
// Constants
// ============================================================================

const SCHEMA_VERSION = '1.0.0';
const DEFAULT_SEED = 42;

// ============================================================================
// PerfHarness
// ============================================================================

export interface PerfHarnessConfig {
  seed?: number;
  outputDir?: string;
  sweepConfig?: Partial<SweepConfig>;
}

export class PerfHarness extends LoadTestRunner {
  readonly splitTimer: SplitTimer;
  readonly eventLoopMonitor: EventLoopMonitor;
  readonly warmupValidator: WarmupValidator;
  readonly adaptiveSweep: AdaptiveSweep;
  private readonly outputDir: string;
  private readonly perfSeed: number;

  constructor(
    poolMonitor?: DbPoolMonitor,
    config?: PerfHarnessConfig,
  ) {
    const envSeed = Number(process.env.PERF_SEED);
    const seed = config?.seed ?? (envSeed > 0 ? envSeed : DEFAULT_SEED);
    super(seed, poolMonitor);

    this.perfSeed = seed;
    this.splitTimer = new SplitTimer();
    this.eventLoopMonitor = new EventLoopMonitor();
    this.warmupValidator = new WarmupValidator();
    this.adaptiveSweep = new AdaptiveSweep();
    this.outputDir = config?.outputDir ?? path.join(__dirname, 'reports');
  }


  /** Environment snapshot al */
  async captureEnvironmentSnapshot(
    dbPoolSize = 10,
    postgresVersion = 'unknown',
  ): Promise<EnvironmentSnapshot> {
    const cpus = os.cpus();
    const maxOldSpaceSizeMatch = (process.env.NODE_OPTIONS ?? '').match(
      /--max-old-space-size=(\d+)/,
    );

    return {
      nodeVersion: process.version,
      cpuModel: cpus[0]?.model ?? 'unknown',
      cpuCores: cpus.length,
      totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
      osVersion: `${os.type()} ${os.release()}`,
      nodeOptions: process.env.NODE_OPTIONS ?? '',
      maxOldSpaceSize: maxOldSpaceSizeMatch ? Number(maxOldSpaceSizeMatch[1]) : null,
      dbPoolSize,
      postgresVersion,
      perfSeed: this.perfSeed,
      capturedAt: new Date().toISOString(),
    };
  }

  /** Rapor metadata üret */
  generateMetadata(environment: EnvironmentSnapshot): ReportMetadata {
    const envHash = PerfHarness.computeEnvHash(environment);

    return {
      schemaVersion: SCHEMA_VERSION,
      runId: `perf_${this.perfSeed}_${Date.now()}`,
      gitSha: process.env.GIT_SHA ?? 'unknown',
      environmentSnapshotHash: envHash,
    };
  }

  /**
   * Environment hash — yalnızca ortam sabitlerini içerir.
   * gitSha, perfSeed, capturedAt, postgresVersion hash'e girmez.
   * @see design.md — Karar C2-2
   */
  static computeEnvHash(env: EnvironmentSnapshot): string {
    const hashInput = {
      nodeVersion: env.nodeVersion,
      cpuModel: env.cpuModel,
      cpuCores: env.cpuCores,
      totalMemoryMB: env.totalMemoryMB,
      osVersion: env.osVersion,
      nodeOptions: env.nodeOptions,
      maxOldSpaceSize: env.maxOldSpaceSize,
      dbPoolSize: env.dbPoolSize,
    };
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(hashInput))
      .digest('hex')
      .slice(0, 12);
  }

  /**
   * M0 vs M1 delta hesapla — eşlenmiş RPS noktalarında.
   *
   * Eşleme kuralı: Aynı RPS noktaları varsa birebir karşılaştır.
   * Farklıysa: en yakın düşük RPS'e snap et (interpolasyon yapma).
   * Özet delta: M1'in sustainable RPS'inde hesaplanır.
   */
  computeOverheadDelta(m0: MatrixReport, m1: MatrixReport): OverheadDelta {
    const m0Sweep = m0.sweep;
    const m1Sweep = m1.sweep;
    const m0Steps = m0Sweep?.steps ?? [];
    const m1Steps = m1Sweep?.steps ?? [];

    // Per-RPS delta: M1'in her step'i için M0'da en yakın düşük RPS'i bul
    const perRPSDeltas: PerRPSOverheadDelta[] = [];
    for (const m1Step of m1Steps) {
      // Exact match veya en yakın düşük RPS
      let m0Step = m0Steps.find((s) => s.rps === m1Step.rps);
      if (!m0Step) {
        const candidates = m0Steps.filter((s) => s.rps <= m1Step.rps);
        if (candidates.length > 0) {
          m0Step = candidates.reduce((a, b) => (b.rps > a.rps ? b : a));
        }
      }
      if (!m0Step) continue;

      perRPSDeltas.push({
        rps: m1Step.rps,
        deltaP50Ms: m1Step.latency.p50 - m0Step.latency.p50,
        deltaP95Ms: m1Step.latency.p95 - m0Step.latency.p95,
        deltaP99Ms: m1Step.latency.p99 - m0Step.latency.p99,
        deltaSnapshotFetchP95Ms:
          m1Step.splitTimers.phase7_snapshot_fetch_ms.p95 -
          m0Step.splitTimers.phase7_snapshot_fetch_ms.p95,
        deltaSnapshotFetchP99Ms:
          m1Step.splitTimers.phase7_snapshot_fetch_ms.p99 -
          m0Step.splitTimers.phase7_snapshot_fetch_ms.p99,
        deltaDriftCalcP95Ms:
          m1Step.splitTimers.phase7_drift_calc_ms.p95 -
          m0Step.splitTimers.phase7_drift_calc_ms.p95,
        deltaDriftCalcP99Ms:
          m1Step.splitTimers.phase7_drift_calc_ms.p99 -
          m0Step.splitTimers.phase7_drift_calc_ms.p99,
        deltaEventLoopP99Ms: m1Step.eventLoop.p99Ms - m0Step.eventLoop.p99Ms,
        deltaCpuTotalPercent: m1Step.cpu.totalPercent - m0Step.cpu.totalPercent,
        deltaRssMB:
          Math.round(m1Step.memory.rssKB / 1024) -
          Math.round(m0Step.memory.rssKB / 1024),
      });
    }

    // Özet delta: M1'in sustainable RPS'inde
    const compareRPS = m1Sweep?.sustainableRPS ?? m0Sweep?.sustainableRPS ?? 0;
    const summaryDelta = perRPSDeltas.find((d) => d.rps === compareRPS);

    const emptyStats = { p50: 0, p95: 0, p99: 0, max: 0, count: 0, mean: 0 };

    return {
      deltaP99Ms: summaryDelta?.deltaP99Ms ?? 0,
      deltaCpuPercent: summaryDelta?.deltaCpuTotalPercent ?? 0,
      deltaAllocRateMBPerMin: 0, // M4'ten hesaplanır
      deltaEventLoopP99Ms: summaryDelta?.deltaEventLoopP99Ms ?? 0,
      sustainableRPSDelta:
        (m1Sweep?.sustainableRPS ?? 0) - (m0Sweep?.sustainableRPS ?? 0),
      splitTimerBreakdown: m1.splitTimers ?? {
        request_duration_ms: emptyStats,
        phase7_snapshot_fetch_ms: emptyStats,
        phase7_drift_calc_ms: emptyStats,
        phase7_audit_write_ms: emptyStats,
        phase7_metrics_emit_ms: emptyStats,
      },
      perRPSDeltas,
    };
  }

  /** Rapor JSON olarak kaydet */
  saveReport(report: MatrixReport, filename?: string): string {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    const fname = filename ?? `${report.matrixId.toLowerCase()}-report.json`;
    const filePath = path.join(this.outputDir, fname);
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`[PerfHarness] Rapor kaydedildi: ${filePath}`);
    return filePath;
  }

  /** Boş MatrixReport şablonu üret */
  createEmptyReport(
    matrixId: MatrixId,
    environment: EnvironmentSnapshot,
  ): MatrixReport {
    return {
      metadata: this.generateMetadata(environment),
      matrixId,
      startedAt: new Date().toISOString(),
      completedAt: '',
      environment,
      warmup: null,
      sweep: null,
      splitTimers: null,
      heapSnapshots: [],
      heapTrend: null,
      blockRateBuckets: [],
      snapshotPressure: null,
      microBenchmark: null,
      seed: this.perfSeed,
      warnings: [],
    };
  }

  /**
   * 3-run repeatability wrapper.
   *
   * Aynı config/seed ile N kez çalıştırır, measure-only p99 varyasyonunu kontrol eder.
   * Her run arasında splitTimer.reset() + eventLoopMonitor.stop() → start().
   *
   * @see design.md — Karar C2-3
   */
  async runWithRepeatability(
    runFn: () => Promise<MatrixReport>,
    opts?: { minRuns?: number; maxRuns?: number },
  ): Promise<RepeatabilityResult> {
    const minRuns = opts?.minRuns ?? 3;
    const maxRuns = opts?.maxRuns ?? 5;
    const runs: MatrixReport[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < maxRuns; i++) {
      // Hard reset between runs
      this.splitTimer.reset();
      this.eventLoopMonitor.stop();
      this.eventLoopMonitor.start();

      const report = await runFn();
      runs.push(report);

      if (runs.length >= minRuns) {
        const variance = PerfHarness.computeP99Variance(runs);
        if (variance.isStable) {
          return { runs, ...variance, warnings };
        }
        if (runs.length < maxRuns) {
          warnings.push(
            `Run ${i + 1}: p99 varyasyonu ${(variance.p99Variance * 100).toFixed(1)}% > %10, ek run ekleniyor`,
          );
        }
      }
    }

    // Max run'a ulaşıldı, hala unstable
    const finalVariance = PerfHarness.computeP99Variance(runs);
    if (!finalVariance.isStable) {
      warnings.push('UNSTABLE_ENVIRONMENT: p99 varyasyonu %10 eşiğini aşıyor');
    }
    return { runs, ...finalVariance, warnings };
  }

  /**
   * p99 varyasyonu hesapla — yalnızca measure fazı (sweep step'leri).
   * Warmup verileri dahil edilmez.
   * Karşılaştırma: tüm run'lardaki ortak RPS noktalarında p99 varyasyonu.
   *
   * isStable kararı yalnızca latency p99 varyasyonuna dayanır (measure only).
   * EL p99 varyasyonu bilgi amaçlı raporlanır — simulated run'da EL değerleri
   * gerçek yük olmadığından anlamsız olabilir.
   */
  static computeP99Variance(runs: MatrixReport[]): {
    p99Variance: number;
    eventLoopP99Variance: number;
    isStable: boolean;
  } {
    if (runs.length < 2) {
      return { p99Variance: 0, eventLoopP99Variance: 0, isStable: true };
    }

    // Tüm run'lardaki ortak RPS noktalarını bul
    const rpsSetPerRun = runs.map(
      (r) => new Set((r.sweep?.steps ?? []).map((s) => s.rps)),
    );
    const commonRPS = [...(rpsSetPerRun[0] ?? [])].filter((rps) =>
      rpsSetPerRun.every((set) => set.has(rps)),
    );

    if (commonRPS.length === 0) {
      return { p99Variance: 0, eventLoopP99Variance: 0, isStable: true };
    }

    // Her ortak RPS noktasında p99 varyasyonunu hesapla, en kötüsünü al
    let maxP99Var = 0;
    let maxElVar = 0;

    for (const rps of commonRPS) {
      const p99Values = runs
        .map((r) => r.sweep?.steps.find((s) => s.rps === rps)?.latency.p99 ?? 0)
        .filter((v) => v > 0);
      const elValues = runs
        .map((r) => r.sweep?.steps.find((s) => s.rps === rps)?.eventLoop.p99Ms ?? 0)
        .filter((v) => v > 0);

      maxP99Var = Math.max(maxP99Var, PerfHarness.rangeOverMean(p99Values));
      // EL değerleri bilgi amaçlı — minMeanThreshold ile küçük değerler filtrelenir
      maxElVar = Math.max(maxElVar, PerfHarness.rangeOverMean(elValues, 1.0));
    }

    // isStable kararı yalnızca latency p99 varyasyonuna dayanır (C2-3: measure only)
    return {
      p99Variance: maxP99Var,
      eventLoopP99Variance: maxElVar,
      isStable: maxP99Var < 0.10,
    };
  }

  /**
   * (max - min) / mean — varyasyon ölçüsü.
   *
   * minMeanThreshold: Ortalama bu eşiğin altındaysa varyasyon 0 kabul edilir.
   * Çok küçük değerlerde (ör. EL delay ~0.01ms) mutlak fark anlamsız olsa bile
   * oransal varyasyon patlayabilir. Bu guard bunu önler.
   */
  private static rangeOverMean(values: number[], minMeanThreshold = 0): number {
    if (values.length < 2) return 0;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0 || mean < minMeanThreshold) return 0;
    return (max - min) / mean;
  }
}

// ============================================================================
// Repeatability Result
// ============================================================================

export interface RepeatabilityResult {
  runs: MatrixReport[];
  p99Variance: number;
  eventLoopP99Variance: number;
  isStable: boolean;
  warnings: string[];
}
