/**
 * Legal Hold Controller Tests
 * 
 * Sprint 2F - Task 9.4-9.5
 * 
 * Unit tests and property tests for legal hold controller.
 * 
 * RED LINE: Baseline snapshots cannot be archived (409)
 * 
 * @see .kiro/specs/simulation-api-2f/design.md
 */

import * as fc from 'fast-check';
import { LegalHoldController } from '../legal-hold.controller';
import { LegalHoldInventoryService } from '../../simulation/legal-hold-inventory.service';
import { InMemoryIncidentStore } from '../../simulation/incident-store.service';
import { InMemorySnapshotStore } from '../../evidence/snapshot-store.service';
import { IClock } from '../../evidence/clock.service';
import { SimulationTenantContext } from '../guards/simulation-rbac.guard';
import { CannotArchiveBaselineException } from '../simulation-error.types';

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

  advanceDays(days: number): void {
    this.advanceSeconds(days * 24 * 60 * 60);
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
  controller: LegalHoldController;
  incidentStore: InMemoryIncidentStore;
  snapshotStore: InMemorySnapshotStore;
  legalHoldService: LegalHoldInventoryService;
} {
  const clock = new MockClock();
  const snapshotStore = new InMemorySnapshotStore(clock);
  const incidentStore = new InMemoryIncidentStore(clock);
  const legalHoldService = new LegalHoldInventoryService(clock, snapshotStore, incidentStore);

  const controller = new LegalHoldController(
    clock,
    legalHoldService,
    snapshotStore,
    incidentStore,
  );

  return { clock, controller, incidentStore, snapshotStore, legalHoldService };
}

function createTenantContext(tenantId: string, role: 'tenant-admin' | 'internal-ops' = 'tenant-admin'): SimulationTenantContext {
  return {
    tenantId,
    userId: `user-${tenantId}`,
    role,
  };
}

async function createLegalHoldSnapshot(
  snapshotStore: InMemorySnapshotStore,
  snapshotId: string,
  incidentId: string,
  tenantId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await snapshotStore.save({
    snapshotId,
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

  // Apply legal hold
  await snapshotStore.applyLegalHold(snapshotId);
}

async function createTestIncident(
  incidentStore: InMemoryIncidentStore,
  incidentId: string,
  tenantId: string,
  baselineSnapshotId?: string,
): Promise<void> {
  await incidentStore.create({
    incidentId,
    tenantId,
    title: `Test Incident ${incidentId}`,
    severity: 'MEDIUM',
  });

  if (baselineSnapshotId) {
    await incidentStore.setBaseline(incidentId, baselineSnapshotId);
  }
}

// ============================================================================
// Unit Tests
// ============================================================================

describe('LegalHoldController', () => {
  describe('GET /legal-holds', () => {
    it('should return empty list when no legal holds exist', async () => {
      const { controller } = createTestContext();
      const ctx = createTenantContext('tenant-1');

      const result = await controller.listLegalHolds(undefined, undefined, ctx);

      expect(result.holds).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    it('should return legal holds for tenant-admin (own tenant only)', async () => {
      const { controller, snapshotStore, incidentStore } = createTestContext();
      
      // Create legal holds for two tenants
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      await createTestIncident(incidentStore, 'inc-2', 'tenant-2');
      await createLegalHoldSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
      await createLegalHoldSnapshot(snapshotStore, 'snap-2', 'inc-2', 'tenant-2');

      const ctx = createTenantContext('tenant-1');

      const result = await controller.listLegalHolds(undefined, undefined, ctx);

      // Should only see tenant-1's holds
      expect(result.holds.length).toBe(1);
      expect(result.holds[0].tenantId).toBe('tenant-1');
    });

    it('should ignore tenantId query param for tenant-admin', async () => {
      const { controller, snapshotStore, incidentStore } = createTestContext();
      
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      await createTestIncident(incidentStore, 'inc-2', 'tenant-2');
      await createLegalHoldSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
      await createLegalHoldSnapshot(snapshotStore, 'snap-2', 'inc-2', 'tenant-2');

      const ctx = createTenantContext('tenant-1');

      // Try to query tenant-2's holds as tenant-1
      const result = await controller.listLegalHolds(undefined, 'tenant-2', ctx);

      // Should still only see tenant-1's holds (query param ignored)
      expect(result.holds.length).toBe(1);
      expect(result.holds[0].tenantId).toBe('tenant-1');
    });

    it('should allow internal-ops to see all tenants', async () => {
      const { controller, snapshotStore, incidentStore } = createTestContext();
      
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      await createTestIncident(incidentStore, 'inc-2', 'tenant-2');
      await createLegalHoldSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
      await createLegalHoldSnapshot(snapshotStore, 'snap-2', 'inc-2', 'tenant-2');

      const ctx = createTenantContext('tenant-ops', 'internal-ops');

      const result = await controller.listLegalHolds(undefined, undefined, ctx);

      // Should see all holds
      expect(result.holds.length).toBe(2);
    });

    it('should allow internal-ops to filter by tenantId', async () => {
      const { controller, snapshotStore, incidentStore } = createTestContext();
      
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      await createTestIncident(incidentStore, 'inc-2', 'tenant-2');
      await createLegalHoldSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
      await createLegalHoldSnapshot(snapshotStore, 'snap-2', 'inc-2', 'tenant-2');

      const ctx = createTenantContext('tenant-ops', 'internal-ops');

      const result = await controller.listLegalHolds(undefined, 'tenant-2', ctx);

      // Should only see tenant-2's holds
      expect(result.holds.length).toBe(1);
      expect(result.holds[0].tenantId).toBe('tenant-2');
    });

    it('should filter by incidentId', async () => {
      const { controller, snapshotStore, incidentStore } = createTestContext();
      
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      await createTestIncident(incidentStore, 'inc-2', 'tenant-1');
      await createLegalHoldSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
      await createLegalHoldSnapshot(snapshotStore, 'snap-2', 'inc-2', 'tenant-1');

      const ctx = createTenantContext('tenant-1');

      const result = await controller.listLegalHolds('inc-1', undefined, ctx);

      expect(result.holds.length).toBe(1);
      expect(result.holds[0].incidentId).toBe('inc-1');
    });
  });

  describe('POST /legal-holds/:snapshotId/archive', () => {
    it('should return 404 for non-existent snapshot', async () => {
      const { controller } = createTestContext();
      const ctx = createTenantContext('tenant-1');

      await expect(
        controller.archiveLegalHold('non-existent', ctx),
      ).rejects.toThrow();
    });

    it('should return 404 for wrong tenant (tenant-admin)', async () => {
      const { controller, snapshotStore, incidentStore } = createTestContext();
      
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      await createLegalHoldSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');

      const ctx = createTenantContext('tenant-2'); // Different tenant

      await expect(
        controller.archiveLegalHold('snap-1', ctx),
      ).rejects.toThrow();
    });

    it('should return 409 for baseline snapshot (RED LINE)', async () => {
      const { controller, snapshotStore, incidentStore } = createTestContext();
      
      await createLegalHoldSnapshot(snapshotStore, 'snap-baseline', 'inc-1', 'tenant-1');
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1', 'snap-baseline');

      const ctx = createTenantContext('tenant-1');

      // RED LINE: Cannot archive baseline
      await expect(
        controller.archiveLegalHold('snap-baseline', ctx),
      ).rejects.toThrow(CannotArchiveBaselineException);
    });

    it('should archive non-baseline legal hold successfully', async () => {
      const { controller, snapshotStore, incidentStore } = createTestContext();
      
      // Create baseline and non-baseline snapshots
      await createLegalHoldSnapshot(snapshotStore, 'snap-baseline', 'inc-1', 'tenant-1');
      await createLegalHoldSnapshot(snapshotStore, 'snap-other', 'inc-1', 'tenant-1');
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1', 'snap-baseline');

      const ctx = createTenantContext('tenant-1');

      // Archive non-baseline
      const result = await controller.archiveLegalHold('snap-other', ctx);

      expect(result.archived).toBe(true);
      expect(result.changed).toBe(true);
    });

    it('should be idempotent (archive already archived)', async () => {
      const { controller, snapshotStore, incidentStore } = createTestContext();
      
      await createLegalHoldSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');

      const ctx = createTenantContext('tenant-1');

      // Archive twice
      const result1 = await controller.archiveLegalHold('snap-1', ctx);
      const result2 = await controller.archiveLegalHold('snap-1', ctx);

      expect(result1.archived).toBe(true);
      expect(result1.changed).toBe(true);
      expect(result2.archived).toBe(true);
      expect(result2.changed).toBe(false); // Already archived
    });
  });

  describe('GET /legal-holds/stats', () => {
    it('should return zero stats when no legal holds exist', async () => {
      const { controller } = createTestContext();
      const ctx = createTenantContext('tenant-1');

      const result = await controller.getStats(ctx);

      expect(result.totalCount).toBe(0);
      expect(result.byIncidentCount).toEqual({});
      expect(result.oldestHoldAt).toBeNull();
      expect(result.averageAgeDays).toBe(0);
    });

    it('should calculate stats correctly', async () => {
      const { controller, snapshotStore, incidentStore, clock } = createTestContext();
      
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      await createTestIncident(incidentStore, 'inc-2', 'tenant-1');
      
      // Create legal holds at different times
      await createLegalHoldSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
      clock.advanceDays(5);
      await createLegalHoldSnapshot(snapshotStore, 'snap-2', 'inc-1', 'tenant-1');
      await createLegalHoldSnapshot(snapshotStore, 'snap-3', 'inc-2', 'tenant-1');

      const ctx = createTenantContext('tenant-1');

      const result = await controller.getStats(ctx);

      expect(result.totalCount).toBe(3);
      expect(result.byIncidentCount['inc-1']).toBe(2);
      expect(result.byIncidentCount['inc-2']).toBe(1);
      expect(result.oldestHoldAt).toBeDefined();
      expect(result.averageAgeDays).toBeGreaterThan(0);
    });

    it('should filter stats by tenant for tenant-admin', async () => {
      const { controller, snapshotStore, incidentStore } = createTestContext();
      
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      await createTestIncident(incidentStore, 'inc-2', 'tenant-2');
      await createLegalHoldSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
      await createLegalHoldSnapshot(snapshotStore, 'snap-2', 'inc-2', 'tenant-2');

      const ctx = createTenantContext('tenant-1');

      const result = await controller.getStats(ctx);

      // Should only count tenant-1's holds
      expect(result.totalCount).toBe(1);
    });
  });
});

// ============================================================================
// Property Tests
// ============================================================================

describe('Feature: simulation-api-2f, Property 10: Baseline Cannot Be Archived', () => {
  it('attempting to archive baseline always returns 409', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (incidentSuffix, tenantSuffix) => {
          // Create fresh context for each iteration
          const { controller, snapshotStore, incidentStore } = createTestContext();
          
          const incidentId = `inc-${incidentSuffix.slice(0, 8)}`;
          const tenantId = `tenant-${tenantSuffix.slice(0, 8)}`;
          const baselineSnapshotId = `snap-baseline-${incidentSuffix.slice(0, 8)}`;

          // Create baseline snapshot with legal hold
          await createLegalHoldSnapshot(snapshotStore, baselineSnapshotId, incidentId, tenantId);
          await createTestIncident(incidentStore, incidentId, tenantId, baselineSnapshotId);

          const ctx = createTenantContext(tenantId);

          // Property: archiving baseline ALWAYS throws 409
          await expect(
            controller.archiveLegalHold(baselineSnapshotId, ctx),
          ).rejects.toThrow(CannotArchiveBaselineException);
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('Feature: simulation-api-2f, Property: Non-Baseline Archive Success', () => {
  it('non-baseline legal holds can always be archived', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (incidentSuffix, tenantSuffix) => {
          // Create fresh context for each iteration
          const { controller, snapshotStore, incidentStore } = createTestContext();
          
          const incidentId = `inc-${incidentSuffix.slice(0, 8)}`;
          const tenantId = `tenant-${tenantSuffix.slice(0, 8)}`;
          const baselineSnapshotId = `snap-baseline-${incidentSuffix.slice(0, 8)}`;
          const otherSnapshotId = `snap-other-${incidentSuffix.slice(0, 8)}`;

          // Create baseline and non-baseline snapshots
          await createLegalHoldSnapshot(snapshotStore, baselineSnapshotId, incidentId, tenantId);
          await createLegalHoldSnapshot(snapshotStore, otherSnapshotId, incidentId, tenantId);
          await createTestIncident(incidentStore, incidentId, tenantId, baselineSnapshotId);

          const ctx = createTenantContext(tenantId);

          // Property: non-baseline can always be archived
          const result = await controller.archiveLegalHold(otherSnapshotId, ctx);
          expect(result.archived).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('Feature: simulation-api-2f, Property: Tenant Isolation in Legal Holds', () => {
  it('tenant-admin can only see own tenant legal holds', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.uuid(), { minLength: 2, maxLength: 5 }),
        async (tenantSuffixes) => {
          // Create fresh context for each iteration
          const { controller, snapshotStore, incidentStore } = createTestContext();
          
          const tenantIds = tenantSuffixes.map((s, i) => `tenant-${s.slice(0, 4)}-${i}`);

          // Create legal holds for each tenant
          for (let i = 0; i < tenantIds.length; i++) {
            const tenantId = tenantIds[i];
            const incidentId = `inc-${i}`;
            const snapshotId = `snap-${i}`;
            
            await createTestIncident(incidentStore, incidentId, tenantId);
            await createLegalHoldSnapshot(snapshotStore, snapshotId, incidentId, tenantId);
          }

          // Each tenant-admin should only see their own holds
          for (const tenantId of tenantIds) {
            const ctx = createTenantContext(tenantId);
            const result = await controller.listLegalHolds(undefined, undefined, ctx);

            // Property: all returned holds belong to the requesting tenant
            for (const hold of result.holds) {
              expect(hold.tenantId).toBe(tenantId);
            }
          }
        },
      ),
      { numRuns: 20 },
    );
  });
});
