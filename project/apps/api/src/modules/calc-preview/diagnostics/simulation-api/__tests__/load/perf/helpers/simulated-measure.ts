/**
 * SimulatedMeasureGenerator — DB bağımsız sentetik ölçüm üretici
 *
 * Performance Characterization — Checkpoint-2 / C2-1
 *
 * Seed deterministik, monotonic degradation garantili.
 * RPS arttıkça latency non-linear artar, belirli eşikte breakpoint tetiklenir.
 * Jitter bounded (±%5), monotonicity guard ile önceki step'in altına düşmez.
 *
 * CPU: process.cpuUsage() delta (core-normalized)
 * Memory: process.memoryUsage() gerçek
 * EventLoop: gerçek monitorEventLoopDelay
 *
 * @see .kiro/specs/perf-characterization/design.md — Karar C2-1
 */

import * as os from 'os';
import { SplitTimer, SplitTimerSnapshot } from './split-timer';
import { EventLoopMonitor, EventLoopSnapshot } from './event-loop-monitor';
import {
  SweepStep,
  CpuSnapshot,
  MemorySnapshot,
  DbPoolSnapshot,
  MeasureFn,
} from './adaptive-sweep';

// ============================================================================
// Config
// ============================================================================

export interface SimulatedMeasureConfig {
  /** Latency baseline (ms) — düşük RPS'te beklenen p99 */
  baselineP99Ms: number;
  /** Breakpoint RPS — bu RPS'te latency patlar */
  breakpointRPS: number;
  /** Latency degradation eğrisi katsayısı */
  degradationFactor: number;
  /** Error rate başlangıç RPS'i */
  errorOnsetRPS: number;
  /** Seed (determinizm) */
  seed: number;
  /** Phase-7 ON ise ek maliyet enjekte edilir */
  phase7Enabled: boolean;
  /**
   * Phase-7 ek maliyet (ms) — her request'e eklenir.
   * snapshot_fetch + drift_calc + audit_write + metrics_emit toplamı.
   * Default: 0.8ms (0.3 + 0.2 + 0.2 + 0.1)
   */
  phase7CostMs: number;
}

export const DEFAULT_SIMULATED_CONFIG: SimulatedMeasureConfig = {
  baselineP99Ms: 50,
  breakpointRPS: 80,
  degradationFactor: 1.5,
  errorOnsetRPS: 72, // breakpointRPS * 0.9
  seed: 42,
  phase7Enabled: false,
  phase7CostMs: 0.8,
};

// ============================================================================
// Seeded PRNG (deterministic jitter)
// ============================================================================

/** Basit mulberry32 PRNG — seed'den deterministik float üretir */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// SimulatedMeasureGenerator
// ============================================================================

export class SimulatedMeasureGenerator {
  private readonly config: SimulatedMeasureConfig;
  private readonly rng: () => number;
  private stepIndex = 0;
  private previousP99 = 0;
  private splitTimer: SplitTimer;
  private eventLoopMonitor: EventLoopMonitor;

  constructor(
    splitTimer: SplitTimer,
    eventLoopMonitor: EventLoopMonitor,
    config?: Partial<SimulatedMeasureConfig>,
  ) {
    this.config = { ...DEFAULT_SIMULATED_CONFIG, ...config };
    this.rng = mulberry32(this.config.seed);
    this.splitTimer = splitTimer;
    this.eventLoopMonitor = eventLoopMonitor;
  }


  /** Reset — 3-run repeatability arasında çağrılır */
  reset(): void {
    this.stepIndex = 0;
    this.previousP99 = 0;
    this.rng; // PRNG state korunur (aynı seed → aynı sequence)
  }

  /** Hard reset — yeni seed ile baştan */
  hardReset(seed?: number): void {
    this.stepIndex = 0;
    this.previousP99 = 0;
    // PRNG yeniden oluşturulur
    const newRng = mulberry32(seed ?? this.config.seed);
    (this as any).rng = newRng;
  }

  /**
   * MeasureFn oluştur — AdaptiveSweep.run()'a verilir.
   *
   * Her çağrıda:
   * 1. EL drain (step başı)
   * 2. SplitTimer reset
   * 3. CPU delta ölçümü
   * 4. Sentetik latency hesaplama (monotonic + jitter)
   * 5. SplitTimer'a kayıt
   * 6. EL snapshot (gerçek)
   * 7. Memory snapshot (gerçek)
   */
  createMeasureFn(): MeasureFn {
    return async (rps: number, durationSec: number): Promise<SweepStep> => {
      // 1. EL drain — önceki step'ten kalan veriyi temizle
      this.eventLoopMonitor.snapshot();

      // 2. SplitTimer reset
      this.splitTimer.reset();

      // 3. CPU delta başlangıç
      const cpuBefore = process.cpuUsage();
      const wallStart = Date.now();

      // 4. Sentetik latency hesapla
      const latencyModel = this.computeLatency(rps);
      const errorRate = this.computeErrorRate(rps);

      // Simüle: durationSec boyunca "request" gönder
      const requestCount = Math.max(1, Math.round(rps * durationSec));
      for (let i = 0; i < requestCount; i++) {
        const reqId = `sim_${this.stepIndex}_${i}`;
        this.splitTimer.startRequest(reqId);

        if (this.config.phase7Enabled) {
          // Phase-7 ON: split'ler gerçek maliyet taşır
          const costBase = this.config.phase7CostMs;
          const fetchMs = costBase * 0.375 * (1 + this.jitter(0.05));  // ~0.3ms
          const calcMs = costBase * 0.25 * (1 + this.jitter(0.05));   // ~0.2ms
          const auditMs = costBase * 0.25 * (1 + this.jitter(0.05));  // ~0.2ms
          const emitMs = costBase * 0.125 * (1 + this.jitter(0.05));  // ~0.1ms

          this.splitTimer.recordSplit(reqId, 'snapshot_fetch', fetchMs);
          this.splitTimer.recordSplit(reqId, 'drift_calc', calcMs);
          this.splitTimer.recordSplit(reqId, 'audit_write', auditMs);
          this.splitTimer.recordSplit(reqId, 'metrics_emit', emitMs);

          // Toplam = base latency + phase-7 overhead
          const phase7Total = fetchMs + calcMs + auditMs + emitMs;
          const totalMs = latencyModel.p99 * (0.5 + this.rng() * 0.8) + phase7Total;
          this.splitTimer.endRequest(reqId, totalMs);
        } else {
          // Phase-7 OFF: split'ler 0 (pipeline çalışmıyor)
          this.splitTimer.recordSplit(reqId, 'snapshot_fetch', 0);
          this.splitTimer.recordSplit(reqId, 'drift_calc', 0);
          this.splitTimer.recordSplit(reqId, 'audit_write', 0);
          this.splitTimer.recordSplit(reqId, 'metrics_emit', 0);

          // Toplam = sadece base latency
          const totalMs = latencyModel.p99 * (0.5 + this.rng() * 0.8);
          this.splitTimer.endRequest(reqId, totalMs);
        }
      }

      // Kısa bekleme — event loop delay oluşsun (simulated run'da minimal)
      await this.sleep(Math.min(durationSec * 1000, 50));

      // 5. CPU delta — Math.max(1, ...) ile wallElapsed=0 → NaN/Infinity koruması
      const wallElapsed = Math.max(1, Date.now() - wallStart);
      const cpuAfter = process.cpuUsage(cpuBefore);
      const cores = os.cpus().length;
      const rawUser = (cpuAfter.user / 1000 / wallElapsed / cores) * 100;
      const rawSystem = (cpuAfter.system / 1000 / wallElapsed / cores) * 100;
      const rawTotal = ((cpuAfter.user + cpuAfter.system) / 1000 / wallElapsed / cores) * 100;
      const cpu: CpuSnapshot = {
        userPercent: Number.isFinite(rawUser) ? Math.max(0, rawUser) : 0,
        systemPercent: Number.isFinite(rawSystem) ? Math.max(0, rawSystem) : 0,
        totalPercent: Number.isFinite(rawTotal) ? Math.max(0, rawTotal) : 0,
      };

      // 6. EL snapshot (gerçek)
      const eventLoop: EventLoopSnapshot = this.eventLoopMonitor.snapshot();

      // 7. Memory snapshot (gerçek)
      const mem = process.memoryUsage();
      const memory: MemorySnapshot = {
        rssKB: Math.round(mem.rss / 1024),
        heapUsedMB: Math.round(mem.heapUsed / (1024 * 1024)),
        heapTotalMB: Math.round(mem.heapTotal / (1024 * 1024)),
        externalMB: Math.round(mem.external / (1024 * 1024)),
      };

      // 8. DB pool (simüle — sabit)
      const dbPool: DbPoolSnapshot = {
        activeConnections: Math.min(10, Math.round(rps / 10)),
        poolLimit: 10,
        utilizationPercent: Math.min(100, Math.round((rps / 10) * 10)),
        isQueueing: rps > 70,
        dbWaitP99Ms: rps > 60 ? (rps - 60) * 0.5 : 0,
      };

      const splitTimers: SplitTimerSnapshot = this.splitTimer.snapshot();

      this.stepIndex++;

      return {
        rps,
        latency: splitTimers.request_duration_ms,
        eventLoop,
        cpu,
        memory,
        dbPool,
        splitTimers,
        errorRate,
        isBreakpoint: false, // AdaptiveSweep belirler
      };
    };
  }

  // ==========================================================================
  // Latency model — monotonic degradation
  // ==========================================================================

  private computeLatency(rps: number): { p50: number; p95: number; p99: number } {
    const { baselineP99Ms, breakpointRPS, degradationFactor } = this.config;
    const stableZone = breakpointRPS * 0.7;
    let p99: number;

    if (rps < stableZone) {
      // Stabil bölge — baseline + bounded jitter
      p99 = baselineP99Ms * (1 + this.jitter(0.05));
    } else if (rps < breakpointRPS) {
      // Degradation bölgesi
      const ratio = (rps - stableZone) / (breakpointRPS - stableZone);
      p99 = baselineP99Ms * (1 + Math.pow(ratio, degradationFactor));
    } else {
      // Breakpoint sonrası — quadratic blowup
      p99 =
        baselineP99Ms *
        degradationFactor *
        Math.pow(rps / breakpointRPS, 2);
    }

    // Monotonicity guard — önceki step'in altına düşemez
    p99 = Math.max(p99, this.previousP99);
    this.previousP99 = p99;

    return {
      p50: p99 * 0.4,
      p95: p99 * 0.75,
      p99,
    };
  }

  private computeErrorRate(rps: number): number {
    const { errorOnsetRPS, breakpointRPS } = this.config;
    if (rps < errorOnsetRPS) return 0;
    if (rps < breakpointRPS) {
      // Lineer artış: 0 → %0.5
      return ((rps - errorOnsetRPS) / (breakpointRPS - errorOnsetRPS)) * 0.005;
    }
    // Breakpoint sonrası: hızlı artış
    return 0.005 + (rps - breakpointRPS) * 0.002;
  }

  /** Bounded jitter: [-bound, +bound] aralığında deterministik */
  private jitter(bound: number): number {
    return (this.rng() * 2 - 1) * bound;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Shared Helper — Base Latency Model (M0/M1/M2 ortak)
// ============================================================================

export interface BaseLatencyConfig {
  baselineP99Ms: number;
  breakpointRPS: number;
  degradationFactor: number;
}

export const DEFAULT_BASE_LATENCY_CONFIG: BaseLatencyConfig = {
  baselineP99Ms: DEFAULT_SIMULATED_CONFIG.baselineP99Ms,
  breakpointRPS: DEFAULT_SIMULATED_CONFIG.breakpointRPS,
  degradationFactor: DEFAULT_SIMULATED_CONFIG.degradationFactor,
};

/**
 * RPS'e göre base p99 latency hesaplar.
 * SimulatedMeasureGenerator.computeLatency() ile aynı formül.
 * Monotonicity guard yok — M2'de sabit RPS kullanıldığı için gereksiz.
 *
 * @param rps - Hedef RPS
 * @param config - Latency model parametreleri
 * @param rng - Jitter için PRNG fonksiyonu (0-1 arası)
 * @returns p99 latency (ms)
 */
export function computeBaseLatencyMs(
  rps: number,
  config: BaseLatencyConfig,
  rng: () => number,
): number {
  const { baselineP99Ms, breakpointRPS, degradationFactor } = config;
  const stableZone = breakpointRPS * 0.7;
  const jitter = (rng() * 2 - 1) * 0.05; // ±%5 bounded jitter

  if (rps < stableZone) {
    return baselineP99Ms * (1 + jitter);
  } else if (rps < breakpointRPS) {
    const ratio = (rps - stableZone) / (breakpointRPS - stableZone);
    return baselineP99Ms * (1 + Math.pow(ratio, degradationFactor));
  } else {
    return baselineP99Ms * degradationFactor * Math.pow(rps / breakpointRPS, 2);
  }
}
