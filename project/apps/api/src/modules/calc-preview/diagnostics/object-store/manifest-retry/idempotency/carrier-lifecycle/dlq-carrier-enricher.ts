/**
 * DLQ Carrier Enricher - Phase 10.5 Task 3
 * 
 * Enriches carrier for DLQ path: preserve + enrich.
 * - dlqReason set (EXHAUSTED | POISON | MANUAL)
 * - movedToDlqAt set to current timestamp
 * - finalAttemptNumber preserved from current attemptNumber
 * - correlationId unchanged
 * 
 * @see ADR-008 v1.3: Queue/Job Boundary Context Propagation
 */

import {
  IdempotencyContextCarrierV2,
  DlqReason,
} from './carrier-lifecycle.types';
import { ensureCarrierV2 } from './carrier-version-upgrade';
import { dlqEnrichmentMetric } from './carrier-lifecycle-metrics';

/**
 * Result of DLQ enrichment.
 */
export interface DlqEnrichmentResult {
  /** Enriched carrier (V2) */
  readonly carrier: IdempotencyContextCarrierV2;
  
  /** DLQ reason applied */
  readonly reason: DlqReason;
  
  /** Final attempt number recorded */
  readonly finalAttemptNumber: number;
}

/**
 * Enrich carrier for DLQ path.
 * 
 * BEHAVIOR:
 * - V1 carrier → auto-upgrade to V2
 * - dlqReason set to provided reason
 * - movedToDlqAt set to current timestamp
 * - finalAttemptNumber set from current attemptNumber
 * - All other fields preserved (including correlation IDs)
 * 
 * @param carrier - V1 or V2 carrier
 * @param reason - DLQ reason (EXHAUSTED | POISON | MANUAL)
 * @param now - Optional timestamp (for testing)
 * @returns Enrichment result with V2 carrier
 */
export function enrichCarrierForDlq(
  carrier: unknown,
  reason: DlqReason,
  now: Date = new Date(),
): DlqEnrichmentResult {
  // Ensure V2 (auto-upgrade V1)
  const v2 = ensureCarrierV2(carrier);
  
  const finalAttemptNumber = v2.attemptNumber;
  
  // Build enriched carrier
  const enriched: IdempotencyContextCarrierV2 = {
    ...v2,
    dlqReason: reason,
    movedToDlqAt: now.toISOString(),
    finalAttemptNumber,
  };
  
  // Record metric
  dlqEnrichmentMetric.inc({ reason });
  
  return {
    carrier: enriched,
    reason,
    finalAttemptNumber,
  };
}

/**
 * Check if carrier is in DLQ state.
 */
export function isInDlq(carrier: IdempotencyContextCarrierV2): boolean {
  return carrier.dlqReason !== undefined && carrier.movedToDlqAt !== undefined;
}

/**
 * Get DLQ reason from carrier.
 */
export function getDlqReason(carrier: IdempotencyContextCarrierV2): DlqReason | undefined {
  return carrier.dlqReason;
}

/**
 * Get time in DLQ (milliseconds).
 * Returns undefined if not in DLQ.
 */
export function getTimeInDlq(
  carrier: IdempotencyContextCarrierV2,
  now: Date = new Date(),
): number | undefined {
  if (!carrier.movedToDlqAt) {
    return undefined;
  }
  
  const movedAt = new Date(carrier.movedToDlqAt);
  return now.getTime() - movedAt.getTime();
}
