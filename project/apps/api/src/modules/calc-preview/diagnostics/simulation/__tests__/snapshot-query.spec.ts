/**
 * Snapshot Query Service Tests
 * 
 * Phase 9B.5 - Query Facade Tests
 * 
 * Tests for SnapshotQueryService including:
 * - tenantId validation (CRITICAL: must fail if missing)
 * - Baseline resolution
 * - EvidenceSnapshotView conversion (VIEW ONLY - NOT PERSISTABLE)
 * 
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 */

import { SnapshotQueryService } from '../snapshot-query.service';
import { BaselineResolverService } from '../baseline-resolver.service';
import { MockSnapshotStore } from '../../simulation-api/__tests__/mock-snapshot-store';
import { ClockService } from '../../evidence/clock.service';
import { canonicalHash, canonicalStringify } from '../determinism';

describe('SnapshotQueryService', () => {
  let clock: ClockService;
  let snapshotStore: MockSnapshotStore;
  let baselineResolver: BaselineResolverService;
  let queryService: SnapshotQueryService;

  const TENANT_ID = 'tenant-001';

  beforeEach(() => {
    clock = new ClockService();
    clock.setFakeTime(new Date('2025-01-15T10:00:00Z'));
    snapshotStore = new MockSnapshotStore(clock);
    baselineResolver = new BaselineResolverService(snapshotStore);
    queryService = new SnapshotQueryService(snapshotStore, baselineResolver);
  });

  // Helper to create test snapshot
  async function createTestSnapshot(
    snapshotId: string,
    incidentId: string,
    tenantId: string,
    options: { isBaseline?: boolean; retentionPolicy?: 'STANDARD' | 'PROMOTED' | 'LEGAL_HOLD' } = {},
  ) {
    const now = clock.nowIso();
    const points = [
      {
        metric: 'latency_p95' as const,
        value: 100,
        unit: 'ms',
        confidence: 0.95,
        windowSec: 60,
        freshnessSec: 10,
        source: 'prometheus' as const,
        timestamp: now,
      },
    ];
    const calcResult = { points, capturedAt: now };
    const calcResultNorm = canonicalStringify(calcResult);
    const calcHash = canonicalHash(calcResult);

    return snapshotStore.createSnapshot({
      snapshotId,
      tenantId,
      incidentId,
      snapshotKind: options.isBaseline ? 'BASELINE' : 'CURRENT',
      isBaseline: options.isBaseline ?? false,
      verdict: 'PROCEED',
      driftScore: 0,
      calcResult,
      calcResultNorm,
      calcHash,
      retentionPolicy: options.retentionPolicy ?? 'STANDARD',
    });
  }

  // ============================================================================
  // CRITICAL: tenantId Validation Tests
  // ============================================================================

  describe('tenantId validation (CRITICAL)', () => {
    it('should throw error when tenantId is empty string', async () => {
      await expect(
        queryService.getBaselineSnapshot('', 'incident-001'),
      ).rejects.toThrow('tenantId is required');
    });

    it('should throw error when tenantId is undefined', async () => {
      await expect(
        queryService.getBaselineSnapshot(undefined as unknown as string, 'incident-001'),
      ).rejects.toThrow('tenantId is required');
    });

    it('should throw error for listByIncident with empty tenantId', async () => {
      await expect(
        queryService.listByIncident('', 'incident-001'),
      ).rejects.toThrow('tenantId is required');
    });

    it('should throw error for getLatestSnapshot with empty tenantId', async () => {
      await expect(
        queryService.getLatestSnapshot('', 'incident-001'),
      ).rejects.toThrow('tenantId is required');
    });

    it('should throw error for getSnapshotById with empty tenantId', async () => {
      await expect(
        queryService.getSnapshotById('', 'snap-001'),
      ).rejects.toThrow('tenantId is required');
    });
  });

  // ============================================================================
  // getBaselineSnapshot Tests
  // ============================================================================

  describe('getBaselineSnapshot', () => {
    it('should return null when no snapshots exist', async () => {
      const result = await queryService.getBaselineSnapshot(TENANT_ID, 'incident-001');

      expect(result.snapshot).toBeNull();
      expect(result.evidenceSnapshot).toBeNull();
      expect(result.source).toBe('NONE');
    });

    it('should return baseline snapshot with evidenceSnapshot', async () => {
      await createTestSnapshot('snap-001', 'incident-001', TENANT_ID, { isBaseline: true });

      const result = await queryService.getBaselineSnapshot(TENANT_ID, 'incident-001');

      expect(result.snapshot).not.toBeNull();
      expect(result.snapshot?.snapshotId).toBe('snap-001');
      expect(result.evidenceSnapshot).not.toBeNull();
      expect(result.evidenceSnapshot?.snapshotId).toBe('snap-001');
      expect(result.evidenceSnapshot?.points).toHaveLength(1);
      expect(result.evidenceSnapshot?.capturedAt).toBeDefined();
    });

    it('should not return snapshot from different tenant', async () => {
      await createTestSnapshot('snap-001', 'incident-001', 'other-tenant', { isBaseline: true });

      const result = await queryService.getBaselineSnapshot(TENANT_ID, 'incident-001');

      expect(result.snapshot).toBeNull();
      expect(result.source).toBe('NONE');
    });

    it('should select PROMOTED over STANDARD', async () => {
      await createTestSnapshot('snap-standard', 'incident-001', TENANT_ID);
      await createTestSnapshot('snap-promoted', 'incident-001', TENANT_ID, { retentionPolicy: 'PROMOTED' });

      const result = await queryService.getBaselineSnapshot(TENANT_ID, 'incident-001');

      expect(result.snapshot?.snapshotId).toBe('snap-promoted');
      expect(result.source).toBe('PROMOTED');
    });
  });

  // ============================================================================
  // getLatestSnapshot Tests
  // ============================================================================

  describe('getLatestSnapshot', () => {
    it('should return null when no snapshots exist', async () => {
      const result = await queryService.getLatestSnapshot(TENANT_ID, 'incident-001');

      expect(result.snapshot).toBeNull();
      expect(result.evidenceSnapshot).toBeNull();
    });

    it('should return latest snapshot with evidenceSnapshot', async () => {
      await createTestSnapshot('snap-001', 'incident-001', TENANT_ID);
      clock.advanceSeconds(60);
      await createTestSnapshot('snap-002', 'incident-001', TENANT_ID);

      const result = await queryService.getLatestSnapshot(TENANT_ID, 'incident-001');

      expect(result.snapshot?.snapshotId).toBe('snap-002');
      expect(result.evidenceSnapshot?.snapshotId).toBe('snap-002');
    });
  });

  // ============================================================================
  // listByIncident Tests
  // ============================================================================

  describe('listByIncident', () => {
    it('should return empty array when no snapshots exist', async () => {
      const result = await queryService.listByIncident(TENANT_ID, 'incident-001');

      expect(result).toEqual([]);
    });

    it('should return snapshots sorted by createdAt DESC', async () => {
      await createTestSnapshot('snap-001', 'incident-001', TENANT_ID);
      clock.advanceSeconds(60);
      await createTestSnapshot('snap-002', 'incident-001', TENANT_ID);
      clock.advanceSeconds(60);
      await createTestSnapshot('snap-003', 'incident-001', TENANT_ID);

      const result = await queryService.listByIncident(TENANT_ID, 'incident-001');

      expect(result).toHaveLength(3);
      expect(result[0].snapshotId).toBe('snap-003'); // newest first
      expect(result[1].snapshotId).toBe('snap-002');
      expect(result[2].snapshotId).toBe('snap-001');
    });

    it('should only return snapshots for specified tenant', async () => {
      await createTestSnapshot('snap-001', 'incident-001', TENANT_ID);
      await createTestSnapshot('snap-002', 'incident-001', 'other-tenant');

      const result = await queryService.listByIncident(TENANT_ID, 'incident-001');

      expect(result).toHaveLength(1);
      expect(result[0].snapshotId).toBe('snap-001');
    });
  });

  // ============================================================================
  // getSnapshotById Tests
  // ============================================================================

  describe('getSnapshotById', () => {
    it('should return null for non-existent snapshot', async () => {
      const result = await queryService.getSnapshotById(TENANT_ID, 'non-existent');

      expect(result).toBeNull();
    });

    it('should return snapshot when found', async () => {
      await createTestSnapshot('snap-001', 'incident-001', TENANT_ID);

      const result = await queryService.getSnapshotById(TENANT_ID, 'snap-001');

      expect(result).not.toBeNull();
      expect(result?.snapshotId).toBe('snap-001');
    });

    it('should return null for snapshot from different tenant (security)', async () => {
      await createTestSnapshot('snap-001', 'incident-001', 'other-tenant');

      const result = await queryService.getSnapshotById(TENANT_ID, 'snap-001');

      expect(result).toBeNull(); // Don't leak existence
    });
  });

  // ============================================================================
  // EvidenceSnapshotView Conversion Tests (VIEW ONLY - NOT PERSISTABLE)
  // ============================================================================

  describe('EvidenceSnapshotView conversion', () => {
    it('should extract points from calcResult', async () => {
      await createTestSnapshot('snap-001', 'incident-001', TENANT_ID);

      const result = await queryService.getBaselineSnapshot(TENANT_ID, 'incident-001');

      expect(result.evidenceSnapshot?.points).toHaveLength(1);
      expect(result.evidenceSnapshot?.points[0].metric).toBe('latency_p95');
    });

    it('should extract capturedAt from calcResult', async () => {
      await createTestSnapshot('snap-001', 'incident-001', TENANT_ID);

      const result = await queryService.getBaselineSnapshot(TENANT_ID, 'incident-001');

      expect(result.evidenceSnapshot?.capturedAt).toBeDefined();
      expect(new Date(result.evidenceSnapshot!.capturedAt).getTime()).toBeGreaterThan(0);
    });

    it('should set promoted=true for PROMOTED policy', async () => {
      await createTestSnapshot('snap-001', 'incident-001', TENANT_ID, { retentionPolicy: 'PROMOTED' });

      const result = await queryService.getBaselineSnapshot(TENANT_ID, 'incident-001');

      expect(result.evidenceSnapshot?.promoted).toBe(true);
    });

    it('should set promoted=true for LEGAL_HOLD policy', async () => {
      await createTestSnapshot('snap-001', 'incident-001', TENANT_ID);
      await snapshotStore.applyLegalHold(TENANT_ID, 'snap-001');

      const result = await queryService.getBaselineSnapshot(TENANT_ID, 'incident-001');

      expect(result.evidenceSnapshot?.promoted).toBe(true);
    });

    it('should set promoted=false for STANDARD policy', async () => {
      await createTestSnapshot('snap-001', 'incident-001', TENANT_ID, { retentionPolicy: 'STANDARD' });

      const result = await queryService.getBaselineSnapshot(TENANT_ID, 'incident-001');

      expect(result.evidenceSnapshot?.promoted).toBe(false);
    });
  });
});
