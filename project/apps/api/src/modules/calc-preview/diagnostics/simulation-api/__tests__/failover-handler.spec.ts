/**
 * Failover Handler - Property & Unit Tests
 * 
 * Phase 9A - Tasks 5.2, 6.3
 * 
 * Property Tests:
 * - Property 5: Connection Pool Scaling (simplified for failover)
 * - Property 6: Failover State Machine
 * 
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6**
 */

import * as fc from 'fast-check';
import { MockClockService } from '../../evidence/clock.service';
import { InMemoryRateLimitStore } from '../redis/in-memory-rate-limit-store';
import { IRateLimitStore } from '../redis/rate-limit-store.interface';
import {
  FailoverHandler,
  FailoverConfig,
} from '../redis/failover-handler';
import { NoOpRateLimitMetrics } from '../redis/rate-limit-metrics';

// ============================================================================
// Mock Failing Store
// ============================================================================

class FailingRateLimitStore implements IRateLimitStore {
  private failureCount = 0;
  private shouldFail = true;

  constructor(private readonly delegate: IRateLimitStore) {}

  setShouldFail(fail: boolean): void {
    this.shouldFail = fail;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  private maybeThrow(): void {
    if (this.shouldFail) {
      this.failureCount++;
      throw new Error('Simulated Redis failure');
    }
  }

  async incrementIncidentCounter(tenantId: string, incidentId: string, ttlSec: number) {
    this.maybeThrow();
    return this.delegate.incrementIncidentCounter(tenantId, incidentId, ttlSec);
  }

  async getIncidentCounter(tenantId: string, incidentId: string) {
    this.maybeThrow();
    return this.delegate.getIncidentCounter(tenantId, incidentId);
  }

  async addToConcurrentSet(tenantId: string, runId: string, ttlSec: number) {
    this.maybeThrow();
    return this.delegate.addToConcurrentSet(tenantId, runId, ttlSec);
  }

  async removeFromConcurrentSet(tenantId: string, runId: string) {
    this.maybeThrow();
    return this.delegate.removeFromConcurrentSet(tenantId, runId);
  }

  async getConcurrentCount(tenantId: string) {
    this.maybeThrow();
    return this.delegate.getConcurrentCount(tenantId);
  }

  async incrementDailyCounter(tenantId: string, utcDate: string) {
    this.maybeThrow();
    return this.delegate.incrementDailyCounter(tenantId, utcDate);
  }

  async getDailyCounter(tenantId: string, utcDate: string) {
    this.maybeThrow();
    return this.delegate.getDailyCounter(tenantId, utcDate);
  }

  async acquireIncidentLock(tenantId: string, incidentId: string, runId: string, ttlSec: number) {
    this.maybeThrow();
    return this.delegate.acquireIncidentLock(tenantId, incidentId, runId, ttlSec);
  }

  async releaseIncidentLock(tenantId: string, incidentId: string, runId: string) {
    this.maybeThrow();
    return this.delegate.releaseIncidentLock(tenantId, incidentId, runId);
  }

  async healthCheck() {
    if (this.shouldFail) return false;
    return this.delegate.healthCheck();
  }

  async cleanup() {
    return this.delegate.cleanup();
  }

  async reset() {
    this.failureCount = 0;
    return this.delegate.reset();
  }
}

// ============================================================================
// Test Setup
// ============================================================================

describe('FailoverHandler', () => {
  let clock: MockClockService;
  let primaryStore: FailingRateLimitStore;
  let fallbackStore: InMemoryRateLimitStore;
  let metrics: NoOpRateLimitMetrics;
  let handler: FailoverHandler;

  const testConfig: FailoverConfig = {
    maxConsecutiveFailures: 3,
    circuitOpenDurationMs: 30_000,
    reconnectIntervalMs: 5_000,
  };

  beforeEach(() => {
    clock = new MockClockService(new Date('2024-01-15T10:00:00Z'));
    const primaryDelegate = new InMemoryRateLimitStore(clock);
    primaryStore = new FailingRateLimitStore(primaryDelegate);
    fallbackStore = new InMemoryRateLimitStore(clock);
    metrics = new NoOpRateLimitMetrics();
    handler = new FailoverHandler(primaryStore, fallbackStore, clock, metrics, testConfig);
  });

  afterEach(() => {
    handler.destroy();
  });

  // ============================================================================
  // Property 6: Failover State Machine
  // **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6**
  // ============================================================================

  describe('Property 6: Failover State Machine', () => {
    it('starts in HEALTHY state', () => {
      const status = handler.getStatus();
      expect(status.state).toBe('HEALTHY');
      expect(status.consecutiveFailures).toBe(0);
      expect(status.usingFallback).toBe(false);
    });

    it('transitions to DEGRADED on first failure', async () => {
      primaryStore.setShouldFail(true);

      // Operation should succeed (using fallback)
      const result = await handler.incrementIncidentCounter('tenant-1', 'inc-1', 60);
      expect(result.count).toBe(1);

      const status = handler.getStatus();
      expect(status.state).toBe('DEGRADED');
      expect(status.consecutiveFailures).toBe(1);
      expect(status.usingFallback).toBe(true);
    });

    it('transitions to CIRCUIT_OPEN after maxConsecutiveFailures', async () => {
      primaryStore.setShouldFail(true);

      // Trigger 3 failures
      for (let i = 0; i < testConfig.maxConsecutiveFailures; i++) {
        await handler.incrementIncidentCounter('tenant-1', `inc-${i}`, 60);
      }

      const status = handler.getStatus();
      expect(status.state).toBe('CIRCUIT_OPEN');
      expect(status.consecutiveFailures).toBe(testConfig.maxConsecutiveFailures);
      expect(status.circuitOpenUntil).toBeDefined();
    });

    it('returns to HEALTHY on success after DEGRADED', async () => {
      primaryStore.setShouldFail(true);

      // Enter DEGRADED
      await handler.incrementIncidentCounter('tenant-1', 'inc-1', 60);
      expect(handler.getStatus().state).toBe('DEGRADED');

      // Primary recovers
      primaryStore.setShouldFail(false);

      // Next operation should succeed with primary
      await handler.incrementIncidentCounter('tenant-1', 'inc-2', 60);

      const status = handler.getStatus();
      expect(status.state).toBe('HEALTHY');
      expect(status.consecutiveFailures).toBe(0);
    });

    it('circuit opens for configured duration then tries primary again', async () => {
      primaryStore.setShouldFail(true);

      // Open circuit
      for (let i = 0; i < testConfig.maxConsecutiveFailures; i++) {
        await handler.incrementIncidentCounter('tenant-1', `inc-${i}`, 60);
      }
      expect(handler.getStatus().state).toBe('CIRCUIT_OPEN');

      // Advance time past circuit open duration
      clock.advanceSeconds(testConfig.circuitOpenDurationMs / 1000 + 1);

      // Primary still failing - should try primary, fail, use fallback
      await handler.incrementIncidentCounter('tenant-1', 'inc-new', 60);

      // Should be in DEGRADED (tried primary, failed)
      expect(handler.getStatus().state).toBe('DEGRADED');
    });

    it('circuitOpenUntil is cleared when leaving CIRCUIT_OPEN state', async () => {
      primaryStore.setShouldFail(true);

      // Open circuit
      for (let i = 0; i < testConfig.maxConsecutiveFailures; i++) {
        await handler.incrementIncidentCounter('tenant-1', `inc-${i}`, 60);
      }
      
      const openStatus = handler.getStatus();
      expect(openStatus.state).toBe('CIRCUIT_OPEN');
      expect(openStatus.circuitOpenUntil).toBeDefined();

      // Advance time past circuit open duration
      clock.advanceSeconds(testConfig.circuitOpenDurationMs / 1000 + 1);

      // Trigger transition to DEGRADED
      await handler.incrementIncidentCounter('tenant-1', 'inc-new', 60);

      // INVARIANT: circuitOpenUntil must be undefined when not in CIRCUIT_OPEN
      const degradedStatus = handler.getStatus();
      expect(degradedStatus.state).toBe('DEGRADED');
      expect(degradedStatus.circuitOpenUntil).toBeUndefined();
    });

    it('property: state transitions follow valid paths', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.boolean(), { minLength: 5, maxLength: 20 }), // Sequence of success/failure
          async (outcomes) => {
            const testClock = new MockClockService(new Date('2024-01-15T10:00:00Z'));
            const primaryDelegate = new InMemoryRateLimitStore(testClock);
            const testPrimary = new FailingRateLimitStore(primaryDelegate);
            const testFallback = new InMemoryRateLimitStore(testClock);
            const testMetrics = new NoOpRateLimitMetrics();
            const testHandler = new FailoverHandler(
              testPrimary,
              testFallback,
              testClock,
              testMetrics,
              testConfig,
            );

            let prevState = testHandler.getStatus().state;

            for (let i = 0; i < outcomes.length; i++) {
              const shouldSucceed = outcomes[i];
              testPrimary.setShouldFail(!shouldSucceed);

              // Advance time occasionally to allow circuit to close
              if (i % 5 === 0) {
                testClock.advanceSeconds(35); // Past circuit open duration
              }

              await testHandler.incrementIncidentCounter('tenant', `inc-${i}`, 60);

              const currentState = testHandler.getStatus().state;

              // Valid state transitions:
              // HEALTHY -> HEALTHY (success)
              // HEALTHY -> DEGRADED (failure)
              // DEGRADED -> HEALTHY (success)
              // DEGRADED -> DEGRADED (failure, < max)
              // DEGRADED -> CIRCUIT_OPEN (failure, >= max)
              // CIRCUIT_OPEN -> CIRCUIT_OPEN (within timeout)
              // CIRCUIT_OPEN -> DEGRADED (timeout expired, primary fails)
              // CIRCUIT_OPEN -> HEALTHY (timeout expired, primary succeeds)

              const validTransitions: Record<string, string[]> = {
                HEALTHY: ['HEALTHY', 'DEGRADED'],
                DEGRADED: ['HEALTHY', 'DEGRADED', 'CIRCUIT_OPEN'],
                CIRCUIT_OPEN: ['CIRCUIT_OPEN', 'DEGRADED', 'HEALTHY'],
              };

              expect(validTransitions[prevState]).toContain(currentState);

              // STATE INVARIANT: circuitOpenUntil must be undefined when not in CIRCUIT_OPEN
              const status = testHandler.getStatus();
              if (status.state !== 'CIRCUIT_OPEN') {
                expect(status.circuitOpenUntil).toBeUndefined();
              }

              prevState = currentState;
            }

            testHandler.destroy();
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  // ============================================================================
  // Fallback Behavior Tests
  // ============================================================================

  describe('Fallback Behavior', () => {
    it('operations succeed using fallback when primary fails', async () => {
      primaryStore.setShouldFail(true);

      // All operations should succeed via fallback
      const incResult = await handler.incrementIncidentCounter('tenant-1', 'inc-1', 60);
      expect(incResult.count).toBe(1);

      await handler.addToConcurrentSet('tenant-1', 'run-1', 300);
      const concurrentCount = await handler.getConcurrentCount('tenant-1');
      expect(concurrentCount).toBe(1);

      const dailyCount = await handler.incrementDailyCounter('tenant-1', '2024-01-15');
      expect(dailyCount).toBe(1);

      const lockResult = await handler.acquireIncidentLock('tenant-1', 'inc-1', 'run-1', 300);
      expect(lockResult.acquired).toBe(true);
    });

    it('fallback store maintains state independently', async () => {
      primaryStore.setShouldFail(true);

      // Use fallback
      await handler.incrementIncidentCounter('tenant-1', 'inc-1', 60);
      await handler.incrementIncidentCounter('tenant-1', 'inc-1', 60);

      // Fallback should have count 2
      const fallbackResult = await fallbackStore.getIncidentCounter('tenant-1', 'inc-1');
      expect(fallbackResult?.count).toBe(2);
    });
  });

  // ============================================================================
  // Health Check Tests
  // ============================================================================

  describe('Health Check', () => {
    it('reports primary health status', async () => {
      primaryStore.setShouldFail(false);
      expect(await handler.healthCheck()).toBe(true);

      primaryStore.setShouldFail(true);
      expect(await handler.healthCheck()).toBe(false);
    });
  });

  // ============================================================================
  // Reset Tests
  // ============================================================================

  describe('Reset', () => {
    it('resets both stores and state', async () => {
      primaryStore.setShouldFail(true);

      // Enter degraded state
      await handler.incrementIncidentCounter('tenant-1', 'inc-1', 60);
      expect(handler.getStatus().state).toBe('DEGRADED');

      // Reset
      await handler.reset();

      // State should be healthy
      expect(handler.getStatus().state).toBe('HEALTHY');
      expect(handler.getStatus().consecutiveFailures).toBe(0);
    });
  });
});
