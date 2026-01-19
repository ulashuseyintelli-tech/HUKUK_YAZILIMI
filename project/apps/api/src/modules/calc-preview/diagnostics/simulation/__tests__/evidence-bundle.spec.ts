/**
 * Evidence Bundle Service Tests
 * 
 * Phase 8 - Sprint 2E
 * Phase 9B.5 - Updated to use MockSnapshotStore and extractPoints projection
 * 
 * Tests for evidence bundle export and integrity verification.
 * 
 * KEY RULES:
 * - contentHash is computed from payload only (not metadata)
 * - Same content = same hash regardless of exportedAt/exportedBy
 * - Uses canonicalHash from determinism.ts (single source)
 * - points[] is extracted from calcResult via projection (not stored separately)
 * 
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 */

import { EvidenceBundleService } from '../evidence-bundle.service';
import { InMemoryIncidentStore } from '../incident-store.service';
import { MockSnapshotStore } from '../../simulation-api/__tests__/mock-snapshot-store';
import { ClockService } from '../../evidence/clock.service';
import { canonicalHash, canonicalStringify } from '../determinism';
import { EvidenceBundle, BUNDLE_FORMAT_VERSION } from '../evidence-bundle.types';
import { IncidentRunSummary } from '../incident.types';
import { CreateSnapshotInput } from '../../persistence/snapshot-store.interface';
import { AuditActor } from '../../evidence/snapshot-audit.types';

describe('EvidenceBundleService', () => {
  let service: EvidenceBundleService;
  let incidentStore: InMemoryIncidentStore;
  let snapshotStore: MockSnapshotStore;
  let clock: ClockService;

  const TENANT_ID = 'tenant-001';

  beforeEach(() => {
    clock = new ClockService();
    clock.setFakeTime(new Date('2025-01-15T10:00:00Z'));
    incidentStore = new InMemoryIncidentStore(clock);
    snapshotStore = new MockSnapshotStore(clock);
    service = new EvidenceBundleService(clock, incidentStore, snapshotStore);
  });

  // Helper to create test snapshot input
  const createSnapshotInput = (id: string, incidentId: string, errorRateValue = 0.02): CreateSnapshotInput => {
    const calcResult = {
      points: [
        { metric: 'error_rate' as const, value: errorRateValue, unit: 'ratio', windowSec: 300, confidence: 0.95, freshnessSec: 30, source: 'prometheus' as const, timestamp: clock.nowIso() },
        { metric: 'latency_p99' as const, value: 150, unit: 'ms', windowSec: 300, confidence: 0.90, freshnessSec: 30, source: 'prometheus' as const, timestamp: clock.nowIso() },
      ],
    };
    const calcResultNorm = JSON.parse(canonicalStringify(calcResult));
    const calcHash = canonicalHash(calcResultNorm);

    return {
      snapshotId: id,
      tenantId: TENANT_ID,
      incidentId,
      snapshotKind: 'CURRENT',
      verdict: 'PROCEED',
      driftScore: 0.05,
      calcResult,
      calcResultNorm,
      calcHash,
    };
  };

  // Helper to setup incident with run data
  const setupIncidentWithRun = async () => {
    // Create incident
    await incidentStore.create({
      incidentId: 'inc-001',
      tenantId: TENANT_ID,
      title: 'Test Incident',
      severity: 'HIGH',
    });

    // Create snapshots
    const baselineInput = createSnapshotInput('snap-baseline', 'inc-001');
    const currentInput = createSnapshotInput('snap-current', 'inc-001');
    
    await snapshotStore.createSnapshot(baselineInput);
    clock.advanceHours(1);
    await snapshotStore.createSnapshot(currentInput);

    // Set baseline
    await incidentStore.setBaseline('inc-001', 'snap-baseline');

    // Record run
    const summary: IncidentRunSummary = {
      runId: 'run-001',
      verdict: 'PROCEED',
      driftScore: 0.05,
      evidenceStatus: 'PASSED',
      driftBlocked: false,
      baselineSnapshotId: 'snap-baseline',
      currentSnapshotId: 'snap-current',
      runAt: clock.nowIso(),
    };
    await incidentStore.recordRun('inc-001', summary);

    return { baselineInput, currentInput, summary };
  };

  describe('exportBundle', () => {
    it('should export bundle successfully', async () => {
      await setupIncidentWithRun();

      const result = await service.exportBundle('inc-001');

      expect(result.success).toBe(true);
      expect(result.bundle).toBeDefined();
      expect(result.bundle?.meta.bundleId).toMatch(/^bundle_/);
      expect(result.bundle?.meta.formatVersion).toBe(BUNDLE_FORMAT_VERSION);
      expect(result.bundle?.payload.incidentId).toBe('inc-001');
      expect(result.bundle?.payload.runId).toBe('run-001');
    });

    it('should include baseline and current snapshots', async () => {
      await setupIncidentWithRun();

      const result = await service.exportBundle('inc-001');

      expect(result.bundle?.payload.baselineSnapshot.snapshotId).toBe('snap-baseline');
      expect(result.bundle?.payload.currentSnapshot.snapshotId).toBe('snap-current');
    });

    it('should extract points from calcResult via projection', async () => {
      await setupIncidentWithRun();

      const result = await service.exportBundle('inc-001');

      // Points should be extracted from calcResult
      expect(result.bundle?.payload.baselineSnapshot.points).toHaveLength(2);
      expect(result.bundle?.payload.currentSnapshot.points).toHaveLength(2);
      expect(result.bundle?.payload.baselineSnapshot.points[0].metric).toBe('error_rate');
    });

    it('should include drift explainability with common metrics', async () => {
      await setupIncidentWithRun();

      const result = await service.exportBundle('inc-001');

      expect(result.bundle?.payload.driftExplainability).toBeDefined();
      expect(result.bundle?.payload.driftExplainability.driftScore).toBe(0.05);
      expect(result.bundle?.payload.driftExplainability.driftBlocked).toBe(false);
      expect(result.bundle?.payload.driftExplainability.commonMetrics).toContain('error_rate');
      expect(result.bundle?.payload.driftExplainability.commonMetrics).toContain('latency_p99');
    });

    it('should include retention state', async () => {
      await setupIncidentWithRun();

      const result = await service.exportBundle('inc-001');

      expect(result.bundle?.payload.retentionState).toBeDefined();
      expect(result.bundle?.payload.retentionState.baselinePolicy).toBe('STANDARD');
    });

    it('should return error for non-existent incident', async () => {
      const result = await service.exportBundle('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('INCIDENT_NOT_FOUND');
    });

    it('should return error when no run data', async () => {
      await incidentStore.create({
        incidentId: 'inc-no-run',
        tenantId: TENANT_ID,
        title: 'No Run',
        severity: 'LOW',
      });

      const result = await service.exportBundle('inc-no-run');

      expect(result.success).toBe(false);
      expect(result.error).toBe('NO_RUN_DATA');
    });

    it('should return error when runId does not match', async () => {
      await setupIncidentWithRun();

      const result = await service.exportBundle('inc-001', 'wrong-run-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('NO_RUN_DATA');
    });

    it('should use actor from options', async () => {
      await setupIncidentWithRun();

      const result = await service.exportBundle('inc-001', undefined, { actor: 'user' as AuditActor });

      expect(result.bundle?.meta.exportedBy).toBe('user');
    });

    it('should default actor to system', async () => {
      await setupIncidentWithRun();

      const result = await service.exportBundle('inc-001');

      expect(result.bundle?.meta.exportedBy).toBe('system');
    });
  });

  describe('contentHash stability', () => {
    it('should produce same hash for same content regardless of exportedAt', async () => {
      await setupIncidentWithRun();

      // Export at time T1
      const result1 = await service.exportBundle('inc-001');
      const hash1 = result1.bundle?.contentHash;

      // Advance time
      clock.advanceHours(1);

      // Export at time T2
      const result2 = await service.exportBundle('inc-001');
      const hash2 = result2.bundle?.contentHash;

      // Hash should be same (exportedAt is NOT in payload)
      expect(hash1).toBe(hash2);
    });

    it('should produce same hash for same content regardless of exportedBy', async () => {
      await setupIncidentWithRun();

      // Export by user A
      const result1 = await service.exportBundle('inc-001', undefined, { actor: 'user' as AuditActor });
      const hash1 = result1.bundle?.contentHash;

      // Export by user B (service actor)
      const result2 = await service.exportBundle('inc-001', undefined, { actor: 'service' as AuditActor });
      const hash2 = result2.bundle?.contentHash;

      // Hash should be same (exportedBy is NOT in payload)
      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different content', async () => {
      // Setup first incident
      await setupIncidentWithRun();
      const result1 = await service.exportBundle('inc-001');
      const hash1 = result1.bundle?.contentHash;

      // Setup second incident with different data
      await incidentStore.create({
        incidentId: 'inc-002',
        tenantId: TENANT_ID,
        title: 'Different Incident',
        severity: 'LOW',
      });

      // Create snapshot with different error_rate value
      const differentInput = createSnapshotInput('snap-different', 'inc-002', 0.99);
      await snapshotStore.createSnapshot(differentInput);
      await incidentStore.setBaseline('inc-002', 'snap-different');

      const summary2: IncidentRunSummary = {
        runId: 'run-002',
        verdict: 'BLOCK_DRIFT',
        driftScore: 0.50,
        evidenceStatus: 'PASSED',
        driftBlocked: true,
        baselineSnapshotId: 'snap-different',
        currentSnapshotId: 'snap-different',
        runAt: clock.nowIso(),
      };
      await incidentStore.recordRun('inc-002', summary2);

      const result2 = await service.exportBundle('inc-002');
      const hash2 = result2.bundle?.contentHash;

      // Hash should be different
      expect(hash1).not.toBe(hash2);
    });

    it('should use canonicalHash from determinism.ts', async () => {
      await setupIncidentWithRun();

      const result = await service.exportBundle('inc-001');
      const bundle = result.bundle!;

      // Manually compute hash using same function
      const expectedHash = canonicalHash(bundle.payload);

      expect(bundle.contentHash).toBe(expectedHash);
    });
  });

  describe('verifyIntegrity', () => {
    it('should return true for valid bundle', async () => {
      await setupIncidentWithRun();

      const result = await service.exportBundle('inc-001');
      const bundle = result.bundle!;

      expect(service.verifyIntegrity(bundle)).toBe(true);
    });

    it('should return false for tampered payload', async () => {
      await setupIncidentWithRun();

      const result = await service.exportBundle('inc-001');
      const bundle = result.bundle!;

      // Tamper with payload
      bundle.payload.driftExplainability.driftScore = 0.99;

      expect(service.verifyIntegrity(bundle)).toBe(false);
    });

    it('should return false for tampered contentHash', async () => {
      await setupIncidentWithRun();

      const result = await service.exportBundle('inc-001');
      const bundle = result.bundle!;

      // Tamper with hash
      bundle.contentHash = 'tampered-hash';

      expect(service.verifyIntegrity(bundle)).toBe(false);
    });

    it('should return true even if metadata changed (metadata not in hash)', async () => {
      await setupIncidentWithRun();

      const result = await service.exportBundle('inc-001');
      const bundle = result.bundle!;

      // Change metadata (should not affect integrity)
      bundle.meta.exportedAt = '2099-12-31T23:59:59Z';
      bundle.meta.exportedBy = 'service' as AuditActor;
      bundle.meta.bundleId = 'fake-bundle-id';

      // Integrity should still pass (metadata not in hash)
      expect(service.verifyIntegrity(bundle)).toBe(true);
    });
  });

  describe('getCanonicalPayload', () => {
    it('should return deterministic JSON string', async () => {
      await setupIncidentWithRun();

      const result = await service.exportBundle('inc-001');
      const bundle = result.bundle!;

      const canonical1 = service.getCanonicalPayload(bundle);
      const canonical2 = service.getCanonicalPayload(bundle);

      expect(canonical1).toBe(canonical2);
      expect(typeof canonical1).toBe('string');
    });

    it('should produce same string for same payload regardless of key order', async () => {
      await setupIncidentWithRun();

      const result = await service.exportBundle('inc-001');
      const bundle = result.bundle!;

      // Create a copy with different key order
      const reorderedPayload = {
        retentionState: bundle.payload.retentionState,
        runId: bundle.payload.runId,
        incidentId: bundle.payload.incidentId,
        driftExplainability: bundle.payload.driftExplainability,
        evidenceChain: bundle.payload.evidenceChain,
        currentSnapshot: bundle.payload.currentSnapshot,
        baselineSnapshot: bundle.payload.baselineSnapshot,
      };

      const reorderedBundle: EvidenceBundle = {
        ...bundle,
        payload: reorderedPayload as any,
      };

      const canonical1 = service.getCanonicalPayload(bundle);
      const canonical2 = service.getCanonicalPayload(reorderedBundle);

      expect(canonical1).toBe(canonical2);
    });
  });

  describe('edge cases', () => {
    it('should handle missing snapshot gracefully', async () => {
      await incidentStore.create({
        incidentId: 'inc-missing-snap',
        tenantId: TENANT_ID,
        title: 'Missing Snapshot',
        severity: 'LOW',
      });

      const summary: IncidentRunSummary = {
        runId: 'run-missing',
        verdict: 'PROCEED',
        driftScore: 0.05,
        evidenceStatus: 'PASSED',
        driftBlocked: false,
        baselineSnapshotId: 'non-existent-baseline',
        currentSnapshotId: 'non-existent-current',
        runAt: clock.nowIso(),
      };
      await incidentStore.recordRun('inc-missing-snap', summary);

      const result = await service.exportBundle('inc-missing-snap');

      expect(result.success).toBe(false);
      expect(result.error).toBe('SNAPSHOT_NOT_FOUND');
    });

    it('should handle LEGAL_HOLD baseline in retention state', async () => {
      await setupIncidentWithRun();

      // Apply LEGAL_HOLD to baseline
      await snapshotStore.applyLegalHold('snap-baseline');

      const result = await service.exportBundle('inc-001');

      expect(result.bundle?.payload.retentionState.baselinePolicy).toBe('LEGAL_HOLD');
      expect(result.bundle?.payload.retentionState.baselineProtected).toBe(true);
    });

    it('should handle BLOCK_EVIDENCE verdict', async () => {
      await incidentStore.create({
        incidentId: 'inc-blocked',
        tenantId: TENANT_ID,
        title: 'Blocked Incident',
        severity: 'HIGH',
      });

      const baselineInput = createSnapshotInput('snap-blocked-baseline', 'inc-blocked');
      const currentInput = createSnapshotInput('snap-blocked-current', 'inc-blocked');
      await snapshotStore.createSnapshot(baselineInput);
      await snapshotStore.createSnapshot(currentInput);
      await incidentStore.setBaseline('inc-blocked', 'snap-blocked-baseline');

      const summary: IncidentRunSummary = {
        runId: 'run-blocked',
        verdict: 'BLOCK_EVIDENCE',
        driftScore: 0.05,
        evidenceStatus: 'FAILED',
        evidenceGateReason: 'STALE_EVIDENCE',
        driftBlocked: false,
        baselineSnapshotId: 'snap-blocked-baseline',
        currentSnapshotId: 'snap-blocked-current',
        runAt: clock.nowIso(),
      };
      await incidentStore.recordRun('inc-blocked', summary);

      const result = await service.exportBundle('inc-blocked');

      expect(result.success).toBe(true);
      expect(result.bundle?.payload.evidenceChain.verdict).toBe('BLOCK_EVIDENCE');
      expect(result.bundle?.payload.evidenceChain.verdictReason).toBe('STALE_EVIDENCE');
    });

    it('should handle empty calcResult gracefully', async () => {
      await incidentStore.create({
        incidentId: 'inc-empty',
        tenantId: TENANT_ID,
        title: 'Empty CalcResult',
        severity: 'LOW',
      });

      // Create snapshot with empty calcResult (no points)
      const emptyInput: CreateSnapshotInput = {
        snapshotId: 'snap-empty',
        tenantId: TENANT_ID,
        incidentId: 'inc-empty',
        snapshotKind: 'CURRENT',
        verdict: 'PROCEED',
        driftScore: 0,
        calcResult: {}, // Empty - no points
        calcResultNorm: {},
        calcHash: canonicalHash({}),
      };
      await snapshotStore.createSnapshot(emptyInput);
      await incidentStore.setBaseline('inc-empty', 'snap-empty');

      const summary: IncidentRunSummary = {
        runId: 'run-empty',
        verdict: 'PROCEED',
        driftScore: 0,
        evidenceStatus: 'PASSED',
        driftBlocked: false,
        baselineSnapshotId: 'snap-empty',
        currentSnapshotId: 'snap-empty',
        runAt: clock.nowIso(),
      };
      await incidentStore.recordRun('inc-empty', summary);

      const result = await service.exportBundle('inc-empty');

      expect(result.success).toBe(true);
      // Points should be empty array when calcResult has no points
      expect(result.bundle?.payload.baselineSnapshot.points).toEqual([]);
      expect(result.bundle?.payload.driftExplainability.commonMetrics).toEqual([]);
    });
  });
});
