/**
 * Evidence Bundle Controller Tests
 * 
 * Sprint 2F - Task 8.4-8.5
 * 
 * Unit tests and property tests for evidence bundle controller.
 * 
 * RED LINE #5: Bundle verify mismatch returns 200 + ok:false
 * 
 * @see .kiro/specs/simulation-api-2f/design.md
 */

import * as fc from 'fast-check';
import { EvidenceBundleController } from '../evidence-bundle.controller';
import { EvidenceBundleService } from '../../simulation/evidence-bundle.service';
import { InMemoryIncidentStore } from '../../simulation/incident-store.service';
import { InMemorySnapshotStore } from '../../evidence/snapshot-store.service';
import { IClock } from '../../evidence/clock.service';
import { SimulationTenantContext } from '../guards/simulation-rbac.guard';
import { IncidentNotFoundException, BundleNotFoundException } from '../simulation-error.types';

// ============================================================================
// Mock Clock
// ============================================================================

class MockClock implements IClock {
  private currentTime: Date;

  constructor(initialTime: Date = new Date('2024-01-15T10:00:00Z')) {
    this.currentTime = new Date(initialTime);
  }

  now(): Date {
    return new Date(this.currentTime);
  }

  nowMs(): number {
    return this.currentTime.getTime();
  }

  nowIso(): string {
    return this.currentTime.toISOString();
  }

  ageInSeconds(timestamp: string | Date): number {
    const then = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return Math.floor((this.currentTime.getTime() - then.getTime()) / 1000);
  }

  isOlderThan(timestamp: string | Date, thresholdSec: number): boolean {
    return this.ageInSeconds(timestamp) > thresholdSec;
  }

  advanceSeconds(seconds: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + seconds * 1000);
  }

  reset(to?: Date): void {
    this.currentTime = to ? new Date(to) : new Date('2024-01-15T10:00:00Z');
  }
}

// ============================================================================
// Test Helpers
// ============================================================================

function createTestContext(): {
  clock: MockClock;
  controller: EvidenceBundleController;
  incidentStore: InMemoryIncidentStore;
  snapshotStore: InMemorySnapshotStore;
  bundleService: EvidenceBundleService;
} {
  const clock = new MockClock();
  const snapshotStore = new InMemorySnapshotStore(clock);
  const incidentStore = new InMemoryIncidentStore(clock);
  const bundleService = new EvidenceBundleService(clock, incidentStore, snapshotStore);

  const controller = new EvidenceBundleController(bundleService, incidentStore);

  return { clock, controller, incidentStore, snapshotStore, bundleService };
}

function createTenantContext(tenantId: string, role: 'tenant-admin' | 'internal-ops' = 'tenant-admin'): SimulationTenantContext {
  return {
    tenantId,
    userId: `user-${tenantId}`,
    role,
  };
}

async function createTestIncidentWithRun(
  incidentStore: InMemoryIncidentStore,
  snapshotStore: InMemorySnapshotStore,
  incidentId: string,
  tenantId: string,
): Promise<{ runId: string; baselineSnapshotId: string; currentSnapshotId: string }> {
  // Create incident
  await incidentStore.create({
    incidentId,
    tenantId,
    title: `Test Incident ${incidentId}`,
    severity: 'MEDIUM',
  });

  // Create snapshots
  const baselineSnapshotId = `snap-baseline-${incidentId}`;
  const currentSnapshotId = `snap-current-${incidentId}`;
  const now = new Date().toISOString();

  await snapshotStore.save({
    snapshotId: baselineSnapshotId,
    incidentId,
    tenantId,
    capturedAt: now,
    points: [
      { 
        metric: 'latency_p95', 
        value: 100, 
        unit: 'ms', 
        confidence: 0.95,
        windowSec: 60,
        freshnessSec: 10,
        source: 'prometheus',
        timestamp: now,
      },
    ],
  });

  await snapshotStore.save({
    snapshotId: currentSnapshotId,
    incidentId,
    tenantId,
    capturedAt: now,
    points: [
      { 
        metric: 'latency_p95', 
        value: 110, 
        unit: 'ms', 
        confidence: 0.95,
        windowSec: 60,
        freshnessSec: 10,
        source: 'prometheus',
        timestamp: now,
      },
    ],
  });

  // Set baseline
  await incidentStore.setBaseline(incidentId, baselineSnapshotId);

  // Record a run
  const runId = `run-${incidentId}-1`;
  await incidentStore.recordRun(incidentId, {
    runId,
    verdict: 'PROCEED',
    driftScore: 0.05,
    evidenceStatus: 'PASSED',
    driftBlocked: false,
    baselineSnapshotId,
    currentSnapshotId,
    runAt: now,
  });

  return { runId, baselineSnapshotId, currentSnapshotId };
}

// ============================================================================
// Unit Tests
// ============================================================================

describe('EvidenceBundleController', () => {
  describe('POST /incidents/:id/runs/:runId/export-bundle', () => {
    it('should return 404 for non-existent incident', async () => {
      const { controller } = createTestContext();
      const ctx = createTenantContext('tenant-1');

      await expect(
        controller.exportBundle('non-existent', 'run-1', ctx),
      ).rejects.toThrow(IncidentNotFoundException);
    });

    it('should return 404 for wrong tenant (tenant-admin)', async () => {
      const { controller, incidentStore, snapshotStore } = createTestContext();
      await createTestIncidentWithRun(incidentStore, snapshotStore, 'inc-1', 'tenant-1');
      const ctx = createTenantContext('tenant-2'); // Different tenant

      await expect(
        controller.exportBundle('inc-1', 'run-inc-1-1', ctx),
      ).rejects.toThrow(IncidentNotFoundException);
    });

    it('should export bundle successfully', async () => {
      const { controller, incidentStore, snapshotStore } = createTestContext();
      const { runId } = await createTestIncidentWithRun(incidentStore, snapshotStore, 'inc-1', 'tenant-1');
      const ctx = createTenantContext('tenant-1');

      const result = await controller.exportBundle('inc-1', runId, ctx);

      expect(result.bundleId).toBeDefined();
      expect(result.contentHash).toBeDefined();
      expect(result.bundleId).toMatch(/^bundle_/);
    });

    it('should allow internal-ops to export any tenant bundle', async () => {
      const { controller, incidentStore, snapshotStore } = createTestContext();
      const { runId } = await createTestIncidentWithRun(incidentStore, snapshotStore, 'inc-1', 'tenant-1');
      const ctx = createTenantContext('tenant-ops', 'internal-ops');

      const result = await controller.exportBundle('inc-1', runId, ctx);

      expect(result.bundleId).toBeDefined();
    });
  });

  describe('GET /evidence-bundles/:bundleId', () => {
    it('should return 404 for non-existent bundle', async () => {
      const { controller } = createTestContext();
      const ctx = createTenantContext('tenant-1');

      await expect(
        controller.getBundle('non-existent', ctx),
      ).rejects.toThrow(BundleNotFoundException);
    });

    it('should return bundle after export', async () => {
      const { controller, incidentStore, snapshotStore } = createTestContext();
      const { runId } = await createTestIncidentWithRun(incidentStore, snapshotStore, 'inc-1', 'tenant-1');
      const ctx = createTenantContext('tenant-1');

      // Export bundle
      const exportResult = await controller.exportBundle('inc-1', runId, ctx);

      // Get bundle
      const bundle = await controller.getBundle(exportResult.bundleId, ctx);

      expect(bundle.meta.bundleId).toBe(exportResult.bundleId);
      expect(bundle.contentHash).toBe(exportResult.contentHash);
      expect(bundle.payload).toBeDefined();
    });

    it('should return 404 for wrong tenant bundle (tenant-admin)', async () => {
      const { controller, incidentStore, snapshotStore } = createTestContext();
      const { runId } = await createTestIncidentWithRun(incidentStore, snapshotStore, 'inc-1', 'tenant-1');
      const ctx1 = createTenantContext('tenant-1');
      const ctx2 = createTenantContext('tenant-2');

      // Export as tenant-1
      const exportResult = await controller.exportBundle('inc-1', runId, ctx1);

      // Try to get as tenant-2
      await expect(
        controller.getBundle(exportResult.bundleId, ctx2),
      ).rejects.toThrow(BundleNotFoundException);
    });
  });

  describe('GET /evidence-bundles/:bundleId/verify', () => {
    it('should return 404 for non-existent bundle', async () => {
      const { controller } = createTestContext();

      await expect(
        controller.verifyBundle('non-existent'),
      ).rejects.toThrow(BundleNotFoundException);
    });

    it('should return ok:true for valid bundle (RED LINE #5)', async () => {
      const { controller, incidentStore, snapshotStore } = createTestContext();
      const { runId } = await createTestIncidentWithRun(incidentStore, snapshotStore, 'inc-1', 'tenant-1');
      const ctx = createTenantContext('tenant-1');

      // Export bundle
      const exportResult = await controller.exportBundle('inc-1', runId, ctx);

      // Verify bundle
      const verifyResult = await controller.verifyBundle(exportResult.bundleId);

      expect(verifyResult.ok).toBe(true);
      expect(verifyResult.expectedHash).toBe(exportResult.contentHash);
      expect(verifyResult.actualHash).toBe(exportResult.contentHash);
    });

    it('should return 200 + ok:false for tampered bundle (RED LINE #5)', async () => {
      const { controller, incidentStore, snapshotStore } = createTestContext();
      const { runId } = await createTestIncidentWithRun(incidentStore, snapshotStore, 'inc-1', 'tenant-1');
      const ctx = createTenantContext('tenant-1');

      // Export bundle
      const exportResult = await controller.exportBundle('inc-1', runId, ctx);

      // Tamper with bundle (modify stored hash)
      const bundle = controller.getBundleFromStore(exportResult.bundleId);
      if (bundle) {
        // Modify the stored hash to simulate tampering
        (bundle as any).contentHash = 'tampered-hash';
      }

      // Verify bundle - should return 200 + ok:false (NOT error)
      const verifyResult = await controller.verifyBundle(exportResult.bundleId);

      // RED LINE #5: 200 OK even for mismatch
      expect(verifyResult.ok).toBe(false);
      expect(verifyResult.expectedHash).toBe('tampered-hash');
      expect(verifyResult.actualHash).not.toBe('tampered-hash');
    });
  });
});

// ============================================================================
// Property Tests
// ============================================================================

describe('Feature: simulation-api-2f, Property 11: Bundle Verify Integrity', () => {
  it('exported bundle verifies successfully immediately after export', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (incidentSuffix, tenantSuffix) => {
          // Create fresh context for each iteration
          const { controller, incidentStore, snapshotStore } = createTestContext();
          
          const incidentId = `inc-${incidentSuffix.slice(0, 8)}`;
          const tenantId = `tenant-${tenantSuffix.slice(0, 8)}`;

          const { runId } = await createTestIncidentWithRun(
            incidentStore,
            snapshotStore,
            incidentId,
            tenantId,
          );

          const ctx = createTenantContext(tenantId);

          // Export bundle
          const exportResult = await controller.exportBundle(incidentId, runId, ctx);

          // Verify immediately
          const verifyResult = await controller.verifyBundle(exportResult.bundleId);

          // Property: exported bundle always verifies successfully
          expect(verifyResult.ok).toBe(true);
          expect(verifyResult.expectedHash).toBe(exportResult.contentHash);
          expect(verifyResult.actualHash).toBe(exportResult.contentHash);
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('Feature: simulation-api-2f, Property: Bundle Export Idempotency', () => {
  it('multiple exports of same run produce different bundle IDs but same content hash', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        async (exportCount) => {
          // Create fresh context for each iteration
          const { controller, incidentStore, snapshotStore } = createTestContext();
          
          const { runId } = await createTestIncidentWithRun(
            incidentStore,
            snapshotStore,
            'inc-1',
            'tenant-1',
          );

          const ctx = createTenantContext('tenant-1');

          const bundleIds: string[] = [];
          const contentHashes: string[] = [];

          // Export multiple times
          for (let i = 0; i < exportCount; i++) {
            const result = await controller.exportBundle('inc-1', runId, ctx);
            bundleIds.push(result.bundleId);
            contentHashes.push(result.contentHash);
          }

          // All bundle IDs should be unique
          const uniqueBundleIds = new Set(bundleIds);
          expect(uniqueBundleIds.size).toBe(exportCount);

          // All content hashes should be the same (deterministic)
          const uniqueHashes = new Set(contentHashes);
          expect(uniqueHashes.size).toBe(1);
        },
      ),
      { numRuns: 20 },
    );
  });
});
