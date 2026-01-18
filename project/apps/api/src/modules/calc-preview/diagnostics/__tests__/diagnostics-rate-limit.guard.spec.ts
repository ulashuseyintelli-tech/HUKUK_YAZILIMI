/**
 * Diagnostics Rate Limit Guard - Unit Tests
 * 
 * Phase 7A - Sprint 1
 * 
 * Tests:
 * - General endpoint rate limiting (60/min)
 * - Trace detail rate limiting (30/min)
 * - Burst protection (10/sec)
 * - 429 response with Retry-After
 */

import { ExecutionContext, HttpException } from '@nestjs/common';
import { DiagnosticsRateLimitGuard } from '../guards/diagnostics-rate-limit.guard';
import { MockClockService } from '../evidence/clock.service';
import { DIAGNOSTICS_RATE_LIMITS } from '../diagnostics.types';

describe('DiagnosticsRateLimitGuard', () => {
  let guard: DiagnosticsRateLimitGuard;
  let mockClock: MockClockService;

  beforeEach(() => {
    mockClock = new MockClockService(new Date('2026-01-17T12:00:00.000Z'));
    guard = new DiagnosticsRateLimitGuard(mockClock);
    guard.reset();
  });

  // Helper to create mock execution context
  const createMockContext = (path: string, tenantId: string = 'tenant-123'): ExecutionContext => {
    const request = {
      headers: {
        'x-tenant-id': tenantId,
      },
      path,
      tenantContext: { tenantId },
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
  };

  /**
   * Helper to make N requests with time advancement to avoid burst limit
   * Advances clock by 1 second after every 10 requests
   */
  const makeRequestsWithTimeAdvance = (context: ExecutionContext, count: number): void => {
    for (let i = 0; i < count; i++) {
      guard.canActivate(context);
      // After every 10 requests, advance time by 1 second to reset burst window
      if ((i + 1) % DIAGNOSTICS_RATE_LIMITS.BURST_LIMIT === 0) {
        mockClock.advanceSeconds(1);
      }
    }
  };

  describe('General Endpoint Rate Limiting', () => {
    it('should allow requests within limit', () => {
      const context = createMockContext('/calc/diagnostics/health');

      // Should allow up to 60 requests (with time advancement to avoid burst)
      makeRequestsWithTimeAdvance(context, DIAGNOSTICS_RATE_LIMITS.GENERAL_LIMIT);
      
      // All 60 should have passed without throwing
      expect(true).toBe(true);
    });

    it('should reject requests exceeding limit', () => {
      const context = createMockContext('/calc/diagnostics/health');

      // Exhaust the limit (with time advancement to avoid burst)
      makeRequestsWithTimeAdvance(context, DIAGNOSTICS_RATE_LIMITS.GENERAL_LIMIT);

      // Advance time to reset burst window
      mockClock.advanceSeconds(1);

      // Next request should be rejected due to minute limit
      expect(() => guard.canActivate(context)).toThrow(HttpException);
    });

    it('should return 429 with retryAfter', () => {
      const context = createMockContext('/calc/diagnostics/health');

      // Exhaust the limit (with time advancement to avoid burst)
      makeRequestsWithTimeAdvance(context, DIAGNOSTICS_RATE_LIMITS.GENERAL_LIMIT);

      // Advance time to reset burst window
      mockClock.advanceSeconds(1);

      try {
        guard.canActivate(context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.statusCode).toBe(429);
        expect(response.details.retryAfter).toBeGreaterThan(0);
        expect(response.details.limitType).toBe('minute');
      }
    });
  });

  describe('Trace Detail Rate Limiting', () => {
    it('should allow requests within trace detail limit', () => {
      const context = createMockContext('/calc/diagnostics/traces/trace-123');

      // Should allow up to 30 requests (with time advancement to avoid burst)
      makeRequestsWithTimeAdvance(context, DIAGNOSTICS_RATE_LIMITS.TRACE_DETAIL_LIMIT);
      
      // All 30 should have passed without throwing
      expect(true).toBe(true);
    });

    it('should reject trace detail requests exceeding limit', () => {
      const context = createMockContext('/calc/diagnostics/traces/trace-123');

      // Exhaust the limit (with time advancement to avoid burst)
      makeRequestsWithTimeAdvance(context, DIAGNOSTICS_RATE_LIMITS.TRACE_DETAIL_LIMIT);

      // Advance time to reset burst window
      mockClock.advanceSeconds(1);

      // Next request should be rejected
      expect(() => guard.canActivate(context)).toThrow(HttpException);
    });
  });

  describe('Burst Protection (Separate Bucket)', () => {
    it('should reject burst exceeding 10 req/sec even if minute limit not exhausted', () => {
      const context = createMockContext('/calc/diagnostics/health');

      // Make 10 requests quickly (within burst limit)
      for (let i = 0; i < DIAGNOSTICS_RATE_LIMITS.BURST_LIMIT; i++) {
        expect(guard.canActivate(context)).toBe(true);
      }

      // 11th request should be rejected due to burst (even though minute limit is 60)
      try {
        guard.canActivate(context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.message).toContain('Burst limit exceeded');
        expect(response.details.retryAfter).toBe(1);
        expect(response.details.limitType).toBe('burst');
      }
    });

    it('should track burst and minute limits separately', () => {
      const context = createMockContext('/calc/diagnostics/health');

      // Make 10 requests (exhausts burst, uses 10 of 60 minute tokens)
      for (let i = 0; i < DIAGNOSTICS_RATE_LIMITS.BURST_LIMIT; i++) {
        guard.canActivate(context);
      }

      // Check bucket status
      const status = guard.getBucketStatus('tenant-123', 'health');
      expect(status).not.toBeNull();
      expect(status?.tokens).toBe(DIAGNOSTICS_RATE_LIMITS.GENERAL_LIMIT - DIAGNOSTICS_RATE_LIMITS.BURST_LIMIT); // 60 - 10 = 50
      expect(status?.burstRemaining).toBe(0); // Burst exhausted
    });

    it('should allow more requests after burst window expires', () => {
      const context = createMockContext('/calc/diagnostics/health');

      // Make 10 requests (exhausts burst)
      for (let i = 0; i < DIAGNOSTICS_RATE_LIMITS.BURST_LIMIT; i++) {
        guard.canActivate(context);
      }

      // Advance time by 1 second to reset burst window
      mockClock.advanceSeconds(1);

      // Should allow 10 more requests
      for (let i = 0; i < DIAGNOSTICS_RATE_LIMITS.BURST_LIMIT; i++) {
        expect(guard.canActivate(context)).toBe(true);
      }
    });
  });

  describe('Tenant Isolation', () => {
    it('should track limits separately per tenant', () => {
      const context1 = createMockContext('/calc/diagnostics/health', 'tenant-1');
      const context2 = createMockContext('/calc/diagnostics/health', 'tenant-2');

      // Exhaust tenant-1's limit (with time advancement to avoid burst)
      makeRequestsWithTimeAdvance(context1, DIAGNOSTICS_RATE_LIMITS.GENERAL_LIMIT);

      // tenant-2 should still have full limit
      expect(guard.canActivate(context2)).toBe(true);
    });
  });

  describe('Endpoint Type Detection', () => {
    it('should detect health endpoint', () => {
      const status = guard.getBucketStatus('tenant-123', 'health');
      expect(status).toBeNull(); // No bucket yet

      const context = createMockContext('/calc/diagnostics/health');
      guard.canActivate(context);

      const statusAfter = guard.getBucketStatus('tenant-123', 'health');
      expect(statusAfter).not.toBeNull();
      expect(statusAfter?.limit).toBe(DIAGNOSTICS_RATE_LIMITS.GENERAL_LIMIT);
    });

    it('should detect trace-detail endpoint', () => {
      const context = createMockContext('/calc/diagnostics/traces/abc-123');
      guard.canActivate(context);

      const status = guard.getBucketStatus('tenant-123', 'trace-detail');
      expect(status).not.toBeNull();
      expect(status?.limit).toBe(DIAGNOSTICS_RATE_LIMITS.TRACE_DETAIL_LIMIT);
    });

    it('should detect metrics endpoint', () => {
      const context = createMockContext('/calc/diagnostics/metrics');
      guard.canActivate(context);

      const status = guard.getBucketStatus('tenant-123', 'metrics');
      expect(status).not.toBeNull();
      expect(status?.limit).toBe(DIAGNOSTICS_RATE_LIMITS.GENERAL_LIMIT);
    });
  });

  describe('Minute Bucket Refill', () => {
    it('should refill tokens after 1 minute', () => {
      const context = createMockContext('/calc/diagnostics/health');

      // Exhaust the limit (with time advancement to avoid burst)
      makeRequestsWithTimeAdvance(context, DIAGNOSTICS_RATE_LIMITS.GENERAL_LIMIT);

      // Advance time by 1 minute to trigger refill
      mockClock.advanceSeconds(60);

      // Should allow requests again
      expect(guard.canActivate(context)).toBe(true);
    });
  });
});
