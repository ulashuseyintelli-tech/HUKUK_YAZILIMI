/**
 * Retry Carrier Mutator - Phase 10.5 Task 2
 * 
 * Mutates carrier for retry path: preserve + mutate.
 * - attemptNumber++
 * - failureHistory.push(newFailure) with hard cap
 * - correlation/parentCorrelation unchanged
 * 
 * Size check is NOT done here - caller must apply limiter after mutation.
 * 
 * @see ADR-008 v1.3: Queue/Job Boundary Context Propagation
 */

import {
  IdempotencyContextCarrierV2,
  FailureEntry,
  JobFailureInput,
  MAX_FAILURE_HISTORY_SIZE,
  MAX_ERROR_MESSAGE_LENGTH,
} from './carrier-lifecycle.types';
import { ensureCarrierV2 } from './carrier-version-upgrade';
import { retryMutationMetric } from './carrier-lifecycle-metrics';

/**
 * Result of retry mutation.
 */
export interface RetryMutationResult {
  /** Mutated carrier (V2) */
  readonly carrier: IdempotencyContextCarrierV2;
  
  /** Previous attempt number (before mutation) */
  readonly previousAttemptNumber: number;
  
  /** New attempt number (after mutation) */
  readonly newAttemptNumber: number;
  
  /** Whether failure history was capped */
  readonly historyCapped: boolean;
}

/**
 * Mutate carrier for retry path.
 * 
 * BEHAVIOR:
 * - V1 carrier → auto-upgrade to V2
 * - attemptNumber incremented
 * - lastFailedAt set to current timestamp
 * - failureHistory appended (hard cap at MAX_FAILURE_HISTORY_SIZE)
 * - All other fields preserved (including correlation IDs)
 * 
 * NOTE: Size limit enforcement is NOT done here.
 * Caller must apply enforceCarrierSizeLimit() after mutation.
 * 
 * @param carrier - V1 or V2 carrier
 * @param failure - Failure information to record
 * @param now - Optional timestamp (for testing)
 * @returns Mutation result with V2 carrier
 */
export function mutateCarrierForRetry(
  carrier: unknown,
  failure: JobFailureInput,
  now: Date = new Date(),
): RetryMutationResult {
  // Ensure V2 (auto-upgrade V1)
  const v2 = ensureCarrierV2(carrier);
  
  const previousAttemptNumber = v2.attemptNumber;
  const newAttemptNumber = previousAttemptNumber + 1;
  
  // Build failure entry
  const failureEntry = buildFailureEntry(failure, now);
  
  // Append to history with hard cap
  const { history, capped } = appendFailureWithCap(
    v2.failureHistory,
    failureEntry,
  );
  
  // Build mutated carrier
  const mutated: IdempotencyContextCarrierV2 = {
    ...v2,
    attemptNumber: newAttemptNumber,
    lastFailedAt: now.toISOString(),
    failureHistory: history,
  };
  
  // Record metric (path label only - no attempt_number to avoid cardinality explosion)
  retryMutationMetric.inc({ path: 'retry' });
  
  return {
    carrier: mutated,
    previousAttemptNumber,
    newAttemptNumber,
    historyCapped: capped,
  };
}

/**
 * Build a failure entry from input.
 */
function buildFailureEntry(
  failure: JobFailureInput,
  now: Date,
): FailureEntry {
  return {
    timestamp: now.toISOString(),
    errorCode: failure.code || 'UNKNOWN',
    errorMessage: truncateMessage(failure.message),
  };
}

/**
 * Truncate error message to max length.
 */
function truncateMessage(message: string | undefined | null): string {
  if (!message) {
    return '';
  }
  
  if (message.length <= MAX_ERROR_MESSAGE_LENGTH) {
    return message;
  }
  
  // Truncate with ellipsis indicator
  return message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 3) + '...';
}

/**
 * Append failure to history with hard cap.
 * 
 * POLICY: Hard cap at MAX_FAILURE_HISTORY_SIZE.
 * When cap is reached, oldest entries are dropped (FIFO).
 */
function appendFailureWithCap(
  existingHistory: readonly FailureEntry[] | undefined,
  newEntry: FailureEntry,
): { history: readonly FailureEntry[]; capped: boolean } {
  const history = existingHistory ? [...existingHistory] : [];
  
  // Append new entry
  history.push(newEntry);
  
  // Check if cap exceeded
  if (history.length <= MAX_FAILURE_HISTORY_SIZE) {
    return { history, capped: false };
  }
  
  // Drop oldest entries (FIFO)
  const trimmed = history.slice(-MAX_FAILURE_HISTORY_SIZE);
  return { history: trimmed, capped: true };
}

/**
 * Check if carrier has failure history.
 */
export function hasFailureHistory(carrier: IdempotencyContextCarrierV2): boolean {
  return Array.isArray(carrier.failureHistory) && carrier.failureHistory.length > 0;
}

/**
 * Get failure count from carrier.
 */
export function getFailureCount(carrier: IdempotencyContextCarrierV2): number {
  return carrier.failureHistory?.length ?? 0;
}
