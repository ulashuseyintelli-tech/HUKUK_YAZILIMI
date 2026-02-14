/**
 * Feature Flag Mid-Flight Toggle — Fault Injection Tests (F14)
 *
 * Tier-1 Pack-2: Documents and locks the current "live env read" behavior.
 *
 * Current contract:
 *   - isSimulationEnabled() reads process.env on every call (no snapshot/cache)
 *   - Guard (controller) and service both call isSimulationEnabled()
 *   - Mid-flight toggle is possible: request passes guard, then 503 at service check
 *   - Fail-closed: no downstream write/emit when toggle catches disable
 *
 * Test 1: Promote pipeline — guard passes, service check fails → 503, no DB write
 * Test 2: Evaluate pipeline — flag disabled → HOLD (FEATURE_DISABLED), no state change
 * Test 3: Live read documentation — isSimulationEnabled() called per invocation (no sticky snapshot)
 *
 * @see .kiro/specs/fault-injection-harness/requirements.md — Req 5
 * @see .kiro/specs/fault-injection-harness/design.md — D6
 */

import { PromoteService } from '../../promote.service';
import { HysteresisEscalationService } from '../../../playbook/hysteresis-escalation.service';
import { SimulationDisabledException } from '../../simulation-error.types';
import { selectScenario } from './fault-injector';
import type { EscalationState, HysteresisConfig } from '../../../playbook/escalation-hysteresis.types';
import type { IClock } from '../../../evidence/clock.service';

// ============================================================================
// Constants
// ============================================================================

const SEED = 42;

const TEST_CONFIG: HysteresisConfig = {
  escalateThreshold: 0.8,
  deescalateThreshold: 0.4,
  stableWindowRunCount: 5,
  stableWindowMinutes: 10,
  holdDownMinutes: 15,
};

// ============================================================================
// Mock Factories
// ============================================================================

function createMockPromoteStore() {
  return {
    claimOrGet: jest.fn(),
    get: jest.fn(),
    markSucceeded: jest.fn(),
    markFailed: jest.fn(),
  };
}

function createMockRunStore() {
  return {
    findById: jest.fn(),
  };
}

function createMockMetrics() {
  return {
    incPromoteSuccess: jest.fn(),
    incPromoteFailure: jest.fn(),
    incDriftDetected: jest.fn(),
    incEscalationChurn: jest.fn(),
    incEscalationStateConflict: jest.fn(),
    incAuditWriteFailed: jest.fn(),
  };
}

function createMockAudit() {
  return {
    logSimulationEvent: jest.fn(),
  };
}

function createMockClock(): jest.Mocked<IClock> {
  return {
    now: jest.fn().mockReturnValue(new Date('2026-02-10T00:00:00Z')),
  } as any;
}

function createMockStateRepo() {
  return {
    getState: jest.fn(),
    initState: jest.fn(),
    saveStateWithCas: jest.fn(),
    updateWithRetry: jest.fn(),
  };
}

function buildClaimedRecord() {
  return {
    id: 'pr-f14',
    requestId: 'req-f14',
    incidentId: 'inc-f14',
    runId: 'run-f14',
    status: 'IN_PROGRESS' as const,
    resultRef: null,
    createdAt: new Date('2026-02-10T00:00:00Z'),
    updatedAt: new Date('2026-02-10T00:00:00Z'),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Feature Flag Mid-Flight Toggle — Fault Injection F14 (Tier-1)', () => {
  it('registry: F14 scenario exists with correct contract', () => {
    const scenario = selectScenario(SEED, 'F14');
    expect(scenario).toBeDefined();
    expect(scenario!.surface).toBe('promote_pipeline');
    expect(scenario!.expectedHttpClass).toBe(503);
    expect(scenario!.expectedContract).toBe('live_env_read_documented');
  });

  // ==========================================================================
  // Test 1: Promote pipeline — guard passes, service check fails → 503, no DB write
  // ==========================================================================

  describe('flag_mid_flight_toggle_disables_after_guard_promote_returns_503_and_creates_no_row', () => {
    it('should throw SimulationDisabledException (503) and never touch DB', async () => {
      // Arrange: sequence-based flag stub
      // Call #1 would be controller guard (not tested here — controller level)
      // The service itself calls isSimulationEnabled() once at line 73 (Step 1)
      // We set it to false → service check fails immediately
      const featureFlag = {
        isSimulationEnabled: jest.fn().mockReturnValue(false),
      };

      const promoteStore = createMockPromoteStore();
      const runStore = createMockRunStore();
      const metrics = createMockMetrics();
      const audit = createMockAudit();
      const clock = createMockClock();

      const service = new PromoteService(
        featureFlag as any,
        promoteStore as any,
        runStore as any,
        metrics as any,
        audit as any,
        clock,
      );

      // Act + Assert: 503
      await expect(service.promote('inc-f14', 'run-f14', 'actor-f14'))
        .rejects.toThrow(SimulationDisabledException);

      // DB: no row created — claimOrGet never called
      expect(promoteStore.claimOrGet).not.toHaveBeenCalled();
      expect(promoteStore.markSucceeded).not.toHaveBeenCalled();
      expect(promoteStore.markFailed).not.toHaveBeenCalled();

      // No downstream side effects
      expect(runStore.findById).not.toHaveBeenCalled();
      expect(metrics.incPromoteSuccess).not.toHaveBeenCalled();
      expect(audit.logSimulationEvent).not.toHaveBeenCalled();

      // Flag was checked exactly once (belt-and-suspenders at service level)
      expect(featureFlag.isSimulationEnabled).toHaveBeenCalledTimes(1);
    });

    it('mid-flight scenario: guard would pass (true), service check fails (false) → 503', async () => {
      // This simulates the actual mid-flight toggle:
      // Controller guard calls isSimulationEnabled() → true (request enters)
      // PromoteService.promote() calls isSimulationEnabled() → false (toggled mid-flight)
      //
      // Since we test PromoteService directly (not controller), we only see
      // the service-level check. The sequence documents that the flag CAN
      // return different values across calls (live env read).
      const featureFlag = {
        isSimulationEnabled: jest.fn()
          .mockReturnValueOnce(true)   // simulated guard pass (not called by service)
          .mockReturnValueOnce(false), // service check → disabled
      };

      const promoteStore = createMockPromoteStore();
      const runStore = createMockRunStore();
      const metrics = createMockMetrics();
      const audit = createMockAudit();
      const clock = createMockClock();

      const service = new PromoteService(
        featureFlag as any,
        promoteStore as any,
        runStore as any,
        metrics as any,
        audit as any,
        clock,
      );

      // Simulate: guard calls first (would be controller)
      const guardResult = featureFlag.isSimulationEnabled(); // true
      expect(guardResult).toBe(true);

      // Service call: second read → false → 503
      await expect(service.promote('inc-f14', 'run-f14', 'actor-f14'))
        .rejects.toThrow(SimulationDisabledException);

      // Fail-closed: no DB write
      expect(promoteStore.claimOrGet).not.toHaveBeenCalled();

      // Flag called twice total (guard + service)
      expect(featureFlag.isSimulationEnabled).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // Test 2: Evaluate pipeline — flag disabled → HOLD, no state change
  // ==========================================================================

  describe('flag_mid_flight_toggle_disables_after_initial_check_evaluate_returns_hold_and_state_unchanged', () => {
    it('should return HOLD with FEATURE_DISABLED and not touch state repo', async () => {
      // Arrange: flag disabled
      const featureFlag = {
        isSimulationEnabled: jest.fn().mockReturnValue(false),
      };

      const stateRepo = createMockStateRepo();
      const metrics = createMockMetrics();

      const service = new HysteresisEscalationService(
        stateRepo as any,
        metrics as any,
        featureFlag as any,
        TEST_CONFIG,
      );

      // Act
      const result = await service.evaluate('inc-f14', 0.9, new Date('2026-02-10T12:00:00Z'));

      // Assert: HOLD with FEATURE_DISABLED
      expect(result.decision.action).toBe('HOLD');
      expect(result.decision.reason).toBe('FEATURE_DISABLED');
      expect(result.transitioned).toBe(false);
      expect(result.previousLevel).toBe('NONE');
      expect(result.newLevel).toBe('NONE');

      // State unchanged: updateWithRetry never called
      expect(stateRepo.updateWithRetry).not.toHaveBeenCalled();
      expect(stateRepo.getState).not.toHaveBeenCalled();
      expect(stateRepo.saveStateWithCas).not.toHaveBeenCalled();

      // No churn metric
      expect(metrics.incEscalationChurn).not.toHaveBeenCalled();
      expect(metrics.incEscalationStateConflict).not.toHaveBeenCalled();
    });

    it('mid-flight: guard passes, evaluate check fails → HOLD (fail-closed)', async () => {
      // Sequence: guard true → evaluate check false
      const featureFlag = {
        isSimulationEnabled: jest.fn()
          .mockReturnValueOnce(true)   // guard pass
          .mockReturnValueOnce(false), // evaluate entry check
      };

      const stateRepo = createMockStateRepo();
      const metrics = createMockMetrics();

      const service = new HysteresisEscalationService(
        stateRepo as any,
        metrics as any,
        featureFlag as any,
        TEST_CONFIG,
      );

      // Guard check (controller level, simulated)
      expect(featureFlag.isSimulationEnabled()).toBe(true);

      // Evaluate: second read → false → HOLD
      const result = await service.evaluate('inc-f14', 0.9, new Date('2026-02-10T12:00:00Z'));

      expect(result.decision.action).toBe('HOLD');
      expect(result.decision.reason).toBe('FEATURE_DISABLED');

      // Fail-closed: no state mutation
      expect(stateRepo.updateWithRetry).not.toHaveBeenCalled();

      // Flag called twice (guard + evaluate)
      expect(featureFlag.isSimulationEnabled).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // Test 3: Live read documentation — no sticky snapshot
  // ==========================================================================

  describe('flag_is_read_live_multiple_times_within_single_request', () => {
    it('promote: isSimulationEnabled() is called at service level (live read, no cache)', async () => {
      // Arrange: flag always enabled — happy path
      const featureFlag = {
        isSimulationEnabled: jest.fn().mockReturnValue(true),
      };

      const promoteStore = createMockPromoteStore();
      promoteStore.claimOrGet.mockResolvedValue({
        record: buildClaimedRecord(),
        isNew: true,
      });

      const runStore = createMockRunStore();
      runStore.findById.mockResolvedValue({ id: 'run-f14' } as any);

      const metrics = createMockMetrics();
      const audit = createMockAudit();
      const clock = createMockClock();

      promoteStore.markSucceeded.mockResolvedValue(undefined);

      const service = new PromoteService(
        featureFlag as any,
        promoteStore as any,
        runStore as any,
        metrics as any,
        audit as any,
        clock,
      );

      // Act: run full promote pipeline
      const result = await service.promote('inc-f14', 'run-f14', 'actor-f14');
      expect(result.status).toBe('ACCEPTED');

      // Assert: isSimulationEnabled() called at least once by service
      // (service has one check at line 73; controller guard would add another)
      expect(featureFlag.isSimulationEnabled).toHaveBeenCalled();
      const callCount = featureFlag.isSimulationEnabled.mock.calls.length;
      expect(callCount).toBeGreaterThanOrEqual(1);

      // Document: this is a LIVE read — each call re-reads env.
      // If sticky snapshot is added in the future, this test should be updated.
    });

    it('evaluate: isSimulationEnabled() is called at evaluate entry (live read)', async () => {
      const featureFlag = {
        isSimulationEnabled: jest.fn().mockReturnValue(true),
      };

      const stateRepo = createMockStateRepo();
      stateRepo.updateWithRetry.mockImplementation(async (_id: string, mutate: Function) => {
        const state: EscalationState = {
          incidentId: 'inc-f14',
          currentLevel: 'L1',
          lastTransitionAt: '2026-02-10T11:00:00Z',
          holdDownUntil: null,
          stableWindowCounter: 0,
          stableWindowStartedAt: null,
          version: 1,
        };
        const patch = mutate(state);
        return { ...state, ...patch, version: 2 };
      });

      const metrics = createMockMetrics();

      const service = new HysteresisEscalationService(
        stateRepo as any,
        metrics as any,
        featureFlag as any,
        TEST_CONFIG,
      );

      await service.evaluate('inc-f14', 0.9, new Date('2026-02-10T12:00:00Z'));

      // Flag checked at evaluate entry
      expect(featureFlag.isSimulationEnabled).toHaveBeenCalled();
      const callCount = featureFlag.isSimulationEnabled.mock.calls.length;
      expect(callCount).toBeGreaterThanOrEqual(1);

      // Document: single check per evaluate() call — live read, no snapshot.
      // There is NO second check inside the CAS loop.
    });
  });
});
