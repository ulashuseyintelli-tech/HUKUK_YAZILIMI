/**
 * Redrive Carrier Cloner - Phase 10.5 Task 4
 * 
 * Clones carrier for redrive path: clone + reset.
 * - NEW correlationId generated
 * - NEW requestId generated
 * - parentCorrelationId links to original (IMMUTABLE)
 * - attemptNumber reset to 0 (first attempt)
 * - DLQ fields cleared
 * - Redrive metadata set
 * 
 * @see ADR-008 v1.3: Queue/Job Boundary Context Propagation
 */

import {
  IdempotencyContextCarrierV2,
  RedriveContext,
  CARRIER_VERSION_V2,
} from './carrier-lifecycle.types';
import { ensureCarrierV2 } from './carrier-version-upgrade';
import { redriveCloneMetric } from './carrier-lifecycle-metrics';

/**
 * Result of redrive clone operation.
 */
export interface RedriveCloneResult {
  /** Cloned carrier (V2) with new correlationId */
  readonly carrier: IdempotencyContextCarrierV2;
  
  /** Original correlationId (now parentCorrelationId) */
  readonly originalCorrelationId: string;
  
  /** New correlationId */
  readonly newCorrelationId: string;
  
  /** New requestId */
  readonly newRequestId: string;
}

/**
 * Generate a UUID v4.
 * Simple implementation for carrier IDs.
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Clone carrier for redrive path.
 * 
 * BEHAVIOR:
 * - V1 carrier → auto-upgrade to V2 first
 * - NEW correlationId generated (requestId)
 * - NEW requestId generated
 * - parentCorrelationId set to original correlationId (IMMUTABLE link)
 * - attemptNumber reset to 0 (first attempt of new lifecycle)
 * - tenantId, userId preserved
 * - DLQ fields cleared (dlqReason, movedToDlqAt, finalAttemptNumber)
 * - failureHistory cleared (fresh start)
 * - Redrive metadata set (redriveSource, redrivenAt, redrivenBy)
 * 
 * @param original - Original carrier (V1 or V2)
 * @param ctx - Redrive context (dlqName, operatorId)
 * @param now - Optional timestamp (for testing)
 * @returns Clone result with new V2 carrier
 */
export function cloneCarrierForRedrive(
  original: unknown,
  ctx: RedriveContext,
  now: Date = new Date(),
): RedriveCloneResult {
  // Ensure V2 (auto-upgrade V1)
  const v2 = ensureCarrierV2(original);
  
  const originalCorrelationId = v2.requestId;
  const newCorrelationId = generateUUID();
  const newRequestId = generateUUID();
  
  // Build cloned carrier
  const cloned: IdempotencyContextCarrierV2 = {
    // Version
    version: CARRIER_VERSION_V2,
    
    // New IDs
    requestId: newRequestId,
    actionId: generateUUID(),
    
    // Preserved from original
    actionType: v2.actionType,
    resourceType: v2.resourceType,
    resourceId: v2.resourceId,
    takeover: v2.takeover,
    previousActorId: v2.previousActorId,
    
    // Reset attempt tracking (0 = first attempt)
    attemptNumber: 0,
    
    // Link to parent (IMMUTABLE)
    parentCorrelationId: originalCorrelationId,
    
    // Redrive metadata
    redriveSource: ctx.dlqName,
    redrivenAt: now.toISOString(),
    redrivenBy: ctx.operatorId,
    
    // Clear DLQ fields (fresh start)
    dlqReason: undefined,
    movedToDlqAt: undefined,
    finalAttemptNumber: undefined,
    
    // Clear failure history (fresh start)
    lastFailedAt: undefined,
    failureHistory: undefined,
  };
  
  // Record metric
  redriveCloneMetric.inc({ source_dlq: ctx.dlqName });
  
  return {
    carrier: cloned,
    originalCorrelationId,
    newCorrelationId,
    newRequestId,
  };
}

/**
 * Check if carrier was redriven.
 */
export function wasRedriven(carrier: IdempotencyContextCarrierV2): boolean {
  return carrier.parentCorrelationId !== undefined && carrier.redrivenAt !== undefined;
}

/**
 * Get redrive chain depth.
 * Returns 0 if not redriven, 1 if redriven once, etc.
 * 
 * NOTE: This only counts immediate parent. For full chain,
 * you need to traverse parentCorrelationId links.
 */
export function getRedriveDepth(carrier: IdempotencyContextCarrierV2): number {
  return carrier.parentCorrelationId !== undefined ? 1 : 0;
}

/**
 * Get redrive source DLQ name.
 */
export function getRedriveSource(carrier: IdempotencyContextCarrierV2): string | undefined {
  return carrier.redriveSource;
}

/**
 * Get operator who triggered redrive.
 */
export function getRedrivenBy(carrier: IdempotencyContextCarrierV2): string | undefined {
  return carrier.redrivenBy;
}
