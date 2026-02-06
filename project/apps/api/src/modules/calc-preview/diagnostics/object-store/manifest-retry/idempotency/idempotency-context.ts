/**
 * Idempotency Context - AsyncLocalStorage Wrapper
 * 
 * Phase 10.3 - PR-7.1
 * 
 * Provides request-scoped idempotency context via Node.js AsyncLocalStorage.
 * Replaces req.idempotencyContext pattern for cleaner, type-safe access.
 * 
 * BENEFITS:
 * - No req object dependency in services
 * - Type-safe context access
 * - Automatic cleanup on request end
 * - No context leakage between concurrent requests
 * 
 * USAGE:
 * - Interceptor: IdempotencyALS.run(ctx, () => next.handle())
 * - Services: getIdempotencyContext() → IdempotencyContext | undefined
 * 
 * GUARDRAIL:
 * - NEVER use fire-and-forget async inside ALS.run() scope
 * - All async operations must complete before run() returns
 * 
 * @see PR-7-ALS-ARCHITECTURE.md
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Context propagated via ALS for downstream audit enrichment.
 * 
 * Immutable after creation - do not mutate fields.
 */
export interface IdempotencyContext {
  /** Unique action ID from idempotency gate */
  readonly actionId: string;
  
  /** Original request ID (Idempotency-Key header) */
  readonly requestId: string;
  
  /** Action type from @IdempotencyAction decorator */
  readonly actionType: string;
  
  /** Resource type being operated on */
  readonly resourceType: string;
  
  /** Resource ID if applicable */
  readonly resourceId: string | null;
  
  /** Whether this is a lease takeover */
  readonly takeover: boolean;
  
  /** Previous actor ID if takeover */
  readonly previousActorId: string | null;
}

/**
 * AsyncLocalStorage instance for idempotency context.
 * 
 * CRITICAL: Only the interceptor should call .run()
 * Services should only call getIdempotencyContext()
 */
export const IdempotencyALS = new AsyncLocalStorage<IdempotencyContext>();

/**
 * Get current idempotency context from ALS.
 * 
 * Returns undefined if:
 * - Called outside of ALS.run() scope
 * - Called from CACHED/IN_PROGRESS paths (no run() called)
 * 
 * @returns IdempotencyContext or undefined
 */
export function getIdempotencyContext(): IdempotencyContext | undefined {
  return IdempotencyALS.getStore();
}

/**
 * Check if currently inside an idempotency context.
 * Useful for conditional audit enrichment.
 */
export function hasIdempotencyContext(): boolean {
  return IdempotencyALS.getStore() !== undefined;
}
