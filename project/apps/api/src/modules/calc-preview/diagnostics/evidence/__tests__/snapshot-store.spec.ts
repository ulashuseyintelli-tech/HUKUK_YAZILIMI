/**
 * Snapshot Store Tests
 * 
 * Phase 8 - Sprint 1B
 * 
 * Tests for InMemorySnapshotStore TTL, retention, and CRUD operations.
 * 
 * @see .kiro/specs/whatif-simulation/tasks.md Sprint 1B
 */

import { InMemorySnapshotStore } from '../snapshot-store.service';
import { MockClockService } from '../clock.service';
import { EvidenceSnapshot } from '../../diagnostics.types';

describe('InMemorySnapshotStore', () => {
  let store: InMemorySnapshotStore;
  let mockClock: MockClockService;

  const createSnapshot = (overrides: Partial<EvidenceSnapshot> = {}): EvidenceSnapshot => ({
    snapshotId: `snapshot-${Date.now()}-${Math.random()}`,
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
    ...overrides,
  });

  beforeEach(() => {
    mockClock = new MockClockService(new Date('2026-01-17T12:00:00Z'));
    store = new InMemorySnapshotStore(mockClock);
  });

  describe('save and get', () => {
    it('should save and retrieve snapshot', async () => {
      const snapshot = createSnapshot({ snapshotId: 'test-001' });
      
      const savedId = await store.save(snapshot);
      const retrieved = await store.get(savedId);

      expect(savedId).toBe('test-001');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.snapshotId).toBe('test-001');
      expect(retrieved?.createdAt).toBe('2026-01-17T12:00:00.000Z');
      expect(retrieved?.promoted).toBe(false);
    });

    it('should return null for non-existent snapshot', async () => {
      const result = await store.get('non-existent');
      expect(result).toBeNull();
    });

    it('should set expiresAt based on retention config', async () => {
      const snapshot = createSnapshot({ snapshotId: 'test-002' });
      await store.save(snapshot);
      
      const retrieved = await store.get('test-002');
      
      // Default retention: 72 hours
      const expectedExpiry = new Date('2026-01-17T12:00:00Z');
      expectedExpiry.setHours(expectedExpiry.getHours() + 72);
      
      expect(retrieved?.expiresAt).toBe(expectedExpiry.toISOString());
    });
  });

  describe('TTL - non-promoted snapshots', () => {
    it('should expire non-promoted snapshot after 72 hours', async () => {
      const snapshot = createSnapshot({ snapshotId: 'ttl-test-001' });
      await store.save(snapshot);

      // Advance 71 hours - should still be accessible
      mockClock.advanceSeconds(71 * 60 * 60);
      let retrieved = await store.get('ttl-test-001');
      expect(retrieved).not.toBeNull();

      // Advance 2 more hours (total 73) - should be expired
      mockClock.advanceSeconds(2 * 60 * 60);
      retrieved = await store.get('ttl-test-001');
      expect(retrieved).toBeNull();
    });

    it('should return null for expired snapshot on get', async () => {
      const snapshot = createSnapshot({ snapshotId: 'ttl-test-002' });
      await store.save(snapshot);

      // Advance past expiration
      mockClock.advanceSeconds(73 * 60 * 60);
      
      const retrieved = await store.get('ttl-test-002');
      expect(retrieved).toBeNull();
    });
  });

  describe('TTL - promoted snapshots', () => {
    it('should extend retention to 168 hours after markPromoted', async () => {
      const snapshot = createSnapshot({ snapshotId: 'promoted-001' });
      await store.save(snapshot);
      await store.markPromoted('promoted-001');

      // Advance 167 hours - should still be accessible
      mockClock.advanceSeconds(167 * 60 * 60);
      let retrieved = await store.get('promoted-001');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.promoted).toBe(true);

      // Advance 2 more hours (total 169) - should be expired
      mockClock.advanceSeconds(2 * 60 * 60);
      retrieved = await store.get('promoted-001');
      expect(retrieved).toBeNull();
    });

    it('should set promotedAt on first promote', async () => {
      const snapshot = createSnapshot({ snapshotId: 'promoted-002' });
      await store.save(snapshot);
      
      mockClock.advanceSeconds(3600); // 1 hour later
      await store.markPromoted('promoted-002');

      const retrieved = await store.get('promoted-002');
      expect(retrieved?.promotedAt).toBe('2026-01-17T13:00:00.000Z');
    });
  });

  describe('markPromoted - idempotent', () => {
    it('should not change expiresAt on second markPromoted call', async () => {
      const snapshot = createSnapshot({ snapshotId: 'idempotent-001' });
      await store.save(snapshot);
      
      // First promote
      await store.markPromoted('idempotent-001');
      const afterFirst = await store.get('idempotent-001');
      const firstExpiresAt = afterFirst?.expiresAt;
      const firstPromotedAt = afterFirst?.promotedAt;

      // Advance time
      mockClock.advanceSeconds(3600);

      // Second promote - should be idempotent
      await store.markPromoted('idempotent-001');
      const afterSecond = await store.get('idempotent-001');

      expect(afterSecond?.expiresAt).toBe(firstExpiresAt);
      expect(afterSecond?.promotedAt).toBe(firstPromotedAt);
    });

    it('should return error for non-existent snapshot', async () => {
      const result = await store.markPromoted('non-existent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('SNAPSHOT_NOT_FOUND');
    });
  });

  describe('deleteExpired', () => {
    it('should delete only expired snapshots', async () => {
      // Create 3 snapshots
      await store.save(createSnapshot({ snapshotId: 'del-001' }));
      await store.save(createSnapshot({ snapshotId: 'del-002' }));
      await store.save(createSnapshot({ snapshotId: 'del-003' }));

      // Advance 73 hours - all should expire
      mockClock.advanceSeconds(73 * 60 * 60);

      // Create one more (not expired)
      await store.save(createSnapshot({ snapshotId: 'del-004' }));

      const deletedCount = await store.deleteExpired();

      expect(deletedCount).toBe(3);
      expect(await store.get('del-001')).toBeNull();
      expect(await store.get('del-002')).toBeNull();
      expect(await store.get('del-003')).toBeNull();
      expect(await store.get('del-004')).not.toBeNull();
    });

    it('should return 0 on second call (idempotent)', async () => {
      await store.save(createSnapshot({ snapshotId: 'del-idem-001' }));
      
      mockClock.advanceSeconds(73 * 60 * 60);

      const firstDelete = await store.deleteExpired();
      const secondDelete = await store.deleteExpired();

      expect(firstDelete).toBe(1);
      expect(secondDelete).toBe(0);
    });

    it('should not delete promoted snapshots within extended retention', async () => {
      await store.save(createSnapshot({ snapshotId: 'del-promoted-001' }));
      await store.markPromoted('del-promoted-001');

      // Advance 100 hours (past 72h but within 168h)
      mockClock.advanceSeconds(100 * 60 * 60);

      const deletedCount = await store.deleteExpired();

      expect(deletedCount).toBe(0);
      expect(await store.get('del-promoted-001')).not.toBeNull();
    });
  });

  describe('listByIncident', () => {
    it('should return snapshots sorted by capturedAt DESC', async () => {
      // Create snapshots at different times
      await store.save(createSnapshot({ 
        snapshotId: 'list-001',
        incidentId: 'incident-A',
        capturedAt: '2026-01-17T10:00:00.000Z',
      }));
      
      await store.save(createSnapshot({ 
        snapshotId: 'list-002',
        incidentId: 'incident-A',
        capturedAt: '2026-01-17T12:00:00.000Z',
      }));
      
      await store.save(createSnapshot({ 
        snapshotId: 'list-003',
        incidentId: 'incident-A',
        capturedAt: '2026-01-17T11:00:00.000Z',
      }));

      const results = await store.listByIncident('incident-A');

      expect(results).toHaveLength(3);
      expect(results[0].snapshotId).toBe('list-002'); // 12:00 (newest)
      expect(results[1].snapshotId).toBe('list-003'); // 11:00
      expect(results[2].snapshotId).toBe('list-001'); // 10:00 (oldest)
    });

    it('should filter by incidentId', async () => {
      await store.save(createSnapshot({ snapshotId: 'filter-001', incidentId: 'incident-A' }));
      await store.save(createSnapshot({ snapshotId: 'filter-002', incidentId: 'incident-B' }));
      await store.save(createSnapshot({ snapshotId: 'filter-003', incidentId: 'incident-A' }));

      const resultsA = await store.listByIncident('incident-A');
      const resultsB = await store.listByIncident('incident-B');

      expect(resultsA).toHaveLength(2);
      expect(resultsB).toHaveLength(1);
    });

    it('should exclude expired snapshots', async () => {
      await store.save(createSnapshot({ snapshotId: 'expire-list-001', incidentId: 'incident-X' }));
      
      mockClock.advanceSeconds(73 * 60 * 60);
      
      await store.save(createSnapshot({ snapshotId: 'expire-list-002', incidentId: 'incident-X' }));

      const results = await store.listByIncident('incident-X');

      expect(results).toHaveLength(1);
      expect(results[0].snapshotId).toBe('expire-list-002');
    });

    it('should return empty array for unknown incident', async () => {
      const results = await store.listByIncident('unknown-incident');
      expect(results).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      await store.save(createSnapshot({ snapshotId: 'stats-001' }));
      await store.save(createSnapshot({ snapshotId: 'stats-002' }));
      await store.save(createSnapshot({ snapshotId: 'stats-003' }));
      await store.markPromoted('stats-002');

      const stats = await store.getStats();

      expect(stats.totalCount).toBe(3);
      expect(stats.promotedCount).toBe(1);
      expect(stats.expiredCount).toBe(0);
    });
  });

  describe('retention policy integration', () => {
    it('should use RETENTION_HOURS from retention-policy.ts', async () => {
      // This test verifies that the store uses the centralized retention policy
      const snapshot = createSnapshot({ snapshotId: 'policy-001' });
      await store.save(snapshot);

      // STANDARD = 72h from retention-policy.ts
      // Advance 71h59m - should still exist
      mockClock.advanceSeconds(71 * 60 * 60 + 59 * 60);
      expect(await store.get('policy-001')).not.toBeNull();

      // Advance 2 more minutes (total 72h1m) - should be expired
      mockClock.advanceSeconds(2 * 60);
      expect(await store.get('policy-001')).toBeNull();
    });
  });
});
