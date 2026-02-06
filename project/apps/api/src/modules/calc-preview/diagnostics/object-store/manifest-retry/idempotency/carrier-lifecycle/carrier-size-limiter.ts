/**
 * Carrier Size Limiter - Phase 10.5 Task 5
 * 
 * Enforces carrier size limits.
 * - Default policy: REJECT (no silent truncation)
 * - Allowlist truncation: failureHistory only
 * - Max size: 4KB (4096 bytes)
 * 
 * @see ADR-008 v1.3: Queue/Job Boundary Context Propagation
 */

import {
  IdempotencyContextCarrierV2,
  CarrierSizeLimitResult,
  CarrierSizeLimitAction,
  CarrierSizeExceededError,
  MAX_CARRIER_SIZE_BYTES,
  MIN_FAILURE_HISTORY_SIZE,
} from './carrier-lifecycle.types';
import { sizeEnforcementMetric } from './carrier-lifecycle-metrics';

/**
 * Options for size limit enforcement.
 */
export interface SizeLimitOptions {
  /**
   * Maximum size in bytes.
   * Default: MAX_CARRIER_SIZE_BYTES (4096)
   */
  readonly maxSizeBytes?: number;
  
  /**
   * Allow truncation of failureHistory.
   * Default: true
   */
  readonly allowTruncation?: boolean;
  
  /**
   * Minimum failure history entries to keep during truncation.
   * Default: MIN_FAILURE_HISTORY_SIZE (3)
   */
  readonly minFailureHistorySize?: number;
}

const DEFAULT_OPTIONS: Required<SizeLimitOptions> = {
  maxSizeBytes: MAX_CARRIER_SIZE_BYTES,
  allowTruncation: true,
  minFailureHistorySize: MIN_FAILURE_HISTORY_SIZE,
};

/**
 * Enforce carrier size limit.
 * 
 * POLICY:
 * - If within limit → action=OK
 * - If over limit and truncation allowed → truncate failureHistory → action=TRUNCATED
 * - If still over limit after truncation → throw CarrierSizeExceededError
 * - If truncation not allowed → throw CarrierSizeExceededError
 * 
 * @param carrier - V2 carrier to check
 * @param options - Size limit options
 * @returns Size limit result
 * @throws CarrierSizeExceededError if carrier cannot fit within limit
 */
export function enforceCarrierSizeLimit(
  carrier: IdempotencyContextCarrierV2,
  options: SizeLimitOptions = {},
): CarrierSizeLimitResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const originalSizeBytes = calculateCarrierSize(carrier);
  
  // Check if within limit
  if (originalSizeBytes <= opts.maxSizeBytes) {
    sizeEnforcementMetric.inc({ action: 'OK' });
    return {
      carrier,
      action: 'OK',
      originalSizeBytes,
      finalSizeBytes: originalSizeBytes,
    };
  }
  
  // Over limit - try truncation if allowed
  if (!opts.allowTruncation) {
    sizeEnforcementMetric.inc({ action: 'REJECTED' });
    throw new CarrierSizeExceededError(originalSizeBytes, opts.maxSizeBytes);
  }
  
  // Attempt truncation
  const truncated = truncateCarrier(carrier, opts.minFailureHistorySize);
  const truncatedSizeBytes = calculateCarrierSize(truncated);
  
  if (truncatedSizeBytes <= opts.maxSizeBytes) {
    sizeEnforcementMetric.inc({ action: 'TRUNCATED' });
    return {
      carrier: truncated,
      action: 'TRUNCATED',
      originalSizeBytes,
      finalSizeBytes: truncatedSizeBytes,
    };
  }
  
  // Still over limit after truncation
  sizeEnforcementMetric.inc({ action: 'REJECTED' });
  throw new CarrierSizeExceededError(originalSizeBytes, opts.maxSizeBytes);
}

/**
 * Calculate carrier size in bytes.
 */
export function calculateCarrierSize(carrier: IdempotencyContextCarrierV2): number {
  const serialized = JSON.stringify(carrier);
  return Buffer.byteLength(serialized, 'utf8');
}

/**
 * Truncate carrier to reduce size.
 * 
 * TRUNCATION STRATEGY:
 * - Keep last N failure history entries (minSize)
 * - Other fields are NOT truncated (reject if still too large)
 */
function truncateCarrier(
  carrier: IdempotencyContextCarrierV2,
  minFailureHistorySize: number,
): IdempotencyContextCarrierV2 {
  // Only truncate failureHistory
  if (!carrier.failureHistory || carrier.failureHistory.length <= minFailureHistorySize) {
    return carrier;
  }
  
  return {
    ...carrier,
    failureHistory: carrier.failureHistory.slice(-minFailureHistorySize),
  };
}

/**
 * Check if carrier is within size limit.
 */
export function isWithinSizeLimit(
  carrier: IdempotencyContextCarrierV2,
  maxSizeBytes: number = MAX_CARRIER_SIZE_BYTES,
): boolean {
  return calculateCarrierSize(carrier) <= maxSizeBytes;
}

/**
 * Get carrier size info.
 */
export interface CarrierSizeInfo {
  readonly sizeBytes: number;
  readonly maxSizeBytes: number;
  readonly percentUsed: number;
  readonly isOverLimit: boolean;
}

export function getCarrierSizeInfo(
  carrier: IdempotencyContextCarrierV2,
  maxSizeBytes: number = MAX_CARRIER_SIZE_BYTES,
): CarrierSizeInfo {
  const sizeBytes = calculateCarrierSize(carrier);
  const percentUsed = (sizeBytes / maxSizeBytes) * 100;
  
  return {
    sizeBytes,
    maxSizeBytes,
    percentUsed,
    isOverLimit: sizeBytes > maxSizeBytes,
  };
}
