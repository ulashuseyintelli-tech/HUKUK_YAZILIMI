/**
 * Idempotency Context Carrier Types
 * 
 * Phase 10.4 - PR-10.4.1 (P0)
 * 
 * Typed carrier for cross-boundary context propagation.
 * Used when idempotency context needs to cross process boundaries
 * (queue jobs, scheduled tasks, event handlers).
 * 
 * RULES:
 * - All fields are JSON-serializable
 * - No PII (IP addresses, emails, etc.)
 * - Version field for forward compatibility
 * 
 * @see ADR-008: Queue/Job Boundary Context Propagation
 */

import { IdempotencyContext } from './idempotency-context';

/**
 * Carrier schema v1 for cross-boundary context propagation.
 * 
 * This is the serialized form of IdempotencyContext that can be
 * safely included in queue payloads, event data, etc.
 */
export interface IdempotencyContextCarrier {
  /** Schema version for forward compatibility. Always 1 for v1 carriers. */
  readonly version: 1;
  
  /** Original request's idempotency key */
  readonly requestId: string;
  
  /** Gate action ID (correlation anchor) */
  readonly actionId: string;
  
  /** Action type: ADMIN_RETRY | DLQ_REDRIVE | DLQ_RESOLVE */
  readonly actionType: string;
  
  /** Resource type: BUNDLE | DLQ_ENTRY */
  readonly resourceType: string;
  
  /** Resource identifier (nullable) */
  readonly resourceId: string | null;
  
  /** Whether this was a lease takeover */
  readonly takeover: boolean;
  
  /** Previous actor ID if takeover occurred */
  readonly previousActorId: string | null;
}

/**
 * Reasons why a carrier was dropped during validation.
 * Used for metrics and logging.
 */
export type CarrierDropReason =
  | 'MALFORMED'         // null, undefined, or not an object
  | 'VERSION_MISMATCH'  // version !== 1
  | 'MISSING_REQUIRED'  // requestId, actionId, actionType, resourceType missing/empty
  | 'TYPE_ERROR';       // field type mismatch

/**
 * Result of carrier validation.
 * 
 * If valid, contains the extracted IdempotencyContext.
 * If invalid, contains the reason for rejection.
 */
export type CarrierValidationResult =
  | { valid: true; context: IdempotencyContext }
  | { valid: false; reason: CarrierDropReason };

/**
 * Payload field name for carrier in queue jobs.
 * 
 * Convention: carrier is placed at payload root under this key.
 */
export const CARRIER_FIELD_NAME = 'idempotencyContext' as const;

/**
 * Current carrier schema version.
 */
export const CARRIER_VERSION = 1 as const;
