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
 * Labels: reason (SIZE | INVALID | UPGRADE_FAILED | NOT_FOUND)
 * 
 * NOTE: reason set is FIXED - do not add new values without ADR update.
 */
export const redriveRejectedMetric = new SimpleCounter(
  'carrier_redrive_rejected_total',
  'Admin redrive operations rejected',
  ['reason'],
);

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
}
