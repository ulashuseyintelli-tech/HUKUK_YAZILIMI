/**
 * Manifest Retry Types
 * 
 * Phase 10 - Task 10.1.2/10.1.3/10.1.4
 * 
 * Type definitions for retry queue and DLQ.
 * 
 * LOCKED CONTRACT - State machine transitions are enforced.
 * 
 * @see .kiro/specs/phase-10-retry-signature/design.md
 */

import { ManifestErrorCode } from './manifest-error-classifier';

// ============================================================================
// Retry Queue Types
// ============================================================================

/**
 * Retry queue status values
 * 
 * State Machine:
 * PENDING → IN_PROGRESS
 * RETRY_SCHEDULED → IN_PROGRESS
 * IN_PROGRESS → RETRY_SCHEDULED (retryable error)
 * IN_PROGRESS → DONE (success or DONE_NOOP)
 * IN_PROGRESS → DONE + DLQ insert (non-retryable or max attempts)
 */
export type RetryQueueStatus = 
  | 'PENDING'           // New job, waiting for first attempt
  | 'IN_PROGRESS'       // Claimed by worker, lease active
  | 'RETRY_SCHEDULED'   // Failed with transient error, waiting for next attempt
  | 'DONE';             // Completed (success, DONE_NOOP, or moved to DLQ)

/**
 * Reason for job completion
 */
export type DoneReason = 
  | 'OK'        // Manifest written successfully
  | 'DONE_NOOP' // Object already exists (idempotent success)
  | 'DLQ';      // Moved to dead-letter queue

/**
 * Source of the retry job
 */
export type RetrySource = 
  | 'post_seal_hook'  // Automatic enqueue after seal
  | 'admin_retry';    // Manual admin retry

/**
 * Retry queue job entity
 */
export interface RetryQueueJob {
  id: string;
  bundleId: string;
  status: RetryQueueStatus;
  attempt: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  leasedUntil: Date | null;
  leasedBy: string | null;
  lastErrorCode: ManifestErrorCode | null;
  lastErrorMessage: string | null;
  doneReason: DoneReason | null;
  source: RetrySource;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new retry job
 */
export interface CreateRetryJobInput {
  bundleId: string;
  source: RetrySource;
  errorCode?: ManifestErrorCode;
  errorMessage?: string;
}

/**
 * Result of enqueue operation
 */
export interface EnqueueResult {
  enqueued: boolean;
  jobId?: string | undefined;
  reason?: 'CREATED' | 'ALREADY_QUEUED' | 'MANIFEST_EXISTS' | undefined;
  existingJobId?: string | undefined;
  nextAttemptAt?: Date | undefined;
}

/**
 * Result of claim operation
 */
export interface ClaimResult {
  claimed: boolean;
  job?: RetryQueueJob;
  reason?: 'NO_JOBS_AVAILABLE' | 'CLAIMED';
}

/**
 * Input for scheduling retry
 */
export interface ScheduleRetryInput {
  jobId: string;
  errorCode: ManifestErrorCode;
  errorMessage?: string;
  nextAttemptAt: Date;
}

/**
 * Input for marking job as done
 */
export interface MarkDoneInput {
  jobId: string;
  reason: DoneReason;
}

// ============================================================================
// Dead Letter Queue Types
// ============================================================================

/**
 * DLQ status values
 * 
 * State Machine:
 * DLQ_OPEN → DLQ_RESOLVED (admin resolve)
 * DLQ_OPEN → DLQ_REDROVE (admin redrive)
 */
export type DlqStatus = 
  | 'DLQ_OPEN'      // Unresolved failure
  | 'DLQ_RESOLVED'  // Manually resolved
  | 'DLQ_REDROVE';  // Re-driven to retry queue

/**
 * DLQ entry entity
 */
export interface DlqEntry {
  id: string;
  bundleId: string;
  attempt: number;
  finalErrorCode: ManifestErrorCode;
  finalErrorMessage: string | null;
  firstFailedAt: Date;
  lastFailedAt: Date;
  status: DlqStatus;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  // Phase 10.2 - Redrive tracking
  redrivenAt: Date | null;
  redrivenBy: string | null;
  createdAt: Date;
  // Phase 11.0 - Carrier storage
  carrierJson: string | null;
  carrierVersion: number | null;
  carrierTruncated: boolean;
}

/**
 * Input for creating DLQ entry
 */
export interface CreateDlqEntryInput {
  bundleId: string;
  attempt: number;
  errorCode: ManifestErrorCode;
  errorMessage?: string;
  firstFailedAt: Date;
  lastFailedAt: Date;
  // Phase 11.0 - Carrier storage (optional for backward compatibility)
  carrierJson?: string | null;
  carrierVersion?: number | null;
  carrierTruncated?: boolean;
}

/**
 * Input for resolving DLQ entry
 */
export interface ResolveDlqInput {
  dlqId: string;
  resolvedBy: string;
  resolutionNote?: string;
}

/**
 * Result of redrive operation
 */
export interface RedriveResult {
  redriven: boolean;
  dlqId: string;
  bundleId: string;
  newJobId?: string;
  reason?: 'REDRIVEN' | 'ALREADY_RESOLVED' | 'ALREADY_QUEUED';
}

/**
 * DLQ query options
 */
export interface DlqQueryOptions {
  status?: DlqStatus;
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'last_failed_at';
  orderDir?: 'asc' | 'desc';
}

/**
 * DLQ query result
 */
export interface DlqQueryResult {
  entries: DlqEntry[];
  total: number;
  oldestAge?: number | undefined; // seconds
}

// ============================================================================
// Backoff Configuration
// ============================================================================

/**
 * Backoff configuration (LOCKED values)
 */
export const BACKOFF_CONFIG = {
  baseMs: 30_000,         // 30 seconds
  multiplier: 4,          // 4x per attempt
  maxDelayMs: 7_200_000,  // 2 hours cap
  maxAttempts: 7,         // 7 attempts then DLQ
  leaseMs: 60_000,        // 60 second lease
} as const;

/**
 * Calculate backoff delay for given attempt
 * Formula: min(base * 4^attempt, max) * jitter(0.5, 1.5)
 */
export function calculateBackoff(attempt: number): number {
  const baseDelay = Math.min(
    BACKOFF_CONFIG.baseMs * Math.pow(BACKOFF_CONFIG.multiplier, attempt),
    BACKOFF_CONFIG.maxDelayMs
  );
  // Full jitter: multiply by random factor between 0.5 and 1.5
  const jitter = 0.5 + Math.random();
  return Math.floor(baseDelay * jitter);
}

/**
 * Calculate next attempt time
 */
export function calculateNextAttemptAt(attempt: number): Date {
  const delayMs = calculateBackoff(attempt);
  return new Date(Date.now() + delayMs);
}
