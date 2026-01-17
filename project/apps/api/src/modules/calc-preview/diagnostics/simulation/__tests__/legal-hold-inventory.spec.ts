/**
 * Legal Hold Inventory Service Tests
 * 
 * Phase 8 - Sprint 2E
 * 
 * Tests for legal hold inventory management.
 * 
 * KEY RULES:
 * - Baseline snapshots cannot be archived (400 error)
 * - Archive sets archived=true flag, does NOT change policy
 * - LEGAL_HOLD policy is never downgraded
 */

import { LegalHoldInventoryService } from '../legal-hold-inventory.service';
import { InMemoryIncidentStore } from '../incident-store.service';
import { InMemorySnapshotStore } from '../../evidence/snapshot-store.service';
import { ClockService } from '../../evidence/clock.service';
import { DEFAULT_LEGAL_HOLD_THRESHOLD } from '../legal-hold-inventory.types';
import { EvidenceSnapshot } from '../../diagnostics.types';

describe('LegalHoldInventoryService', () => {
  let service: LegalHoldInventoryService;
  let incidentStore: InMemoryIncidentStore;
  let snapshotStore: InMemorySnapshotStore;
  let clock: ClockService;

  beforeEach(() => {
    clock = new ClockService();
    clock.setFakeTime(new Date('2025-01-15T10:00:00Z'));
    incidentStore = new InMemoryIncidentStore(clock);
    snapshotStore = new InMemorySnapshotStore(clock);
    service = new LegalHoldInventoryService(clock, snapshotStore, incidentStore);
  });

  // Helper to create test snapshot
  const createSnapshot = (id: string, incidentId: string): EvidenceSnapshot => ({
    snapshotId: id,
    tenantId: 'tenant-001',
    incidentId,
    capturedAt: clock.nowIso(),
    points: [
      { metric: 'error_rate', value: 0.02, unit: 'ratio', windowSec: 300, confidence: 0.95, freshnessSec: 30, source: 'prometheus', timestamp: clock.nowIso() },
    ],
  });

  describe('archiveLegalHold', () => {
    it('should archive LEGAL_HOLD snapshot successfully', async () => {
      // Create incident and snapshot
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      const snapshot = createSnapshot('snap-001', 'inc-001');
      await snapshotStore.save(snapshot);
      await snapshotStore.applyLegalHold('snap-001');

      // Archive
      const result = await service.archiveLegalHold('snap-001');

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(service.isArchived('snap-001')).toBe(true);
    });

    it('should be idempotent - archiving already archived snapshot is no-op', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      const snapshot = createSnapshot('snap-001', 'inc-001');
      await snapshotStore.save(snapshot);
      await snapshotStore.applyLegalHold('snap-001');

      // Archive twice
      const result1 = await service.archiveLegalHold('snap-001');
      const result2 = await service.archiveLegalHold('snap-001');

      expect(result1.success).toBe(true);
      expect(result1.changed).toBe(true);
      expect(result2.success).toBe(true);
      expect(result2.changed).toBe(false); // No change on second call
    });

    it('should NOT change retention policy when archiving', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      const snapshot = createSnapshot('snap-001', 'inc-001');
      await snapshotStore.save(snapshot);
      await snapshotStore.applyLegalHold('snap-001');

      // Archive
      await service.archiveLegalHold('snap-001');

      // Policy should still be LEGAL_HOLD
      const stored = await snapshotStore.get('snap-001');
      expect(stored?.retentionPolicy).toBe('LEGAL_HOLD');
    });

    it('should return error for non-existent snapshot', async () => {
      const result = await service.archiveLegalHold('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('SNAPSHOT_NOT_FOUND');
    });

    it('should return error for non-LEGAL_HOLD snapshot', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      const snapshot = createSnapshot('snap-standard', 'inc-001');
      await snapshotStore.save(snapshot);
      // NOT applying LEGAL_HOLD

      const result = await service.archiveLegalHold('snap-standard');

      expect(result.success).toBe(false);
      expect(result.error).toBe('NOT_LEGAL_HOLD');
      expect(result.errorMessage).toContain('STANDARD');
    });

    it('should return error when trying to archive baseline snapshot', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      const snapshot = createSnapshot('snap-baseline', 'inc-001');
      await snapshotStore.save(snapshot);
      await snapshotStore.applyLegalHold('snap-baseline');

      // Set as baseline
      await incidentStore.setBaseline('inc-001', 'snap-baseline');

      // Try to archive baseline
      const result = await service.archiveLegalHold('snap-baseline');

      expect(result.success).toBe(false);
      expect(result.error).toBe('IS_BASELINE');
      expect(result.errorMessage).toContain('baseline');
    });

    it('should allow archiving non-baseline LEGAL_HOLD even when incident has baseline', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      // Create baseline
      const baselineSnapshot = createSnapshot('snap-baseline', 'inc-001');
      await snapshotStore.save(baselineSnapshot);
      await snapshotStore.applyLegalHold('snap-baseline');
      await incidentStore.setBaseline('inc-001', 'snap-baseline');

      // Create another LEGAL_HOLD snapshot (not baseline)
      clock.advanceHours(1);
      const otherSnapshot = createSnapshot('snap-other', 'inc-001');
      await snapshotStore.save(otherSnapshot);
      await snapshotStore.applyLegalHold('snap-other');

      // Archive non-baseline should succeed
      const result = await service.archiveLegalHold('snap-other');

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
    });
  });

  describe('isArchived', () => {
    it('should return false for non-archived snapshot', async () => {
      expect(service.isArchived('snap-001')).toBe(false);
    });

    it('should return true for archived snapshot', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      const snapshot = createSnapshot('snap-001', 'inc-001');
      await snapshotStore.save(snapshot);
      await snapshotStore.applyLegalHold('snap-001');
      await service.archiveLegalHold('snap-001');

      expect(service.isArchived('snap-001')).toBe(true);
    });
  });

  describe('getIncidentLegalHoldCount', () => {
    it('should return 0 for incident with no LEGAL_HOLD snapshots', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      const snapshot = createSnapshot('snap-001', 'inc-001');
      await snapshotStore.save(snapshot);
      // NOT applying LEGAL_HOLD

      const count = await service.getIncidentLegalHoldCount('inc-001');
      expect(count).toBe(0);
    });

    it('should count LEGAL_HOLD snapshots for incident', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      // Create 3 snapshots, apply LEGAL_HOLD to 2
      const snap1 = createSnapshot('snap-001', 'inc-001');
      const snap2 = createSnapshot('snap-002', 'inc-001');
      const snap3 = createSnapshot('snap-003', 'inc-001');

      await snapshotStore.save(snap1);
      await snapshotStore.save(snap2);
      await snapshotStore.save(snap3);

      await snapshotStore.applyLegalHold('snap-001');
      await snapshotStore.applyLegalHold('snap-002');
      // snap-003 stays STANDARD

      const count = await service.getIncidentLegalHoldCount('inc-001');
      expect(count).toBe(2);
    });

    it('should return 0 for non-existent incident', async () => {
      const count = await service.getIncidentLegalHoldCount('non-existent');
      expect(count).toBe(0);
    });
  });

  describe('isIncidentExceedingThreshold', () => {
    it('should return false when below threshold', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      // Create 3 LEGAL_HOLD snapshots (below default threshold of 5)
      for (let i = 1; i <= 3; i++) {
        const snap = createSnapshot(`snap-00${i}`, 'inc-001');
        await snapshotStore.save(snap);
        await snapshotStore.applyLegalHold(`snap-00${i}`);
      }

      const exceeds = await service.isIncidentExceedingThreshold('inc-001');
      expect(exceeds).toBe(false);
    });

    it('should return false when at threshold (not exceeding)', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      // Create exactly 5 LEGAL_HOLD snapshots (at default threshold)
      for (let i = 1; i <= DEFAULT_LEGAL_HOLD_THRESHOLD; i++) {
        const snap = createSnapshot(`snap-00${i}`, 'inc-001');
        await snapshotStore.save(snap);
        await snapshotStore.applyLegalHold(`snap-00${i}`);
      }

      const exceeds = await service.isIncidentExceedingThreshold('inc-001');
      expect(exceeds).toBe(false); // At threshold, not exceeding
    });

    it('should return true when exceeding threshold', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      // Create 6 LEGAL_HOLD snapshots (above default threshold of 5)
      for (let i = 1; i <= DEFAULT_LEGAL_HOLD_THRESHOLD + 1; i++) {
        const snap = createSnapshot(`snap-00${i}`, 'inc-001');
        await snapshotStore.save(snap);
        await snapshotStore.applyLegalHold(`snap-00${i}`);
      }

      const exceeds = await service.isIncidentExceedingThreshold('inc-001');
      expect(exceeds).toBe(true);
    });

    it('should use custom threshold', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      // Create 3 LEGAL_HOLD snapshots
      for (let i = 1; i <= 3; i++) {
        const snap = createSnapshot(`snap-00${i}`, 'inc-001');
        await snapshotStore.save(snap);
        await snapshotStore.applyLegalHold(`snap-00${i}`);
      }

      // With threshold of 2, should exceed
      const exceeds = await service.isIncidentExceedingThreshold('inc-001', 2);
      expect(exceeds).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return stats with total count', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      const snap1 = createSnapshot('snap-001', 'inc-001');
      const snap2 = createSnapshot('snap-002', 'inc-001');
      await snapshotStore.save(snap1);
      await snapshotStore.save(snap2);
      await snapshotStore.applyLegalHold('snap-001');
      await snapshotStore.applyLegalHold('snap-002');

      const stats = await service.getStats();

      expect(stats.totalCount).toBe(2);
    });

    it('should return empty stats when no LEGAL_HOLD snapshots', async () => {
      const stats = await service.getStats();

      expect(stats.totalCount).toBe(0);
      expect(stats.incidentsExceedingThreshold).toHaveLength(0);
    });
  });

  describe('clearArchived', () => {
    it('should clear all archived snapshots', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      const snap1 = createSnapshot('snap-001', 'inc-001');
      const snap2 = createSnapshot('snap-002', 'inc-001');
      await snapshotStore.save(snap1);
      await snapshotStore.save(snap2);
      await snapshotStore.applyLegalHold('snap-001');
      await snapshotStore.applyLegalHold('snap-002');

      await service.archiveLegalHold('snap-001');
      await service.archiveLegalHold('snap-002');

      expect(service.isArchived('snap-001')).toBe(true);
      expect(service.isArchived('snap-002')).toBe(true);

      service.clearArchived();

      expect(service.isArchived('snap-001')).toBe(false);
      expect(service.isArchived('snap-002')).toBe(false);
    });
  });

  describe('anti-regression: baseline protect → cleanup → baseline still exists', () => {
    it('should preserve baseline after cleanup when protected with LEGAL_HOLD', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      // Create baseline snapshot
      const baselineSnapshot = createSnapshot('snap-baseline', 'inc-001');
      await snapshotStore.save(baselineSnapshot);

      // Protect baseline with LEGAL_HOLD
      await snapshotStore.applyLegalHold('snap-baseline');
      await incidentStore.setBaseline('inc-001', 'snap-baseline');

      // Advance time past TTL
      clock.advanceHours(200); // Way past 72h STANDARD TTL

      // Run cleanup
      const deleted = await snapshotStore.deleteExpired();

      // Baseline should still exist (LEGAL_HOLD never expires)
      const baseline = await snapshotStore.get('snap-baseline');
      expect(baseline).not.toBeNull();
      expect(baseline?.retentionPolicy).toBe('LEGAL_HOLD');
      expect(deleted).toBe(0);
    });

    it('should delete non-protected snapshots but keep baseline', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      // Create baseline snapshot (protected)
      const baselineSnapshot = createSnapshot('snap-baseline', 'inc-001');
      await snapshotStore.save(baselineSnapshot);
      await snapshotStore.applyLegalHold('snap-baseline');
      await incidentStore.setBaseline('inc-001', 'snap-baseline');

      // Create non-protected snapshot
      clock.advanceHours(1);
      const otherSnapshot = createSnapshot('snap-other', 'inc-001');
      await snapshotStore.save(otherSnapshot);
      // NOT applying LEGAL_HOLD

      // Advance time past TTL
      clock.advanceHours(100);

      // Run cleanup
      const deleted = await snapshotStore.deleteExpired();

      // Baseline should still exist
      const baseline = await snapshotStore.get('snap-baseline');
      expect(baseline).not.toBeNull();

      // Other snapshot should be deleted
      const other = await snapshotStore.get('snap-other');
      expect(other).toBeNull();
      expect(deleted).toBe(1);
    });
  });
});
