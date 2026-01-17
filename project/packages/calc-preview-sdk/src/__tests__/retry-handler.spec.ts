/**
 * Retry Handler Tests
 * 
 * Exponential backoff + jitter + deadline enforcement.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, calculateBackoff } from '../http/retry-handler';
import { SdkNetworkError, SdkServerError, SdkTimeoutError, SdkCancelledError } from '../errors/sdk-error';

describe('Retry Handler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('calculateBackoff', () => {
    it('should calculate exponential backoff', () => {
      const config = {
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 5000,
        multiplier: 2,
      };

      // Attempt 1: 100ms base
      const delay1 = calculateBackoff(1, config);
      expect(delay1).toBeGreaterThanOrEqual(90); // 100 - 10% jitter
      expect(delay1).toBeLessThanOrEqual(110); // 100 + 10% jitter

      // Attempt 2: 200ms base
      const delay2 = calculateBackoff(2, config);
      expect(delay2).toBeGreaterThanOrEqual(180);
      expect(delay2).toBeLessThanOrEqual(220);

      // Attempt 3: 400ms base
      const delay3 = calculateBackoff(3, config);
      expect(delay3).toBeGreaterThanOrEqual(360);
      expect(delay3).toBeLessThanOrEqual(440);
    });

    it('should cap at maxDelayMs', () => {
      const config = {
        maxAttempts: 10,
        initialDelayMs: 1000,
        maxDelayMs: 5000,
        multiplier: 2,
      };

      // After several attempts, should cap at 5000
      const delay = calculateBackoff(10, config);
      expect(delay).toBeLessThanOrEqual(5500); // 5000 + 10% jitter
    });

    it('should add jitter (±10%)', () => {
      const config = {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 5000,
        multiplier: 2,
      };

      // Run multiple times to verify jitter variance
      const delays = Array.from({ length: 100 }, () => calculateBackoff(1, config));
      const uniqueDelays = new Set(delays);

      // Should have some variance due to jitter
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue({ data: 'success' });

      const result = await withRetry(fn, {
        config: { maxAttempts: 3, initialDelayMs: 100, maxDelayMs: 5000, multiplier: 2 },
        deadline: 60000,
        startTime: Date.now(),
      });

      expect(result.result).toEqual({ data: 'success' });
      expect(result.attempts).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error and succeed', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new SdkNetworkError('Network error'))
        .mockRejectedValueOnce(new SdkServerError('Server error', { httpStatus: 503 }))
        .mockResolvedValue({ data: 'success' });

      const resultPromise = withRetry(fn, {
        config: { maxAttempts: 5, initialDelayMs: 100, maxDelayMs: 5000, multiplier: 2 },
        deadline: 60000,
        startTime: Date.now(),
      });

      // Advance timers for retries
      await vi.advanceTimersByTimeAsync(100); // First retry delay
      await vi.advanceTimersByTimeAsync(200); // Second retry delay

      const result = await resultPromise;

      expect(result.result).toEqual({ data: 'success' });
      expect(result.attempts).toBe(3);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable error', async () => {
      const fn = vi.fn().mockRejectedValue(new SdkCancelledError('Cancelled'));

      await expect(withRetry(fn, {
        config: { maxAttempts: 3, initialDelayMs: 100, maxDelayMs: 5000, multiplier: 2 },
        deadline: 60000,
        startTime: Date.now(),
      })).rejects.toThrow(SdkCancelledError);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should stop at maxAttempts', async () => {
      const fn = vi.fn().mockRejectedValue(new SdkNetworkError('Network error'));

      const resultPromise = withRetry(fn, {
        config: { maxAttempts: 3, initialDelayMs: 100, maxDelayMs: 5000, multiplier: 2 },
        deadline: 60000,
        startTime: Date.now(),
      });

      // Advance timers for all retries
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);

      await expect(resultPromise).rejects.toThrow(SdkNetworkError);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should stop when deadline exceeded', async () => {
      const startTime = Date.now();
      const fn = vi.fn().mockRejectedValue(new SdkNetworkError('Network error'));

      const resultPromise = withRetry(fn, {
        config: { maxAttempts: 10, initialDelayMs: 100, maxDelayMs: 5000, multiplier: 2 },
        deadline: 500, // Short deadline
        startTime,
      });

      // Advance past deadline
      await vi.advanceTimersByTimeAsync(600);

      await expect(resultPromise).rejects.toThrow(SdkTimeoutError);
    });

    it('should call onRetry callback', async () => {
      const onRetry = vi.fn();
      const fn = vi.fn()
        .mockRejectedValueOnce(new SdkNetworkError('Network error'))
        .mockResolvedValue({ data: 'success' });

      const resultPromise = withRetry(fn, {
        config: { maxAttempts: 3, initialDelayMs: 100, maxDelayMs: 5000, multiplier: 2 },
        deadline: 60000,
        startTime: Date.now(),
        onRetry,
      });

      await vi.advanceTimersByTimeAsync(100);
      await resultPromise;

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        1,
        expect.any(SdkNetworkError),
        expect.any(Number)
      );
    });

    it('should respect AbortSignal', async () => {
      const controller = new AbortController();
      const fn = vi.fn().mockRejectedValue(new SdkNetworkError('Network error'));

      const resultPromise = withRetry(fn, {
        config: { maxAttempts: 10, initialDelayMs: 100, maxDelayMs: 5000, multiplier: 2 },
        deadline: 60000,
        startTime: Date.now(),
        signal: controller.signal,
      });

      // Abort after first attempt
      controller.abort();

      await expect(resultPromise).rejects.toThrow(SdkCancelledError);
    });
  });
});
