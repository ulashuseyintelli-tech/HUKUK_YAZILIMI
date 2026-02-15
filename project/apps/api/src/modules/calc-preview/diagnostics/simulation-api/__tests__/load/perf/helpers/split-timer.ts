/**
 * SplitTimer — In-memory histogram wrapper
 *
 * Performance Characterization — Task 1.1
 *
 * Request pipeline'ındaki her aşamayı ayrı ölçen histogram.
 * Sorted array + nearest-rank percentile hesaplama (p50/p95/p99/max).
 * Negatif değer koruması: Math.max(0, duration).
 *
 * prom-client wired olduğunda Histogram'a geçiş yapılabilir.
 *
 * @see .kiro/specs/perf-characterization/design.md
 */

// ============================================================================
// Types
// ============================================================================

export type SplitPhase =
  | 'snapshot_fetch'
  | 'drift_calc'
  | 'audit_write'
  | 'metrics_emit';

export interface HistogramStats {
  p50: number;
  p95: number;
  p99: number;
  max: number;
  count: number;
  mean: number;
}

export interface SplitTimerSnapshot {
  request_duration_ms: HistogramStats;
  phase7_snapshot_fetch_ms: HistogramStats;
  phase7_drift_calc_ms: HistogramStats;
  phase7_audit_write_ms: HistogramStats;
  phase7_metrics_emit_ms: HistogramStats;
}

// ============================================================================
// Histogram (internal)
// ============================================================================

/** Sorted-array histogram with nearest-rank percentile */
class Histogram {
  private values: number[] = [];
  private sorted = true;

  record(value: number): void {
    this.values.push(Math.max(0, value));
    this.sorted = false;
  }

  reset(): void {
    this.values = [];
    this.sorted = true;
  }

  stats(): HistogramStats {
    if (this.values.length === 0) {
      return { p50: 0, p95: 0, p99: 0, max: 0, count: 0, mean: 0 };
    }
    this.ensureSorted();
    const n = this.values.length;
    const sum = this.values.reduce((a, b) => a + b, 0);
    return {
      p50: this.percentile(0.50),
      p95: this.percentile(0.95),
      p99: this.percentile(0.99),
      max: this.values[n - 1],
      count: n,
      mean: sum / n,
    };
  }

  /** Nearest-rank percentile: index = ceil(p * count) - 1 */
  private percentile(p: number): number {
    const n = this.values.length;
    if (n === 0) return 0;
    const idx = Math.min(Math.ceil(p * n) - 1, n - 1);
    return this.values[Math.max(0, idx)];
  }

  private ensureSorted(): void {
    if (!this.sorted) {
      this.values.sort((a, b) => a - b);
      this.sorted = true;
    }
  }
}


// ============================================================================
// Standalone percentile helper (M2 block/accept latency için)
// ============================================================================

/**
 * Sayı dizisinden HistogramStats hesaplar.
 * SplitTimer'daki Histogram.stats() ile aynı nearest-rank algoritması.
 */
export function computeHistogramStats(values: number[]): HistogramStats {
  if (values.length === 0) {
    return { p50: 0, p95: 0, p99: 0, max: 0, count: 0, mean: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const percentile = (p: number): number => {
    const idx = Math.min(Math.ceil(p * n) - 1, n - 1);
    return sorted[Math.max(0, idx)];
  };
  return {
    p50: percentile(0.50),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted[n - 1],
    count: n,
    mean: sum / n,
  };
}

// ============================================================================
// Phase → histogram key mapping
// ============================================================================

const PHASE_KEY_MAP: Record<SplitPhase, keyof SplitTimerSnapshot> = {
  snapshot_fetch: 'phase7_snapshot_fetch_ms',
  drift_calc: 'phase7_drift_calc_ms',
  audit_write: 'phase7_audit_write_ms',
  metrics_emit: 'phase7_metrics_emit_ms',
};

// ============================================================================
// SplitTimer
// ============================================================================

export class SplitTimer {
  private readonly histograms: Record<keyof SplitTimerSnapshot, Histogram>;
  /** requestId → hrtime start (for optional auto-duration) */
  private readonly inflight = new Map<string, [number, number]>();

  constructor() {
    this.histograms = {
      request_duration_ms: new Histogram(),
      phase7_snapshot_fetch_ms: new Histogram(),
      phase7_drift_calc_ms: new Histogram(),
      phase7_audit_write_ms: new Histogram(),
      phase7_metrics_emit_ms: new Histogram(),
    };
  }

  /** Yeni bir ölçüm başlat — requestId bazlı */
  startRequest(requestId: string): void {
    this.inflight.set(requestId, process.hrtime());
  }

  /** Belirli bir aşamayı kaydet (ms) */
  recordSplit(requestId: string, phase: SplitPhase, durationMs: number): void {
    const key = PHASE_KEY_MAP[phase];
    this.histograms[key].record(durationMs);
  }

  /** Toplam request süresini kaydet (ms) */
  endRequest(requestId: string, totalDurationMs: number): void {
    this.histograms.request_duration_ms.record(totalDurationMs);
    this.inflight.delete(requestId);
  }

  /** Tüm histogram'ları sıfırla */
  reset(): void {
    for (const h of Object.values(this.histograms)) {
      h.reset();
    }
    this.inflight.clear();
  }

  /** Mevcut histogram snapshot'ı al */
  snapshot(): SplitTimerSnapshot {
    return {
      request_duration_ms: this.histograms.request_duration_ms.stats(),
      phase7_snapshot_fetch_ms: this.histograms.phase7_snapshot_fetch_ms.stats(),
      phase7_drift_calc_ms: this.histograms.phase7_drift_calc_ms.stats(),
      phase7_audit_write_ms: this.histograms.phase7_audit_write_ms.stats(),
      phase7_metrics_emit_ms: this.histograms.phase7_metrics_emit_ms.stats(),
    };
  }
}
