/**
 * Worker Carrier Handler - Phase 10.5 Task 6
 * 
 * Handles carrier lifecycle operations within worker context:
 * - Inbound: validate + upgrade to V2
 * - Retry path: mutate carrier
 * - DLQ path: enrich carrier
 * - Size enforcement: reject/truncate
 * 
 * @see ADR-008 v1.3: Queue/Job Boundary Context Propagation
 */

import { Logger } from '@nestjs/common';
import {
  IdempotencyContextCarrierV2,
  CarrierSizeExceededError,
  isValidCarrier,
  isCarrierV2,
  DlqReason,
} from './carrier-lifecycle.types';
import { ensureCarrierV2 } from './carrier-version-upgrade';
import { mutateCarrierForRetry } from './retry-carrier-mutator';
import { enrichCarrierForDlq } from './dlq-carrier-enricher';
import { enforceCarrierSizeLimit } from './carrier-size-limiter';

// ============================================================================
// METRICS
// ============================================================================

/**
 * Worker carrier metrics interface.
 * Allows injection of actual Prometheus counters.
 */
export interface IWorkerCarrierMetrics {
  recordCarrierInvalid(reason: string): void;
  recordCarrierUpgraded(): void;
  recordCarrierMutated(attemptNumber: number): void;
  recordCarrierDlqEnriched(reason: DlqReason): void;
  recordCarrierSizeOk(): void;
  recordCarrierTruncated(): void;
  recordCarrierRejected(): void;
}

/**
 * Simple in-memory metrics for testing.
 */
export class SimpleWorkerCarrierMetrics implements IWorkerCarrierMetrics {
  private counts = new Map<string, number>();
  
  recordCarrierInvalid(reason: string): void {
    this.inc(`carrier_invalid_total:reason=${reason}`);
  }
  
  recordCarrierUpgraded(): void {
    this.inc('carrier_upgraded_total');
  }
  
  recordCarrierMutated(attemptNumber: number): void {
    this.inc(`carrier_mutated_total:attempt=${attemptNumber}`);
  }
  
  recordCarrierDlqEnriched(reason: DlqReason): void {
    this.inc(`carrier_dlq_enriched_total:reason=${reason}`);
  }
  
  recordCarrierSizeOk(): void {
    this.inc('carrier_size_ok_total');
  }
  
  recordCarrierTruncated(): void {
    this.inc('carrier_truncated_total');
  }
  
  recordCarrierRejected(): void {
    this.inc('carrier_rejected_total');
  }
  
  getCount(key: string): number {
    return this.counts.get(key) ?? 0;
  }
  
  reset(): void {
    this.counts.clear();
  }
  
  private inc(key: string): void {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }
}

// ============================================================================
// ERROR CODES
// ============================================================================

/**
 * Error code for carrier size exceeded.
 * Used as job failure code when carrier cannot fit.
 */
export const CARRIER_SIZE_EXCEEDED_ERROR_CODE = 'CARRIER_SIZE_EXCEEDED';

// ============================================================================
// INBOUND HANDLER
// ============================================================================

/**
 * Result of inbound carrier normalization.
 */
export interface InboundCarrierResult {
  /** Normalized V2 carrier (null if invalid/missing) */
  carrier: IdempotencyContextCarrierV2 | null;
  
  /** Whether carrier was valid */
  valid: boolean;
  
  /** Whether carrier was upgraded from V1 */
  upgraded: boolean;
  
  /** Reason for invalidity (if invalid) */
  invalidReason?: string;
}

/**
 * Normalize inbound carrier at job start.
 * 
 * BEHAVIOR:
 * - null/undefined → invalid (MISSING)
 * - Invalid structure → invalid (reason)
 * - V1 carrier → upgrade to V2
 * - V2 carrier → pass through
 * 
 * @param rawCarrier - Raw carrier from job payload
 * @param metrics - Metrics recorder
 * @param logger - Logger for warnings
 * @returns Normalization result
 */
export function normalizeInboundCarrier(
  rawCarrier: unknown,
  metrics: IWorkerCarrierMetrics,
  logger?: Logger,
): InboundCarrierResult {
  // 1. Handle null/undefined
  if (rawCarrier == null) {
    metrics.recordCarrierInvalid('MISSING');
    logger?.warn('[WorkerCarrier] No carrier provided, degraded mode');
    return { carrier: null, valid: false, upgraded: false, invalidReason: 'MISSING' };
  }
  
  // 2. Validate structure
  if (!isValidCarrier(rawCarrier)) {
    metrics.recordCarrierInvalid('INVALID_STRUCTURE');
    logger?.warn('[WorkerCarrier] Invalid carrier structure, degraded mode');
    return { carrier: null, valid: false, upgraded: false, invalidReason: 'INVALID_STRUCTURE' };
  }
  
  // 3. Check if already V2
  if (isCarrierV2(rawCarrier)) {
    return { carrier: rawCarrier, valid: true, upgraded: false };
  }
  
  // 4. Upgrade V1 to V2
  try {
    const v2 = ensureCarrierV2(rawCarrier);
    metrics.recordCarrierUpgraded();
    logger?.debug('[WorkerCarrier] Upgraded V1 carrier to V2');
    return { carrier: v2, valid: true, upgraded: true };
  } catch (error) {
    metrics.recordCarrierInvalid('UPGRADE_FAILED');
    logger?.warn('[WorkerCarrier] Failed to upgrade carrier, degraded mode');
    return { carrier: null, valid: false, upgraded: false, invalidReason: 'UPGRADE_FAILED' };
  }
}

// ============================================================================
// RETRY PATH HANDLER
// ============================================================================

/**
 * Result of retry path carrier mutation.
 */
export interface RetryCarrierResult {
  /** Mutated carrier (after size enforcement) */
  carrier: IdempotencyContextCarrierV2;
  
  /** New attempt number */
  attemptNumber: number;
  
  /** Whether size limit was applied */
  sizeAction: 'OK' | 'TRUNCATED';
}

/**
 * Error thrown when carrier size exceeded and cannot be truncated.
 */
export class WorkerCarrierSizeExceededError extends Error {
  override readonly name = 'WorkerCarrierSizeExceededError';
  readonly code = CARRIER_SIZE_EXCEEDED_ERROR_CODE;
  
  constructor(
    readonly originalSizeBytes: number,
    readonly maxSizeBytes: number,
  ) {
    super(
      `Carrier size ${originalSizeBytes} bytes exceeds maximum ${maxSizeBytes} bytes`
    );
  }
}

/**
 * Mutate carrier for retry path.
 * 
 * BEHAVIOR:
 * - Increment attemptNumber
 * - Append failure to history
 * - Enforce size limit (truncate if needed)
 * - Throw WorkerCarrierSizeExceededError if cannot fit
 * 
 * @param carrier - Current V2 carrier
 * @param failure - Failure information
 * @param metrics - Metrics recorder
 * @returns Mutation result
 * @throws WorkerCarrierSizeExceededError if carrier too large
 */
export function handleRetryCarrier(
  carrier: IdempotencyContextCarrierV2,
  failure: { code: string; message: string },
  metrics: IWorkerCarrierMetrics,
): RetryCarrierResult {
  // 1. Mutate carrier
  const mutationResult = mutateCarrierForRetry(carrier, failure);
  metrics.recordCarrierMutated(mutationResult.newAttemptNumber);
  
  // 2. Enforce size limit
  try {
    const sizeResult = enforceCarrierSizeLimit(mutationResult.carrier);
    
    if (sizeResult.action === 'OK') {
      metrics.recordCarrierSizeOk();
    } else if (sizeResult.action === 'TRUNCATED') {
      metrics.recordCarrierTruncated();
    }
    
    return {
      carrier: sizeResult.carrier,
      attemptNumber: mutationResult.newAttemptNumber,
      sizeAction: sizeResult.action as 'OK' | 'TRUNCATED',
    };
  } catch (error) {
    if (error instanceof CarrierSizeExceededError) {
      metrics.recordCarrierRejected();
      throw new WorkerCarrierSizeExceededError(
        error.originalSizeBytes,
        error.maxSizeBytes,
      );
    }
    throw error;
  }
}

// ============================================================================
// DLQ PATH HANDLER
// ============================================================================

/**
 * Result of DLQ path carrier enrichment.
 */
export interface DlqCarrierResult {
  /** Enriched carrier (after size enforcement) */
  carrier: IdempotencyContextCarrierV2;
  
  /** DLQ reason */
  reason: DlqReason;
  
  /** Final attempt number */
  finalAttemptNumber: number;
  
  /** Whether size limit was applied */
  sizeAction: 'OK' | 'TRUNCATED';
}

/**
 * Enrich carrier for DLQ path.
 * 
 * BEHAVIOR:
 * - Set dlqReason
 * - Set movedToDlqAt
 * - Set finalAttemptNumber
 * - Enforce size limit (truncate if needed)
 * - Throw WorkerCarrierSizeExceededError if cannot fit
 * 
 * @param carrier - Current V2 carrier
 * @param reason - DLQ reason
 * @param metrics - Metrics recorder
 * @returns Enrichment result
 * @throws WorkerCarrierSizeExceededError if carrier too large
 */
export function handleDlqCarrier(
  carrier: IdempotencyContextCarrierV2,
  reason: DlqReason,
  metrics: IWorkerCarrierMetrics,
): DlqCarrierResult {
  // 1. Enrich carrier
  const enrichResult = enrichCarrierForDlq(carrier, reason);
  metrics.recordCarrierDlqEnriched(reason);
  
  // 2. Enforce size limit
  try {
    const sizeResult = enforceCarrierSizeLimit(enrichResult.carrier);
    
    if (sizeResult.action === 'OK') {
      metrics.recordCarrierSizeOk();
    } else if (sizeResult.action === 'TRUNCATED') {
      metrics.recordCarrierTruncated();
    }
    
    return {
      carrier: sizeResult.carrier,
      reason: enrichResult.reason,
      finalAttemptNumber: enrichResult.finalAttemptNumber,
      sizeAction: sizeResult.action as 'OK' | 'TRUNCATED',
    };
  } catch (error) {
    if (error instanceof CarrierSizeExceededError) {
      metrics.recordCarrierRejected();
      throw new WorkerCarrierSizeExceededError(
        error.originalSizeBytes,
        error.maxSizeBytes,
      );
    }
    throw error;
  }
}
