/**
 * Worker Carrier Handler - Phase 10.5 Task 6 + Phase 11.1
 * 
 * Handles carrier lifecycle operations within worker context:
 * - Inbound: validate + upgrade to V2 (Phase 11.1: degraded mode)
 * - Retry path: mutate carrier
 * - DLQ path: enrich carrier
 * - Size enforcement: reject/truncate
 * 
 * @see ADR-008 v1.3: Queue/Job Boundary Context Propagation
 * @see phase-11-1-design.md: Worker Inbound Degraded Mode
 */

import {
  IdempotencyContextCarrierV2,
  CarrierSizeExceededError,
  MAX_CARRIER_SIZE_BYTES,
  DlqReason,
} from './carrier-lifecycle.types';
import { ensureCarrierV2 } from './carrier-version-upgrade';
import { mutateCarrierForRetry } from './retry-carrier-mutator';
import { enrichCarrierForDlq } from './dlq-carrier-enricher';
import { enforceCarrierSizeLimit } from './carrier-size-limiter';
import {
  type InboundValidationResult,
  buildMinimalResult,
} from './degraded-context.types';

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
// INBOUND VALIDATION (Phase 11.1 — Degraded Mode)
// ============================================================================

/**
 * Validate inbound carrier at worker boundary.
 *
 * Phase 11.1 entry point for inbound carrier validation.
 *
 * CALL ORDER:
 * 0. Byte-level size check (pre-parse, O(1)) — OVERSIZE → no JSON.parse
 * 1. Null/type check
 * 2. Version check (must be 1 or 2)
 * 3. Required field check
 * 4. Type check on critical fields
 * 5. V1→V2 upgrade (if needed)
 *
 * GUARANTEES:
 * - NEVER throws. Always returns InboundValidationResult (FULL | MINIMAL).
 * - NEVER returns null/undefined.
 * - mode='FULL'    → reason is absent
 * - mode='MINIMAL' → degradedContext.reason is present
 *
 * @param raw - Raw carrier from job payload (unknown type)
 * @param rawSizeBytes - Pre-computed byte size of raw carrier payload (optional).
 *                       When provided, enables pre-parse OVERSIZE guard.
 * @returns Validation result (FULL or MINIMAL)
 */
export function validateInboundCarrier(
  raw: unknown,
  rawSizeBytes?: number,
): InboundValidationResult {
  const receivedAt = new Date().toISOString();

  // 0. Byte-level oversize check (pre-parse guard)
  //    INVARIANT: OVERSIZE → JSON.parse is NOT called (spy-testable)
  if (rawSizeBytes !== undefined && rawSizeBytes > MAX_CARRIER_SIZE_BYTES) {
    return buildMinimalResult('OVERSIZE', raw, receivedAt);
  }

  // 1. Null/undefined check
  if (raw == null) {
    return buildMinimalResult('MALFORMED', raw, receivedAt);
  }

  // 2. Object check
  if (typeof raw !== 'object') {
    return buildMinimalResult('MALFORMED', raw, receivedAt);
  }

  // 3. Version check
  const version = (raw as Record<string, unknown>).version;
  if (version !== 1 && version !== 2) {
    return buildMinimalResult('VERSION_MISMATCH', raw, receivedAt);
  }

  // 4. V2 path — validate required fields + type check
  if (version === 2) {
    const missingField = findMissingRequiredV2Field(raw);
    if (missingField) {
      return buildMinimalResult('MISSING_REQUIRED', raw, receivedAt);
    }
    const typeError = findTypeErrorV2(raw);
    if (typeError) {
      return buildMinimalResult('TYPE_ERROR', raw, receivedAt);
    }
    return {
      mode: 'FULL',
      carrier: raw as IdempotencyContextCarrierV2,
      upgraded: false,
    };
  }

  // 5. V1 path — validate required fields + upgrade
  if (version === 1) {
    const missingField = findMissingRequiredV1Field(raw);
    if (missingField) {
      return buildMinimalResult('MISSING_REQUIRED', raw, receivedAt);
    }
    try {
      const v2 = ensureCarrierV2(raw);
      return { mode: 'FULL', carrier: v2, upgraded: true };
    } catch {
      return buildMinimalResult('UPGRADE_FAILED', raw, receivedAt);
    }
  }

  // Unreachable (version already checked), but defensive
  return buildMinimalResult('MALFORMED', raw, receivedAt);
}

// ============================================================================
// VALIDATION HELPERS (Phase 11.1)
// ============================================================================

/**
 * V2 required fields: requestId, actionId, actionType, resourceType, attemptNumber.
 * Returns the name of the first missing/empty field, or null if all present.
 */
function findMissingRequiredV2Field(raw: unknown): string | null {
  const obj = raw as Record<string, unknown>;
  const stringFields = ['requestId', 'actionId', 'actionType', 'resourceType'];

  for (const field of stringFields) {
    const val = obj[field];
    if (typeof val !== 'string' || val.length === 0) {
      return field;
    }
  }

  if (typeof obj.attemptNumber !== 'number') {
    return 'attemptNumber';
  }

  return null;
}

/**
 * V2 type check on critical fields.
 * Returns the name of the first field with wrong type, or null if all OK.
 */
function findTypeErrorV2(raw: unknown): string | null {
  const obj = raw as Record<string, unknown>;

  // requestId must be string
  if (typeof obj.requestId !== 'string') return 'requestId';
  // actionId must be string
  if (typeof obj.actionId !== 'string') return 'actionId';
  // attemptNumber must be number
  if (typeof obj.attemptNumber !== 'number') return 'attemptNumber';
  // resourceId must be string or null
  if (obj.resourceId !== null && typeof obj.resourceId !== 'string') return 'resourceId';

  return null;
}

/**
 * V1 required fields: requestId, actionId, actionType, resourceType.
 * Returns the name of the first missing/empty field, or null if all present.
 */
function findMissingRequiredV1Field(raw: unknown): string | null {
  const obj = raw as Record<string, unknown>;
  const fields = ['requestId', 'actionId', 'actionType', 'resourceType'];

  for (const field of fields) {
    const val = obj[field];
    if (typeof val !== 'string' || val.length === 0) {
      return field;
    }
  }

  return null;
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
