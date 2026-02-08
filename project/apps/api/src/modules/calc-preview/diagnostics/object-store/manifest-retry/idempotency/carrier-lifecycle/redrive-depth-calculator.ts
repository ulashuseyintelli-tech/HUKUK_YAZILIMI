/**
 * Redrive Depth Calculator — Phase 11.3
 *
 * Calculates redrive chain depth by traversing parentCorrelationId
 * links through DLQ entries. Used by the depth limit enforcer to
 * determine whether a redrive should be allowed.
 *
 * depth=0: never redriven (no parentCorrelationId)
 * depth=N: redriven N times
 *
 * Chain traversal stops when:
 * - parentCorrelationId is absent
 * - DLQ entry not found for correlationId
 * - carrierJson is NULL or unparseable
 * - maxTraversal limit reached
 * - Cycle detected (visited set)
 *
 * @see phase-11-3-redrive-depth-limit/design.md
 */

import type { IManifestDlqRepository } from '../../manifest-dlq.repository';
import type { IdempotencyContextCarrierV2 } from './carrier-lifecycle.types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Safety cap: MAX_REDRIVE_DEPTH + 1 */
const DEFAULT_MAX_TRAVERSAL = 4;

// ============================================================================
// TYPES
// ============================================================================

export interface DepthCalculationResult {
  /** Calculated redrive depth (0 = never redriven) */
  readonly depth: number;
  /** True if chain was broken (NULL carrier, parse fail, entry not found) */
  readonly chainBroken: boolean;
  /** True if a cyclic parentCorrelationId reference was detected */
  readonly cycleDetected: boolean;
  /** Wall-clock time spent on traversal (ms) */
  readonly traversalMs: number;
}

// ============================================================================
// CALCULATOR
// ============================================================================

/**
 * Calculate redrive depth by traversing parentCorrelationId chain.
 *
 * @param carrier - Current V2 carrier
 * @param dlqRepo - DLQ repository (for chain lookup)
 * @param maxTraversal - Max traversal steps (default: DEFAULT_MAX_TRAVERSAL)
 * @returns Depth calculation result
 */
export async function calculateRedriveDepth(
  carrier: IdempotencyContextCarrierV2,
  dlqRepo: IManifestDlqRepository,
  maxTraversal: number = DEFAULT_MAX_TRAVERSAL,
): Promise<DepthCalculationResult> {
  const startTime = Date.now();
  let depth = 0;
  let currentParentId = carrier.parentCorrelationId;
  let chainBroken = false;
  let cycleDetected = false;
  const visited = new Set<string>();

  while (currentParentId && depth < maxTraversal) {
    // Cycle detection
    if (visited.has(currentParentId)) {
      cycleDetected = true;
      break;
    }
    visited.add(currentParentId);

    // Look up parent in DLQ by correlationId (carrier.requestId)
    const parentEntry = await dlqRepo.findByCorrelationId(currentParentId);
    if (!parentEntry?.carrierJson) {
      chainBroken = true;
      break;
    }

    try {
      const parentCarrier = JSON.parse(parentEntry.carrierJson);
      currentParentId = parentCarrier.parentCorrelationId;
      depth++;
    } catch {
      chainBroken = true;
      break;
    }
  }

  return {
    depth,
    chainBroken,
    cycleDetected,
    traversalMs: Date.now() - startTime,
  };
}
