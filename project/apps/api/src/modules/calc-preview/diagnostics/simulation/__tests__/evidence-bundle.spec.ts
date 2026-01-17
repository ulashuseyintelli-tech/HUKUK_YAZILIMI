/**
 * Evidence Bundle Service Tests
 * 
 * Phase 8 - Sprint 2E
 * 
 * Tests for evidence bundle export and integrity verification.
 * 
 * KEY RULES:
 * - contentHash is computed from payload only (not metadata)
 * - Same content = same hash regardless of exportedAt/exportedBy
 * - Uses canonicalHash from determinism.ts (single source)
 */

import { EvidenceBundleService } from '../evidence-bundle.service';
import { InMemoryIncidentStore } from '../incident-store.service';
import { InMemorySnapshotStore } from '../../evidence/snapshot-store.service';
import { ClockService } from '../../evidence/clock.service';
import { canonicalHash } from '../determinism';
import { EvidenceBundle, BUNDLE_FORMAT_VERSION } from '../evidence-bundle.types';
import { IncidentRunSummary } from '../incident.types';
import { EvidenceSnapshot } from '../../diagnostics.types';
import { AuditActor } from '../../evidence/snapshot-audit.types';

describe('EvidenceBundleService', () => {
  let service: EvidenceBundleService;
  let incidentStore: InMemoryIncidentStore;
  let snapshotStore: InMemorySnapshotStore;
  let clock: ClockService;

  beforeEach(() => {
    clock = new ClockService();
    clock.setFakeTime(new Date('2025-01-15T10:00:00Z'));
    incidentStore = new InMemoryIncidentStore(clock);
    snapshotStore = new InMemorySnapshotStore(clock);
    service = new EvidenceBundleService(clock, incidentStore, snapshotStore);
  });

  // Helper to create test snapshot
  const createSnapshot = (id: string, incidentId: string): EvidenceSnapshot => ({
    snapshotId: id,
    tenantId: 'tenant-001',
    incidentId,
    capturedAt: clock.nowIso(),
    points: [
      { metric: 'error_rate', value: 0.02, unit: 'ratio', windowSec: 300, confidence: 0.95, freshnessSec: 30, source: 'prometheus', timestamp: clock.nowIso() },
      { metric: 'latency_p99', value: 150, unit: 'ms', windowSec: 300, confidence: 0.90, freshnessSec: 30, source: 'prometheus', timestamp: clock.nowIso() },
    ],
  });

  // Helper to setup incident with run data
  const setupIncidentWithRun = async () => {
    // Create incident
    await incidentStore.create({
      incidentId: 'inc-001',
      tenantId: 'tenant-001',
      title: 'Test Incident',
      severity: 'HIGH',
    });

    // Create snapshots
    const baselineSnapshot = createSnapshot('snap-baseline', 'inc-001');
    const currentSnapshot = createSnapshot('snap-current', 'inc-001');
    
    await snapshotStore.save(baselineSnapshot);
    clock.advanceHours(1);
    await snapshotStore.save(currentSnapshot);

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

    return { baselineSnapshot, currentSnapshot, summary };
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

    it('should include drift explainability', async () => {
      await setupIncidentWithRun();

      const result = await service.exportBundle('inc-001');

      expect(result.bundle?.payload.driftExplainability).toBeDefined();
      expect(result.bundle?.payload.driftExplainability.driftScore).toBe(0.05);
      expect(result.bundle?.payload.driftExplainability.driftBlocked).toBe(false);
      expect(result.bundle?.payload.driftExplainability.commonMetrics).toContain('error_rate');
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
        tenantId: 'tenant-001',
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
        tenantId: 'tenant-001',
        title: 'Different Incident',
        severity: 'LOW',
      });

      const differentSnapshot = createSnapshot('snap-different', 'inc-002');
      differentSnapshot.points[0].value = 0.99; // Different value
      await snapshotStore.save(differentSnapshot);
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
        tenantId: 'tenant-001',
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
        tenantId: 'tenant-001',
        title: 'Blocked Incident',
        severity: 'HIGH',
      });

      const baselineSnapshot = createSnapshot('snap-blocked-baseline', 'inc-blocked');
      const currentSnapshot = createSnapshot('snap-blocked-current', 'inc-blocked');
      await snapshotStore.save(baselineSnapshot);
      await snapshotStore.save(currentSnapshot);
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
  });
});
