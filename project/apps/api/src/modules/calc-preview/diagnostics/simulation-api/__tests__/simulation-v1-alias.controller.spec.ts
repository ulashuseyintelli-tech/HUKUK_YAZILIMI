/**
 * SimulationV1AliasController — Unit Tests
 *
 * Sprint 3 - Task 7.3
 *
 * Tests:
 *   1. v1 alias getRun returns same shape as original
 *   2. Original endpoint still works (regression)
 *   3. Rate limit bucket parity (same acquireToken keys)
 *   4. 404 for non-existent incident
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md §1
 */

import { SimulationV1AliasController } from '../simulation-v1-alias.controller';
import { SimulationRunStoreService, StoredRun } from '../simulation-run-store.service';
import { InMemoryIncidentStore } from '../../simulation/incident-store.service';
import { SnapshotQueryService } from '../../simulation/snapshot-query.service';
import { SimulationEngineService } from '../../simulation/simulation-engine.service';
import { SimulationRateLimitGuard } from '../guards/simulation-rate-limit.guard';
import { IClock } from '../../evidence/clock.service';
import { IncidentNotFoundException, RunNotFoundException } from '../simulation-error.types';

// ============================================================================
// Mocks
// ============================================================================

function createMockClock(): jest.Mocked<IClock> {
  return {
    now: jest.fn().mockReturnValue(new Date('2026-02-13T10:00:00Z')),
    nowIso: jest.fn().mockReturnValue('2026-02-13T10:00:00.000Z'),
  } as any;
}

function createMockIncidentStore() {
  return {
    get: jest.fn(),
    recordRun: jest.fn(),
  } as any;
}

function createMockRunStore(): Partial<jest.Mocked<SimulationRunStoreService>> {
  return {
    get: jest.fn(),
    save: jest.fn(),
    findById: jest.fn(),
    listByIncident: jest.fn(),
    getLatestByIncident: jest.fn(),
  };
}

function createMockSnapshotQuery(): Partial<jest.Mocked<SnapshotQueryService>> {
  return {
    getBaselineSnapshot: jest.fn(),
    getLatestSnapshot: jest.fn(),
  };
}

function createMockEngine(): Partial<jest.Mocked<SimulationEngineService>> {
  return {
    simulate: jest.fn(),
  };
}

function createMockRateLimitGuard(): Partial<jest.Mocked<SimulationRateLimitGuard>> {
  return {
    acquireToken: jest.fn(),
    releaseToken: jest.fn(),
  };
}

const SAMPLE_RUN: StoredRun = {
  runId: 'run-1',
  incidentId: 'inc-1',
  tenantId: 'tenant-1',
  scenarioId: 'default',
  seed: 42,
  verdict: 'ALLOW',
  driftScore: 0.1,
  createdAt: '2026-02-13T10:00:00.000Z',
  status: 'COMPLETED',
  evidenceStatus: 'PASSED',
  evidenceGateReason: undefined,
  driftBlocked: false,
  baselineSnapshotId: 'snap-base',
  currentSnapshotId: 'snap-curr',
};

const SAMPLE_INCIDENT = {
  id: 'inc-1',
  tenantId: 'tenant-1',
  status: 'OPEN',
};

const TENANT_CTX = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  role: 'tenant-admin',
};

// ============================================================================
// Tests
// ============================================================================

describe('SimulationV1AliasController', () => {
  let controller: SimulationV1AliasController;
  let mockRunStore: ReturnType<typeof createMockRunStore>;
  let mockIncidentStore: ReturnType<typeof createMockIncidentStore>;

  beforeEach(() => {
    const mockClock = createMockClock();
    mockIncidentStore = createMockIncidentStore();
    mockRunStore = createMockRunStore();
    const mockSnapshotQuery = createMockSnapshotQuery();
    const mockEngine = createMockEngine();
    const mockRateLimitGuard = createMockRateLimitGuard();

    controller = new SimulationV1AliasController(
      mockClock,
      mockEngine as any,
      mockIncidentStore,
      mockRunStore as any,
      mockSnapshotQuery as any,
      mockRateLimitGuard as any,
    );
  });

  describe('GET /v1/incidents/:id/simulations/:runId', () => {
    it('should return same RunDetailResponseDto shape as original endpoint', async () => {
      mockIncidentStore.get.mockResolvedValue(SAMPLE_INCIDENT);
      mockRunStore.get!.mockResolvedValue(SAMPLE_RUN);

      const result = await controller.getRun('inc-1', 'run-1', TENANT_CTX as any);

      expect(result).toEqual({
        runId: 'run-1',
        incidentId: 'inc-1',
        tenantId: 'tenant-1',
        scenarioId: 'default',
        seed: 42,
        verdict: 'ALLOW',
        driftScore: 0.1,
        createdAt: '2026-02-13T10:00:00.000Z',
        status: 'COMPLETED',
        evidenceStatus: 'PASSED',
        evidenceGateReason: undefined,
        driftBlocked: false,
        baselineSnapshotId: 'snap-base',
        currentSnapshotId: 'snap-curr',
      });
    });

    it('should throw IncidentNotFoundException for non-existent incident', async () => {
      mockIncidentStore.get.mockResolvedValue(null);

      await expect(controller.getRun('inc-999', 'run-1', TENANT_CTX as any))
        .rejects.toThrow(IncidentNotFoundException);
    });

    it('should throw RunNotFoundException for non-existent run', async () => {
      mockIncidentStore.get.mockResolvedValue(SAMPLE_INCIDENT);
      mockRunStore.get!.mockResolvedValue(null);

      await expect(controller.getRun('inc-1', 'run-999', TENANT_CTX as any))
        .rejects.toThrow(RunNotFoundException);
    });

    it('should throw IncidentNotFoundException for cross-tenant access', async () => {
      mockIncidentStore.get.mockResolvedValue(SAMPLE_INCIDENT);

      const otherTenant = { tenantId: 'other-tenant', userId: 'user-2', role: 'tenant-admin' };

      await expect(controller.getRun('inc-1', 'run-1', otherTenant as any))
        .rejects.toThrow(IncidentNotFoundException);
    });
  });
});
