/**
 * Simulation Controller Tests
 * 
 * Sprint 2F - Task 6.5-6.6
 * 
 * Unit tests and property tests for simulation controller endpoints.
 * 
 * @see .kiro/specs/simulation-api-2f/design.md
 */

import * as fc from 'fast-check';
import { SimulationController } from '../simulation.controller';
import { SimulationRateLimitGuard } from '../guards/simulation-rate-limit.guard';
import { SimulationRunStoreService } from '../simulation-run-store.service';
import { SimulationEngineService } from '../../simulation/simulation-engine.service';
import { InMemoryIncidentStore } from '../../simulation/incident-store.service';
import { BaselineResolverService } from '../../simulation/baseline-resolver.service';
import { InMemorySnapshotStore } from '../../evidence/snapshot-store.service';
import { EvidenceGateService } from '../../evidence/evidence-gate.service';
import { IClock } from '../../evidence/clock.service';
import { ISimulationClock } from '../../simulation/simulation.types';
import { SimulationTenantContext } from '../guards/simulation-rbac.guard';
import { IncidentNotFoundException, RunNotFoundException } from '../simulation-error.types';

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

  advanceMinutes(minutes: number): void {
    this.advanceSeconds(minutes * 60);
  }

  reset(to?: Date): void {
    this.currentTime = to ? new Date(to) : new Date('2024-01-15T10:00:00Z');
  }
}

// Simulation clock adapter
class MockSimulationClock implements ISimulationClock {
  constructor(private readonly clock: MockClock) {}

  now(): Date {
    return this.clock.now();
  }

  advanceSeconds(seconds: number): void {
    this.clock.advanceSeconds(seconds);
  }

  reset(to?: Date): void {
    this.clock.reset(to);
  }
}

// ============================================================================
// Test Helpers
// ============================================================================

function createTestContext(): {
  clock: MockClock;
  controller: SimulationController;
  incidentStore: InMemoryIncidentStore;
  runStore: SimulationRunStoreService;
  snapshotStore: InMemorySnapshotStore;
  rateLimitGuard: SimulationRateLimitGuard;
} {
  const clock = new MockClock();
  const simulationClock = new MockSimulationClock(clock);
  const snapshotStore = new InMemorySnapshotStore(clock);
  const incidentStore = new InMemoryIncidentStore(clock);
  const runStore = new SimulationRunStoreService(clock);
  const evidenceGate = new EvidenceGateService(clock);
  const simulationEngine = new SimulationEngineService(simulationClock, evidenceGate);
  const baselineResolver = new BaselineResolverService(snapshotStore);
  const rateLimitGuard = new SimulationRateLimitGuard(clock);

  const controller = new SimulationController(
    clock,
    simulationEngine,
    incidentStore,
    runStore,
    baselineResolver,
    snapshotStore,
    rateLimitGuard,
  );

  return { clock, controller, incidentStore, runStore, snapshotStore, rateLimitGuard };
}

function createTenantContext(tenantId: string, role: 'tenant-admin' | 'internal-ops' = 'tenant-admin'): SimulationTenantContext {
  return {
    tenantId,
    userId: `user-${tenantId}`,
    role,
  };
}

async function createTestIncident(
  incidentStore: InMemoryIncidentStore,
  incidentId: string,
  tenantId: string,
): Promise<void> {
  await incidentStore.create({
    incidentId,
    tenantId,
    title: `Test Incident ${incidentId}`,
    severity: 'MEDIUM',
  });
}

async function createTestSnapshot(
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
      { 
        metric: 'error_rate', 
        value: 0.01, 
        unit: 'ratio', 
        confidence: 0.9,
        windowSec: 60,
        freshnessSec: 10,
        source: 'prometheus',
        timestamp: now,
      },
    ],
  });
}

// ============================================================================
// Unit Tests
// ============================================================================

describe('SimulationController', () => {
  describe('POST /incidents/:id/simulate', () => {
    it('should return 404 for non-existent incident', async () => {
      const { controller } = createTestContext();
      const ctx = createTenantContext('tenant-1');

      await expect(
        controller.simulate('non-existent', {}, ctx),
      ).rejects.toThrow(IncidentNotFoundException);
    });

    it('should return 404 for wrong tenant (tenant-admin)', async () => {
      const { controller, incidentStore } = createTestContext();
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      const ctx = createTenantContext('tenant-2'); // Different tenant

      await expect(
        controller.simulate('inc-1', {}, ctx),
      ).rejects.toThrow(IncidentNotFoundException);
    });

    it('should allow internal-ops to access any tenant', async () => {
      const { controller, incidentStore, snapshotStore } = createTestContext();
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      await createTestSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
      
      // Set baseline
      await incidentStore.setBaseline('inc-1', 'snap-1');
      
      const ctx = createTenantContext('tenant-ops', 'internal-ops');

      const result = await controller.simulate('inc-1', {}, ctx);
      expect(result.runId).toBeDefined();
    });

    it('should run simulation with default scenario and seed', async () => {
      const { controller, incidentStore, snapshotStore } = createTestContext();
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      await createTestSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
      await incidentStore.setBaseline('inc-1', 'snap-1');
      
      const ctx = createTenantContext('tenant-1');

      const result = await controller.simulate('inc-1', {}, ctx);

      expect(result.runId).toBeDefined();
      expect(result.verdict).toBeDefined();
      expect(result.driftScore).toBeGreaterThanOrEqual(0);
      expect(result.evidenceStatus).toBeDefined();
    });

    it('should run simulation with custom scenario and seed', async () => {
      const { controller, incidentStore, snapshotStore } = createTestContext();
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      await createTestSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
      await incidentStore.setBaseline('inc-1', 'snap-1');
      
      const ctx = createTenantContext('tenant-1');

      const result = await controller.simulate(
        'inc-1',
        { scenarioId: 'custom-scenario', seed: 12345 },
        ctx,
      );

      expect(result.runId).toBeDefined();
    });

    it('should store run result after simulation', async () => {
      const { controller, incidentStore, snapshotStore, runStore } = createTestContext();
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      await createTestSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
      await incidentStore.setBaseline('inc-1', 'snap-1');
      
      const ctx = createTenantContext('tenant-1');

      const result = await controller.simulate('inc-1', {}, ctx);

      const storedRun = await runStore.get(result.runId);
      expect(storedRun).not.toBeNull();
      expect(storedRun?.verdict).toBe(result.verdict);
    });
  });

  describe('GET /incidents/:id/runs', () => {
    it('should return empty list for incident with no runs', async () => {
      const { controller, incidentStore } = createTestContext();
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      const ctx = createTenantContext('tenant-1');

      const result = await controller.listRuns('inc-1', undefined, undefined, ctx);

      expect(result.runs).toEqual([]);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('should return 404 for non-existent incident', async () => {
      const { controller } = createTestContext();
      const ctx = createTenantContext('tenant-1');

      await expect(
        controller.listRuns('non-existent', undefined, undefined, ctx),
      ).rejects.toThrow(IncidentNotFoundException);
    });

    it('should return runs ordered newest first', async () => {
      const { controller, incidentStore, snapshotStore, clock, rateLimitGuard } = createTestContext();
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      await createTestSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
      await incidentStore.setBaseline('inc-1', 'snap-1');
      
      const ctx = createTenantContext('tenant-1');

      // Run multiple simulations with time gaps (reset rate limit between runs)
      await controller.simulate('inc-1', { seed: 1 }, ctx);
      clock.advanceSeconds(70); // Past per-incident TTL
      rateLimitGuard.reset();
      await controller.simulate('inc-1', { seed: 2 }, ctx);
      clock.advanceSeconds(70);
      rateLimitGuard.reset();
      await controller.simulate('inc-1', { seed: 3 }, ctx);

      const result = await controller.listRuns('inc-1', undefined, undefined, ctx);

      expect(result.runs.length).toBe(3);
      // Verify ordering (newest first)
      for (let i = 1; i < result.runs.length; i++) {
        const prev = new Date(result.runs[i - 1].createdAt).getTime();
        const curr = new Date(result.runs[i].createdAt).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });

    it('should respect limit parameter', async () => {
      const { controller, incidentStore, snapshotStore, clock, rateLimitGuard } = createTestContext();
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      await createTestSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
      await incidentStore.setBaseline('inc-1', 'snap-1');
      
      const ctx = createTenantContext('tenant-1');

      // Run 5 simulations (reset rate limit between runs)
      for (let i = 0; i < 5; i++) {
        await controller.simulate('inc-1', { seed: i }, ctx);
        clock.advanceSeconds(70);
        rateLimitGuard.reset();
      }

      const result = await controller.listRuns('inc-1', '2', undefined, ctx);

      expect(result.runs.length).toBe(2);
      expect(result.pagination.hasMore).toBe(true);
    });
  });

  describe('GET /incidents/:id/runs/latest', () => {
    it('should return null for incident with no runs (RED LINE)', async () => {
      const { controller, incidentStore } = createTestContext();
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      const ctx = createTenantContext('tenant-1');

      const result = await controller.getLatestRun('inc-1', ctx);

      // RED LINE: 200 + null body, NOT 404
      expect(result.latestRun).toBeNull();
    });

    it('should return 404 for non-existent incident', async () => {
      const { controller } = createTestContext();
      const ctx = createTenantContext('tenant-1');

      await expect(
        controller.getLatestRun('non-existent', ctx),
      ).rejects.toThrow(IncidentNotFoundException);
    });

    it('should return latest run after simulation', async () => {
      const { controller, incidentStore, snapshotStore } = createTestContext();
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      await createTestSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
      await incidentStore.setBaseline('inc-1', 'snap-1');
      
      const ctx = createTenantContext('tenant-1');

      const simulateResult = await controller.simulate('inc-1', {}, ctx);
      const latestResult = await controller.getLatestRun('inc-1', ctx);

      expect(latestResult.latestRun).not.toBeNull();
      expect(latestResult.latestRun?.runId).toBe(simulateResult.runId);
    });
  });

  describe('GET /incidents/:id/runs/:runId', () => {
    it('should return 404 for non-existent run', async () => {
      const { controller, incidentStore } = createTestContext();
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      const ctx = createTenantContext('tenant-1');

      await expect(
        controller.getRun('inc-1', 'non-existent-run', ctx),
      ).rejects.toThrow(RunNotFoundException);
    });

    it('should return run detail', async () => {
      const { controller, incidentStore, snapshotStore } = createTestContext();
      await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
      await createTestSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
      await incidentStore.setBaseline('inc-1', 'snap-1');
      
      const ctx = createTenantContext('tenant-1');

      const simulateResult = await controller.simulate('inc-1', {}, ctx);
      const runDetail = await controller.getRun('inc-1', simulateResult.runId, ctx);

      expect(runDetail.runId).toBe(simulateResult.runId);
      expect(runDetail.incidentId).toBe('inc-1');
      expect(runDetail.tenantId).toBe('tenant-1');
      expect(runDetail.verdict).toBe(simulateResult.verdict);
    });
  });
});

// ============================================================================
// Property Tests
// ============================================================================

describe('Feature: simulation-api-2f, Property 12: Run List Ordering', () => {
  it('runs are always ordered newest first', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        async (runCount) => {
          // Create fresh context for each iteration
          const { controller, incidentStore, snapshotStore, clock, rateLimitGuard } = createTestContext();
          
          await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
          await createTestSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
          await incidentStore.setBaseline('inc-1', 'snap-1');
          
          const ctx = createTenantContext('tenant-1');

          // Run multiple simulations with time gaps (reset rate limit between runs)
          for (let i = 0; i < runCount; i++) {
            await controller.simulate('inc-1', { seed: i }, ctx);
            clock.advanceSeconds(70); // Past per-incident TTL
            rateLimitGuard.reset();
          }

          // List runs
          const result = await controller.listRuns('inc-1', undefined, undefined, ctx);

          // Verify ordering (newest first)
          expect(result.runs.length).toBe(runCount);
          for (let i = 1; i < result.runs.length; i++) {
            const prev = new Date(result.runs[i - 1].createdAt).getTime();
            const curr = new Date(result.runs[i].createdAt).getTime();
            expect(prev).toBeGreaterThanOrEqual(curr);
          }
        },
      ),
      { numRuns: 10 }, // Reduced for performance
    );
  });
});

describe('Feature: simulation-api-2f, Property: Latest Run Consistency', () => {
  it('latest run matches most recent simulation result', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }),
        async (runCount) => {
          // Create fresh context for each iteration
          const { controller, incidentStore, snapshotStore, clock, rateLimitGuard } = createTestContext();
          
          await createTestIncident(incidentStore, 'inc-1', 'tenant-1');
          await createTestSnapshot(snapshotStore, 'snap-1', 'inc-1', 'tenant-1');
          await incidentStore.setBaseline('inc-1', 'snap-1');
          
          const ctx = createTenantContext('tenant-1');

          let lastRunId: string | undefined;

          // Run multiple simulations (reset rate limit between runs)
          for (let i = 0; i < runCount; i++) {
            const result = await controller.simulate('inc-1', { seed: i }, ctx);
            lastRunId = result.runId;
            clock.advanceSeconds(70);
            rateLimitGuard.reset();
          }

          // Get latest
          const latestResult = await controller.getLatestRun('inc-1', ctx);

          // Latest should match last simulation
          expect(latestResult.latestRun).not.toBeNull();
          expect(latestResult.latestRun?.runId).toBe(lastRunId);
        },
      ),
      { numRuns: 10 },
    );
  });
});
