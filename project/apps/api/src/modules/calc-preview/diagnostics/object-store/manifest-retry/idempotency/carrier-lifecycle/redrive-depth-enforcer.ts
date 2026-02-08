/**
 * Redrive Depth Limit Enforcer — Phase 11.3
 *
 * Enforces the maximum redrive depth limit. Coordinates between
 * the depth calculator, POISON marker, and metrics.
 *
 * Flow:
 * 1. Check if entry is already POISON → immediate reject
 * 2. Calculate depth via parentCorrelationId chain
 * 3. If depth >= MAX → mark POISON + reject
 * 4. If depth < MAX → allow
 *
 * Fail-closed: any unexpected error during depth check → reject.
 * POISON is latched: once set, never reverted.
 *
 * @see phase-11-3-redrive-depth-limit/design.md
 */

import type { IManifestDlqRepository } from '../../manifest-dlq.repository';
import type { IdempotencyContextCarrierV2 } from './carrier-lifecycle.types';
import type { DlqEntry } from '../../manifest-retry.types';
import { calculateRedriveDepth, DepthCalculationResult } from './redrive-depth-calculator';
import { redriveDepthHistogram, redriveRejectedMetric } from './carrier-lifecycle-metrics';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum allowed redrive depth. Configurable per deployment. */
export const MAX_REDRIVE_DEPTH = 3;

// ============================================================================
// TYPES
// ============================================================================

export interface DepthEnforcementResult {
  readonly allowed: boolean;
  readonly currentDepth: number;
  readonly reason?: 'DEPTH_EXCEEDED' | 'POISON_ENTRY' | 'DEPTH_CHECK_FAILED';
  readonly depthCalculation?: DepthCalculationResult;
}

// ============================================================================
// ERROR
// ============================================================================

export class RedriveDepthExceededError extends Error {
  override readonly name = 'RedriveDepthExceededError';
  constructor(
    readonly currentDepth: number,
    readonly maxDepth: number,
    readonly code: 'REDRIVE_DEPTH_EXCEEDED' | 'POISON_ENTRY' = 'REDRIVE_DEPTH_EXCEEDED',
  ) {
    super(`Redrive depth ${currentDepth} exceeds maximum ${maxDepth}`);
  }
}

// ============================================================================
// ENFORCER
// ============================================================================

/**
 * Enforce redrive depth limit.
 *
 * @param dlqEntry - DLQ entry being redriven
 * @param carrier - Resolved V2 carrier for the entry
 * @param dlqRepo - DLQ repository
 * @param maxDepth - Maximum allowed depth (default: MAX_REDRIVE_DEPTH)
 * @returns Enforcement result
 */
export async function enforceRedriveDepthLimit(
  dlqEntry: DlqEntry,
  carrier: IdempotencyContextCarrierV2,
  dlqRepo: IManifestDlqRepository,
  maxDepth: number = MAX_REDRIVE_DEPTH,
): Promise<DepthEnforcementResult> {
  // 1. Already POISON? Immediate reject (latched).
  if (dlqEntry.isPoison) {
    redriveRejectedMetric.inc({ reason: 'POISON_ENTRY' });
    return {
      allowed: false,
      currentDepth: -1,
      reason: 'POISON_ENTRY',
    };
  }

  // 2. Calculate depth
  const depthResult = await calculateRedriveDepth(carrier, dlqRepo, maxDepth + 1);

  // 2a. Record depth histogram
  redriveDepthHistogram.observe(depthResult.depth);

  // 3. Limit check
  if (depthResult.depth >= maxDepth) {
    // Mark as POISON (latched, never reverted)
    await dlqRepo.markAsPoison(dlqEntry.id, {
      reason: `REDRIVE_DEPTH_EXCEEDED: depth=${depthResult.depth}, maxDepth=${maxDepth}`,
    });

    redriveRejectedMetric.inc({ reason: 'DEPTH_EXCEEDED' });

    return {
      allowed: false,
      currentDepth: depthResult.depth,
      reason: 'DEPTH_EXCEEDED',
      depthCalculation: depthResult,
    };
  }

  // 4. Allow
  return {
    allowed: true,
    currentDepth: depthResult.depth,
    depthCalculation: depthResult,
  };
}
