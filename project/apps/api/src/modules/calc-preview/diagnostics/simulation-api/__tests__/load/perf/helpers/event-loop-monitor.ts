/**
 * EventLoopMonitor — Event loop lag ölçümü
 *
 * Performance Characterization — Task 2.1
 *
 * `perf_hooks.monitorEventLoopDelay({ resolution: 20 })` wrapper.
 * Reset-per-step semantiği: her sweep step'i başında histogram sıfırlanır.
 * Nanosecond → millisecond dönüşümü: value / 1e6.
 *
 * @see .kiro/specs/perf-characterization/design.md
 */

import { monitorEventLoopDelay, IntervalHistogram } from 'perf_hooks';

// ============================================================================
// Types
// ============================================================================

export interface EventLoopSnapshot {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

/** Breakpoint eşiği (ms) — p99 > bu değer ise sinyal üretilir */
const BREAKPOINT_THRESHOLD_MS = 50;

// ============================================================================
// EventLoopMonitor
// ============================================================================

export class EventLoopMonitor {
  private histogram: IntervalHistogram | null = null;
  private lastSnapshot: EventLoopSnapshot | null = null;

  /** Monitoring başlat (resolution: 20ms) */
  start(): void {
    this.histogram = monitorEventLoopDelay({ resolution: 20 });
    this.histogram.enable();
  }

  /** Monitoring durdur */
  stop(): void {
    if (this.histogram) {
      this.histogram.disable();
      this.histogram = null;
    }
  }

  /**
   * Mevcut pencere snapshot'ı al ve sıfırla.
   * Step'ler arası birikim yapılmaz — her çağrı temiz pencere başlatır.
   */
  snapshot(): EventLoopSnapshot {
    if (!this.histogram) {
      return { p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
    }

    const snap: EventLoopSnapshot = {
      p50Ms: nsToMs(this.histogram.percentile(50)),
      p95Ms: nsToMs(this.histogram.percentile(95)),
      p99Ms: nsToMs(this.histogram.percentile(99)),
      maxMs: nsToMs(this.histogram.max),
    };

    this.lastSnapshot = snap;
    this.histogram.reset();
    return snap;
  }

  /**
   * Breakpoint sinyali kontrolü.
   * true dönmeli ancak ve ancak p99Ms > 50 olduğunda.
   */
  isBreakpointSignal(): boolean {
    const snap = this.lastSnapshot ?? this.snapshot();
    return snap.p99Ms > BREAKPOINT_THRESHOLD_MS;
  }

  /**
   * Statik breakpoint kontrolü — snapshot verisi ile.
   * Property testlerde kullanılır (monitor instance'ı olmadan).
   */
  static isBreakpoint(snap: EventLoopSnapshot): boolean {
    return snap.p99Ms > BREAKPOINT_THRESHOLD_MS;
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** Nanosecond → millisecond dönüşümü */
function nsToMs(ns: number): number {
  return ns / 1e6;
}
