/**
 * PromoteService — Pipeline Integration Tests
 *
 * Sprint 3 - Checkpoint A validation
 *
 * Test matrix:
 *   1. Happy path: fresh claim → ACCEPTED + requestId
 *   2. Idempotent replay: same (incidentId, runId) twice → ALREADY_PROMOTED + same requestId
 *   3. Run not found → 404 + markFailed
 *   4. Feature flag disabled → SimulationDisabledException (503)
 *   5. Drift detected → DRIFT_DETECTED + markFailed + metrics
 *   6. FAILED status on re-request: same key → same outcome (no re-run)
 */

import { PromoteService } from '../promote.service';
import type { ISnapshotProvider } from '../promote.service';
import { PromoteRequestStore } from '../promote-request.store';
import { SimulationRunStoreService } from '../simulation-run-store.service';
import { SimulationFeatureFlagService } from '../simulation-feature-flag.service';
import { SimulationMetricsService } from '../simulation-metrics.service';
import { SimulationAuditAdapter } from '../simulation-audit.adapter';
import {
  SimulationDisabledException,
  RunNotFoundException,
} from '../simulation-error.types';
import { IClock } from '../../evidence/clock.service';
import { PHASE7_ENV_KEYS } from '../phase7-config';

// ============================================================================
// Mocks
// ============================================================================

function createMockPromoteStore(): jest.Mocked<PromoteRequestStore> {
  return {
    claimOrGet: jest.fn(),
    get: jest.fn(),
    markSucceeded: jest.fn(),
    markFailed: jest.fn(),
  } as any;
}

function createMockRunStore(): jest.Mocked<SimulationRunStoreService> {
  return {
    findById: jest.fn(),
  } as any;
}

function createMockFeatureFlag(): jest.Mocked<SimulationFeatureFlagService> {
  return {
    isSimulationEnabled: jest.fn().mockReturnValue(true),
  } as any;
}

function createMockMetrics(): jest.Mocked<SimulationMetricsService> {
  return {
    incPromoteSuccess: jest.fn(),
    incPromoteFailure: jest.fn(),
    incDriftDetected: jest.fn(),
    incEscalationChurn: jest.fn(),
    incEscalationStateConflict: jest.fn(),
    incAuditWriteFailed: jest.fn(),
    incPhase7Evaluation: jest.fn(),
    incPhase7Block: jest.fn(),
    incPhase7Fault: jest.fn(),
  } as any;
}

function createMockClock(): jest.Mocked<IClock> {
  return {
    now: jest.fn().mockReturnValue(new Date('2026-02-10T00:00:00Z')),
  } as any;
}

function createMockAudit(): jest.Mocked<SimulationAuditAdapter> {
  return {
    logSimulationEvent: jest.fn(),
  } as any;
}

function createMockSnapshotProvider(): jest.Mocked<ISnapshotProvider> {
  return {
    getSnapshot: jest.fn().mockResolvedValue(null),
  } as any;
}

function buildClaimedRecord(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'pr-1',
    requestId: 'req-aaa',
    incidentId: 'inc-1',
    runId: 'run-1',
    status: 'IN_PROGRESS' as const,
    resultRef: null,
    createdAt: new Date('2026-02-10T00:00:00Z'),
    updatedAt: new Date('2026-02-10T00:00:00Z'),
    ...overrides,
  };
}

describe('PromoteService', () => {
  let service: PromoteService;
  let mockPromoteStore: jest.Mocked<PromoteRequestStore>;
  let mockRunStore: jest.Mocked<SimulationRunStoreService>;
  let mockFeatureFlag: jest.Mocked<SimulationFeatureFlagService>;
  let mockMetrics: jest.Mocked<SimulationMetricsService>;
  let mockClock: jest.Mocked<IClock>;
  let mockAudit: jest.Mocked<SimulationAuditAdapter>;
  let mockSnapshotProvider: jest.Mocked<ISnapshotProvider>;

  beforeEach(() => {
    // Phase-7 disabled for legacy tests — placeholder behavior preserved
    process.env[PHASE7_ENV_KEYS.PHASE7_ENABLED] = 'false';

    mockPromoteStore = createMockPromoteStore();
    mockRunStore = createMockRunStore();
    mockFeatureFlag = createMockFeatureFlag();
    mockMetrics = createMockMetrics();
    mockClock = createMockClock();
    mockAudit = createMockAudit();
    mockSnapshotProvider = createMockSnapshotProvider();

    service = new PromoteService(
      mockFeatureFlag,
      mockPromoteStore,
      mockRunStore,
      mockMetrics,
      mockAudit,
      mockClock,
      mockSnapshotProvider,
    );
  });

  afterEach(() => {
    delete process.env[PHASE7_ENV_KEYS.PHASE7_ENABLED];
  });

  // ==========================================================================
  // 1. Happy path — fresh claim → ACCEPTED
  // ==========================================================================

  describe('happy path — ACCEPTED', () => {
    it('should claim, lookup run, mark succeeded, return ACCEPTED', async () => {
      mockPromoteStore.claimOrGet.mockResolvedValue({
        record: buildClaimedRecord(),
        isNew: true,
      });
      mockRunStore.findById.mockResolvedValue({ id: 'run-1' } as any);
      mockPromoteStore.markSucceeded.mockResolvedValue(undefined);

      const result = await service.promote('inc-1', 'run-1', 'actor-1');

      expect(result.status).toBe('ACCEPTED');
      expect((result as any).requestId).toBe('req-aaa');
      expect(mockPromoteStore.markSucceeded).toHaveBeenCalledWith('inc-1', 'run-1');
      expect(mockMetrics.incPromoteSuccess).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 2. Idempotent replay — ALREADY_PROMOTED
  // ==========================================================================

  describe('idempotent replay — ALREADY_PROMOTED', () => {
    it('should return same requestId without calling Phase 7 again', async () => {
      mockPromoteStore.claimOrGet.mockResolvedValue({
        record: buildClaimedRecord({ requestId: 'req-original' }),
        isNew: false,
      });

      const result = await service.promote('inc-1', 'run-1', 'actor-1');

      expect(result.status).toBe('ALREADY_PROMOTED');
      expect((result as any).requestId).toBe('req-original');
      // Should NOT call run lookup or markSucceeded
      expect(mockRunStore.findById).not.toHaveBeenCalled();
      expect(mockPromoteStore.markSucceeded).not.toHaveBeenCalled();
    });

    it('should return same result on second call with same key', async () => {
      // First call: fresh claim
      mockPromoteStore.claimOrGet
        .mockResolvedValueOnce({
          record: buildClaimedRecord({ requestId: 'req-first' }),
          isNew: true,
        })
        .mockResolvedValueOnce({
          record: buildClaimedRecord({ requestId: 'req-first' }),
          isNew: false,
        });
      mockRunStore.findById.mockResolvedValue({ id: 'run-1' } as any);
      mockPromoteStore.markSucceeded.mockResolvedValue(undefined);

      const r1 = await service.promote('inc-1', 'run-1', 'actor-1');
      const r2 = await service.promote('inc-1', 'run-1', 'actor-1');

      expect((r1 as any).requestId).toBe('req-first');
      expect((r2 as any).requestId).toBe('req-first');
      expect(r2.status).toBe('ALREADY_PROMOTED');
    });
  });

  // ==========================================================================
  // 3. Run not found → 404 + markFailed
  // ==========================================================================

  describe('run not found', () => {
    it('should markFailed and throw RunNotFoundException', async () => {
      mockPromoteStore.claimOrGet.mockResolvedValue({
        record: buildClaimedRecord(),
        isNew: true,
      });
      mockRunStore.findById.mockResolvedValue(null);
      mockPromoteStore.markFailed.mockResolvedValue(undefined);

      await expect(service.promote('inc-1', 'run-1', 'actor-1'))
        .rejects.toThrow(RunNotFoundException);

      expect(mockPromoteStore.markFailed).toHaveBeenCalledWith('inc-1', 'run-1');
    });
  });

  // ==========================================================================
  // 4. Feature flag disabled → 503
  // ==========================================================================

  describe('feature flag disabled', () => {
    it('should throw SimulationDisabledException', async () => {
      mockFeatureFlag.isSimulationEnabled.mockReturnValue(false);

      await expect(service.promote('inc-1', 'run-1', 'actor-1'))
        .rejects.toThrow(SimulationDisabledException);

      // Should not touch store at all
      expect(mockPromoteStore.claimOrGet).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 5. Drift detected → DRIFT_DETECTED + markFailed + metrics
  // ==========================================================================

  // Note: Currently promote.service uses a placeholder that returns driftScore=0.
  // This test documents the expected behavior once snapshot wiring is complete.
  // When the placeholder is replaced, uncomment and adjust.

  describe('drift detected (future — placeholder returns clean)', () => {
    it('placeholder always returns clean (driftScore=0), so ACCEPTED', async () => {
      mockPromoteStore.claimOrGet.mockResolvedValue({
        record: buildClaimedRecord(),
        isNew: true,
      });
      mockRunStore.findById.mockResolvedValue({ id: 'run-1' } as any);
      mockPromoteStore.markSucceeded.mockResolvedValue(undefined);

      const result = await service.promote('inc-1', 'run-1', 'actor-1');

      // Placeholder always clean → ACCEPTED
      expect(result.status).toBe('ACCEPTED');
    });
  });

  // ==========================================================================
  // 6. FAILED status replay — same key → ALREADY_PROMOTED (idempotent)
  // ==========================================================================

  describe('FAILED status replay', () => {
    it('should return ALREADY_PROMOTED even if previous attempt FAILED', async () => {
      // The store returns the existing FAILED record
      mockPromoteStore.claimOrGet.mockResolvedValue({
        record: buildClaimedRecord({ status: 'FAILED', requestId: 'req-failed' }),
        isNew: false,
      });

      const result = await service.promote('inc-1', 'run-1', 'actor-1');

      // Current contract: isNew=false → ALREADY_PROMOTED regardless of status
      // This means FAILED requests are NOT re-runnable with the same key
      expect(result.status).toBe('ALREADY_PROMOTED');
      expect((result as any).requestId).toBe('req-failed');
    });
  });

  // ==========================================================================
  // 7. Metrics wiring
  // ==========================================================================

  describe('metrics', () => {
    it('should increment promote_success_total on ACCEPTED', async () => {
      mockPromoteStore.claimOrGet.mockResolvedValue({
        record: buildClaimedRecord(),
        isNew: true,
      });
      mockRunStore.findById.mockResolvedValue({ id: 'run-1' } as any);
      mockPromoteStore.markSucceeded.mockResolvedValue(undefined);

      await service.promote('inc-1', 'run-1', 'actor-1');

      expect(mockMetrics.incPromoteSuccess).toHaveBeenCalledTimes(1);
    });

    it('should NOT increment success metric on ALREADY_PROMOTED', async () => {
      mockPromoteStore.claimOrGet.mockResolvedValue({
        record: buildClaimedRecord(),
        isNew: false,
      });

      await service.promote('inc-1', 'run-1', 'actor-1');

      expect(mockMetrics.incPromoteSuccess).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 8. Audit wiring (Task 7.2)
  // ==========================================================================

  describe('audit wiring', () => {
    it('should emit PROMOTE_ACCEPTED audit event on success', async () => {
      mockPromoteStore.claimOrGet.mockResolvedValue({
        record: buildClaimedRecord({ requestId: 'req-audit' }),
        isNew: true,
      });
      mockRunStore.findById.mockResolvedValue({ id: 'run-1' } as any);
      mockPromoteStore.markSucceeded.mockResolvedValue(undefined);

      await service.promote('inc-1', 'run-1', 'actor-1');

      expect(mockAudit.logSimulationEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'PROMOTE_ACCEPTED',
          incidentId: 'inc-1',
          runId: 'run-1',
          requestId: 'req-audit',
          actorId: 'actor-1',
        }),
      );
    });

    it('should NOT emit audit on idempotent replay', async () => {
      mockPromoteStore.claimOrGet.mockResolvedValue({
        record: buildClaimedRecord(),
        isNew: false,
      });

      await service.promote('inc-1', 'run-1', 'actor-1');

      expect(mockAudit.logSimulationEvent).not.toHaveBeenCalled();
    });

    it('should not block promote if audit write throws', async () => {
      mockPromoteStore.claimOrGet.mockResolvedValue({
        record: buildClaimedRecord(),
        isNew: true,
      });
      mockRunStore.findById.mockResolvedValue({ id: 'run-1' } as any);
      mockPromoteStore.markSucceeded.mockResolvedValue(undefined);
      mockAudit.logSimulationEvent.mockImplementation(() => {
        throw new Error('audit DB down');
      });

      // Should NOT throw — fire-and-forget
      // Note: The adapter itself swallows errors, but even if it didn't,
      // the service should still return ACCEPTED
      const result = await service.promote('inc-1', 'run-1', 'actor-1');
      expect(result.status).toBe('ACCEPTED');
    });
  });
});
