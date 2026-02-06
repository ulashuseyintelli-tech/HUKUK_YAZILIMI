/**
 * Carrier Version Upgrade - Phase 10.5
 * 
 * Explicit converter for V1 → V2 carrier upgrade.
 * NO implicit upgrades - all upgrades go through this module.
 * 
 * @see ADR-008 v1.3: Queue/Job Boundary Context Propagation
 */

import { IdempotencyContextCarrier } from '../idempotency-carrier.types';
import {
  IdempotencyContextCarrierV2,
  CARRIER_VERSION_V2,
  isCarrierV1,
  isCarrierV2,
} from './carrier-lifecycle.types';

/**
 * Upgrade result type.
 */
export type UpgradeResult =
  | { success: true; carrier: IdempotencyContextCarrierV2 }
  | { success: false; reason: UpgradeFailureReason };

/**
 * Reasons for upgrade failure.
 */
export type UpgradeFailureReason =
  | 'NULL_INPUT'
  | 'NOT_OBJECT'
  | 'UNKNOWN_VERSION'
  | 'MISSING_REQUIRED_FIELDS';

/**
 * Explicitly upgrade a V1 carrier to V2.
 * 
 * RULES:
 * - V1 → V2: Add lifecycle fields with defaults
 * - V2 → V2: Return as-is (no-op)
 * - Unknown version: Return failure
 * 
 * @param carrier - V1 or V2 carrier
 * @returns Upgrade result with V2 carrier or failure reason
 */
export function upgradeCarrierToV2(
  carrier: unknown
): UpgradeResult {
  // Null/undefined check
  if (carrier === null || carrier === undefined) {
    return { success: false, reason: 'NULL_INPUT' };
  }
  
  // Object check
  if (typeof carrier !== 'object') {
    return { success: false, reason: 'NOT_OBJECT' };
  }
  
  // Already V2 - return as-is
  if (isCarrierV2(carrier)) {
    return { success: true, carrier };
  }
  
  // V1 - upgrade to V2
  if (isCarrierV1(carrier)) {
    return upgradeFromV1(carrier);
  }
  
  // Unknown version
  return { success: false, reason: 'UNKNOWN_VERSION' };
}

/**
 * Internal: Upgrade V1 carrier to V2.
 */
function upgradeFromV1(v1: IdempotencyContextCarrier): UpgradeResult {
  // Validate required V1 fields
  if (!v1.requestId || !v1.actionId || !v1.actionType || !v1.resourceType) {
    return { success: false, reason: 'MISSING_REQUIRED_FIELDS' };
  }
  
  const v2: IdempotencyContextCarrierV2 = {
    // V1 fields
    version: CARRIER_VERSION_V2,
    requestId: v1.requestId,
    actionId: v1.actionId,
    actionType: v1.actionType,
    resourceType: v1.resourceType,
    resourceId: v1.resourceId,
    takeover: v1.takeover,
    previousActorId: v1.previousActorId,
    
    // V2 lifecycle fields - defaults
    attemptNumber: 0, // First attempt = 0
    
    // Optional fields not set on upgrade
    // lastFailedAt: undefined,
    // failureHistory: undefined,
    // dlqReason: undefined,
    // movedToDlqAt: undefined,
    // finalAttemptNumber: undefined,
    // parentCorrelationId: undefined,
    // redriveSource: undefined,
    // redrivenAt: undefined,
    // redrivenBy: undefined,
  };
  
  return { success: true, carrier: v2 };
}

/**
 * Ensure carrier is V2, upgrading if necessary.
 * Throws if upgrade fails.
 * 
 * @param carrier - V1 or V2 carrier
 * @returns V2 carrier
 * @throws Error if upgrade fails
 */
export function ensureCarrierV2(
  carrier: unknown
): IdempotencyContextCarrierV2 {
  const result = upgradeCarrierToV2(carrier);
  
  if (!result.success) {
    throw new Error(`Failed to upgrade carrier to V2: ${result.reason}`);
  }
  
  return result.carrier;
}

/**
 * Check if carrier needs upgrade.
 * 
 * @param carrier - Carrier to check
 * @returns true if V1 (needs upgrade), false if V2 or invalid
 */
export function needsUpgrade(carrier: unknown): boolean {
  return isCarrierV1(carrier);
}
