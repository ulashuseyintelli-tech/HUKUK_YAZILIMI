/**
 * Degraded Context Types — Phase 11.1
 *
 * Types for worker inbound degraded mode.
 * When carrier validation fails, the worker continues in degraded mode
 * with minimal context for correlation/audit.
 *
 * DESIGN DECISIONS:
 * - No 'NONE' branch: raw=null → MINIMAL (dropReason: MALFORMED).
 *   MINIMAL already handles "no fields extractable" via optional fields.
 *   Two-way switch (FULL|MINIMAL) is simpler for consumers.
 * - TRUNCATED_INBOUND is NOT a separate class: truncated carrier with
 *   valid V2 schema → ACCEPT as FULL (truncation ≠ invalid).
 *
 * INVARIANTS:
 * - validateInboundCarrier() NEVER returns null/undefined.
 *   Always returns FULL | MINIMAL.
 * - mode='FULL'    → reason is absent (not on the type)
 * - mode='MINIMAL' → reason is REQUIRED (on degradedContext)
 * - "carrier yok" → MINIMAL + reason=MALFORMED (deterministic)
 *
 * @see phase-11-1-design.md
 * @see phase-11-1-requirements.md
 */

import { IdempotencyContextCarrierV2 } from './carrier-lifecycle.types';

// ============================================================================
// CARRIER DROP REASON (FIXED ENUM)
// ============================================================================

/**
 * Extended carrier drop reasons for Phase 11.1.
 *
 * FIXED ENUM — do not add values without ADR update.
 * Extends existing CarrierDropReason with OVERSIZE.
 *
 * Used as metric label (low cardinality: 6 values).
 */
export type CarrierDropReasonV2 =
  | 'MALFORMED'         // null, undefined, non-object, JSON parse fail
  | 'VERSION_MISMATCH'  // version not in {1, 2}
  | 'MISSING_REQUIRED'  // requestId, actionId, etc. missing/empty
  | 'TYPE_ERROR'        // field type mismatch
  | 'OVERSIZE'          // byte size > MAX_CARRIER_BYTES (pre-parse, no JSON.parse)
  | 'UPGRADE_FAILED';   // V1→V2 upgrade threw exception

// ============================================================================
// DEGRADED CONTEXT
// ============================================================================

/**
 * Degraded context attached to audit events when carrier is invalid.
 * Present ONLY when mode=MINIMAL (outcome=degraded).
 * Absent (undefined) for mode=FULL (outcome=accepted).
 */
export interface DegradedContext {
  /** Always true when present */
  readonly isDegraded: true;

  /** Reason for degradation (FIXED ENUM) */
  readonly reason: CarrierDropReasonV2;

  /**
   * First 500 chars of raw carrier JSON (sanitized).
   * undefined if carrier was null/undefined or OVERSIZE.
   * Serialization failure → '[unserializable]'
   */
  readonly carrierSnapshot?: string;
}

// ============================================================================
// MINIMAL CARRIER CONTEXT
// ============================================================================

/**
 * Minimal context produced when carrier is dropped.
 * Contains only safe, bounded fields for correlation.
 *
 * RULES:
 * - No nested payloads
 * - No user-provided large blobs
 * - All extraction fields optional (best-effort from raw carrier)
 * - dropReason + receivedAt always present
 */
export interface MinimalCarrierContext {
  /** Carrier version if extractable (may be invalid value) */
  readonly carrierVersion?: number;

  /** actionId if extractable */
  readonly actionId?: string;

  /** requestId / idempotency key if extractable */
  readonly requestId?: string;

  /** Drop reason (ALWAYS present) */
  readonly dropReason: CarrierDropReasonV2;

  /** Timestamp when worker received the payload (ISO 8601) */
  readonly receivedAt: string;
}

// ============================================================================
// INBOUND VALIDATION RESULT (Discriminated Union)
// ============================================================================

/**
 * Result of inbound carrier validation.
 *
 * Discriminated union on `mode` field:
 * - FULL:    carrier validated, ALS context restored
 * - MINIMAL: carrier dropped, degraded mode active
 *
 * INVARIANTS:
 * - FULL  → no reason field exists on this branch
 * - MINIMAL → degradedContext.reason is REQUIRED
 * - Function NEVER returns null/undefined
 */
export type InboundValidationResult =
  | InboundValidationFull
  | InboundValidationMinimal;

export interface InboundValidationFull {
  readonly mode: 'FULL';
  readonly carrier: IdempotencyContextCarrierV2;
  readonly upgraded: boolean;
}

export interface InboundValidationMinimal {
  readonly mode: 'MINIMAL';
  readonly minimalContext: MinimalCarrierContext;
  readonly degradedContext: DegradedContext;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum carrier snapshot length in characters.
 * Snapshots exceeding this are truncated to (limit - 3) + '...'
 */
export const MAX_CARRIER_SNAPSHOT_CHARS = 500;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Sanitize raw carrier for audit snapshot.
 *
 * RULES:
 * - Max 500 chars
 * - Serialization failure → '[unserializable]'
 * - null/undefined → undefined (no snapshot)
 * - OVERSIZE → undefined (no snapshot — we didn't parse it)
 *
 * GUARANTEE: Never throws.
 */
export function sanitizeCarrierSnapshot(
  raw: unknown,
  reason: CarrierDropReasonV2,
): string | undefined {
  // No snapshot for null/undefined or oversize
  if (raw == null || reason === 'OVERSIZE') return undefined;

  try {
    const json = typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (json.length > MAX_CARRIER_SNAPSHOT_CHARS) {
      return json.slice(0, MAX_CARRIER_SNAPSHOT_CHARS - 3) + '...';
    }
    return json;
  } catch {
    return '[unserializable]';
  }
}

/**
 * Extract safe fields from raw carrier for minimal context.
 * Best-effort: any extraction failure → field is undefined.
 *
 * GUARANTEE: Never throws.
 */
export function extractMinimalFields(
  raw: unknown,
): Pick<MinimalCarrierContext, 'carrierVersion' | 'actionId' | 'requestId'> {
  if (raw == null || typeof raw !== 'object') {
    return {};
  }

  const obj = raw as Record<string, unknown>;
  const result: {
    carrierVersion?: number;
    actionId?: string;
    requestId?: string;
  } = {};

  if (typeof obj.version === 'number') {
    result.carrierVersion = obj.version;
  }
  if (typeof obj.actionId === 'string' && obj.actionId.length > 0) {
    result.actionId = obj.actionId;
  }
  if (typeof obj.requestId === 'string' && obj.requestId.length > 0) {
    result.requestId = obj.requestId;
  }

  return result;
}

/**
 * Build a MINIMAL validation result.
 *
 * GUARANTEE: Never throws. Always returns a valid InboundValidationMinimal.
 */
export function buildMinimalResult(
  reason: CarrierDropReasonV2,
  raw: unknown,
  receivedAt: string,
): InboundValidationMinimal {
  const extracted = extractMinimalFields(raw);
  const snapshot = sanitizeCarrierSnapshot(raw, reason);

  const degradedContext: DegradedContext = snapshot !== undefined
    ? { isDegraded: true, reason, carrierSnapshot: snapshot }
    : { isDegraded: true, reason };

  return {
    mode: 'MINIMAL',
    minimalContext: {
      ...extracted,
      dropReason: reason,
      receivedAt,
    },
    degradedContext,
  };
}
