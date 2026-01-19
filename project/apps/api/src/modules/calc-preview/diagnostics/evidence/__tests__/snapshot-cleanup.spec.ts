/**
 * Snapshot Cleanup Service Tests
 * 
 * Phase 8 - Sprint 1B
 * Phase 9B.5 - Migrated to MockSnapshotStore
 * 
 * Tests for cleanup job concurrency and scheduling.
 * 
 * NOTE: deleteExpired() is a test helper method on MockSnapshotStore,
 * NOT part of ISnapshotStore interface. In production, cleanup is handled
 * by a separate cleanup job/service that goes directly to the repository.
 * 
 * @see .kiro/specs/whatif-simulation/tasks.md Sprint 1B
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 */

import { SnapshotCleanupService } from '../snapshot-cleanup.service';
import { MockSnapshotStore } from '../../simulation-api/__tests__/mock-snapshot-store';
import { MockClockService } from '../clock.service';
import { canonicalHash, canonicalStringify } from '../../simulation/determinism';

describe('SnapshotCleanupService', () => {
  let cleanupService: SnapshotCleanupService;
  let store: MockSnapshotStore;
  let mockClock: MockClockService;

  const TENANT_ID = 'tenant-001';

  // Helper to create test snapshot using new interface
  async function createSnapshot(id: string) {
    const now = mockClock.nowIso();
    const points = [
      {
        metric: 'error_rate' as const,
        value: 2.5,
        unit: '%',
        windowSec: 60,
        confidence: 0.9,
        freshnessSec: 30,
        source: 'app_metrics' as const,
        timestamp: now,
      },
    ];
    const calcResult = { points, capturedAt: now };
    const calcResultNorm = canonicalStringify(calcResult);
    const calcHash = canonicalHash(calcResult);

    return store.createSnapshot({
      snapshotId: id,
      tenantId: TENANT_ID,
      incidentId: 'incident-001',
      snapshotKind: 'CURRENT',
      verdict: 'PROCEED',
      driftScore: 0,
      calcResult,
      calcResultNorm,
      calcHash,
    });
  }

  beforeEach(() => {
    mockClock = new MockClockService(new Date('2026-01-17T12:00:00Z'));
    store = new MockSnapshotStore(mockClock);
    
    // Create cleanup service with store that has deleteExpired method
    // NOTE: In production, cleanup service would use repository directly
    cleanupService = new SnapshotCleanupService(store as any, { enabled: false });
  });

  afterEach(() => {
    cleanupService.stopCleanupJob();
  });

  describe('runCleanup', () => {
    it('should delete expired snapshots', async () => {
      await createSnapshot('cleanup-001');
      await createSnapshot('cleanup-002');

      // Advance past expiration (72h for STANDARD)
      mockClock.advanceSeconds(73 * 60 * 60);

      const deletedCount = await cleanupService.runCleanup();

      expect(deletedCount).toBe(2);
    });

    it('should return 0 when no expired snapshots', async () => {
      await createSnapshot('cleanup-003');

      const deletedCount = await cleanupService.runCleanup();

      expect(deletedCount).toBe(0);
    });

    it('should be idempotent - second call returns 0', async () => {
      await createSnapshot('cleanup-004');
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
      const slowStore = {
        ...store,
        deleteExpired: jest.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return 1;
        }),
      };

      const slowCleanupService = new SnapshotCleanupService(slowStore as any, { enabled: false });

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
      await createSnapshot('stats-001');
      mockClock.advanceSeconds(73 * 60 * 60);
      await cleanupService.runCleanup();

      const stats = cleanupService.getStats();

      expect(stats.totalDeletedCount).toBe(1);
      expect(stats.cleanupInProgress).toBe(false);
      expect(stats.enabled).toBe(false);
    });

    it('should accumulate totalDeletedCount', async () => {
      await createSnapshot('accum-001');
      mockClock.advanceSeconds(73 * 60 * 60);
      await cleanupService.runCleanup();

      await createSnapshot('accum-002');
      mockClock.advanceSeconds(73 * 60 * 60);
      await cleanupService.runCleanup();

      const stats = cleanupService.getStats();
      expect(stats.totalDeletedCount).toBe(2);
    });
  });

  describe('forceCleanup', () => {
    it('should trigger cleanup immediately', async () => {
      await createSnapshot('force-001');
      mockClock.advanceSeconds(73 * 60 * 60);

      const deletedCount = await cleanupService.forceCleanup();

      expect(deletedCount).toBe(1);
    });
  });

  describe('job lifecycle', () => {
    it('should not start job when disabled', () => {
      const disabledService = new SnapshotCleanupService(store as any, { enabled: false });
      disabledService.onModuleInit();

      const stats = disabledService.getStats();
      expect(stats.enabled).toBe(false);
    });

    it('should stop job on module destroy', () => {
      const enabledService = new SnapshotCleanupService(store as any, { 
        enabled: true,
        intervalMs: 60000,
      });
      
      enabledService.startCleanupJob();
      enabledService.onModuleDestroy();

      // Should not throw
      expect(() => enabledService.stopCleanupJob()).not.toThrow();
    });
  });

  // ============================================================================
  // LEGAL_HOLD Protection Tests
  // ============================================================================

  describe('LEGAL_HOLD protection', () => {
    it('should NOT delete LEGAL_HOLD snapshots during cleanup', async () => {
      await createSnapshot('legal-001');
      await store.applyLegalHold('legal-001');

      // Advance way past expiry
      mockClock.advanceSeconds(365 * 24 * 60 * 60);

      const deletedCount = await cleanupService.runCleanup();

      expect(deletedCount).toBe(0);

      const snapshot = await store.findById('legal-001');
      expect(snapshot).not.toBeNull();
      expect(snapshot?.retentionPolicy).toBe('LEGAL_HOLD');
    });

    it('should delete STANDARD but keep LEGAL_HOLD in same cleanup run', async () => {
      await createSnapshot('standard-001');
      await createSnapshot('legal-001');
      await store.applyLegalHold('legal-001');

      // Advance past STANDARD expiry
      mockClock.advanceSeconds(73 * 60 * 60);

      const deletedCount = await cleanupService.runCleanup();

      expect(deletedCount).toBe(1); // Only STANDARD deleted

      const standard = await store.findById('standard-001');
      const legal = await store.findById('legal-001');

      expect(standard).toBeNull();
      expect(legal).not.toBeNull();
    });
  });
});
