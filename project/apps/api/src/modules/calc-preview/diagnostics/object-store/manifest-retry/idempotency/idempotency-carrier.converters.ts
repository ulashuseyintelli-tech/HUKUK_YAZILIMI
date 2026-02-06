/**
 * Idempotency Carrier Converters
 * 
 * Phase 10.4 - PR-10.4.1 (P0)
 * 
 * Single source of truth for converting between IdempotencyContext
 * and IdempotencyContextCarrier.
 * 
 * USAGE:
 * - Producer: contextToCarrier(getIdempotencyContext()) → include in payload
 * - Consumer: carrierToContext(validated carrier) → use with ALS.run()
 * 
 * @see ADR-008: Queue/Job Boundary Context Propagation
 */

import { IdempotencyContext } from './idempotency-context';
import {
  IdempotencyContextCarrier,
  CARRIER_VERSION,
} from './idempotency-carrier.types';

/**
 * Convert IdempotencyContext to carrier for queue/job payload.
 * 
 * @param ctx - Current idempotency context
 * @returns Serializable carrier with version field
 * 
 * @example
 * ```typescript
 * const ctx = getIdempotencyContext();
 * if (ctx) {
 *   const carrier = contextToCarrier(ctx);
 *   queue.add('job', { data, idempotencyContext: carrier });
 * }
 * ```
 */
export function contextToCarrier(ctx: IdempotencyContext): IdempotencyContextCarrier {
  return {
    version: CARRIER_VERSION,
    requestId: ctx.requestId,
    actionId: ctx.actionId,
    actionType: ctx.actionType,
    resourceType: ctx.resourceType,
    resourceId: ctx.resourceId,
    takeover: ctx.takeover,
    previousActorId: ctx.previousActorId,
  };
}

/**
 * Convert validated carrier back to IdempotencyContext.
 * 
 * IMPORTANT: Only call this with a validated carrier.
 * Use validateCarrier() first to ensure carrier is valid.
 * 
 * @param carrier - Validated carrier from queue payload
 * @returns IdempotencyContext for use with ALS.run()
 * 
 * @example
 * ```typescript
 * const result = validateCarrier(job.data.idempotencyContext);
 * if (result.valid) {
 *   const ctx = carrierToContext(result.context); // Already extracted
 *   // Or if you have the raw carrier:
 *   // const ctx = carrierToContext(carrier);
 * }
 * ```
 */
export function carrierToContext(carrier: IdempotencyContextCarrier): IdempotencyContext {
  return {
    requestId: carrier.requestId,
    actionId: carrier.actionId,
    actionType: carrier.actionType,
    resourceType: carrier.resourceType,
    resourceId: carrier.resourceId,
    takeover: carrier.takeover,
    previousActorId: carrier.previousActorId,
  };
}

/**
 * Safely create a carrier from current ALS context.
 * Returns null if no context is active.
 * 
 * @param getContext - Function to get current context (default: getIdempotencyContext)
 * @returns Carrier or null if no context
 * 
 * @example
 * ```typescript
 * const carrier = captureCarrier();
 * queue.add('job', { data, idempotencyContext: carrier });
 * ```
 */
export function captureCarrier(
  getContext: () => IdempotencyContext | undefined = () => undefined,
): IdempotencyContextCarrier | null {
  const ctx = getContext();
  return ctx ? contextToCarrier(ctx) : null;
}
