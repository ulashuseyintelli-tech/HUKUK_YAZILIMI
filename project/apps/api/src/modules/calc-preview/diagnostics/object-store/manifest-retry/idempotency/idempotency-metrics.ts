/**
 * Idempotency Gate Metrics
 * 
 * Phase 10.3 - PR-5
 * 
 * Metrics for idempotency gate observability.
 * 
 * KEY METRICS:
 * - idempotency_action_total: Actions by type and outcome
 * - idempotency_takeover_total: Lease takeovers by action type
 * - idempotency_lease_expired_total: Expired leases (potential issues)
 * - idempotency_gate_latency_seconds: Gate operation latency
 */

// ============================================================================
// Metrics State
// ============================================================================

// Action counters by {actionType, outcome}
const actionCounters: Map<string, number> = new Map();

// Takeover counters by {actionType}
const takeoverCounters: Map<string, number> = new Map();

// Lease expired counter
let leaseExpiredTotal = 0;

// Gate latency histogram
const latencyBuckets = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1];
let latencyHistogram = {
  buckets: new Array(latencyBuckets.length).fill(0),
  sum: 0,
  count: 0,
};

// Gate result counters by type
let proceedTotal = 0;
let cachedTotal = 0;
let inProgressTotal = 0;

// ============================================================================
// Metric Setters
// ============================================================================

/**
 * Record an action completion.
 */
export function recordAction(actionType: string, outcome: 'SUCCESS' | 'FAILED' | 'TAKEOVER'): void {
  const key = `${actionType}:${outcome}`;
  actionCounters.set(key, (actionCounters.get(key) ?? 0) + 1);
}

/**
 * Record a takeover event.
 */
export function recordTakeover(actionType: string): void {
  takeoverCounters.set(actionType, (takeoverCounters.get(actionType) ?? 0) + 1);
}

/**
 * Record a lease expiration (detected during takeover).
 */
export function recordLeaseExpired(): void {
  leaseExpiredTotal++;
}

/**
 * Record gate operation latency.
 */
export function recordGateLatency(durationMs: number): void {
  const durationSeconds = durationMs / 1000;
  latencyHistogram.sum += durationSeconds;
  latencyHistogram.count++;
  
  for (let i = 0; i < latencyBuckets.length; i++) {
    if (durationSeconds <= latencyBuckets[i]) {
      latencyHistogram.buckets[i]++;
    }
  }
}

/**
 * Record gate result type.
 */
export function recordGateResult(type: 'PROCEED' | 'CACHED' | 'IN_PROGRESS'): void {
  switch (type) {
    case 'PROCEED':
      proceedTotal++;
      break;
    case 'CACHED':
      cachedTotal++;
      break;
    case 'IN_PROGRESS':
      inProgressTotal++;
      break;
  }
}

// ============================================================================
// Metric Getters
// ============================================================================

export function getActionCount(actionType: string, outcome: string): number {
  return actionCounters.get(`${actionType}:${outcome}`) ?? 0;
}

export function getTakeoverCount(actionType: string): number {
  return takeoverCounters.get(actionType) ?? 0;
}

export function getTotalTakeovers(): number {
  let total = 0;
  for (const count of takeoverCounters.values()) {
    total += count;
  }
  return total;
}

export function getLeaseExpiredTotal(): number {
  return leaseExpiredTotal;
}

export function getProceedTotal(): number {
  return proceedTotal;
}

export function getCachedTotal(): number {
  return cachedTotal;
}

export function getInProgressTotal(): number {
  return inProgressTotal;
}

// ============================================================================
// Prometheus Export
// ============================================================================

export function toPrometheusText(): string {
  const lines: string[] = [];

  // Action counters
  lines.push('# HELP idempotency_action_total Total idempotency actions by type and outcome');
  lines.push('# TYPE idempotency_action_total counter');
  for (const [key, count] of actionCounters.entries()) {
    const [actionType, outcome] = key.split(':');
    lines.push(`idempotency_action_total{action_type="${actionType}",outcome="${outcome}"} ${count}`);
  }

  // Takeover counters
  lines.push('# HELP idempotency_takeover_total Total lease takeovers by action type');
  lines.push('# TYPE idempotency_takeover_total counter');
  for (const [actionType, count] of takeoverCounters.entries()) {
    lines.push(`idempotency_takeover_total{action_type="${actionType}"} ${count}`);
  }

  // Lease expired
  lines.push('# HELP idempotency_lease_expired_total Total expired leases detected');
  lines.push('# TYPE idempotency_lease_expired_total counter');
  lines.push(`idempotency_lease_expired_total ${leaseExpiredTotal}`);

  // Gate result counters
  lines.push('# HELP idempotency_gate_result_total Total gate results by type');
  lines.push('# TYPE idempotency_gate_result_total counter');
  lines.push(`idempotency_gate_result_total{type="PROCEED"} ${proceedTotal}`);
  lines.push(`idempotency_gate_result_total{type="CACHED"} ${cachedTotal}`);
  lines.push(`idempotency_gate_result_total{type="IN_PROGRESS"} ${inProgressTotal}`);

  // Gate latency histogram
  lines.push('# HELP idempotency_gate_latency_seconds Gate operation latency');
  lines.push('# TYPE idempotency_gate_latency_seconds histogram');
  for (let i = 0; i < latencyBuckets.length; i++) {
    lines.push(`idempotency_gate_latency_seconds_bucket{le="${latencyBuckets[i]}"} ${latencyHistogram.buckets[i]}`);
  }
  lines.push(`idempotency_gate_latency_seconds_bucket{le="+Inf"} ${latencyHistogram.count}`);
  lines.push(`idempotency_gate_latency_seconds_sum ${latencyHistogram.sum}`);
  lines.push(`idempotency_gate_latency_seconds_count ${latencyHistogram.count}`);

  return lines.join('\n');
}

// ============================================================================
// Reset (for testing)
// ============================================================================

export function reset(): void {
  actionCounters.clear();
  takeoverCounters.clear();
  leaseExpiredTotal = 0;
  proceedTotal = 0;
  cachedTotal = 0;
  inProgressTotal = 0;
  latencyHistogram = {
    buckets: new Array(latencyBuckets.length).fill(0),
    sum: 0,
    count: 0,
  };
}
