/**
 * Rate Limit Store - Property Tests
 * 
 * Phase 9A - Tasks 3.2, 3.4, 3.6, 3.8
 * 
 * Property Tests:
 * - Property 1: Per-Incident Rate Limit Lifecycle
 * - Property 2: Concurrent Tracking Lifecycle
 * - Property 3: Daily Counter Lifecycle
 * - Property 4: Incident Lock Lifecycle
 * 
 * These tests run against both InMemoryRateLimitStore and RedisRateLimitStore
 * to ensure interface compliance and behavioral equivalence.
 */

import * as fc from 'fast-check';
import { MockClockService } from '../../evidence/clock.service';
import { InMemoryRateLimitStore } from '../redis/in-memory-rate-limit-store';
import { IRateLimitStore } from '../redis/rate-limit-store.interface';

// ============================================================================
// Test Setup
// ============================================================================

type StoreFactory = (clock: MockClockService) => IRateLimitStore;

const storeFactories: [string, StoreFactory][] = [
  ['in-memory', (clock) => new InMemoryRateLimitStore(clock)],
  // Redis store will be added when integration tests are set up
  // ['redis', (clock) => new RedisRateLimitStore(mockRedis, clock, mockMetrics, testConfig)],
];

// ============================================================================
// Property 1: Per-Incident Rate Limit Lifecycle
// **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
// ============================================================================

describe.each(storeFactories)(
  'Property 1: Per-Incident Rate Limit Lifecycle (%s)',
  (_name, createStore) => {
    it('incrementing N times within TTL results in count N', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tenantId: fc.uuid(),
            incidentId: fc.uuid(),
            incrementCount: fc.integer({ min: 1, max: 10 }),
            ttlSec: fc.integer({ min: 30, max: 120 }),
          }),
          async ({ tenantId, incidentId, incrementCount, ttlSec }) => {
            const clock = new MockClockService(new Date('2024-01-15T10:00:00Z'));
            const store = createStore(clock);

            // Increment N times
            let lastResult;
            for (let i = 0; i < incrementCount; i++) {
              lastResult = await store.incrementIncidentCounter(tenantId, incidentId, ttlSec);
            }

            // Count should equal N
            expect(lastResult!.count).toBe(incrementCount);
            expect(lastResult!.ttlRemaining).toBeGreaterThan(0);
            expect(lastResult!.ttlRemaining).toBeLessThanOrEqual(ttlSec);

            await store.reset();
          },
        ),
        { numRuns: 50 },
      );
    });

    it('counter resets after TTL expires', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tenantId: fc.uuid(),
            incidentId: fc.uuid(),
            ttlSec: fc.integer({ min: 10, max: 60 }),
          }),
          async ({ tenantId, incidentId, ttlSec }) => {
            const clock = new MockClockService(new Date('2024-01-15T10:00:00Z'));
            const store = createStore(clock);

            // Increment once
            await store.incrementIncidentCounter(tenantId, incidentId, ttlSec);

            // Advance past TTL
            clock.advanceSeconds(ttlSec + 1);

            // Counter should be null (expired)
            const result = await store.getIncidentCounter(tenantId, incidentId);
            expect(result).toBeNull();

            // New increment should start from 1
            const newResult = await store.incrementIncidentCounter(tenantId, incidentId, ttlSec);
            expect(newResult.count).toBe(1);

            await store.reset();
          },
        ),
        { numRuns: 30 },
      );
    });
  },
);

// ============================================================================
// Property 2: Concurrent Tracking Lifecycle
// **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**
// ============================================================================

describe.each(storeFactories)(
  'Property 2: Concurrent Tracking Lifecycle (%s)',
  (_name, createStore) => {
    it('add/remove round-trip preserves count', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tenantId: fc.uuid(),
            runId: fc.uuid(),
            ttlSec: fc.integer({ min: 60, max: 300 }),
          }),
          async ({ tenantId, runId, ttlSec }) => {
            const clock = new MockClockService(new Date('2024-01-15T10:00:00Z'));
            const store = createStore(clock);

            // Initial count should be 0
            const before = await store.getConcurrentCount(tenantId);
            expect(before).toBe(0);

            // Add to set
            await store.addToConcurrentSet(tenantId, runId, ttlSec);
            const during = await store.getConcurrentCount(tenantId);
            expect(during).toBe(1);

            // Remove from set
            await store.removeFromConcurrentSet(tenantId, runId);
            const after = await store.getConcurrentCount(tenantId);
            expect(after).toBe(0);

            await store.reset();
          },
        ),
        { numRuns: 50 },
      );
    });

    it('expired entries are automatically cleaned up', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tenantId: fc.uuid(),
            runId: fc.uuid(),
            ttlSec: fc.integer({ min: 10, max: 60 }),
          }),
          async ({ tenantId, runId, ttlSec }) => {
            const clock = new MockClockService(new Date('2024-01-15T10:00:00Z'));
            const store = createStore(clock);

            // Add to set
            await store.addToConcurrentSet(tenantId, runId, ttlSec);
            expect(await store.getConcurrentCount(tenantId)).toBe(1);

            // Advance past TTL
            clock.advanceSeconds(ttlSec + 1);

            // Count should be 0 (expired entry cleaned up)
            const count = await store.getConcurrentCount(tenantId);
            expect(count).toBe(0);

            await store.reset();
          },
        ),
        { numRuns: 30 },
      );
    });

    it('multiple runIds tracked independently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tenantId: fc.uuid(),
            runIds: fc.array(fc.uuid(), { minLength: 2, maxLength: 5 })
              .filter(ids => new Set(ids).size === ids.length), // Unique
          }),
          async ({ tenantId, runIds }) => {
            const clock = new MockClockService(new Date('2024-01-15T10:00:00Z'));
            const store = createStore(clock);
            const ttlSec = 300;

            // Add all runIds
            for (const runId of runIds) {
              await store.addToConcurrentSet(tenantId, runId, ttlSec);
            }
            expect(await store.getConcurrentCount(tenantId)).toBe(runIds.length);

            // Remove one
            await store.removeFromConcurrentSet(tenantId, runIds[0]);
            expect(await store.getConcurrentCount(tenantId)).toBe(runIds.length - 1);

            await store.reset();
          },
        ),
        { numRuns: 30 },
      );
    });
  },
);

// ============================================================================
// Property 3: Daily Counter Lifecycle
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
// ============================================================================

describe.each(storeFactories)(
  'Property 3: Daily Counter Lifecycle (%s)',
  (_name, createStore) => {
    it('daily counter increments correctly within same day', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tenantId: fc.uuid(),
            incrementCount: fc.integer({ min: 1, max: 20 }),
          }),
          async ({ tenantId, incrementCount }) => {
            const clock = new MockClockService(new Date('2024-01-15T10:00:00Z'));
            const store = createStore(clock);
            const utcDate = '2024-01-15';

            // Increment N times
            let lastCount = 0;
            for (let i = 0; i < incrementCount; i++) {
              lastCount = await store.incrementDailyCounter(tenantId, utcDate);
            }

            expect(lastCount).toBe(incrementCount);

            // Get should return same count
            const getCount = await store.getDailyCounter(tenantId, utcDate);
            expect(getCount).toBe(incrementCount);

            await store.reset();
          },
        ),
        { numRuns: 30 },
      );
    });

    it('different UTC days have independent counters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tenantId: fc.uuid(),
          }),
          async ({ tenantId }) => {
            const clock = new MockClockService(new Date('2024-01-15T10:00:00Z'));
            const store = createStore(clock);

            // Increment on day 1
            await store.incrementDailyCounter(tenantId, '2024-01-15');
            await store.incrementDailyCounter(tenantId, '2024-01-15');

            // Increment on day 2
            await store.incrementDailyCounter(tenantId, '2024-01-16');

            // Each day has independent count
            expect(await store.getDailyCounter(tenantId, '2024-01-15')).toBe(2);
            expect(await store.getDailyCounter(tenantId, '2024-01-16')).toBe(1);
            expect(await store.getDailyCounter(tenantId, '2024-01-17')).toBe(0);

            await store.reset();
          },
        ),
        { numRuns: 20 },
      );
    });
  },
);

// ============================================================================
// Property 4: Incident Lock Lifecycle
// **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
// ============================================================================

describe.each(storeFactories)(
  'Property 4: Incident Lock Lifecycle (%s)',
  (_name, createStore) => {
    it('lock acquire succeeds only if no lock exists', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tenantId: fc.uuid(),
            incidentId: fc.uuid(),
            runId1: fc.uuid(),
            runId2: fc.uuid(),
            ttlSec: fc.integer({ min: 60, max: 300 }),
          }).filter(r => r.runId1 !== r.runId2),
          async ({ tenantId, incidentId, runId1, runId2, ttlSec }) => {
            const clock = new MockClockService(new Date('2024-01-15T10:00:00Z'));
            const store = createStore(clock);

            // First acquire succeeds
            const r1 = await store.acquireIncidentLock(tenantId, incidentId, runId1, ttlSec);
            expect(r1.acquired).toBe(true);

            // Second acquire fails with existing runId
            const r2 = await store.acquireIncidentLock(tenantId, incidentId, runId2, ttlSec);
            expect(r2.acquired).toBe(false);
            expect(r2.existingRunId).toBe(runId1);

            await store.reset();
          },
        ),
        { numRuns: 50 },
      );
    });

    it('release only succeeds if runId matches', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tenantId: fc.uuid(),
            incidentId: fc.uuid(),
            runId1: fc.uuid(),
            runId2: fc.uuid(),
            ttlSec: fc.integer({ min: 60, max: 300 }),
          }).filter(r => r.runId1 !== r.runId2),
          async ({ tenantId, incidentId, runId1, runId2, ttlSec }) => {
            const clock = new MockClockService(new Date('2024-01-15T10:00:00Z'));
            const store = createStore(clock);

            // Acquire lock with runId1
            await store.acquireIncidentLock(tenantId, incidentId, runId1, ttlSec);

            // Release with wrong runId fails
            const wrongRelease = await store.releaseIncidentLock(tenantId, incidentId, runId2);
            expect(wrongRelease).toBe(false);

            // Lock still held
            const r2 = await store.acquireIncidentLock(tenantId, incidentId, runId2, ttlSec);
            expect(r2.acquired).toBe(false);

            // Release with correct runId succeeds
            const correctRelease = await store.releaseIncidentLock(tenantId, incidentId, runId1);
            expect(correctRelease).toBe(true);

            // Now new acquire succeeds
            const r3 = await store.acquireIncidentLock(tenantId, incidentId, runId2, ttlSec);
            expect(r3.acquired).toBe(true);

            await store.reset();
          },
        ),
        { numRuns: 30 },
      );
    });

    it('expired locks allow new acquisitions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tenantId: fc.uuid(),
            incidentId: fc.uuid(),
            runId1: fc.uuid(),
            runId2: fc.uuid(),
            ttlSec: fc.integer({ min: 10, max: 60 }),
          }).filter(r => r.runId1 !== r.runId2),
          async ({ tenantId, incidentId, runId1, runId2, ttlSec }) => {
            const clock = new MockClockService(new Date('2024-01-15T10:00:00Z'));
            const store = createStore(clock);

            // Acquire lock
            await store.acquireIncidentLock(tenantId, incidentId, runId1, ttlSec);

            // Advance past TTL
            clock.advanceSeconds(ttlSec + 1);

            // New acquire should succeed (lock expired)
            const r2 = await store.acquireIncidentLock(tenantId, incidentId, runId2, ttlSec);
            expect(r2.acquired).toBe(true);

            await store.reset();
          },
        ),
        { numRuns: 30 },
      );
    });
  },
);

// ============================================================================
// Property 8: Test Compatibility (Interface Compliance)
// **Validates: Requirements 8.3**
// ============================================================================

describe.each(storeFactories)(
  'Property 8: Test Compatibility (%s)',
  (_name, createStore) => {
    it('all interface methods are implemented and callable', async () => {
      const clock = new MockClockService(new Date('2024-01-15T10:00:00Z'));
      const store = createStore(clock);

      // Verify all methods exist and are callable
      expect(typeof store.incrementIncidentCounter).toBe('function');
      expect(typeof store.getIncidentCounter).toBe('function');
      expect(typeof store.addToConcurrentSet).toBe('function');
      expect(typeof store.removeFromConcurrentSet).toBe('function');
      expect(typeof store.getConcurrentCount).toBe('function');
      expect(typeof store.incrementDailyCounter).toBe('function');
      expect(typeof store.getDailyCounter).toBe('function');
      expect(typeof store.acquireIncidentLock).toBe('function');
      expect(typeof store.releaseIncidentLock).toBe('function');
      expect(typeof store.healthCheck).toBe('function');
      expect(typeof store.cleanup).toBe('function');
      expect(typeof store.reset).toBe('function');

      // Verify health check works
      const healthy = await store.healthCheck();
      expect(healthy).toBe(true);

      await store.reset();
    });
  },
);
