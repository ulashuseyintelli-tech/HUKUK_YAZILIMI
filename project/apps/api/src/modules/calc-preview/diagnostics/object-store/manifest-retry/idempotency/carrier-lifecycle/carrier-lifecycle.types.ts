/**
 * Carrier Lifecycle Types - Phase 10.5
 * 
 * Extended carrier types for cross-queue consistency.
 * Defines carrier behavior across Retry, DLQ, and Redrive paths.
 * 
 * VERSION HISTORY:
 * - V1: Phase 10.4 - Basic carrier (requestId, actionId, etc.)
 * - V2: Phase 10.5 - Lifecycle tracking (retry, DLQ, redrive)
 * 
 * RULES:
 * - V1 carriers auto-upgrade to V2 via explicit converter
 * - attemptNumber starts at 0 (first attempt = 0)
 * - Redrive creates NEW correlationId (linked via parentCorrelationId)
 * - Size limit: 4KB max, reject by default
 * 
 * @see ADR-008 v1.3: Queue/Job Boundary Context Propagation
 */

import { IdempotencyContextCarrier } from '../idempotency-carrier.types';

// ============================================================================
// CARRIER V2 TYPES
// ============================================================================

/**
 * Extended carrier schema v2 with lifecycle tracking.
 * 
 * Extends V1 carrier with:
 * - Retry tracking (attemptNumber, failureHistory)
 * - DLQ tracking (dlqReason, movedToDlqAt)
 * - Redrive tracking (parentCorrelationId, redriveSource)
 */
export interface IdempotencyContextCarrierV2 extends Omit<IdempotencyContextCarrier, 'version'> {
  /** Schema version. Always 2 for V2 carriers. */
  readonly version: 2;
  
  // -------------------------------------------------------------------------
  // RETRY TRACKING
  // -------------------------------------------------------------------------
  
  /**
   * Current attempt number (0-indexed).
   * - First attempt: 0
   * - After first retry: 1
   * - After second retry: 2
   */
  readonly attemptNumber: number;
  
  /**
   * ISO timestamp of last failure.
   * Set when job fails and is scheduled for retry.
   */
  readonly lastFailedAt?: string;
  
  /**
   * History of failures (capped at MAX_FAILURE_HISTORY_SIZE).
   * Oldest entries are dropped when cap is reached.
   */
  readonly failureHistory?: readonly FailureEntry[];
  
  // -------------------------------------------------------------------------
  // DLQ TRACKING
  // -------------------------------------------------------------------------
  
  /**
   * Reason job was moved to DLQ.
   * - EXHAUSTED: All retries exhausted
   * - POISON: Job marked as poison (unprocessable)
   * - MANUAL: Operator manually moved to DLQ
   */
  readonly dlqReason?: DlqReason;
  
  /**
   * ISO timestamp when job was moved to DLQ.
   */
  readonly movedToDlqAt?: string;
  
  /**
   * Final attempt number when moved to DLQ.
   * Preserved for audit trail.
   */
  readonly finalAttemptNumber?: number;
  
  // -------------------------------------------------------------------------
  // REDRIVE TRACKING
  // -------------------------------------------------------------------------
  
  /**
   * Correlation ID of parent carrier (for redriven jobs).
   * Links redriven job to original DLQ entry.
   * IMMUTABLE once set.
   */
  readonly parentCorrelationId?: string;
  
  /**
   * Source DLQ queue name (for redriven jobs).
   */
  readonly redriveSource?: string;
  
  /**
   * ISO timestamp when job was redriven.
   */
  readonly redrivenAt?: string;
  
  /**
   * Operator ID who triggered redrive.
   */
  readonly redrivenBy?: string;
}

// ============================================================================
// FAILURE ENTRY
// ============================================================================

/**
 * Single failure entry in failure history.
 * Truncated to fit within carrier size limits.
 */
export interface FailureEntry {
  /** ISO timestamp of failure */
  readonly timestamp: string;
  
  /** Error code/name (e.g., 'ECONNREFUSED', 'TimeoutError') */
  readonly errorCode: string;
  
  /** Error message (truncated to MAX_ERROR_MESSAGE_LENGTH) */
  readonly errorMessage: string;
}

// ============================================================================
// DLQ REASON
// ============================================================================

/**
 * Reason for moving job to DLQ.
 */
export type DlqReason = 
  | 'EXHAUSTED'  // All retries exhausted
  | 'POISON'     // Job marked as unprocessable
  | 'MANUAL';    // Operator manually moved

// ============================================================================
// SIZE LIMIT TYPES
// ============================================================================

/**
 * Result of carrier size limit enforcement.
 */
export interface CarrierSizeLimitResult {
  /** Processed carrier (possibly truncated) */
  readonly carrier: IdempotencyContextCarrierV2;
  
  /** Action taken */
  readonly action: CarrierSizeLimitAction;
  
  /** Original size in bytes */
  readonly originalSizeBytes: number;
  
  /** Final size in bytes */
  readonly finalSizeBytes: number;
}

/**
 * Action taken during size limit enforcement.
 */
export type CarrierSizeLimitAction =
  | 'OK'        // Within limit, no action needed
  | 'TRUNCATED' // Truncated allowlist fields (failureHistory)
  | 'REJECTED'; // Cannot fit even after truncation

/**
 * Error thrown when carrier exceeds size limit and cannot be truncated.
 */
export class CarrierSizeExceededError extends Error {
  override readonly name = 'CarrierSizeExceededError';
  
  constructor(
    readonly originalSizeBytes: number,
    readonly maxSizeBytes: number,
  ) {
    super(
      `Carrier size ${originalSizeBytes} bytes exceeds maximum ${maxSizeBytes} bytes ` +
      `and cannot be truncated further`
    );
  }
}

// ============================================================================
// JOB FAILURE INPUT
// ============================================================================

/**
 * Input for recording a job failure.
 */
export interface JobFailureInput {
  /** Error code/name */
  readonly code: string;
  
  /** Error message */
  readonly message: string;
}

// ============================================================================
// REDRIVE CONTEXT
// ============================================================================

/**
 * Context for redrive operation.
 */
export interface RedriveContext {
  /** Source DLQ queue name */
  readonly dlqName: string;
  
  /** Operator ID triggering redrive */
  readonly operatorId: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Current V2 carrier schema version.
 */
export const CARRIER_VERSION_V2 = 2 as const;

/**
 * Maximum carrier size in bytes.
 * Carriers exceeding this limit are rejected by default.
 */
export const MAX_CARRIER_SIZE_BYTES = 4096;

/**
 * Maximum number of failure entries in history.
 * Oldest entries are dropped when cap is reached.
 */
export const MAX_FAILURE_HISTORY_SIZE = 10;

/**
 * Maximum error message length in failure entry.
 * Messages exceeding this are truncated.
 */
export const MAX_ERROR_MESSAGE_LENGTH = 200;

/**
 * Minimum failure history entries to keep during truncation.
 * When truncating for size, keep at least this many entries.
 */
export const MIN_FAILURE_HISTORY_SIZE = 3;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for V1 carrier.
 */
export function isCarrierV1(carrier: unknown): carrier is IdempotencyContextCarrier {
  return (
    typeof carrier === 'object' &&
    carrier !== null &&
    'version' in carrier &&
    (carrier as { version: unknown }).version === 1
  );
}

/**
 * Type guard for V2 carrier.
 */
export function isCarrierV2(carrier: unknown): carrier is IdempotencyContextCarrierV2 {
  return (
    typeof carrier === 'object' &&
    carrier !== null &&
    'version' in carrier &&
    (carrier as { version: unknown }).version === 2
  );
}

/**
 * Type guard for any valid carrier (V1 or V2).
 */
export function isValidCarrier(
  carrier: unknown
): carrier is IdempotencyContextCarrier | IdempotencyContextCarrierV2 {
  return isCarrierV1(carrier) || isCarrierV2(carrier);
}
