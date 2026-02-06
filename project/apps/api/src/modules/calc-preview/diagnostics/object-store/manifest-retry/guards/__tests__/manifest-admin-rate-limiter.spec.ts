/**
 * Manifest Admin Rate Limiter Tests
 * 
 * Phase 10.2 - Task 4.3
 */

import {
  ManifestAdminRateLimiter,
  DEFAULT_RATE_LIMIT_CONFIG,
} from '../manifest-admin-rate-limiter.service';

describe('ManifestAdminRateLimiter', () => {
  let limiter: ManifestAdminRateLimiter;

  beforeEach(() => {
    limiter = new ManifestAdminRateLimiter();
  });

  afterEach(() => {
    limiter.resetAll();
  });

  describe('standard rate limiting', () => {
    it('should allow requests within limit', () => {
      const actorId = 'user-1';
      
      for (let i = 0; i < DEFAULT_RATE_LIMIT_CONFIG.standardLimitPerMinute; i++) {
        const result = limiter.checkLimit(actorId, 'standard');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(DEFAULT_RATE_LIMIT_CONFIG.standardLimitPerMinute - i - 1);
      }
    });

    it('should block requests exceeding limit', () => {
      const actorId = 'user-1';
      
      // Exhaust limit
      for (let i = 0; i < DEFAULT_RATE_LIMIT_CONFIG.standardLimitPerMinute; i++) {
        limiter.checkLimit(actorId, 'standard');
      }

      // Next request should be blocked
      const result = limiter.checkLimit(actorId, 'standard');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('should track different actors separately', () => {
      // Exhaust limit for user-1
      for (let i = 0; i < DEFAULT_RATE_LIMIT_CONFIG.standardLimitPerMinute; i++) {
        limiter.checkLimit('user-1', 'standard');
      }

      // user-2 should still be allowed
      const result = limiter.checkLimit('user-2', 'standard');
      expect(result.allowed).toBe(true);
    });
  });

  describe('bulk rate limiting', () => {
    it('should allow 1 bulk request per minute', () => {
      const result = limiter.checkLimit('user-1', 'bulk');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it('should block second bulk request', () => {
      limiter.checkLimit('user-1', 'bulk');
      
      const result = limiter.checkLimit('user-1', 'bulk');
      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('should track bulk and standard separately', () => {
      // Use bulk limit
      limiter.checkLimit('user-1', 'bulk');
      
      // Standard should still be allowed
      const result = limiter.checkLimit('user-1', 'standard');
      expect(result.allowed).toBe(true);
    });
  });

  describe('window reset', () => {
    it('should reset after window expires', async () => {
      // Use custom config with short window
      const shortLimiter = new ManifestAdminRateLimiter({
        windowMs: 100, // 100ms window
        standardLimitPerMinute: 1,
      });

      // Exhaust limit
      shortLimiter.checkLimit('user-1', 'standard');
      expect(shortLimiter.checkLimit('user-1', 'standard').allowed).toBe(false);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be allowed again
      const result = shortLimiter.checkLimit('user-1', 'standard');
      expect(result.allowed).toBe(true);
    });
  });

  describe('response format', () => {
    it('should return correct format when allowed', () => {
      const result = limiter.checkLimit('user-1', 'standard');
      
      expect(result).toMatchObject({
        allowed: true,
        remaining: expect.any(Number),
        resetAt: expect.any(Date),
      });
      expect(result.retryAfterSeconds).toBeUndefined();
    });

    it('should return correct format when blocked', () => {
      // Exhaust limit
      for (let i = 0; i < DEFAULT_RATE_LIMIT_CONFIG.standardLimitPerMinute; i++) {
        limiter.checkLimit('user-1', 'standard');
      }

      const result = limiter.checkLimit('user-1', 'standard');
      
      expect(result).toMatchObject({
        allowed: false,
        remaining: 0,
        resetAt: expect.any(Date),
        retryAfterSeconds: expect.any(Number),
      });
    });
  });

  describe('getCurrentUsage', () => {
    it('should return current usage without incrementing', () => {
      limiter.checkLimit('user-1', 'standard');
      limiter.checkLimit('user-1', 'standard');

      const usage = limiter.getCurrentUsage('user-1', 'standard');
      expect(usage.used).toBe(2);
      expect(usage.limit).toBe(DEFAULT_RATE_LIMIT_CONFIG.standardLimitPerMinute);

      // Should not have incremented
      const usage2 = limiter.getCurrentUsage('user-1', 'standard');
      expect(usage2.used).toBe(2);
    });

    it('should return zero for new actor', () => {
      const usage = limiter.getCurrentUsage('new-user', 'standard');
      expect(usage.used).toBe(0);
      expect(usage.resetAt).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset specific operation for actor', () => {
      limiter.checkLimit('user-1', 'standard');
      limiter.checkLimit('user-1', 'bulk');

      limiter.reset('user-1', 'standard');

      expect(limiter.getCurrentUsage('user-1', 'standard').used).toBe(0);
      expect(limiter.getCurrentUsage('user-1', 'bulk').used).toBe(1);
    });

    it('should reset all operations for actor', () => {
      limiter.checkLimit('user-1', 'standard');
      limiter.checkLimit('user-1', 'bulk');

      limiter.reset('user-1');

      expect(limiter.getCurrentUsage('user-1', 'standard').used).toBe(0);
      expect(limiter.getCurrentUsage('user-1', 'bulk').used).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', async () => {
      const shortLimiter = new ManifestAdminRateLimiter({
        windowMs: 50,
      });

      shortLimiter.checkLimit('user-1', 'standard');
      shortLimiter.checkLimit('user-2', 'standard');

      expect(shortLimiter.getMetrics().activeEntries).toBe(2);

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 100));

      const cleaned = shortLimiter.cleanup();
      expect(cleaned).toBe(2);
      expect(shortLimiter.getMetrics().activeEntries).toBe(0);
    });
  });

  describe('metrics', () => {
    it('should track rate limit exceeded count', () => {
      // Exhaust limit
      for (let i = 0; i < DEFAULT_RATE_LIMIT_CONFIG.standardLimitPerMinute; i++) {
        limiter.checkLimit('user-1', 'standard');
      }

      // Trigger exceeded
      limiter.checkLimit('user-1', 'standard');
      limiter.checkLimit('user-1', 'standard');

      const metrics = limiter.getMetrics();
      expect(metrics.rateLimitExceededCount).toBe(2);
    });
  });
});
