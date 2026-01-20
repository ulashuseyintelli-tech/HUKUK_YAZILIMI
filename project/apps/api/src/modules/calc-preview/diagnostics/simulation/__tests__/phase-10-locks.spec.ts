/**
 * Phase 10 Lock Tests
 * 
 * Phase 10 - Archived State Persistence + Cleanup Job Hardening
 * 
 * These tests lock the Phase 10 behaviors:
 * 1. Archive persistence (DB-backed, durable)
 * 2. listLegalHolds excludes archived
 * 3. Cleanup job doesn't delete protected snapshots (dokunulmazlar)
 * 4. Cleanup job cross-tenant isolation
 * 
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 */

import { MockSnapshotStore } from '../../simulation-api/__tests__/mock-snapshot-store';
import { LegalHoldInventoryService } from '../legal-hold-inventory.service';
import { InMemoryIncidentStore } from '../incident-store.service';
import { ClockService } from '../../evidence/clock.service';
import { canonicalHash, canonicalStringify } from '../determinism';

describe('Phase 10 Locks', () => {
  let snapshotStore: MockSnapshotStore;
  let incidentStore: InMemoryIncidentStore;
  let legalHoldService: LegalHoldInventoryService;
  let clock: ClockService;

  const TENANT_A = 'tenant-A';
  const TENANT_B = 'tenant-B';

  beforeEach(() => {
    clock = new ClockService();
    clock.setFakeTime(new Date('2025-01-15T10:00:00Z'));
    snapshotStore = new MockSnapshotStore(clock);
    incidentStore = new InMemoryIncidentStore(clock);
    legalHoldService = new LegalHoldInventoryService(clock, snapshotStore, incidentStore);
  });

  // Helper to create test snapshot
  async function createSnapshot(
    id: string, 
    incidentId: string, 
    tenantId: string,
    options?: { isBaseline?: boolean; retentionPolicy?: 'STANDARD' | 'PROMOTED' | 'LEGAL_HOLD' }
  ) {
    const now = clock.nowIso();
    const points = [{ metric: 'error_rate' as const, value: 0.02, unit: 'ratio', windowSec: 300, confidence: 0.95, freshnessSec: 30, source: 'prometheus' as const, timestamp: now }];
    const calcResult = { points, capturedAt: now };
    const calcResultNorm = canonicalStringify(calcResult);
    const calcHash = canonicalHash(calcResult);

    const snapshot = await snapshotStore.createSnapshot({
      snapshotId: id,
      tenantId,
      incidentId,
      snapshotKind: 'CURRENT',
      verdict: 'PROCEED',
      driftScore: 0,
      calcResult,
      calcResultNorm,
      calcHash,
      isBaseline: options?.isBaseline,
      retentionPolicy: options?.retentionPolicy,
    });

    return snapshot;
  }

  // ============================================================================
  // Lock 1: Archive Persistence (DB-backed)
  // ============================================================================

  describe('Lock 1: Archive persistence is DB-backed', () => {
    it('archived state persists in snapshot store', async () => {
      await incidentStore.create({ incidentId: 'inc-1', tenantId: TENANT_A, title: 'Test', severity: 'LOW' });
      await createSnapshot('snap-1', 'inc-1', TENANT_A);
      await snapshotStore.applyLegalHold(TENANT_A, 'snap-1');

      // Archive
      const result = await legalHoldService.archiveLegalHold(TENANT_A, 'snap-1', 'test-user', 'test reason');
      expect(result.success).toBe(true);
      expect(result.archivedAt).toBeDefined();

      // Verify persisted in store
      const snapshot = await snapshotStore.findById('snap-1');
      expect(snapshot?.archivedAt).toBeDefined();
      expect(snapshot?.archivedBy).toBe('test-user');
      expect(snapshot?.archivedReason).toBe('test reason');
    });

    it('isArchived reads from store (async)', async () => {
      await incidentStore.create({ incidentId: 'inc-1', tenantId: TENANT_A, title: 'Test', severity: 'LOW' });
      await createSnapshot('snap-1', 'inc-1', TENANT_A);
      await snapshotStore.applyLegalHold(TENANT_A, 'snap-1');

      // Before archive
      expect(await legalHoldService.isArchived('snap-1')).toBe(false);

      // After archive
      await legalHoldService.archiveLegalHold(TENANT_A, 'snap-1');
      expect(await legalHoldService.isArchived('snap-1')).toBe(true);
    });
  });

  // ============================================================================
  // Lock 2: listLegalHolds excludes archived
  // ============================================================================

  describe('Lock 2: listLegalHolds excludes archived snapshots', () => {
    it('archived snapshots are excluded from listLegalHolds', async () => {
      await incidentStore.create({ incidentId: 'inc-1', tenantId: TENANT_A, title: 'Test', severity: 'LOW' });
      
      await createSnapshot('snap-1', 'inc-1', TENANT_A);
      await createSnapshot('snap-2', 'inc-1', TENANT_A);
      await snapshotStore.applyLegalHold(TENANT_A, 'snap-1');
      await snapshotStore.applyLegalHold(TENANT_A, 'snap-2');

      // Before archive: both visible
      let entries = await legalHoldService.listLegalHolds(TENANT_A);
      expect(entries).toHaveLength(2);

      // Archive one
      await legalHoldService.archiveLegalHold(TENANT_A, 'snap-1');

      // After archive: only non-archived visible
      entries = await legalHoldService.listLegalHolds(TENANT_A);
      expect(entries).toHaveLength(1);
      expect(entries[0].snapshotId).toBe('snap-2');
    });

    it('archived snapshots are excluded from listLegalHoldsByIncident', async () => {
      await incidentStore.create({ incidentId: 'inc-1', tenantId: TENANT_A, title: 'Test', severity: 'LOW' });
      
      await createSnapshot('snap-1', 'inc-1', TENANT_A);
      await createSnapshot('snap-2', 'inc-1', TENANT_A);
      await snapshotStore.applyLegalHold(TENANT_A, 'snap-1');
      await snapshotStore.applyLegalHold(TENANT_A, 'snap-2');

      // Archive one
      await legalHoldService.archiveLegalHold(TENANT_A, 'snap-1');

      // Only non-archived visible
      const entries = await legalHoldService.listLegalHoldsByIncident(TENANT_A, 'inc-1');
      expect(entries).toHaveLength(1);
      expect(entries[0].snapshotId).toBe('snap-2');
    });
  });

  // ============================================================================
  // Lock 3: Cleanup job doesn't delete protected snapshots (dokunulmazlar)
  // ============================================================================

  describe('Lock 3: Cleanup job protects dokunulmazlar', () => {
    it('LEGAL_HOLD snapshots are never deleted (even if somehow expired)', async () => {
      await incidentStore.create({ incidentId: 'inc-1', tenantId: TENANT_A, title: 'Test', severity: 'LOW' });
      
      // Create LEGAL_HOLD snapshot
      await createSnapshot('snap-legal', 'inc-1', TENANT_A);
      await snapshotStore.applyLegalHold(TENANT_A, 'snap-legal');

      // Advance time past expiry
      clock.advanceHours(200);

      // Run cleanup
      const result = await snapshotStore.deleteExpired(TENANT_A);

      // LEGAL_HOLD has no expiresAt, so it's not even considered for deletion
      // This is correct behavior - LEGAL_HOLD never expires
      expect(result.deletedCount).toBe(0);

      // Snapshot still exists
      const snapshot = await snapshotStore.findById('snap-legal');
      expect(snapshot).not.toBeNull();
      expect(snapshot?.retentionPolicy).toBe('LEGAL_HOLD');
    });

    it('PROMOTED snapshots are never deleted', async () => {
      await incidentStore.create({ incidentId: 'inc-1', tenantId: TENANT_A, title: 'Test', severity: 'LOW' });
      
      // Create PROMOTED snapshot
      await createSnapshot('snap-promoted', 'inc-1', TENANT_A, { retentionPolicy: 'PROMOTED' });

      // Advance time past expiry
      clock.advanceHours(200);

      // Run cleanup
      const result = await snapshotStore.deleteExpired(TENANT_A);

      // PROMOTED should be protected
      expect(result.deletedCount).toBe(0);
      expect(result.protectedBy.promoted).toBe(1);

      // Snapshot still exists
      const snapshot = await snapshotStore.findById('snap-promoted');
      expect(snapshot).not.toBeNull();
    });

    it('baseline snapshots are never deleted', async () => {
      await incidentStore.create({ incidentId: 'inc-1', tenantId: TENANT_A, title: 'Test', severity: 'LOW' });
      
      // Create baseline snapshot (STANDARD policy but isBaseline=true)
      await createSnapshot('snap-baseline', 'inc-1', TENANT_A, { isBaseline: true });

      // Advance time past expiry
      clock.advanceHours(200);

      // Run cleanup
      const result = await snapshotStore.deleteExpired(TENANT_A);

      // Baseline should be protected
      expect(result.deletedCount).toBe(0);
      expect(result.protectedBy.baseline).toBe(1);

      // Snapshot still exists
      const snapshot = await snapshotStore.findById('snap-baseline');
      expect(snapshot).not.toBeNull();
    });

    it('STANDARD non-baseline expired snapshots ARE deleted', async () => {
      await incidentStore.create({ incidentId: 'inc-1', tenantId: TENANT_A, title: 'Test', severity: 'LOW' });
      
      // Create STANDARD snapshot (default)
      await createSnapshot('snap-standard', 'inc-1', TENANT_A);

      // Advance time past expiry (72h for STANDARD)
      clock.advanceHours(100);

      // Run cleanup
      const result = await snapshotStore.deleteExpired(TENANT_A);

      // STANDARD should be deleted
      expect(result.deletedCount).toBe(1);
      expect(result.protectedCount).toBe(0);

      // Snapshot no longer exists
      const snapshot = await snapshotStore.findById('snap-standard');
      expect(snapshot).toBeNull();
    });

    it('mixed snapshots: only STANDARD non-baseline deleted', async () => {
      await incidentStore.create({ incidentId: 'inc-1', tenantId: TENANT_A, title: 'Test', severity: 'LOW' });
      
      // Create various snapshots
      await createSnapshot('snap-legal', 'inc-1', TENANT_A);
      await snapshotStore.applyLegalHold(TENANT_A, 'snap-legal');
      
      await createSnapshot('snap-promoted', 'inc-1', TENANT_A, { retentionPolicy: 'PROMOTED' });
      await createSnapshot('snap-baseline', 'inc-1', TENANT_A, { isBaseline: true });
      await createSnapshot('snap-standard-1', 'inc-1', TENANT_A);
      await createSnapshot('snap-standard-2', 'inc-1', TENANT_A);

      // Advance time past expiry
      clock.advanceHours(200);

      // Run cleanup
      const result = await snapshotStore.deleteExpired(TENANT_A);

      // Only STANDARD non-baseline deleted
      // Note: LEGAL_HOLD has no expiresAt so it's not counted as "protected from expiry"
      // PROMOTED has expiresAt but is protected
      // Baseline has expiresAt but is protected
      expect(result.deletedCount).toBe(2); // snap-standard-1, snap-standard-2
      expect(result.protectedBy.promoted).toBe(1);
      expect(result.protectedBy.baseline).toBe(1);

      // Protected snapshots still exist
      expect(await snapshotStore.findById('snap-legal')).not.toBeNull();
      expect(await snapshotStore.findById('snap-promoted')).not.toBeNull();
      expect(await snapshotStore.findById('snap-baseline')).not.toBeNull();

      // Deleted snapshots gone
      expect(await snapshotStore.findById('snap-standard-1')).toBeNull();
      expect(await snapshotStore.findById('snap-standard-2')).toBeNull();
    });
  });

  // ============================================================================
  // Lock 4: Cleanup job cross-tenant isolation
  // ============================================================================

  describe('Lock 4: Cleanup job cross-tenant isolation', () => {
    it('cleanup only affects specified tenant', async () => {
      await incidentStore.create({ incidentId: 'inc-1', tenantId: TENANT_A, title: 'Test A', severity: 'LOW' });
      await incidentStore.create({ incidentId: 'inc-2', tenantId: TENANT_B, title: 'Test B', severity: 'LOW' });
      
      // Create STANDARD snapshots for both tenants
      await createSnapshot('snap-A', 'inc-1', TENANT_A);
      await createSnapshot('snap-B', 'inc-2', TENANT_B);

      // Advance time past expiry
      clock.advanceHours(100);

      // Run cleanup for TENANT_A only
      const result = await snapshotStore.deleteExpired(TENANT_A);

      // Only TENANT_A snapshot deleted
      expect(result.deletedCount).toBe(1);

      // TENANT_A snapshot gone
      expect(await snapshotStore.findById('snap-A')).toBeNull();

      // TENANT_B snapshot still exists
      expect(await snapshotStore.findById('snap-B')).not.toBeNull();
    });

    it('cleanup cannot delete other tenant snapshots even with same incidentId', async () => {
      // Same incidentId, different tenants
      await incidentStore.create({ incidentId: 'inc-shared', tenantId: TENANT_A, title: 'Test A', severity: 'LOW' });
      await incidentStore.create({ incidentId: 'inc-shared', tenantId: TENANT_B, title: 'Test B', severity: 'LOW' });
      
      await createSnapshot('snap-A', 'inc-shared', TENANT_A);
      await createSnapshot('snap-B', 'inc-shared', TENANT_B);

      // Advance time past expiry
      clock.advanceHours(100);

      // Run cleanup for TENANT_A
      await snapshotStore.deleteExpired(TENANT_A);

      // TENANT_B snapshot still exists
      const snapshotB = await snapshotStore.findById('snap-B');
      expect(snapshotB).not.toBeNull();
      expect(snapshotB?.tenantId).toBe(TENANT_B);
    });
  });

  // ============================================================================
  // Lock 5: Archive semantics (soft-hide, policy preserved)
  // ============================================================================

  describe('Lock 5: Archive semantics', () => {
    it('archive does NOT change retentionPolicy', async () => {
      await incidentStore.create({ incidentId: 'inc-1', tenantId: TENANT_A, title: 'Test', severity: 'LOW' });
      await createSnapshot('snap-1', 'inc-1', TENANT_A);
      await snapshotStore.applyLegalHold(TENANT_A, 'snap-1');

      // Archive
      await legalHoldService.archiveLegalHold(TENANT_A, 'snap-1');

      // Policy should still be LEGAL_HOLD
      const snapshot = await snapshotStore.findById('snap-1');
      expect(snapshot?.retentionPolicy).toBe('LEGAL_HOLD');
      expect(snapshot?.archivedAt).toBeDefined();
    });

    it('baseline snapshots cannot be archived', async () => {
      await incidentStore.create({ incidentId: 'inc-1', tenantId: TENANT_A, title: 'Test', severity: 'LOW' });
      await createSnapshot('snap-baseline', 'inc-1', TENANT_A);
      await snapshotStore.applyLegalHold(TENANT_A, 'snap-baseline');
      await incidentStore.setBaseline('inc-1', 'snap-baseline');

      // Try to archive baseline
      const result = await legalHoldService.archiveLegalHold(TENANT_A, 'snap-baseline');

      expect(result.success).toBe(false);
      expect(result.error).toBe('IS_BASELINE');
    });

    it('only LEGAL_HOLD snapshots can be archived', async () => {
      await incidentStore.create({ incidentId: 'inc-1', tenantId: TENANT_A, title: 'Test', severity: 'LOW' });
      await createSnapshot('snap-standard', 'inc-1', TENANT_A);

      // Try to archive STANDARD snapshot
      const result = await legalHoldService.archiveLegalHold(TENANT_A, 'snap-standard');

      expect(result.success).toBe(false);
      expect(result.error).toBe('NOT_LEGAL_HOLD');
    });
  });
});
