/**
 * Enqueue With Context
 * 
 * Phase 10.4 - PR-10.4.2 (P1)
 * 
 * Producer-side helper for capturing ALS context into queue payloads.
 * Automatically adds idempotencyContext carrier if ALS is active.
 * 
 * USAGE:
 * ```typescript
 * // Instead of: queue.add('job', { bundleId })
 * // Use: await enqueueWithContext(queue, 'job', { bundleId })
 * ```
 * 
 * @see ADR-008: Queue/Job Boundary Context Propagation
 */

import { getIdempotencyContext } from './idempotency-context';
import { contextToCarrier } from './idempotency-carrier.converters';
import {
  IdempotencyContextCarrier,
  CARRIER_FIELD_NAME,
} from './idempotency-carrier.types';

/**
 * Payload with optional idempotency context carrier.
 */
export type PayloadWithCarrier<T> = T & {
  [CARRIER_FIELD_NAME]?: IdempotencyContextCarrier | null;
};

/**
 * Capture current ALS context as a carrier.
 * Returns null if no context is active.
 * 
 * @returns Carrier or null
 */
export function captureCurrentCarrier(): IdempotencyContextCarrier | null {
  const ctx = getIdempotencyContext();
  return ctx ? contextToCarrier(ctx) : null;
}

/**
 * Add idempotency context carrier to a payload.
 * 
 * If ALS context is active, adds carrier to payload.
 * If no context, adds null (consumer will run in degraded mode).
 * 
 * @param payload - Original job payload
 * @returns Payload with idempotencyContext field
 * 
 * @example
 * ```typescript
 * const enrichedPayload = enrichPayloadWithCarrier({ bundleId: '123' });
 * // If ALS active: { bundleId: '123', idempotencyContext: { version: 1, ... } }
 * // If no ALS: { bundleId: '123', idempotencyContext: null }
 * ```
 */
export function enrichPayloadWithCarrier<T extends object>(
  payload: T,
): PayloadWithCarrier<T> {
  const carrier = captureCurrentCarrier();
  return {
    ...payload,
    [CARRIER_FIELD_NAME]: carrier,
  };
}

/**
 * Generic queue interface for type safety.
 * Compatible with BullMQ Queue.
 */
export interface QueueLike<T> {
  add(name: string, data: T, opts?: unknown): Promise<unknown>;
}

/**
 * Enqueue a job with idempotency context automatically captured.
 * 
 * This is the recommended way to enqueue jobs that need context propagation.
 * 
 * @param queue - Queue instance (BullMQ Queue or compatible)
 * @param name - Job name
 * @param data - Job payload
 * @param opts - Optional job options
 * @returns Job instance from queue.add()
 * 
 * @example
 * ```typescript
 * // In a service method (inside ALS scope)
 * await enqueueWithContext(this.retryQueue, 'manifest-retry', {
 *   bundleId: 'bundle-123',
 *   attempt: 1,
 * });
 * // Payload will include idempotencyContext carrier automatically
 * ```
 */
export async function enqueueWithContext<T extends object>(
  queue: QueueLike<PayloadWithCarrier<T>>,
  name: string,
  data: T,
  opts?: unknown,
): Promise<unknown> {
  const enrichedData = enrichPayloadWithCarrier(data);
  return queue.add(name, enrichedData, opts);
}
