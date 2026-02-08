/**
 * Carrier Lifecycle Metrics - Phase 10.5
 * 
 * Prometheus metrics for carrier lifecycle operations.
 * 
 * @see ADR-008 v1.3: Queue/Job Boundary Context Propagation
 */

/**
 * Metric interface for counter operations.
 * Allows for mock injection in tests.
 */
export interface CounterMetric {
  inc(labels?: Record<string, string>): void;
}

/**
 * Simple in-memory counter for metrics.
 * In production, replace with actual Prometheus counter.
 */
class SimpleCounter implements CounterMetric {
  private counts = new Map<string, number>();
  
  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: string[],
  ) {}
  
  inc(labels: Record<string, string> = {}): void {
    const key = this.buildKey(labels);
    const current = this.counts.get(key) ?? 0;
    this.counts.set(key, current + 1);
  }
  
  /** Get count for testing */
  getCount(labels: Record<string, string> = {}): number {
    return this.counts.get(this.buildKey(labels)) ?? 0;
  }
  
  /** Reset for testing */
  reset(): void {
    this.counts.clear();
  }
  
  private buildKey(labels: Record<string, string>): string {
    const parts = this.labelNames.map(name => `${name}=${labels[name] ?? ''}`);
    return parts.join(',');
  }

  /** Export as Prometheus exposition lines. Stable label order guaranteed. */
  toPrometheusLines(): string[] {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} counter`);

    if (this.labelNames.length === 0) {
      // No labels — single value
      const total = this.counts.get('') ?? 0;
      lines.push(`${this.name} ${total}`);
    } else {
      // Stable sort by key string
      const sortedEntries = [...this.counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      for (const [key, count] of sortedEntries) {
        const pairs = key.split(',').map(pair => {
          const [k, v] = pair.split('=');
          return `${k}="${escapeLabel(v)}"`;
        });
        lines.push(`${this.name}{${pairs.join(',')}} ${count}`);
      }
    }
    return lines;
  }
}

// ============================================================================
// RETRY METRICS
// ============================================================================

/**
 * Counter for retry carrier mutations.
 * Labels: path (retry)
 * 
 * NOTE: attempt_number label removed to prevent cardinality explosion.
 * Use carrier_attempt_histogram for attempt distribution if needed.
 */
export const retryMutationMetric = new SimpleCounter(
  'carrier_mutated_total',
  'Carrier mutations by path',
  ['path'],
);

// ============================================================================
// DLQ METRICS
// ============================================================================

/**
 * Counter for DLQ carrier enrichments.
 * Labels: reason (EXHAUSTED | POISON | MANUAL)
 */
export const dlqEnrichmentMetric = new SimpleCounter(
  'carrier_dlq_enrichment_total',
  'Carrier enrichments for DLQ path',
  ['reason'],
);

// ============================================================================
// REDRIVE METRICS
// ============================================================================

/**
 * Counter for redrive carrier clones.
 * Labels: source_dlq
 */
export const redriveCloneMetric = new SimpleCounter(
  'carrier_redrive_clone_total',
  'Carrier clones for redrive path',
  ['source_dlq'],
);

// ============================================================================
// SIZE LIMIT METRICS
// ============================================================================

/**
 * Counter for carrier size limit enforcement.
 * Labels: action (OK | TRUNCATED | REJECTED)
 */
export const sizeEnforcementMetric = new SimpleCounter(
  'carrier_size_enforcement_total',
  'Carrier size limit enforcement actions',
  ['action'],
);

// ============================================================================
// CONTROLLER METRICS (Task 7)
// ============================================================================

/**
 * Counter for admin redrive operations that successfully cloned carrier.
 * Labels: none (simple counter)
 */
export const redriveClonedMetric = new SimpleCounter(
  'carrier_redrive_cloned_total',
  'Admin redrive operations that cloned carrier',
  [],
);

/**
 * Counter for admin redrive operations that were rejected.
 * Labels: reason (SIZE | INVALID | UPGRADE_FAILED | NOT_FOUND | DEPTH_EXCEEDED | POISON_FLAGGED | POISON_ENTRY | DEPTH_CHECK_FAILED | RATE_LIMITED | RATE_LIMIT_CHECK_FAILED)
 * 
 * Phase 11.3 additions: DEPTH_EXCEEDED, POISON_FLAGGED, POISON_ENTRY, DEPTH_CHECK_FAILED
 * Phase 11.4 additions: RATE_LIMITED, RATE_LIMIT_CHECK_FAILED
 * NOTE: reason set is FIXED - do not add new values without ADR update.
 */
export const redriveRejectedMetric = new SimpleCounter(
  'carrier_redrive_rejected_total',
  'Admin redrive operations rejected',
  ['reason'],
);

// ============================================================================
// INBOUND VALIDATION METRICS (Phase 11.1)
// ============================================================================

/**
 * Counter for inbound carrier validation results.
 * Labels:
 *   outcome: 'accepted' | 'degraded'
 *   reason:  CarrierDropReasonV2 values (only when outcome=degraded)
 * 
 * Max cardinality: 14 (2 outcomes × 7 reason values including '' for accepted)
 * 
 * FIXED ENUM — do not add label values without ADR update.
 */
export const carrierInboundMetric = new SimpleCounter(
  'carrier_inbound_total',
  'Inbound carrier validation results at worker boundary',
  ['outcome', 'reason'],
);

// ============================================================================
// DLQ CARRIER STORAGE METRICS (Phase 11.2)
// ============================================================================

/**
 * Counter for carriers prepared for DLQ storage.
 * Incremented every time prepareCarrierForDlqStorage() is called
 * and a DLQ upsert is performed.
 */
export const dlqStorageMetric = new SimpleCounter(
  'carrier_dlq_storage_total',
  'Carriers stored in DLQ entries',
  [],
);

/**
 * Counter for carriers truncated during DLQ storage.
 * Incremented when carrier_truncated=true.
 */
export const dlqStorageTruncatedMetric = new SimpleCounter(
  'carrier_dlq_storage_truncated_total',
  'Carriers truncated during DLQ storage',
  [],
);

// ============================================================================
// REDRIVE DEPTH METRICS (Phase 11.3)
// ============================================================================

/**
 * Simple in-memory histogram for depth distribution.
 * Buckets: [0, 1, 2, 3, 4, 5]
 */
class SimpleHistogram {
  private bucketCounts = new Map<number, number>();
  
  constructor(
    readonly name: string,
    readonly help: string,
    readonly buckets: number[],
  ) {
    for (const b of buckets) this.bucketCounts.set(b, 0);
  }
  
  observe(value: number): void {
    // Increment the bucket that value falls into (le semantics)
    for (const b of this.buckets) {
      if (value <= b) {
        this.bucketCounts.set(b, (this.bucketCounts.get(b) ?? 0) + 1);
      }
    }
  }
  
  /** Get bucket count for testing */
  getBucketCount(bucket: number): number {
    return this.bucketCounts.get(bucket) ?? 0;
  }
  
  /** Reset for testing */
  reset(): void {
    for (const b of this.buckets) this.bucketCounts.set(b, 0);
  }

  /** Export as Prometheus exposition lines (cumulative le buckets). */
  toPrometheusLines(): string[] {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} histogram`);

    // Cumulative bucket counts (le semantics — already cumulative in observe())
    let sum = 0;
    let count = 0;
    for (const b of this.buckets) {
      const c = this.bucketCounts.get(b) ?? 0;
      lines.push(`${this.name}_bucket{le="${b}"} ${c}`);
      // Track max bucket count as total count (+Inf)
      if (c > count) count = c;
    }
    // +Inf bucket = largest cumulative count
    lines.push(`${this.name}_bucket{le="+Inf"} ${count}`);
    // sum/count: we don't track sum in SimpleHistogram, emit 0
    lines.push(`${this.name}_sum 0`);
    lines.push(`${this.name}_count ${count}`);
    return lines;
  }
}

/**
 * Histogram for redrive chain depth distribution.
 * Buckets: [0, 1, 2, 3, 4, 5] — bounded, no cardinality explosion.
 */
export const redriveDepthHistogram = new SimpleHistogram(
  'carrier_redrive_depth_total',
  'Redrive chain depth distribution',
  [0, 1, 2, 3, 4, 5],
);

// ============================================================================
// GAUGE METRIC CLASS (Phase 12)
// ============================================================================

/**
 * Simple in-memory gauge for metrics.
 * Represents a single numerical value that can go up and down.
 * In production, replace with actual Prometheus gauge.
 */
class SimpleGauge {
  private value = 0;

  constructor(
    readonly name: string,
    readonly help: string,
  ) {}

  set(value: number): void {
    this.value = value;
  }

  get(): number {
    return this.value;
  }

  /** Reset for testing */
  reset(): void {
    this.value = 0;
  }

  /** Export as Prometheus exposition lines. */
  toPrometheusLines(): string[] {
    return [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} gauge`,
      `${this.name} ${this.value}`,
    ];
  }
}

// ============================================================================
// REDRIVE RATE LIMIT METRICS (Phase 11.4)
// ============================================================================

/**
 * Counter for rate-limited redrive rejections, split by gate.
 * Labels: gate ('precheck' | 'tx')
 *
 * - precheck: controller checkRateLimit() rejected (fast, no DB lock)
 * - tx: atomicRedrive tx cooldown guard rejected (authoritative, FOR UPDATE)
 *
 * FIXED ENUM — gate values: { precheck, tx }. Do not add new values.
 * Cardinality: 2.
 *
 * Phase 11.4: Redrive Rate Limiting
 */
export const redriveRateLimitedMetric = new SimpleCounter(
  'carrier_redrive_rate_limited_total',
  'Redrive attempts rejected by rate limiter, by gate',
  ['gate'],
);

/**
 * Counter for rate limit pre-check fail-closed events.
 * No labels (simple counter).
 *
 * Normal operation: 0. Any increment → immediate investigation.
 * Signals: rate limiter bug, data corruption, or unexpected error in checkRateLimit.
 *
 * Phase 11.4: Redrive Rate Limiting
 */
export const redriveRateCheckFailedMetric = new SimpleCounter(
  'carrier_redrive_rate_check_failed_total',
  'Rate limit pre-check fail-closed events',
  [],
);

/**
 * Histogram for computed backoff delay distribution (seconds).
 * Measures: backoff policy output = (backoffMs + jitterMs) / 1000.
 * Emitted after successful atomicRedrive only.
 *
 * Prometheus export produces _bucket, _sum, _count suffixes automatically.
 *
 * Buckets aligned with backoff table: 30s, 60s, 120s, 300s, 600s, 1800s, 3600s.
 *
 * Phase 11.4: Redrive Rate Limiting
 */
export const redriveBackoffHistogram = new SimpleHistogram(
  'carrier_redrive_backoff_seconds',
  'Distribution of computed backoff delay in seconds',
  [30, 60, 120, 300, 600, 1800, 3600],
);

/**
 * Counter for backoff applications by redrive count bucket.
 * Labels: count_bucket ('0' | '1' | '2' | '3-4' | '5-9' | '10+')
 *
 * FIXED ENUM — 6 values, closed set. Do not add new values.
 * Cardinality: 6.
 *
 * Phase 11.4: Redrive Rate Limiting
 */
export const redriveBackoffAppliedMetric = new SimpleCounter(
  'carrier_redrive_backoff_applied_total',
  'Backoff applications by redrive count bucket',
  ['count_bucket'],
);

/**
 * Map redriveCount to a fixed bucket label.
 * LOCKED: 6 values — { '0', '1', '2', '3-4', '5-9', '10+' }.
 */
export function redriveCountBucket(count: number): string {
  if (count <= 2) return String(count);
  if (count <= 4) return '3-4';
  if (count <= 9) return '5-9';
  return '10+';
}

// ============================================================================
// REDRIVE OPERATIONAL SAFEGUARDS METRICS (Phase 12)
// ============================================================================

/**
 * Histogram for atomicRedrive transaction duration (seconds).
 * Measures: tx begin → commit/rollback (Date.now() delta).
 * Labels: none (outcome ayrımı mevcut counter'lardan cross-query ile yapılır).
 * Emitted on EVERY atomicRedrive call — success, reject, error.
 *
 * Buckets: standard HTTP latency buckets (seconds).
 *
 * Phase 12: Redrive Operational Safeguards
 */
export const redriveTxDurationHistogram = new SimpleHistogram(
  'carrier_redrive_tx_duration_seconds',
  'atomicRedrive transaction duration in seconds',
  [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
);

/**
 * Gauge for kill-switch state (0 = off, 1 = on).
 * Labels: none.
 * Set at application startup (onModuleInit) based on REDRIVE_DISABLED env var.
 * Runtime'da her request'te güncellenmez — statik flag.
 *
 * Phase 12: Redrive Operational Safeguards
 */
export const redriveKillSwitchGauge = new SimpleGauge(
  'carrier_redrive_kill_switch_active',
  'Redrive kill-switch state (0=off, 1=on)',
);

/**
 * Counter for redrive requests rejected by kill-switch (503).
 * Labels: none.
 *
 * Phase 12: Redrive Operational Safeguards
 */
export const redriveDisabledMetric = new SimpleCounter(
  'carrier_redrive_disabled_total',
  'Redrive requests rejected by kill-switch',
  [],
);

// ============================================================================
// PROMETHEUS EXPORT HELPERS
// ============================================================================

/**
 * Escape label value for Prometheus exposition format.
 * Rules: \ → \\, " → \", newline → \n
 */
function escapeLabel(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

// ============================================================================
// PROMETHEUS EXPORT (Aggregator)
// ============================================================================

/** All carrier-lifecycle metric instances for export. */
const ALL_COUNTERS: SimpleCounter[] = [
  retryMutationMetric,
  dlqEnrichmentMetric,
  redriveCloneMetric,
  sizeEnforcementMetric,
  redriveClonedMetric,
  redriveRejectedMetric,
  carrierInboundMetric,
  dlqStorageMetric,
  dlqStorageTruncatedMetric,
  redriveRateLimitedMetric,
  redriveRateCheckFailedMetric,
  redriveBackoffAppliedMetric,
  redriveDisabledMetric,
];

const ALL_HISTOGRAMS: SimpleHistogram[] = [
  redriveDepthHistogram,
  redriveBackoffHistogram,
  redriveTxDurationHistogram,
];

const ALL_GAUGES: SimpleGauge[] = [
  redriveKillSwitchGauge,
];

/**
 * Export all carrier-lifecycle metrics in Prometheus exposition format.
 * Deterministic output: counters → histograms → gauges, stable label order.
 */
export function toPrometheusText(): string {
  const sections: string[] = [];

  for (const c of ALL_COUNTERS) {
    sections.push(c.toPrometheusLines().join('\n'));
  }
  for (const h of ALL_HISTOGRAMS) {
    sections.push(h.toPrometheusLines().join('\n'));
  }
  for (const g of ALL_GAUGES) {
    sections.push(g.toPrometheusLines().join('\n'));
  }

  return sections.join('\n');
}

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Reset all metrics (for testing).
 */
export function resetAllMetrics(): void {
  retryMutationMetric.reset();
  dlqEnrichmentMetric.reset();
  redriveCloneMetric.reset();
  sizeEnforcementMetric.reset();
  redriveClonedMetric.reset();
  redriveRejectedMetric.reset();
  carrierInboundMetric.reset();
  dlqStorageMetric.reset();
  dlqStorageTruncatedMetric.reset();
  redriveDepthHistogram.reset();
  // Phase 11.4 rate limit metrics
  redriveRateLimitedMetric.reset();
  redriveRateCheckFailedMetric.reset();
  redriveBackoffHistogram.reset();
  redriveBackoffAppliedMetric.reset();
  // Phase 12 operational safeguards metrics
  redriveTxDurationHistogram.reset();
  redriveKillSwitchGauge.reset();
  redriveDisabledMetric.reset();
}
