/**
 * AdaptiveSweep — Breakpoint-seeking RPS sweep stratejisi
 *
 * Performance Characterization — Task 7.1
 *
 * Normal faz: ×1.5 artış.
 * Breakpoint trigger önceliği: error rate → p99 latency → event loop lag.
 * Daraltma: breakpoint altında +%10 × 3 nokta.
 * Stop: 3 bracketing noktası VEYA 2 ardışık step'te error rate > %5.
 *
 * @see .kiro/specs/perf-characterization/design.md — Bileşen 5
 */

import { HistogramStats, SplitTimerSnapshot } from './split-timer';
import { EventLoopSnapshot } from './event-loop-monitor';

// ============================================================================
// Types
// ============================================================================

export interface SweepConfig {
  baseRPS: number;
  normalMultiplier: number;     // 1.5
  narrowIncrement: number;      // 0.10 (%10)
  narrowPoints: number;         // 3
  stepDurationSec: number;
  breakpointThresholds: {
    p99IncreasePercent: number;  // 30
    errorRatePercent: number;    // 0.5
    eventLoopP99Ms: number;     // 50
  };
}

export interface CpuSnapshot {
  userPercent: number;
  systemPercent: number;
  totalPercent: number;
}

export interface MemorySnapshot {
  rssKB: number;
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
}

export interface DbPoolSnapshot {
  activeConnections: number;
  poolLimit: number;
  utilizationPercent: number;
  isQueueing: boolean;
  dbWaitP99Ms: number;
}

export interface SweepStep {
  rps: number;
  latency: HistogramStats;
  eventLoop: EventLoopSnapshot;
  cpu: CpuSnapshot;
  memory: MemorySnapshot;
  dbPool: DbPoolSnapshot;
  splitTimers: SplitTimerSnapshot;
  errorRate: number;
  isBreakpoint: boolean;
  breakpointReason?: string;
}

export interface CapacityPoint {
  rps: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface SweepResult {
  steps: SweepStep[];
  sustainableRPS: number;
  breakpointRPS: number | null;
  capacityEnvelope: CapacityPoint[];
}


// ============================================================================
// Sustainable RPS eşikleri
// ============================================================================

export const SUSTAINABLE_THRESHOLDS = {
  p99Ms: 300,
  p95Ms: 150,
  errorRate: 0.001,   // %0.1
  eventLoopP99Ms: 50,
} as const;

// ============================================================================
// Default config
// ============================================================================

export const DEFAULT_SWEEP_CONFIG: SweepConfig = {
  baseRPS: 10,
  normalMultiplier: 1.5,
  narrowIncrement: 0.10,
  narrowPoints: 3,
  stepDurationSec: 60,
  breakpointThresholds: {
    p99IncreasePercent: 30,
    errorRatePercent: 0.5,
    eventLoopP99Ms: 50,
  },
};

// ============================================================================
// AdaptiveSweep
// ============================================================================

export type MeasureFn = (rps: number, durationSec: number) => Promise<SweepStep>;

export class AdaptiveSweep {
  /**
   * Sweep çalıştır.
   *
   * @param config — Sweep konfigürasyonu
   * @param measure — Her RPS adımında ölçüm yapan fonksiyon (harness sağlar)
   */
  async run(config: SweepConfig, measure: MeasureFn): Promise<SweepResult> {
    const steps: SweepStep[] = [];
    let currentRPS = config.baseRPS;
    let phase: 'normal' | 'narrow' = 'normal';
    let narrowCount = 0;
    let narrowBaseRPS = 0;
    let breakpointRPS: number | null = null;
    let lastStep: SweepStep | null = null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const step = await measure(currentRPS, config.stepDurationSec);
      steps.push(step);

      if (phase === 'normal') {
        const bpReason = this.detectBreakpoint(step, lastStep, config);
        if (bpReason) {
          step.isBreakpoint = true;
          step.breakpointReason = bpReason;
          phase = 'narrow';
          breakpointRPS = currentRPS;
          narrowBaseRPS = lastStep?.rps ?? config.baseRPS;
          narrowCount = 0;
          currentRPS = narrowBaseRPS * (1 + config.narrowIncrement);
        } else {
          lastStep = step;
          currentRPS = currentRPS * config.normalMultiplier;
        }
      } else {
        // narrow phase
        narrowCount++;
        if (narrowCount >= config.narrowPoints) {
          break;
        }
        currentRPS = narrowBaseRPS * (1 + config.narrowIncrement * (narrowCount + 1));
      }

      // Abort: 2 ardışık step'te error rate > %5
      if (steps.length >= 2) {
        const last2 = steps.slice(-2);
        if (last2.every((s) => s.errorRate > 0.05)) {
          break;
        }
      }
    }

    const sustainableRPS = AdaptiveSweep.computeSustainableRPS(steps);
    const capacityEnvelope = steps.map((s) => ({
      rps: s.rps,
      p50Ms: s.latency.p50,
      p95Ms: s.latency.p95,
      p99Ms: s.latency.p99,
    }));

    return { steps, sustainableRPS, breakpointRPS, capacityEnvelope };
  }

  /**
   * Breakpoint tespit — trigger önceliği:
   * 1. error rate > threshold (en kritik)
   * 2. p99 latency > %30 artış
   * 3. event loop p99 > 50ms
   */
  private detectBreakpoint(
    step: SweepStep,
    lastStep: SweepStep | null,
    config: SweepConfig,
  ): string | null {
    const th = config.breakpointThresholds;

    // 1. Error rate
    if (step.errorRate > th.errorRatePercent / 100) {
      return `error_rate=${(step.errorRate * 100).toFixed(2)}% > ${th.errorRatePercent}%`;
    }

    // 2. p99 latency artışı
    if (lastStep && lastStep.latency.p99 > 0) {
      const increase =
        (step.latency.p99 - lastStep.latency.p99) / lastStep.latency.p99;
      if (increase > th.p99IncreasePercent / 100) {
        return `p99_increase=${(increase * 100).toFixed(1)}% > ${th.p99IncreasePercent}%`;
      }
    }

    // 3. Event loop lag
    if (step.eventLoop.p99Ms > th.eventLoopP99Ms) {
      return `event_loop_p99=${step.eventLoop.p99Ms.toFixed(1)}ms > ${th.eventLoopP99Ms}ms`;
    }

    return null;
  }

  /**
   * Sustainable RPS hesaplama — pure fonksiyon (property testlerde kullanılır).
   *
   * Tanım: p99 < 300ms VE p95 < 150ms VE error < %0.1 VE event loop p99 < 50ms
   * koşullarını eş zamanlı sağlayan en yüksek RPS değeri.
   */
  static computeSustainableRPS(steps: SweepStep[]): number {
    let sustainable = 0;
    for (const step of steps) {
      if (AdaptiveSweep.isSustainable(step)) {
        sustainable = Math.max(sustainable, step.rps);
      }
    }
    return sustainable;
  }

  /** Tek step'in sustainable olup olmadığını kontrol et */
  static isSustainable(step: SweepStep): boolean {
    return (
      step.latency.p99 < SUSTAINABLE_THRESHOLDS.p99Ms &&
      step.latency.p95 < SUSTAINABLE_THRESHOLDS.p95Ms &&
      step.errorRate < SUSTAINABLE_THRESHOLDS.errorRate &&
      step.eventLoop.p99Ms < SUSTAINABLE_THRESHOLDS.eventLoopP99Ms
    );
  }

  /**
   * Sweep state machine doğrulaması — pure fonksiyon (property testlerde kullanılır).
   *
   * Normal fazda: her adımın RPS'i bir öncekinin ×multiplier'ı.
   * Narrow fazda: +increment × N artışlarla.
   * Breakpoint varsa: en az narrowPoints bracketing noktası.
   */
  static validateStateMachine(
    steps: SweepStep[],
    config: SweepConfig,
  ): { valid: boolean; reason?: string } {
    if (steps.length === 0) return { valid: true };

    let phase: 'normal' | 'narrow' = 'normal';
    let narrowCount = 0;
    let narrowBaseRPS = 0;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      if (phase === 'normal') {
        // İlk step veya normal artış kontrolü
        if (i > 0 && !steps[i - 1].isBreakpoint) {
          const expectedRPS = steps[i - 1].rps * config.normalMultiplier;
          const tolerance = expectedRPS * 0.01; // %1 tolerans (float)
          if (Math.abs(step.rps - expectedRPS) > tolerance) {
            return {
              valid: false,
              reason: `Normal faz: step ${i} RPS=${step.rps}, beklenen=${expectedRPS.toFixed(1)}`,
            };
          }
        }

        if (step.isBreakpoint) {
          phase = 'narrow';
          narrowBaseRPS = i > 0 ? steps[i - 1].rps : config.baseRPS;
          narrowCount = 0;
        }
      } else {
        // Narrow faz
        narrowCount++;
        const expectedRPS = narrowBaseRPS * (1 + config.narrowIncrement * narrowCount);
        const tolerance = expectedRPS * 0.01;
        if (Math.abs(step.rps - expectedRPS) > tolerance) {
          return {
            valid: false,
            reason: `Narrow faz: step ${i} RPS=${step.rps}, beklenen=${expectedRPS.toFixed(1)}`,
          };
        }
      }
    }

    // Breakpoint varsa en az narrowPoints bracketing noktası olmalı
    const hasBreakpoint = steps.some((s) => s.isBreakpoint);
    if (hasBreakpoint) {
      const bpIndex = steps.findIndex((s) => s.isBreakpoint);
      const bracketingPoints = steps.length - bpIndex - 1;
      if (bracketingPoints < config.narrowPoints) {
        return {
          valid: false,
          reason: `Bracketing: ${bracketingPoints} nokta, beklenen >= ${config.narrowPoints}`,
        };
      }
    }

    return { valid: true };
  }
}
