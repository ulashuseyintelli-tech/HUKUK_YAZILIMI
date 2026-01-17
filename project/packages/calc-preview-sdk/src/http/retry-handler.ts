/**
 * Retry Handler
 * 
 * Exponential backoff with jitter.
 * Respects deadline and AbortSignal.
 */

import type { RetryConfig } from '../types/config';
import { DEFAULT_CONFIG } from '../types/config';
import { SdkTimeoutError, SdkCancelledError } from '../errors/sdk-error';
import { isRetryableError } from '../errors/type-guards';

export interface RetryOptions {
  readonly config: RetryConfig;
  readonly deadline: number;
  readonly startTime: number;
  readonly signal?: AbortSignal;
  readonly onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

export interface RetryResult<T> {
  readonly result: T;
  readonly attempts: number;
  readonly totalTimeMs: number;
}

/**
 * Execute function with retry logic.
 * 
 * @throws SdkTimeoutError - Deadline exceeded
 * @throws SdkCancelledError - AbortSignal triggered
 * @throws SdkError - Non-retryable error or max retries exceeded
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<RetryResult<T>> {
  const {
    config,
    deadline,
    startTime,
    signal,
    onRetry,
  } = options;

  const maxAttempts = config.maxAttempts ?? DEFAULT_CONFIG.retry.maxAttempts;
  const initialDelayMs = config.initialDelayMs ?? DEFAULT_CONFIG.retry.initialDelayMs;
  const maxDelayMs = config.maxDelayMs ?? DEFAULT_CONFIG.retry.maxDelayMs;
  const multiplier = config.multiplier ?? DEFAULT_CONFIG.retry.multiplier;

  let attempt = 0;
  let delay = initialDelayMs;
  let lastError: Error | undefined;

  while (attempt < maxAttempts) {
    attempt++;

    // Check deadline before attempt
    const elapsed = Date.now() - startTime;
    if (elapsed >= deadline) {
      throw new SdkTimeoutError('Deadline exceeded before attempt', {
        elapsedMs: elapsed,
        deadlineMs: deadline,
      });
    }

    // Check abort signal
    if (signal?.aborted) {
      throw new SdkCancelledError('Request cancelled');
    }

    try {
      const result = await fn();
      return {
        result,
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error as Error;

      // Check if cancelled
      if ((error as Error).name === 'AbortError') {
        throw new SdkCancelledError('Request cancelled');
      }

      // Check if retryable
      if (!isRetryableError(error)) {
        throw error;
      }

      // Check if more attempts allowed
      if (attempt >= maxAttempts) {
        throw error;
      }

      // Check deadline before waiting
      const elapsedAfterAttempt = Date.now() - startTime;
      const remainingTime = deadline - elapsedAfterAttempt;
      
      if (remainingTime <= 0) {
        throw new SdkTimeoutError('Deadline exceeded after attempt', {
          elapsedMs: elapsedAfterAttempt,
          deadlineMs: deadline,
        });
      }

      // Calculate delay with jitter (±10%)
      const jitter = delay * 0.1 * (Math.random() * 2 - 1);
      const actualDelay = Math.min(delay + jitter, remainingTime, maxDelayMs);

      // Notify retry callback
      onRetry?.(attempt, lastError, actualDelay);

      // Wait
      await sleep(actualDelay, signal);

      // Increase delay for next attempt
      delay = Math.min(delay * multiplier, maxDelayMs);
    }
  }

  // Should not reach here, but just in case
  throw lastError ?? new Error('Retry failed');
}

/**
 * Sleep with abort signal support.
 */
async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new SdkCancelledError('Request cancelled'));
      return;
    }

    const timeoutId = setTimeout(resolve, ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      reject(new SdkCancelledError('Request cancelled'));
    }, { once: true });
  });
}

/**
 * Calculate total possible retry time.
 * Useful for deadline validation.
 */
export function calculateMaxRetryTime(config: RetryConfig): number {
  const maxAttempts = config.maxAttempts ?? DEFAULT_CONFIG.retry.maxAttempts;
  const initialDelayMs = config.initialDelayMs ?? DEFAULT_CONFIG.retry.initialDelayMs;
  const maxDelayMs = config.maxDelayMs ?? DEFAULT_CONFIG.retry.maxDelayMs;
  const multiplier = config.multiplier ?? DEFAULT_CONFIG.retry.multiplier;

  let total = 0;
  let delay = initialDelayMs;

  for (let i = 1; i < maxAttempts; i++) {
    total += Math.min(delay, maxDelayMs);
    delay *= multiplier;
  }

  return total;
}

/**
 * Calculate backoff delay for a given attempt.
 * Includes jitter (±10%).
 * Exported for testing.
 */
export function calculateBackoff(
  attempt: number,
  config: Required<RetryConfig>,
): number {
  const baseDelay = config.initialDelayMs * Math.pow(config.multiplier, attempt - 1);
  const cappedDelay = Math.min(baseDelay, config.maxDelayMs);
  
  // Add jitter (±10%)
  const jitter = cappedDelay * 0.1 * (Math.random() * 2 - 1);
  
  return Math.round(cappedDelay + jitter);
}
