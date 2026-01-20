/**
 * LEGAL_HOLD Retention Tests
 * 
 * Phase 8 - Sprint 2A
 * Phase 9B.5 - Migrated to MockSnapshotStore + tenantId-aware
 * 
 * Tests for LEGAL_HOLD retention policy.
 * Key guarantee: LEGAL_HOLD snapshots are NEVER deleted by deleteExpired()
 * 
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 */

import { MockSnapshotStore } from '../../simulation-api/__tests__/mock-snapshot-store';
import { MockClockService } from '../../evidence/clock.service';
import { canonicalHash, canonicalStringify } from '../determinism';

describe('LEGAL_HOLD Retention', () => {
  let store: MockSnapshotStore;
  let clock: MockClockService;

  const baseTime = new Date('2026-01-17T12:00:00Z');
  const TENANT_ID = 'tenant-001';

  beforeEach(() => {
    clock = new MockClockService(baseTime);
    store = new MockSnapshotStore(clock);
  });

  // Helper to create test snapshot using new interface
  async function createSnapshot(id: string) {
    const now = clock.nowIso();
    const points = [
      {
        metric: 'error_rate' as const,
        value: 0.05,
        unit: '%',
        windowSec: 300,
        confidence: 0.9,
        freshnessSec: 30,
        source: 'prometheus' as const,
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

  describe('setRetentionPolicy', () => {
    it('should set LEGAL_HOLD policy', async () => {
      await createSnapshot('legal-001');
      await store.setRetentionPolicy(TENANT_ID, 'legal-001', 'LEGAL_HOLD');

      const snapshot = await store.findById('legal-001');
      expect(snapshot?.retentionPolicy).toBe('LEGAL_HOLD');
      expect(snapshot?.expiresAt).toBeUndefined();
    });

    it('should allow changing from STANDARD to LEGAL_HOLD', async () => {
      await createSnapshot('legal-002');
      
      let snapshot = await store.findById('legal-002');
      expect(snapshot?.retentionPolicy).toBe('STANDARD');
      expect(snapshot?.expiresAt).toBeDefined();

      await store.setRetentionPolicy(TENANT_ID, 'legal-002', 'LEGAL_HOLD');
      
      snapshot = await store.findById('legal-002');
      expect(snapshot?.retentionPolicy).toBe('LEGAL_HOLD');
      expect(snapshot?.expiresAt).toBeUndefined();
    });

    it('should REJECT changing from LEGAL_HOLD to STANDARD (downgrade forbidden)', async () => {
      await createSnapshot('legal-003');
      await store.setRetentionPolicy(TENANT_ID, 'legal-003', 'LEGAL_HOLD');
      
      let snapshot = await store.findById('legal-003');
      expect(snapshot?.expiresAt).toBeUndefined();

      // Attempt downgrade - should be rejected
      const result = await store.setRetentionPolicy(TENANT_ID, 'legal-003', 'STANDARD');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('RETENTION_DOWNGRADE_FORBIDDEN');
      
      // Policy should remain LEGAL_HOLD
      snapshot = await store.findById('legal-003');
      expect(snapshot?.retentionPolicy).toBe('LEGAL_HOLD');
      expect(snapshot?.expiresAt).toBeUndefined();
    });

    it('should REJECT changing from LEGAL_HOLD to PROMOTED (downgrade forbidden)', async () => {
      await createSnapshot('legal-004');
      await store.setRetentionPolicy(TENANT_ID, 'legal-004', 'LEGAL_HOLD');

      const result = await store.setRetentionPolicy(TENANT_ID, 'legal-004', 'PROMOTED');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('RETENTION_DOWNGRADE_FORBIDDEN');
      
      const snapshot = await store.findById('legal-004');
      expect(snapshot?.retentionPolicy).toBe('LEGAL_HOLD');
    });
  });

  describe('deleteExpired with LEGAL_HOLD', () => {
    it('should NOT delete LEGAL_HOLD snapshots even after expiry time', async () => {
      // Save and set to LEGAL_HOLD
      await createSnapshot('legal-never-delete');
      await store.setRetentionPolicy(TENANT_ID, 'legal-never-delete', 'LEGAL_HOLD');

      // Advance time way past normal expiry (1 year)
      clock.advanceSeconds(365 * 24 * 60 * 60);

      // Delete expired
      const result = await store.deleteExpired(TENANT_ID);

      // Should not delete LEGAL_HOLD
      expect(result.deletedCount).toBe(0);

      // Should still be accessible
      const snapshot = await store.findById('legal-never-delete');
      expect(snapshot).not.toBeNull();
      expect(snapshot?.snapshotId).toBe('legal-never-delete');
    });

    it('should delete STANDARD but not LEGAL_HOLD in same batch', async () => {
      // Save multiple snapshots
      await createSnapshot('standard-001');
      await createSnapshot('standard-002');
      await createSnapshot('legal-001');
      await store.setRetentionPolicy(TENANT_ID, 'legal-001', 'LEGAL_HOLD');

      // Advance past STANDARD expiry (72h + buffer)
      clock.advanceSeconds(73 * 60 * 60);

      // Delete expired
      const result = await store.deleteExpired(TENANT_ID);

      // Should delete 2 STANDARD, keep 1 LEGAL_HOLD
      expect(result.deletedCount).toBe(2);

      // LEGAL_HOLD should still exist
      const legalSnapshot = await store.findById('legal-001');
      expect(legalSnapshot).not.toBeNull();

      // STANDARD should be gone
      const standard1 = await store.findById('standard-001');
      const standard2 = await store.findById('standard-002');
      expect(standard1).toBeNull();
      expect(standard2).toBeNull();
    });

    it('should handle mixed STANDARD, PROMOTED, and LEGAL_HOLD', async () => {
      await createSnapshot('standard-001');
      await createSnapshot('promoted-001');
      await createSnapshot('legal-001');

      await store.setRetentionPolicy(TENANT_ID, 'promoted-001', 'PROMOTED');
      await store.setRetentionPolicy(TENANT_ID, 'legal-001', 'LEGAL_HOLD');

      // Advance past STANDARD expiry but not PROMOTED
      clock.advanceSeconds(73 * 60 * 60);

      let result = await store.deleteExpired(TENANT_ID);
      expect(result.deletedCount).toBe(1); // Only STANDARD

      // Advance past PROMOTED expiry (168h total)
      // Phase 10: PROMOTED is now protected (dokunulmazlar) - never deleted
      clock.advanceSeconds(100 * 60 * 60);

      result = await store.deleteExpired(TENANT_ID);
      // Phase 10 change: PROMOTED is protected, so 0 deleted
      expect(result.deletedCount).toBe(0);
      expect(result.protectedBy.promoted).toBe(1);

      // Both PROMOTED and LEGAL_HOLD still exist
      const promotedSnapshot = await store.findById('promoted-001');
      expect(promotedSnapshot).not.toBeNull();
      
      const legalSnapshot = await store.findById('legal-001');
      expect(legalSnapshot).not.toBeNull();
    });
  });

  describe('getLegalHoldStats', () => {
    it('should count LEGAL_HOLD snapshots', async () => {
      await createSnapshot('standard-001');
      await createSnapshot('legal-001');
      await createSnapshot('legal-002');

      await store.setRetentionPolicy(TENANT_ID, 'legal-001', 'LEGAL_HOLD');
      await store.setRetentionPolicy(TENANT_ID, 'legal-002', 'LEGAL_HOLD');

      const stats = await store.getLegalHoldStats(TENANT_ID);

      expect(stats.totalCount).toBe(2);
    });

    it('should return empty stats when no LEGAL_HOLD snapshots', async () => {
      await createSnapshot('standard-001');

      const stats = await store.getLegalHoldStats(TENANT_ID);

      expect(stats.totalCount).toBe(0);
    });
  });

  describe('findByIncidentId with LEGAL_HOLD', () => {
    it('should include LEGAL_HOLD snapshots regardless of time', async () => {
      await createSnapshot('legal-001');
      await store.setRetentionPolicy(TENANT_ID, 'legal-001', 'LEGAL_HOLD');

      // Advance way past normal expiry
      clock.advanceSeconds(365 * 24 * 60 * 60);

      const snapshots = await store.findByIncidentId(TENANT_ID, 'incident-001');

      expect(snapshots.length).toBe(1);
      expect(snapshots[0].snapshotId).toBe('legal-001');
    });
  });

  describe('findById with LEGAL_HOLD', () => {
    it('should return LEGAL_HOLD snapshot regardless of time', async () => {
      await createSnapshot('legal-001');
      await store.setRetentionPolicy(TENANT_ID, 'legal-001', 'LEGAL_HOLD');

      // Advance 10 years
      clock.advanceSeconds(10 * 365 * 24 * 60 * 60);

      const snapshot = await store.findById('legal-001');

      expect(snapshot).not.toBeNull();
      expect(snapshot?.snapshotId).toBe('legal-001');
    });
  });

  // ============================================================================
  // tenantId Validation Tests
  // ============================================================================

  describe('tenantId validation', () => {
    it('should throw error for getLegalHoldStats with empty tenantId', async () => {
      await expect(
        store.getLegalHoldStats(''),
      ).rejects.toThrow('tenantId is required');
    });

    it('should throw error for findWithLegalHold with empty tenantId', async () => {
      await expect(
        store.findWithLegalHold(''),
      ).rejects.toThrow('tenantId is required');
    });
  });
});
