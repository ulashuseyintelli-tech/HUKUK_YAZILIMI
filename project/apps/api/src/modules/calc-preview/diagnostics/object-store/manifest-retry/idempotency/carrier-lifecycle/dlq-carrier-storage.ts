/**
 * DLQ Carrier Storage — Phase 11.2
 *
 * Functions for storing carrier JSON in DLQ entries and
 * resolving carrier for admin redrive operations.
 *
 * SINGLE CANONICAL LOCATION for DLQ carrier truncation decisions.
 *
 * NON-NEGOTIABLE INVARIANTS:
 * 1. prepareCarrierForDlqStorage() is the ONLY place where
 *    DLQ carrier truncation decisions are made.
 * 2. carrier_truncated=true ⇒ carrier_json IS NOT NULL
 * 3. Carrier columns are written ONLY by upsert() (DLQ-insert-path only).
 *    resolve/atomicRedrive NEVER touch carrier columns.
 *
 * @see phase-11-2-design.md
 */

import { Logger } from '@nestjs/common';

import {
  IdempotencyContextCarrierV2,
  CARRIER_VERSION_V2,
} from './carrier-lifecycle.types';
import { enforceCarrierSizeLimit } from './carrier-size-limiter';
import { ensureCarrierV2 } from './carrier-version-upgrade';
import type { DlqEntry } from '../../manifest-retry.types';

const logger = new Logger('DlqCarrierStorage');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Carrier fields ready for DLQ storage.
 * Passed directly to dlqRepo.upsert().
 */
export interface DlqCarrierStorageFields {
  readonly carrierJson: string | null;
  readonly carrierVersion: number | null;
  readonly carrierTruncated: boolean;
}

// ============================================================================
// PREPARE FOR STORAGE
// ============================================================================

/**
 * Prepare carrier for DLQ storage.
 *
 * SINGLE CANONICAL LOCATION for DLQ carrier truncation decisions.
 * No other code path should make truncation decisions for DLQ storage.
 *
 * BEHAVIOR:
 * - carrier=null → null fields, truncated=false
 * - carrier valid, within limit → store as-is, truncated=false
 * - carrier valid, over limit, truncatable → truncate failureHistory, truncated=true
 * - carrier valid, over limit, REJECTED → null fields, truncated=false
 *
 * INVARIANT: carrier_truncated=true ⇒ carrier_json IS NOT NULL
 * When REJECTED (too large even after truncation), we store null + truncated=false
 * to preserve the DB constraint.
 *
 * GUARANTEE: Never throws.
 *
 * @param carrier - V2 carrier from worker context (null in degraded mode)
 * @returns DLQ carrier storage fields
 */
export function prepareCarrierForDlqStorage(
  carrier: IdempotencyContextCarrierV2 | null,
): DlqCarrierStorageFields {
  if (carrier == null) {
    return { carrierJson: null, carrierVersion: null, carrierTruncated: false };
  }

  try {
    const sizeResult = enforceCarrierSizeLimit(carrier, { allowTruncation: true });

    return {
      carrierJson: JSON.stringify(sizeResult.carrier),
      carrierVersion: sizeResult.carrier.version,
      carrierTruncated: sizeResult.action === 'TRUNCATED',
    };
  } catch {
    // REJECTED: carrier too large even after truncation.
    // Store null — invariant: truncated=false when json=null
    return { carrierJson: null, carrierVersion: null, carrierTruncated: false };
  }
}

// ============================================================================
// RESOLVE FOR REDRIVE
// ============================================================================

/**
 * Resolve carrier for admin redrive from DLQ entry.
 *
 * Priority: stored carrier JSON > minimal fallback from DLQ metadata.
 *
 * GUARANTEE: Never throws. Always returns a valid V2 carrier.
 *
 * @param dlqEntry - DLQ entry (may or may not have stored carrier)
 * @returns V2 carrier for redrive cloning
 */
export function resolveCarrierForRedrive(
  dlqEntry: DlqEntry,
): IdempotencyContextCarrierV2 {
  if (dlqEntry.carrierJson) {
    try {
      const parsed = JSON.parse(dlqEntry.carrierJson);
      return ensureCarrierV2(parsed);
    } catch (error) {
      // Stored carrier corrupted or invalid — fallback to minimal
      logger.warn(
        `[DLQ_REDRIVE_CARRIER_FALLBACK] Stored carrier parse/upgrade failed, using minimal fallback. ` +
        `dlqEntryId=${dlqEntry.id} bundleId=${dlqEntry.bundleId} ` +
        `carrierVersion=${dlqEntry.carrierVersion ?? 'null'} ` +
        `carrierTruncated=${dlqEntry.carrierTruncated} ` +
        `hasCarrierJson=true ` +
        `reason=${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  return createMinimalCarrierFromDlq(dlqEntry);
}

// ============================================================================
// MINIMAL CARRIER FROM DLQ
// ============================================================================

/**
 * Create a minimal V2 carrier from DLQ entry metadata.
 *
 * Used as fallback when:
 * - Pre-11.2 DLQ entries (no stored carrier)
 * - Stored carrier is corrupted/unparseable
 *
 * The resulting carrier has enough context for redrive cloning
 * but lacks full lifecycle history.
 *
 * @param dlqEntry - DLQ entry
 * @returns Minimal V2 carrier
 */
export function createMinimalCarrierFromDlq(
  dlqEntry: DlqEntry,
): IdempotencyContextCarrierV2 {
  return {
    version: CARRIER_VERSION_V2,
    requestId: `dlq-fallback-${dlqEntry.id}`,
    actionId: `dlq-fallback-action-${dlqEntry.id}`,
    actionType: 'DLQ_REDRIVE',
    resourceType: 'BUNDLE',
    resourceId: dlqEntry.bundleId,
    takeover: false,
    previousActorId: null,
    attemptNumber: dlqEntry.attempt,
    dlqReason: 'EXHAUSTED',
    movedToDlqAt: dlqEntry.lastFailedAt.toISOString(),
    finalAttemptNumber: dlqEntry.attempt,
  };
}
