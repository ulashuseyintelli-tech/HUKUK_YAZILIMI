/**
 * Run Job With Carrier
 * 
 * Phase 10.4 - PR-10.4.2 (P1)
 * 
 * Consumer-side helper for restoring ALS context from carrier.
 * Validates carrier and either restores context or runs in degraded mode.
 * 
 * USAGE:
 * ```typescript
 * async process(job: Job<MyPayload>) {
 *   return runJobWithCarrier(
 *     job.data.idempotencyContext,
 *     async () => {
 *       // Business logic - getIdempotencyContext() works here
 *       await this.service.doWork(job.data);
 *     },
 *     this.logger,
 *   );
 * }
 * ```
 * 
 * @see ADR-008: Queue/Job Boundary Context Propagation
 */

import { Logger } from '@nestjs/common';
import { IdempotencyALS } from './idempotency-context';
import { validateCarrier } from './idempotency-carrier.validation';
import {
  recordDegradedCorrelation,
  recordContextRestored,
  REASON_MISSING,
} from './carrier-metrics';

/**
 * Default logger for when none is provided.
 */
const defaultLogger = new Logger('runJobWithCarrier');

/**
 * Run a job function with idempotency context restored from carrier.
 * 
 * Behavior:
 * - If carrier is null/undefined → warn + metric(MISSING) + run without ALS
 * - If carrier is invalid → warn + metric(reason) + run without ALS
 * - If carrier is valid → restore ALS + run inside ALS.run()
 * 
 * @param carrier - Carrier from job payload (job.data.idempotencyContext)
 * @param fn - Job function to execute
 * @param logger - Optional logger for warnings
 * @returns Result of fn()
 * 
 * @example
 * ```typescript
 * // In BullMQ processor
 * async process(job: Job<RetryPayload>) {
 *   return runJobWithCarrier(
 *     job.data.idempotencyContext,
 *     async () => {
 *       const ctx = getIdempotencyContext(); // Works if carrier was valid
 *       await this.retryService.execute(job.data.bundleId);
 *     },
 *   );
 * }
 * ```
 */
export async function runJobWithCarrier<T>(
  carrier: unknown,
  fn: () => Promise<T>,
  logger: Logger = defaultLogger,
): Promise<T> {
  // 1. Handle null/undefined carrier (MISSING)
  if (carrier == null) {
    logger.warn('[runJobWithCarrier] No carrier provided, running in degraded mode');
    recordDegradedCorrelation(REASON_MISSING);
    return fn();
  }

  // 2. Validate carrier
  const result = validateCarrier(carrier);

  // 3. Invalid carrier → degraded mode
  if (!result.valid) {
    logger.warn(
      `[runJobWithCarrier] Invalid carrier (${result.reason}), running in degraded mode`,
    );
    recordDegradedCorrelation(result.reason);
    return fn();
  }

  // 4. Valid carrier → restore ALS and run
  recordContextRestored();
  return IdempotencyALS.run(result.context, fn);
}

/**
 * Synchronous version for non-async job handlers.
 * 
 * @param carrier - Carrier from job payload
 * @param fn - Synchronous job function
 * @param logger - Optional logger
 * @returns Result of fn()
 */
export function runJobWithCarrierSync<T>(
  carrier: unknown,
  fn: () => T,
  logger: Logger = defaultLogger,
): T {
  // 1. Handle null/undefined carrier (MISSING)
  if (carrier == null) {
    logger.warn('[runJobWithCarrierSync] No carrier provided, running in degraded mode');
    recordDegradedCorrelation(REASON_MISSING);
    return fn();
  }

  // 2. Validate carrier
  const result = validateCarrier(carrier);

  // 3. Invalid carrier → degraded mode
  if (!result.valid) {
    logger.warn(
      `[runJobWithCarrierSync] Invalid carrier (${result.reason}), running in degraded mode`,
    );
    recordDegradedCorrelation(result.reason);
    return fn();
  }

  // 4. Valid carrier → restore ALS and run
  recordContextRestored();
  return IdempotencyALS.run(result.context, fn);
}
