/**
 * Legal Hold Inventory Service Tests
 * 
 * Phase 8 - Sprint 2E
 * Phase 9B.5 - Migrated to MockSnapshotStore + tenantId-aware
 * 
 * Tests for legal hold inventory management.
 * 
 * KEY RULES:
 * - Baseline snapshots cannot be archived (400 error)
 * - Archive sets archived=true flag, does NOT change policy
 * - LEGAL_HOLD policy is never downgraded
 * - All operations require tenantId (tenant isolation)
 * 
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 */

import { LegalHoldInventoryService } from '../legal-hold-inventory.service';
import { InMemoryIncidentStore } from '../incident-store.service';
import { MockSnapshotStore } from '../../simulation-api/__tests__/mock-snapshot-store';
import { ClockService } from '../../evidence/clock.service';
import { DEFAULT_LEGAL_HOLD_THRESHOLD } from '../legal-hold-inventory.types';
import { canonicalHash, canonicalStringify } from '../determinism';

describe('LegalHoldInventoryService', () => {
  let service: LegalHoldInventoryService;
  let incidentStore: InMemoryIncidentStore;
  let snapshotStore: MockSnapshotStore;
  let clock: ClockService;

  const TENANT_ID = 'tenant-001';

  beforeEach(() => {
    clock = new ClockService();
    clock.setFakeTime(new Date('2025-01-15T10:00:00Z'));
    incidentStore = new InMemoryIncidentStore(clock);
    snapshotStore = new MockSnapshotStore(clock);
    service = new LegalHoldInventoryService(clock, snapshotStore, incidentStore);
  });

  // Helper to create test snapshot using new interface
  async function createSnapshot(id: string, incidentId: string, tenantId: string = TENANT_ID) {
    const now = clock.nowIso();
    const points = [
      {
        metric: 'error_rate' as const,
        value: 0.02,
        unit: 'ratio',
        windowSec: 300,
        confidence: 0.95,
        freshnessSec: 30,
        source: 'prometheus' as const,
        timestamp: now,
      },
    ];
    const calcResult = { points, capturedAt: now };
    const calcResultNorm = canonicalStringify(calcResult);
    const calcHash = canonicalHash(calcResult);

    return snapshotStore.createSnapshot({
      snapshotId: id,
      tenantId,
      incidentId,
      snapshotKind: 'CURRENT',
      verdict: 'PROCEED',
      driftScore: 0,
      calcResult,
      calcResultNorm,
      calcHash,
    });
  }

  // ============================================================================
  // CRITICAL: tenantId Validation Tests (Step 3.3)
  // ============================================================================

  describe('tenantId validation (CRITICAL)', () => {
    it('should throw error when tenantId is empty for getIncidentLegalHoldCount', async () => {
      await expect(
        service.getIncidentLegalHoldCount('', 'inc-001'),
      ).rejects.toThrow('tenantId is required');
    });

    it('should throw error when tenantId is empty for isIncidentExceedingThreshold', async () => {
      await expect(
        service.isIncidentExceedingThreshold('', 'inc-001'),
      ).rejects.toThrow('tenantId is required');
    });

    it('should throw error when tenantId is empty for getStats', async () => {
      await expect(
        service.getStats(''),
      ).rejects.toThrow('tenantId is required');
    });

    it('should throw error when tenantId is empty for listLegalHolds', async () => {
      await expect(
        service.listLegalHolds(''),
      ).rejects.toThrow('tenantId is required');
    });

    it('should throw error when tenantId is empty for archiveLegalHold', async () => {
      await expect(
        service.archiveLegalHold('', 'snap-001'),
      ).rejects.toThrow('tenantId is required');
    });
  });

  // ============================================================================
  // archiveLegalHold Tests
  // ============================================================================

  describe('archiveLegalHold', () => {
    it('should archive LEGAL_HOLD snapshot successfully', async () => {
      // Create incident and snapshot
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      await createSnapshot('snap-001', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-001');

      // Archive
      const result = await service.archiveLegalHold(TENANT_ID, 'snap-001');

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(service.isArchived('snap-001')).toBe(true);
    });

    it('should be idempotent - archiving already archived snapshot is no-op', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      await createSnapshot('snap-001', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-001');

      // Archive twice
      const result1 = await service.archiveLegalHold(TENANT_ID, 'snap-001');
      const result2 = await service.archiveLegalHold(TENANT_ID, 'snap-001');

      expect(result1.success).toBe(true);
      expect(result1.changed).toBe(true);
      expect(result2.success).toBe(true);
      expect(result2.changed).toBe(false); // No change on second call
    });

    it('should NOT change retention policy when archiving', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      await createSnapshot('snap-001', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-001');

      // Archive
      await service.archiveLegalHold(TENANT_ID, 'snap-001');

      // Policy should still be LEGAL_HOLD
      const stored = await snapshotStore.findById('snap-001');
      expect(stored?.retentionPolicy).toBe('LEGAL_HOLD');
    });

    it('should return error for non-existent snapshot', async () => {
      const result = await service.archiveLegalHold(TENANT_ID, 'non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('SNAPSHOT_NOT_FOUND');
    });

    it('should return error for non-LEGAL_HOLD snapshot', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      await createSnapshot('snap-standard', 'inc-001');
      // NOT applying LEGAL_HOLD

      const result = await service.archiveLegalHold(TENANT_ID, 'snap-standard');

      expect(result.success).toBe(false);
      expect(result.error).toBe('NOT_LEGAL_HOLD');
      expect(result.errorMessage).toContain('STANDARD');
    });

    it('should return error when trying to archive baseline snapshot', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      await createSnapshot('snap-baseline', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-baseline');

      // Set as baseline
      await incidentStore.setBaseline('inc-001', 'snap-baseline');

      // Try to archive baseline
      const result = await service.archiveLegalHold(TENANT_ID, 'snap-baseline');

      expect(result.success).toBe(false);
      expect(result.error).toBe('IS_BASELINE');
      expect(result.errorMessage).toContain('baseline');
    });

    it('should allow archiving non-baseline LEGAL_HOLD even when incident has baseline', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      // Create baseline
      await createSnapshot('snap-baseline', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-baseline');
      await incidentStore.setBaseline('inc-001', 'snap-baseline');

      // Create another LEGAL_HOLD snapshot (not baseline)
      clock.advanceHours(1);
      await createSnapshot('snap-other', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-other');

      // Archive non-baseline should succeed
      const result = await service.archiveLegalHold(TENANT_ID, 'snap-other');

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
    });

    it('should return NOT_FOUND for tenant mismatch (no information leakage)', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      await createSnapshot('snap-001', 'inc-001', TENANT_ID);
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-001');

      // Try to archive with different tenant
      const result = await service.archiveLegalHold('other-tenant', 'snap-001');

      expect(result.success).toBe(false);
      expect(result.error).toBe('SNAPSHOT_NOT_FOUND'); // NOT TENANT_MISMATCH
      expect(result.errorMessage).toContain('not found');
    });
  });

  // ============================================================================
  // isArchived Tests
  // ============================================================================

  describe('isArchived', () => {
    it('should return false for non-archived snapshot', async () => {
      expect(service.isArchived('snap-001')).toBe(false);
    });

    it('should return true for archived snapshot', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      await createSnapshot('snap-001', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-001');
      await service.archiveLegalHold(TENANT_ID, 'snap-001');

      expect(service.isArchived('snap-001')).toBe(true);
    });
  });

  // ============================================================================
  // listLegalHolds Tests (tenant-wide, deterministic ordering)
  // ============================================================================

  describe('listLegalHolds (tenant-wide)', () => {
    it('should return legal holds sorted by createdAt DESC, snapshotId ASC', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      // Create snapshots at different times
      await createSnapshot('snap-003', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-003');
      
      clock.advanceHours(1);
      await createSnapshot('snap-001', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-001');
      
      clock.advanceHours(1);
      await createSnapshot('snap-002', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-002');

      const entries = await service.listLegalHolds(TENANT_ID);

      // Should be sorted by createdAt DESC (newest first)
      expect(entries[0].snapshotId).toBe('snap-002'); // newest
      expect(entries[1].snapshotId).toBe('snap-001');
      expect(entries[2].snapshotId).toBe('snap-003'); // oldest
    });

    it('should use snapshotId as tie-breaker when createdAt is same', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      // Create snapshots at same time (no clock advance)
      await createSnapshot('snap-c', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-c');
      await createSnapshot('snap-a', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-a');
      await createSnapshot('snap-b', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-b');

      const entries = await service.listLegalHolds(TENANT_ID);

      // Same createdAt → sorted by snapshotId ASC
      expect(entries[0].snapshotId).toBe('snap-a');
      expect(entries[1].snapshotId).toBe('snap-b');
      expect(entries[2].snapshotId).toBe('snap-c');
    });

    it('should not include snapshots from different tenant', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      // Create snapshot for different tenant
      await createSnapshot('snap-other', 'inc-001', 'other-tenant');
      await snapshotStore.applyLegalHold('other-tenant', 'snap-other');

      // Create snapshot for our tenant
      await createSnapshot('snap-001', 'inc-001', TENANT_ID);
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-001');

      const entries = await service.listLegalHolds(TENANT_ID);
      
      expect(entries).toHaveLength(1);
      expect(entries[0].snapshotId).toBe('snap-001');
    });

    it('should include legal holds from all incidents (tenant-wide)', async () => {
      // Create two incidents
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test 1',
        severity: 'LOW',
      });
      await incidentStore.create({
        incidentId: 'inc-002',
        tenantId: TENANT_ID,
        title: 'Test 2',
        severity: 'LOW',
      });

      // Create snapshots for both incidents
      await createSnapshot('snap-001', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-001');
      await createSnapshot('snap-002', 'inc-002');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-002');

      const entries = await service.listLegalHolds(TENANT_ID);
      
      expect(entries).toHaveLength(2);
      expect(entries.map(e => e.incidentId).sort()).toEqual(['inc-001', 'inc-002']);
    });

    it('should mark archived snapshots correctly', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      await createSnapshot('snap-001', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-001');
      await service.archiveLegalHold(TENANT_ID, 'snap-001');

      const entries = await service.listLegalHolds(TENANT_ID);
      
      expect(entries[0].archived).toBe(true);
    });
  });

  // ============================================================================
  // listLegalHoldsByIncident Tests (incident-scoped)
  // ============================================================================

  describe('listLegalHoldsByIncident (incident-scoped)', () => {
    it('should throw error when incidentId is empty', async () => {
      await expect(
        service.listLegalHoldsByIncident(TENANT_ID, ''),
      ).rejects.toThrow('incidentId is required');
    });

    it('should throw error when tenantId is empty', async () => {
      await expect(
        service.listLegalHoldsByIncident('', 'inc-001'),
      ).rejects.toThrow('tenantId is required');
    });

    it('should return only legal holds for specified incident', async () => {
      // Create two incidents
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test 1',
        severity: 'LOW',
      });
      await incidentStore.create({
        incidentId: 'inc-002',
        tenantId: TENANT_ID,
        title: 'Test 2',
        severity: 'LOW',
      });

      // Create snapshots for both incidents
      await createSnapshot('snap-001', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-001');
      await createSnapshot('snap-002', 'inc-002');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-002');

      // Query for inc-001 only
      const entries = await service.listLegalHoldsByIncident(TENANT_ID, 'inc-001');
      
      expect(entries).toHaveLength(1);
      expect(entries[0].snapshotId).toBe('snap-001');
      expect(entries[0].incidentId).toBe('inc-001');
    });

    it('should return empty array for incident with no legal holds', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      // Create snapshot but don't apply LEGAL_HOLD
      await createSnapshot('snap-001', 'inc-001');

      const entries = await service.listLegalHoldsByIncident(TENANT_ID, 'inc-001');
      
      expect(entries).toHaveLength(0);
    });

    it('should be sorted deterministically (createdAt DESC, snapshotId ASC)', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      // Create snapshots at different times
      await createSnapshot('snap-003', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-003');
      
      clock.advanceHours(1);
      await createSnapshot('snap-001', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-001');

      const entries = await service.listLegalHoldsByIncident(TENANT_ID, 'inc-001');

      // Should be sorted by createdAt DESC
      expect(entries[0].snapshotId).toBe('snap-001'); // newer
      expect(entries[1].snapshotId).toBe('snap-003'); // older
    });

    it('should not include snapshots from different tenant', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      // Create snapshot for different tenant with same incidentId
      await createSnapshot('snap-other', 'inc-001', 'other-tenant');
      await snapshotStore.applyLegalHold('other-tenant', 'snap-other');

      // Create snapshot for our tenant
      await createSnapshot('snap-001', 'inc-001', TENANT_ID);
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-001');

      const entries = await service.listLegalHoldsByIncident(TENANT_ID, 'inc-001');
      
      expect(entries).toHaveLength(1);
      expect(entries[0].snapshotId).toBe('snap-001');
    });
  });

  // ============================================================================
  // getIncidentLegalHoldCount Tests (tenantId-aware)
  // ============================================================================

  describe('getIncidentLegalHoldCount', () => {
    it('should return 0 for incident with no LEGAL_HOLD snapshots', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      await createSnapshot('snap-001', 'inc-001');
      // NOT applying LEGAL_HOLD

      const count = await service.getIncidentLegalHoldCount(TENANT_ID, 'inc-001');
      expect(count).toBe(0);
    });

    it('should count LEGAL_HOLD snapshots for incident', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      // Create 3 snapshots, apply LEGAL_HOLD to 2
      await createSnapshot('snap-001', 'inc-001');
      await createSnapshot('snap-002', 'inc-001');
      await createSnapshot('snap-003', 'inc-001');

      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-002');
      // snap-003 stays STANDARD

      const count = await service.getIncidentLegalHoldCount(TENANT_ID, 'inc-001');
      expect(count).toBe(2);
    });

    it('should return 0 for non-existent incident', async () => {
      const count = await service.getIncidentLegalHoldCount(TENANT_ID, 'non-existent');
      expect(count).toBe(0);
    });

    it('should not count snapshots from different tenant', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      // Create snapshot for different tenant
      await createSnapshot('snap-other-tenant', 'inc-001', 'other-tenant');
      await snapshotStore.applyLegalHold('other-tenant', 'snap-other-tenant');

      // Create snapshot for our tenant
      await createSnapshot('snap-001', 'inc-001', TENANT_ID);
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-001');

      const count = await service.getIncidentLegalHoldCount(TENANT_ID, 'inc-001');
      expect(count).toBe(1); // Only our tenant's snapshot
    });
  });

  // ============================================================================
  // isIncidentExceedingThreshold Tests (tenantId-aware)
  // ============================================================================

  describe('isIncidentExceedingThreshold', () => {
    it('should return false when below threshold', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      // Create 3 LEGAL_HOLD snapshots (below default threshold of 5)
      for (let i = 1; i <= 3; i++) {
        await createSnapshot(`snap-00${i}`, 'inc-001');
        await snapshotStore.applyLegalHold(TENANT_ID, `snap-00${i}`);
      }

      const exceeds = await service.isIncidentExceedingThreshold(TENANT_ID, 'inc-001');
      expect(exceeds).toBe(false);
    });

    it('should return false when at threshold (not exceeding)', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      // Create exactly 5 LEGAL_HOLD snapshots (at default threshold)
      for (let i = 1; i <= DEFAULT_LEGAL_HOLD_THRESHOLD; i++) {
        await createSnapshot(`snap-00${i}`, 'inc-001');
        await snapshotStore.applyLegalHold(TENANT_ID, `snap-00${i}`);
      }

      const exceeds = await service.isIncidentExceedingThreshold(TENANT_ID, 'inc-001');
      expect(exceeds).toBe(false); // At threshold, not exceeding
    });

    it('should return true when exceeding threshold', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      // Create 6 LEGAL_HOLD snapshots (above default threshold of 5)
      for (let i = 1; i <= DEFAULT_LEGAL_HOLD_THRESHOLD + 1; i++) {
        await createSnapshot(`snap-00${i}`, 'inc-001');
        await snapshotStore.applyLegalHold(TENANT_ID, `snap-00${i}`);
      }

      const exceeds = await service.isIncidentExceedingThreshold(TENANT_ID, 'inc-001');
      expect(exceeds).toBe(true);
    });

    it('should use custom threshold', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      // Create 3 LEGAL_HOLD snapshots
      for (let i = 1; i <= 3; i++) {
        await createSnapshot(`snap-00${i}`, 'inc-001');
        await snapshotStore.applyLegalHold(TENANT_ID, `snap-00${i}`);
      }

      // With threshold of 2, should exceed
      const exceeds = await service.isIncidentExceedingThreshold(TENANT_ID, 'inc-001', 2);
      expect(exceeds).toBe(true);
    });
  });

  // ============================================================================
  // getStats Tests (tenantId-aware)
  // ============================================================================

  describe('getStats', () => {
    it('should return stats with total count', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      await createSnapshot('snap-001', 'inc-001');
      await createSnapshot('snap-002', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-002');

      const stats = await service.getStats(TENANT_ID);

      expect(stats.totalCount).toBe(2);
    });

    it('should return empty stats when no LEGAL_HOLD snapshots', async () => {
      const stats = await service.getStats(TENANT_ID);

      expect(stats.totalCount).toBe(0);
      expect(stats.incidentsExceedingThreshold).toHaveLength(0);
    });

    it('should not include snapshots from different tenant', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      // Create snapshot for different tenant
      await createSnapshot('snap-other', 'inc-001', 'other-tenant');
      await snapshotStore.applyLegalHold('other-tenant', 'snap-other');

      // Create snapshot for our tenant
      await createSnapshot('snap-001', 'inc-001', TENANT_ID);
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-001');

      const stats = await service.getStats(TENANT_ID);
      expect(stats.totalCount).toBe(1); // Only our tenant's snapshot
    });
  });

  // ============================================================================
  // clearArchived Tests
  // ============================================================================

  describe('clearArchived', () => {
    it('should clear all archived snapshots', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      await createSnapshot('snap-001', 'inc-001');
      await createSnapshot('snap-002', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-002');

      await service.archiveLegalHold(TENANT_ID, 'snap-001');
      await service.archiveLegalHold(TENANT_ID, 'snap-002');

      expect(service.isArchived('snap-001')).toBe(true);
      expect(service.isArchived('snap-002')).toBe(true);

      service.clearArchived();

      expect(service.isArchived('snap-001')).toBe(false);
      expect(service.isArchived('snap-002')).toBe(false);
    });
  });

  // ============================================================================
  // Anti-regression: baseline protect → cleanup → baseline still exists
  // NOTE: deleteExpired is a test helper, not part of ISnapshotStore interface
  // ============================================================================

  describe('anti-regression: baseline protect → cleanup → baseline still exists', () => {
    it('should preserve baseline after cleanup when protected with LEGAL_HOLD', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      // Create baseline snapshot
      await createSnapshot('snap-baseline', 'inc-001');

      // Protect baseline with LEGAL_HOLD
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-baseline');
      await incidentStore.setBaseline('inc-001', 'snap-baseline');

      // Advance time past TTL
      clock.advanceHours(200); // Way past 72h STANDARD TTL

      // Run cleanup (test helper method)
      const deleted = await snapshotStore.deleteExpired();

      // Baseline should still exist (LEGAL_HOLD never expires)
      const baseline = await snapshotStore.findById('snap-baseline');
      expect(baseline).not.toBeNull();
      expect(baseline?.retentionPolicy).toBe('LEGAL_HOLD');
      expect(deleted).toBe(0);
    });

    it('should delete non-protected snapshots but keep baseline', async () => {
      await incidentStore.create({
        incidentId: 'inc-001',
        tenantId: TENANT_ID,
        title: 'Test',
        severity: 'LOW',
      });

      // Create baseline snapshot (protected)
      await createSnapshot('snap-baseline', 'inc-001');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-baseline');
      await incidentStore.setBaseline('inc-001', 'snap-baseline');

      // Create non-protected snapshot
      clock.advanceHours(1);
      await createSnapshot('snap-other', 'inc-001');
      // NOT applying LEGAL_HOLD

      // Advance time past TTL
      clock.advanceHours(100);

      // Run cleanup (test helper method)
      const deleted = await snapshotStore.deleteExpired();

      // Baseline should still exist
      const baseline = await snapshotStore.findById('snap-baseline');
      expect(baseline).not.toBeNull();

      // Other snapshot should be deleted
      const other = await snapshotStore.findById('snap-other');
      expect(other).toBeNull();
      expect(deleted).toBe(1);
    });
  });
});
