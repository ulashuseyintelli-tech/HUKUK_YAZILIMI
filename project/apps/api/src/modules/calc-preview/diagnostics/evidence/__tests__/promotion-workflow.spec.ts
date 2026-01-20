/**
 * Promotion Workflow Tests
 * 
 * Phase 8 - Sprint 2C
 * Phase 9B.5 - Migrated to MockSnapshotStore
 * 
 * Tests for markPromoted, applyLegalHold, and setRetentionPolicy.
 * 
 * NOTE: These tests use MockSnapshotStore which implements ISnapshotStore.
 * The mock enforces the same contract as production store.
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 */

import { MockSnapshotStore } from '../../simulation-api/__tests__/mock-snapshot-store';
import { MockClockService } from '../clock.service';
import { canonicalHash, canonicalStringify } from '../../simulation/determinism';

describe('Promotion Workflow', () => {
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

  // ============================================================================
  // promoteToBaseline Tests (replaces markPromoted)
  // ============================================================================

  describe('promoteToBaseline', () => {
    it('should throw error when snapshot not found', async () => {
      await expect(store.promoteToBaseline(TENANT_ID, 'non-existent')).rejects.toThrow('not found');
    });

    it('should promote snapshot to baseline', async () => {
      await createSnapshot('snap-001');

      await store.promoteToBaseline(TENANT_ID, 'snap-001');

      const stored = await store.findById('snap-001');
      expect(stored?.isBaseline).toBe(true);
    });

    it('should be idempotent - second call does not throw', async () => {
      await createSnapshot('snap-001');

      await store.promoteToBaseline(TENANT_ID, 'snap-001');
      await store.promoteToBaseline(TENANT_ID, 'snap-001'); // Should not throw

      const stored = await store.findById('snap-001');
      expect(stored?.isBaseline).toBe(true);
    });
  });

  // ============================================================================
  // applyLegalHold Tests
  // ============================================================================

  describe('applyLegalHold', () => {
    it('should return error when snapshot not found', async () => {
      const result = await store.applyLegalHold(TENANT_ID, 'non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('SNAPSHOT_NOT_FOUND');
    });

    it('should apply LEGAL_HOLD to STANDARD snapshot', async () => {
      await createSnapshot('snap-001');

      const result = await store.applyLegalHold(TENANT_ID, 'snap-001');

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.previousPolicy).toBe('STANDARD');
      expect(result.newPolicy).toBe('LEGAL_HOLD');

      const stored = await store.findById('snap-001');
      expect(stored?.retentionPolicy).toBe('LEGAL_HOLD');
      expect(stored?.expiresAt).toBeUndefined();
    });

    it('should apply LEGAL_HOLD to PROMOTED snapshot', async () => {
      await createSnapshot('snap-001');
      await store.setRetentionPolicy(TENANT_ID, 'snap-001', 'PROMOTED');

      const result = await store.applyLegalHold(TENANT_ID, 'snap-001');

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.previousPolicy).toBe('PROMOTED');
      expect(result.newPolicy).toBe('LEGAL_HOLD');
    });

    it('should be idempotent - second call returns changed=false', async () => {
      await createSnapshot('snap-001');

      const result1 = await store.applyLegalHold(TENANT_ID, 'snap-001');
      const result2 = await store.applyLegalHold(TENANT_ID, 'snap-001');

      expect(result1.changed).toBe(true);
      expect(result2.changed).toBe(false);
    });
  });

  // ============================================================================
  // setRetentionPolicy Tests
  // ============================================================================

  describe('setRetentionPolicy', () => {
    it('should return error when snapshot not found', async () => {
      const result = await store.setRetentionPolicy(TENANT_ID, 'non-existent', 'PROMOTED');

      expect(result.success).toBe(false);
      expect(result.error).toBe('SNAPSHOT_NOT_FOUND');
    });

    describe('upgrades (allowed)', () => {
      it('should allow STANDARD → PROMOTED', async () => {
        await createSnapshot('snap-001');

        const result = await store.setRetentionPolicy(TENANT_ID, 'snap-001', 'PROMOTED');

        expect(result.success).toBe(true);
        expect(result.changed).toBe(true);
        expect(result.previousPolicy).toBe('STANDARD');
        expect(result.newPolicy).toBe('PROMOTED');
      });

      it('should allow STANDARD → LEGAL_HOLD', async () => {
        await createSnapshot('snap-001');

        const result = await store.setRetentionPolicy(TENANT_ID, 'snap-001', 'LEGAL_HOLD');

        expect(result.success).toBe(true);
        expect(result.changed).toBe(true);
        expect(result.newPolicy).toBe('LEGAL_HOLD');
        
        const stored = await store.findById('snap-001');
        expect(stored?.expiresAt).toBeUndefined(); // LEGAL_HOLD never expires
      });

      it('should allow PROMOTED → LEGAL_HOLD', async () => {
        await createSnapshot('snap-001');
        await store.setRetentionPolicy(TENANT_ID, 'snap-001', 'PROMOTED');

        const result = await store.setRetentionPolicy(TENANT_ID, 'snap-001', 'LEGAL_HOLD');

        expect(result.success).toBe(true);
        expect(result.changed).toBe(true);
        expect(result.previousPolicy).toBe('PROMOTED');
        expect(result.newPolicy).toBe('LEGAL_HOLD');
      });
    });

    describe('same policy (no-op)', () => {
      it('should return changed=false for same policy', async () => {
        await createSnapshot('snap-001');

        const result = await store.setRetentionPolicy(TENANT_ID, 'snap-001', 'STANDARD');

        expect(result.success).toBe(true);
        expect(result.changed).toBe(false);
      });
    });

    describe('downgrades (FORBIDDEN)', () => {
      it('should reject PROMOTED → STANDARD', async () => {
        await createSnapshot('snap-001');
        await store.setRetentionPolicy(TENANT_ID, 'snap-001', 'PROMOTED');

        const result = await store.setRetentionPolicy(TENANT_ID, 'snap-001', 'STANDARD');

        expect(result.success).toBe(false);
        expect(result.error).toBe('RETENTION_DOWNGRADE_FORBIDDEN');
        expect(result.changed).toBe(false);

        // Policy should remain PROMOTED
        const stored = await store.findById('snap-001');
        expect(stored?.retentionPolicy).toBe('PROMOTED');
      });

      it('should reject LEGAL_HOLD → STANDARD', async () => {
        await createSnapshot('snap-001');
        await store.applyLegalHold(TENANT_ID, 'snap-001');

        const result = await store.setRetentionPolicy(TENANT_ID, 'snap-001', 'STANDARD');

        expect(result.success).toBe(false);
        expect(result.error).toBe('RETENTION_DOWNGRADE_FORBIDDEN');
      });

      it('should reject LEGAL_HOLD → PROMOTED', async () => {
        await createSnapshot('snap-001');
        await store.applyLegalHold(TENANT_ID, 'snap-001');

        const result = await store.setRetentionPolicy(TENANT_ID, 'snap-001', 'PROMOTED');

        expect(result.success).toBe(false);
        expect(result.error).toBe('RETENTION_DOWNGRADE_FORBIDDEN');
      });
    });
  });

  // ============================================================================
  // TTL Tests (based on createdAt, NOT promotedAt)
  // ============================================================================

  describe('TTL based on createdAt (NOT promotedAt)', () => {
    it('should delete STANDARD snapshot after 72h from createdAt', async () => {
      await createSnapshot('snap-001');
      
      // At 71h from creation - should still exist
      clock.advanceHours(71);
      let stored = await store.findById('snap-001');
      expect(stored).not.toBeNull();
      
      // At 73h from creation - should be expired (deleteExpired removes it)
      clock.advanceHours(2);
      const result = await store.deleteExpired(TENANT_ID);
      expect(result.deletedCount).toBe(1);
      
      stored = await store.findById('snap-001');
      expect(stored).toBeNull();
    });

    it('should NOT delete PROMOTED snapshot (Phase 10 - dokunulmazlar)', async () => {
      await createSnapshot('snap-001');
      await store.setRetentionPolicy(TENANT_ID, 'snap-001', 'PROMOTED');
      
      // At 167h from creation - should still exist
      clock.advanceHours(167);
      let stored = await store.findById('snap-001');
      expect(stored).not.toBeNull();
      
      // At 169h from creation - Phase 10: PROMOTED is protected (dokunulmazlar)
      clock.advanceHours(2);
      const result = await store.deleteExpired(TENANT_ID);
      // Phase 10 change: PROMOTED is never deleted
      expect(result.deletedCount).toBe(0);
      expect(result.protectedBy.promoted).toBe(1);
      
      // PROMOTED snapshot still exists
      stored = await store.findById('snap-001');
      expect(stored).not.toBeNull();
      expect(stored?.retentionPolicy).toBe('PROMOTED');
    });

    it('should NEVER delete LEGAL_HOLD snapshot', async () => {
      await createSnapshot('snap-001');
      await store.applyLegalHold(TENANT_ID, 'snap-001');
      
      // Advance 1 year
      clock.advanceHours(365 * 24);
      
      const result = await store.deleteExpired(TENANT_ID);
      expect(result.deletedCount).toBe(0);
      
      const stored = await store.findById('snap-001');
      expect(stored).not.toBeNull();
      expect(stored?.retentionPolicy).toBe('LEGAL_HOLD');
    });
  });

  // ============================================================================
  // tenantId Validation Tests
  // ============================================================================

  describe('tenantId validation', () => {
    it('should throw error for findByIncidentId with empty tenantId', async () => {
      await expect(
        store.findByIncidentId('', 'incident-001'),
      ).rejects.toThrow('tenantId is required');
    });

    it('should throw error for findBaseline with empty tenantId', async () => {
      await expect(
        store.findBaseline('', 'incident-001'),
      ).rejects.toThrow('tenantId is required');
    });

    it('should throw error for createSnapshot with empty tenantId', async () => {
      const now = clock.nowIso();
      const calcResult = { points: [], capturedAt: now };
      
      await expect(
        store.createSnapshot({
          snapshotId: 'snap-001',
          tenantId: '', // Empty!
          incidentId: 'incident-001',
          snapshotKind: 'CURRENT',
          verdict: 'PROCEED',
          driftScore: 0,
          calcResult,
          calcResultNorm: canonicalStringify(calcResult),
          calcHash: canonicalHash(calcResult),
        }),
      ).rejects.toThrow('tenantId is required');
    });
  });
});
