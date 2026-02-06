/**
 * Carrier Metrics
 * 
 * Phase 10.4 - PR-10.4.2 (P1)
 * 
 * Prometheus metrics for queue context propagation.
 * Tracks degraded correlation events when carrier validation fails.
 * 
 * @see ADR-008: Queue/Job Boundary Context Propagation
 */

import { Counter } from 'prom-client';
import { CarrierDropReason } from './idempotency-carrier.types';

/**
 * Metric label for missing carrier (null/undefined at consumer).
 * Different from MALFORMED which is a non-object value.
 */
export const REASON_MISSING = 'MISSING' as const;

/**
 * All possible metric reasons (drop reasons + MISSING).
 */
export type MetricReason = CarrierDropReason | typeof REASON_MISSING;

/**
 * Counter for degraded correlation events.
 * 
 * Incremented when a job runs without idempotency context due to:
 * - Missing carrier (MISSING)
 * - Invalid carrier (MALFORMED, VERSION_MISMATCH, MISSING_REQUIRED, TYPE_ERROR)
 * 
 * Labels:
 * - reason: MISSING | MALFORMED | VERSION_MISMATCH | MISSING_REQUIRED | TYPE_ERROR
 */
export const auditDegradedCorrelationTotal = new Counter({
  name: 'audit_degraded_correlation_total',
  help: 'Total count of jobs running without idempotency context (degraded correlation)',
  labelNames: ['reason'] as const,
});

/**
 * Record a degraded correlation event.
 * 
 * @param reason - Why the carrier was dropped or missing
 */
export function recordDegradedCorrelation(reason: MetricReason): void {
  auditDegradedCorrelationTotal.inc({ reason });
}

/**
 * Counter for successful context restoration.
 * 
 * Incremented when a job successfully restores ALS context from carrier.
 */
export const jobContextRestoredTotal = new Counter({
  name: 'job_context_restored_total',
  help: 'Total count of jobs that successfully restored idempotency context',
});

/**
 * Record a successful context restoration.
 */
export function recordContextRestored(): void {
  jobContextRestoredTotal.inc();
}
