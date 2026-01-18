/**
 * Simulation Rate Limit Guard - Property & Unit Tests
 * 
 * Sprint 2F - Tasks 3.2, 3.3, 3.4, 3.5
 * 
 * Property Tests:
 * - Property 4: Concurrent Limit Enforcement
 * - Property 5: Per-Incident Limit Enforcement
 * - Property 6: Daily Limit with UTC Reset
 * - Property 7: Token Acquire/Release Round-Trip
 * 
 * **Validates: Requirements 3.5, 3.6, 3.7, 3.8, 3.9**
 */

import * as fc from 'fast-check';
import { SimulationRateLimitGuard } from '../guards/simulation-rate-limit.guard';
import { MockClockService } from '../../evidence/clock.service';
import { SIMULATION_RATE_LIMITS } from '../simulation-rate-limit.constants';

describe('SimulationRateLimitGuard', () => {
  let guard: SimulationRateLimitGuard;
  let clock: MockClockService;

  beforeEach(() => {
    clock = new MockClockService(new Date('2024-01-15T10:00:00Z'));
    guard = new SimulationRateLimitGuard(clock);
  });

  afterEach(() => {
    guard.reset();
  });

  // ============================================================================
  // Property 4: Concurrent Limit Enforcement
  // **Validates: Requirements 3.5**
  // ============================================================================

  describe('Feature: simulation-api-2f, Property 4: Concurrent Limit Enforcement', () => {
    it('should allow exactly 5 concurrent simulations per tenant', async () => {
      const tenantId = 'tenant-concurrent-test';
      const incidentIds = ['inc-1', 'inc-2', 'inc-3', 'inc-4', 'inc-5'];
      const runIds = ['run-1', 'run-2', 'run-3', 'run-4', 'run-5'];

      // Acquire 5 tokens - all should succeed
      for (let i = 0; i < 5; i++) {
        const result = await guard.acquireToken(tenantId, incidentIds[i], runIds[i]);
        expect(result.acquired).toBe(true);
      }

      // Verify concurrent count is 5
      const state = guard.getState(tenantId);
      expect(state.concurrent).toBe(5);
    });

    it('should reject 6th concurrent simulation', async () => {
      fc.assert(
        fc.asyncProperty(
          fc.array(fc.uuid(), { minLength: 6, maxLength: 6 })
            .filter(ids => new Set(ids).size === 6), // Ensure unique runIds
          async (runIds) => {
            // Create fresh guard and clock for each property test iteration
            const testClock = new MockClockService(new Date('2024-01-15T10:00:00Z'));
            const testGuard = new SimulationRateLimitGuard(testClock);
            const tenantId = 'tenant-prop4';

            // Acquire 5 tokens with different incidents
            for (let i = 0; i < 5; i++) {
              const result = await testGuard.acquireToken(tenantId, `inc-${i}`, runIds[i]);
              expect(result.acquired).toBe(true);
            }

            // 6th should fail with concurrent limit
            const result = await testGuard.acquireToken(tenantId, 'inc-5', runIds[5]);
            expect(result.acquired).toBe(false);
            expect(result.reason).toBe('concurrent');
          },
        ),
        { numRuns: 20 },
      );
    });

    it('should allow new simulation after releasing one', async () => {
      const tenantId = 'tenant-release-test';

      // Fill up concurrent slots
      for (let i = 0; i < 5; i++) {
        await guard.acquireToken(tenantId, `inc-${i}`, `run-${i}`);
      }

      // 6th should fail
      let result = await guard.acquireToken(tenantId, 'inc-new', 'run-new');
      expect(result.acquired).toBe(false);

      // Release one
      await guard.releaseToken(tenantId, 'inc-0', 'run-0');

      // Now 6th should succeed
      result = await guard.acquireToken(tenantId, 'inc-new', 'run-new');
      expect(result.acquired).toBe(true);
    });
  });

  // ============================================================================
  // Property 5: Per-Incident Limit Enforcement
  // **Validates: Requirements 3.6**
  // ============================================================================

  describe('Feature: simulation-api-2f, Property 5: Per-Incident Limit Enforcement', () => {
    it('should reject 2nd request within 1 minute for same incident', async () => {
      const tenantId = 'tenant-incident-test';
      const incidentId = 'inc-same';

      // First request succeeds
      const r1 = await guard.acquireToken(tenantId, incidentId, 'run-1');
      expect(r1.acquired).toBe(true);

      // Release the token (simulation completed)
      await guard.releaseToken(tenantId, incidentId, 'run-1');

      // Second request within 1 min fails (counter still active)
      clock.advanceSeconds(30);
      const r2 = await guard.acquireToken(tenantId, incidentId, 'run-2');
      expect(r2.acquired).toBe(false);
      expect(r2.reason).toBe('incident');
      expect(r2.retryAfterSec).toBeGreaterThan(0);
      expect(r2.retryAfterSec).toBeLessThanOrEqual(30);
    });

    it('should allow request after 1 minute TTL expires', async () => {
      const tenantId = 'tenant-ttl-test';
      const incidentId = 'inc-ttl';

      // First request
      const r1 = await guard.acquireToken(tenantId, incidentId, 'run-1');
      expect(r1.acquired).toBe(true);
      await guard.releaseToken(tenantId, incidentId, 'run-1');

      // Advance past TTL (60 seconds)
      clock.advanceSeconds(61);

      // Second request should succeed
      const r2 = await guard.acquireToken(tenantId, incidentId, 'run-2');
      expect(r2.acquired).toBe(true);
    });

    it('should track per-incident limits independently', async () => {
      fc.assert(
        fc.asyncProperty(
          fc.array(fc.uuid(), { minLength: 3, maxLength: 3 })
            .filter(ids => new Set(ids).size === 3), // Ensure unique incident IDs
          async (incidentIds) => {
            // Create fresh guard and clock for each property test iteration
            const testClock = new MockClockService(new Date('2024-01-15T10:00:00Z'));
            const testGuard = new SimulationRateLimitGuard(testClock);
            const tenantId = 'tenant-independent';

            // Each incident can have 1 simulation
            for (const incidentId of incidentIds) {
              const result = await testGuard.acquireToken(tenantId, incidentId, `run-${incidentId}`);
              expect(result.acquired).toBe(true);
              await testGuard.releaseToken(tenantId, incidentId, `run-${incidentId}`);
            }

            // Same incident cannot have 2nd within TTL (counter still active even after release)
            const r2 = await testGuard.acquireToken(tenantId, incidentIds[0], 'run-repeat');
            expect(r2.acquired).toBe(false);
            expect(r2.reason).toBe('incident');
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  // ============================================================================
  // Property 6: Daily Limit with UTC Reset
  // **Validates: Requirements 3.7, 2.6**
  // ============================================================================

  describe('Feature: simulation-api-2f, Property 6: Daily Limit with UTC Reset', () => {
    it('should reject 101st request on same UTC day', async () => {
      // Reset to start of day to have room for 100 requests
      clock.setTime(new Date('2024-01-15T00:00:00Z'));
      guard.reset();
      
      const tenantId = 'tenant-daily-test';

      // Exhaust daily limit (100) - use different incidents to avoid per-incident limit
      for (let i = 0; i < SIMULATION_RATE_LIMITS.daily; i++) {
        const result = await guard.acquireToken(tenantId, `inc-${i}`, `run-${i}`);
        expect(result.acquired).toBe(true);
        await guard.releaseToken(tenantId, `inc-${i}`, `run-${i}`);
        
        // Advance time to avoid per-incident limit, but stay within same day
        clock.advanceSeconds(61);
      }

      // 101st should fail
      const r101 = await guard.acquireToken(tenantId, 'inc-101', 'run-101');
      expect(r101.acquired).toBe(false);
      expect(r101.reason).toBe('daily');
    });

    it('should reset daily counter at UTC midnight', async () => {
      // Start near end of day
      clock.setTime(new Date('2024-01-15T23:00:00Z'));
      guard.reset();
      
      const tenantId = 'tenant-midnight-test';

      // Use up daily limit with minimal time advancement
      for (let i = 0; i < SIMULATION_RATE_LIMITS.daily; i++) {
        await guard.acquireToken(tenantId, `inc-${i}`, `run-${i}`);
        await guard.releaseToken(tenantId, `inc-${i}`, `run-${i}`);
        // Don't advance time much - just enough to avoid per-incident on same incident
      }

      // Verify limit reached
      let result = await guard.acquireToken(tenantId, 'inc-extra', 'run-extra');
      expect(result.acquired).toBe(false);
      expect(result.reason).toBe('daily');

      // Advance to next UTC day (00:01)
      clock.setTime(new Date('2024-01-16T00:01:00Z'));

      // First request of new day should succeed
      result = await guard.acquireToken(tenantId, 'inc-new-day', 'run-new-day');
      expect(result.acquired).toBe(true);
    });

    it('should track daily limits per tenant independently', async () => {
      const tenant1 = 'tenant-daily-1';
      const tenant2 = 'tenant-daily-2';

      // Tenant 1 uses some quota
      for (let i = 0; i < 50; i++) {
        await guard.acquireToken(tenant1, `inc-${i}`, `run-${i}`);
        await guard.releaseToken(tenant1, `inc-${i}`, `run-${i}`);
        clock.advanceSeconds(61);
      }

      // Tenant 2 should still have full quota
      const state2 = guard.getState(tenant2);
      expect(state2.daily).toBe(0);

      // Tenant 2 can use their quota
      const result = await guard.acquireToken(tenant2, 'inc-t2', 'run-t2');
      expect(result.acquired).toBe(true);
    });
  });

  // ============================================================================
  // Property 7: Token Acquire/Release Round-Trip
  // **Validates: Requirements 3.8, 3.9**
  // ============================================================================

  describe('Feature: simulation-api-2f, Property 7: Token Acquire/Release Round-Trip', () => {
    it('concurrent count increases by 1 on acquire and decreases by 1 on release', async () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            tenantId: fc.uuid(),
            incidentId: fc.uuid(),
            runId: fc.uuid(),
          }),
          async ({ tenantId, incidentId, runId }) => {
            // Create fresh guard and clock for each property test iteration
            const testClock = new MockClockService(new Date('2024-01-15T10:00:00Z'));
            const testGuard = new SimulationRateLimitGuard(testClock);

            // Initial state
            const before = testGuard.getState(tenantId);
            expect(before.concurrent).toBe(0);

            // Acquire
            const result = await testGuard.acquireToken(tenantId, incidentId, runId);
            expect(result.acquired).toBe(true);

            const during = testGuard.getState(tenantId);
            expect(during.concurrent).toBe(1);

            // Release
            await testGuard.releaseToken(tenantId, incidentId, runId);

            const after = testGuard.getState(tenantId);
            expect(after.concurrent).toBe(0);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('release is idempotent (multiple releases do not cause negative count)', async () => {
      const tenantId = 'tenant-idempotent';
      const incidentId = 'inc-idem';
      const runId = 'run-idem';

      await guard.acquireToken(tenantId, incidentId, runId);
      
      // Release multiple times
      await guard.releaseToken(tenantId, incidentId, runId);
      await guard.releaseToken(tenantId, incidentId, runId);
      await guard.releaseToken(tenantId, incidentId, runId);

      const state = guard.getState(tenantId);
      expect(state.concurrent).toBe(0);
      expect(state.concurrent).toBeGreaterThanOrEqual(0);
    });

    it('release only removes the specific runId from concurrent set', async () => {
      const tenantId = 'tenant-specific';

      // Acquire 3 tokens
      await guard.acquireToken(tenantId, 'inc-1', 'run-1');
      await guard.acquireToken(tenantId, 'inc-2', 'run-2');
      await guard.acquireToken(tenantId, 'inc-3', 'run-3');

      expect(guard.getState(tenantId).concurrent).toBe(3);

      // Release middle one
      await guard.releaseToken(tenantId, 'inc-2', 'run-2');

      expect(guard.getState(tenantId).concurrent).toBe(2);

      // Release first
      await guard.releaseToken(tenantId, 'inc-1', 'run-1');

      expect(guard.getState(tenantId).concurrent).toBe(1);
    });
  });

  // ============================================================================
  // 409 ALREADY_RUNNING Tests
  // ============================================================================

  describe('409 ALREADY_RUNNING - Incident Lock', () => {
    it('should return ALREADY_RUNNING when same incident has active simulation', async () => {
      const tenantId = 'tenant-lock-test';
      const incidentId = 'inc-locked';

      // First simulation starts
      const r1 = await guard.acquireToken(tenantId, incidentId, 'run-1');
      expect(r1.acquired).toBe(true);

      // Second attempt on same incident while first is running
      const r2 = await guard.acquireToken(tenantId, incidentId, 'run-2');
      expect(r2.acquired).toBe(false);
      expect(r2.reason).toBe('ALREADY_RUNNING');
      expect(r2.runId).toBe('run-1');
    });

    it('should allow new simulation after previous completes', async () => {
      const tenantId = 'tenant-lock-release';
      const incidentId = 'inc-lock-release';

      // First simulation
      await guard.acquireToken(tenantId, incidentId, 'run-1');
      
      // Complete first simulation
      await guard.releaseToken(tenantId, incidentId, 'run-1');

      // Advance past per-incident TTL
      clock.advanceSeconds(61);

      // Second simulation should succeed
      const r2 = await guard.acquireToken(tenantId, incidentId, 'run-2');
      expect(r2.acquired).toBe(true);
    });

    it('should release lock after lease TTL expires (crash recovery)', async () => {
      const tenantId = 'tenant-crash';
      const incidentId = 'inc-crash';

      // Simulation starts but "crashes" (no release called)
      await guard.acquireToken(tenantId, incidentId, 'run-crashed');

      // Advance past lease TTL (5 minutes)
      clock.advanceSeconds(SIMULATION_RATE_LIMITS.leaseTtlMs / 1000 + 1);

      // New simulation should succeed (lock expired)
      // Note: per-incident TTL (60s) also expired
      const r2 = await guard.acquireToken(tenantId, incidentId, 'run-recovery');
      expect(r2.acquired).toBe(true);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle rapid acquire/release cycles', async () => {
      const tenantId = 'tenant-rapid';

      for (let cycle = 0; cycle < 10; cycle++) {
        const result = await guard.acquireToken(tenantId, `inc-${cycle}`, `run-${cycle}`);
        expect(result.acquired).toBe(true);
        await guard.releaseToken(tenantId, `inc-${cycle}`, `run-${cycle}`);
        clock.advanceSeconds(61); // Avoid per-incident limit
      }

      // Should have used 10 of daily quota
      const state = guard.getState(tenantId);
      expect(state.daily).toBe(10);
      expect(state.concurrent).toBe(0);
    });

    it('should handle multiple tenants independently', async () => {
      const tenants = ['tenant-a', 'tenant-b', 'tenant-c'];

      // Each tenant acquires tokens
      for (const tenantId of tenants) {
        await guard.acquireToken(tenantId, 'inc-1', 'run-1');
        await guard.acquireToken(tenantId, 'inc-2', 'run-2');
      }

      // Each tenant should have 2 concurrent
      for (const tenantId of tenants) {
        const state = guard.getState(tenantId);
        expect(state.concurrent).toBe(2);
        expect(state.daily).toBe(2);
      }

      // Release from one tenant doesn't affect others
      await guard.releaseToken('tenant-a', 'inc-1', 'run-1');

      expect(guard.getState('tenant-a').concurrent).toBe(1);
      expect(guard.getState('tenant-b').concurrent).toBe(2);
      expect(guard.getState('tenant-c').concurrent).toBe(2);
    });
  });
});
