/**
 * Legal Hold Controller Tests
 * 
 * Sprint 2F - Task 9.4-9.5
 * Phase 9B.5 - Updated to use MockSnapshotStore
 * Phase 9B.6 - Step 4: Tenant-aware wiring + HTTP error mapping tests
 * 
 * Unit tests and property tests for legal hold controller.
 * 
 * RED LINE: Baseline snapshots cannot be archived (409)
 * 
 * STEP 4 TESTS:
 * - internal-ops without tenantId query → 400
 * - tenant mismatch archive → 404 (no leakage)
 * - NOT_LEGAL_HOLD archive attempt → 400
 * - list with incidentId uses listLegalHoldsByIncident
 * - list without incidentId uses listLegalHolds
 * - deterministic order in list response
 * - tenant-admin tenantId query ignored (logged)
 * 
 * @see .kiro/specs/simulation-api-2f/design.md
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 */

import * as fc from 'fast-check';
import { HttpException, HttpStatus } from '@nestjs/common';
import { LegalHoldController } from '../legal-hold.controller';
import { LegalHoldInventoryService } from '../../simulation/legal-hold-inventory.service';
import { InMemoryIncidentStore } from '../../simulation/incident-store.service';
import { MockSnapshotStore } from './mock-snapshot-store';
import { ISnapshotStore } from '../../persistence/snapshot-store.interface';
import { IClock } from '../../evidence/clock.service';
import { SimulationTenantContext } from '../guards/simulation-rbac.guard';
import { CannotArchiveBaselineException } from '../simulation-error.types';
import { canonicalHash } from '../../simulation/determinism';

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
  snapshotStore: MockSnapshotStore;
  legalHoldService: LegalHoldInventoryService;
} {
  const clock = new MockClock();
  const snapshotStore = new MockSnapshotStore(clock);
  const incidentStore = new InMemoryIncidentStore(clock);
  
  // Create LegalHoldInventoryService with mock
  const legalHoldService = new LegalHoldInventoryService(clock, snapshotStore as unknown as ISnapshotStore, incidentStore);
  // Override the injected store
  (legalHoldService as any).snapshotStore = snapshotStore;

  const controller = new LegalHoldController(
    legalHoldService,
    snapshotStore as unknown as ISnapshotStore,
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
  snapshotStore: MockSnapshotStore,
  snapshotId: string,
  incidentId: string,
  tenantId: string,
): Promise<void> {
  const calcResult = { latency_p95: 100 };
  const calcResultNorm = { latency_p95: '100' };
  const calcHash = canonicalHash(calcResultNorm);

  await snapshotStore.createSnapshot({
    snapshotId,
    incidentId,
    tenantId,
    snapshotKind: 'CURRENT',
    verdict: 'PROCEED',
    driftScore: 0,
    calcResult,
    calcResultNorm,
    calcHash,
  });

  // Apply legal hold
  await snapshotStore.applyLegalHold(tenantId, snapshotId);
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
      expect(result.holds[0].snapshotId).toBe('snap-1');
      // tenantId should NOT be in response (Step 4 change)
      expect((result.holds[0] as any).tenantId).toBeUndefined();
    });

    it('should ignore tenantId query param for tenant-admin (security)', async () => {
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
      expect(result.holds[0].snapshotId).toBe('snap-1');
    });

    it('should require tenantId query param for internal-ops (400 if missing)', async () => {
      const { controller } = createTestContext();
      const ctx = createTenantContext('ops-tenant', 'internal-ops');

      // internal-ops without tenantId query → 400
      await expect(
        controller.listLegalHolds(undefined, undefined, ctx),
      ).rejects.toThrow(HttpException);

      try {
        await controller.listLegalHolds(undefined, undefined, ctx);
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect((e as HttpException).getResponse()).toMatchObject({
          message: expect.stringContaining('tenantId query parameter is required'),
        });
      }
    });

    it('should allow internal-ops to filter by tenantId query', async () => {
      const { controller, snapshotStore, incidentStore } = createTestContext();
      
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      await createTestIncident(incidentStore, 'inc-2', 'tenant-2');
      await createLegalHoldSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
      await createLegalHoldSnapshot(snapshotStore, 'snap-2', 'inc-2', 'tenant-2');

      const ctx = createTenantContext('tenant-ops', 'internal-ops');

      const result = await controller.listLegalHolds(undefined, 'tenant-2', ctx);

      // Should only see tenant-2's holds
      expect(result.holds.length).toBe(1);
      expect(result.holds[0].snapshotId).toBe('snap-2');
    });

    it('should filter by incidentId using listLegalHoldsByIncident', async () => {
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

    it('should include isBaseline in response', async () => {
      const { controller, snapshotStore, incidentStore } = createTestContext();
      
      await createLegalHoldSnapshot(snapshotStore, 'snap-baseline', 'inc-1', 'tenant-1');
      await createLegalHoldSnapshot(snapshotStore, 'snap-other', 'inc-1', 'tenant-1');
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1', 'snap-baseline');

      const ctx = createTenantContext('tenant-1');

      const result = await controller.listLegalHolds(undefined, undefined, ctx);

      const baselineHold = result.holds.find(h => h.snapshotId === 'snap-baseline');
      const otherHold = result.holds.find(h => h.snapshotId === 'snap-other');

      expect(baselineHold?.isBaseline).toBe(true);
      expect(otherHold?.isBaseline).toBe(false);
    });

    it('should return deterministic order (createdAt DESC, snapshotId ASC)', async () => {
      const { controller, snapshotStore, incidentStore, clock } = createTestContext();
      
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');

      // Create snapshots at different times
      await createLegalHoldSnapshot(snapshotStore, 'snap-c', 'inc-1', 'tenant-1');
      clock.advanceDays(1);
      await createLegalHoldSnapshot(snapshotStore, 'snap-a', 'inc-1', 'tenant-1');
      clock.advanceDays(1);
      await createLegalHoldSnapshot(snapshotStore, 'snap-b', 'inc-1', 'tenant-1');

      const ctx = createTenantContext('tenant-1');

      const result = await controller.listLegalHolds(undefined, undefined, ctx);

      // Should be sorted by createdAt DESC (newest first)
      expect(result.holds[0].snapshotId).toBe('snap-b'); // newest
      expect(result.holds[1].snapshotId).toBe('snap-a');
      expect(result.holds[2].snapshotId).toBe('snap-c'); // oldest
    });
  });

  describe('POST /legal-holds/:snapshotId/archive', () => {
    it('should return 404 for non-existent snapshot', async () => {
      const { controller } = createTestContext();
      const ctx = createTenantContext('tenant-1');

      await expect(
        controller.archiveLegalHold('non-existent', ctx),
      ).rejects.toThrow(HttpException);

      try {
        await controller.archiveLegalHold('non-existent', ctx);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });

    it('should return 404 for wrong tenant (tenant-admin) - no leakage', async () => {
      const { controller, snapshotStore, incidentStore } = createTestContext();
      
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      await createLegalHoldSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');

      const ctx = createTenantContext('tenant-2'); // Different tenant

      await expect(
        controller.archiveLegalHold('snap-1', ctx),
      ).rejects.toThrow(HttpException);

      try {
        await controller.archiveLegalHold('snap-1', ctx);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
        // Message should NOT reveal that snapshot exists for another tenant
        expect((e as HttpException).getResponse()).toMatchObject({
          message: expect.stringContaining('not found'),
        });
      }
    });

    it('should return 400 for NOT_LEGAL_HOLD snapshot', async () => {
      const { controller, snapshotStore, incidentStore } = createTestContext();
      
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      
      // Create snapshot WITHOUT legal hold
      const calcResult = { latency_p95: 100 };
      const calcResultNorm = { latency_p95: '100' };
      const calcHash = canonicalHash(calcResultNorm);
      await snapshotStore.createSnapshot({
        snapshotId: 'snap-standard',
        incidentId: 'inc-1',
        tenantId: 'tenant-1',
        snapshotKind: 'CURRENT',
        verdict: 'PROCEED',
        driftScore: 0,
        calcResult,
        calcResultNorm,
        calcHash,
      });
      // NOT applying legal hold

      const ctx = createTenantContext('tenant-1');

      await expect(
        controller.archiveLegalHold('snap-standard', ctx),
      ).rejects.toThrow(HttpException);

      try {
        await controller.archiveLegalHold('snap-standard', ctx);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect((e as HttpException).getResponse()).toMatchObject({
          message: expect.stringContaining('not LEGAL_HOLD'),
        });
      }
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

    it('should allow internal-ops to archive any tenant snapshot', async () => {
      const { controller, snapshotStore, incidentStore } = createTestContext();
      
      await createLegalHoldSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');

      const ctx = createTenantContext('ops-tenant', 'internal-ops');

      // internal-ops can archive any tenant's snapshot
      const result = await controller.archiveLegalHold('snap-1', ctx);

      expect(result.archived).toBe(true);
      expect(result.changed).toBe(true);
    });
  });

  describe('GET /legal-holds/stats', () => {
    it('should return zero stats when no legal holds exist', async () => {
      const { controller } = createTestContext();
      const ctx = createTenantContext('tenant-1');

      const result = await controller.getStats(undefined, ctx);

      expect(result.totalCount).toBe(0);
      expect(result.byIncidentCount).toEqual({});
      expect(result.oldestHoldAt).toBeNull();
      expect(result.averageAgeDays).toBe(0);
    });

    it('should require tenantId query param for internal-ops', async () => {
      const { controller } = createTestContext();
      const ctx = createTenantContext('ops-tenant', 'internal-ops');

      await expect(
        controller.getStats(undefined, ctx),
      ).rejects.toThrow(HttpException);

      try {
        await controller.getStats(undefined, ctx);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      }
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

      const result = await controller.getStats(undefined, ctx);

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

      const result = await controller.getStats(undefined, ctx);

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
            // Note: tenantId is no longer in DTO, so we verify by count
            expect(result.holds.length).toBe(1);
          }
        },
      ),
      { numRuns: 20 },
    );
  });
});

describe('Feature: Step 4, Property: internal-ops requires tenantId', () => {
  it('internal-ops without tenantId always returns 400', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (opsTenantSuffix) => {
          const { controller } = createTestContext();
          const ctx = createTenantContext(`ops-${opsTenantSuffix.slice(0, 8)}`, 'internal-ops');

          // Property: internal-ops without tenantId ALWAYS throws 400
          try {
            await controller.listLegalHolds(undefined, undefined, ctx);
            // Should not reach here
            expect(true).toBe(false);
          } catch (e) {
            expect(e).toBeInstanceOf(HttpException);
            expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
          }
        },
      ),
      { numRuns: 20 },
    );
  });
});

describe('Feature: Step 4, Property: Tenant mismatch returns 404 (no leakage)', () => {
  it('tenant mismatch on archive always returns 404', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (tenant1Suffix, tenant2Suffix) => {
          // Ensure different tenants
          const tenantId1 = `tenant-${tenant1Suffix.slice(0, 8)}`;
          const tenantId2 = `tenant-${tenant2Suffix.slice(0, 8)}-other`;
          
          const { controller, snapshotStore, incidentStore } = createTestContext();
          
          // Create snapshot for tenant1
          await createTestIncident(incidentStore, 'inc-1', tenantId1);
          await createLegalHoldSnapshot(snapshotStore, 'snap-1', 'inc-1', tenantId1);

          // Try to archive as tenant2
          const ctx = createTenantContext(tenantId2);

          // Property: tenant mismatch ALWAYS returns 404 (not 403 or other)
          try {
            await controller.archiveLegalHold('snap-1', ctx);
            expect(true).toBe(false); // Should not reach here
          } catch (e) {
            expect(e).toBeInstanceOf(HttpException);
            expect((e as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});
