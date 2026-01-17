/**
 * Snapshot Cleanup Service Tests
 * 
 * Phase 8 - Sprint 1B
 * 
 * Tests for cleanup job concurrency and scheduling.
 * 
 * @see .kiro/specs/whatif-simulation/tasks.md Sprint 1B
 */

import { SnapshotCleanupService } from '../snapshot-cleanup.service';
import { InMemorySnapshotStore } from '../snapshot-store.service';
import { MockClockService } from '../clock.service';
import { EvidenceSnapshot } from '../../diagnostics.types';

describe('SnapshotCleanupService', () => {
  let cleanupService: SnapshotCleanupService;
  let store: InMemorySnapshotStore;
  let mockClock: MockClockService;

  const createSnapshot = (id: string): EvidenceSnapshot => ({
    snapshotId: id,
    tenantId: 'tenant-001',
    incidentId: 'incident-001',
    capturedAt: mockClock.nowIso(),
    points: [
      {
        metric: 'error_rate',
        value: 2.5,
        unit: '%',
        windowSec: 60,
        confidence: 0.9,
        freshnessSec: 30,
        source: 'app_metrics',
        timestamp: mockClock.nowIso(),
      },
    ],
  });

  beforeEach(() => {
    mockClock = new MockClockService(new Date('2026-01-17T12:00:00Z'));
    store = new InMemorySnapshotStore(mockClock);
    cleanupService = new SnapshotCleanupService(store, { enabled: false }); // Disable auto-start
  });

  afterEach(() => {
    cleanupService.stopCleanupJob();
  });

  describe('runCleanup', () => {
    it('should delete expired snapshots', async () => {
      await store.save(createSnapshot('cleanup-001'));
      await store.save(createSnapshot('cleanup-002'));

      // Advance past expiration
      mockClock.advanceSeconds(73 * 60 * 60);

      const deletedCount = await cleanupService.runCleanup();

      expect(deletedCount).toBe(2);
    });

    it('should return 0 when no expired snapshots', async () => {
      await store.save(createSnapshot('cleanup-003'));

      const deletedCount = await cleanupService.runCleanup();

      expect(deletedCount).toBe(0);
    });

    it('should be idempotent - second call returns 0', async () => {
      await store.save(createSnapshot('cleanup-004'));
      mockClock.advanceSeconds(73 * 60 * 60);

      const first = await cleanupService.runCleanup();
      const second = await cleanupService.runCleanup();

      expect(first).toBe(1);
      expect(second).toBe(0);
    });
  });

  describe('concurrency guard', () => {
    it('should skip cleanup if already in progress', async () => {
      // Create a slow store that delays deleteExpired
      const slowStore: InMemorySnapshotStore = {
        ...store,
        deleteExpired: jest.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return 1;
        }),
      } as unknown as InMemorySnapshotStore;

      const slowCleanupService = new SnapshotCleanupService(slowStore, { enabled: false });

      // Start two cleanups simultaneously
      const cleanup1 = slowCleanupService.runCleanup();
      const cleanup2 = slowCleanupService.runCleanup();

      const [result1, result2] = await Promise.all([cleanup1, cleanup2]);

      // One should run, one should skip
      expect(result1 + result2).toBe(1); // Only one actually ran
    });
  });

  describe('getStats', () => {
    it('should return cleanup statistics', async () => {
      await store.save(createSnapshot('stats-001'));
      mockClock.advanceSeconds(73 * 60 * 60);
      await cleanupService.runCleanup();

      const stats = cleanupService.getStats();

      expect(stats.totalDeletedCount).toBe(1);
      expect(stats.cleanupInProgress).toBe(false);
      expect(stats.enabled).toBe(false);
    });

    it('should accumulate totalDeletedCount', async () => {
      await store.save(createSnapshot('accum-001'));
      mockClock.advanceSeconds(73 * 60 * 60);
      await cleanupService.runCleanup();

      await store.save(createSnapshot('accum-002'));
      mockClock.advanceSeconds(73 * 60 * 60);
      await cleanupService.runCleanup();

      const stats = cleanupService.getStats();
      expect(stats.totalDeletedCount).toBe(2);
    });
  });

  describe('forceCleanup', () => {
    it('should trigger cleanup immediately', async () => {
      await store.save(createSnapshot('force-001'));
      mockClock.advanceSeconds(73 * 60 * 60);

      const deletedCount = await cleanupService.forceCleanup();

      expect(deletedCount).toBe(1);
    });
  });

  describe('job lifecycle', () => {
    it('should not start job when disabled', () => {
      const disabledService = new SnapshotCleanupService(store, { enabled: false });
      disabledService.onModuleInit();

      const stats = disabledService.getStats();
      expect(stats.enabled).toBe(false);
    });

    it('should stop job on module destroy', () => {
      const enabledService = new SnapshotCleanupService(store, { 
        enabled: true,
        intervalMs: 60000,
      });
      
      enabledService.startCleanupJob();
      enabledService.onModuleDestroy();

      // Should not throw
      expect(() => enabledService.stopCleanupJob()).not.toThrow();
    });
  });
});
