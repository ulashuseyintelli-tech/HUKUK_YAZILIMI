/**
 * Baseline Resolver Tests
 * 
 * Phase 9B.6 - Deterministic selection + tenant-aware mutations
 * 
 * Test Coverage:
 * - Tenant isolation (protectBaseline, isBaselineProtected)
 * - Deterministic order (policy priority, createdAt DESC, snapshotId ASC)
 * - tenantId validation (empty tenantId throws error)
 */

import { BaselineResolverService } from '../baseline-resolver.service';
import { ClockService } from '../../evidence/clock.service';
import { MockSnapshotStore } from '../../simulation-api/__tests__/mock-snapshot-store';
import { CreateSnapshotInput } from '../../persistence/snapshot-store.interface';
import { canonicalHash, canonicalStringify } from '../determinism';

describe('BaselineResolverService', () => {
  let clock: ClockService;
  let snapshotStore: MockSnapshotStore;
  let resolver: BaselineResolverService;

  const TENANT_ID = 'tenant-001';
  const OTHER_TENANT_ID = 'tenant-other';

  beforeEach(() => {
    clock = new ClockService();
    clock.setFakeTime(new Date('2025-01-15T10:00:00Z'));
    snapshotStore = new MockSnapshotStore(clock);
    resolver = new BaselineResolverService(snapshotStore);
  });

  const createSnapshotInput = (
    snapshotId: string,
    incidentId: string,
    createdAt: string,
    tenantId: string = TENANT_ID,
  ): CreateSnapshotInput => {
    const calcResult = {
      points: [{
        metric: 'error_rate',
        value: 0.05,
        unit: 'ratio',
        windowSec: 300,
        confidence: 0.95,
        freshnessSec: 30,
        source: 'prometheus',
        timestamp: createdAt,
      }],
    };
    const calcResultNorm = JSON.parse(canonicalStringify(calcResult));
    const calcHash = canonicalHash(calcResultNorm);
    return {
      snapshotId,
      tenantId,
      incidentId,
      snapshotKind: 'CURRENT',
      verdict: 'PROCEED',
      driftScore: 0.1,
      calcResult,
      calcResultNorm,
      calcHash,
    };
  };

  // ==========================================================================
  // selectBaseline Tests
  // ==========================================================================

  describe('selectBaseline', () => {
    it('should return NONE when no snapshots exist', async () => {
      const result = await resolver.selectBaseline(TENANT_ID, 'incident-001');
      expect(result.snapshotId).toBeNull();
      expect(result.source).toBe('NONE');
    });

    it('should select STANDARD snapshot when no PROMOTED exists', async () => {
      await snapshotStore.createSnapshot(
        createSnapshotInput('snap-001', 'incident-001', '2025-01-15T09:00:00Z'),
      );
      const result = await resolver.selectBaseline(TENANT_ID, 'incident-001');
      expect(result.snapshotId).toBe('snap-001');
      expect(result.source).toBe('STANDARD');
    });

    it('should only see snapshots from own tenant', async () => {
      // Create snapshot for OTHER tenant
      await snapshotStore.createSnapshot(
        createSnapshotInput('snap-other', 'incident-001', '2025-01-15T09:00:00Z', OTHER_TENANT_ID),
      );
      // Query with TENANT_ID should see nothing
      const result = await resolver.selectBaseline(TENANT_ID, 'incident-001');
      expect(result.snapshotId).toBeNull();
      expect(result.source).toBe('NONE');
    });
  });

  // ==========================================================================
  // Deterministic Order Tests
  // ==========================================================================

  describe('deterministic order', () => {
    it('should prefer LEGAL_HOLD over PROMOTED over STANDARD', async () => {
      // Create 3 snapshots with different policies
      await snapshotStore.createSnapshot(
        createSnapshotInput('snap-standard', 'incident-001', '2025-01-15T09:00:00Z'),
      );
      await snapshotStore.createSnapshot(
        createSnapshotInput('snap-promoted', 'incident-001', '2025-01-15T09:01:00Z'),
      );
      await snapshotStore.createSnapshot(
        createSnapshotInput('snap-legalhold', 'incident-001', '2025-01-15T09:02:00Z'),
      );

      // Upgrade policies
      await snapshotStore.setRetentionPolicy(TENANT_ID, 'snap-promoted', 'PROMOTED');
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-legalhold');

      const result = await resolver.selectBaseline(TENANT_ID, 'incident-001');
      expect(result.snapshotId).toBe('snap-legalhold');
      expect(result.source).toBe('PROMOTED'); // LEGAL_HOLD is treated as PROMOTED source
    });

    it('should prefer newer createdAt when policy is same', async () => {
      // Create 2 STANDARD snapshots with different times
      await snapshotStore.createSnapshot(
        createSnapshotInput('snap-older', 'incident-001', '2025-01-15T08:00:00Z'),
      );
      await snapshotStore.createSnapshot(
        createSnapshotInput('snap-newer', 'incident-001', '2025-01-15T09:00:00Z'),
      );

      const result = await resolver.selectBaseline(TENANT_ID, 'incident-001');
      expect(result.snapshotId).toBe('snap-newer');
    });

    it('should use snapshotId ASC as tie-breaker when policy and createdAt are same', async () => {
      // Create 2 snapshots with same createdAt (simulating same timestamp)
      const sameTime = '2025-01-15T09:00:00Z';
      await snapshotStore.createSnapshot(
        createSnapshotInput('snap-zzz', 'incident-001', sameTime),
      );
      await snapshotStore.createSnapshot(
        createSnapshotInput('snap-aaa', 'incident-001', sameTime),
      );

      const result = await resolver.selectBaseline(TENANT_ID, 'incident-001');
      // snapshotId ASC means 'snap-aaa' comes first
      expect(result.snapshotId).toBe('snap-aaa');
    });
  });

  // ==========================================================================
  // protectBaseline Tests
  // ==========================================================================

  describe('protectBaseline', () => {
    it('should apply LEGAL_HOLD to snapshot', async () => {
      await snapshotStore.createSnapshot(
        createSnapshotInput('snap-001', 'incident-001', '2025-01-15T09:00:00Z'),
      );
      const result = await resolver.protectBaseline(TENANT_ID, 'snap-001');
      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
    });

    it('should be idempotent (no error if already LEGAL_HOLD)', async () => {
      await snapshotStore.createSnapshot(
        createSnapshotInput('snap-001', 'incident-001', '2025-01-15T09:00:00Z'),
      );
      await resolver.protectBaseline(TENANT_ID, 'snap-001');
      const result = await resolver.protectBaseline(TENANT_ID, 'snap-001');
      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
    });

    it('should return NOT_FOUND for tenant mismatch (no information leakage)', async () => {
      // Create snapshot for OTHER tenant
      await snapshotStore.createSnapshot(
        createSnapshotInput('snap-other', 'incident-001', '2025-01-15T09:00:00Z', OTHER_TENANT_ID),
      );
      // Try to protect with wrong tenant
      const result = await resolver.protectBaseline(TENANT_ID, 'snap-other');
      expect(result.success).toBe(false);
      expect(result.error).toBe('SNAPSHOT_NOT_FOUND');
    });

    it('should return NOT_FOUND for non-existent snapshot', async () => {
      const result = await resolver.protectBaseline(TENANT_ID, 'non-existent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('SNAPSHOT_NOT_FOUND');
    });
  });

  // ==========================================================================
  // isBaselineProtected Tests
  // ==========================================================================

  describe('isBaselineProtected', () => {
    it('should return exists=true, protected=false for STANDARD snapshot', async () => {
      await snapshotStore.createSnapshot(
        createSnapshotInput('snap-001', 'incident-001', '2025-01-15T09:00:00Z'),
      );
      const result = await resolver.isBaselineProtected(TENANT_ID, 'snap-001');
      expect(result.exists).toBe(true);
      expect(result.protected).toBe(false);
      expect(result.policy).toBe('STANDARD');
    });

    it('should return exists=true, protected=true for LEGAL_HOLD snapshot', async () => {
      await snapshotStore.createSnapshot(
        createSnapshotInput('snap-001', 'incident-001', '2025-01-15T09:00:00Z'),
      );
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-001');
      const result = await resolver.isBaselineProtected(TENANT_ID, 'snap-001');
      expect(result.exists).toBe(true);
      expect(result.protected).toBe(true);
      expect(result.policy).toBe('LEGAL_HOLD');
    });

    it('should return exists=false for tenant mismatch (no information leakage)', async () => {
      // Create snapshot for OTHER tenant
      await snapshotStore.createSnapshot(
        createSnapshotInput('snap-other', 'incident-001', '2025-01-15T09:00:00Z', OTHER_TENANT_ID),
      );
      // Query with wrong tenant
      const result = await resolver.isBaselineProtected(TENANT_ID, 'snap-other');
      expect(result.exists).toBe(false);
      expect(result.protected).toBe(false);
    });

    it('should return exists=false for non-existent snapshot', async () => {
      const result = await resolver.isBaselineProtected(TENANT_ID, 'non-existent');
      expect(result.exists).toBe(false);
      expect(result.protected).toBe(false);
    });
  });

  // ==========================================================================
  // tenantId Validation Tests
  // ==========================================================================

  describe('tenantId validation', () => {
    it('should throw error for empty tenantId in selectBaseline', async () => {
      await expect(resolver.selectBaseline('', 'incident-001'))
        .rejects.toThrow('tenantId is required');
    });

    it('should throw error for empty tenantId in protectBaseline', async () => {
      await expect(resolver.protectBaseline('', 'snap-001'))
        .rejects.toThrow('tenantId is required');
    });

    it('should throw error for empty tenantId in isBaselineProtected', async () => {
      await expect(resolver.isBaselineProtected('', 'snap-001'))
        .rejects.toThrow('tenantId is required');
    });

    it('should throw error for empty tenantId in selectAndProtectBaseline', async () => {
      await expect(resolver.selectAndProtectBaseline('', 'incident-001'))
        .rejects.toThrow('tenantId is required');
    });

    it('should throw error for empty tenantId in getBaseline', async () => {
      await expect(resolver.getBaseline('', 'incident-001'))
        .rejects.toThrow('tenantId is required');
    });
  });

  // ==========================================================================
  // selectAndProtectBaseline Tests
  // ==========================================================================

  describe('selectAndProtectBaseline', () => {
    it('should select and protect baseline in one operation', async () => {
      await snapshotStore.createSnapshot(
        createSnapshotInput('snap-001', 'incident-001', '2025-01-15T09:00:00Z'),
      );
      const result = await resolver.selectAndProtectBaseline(TENANT_ID, 'incident-001');
      
      expect(result.selection.snapshotId).toBe('snap-001');
      expect(result.protection).not.toBeNull();
      expect(result.protection?.success).toBe(true);
      expect(result.protection?.changed).toBe(true);
    });

    it('should return null protection when no baseline exists', async () => {
      const result = await resolver.selectAndProtectBaseline(TENANT_ID, 'incident-001');
      
      expect(result.selection.snapshotId).toBeNull();
      expect(result.protection).toBeNull();
    });
  });

  // ==========================================================================
  // getBaseline Tests
  // ==========================================================================

  describe('getBaseline', () => {
    it('should return snapshot data for baseline', async () => {
      await snapshotStore.createSnapshot(
        createSnapshotInput('snap-001', 'incident-001', '2025-01-15T09:00:00Z'),
      );
      const snapshot = await resolver.getBaseline(TENANT_ID, 'incident-001');
      
      expect(snapshot).not.toBeNull();
      expect(snapshot?.snapshotId).toBe('snap-001');
      expect(snapshot?.tenantId).toBe(TENANT_ID);
    });

    it('should return null when no baseline exists', async () => {
      const snapshot = await resolver.getBaseline(TENANT_ID, 'incident-001');
      expect(snapshot).toBeNull();
    });

    it('should return null for tenant mismatch (defense in depth)', async () => {
      // Create snapshot for OTHER tenant
      await snapshotStore.createSnapshot(
        createSnapshotInput('snap-other', 'incident-001', '2025-01-15T09:00:00Z', OTHER_TENANT_ID),
      );
      const snapshot = await resolver.getBaseline(TENANT_ID, 'incident-001');
      expect(snapshot).toBeNull();
    });
  });
});
