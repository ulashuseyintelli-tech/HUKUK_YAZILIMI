/**
 * Idempotency Carrier Validation
 * 
 * Phase 10.4 - PR-10.4.1 (P0)
 * 
 * Validates carrier payloads at process boundaries.
 * Invalid carriers trigger degraded mode (warn + metric + run without context).
 * 
 * VALIDATION RULES (per ADR-008):
 * 1. carrier == null || typeof carrier !== 'object' → MALFORMED
 * 2. carrier.version !== 1 → VERSION_MISMATCH
 * 3. Required fields missing/empty → MISSING_REQUIRED
 * 4. Type mismatches → TYPE_ERROR
 * 5. Extra fields → ignore (forward compatibility)
 * 
 * @see ADR-008: Queue/Job Boundary Context Propagation
 */

import { IdempotencyContext } from './idempotency-context';
import {
  CarrierValidationResult,
  CarrierDropReason,
  CARRIER_VERSION,
} from './idempotency-carrier.types';

/**
 * Required fields that must be non-empty strings.
 */
const REQUIRED_STRING_FIELDS = [
  'requestId',
  'actionId',
  'actionType',
  'resourceType',
] as const;

/**
 * Validate a carrier payload from a queue job or event.
 * 
 * @param carrier - Unknown payload to validate
 * @returns Validation result with context or drop reason
 * 
 * @example
 * ```typescript
 * const result = validateCarrier(job.data.idempotencyContext);
 * if (result.valid) {
 *   // Use result.context
 * } else {
 *   // Log result.reason, emit metric
 * }
 * ```
 */
export function validateCarrier(carrier: unknown): CarrierValidationResult {
  // 1. Null/undefined/non-object check
  if (carrier == null || typeof carrier !== 'object' || Array.isArray(carrier)) {
    return { valid: false, reason: 'MALFORMED' };
  }

  const c = carrier as Record<string, unknown>;

  // 2. Version check (strict equality to literal 1)
  if (c.version !== CARRIER_VERSION) {
    return { valid: false, reason: 'VERSION_MISMATCH' };
  }

  // 3. Required string fields check
  for (const field of REQUIRED_STRING_FIELDS) {
    const value = c[field];
    if (typeof value !== 'string' || value === '') {
      return { valid: false, reason: 'MISSING_REQUIRED' };
    }
  }

  // 4. Type checks for optional/nullable fields
  
  // resourceId: string | null
  if (c.resourceId !== null && typeof c.resourceId !== 'string') {
    return { valid: false, reason: 'TYPE_ERROR' };
  }

  // takeover: boolean
  if (typeof c.takeover !== 'boolean') {
    return { valid: false, reason: 'TYPE_ERROR' };
  }

  // previousActorId: string | null
  if (c.previousActorId !== null && typeof c.previousActorId !== 'string') {
    return { valid: false, reason: 'TYPE_ERROR' };
  }

  // 5. Extra fields: IGNORE (forward compatibility)
  // We only extract known fields, unknown fields are silently ignored.

  // Build validated context
  const context: IdempotencyContext = {
    requestId: c.requestId as string,
    actionId: c.actionId as string,
    actionType: c.actionType as string,
    resourceType: c.resourceType as string,
    resourceId: (c.resourceId as string | null) ?? null,
    takeover: c.takeover as boolean,
    previousActorId: (c.previousActorId as string | null) ?? null,
  };

  return { valid: true, context };
}

/**
 * Check if a value is a valid carrier (type guard).
 * 
 * @param carrier - Unknown value to check
 * @returns True if carrier is valid
 */
export function isValidCarrier(carrier: unknown): boolean {
  return validateCarrier(carrier).valid;
}

/**
 * Get human-readable description for a drop reason.
 * Useful for logging.
 */
export function getDropReasonDescription(reason: CarrierDropReason): string {
  switch (reason) {
    case 'MALFORMED':
      return 'Carrier is null, undefined, or not an object';
    case 'VERSION_MISMATCH':
      return `Carrier version is not ${CARRIER_VERSION}`;
    case 'MISSING_REQUIRED':
      return 'Required field (requestId, actionId, actionType, resourceType) is missing or empty';
    case 'TYPE_ERROR':
      return 'Field type mismatch (resourceId, takeover, or previousActorId)';
  }
}
