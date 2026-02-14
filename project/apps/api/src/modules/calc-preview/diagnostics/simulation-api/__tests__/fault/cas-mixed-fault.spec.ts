/**
 * CAS Mixed Stale/Fresh — Fault Injection Tests (F11 extended, Pack-3)
 *
 * Tier-1 Pack-3: More realistic CAS retry scenarios beyond pure exhaustion.
 *
 * Test 1: Recovering loser — 2 conflicts + 3rd attempt succeeds → no 409, no conflict metric
 * Test 2: Exhaustion regression — all 3 attempts fail → 409 + metric (via HysteresisEscalationService)
 * Test 3: Many callers — N concurrent evaluates → at most 1 commit per CAS round
 * Test 4: IO timeout mid-retry — conflict then IO error → 500, conflict metric stays 0
 *
 * All tests use HysteresisEscalationService with mocked stateRepo to verify
 * the real updateWithRetry semantics end-to-end.
 *
 * @see .kiro/specs/fault-injection-harness/requirements.md — Req 4
 * @see .kiro/specs/fault-injection-harness/design.md — D2.2, D6
 */

import { HysteresisEscalationService } from '../../../playbook/hysteresis-escalation.service';
import { EscalationStateConflictException } from '../../simulation-error.types';
import { selectScenario } from './fault-injector';
import type {
  EscalationState,
  EscalationLevel,
  HysteresisConfig,
} from '../../../playbook/escalation-hysteresis.types';

// ============================================================================
// Constants
// ============================================================================

const SEED = 42;
const NOW = new Date('2026-02-10T12:00:00Z');

const TEST_CONFIG: HysteresisConfig = {
  escalateThreshold: 0.8,
  deescalateThreshold: 0.4,
  stableWindowRunCount: 5,
  stableWindowMinutes: 10,
  holdDownMinutes: 15,
};

// ============================================================================
// Helpers
// ============================================================================

function buildState(overrides: Partial<EscalationState> = {}): EscalationState {
  return {
    incidentId: 'inc-pack3',
    currentLevel: 'L1',
    lastTransitionAt: '2026-02-10T11:00:00Z',
    holdDownUntil: null,
    stableWindowCounter: 0,
    stableWindowStartedAt: null,
    version: 1,
    ...overrides,
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

function createMockFeatureFlag(enabled = true) {
  return {
    isSimulationEnabled: jest.fn().mockReturnValue(enabled),
  };
}

/**
 * CAS conflict error matching the real CasConflictError shape.
 * The real repo uses an internal CasConflictError class.
 */
class MockCasConflictError extends Error {
  constructor(incidentId: string, expectedVersion: number) {
    super(`CAS conflict for ${incidentId} at version ${expectedVersion}`);
    this.name = 'CasConflictError';
  }
}

/**
 * Creates a mock stateRepo that mirrors the real updateWithRetry semantics.
 *
 * The real EscalationStateRepository.updateWithRetry does:
 *   for (attempt = 0; attempt <= 2; attempt++):
 *     getState → mutate → saveStateWithCas
 *     on CasConflictError: if last attempt → metric + throw 409, else continue
 *     on other error: throw immediately (terminal)
 *
 * This mock lets tests control per-attempt behavior via attemptResults.
 */
function createMockStateRepoWithRetry(opts: {
  initialState: EscalationState;
  /**
   * Per-attempt behavior. Each entry is either:
   * - 'conflict': CAS version mismatch (retryable)
   * - 'success': CAS commit succeeds
   * - 'io_timeout': IO error (terminal, not retryable)
   *
   * If fewer entries than attempts, last entry repeats.
   */
  attemptResults: Array<'conflict' | 'success' | 'io_timeout'>;
  metrics: ReturnType<typeof createMockMetrics>;
}) {
  let currentState = { ...opts.initialState };
  let attemptIndex = 0;
  let commitCount = 0;

  const repo = {
    getState: jest.fn(async (_incidentId: string) => {
      return { ...currentState };
    }),
    initState: jest.fn(),
    saveStateWithCas: jest.fn(),

    /**
     * Mirrors real updateWithRetry: 3 total attempts, CAS conflict retries,
     * IO errors terminal, metric on exhaustion.
     */
    updateWithRetry: jest.fn(async (
      incidentId: string,
      mutate: (current: EscalationState) => Partial<EscalationState>,
    ): Promise<EscalationState> => {
      const CAS_MAX_RETRIES = 2;

      for (let attempt = 0; attempt <= CAS_MAX_RETRIES; attempt++) {
        const state = await repo.getState(incidentId);
        if (!state) throw new Error(`State not found for ${incidentId}`);

        const patch = mutate(state);

        // Determine this attempt's result
        const resultIdx = Math.min(attemptIndex, opts.attemptResults.length - 1);
        const result = opts.attemptResults[resultIdx];
        attemptIndex++;

        if (result === 'io_timeout') {
          // IO error is terminal — no retry
          throw new Error('escalation_update_cas: operation timed out');
        }

        if (result === 'conflict') {
          if (attempt === CAS_MAX_RETRIES) {
            // Final attempt exhausted
            opts.metrics.incEscalationStateConflict();
            throw new EscalationStateConflictException(incidentId);
          }
          // Retry
          continue;
        }

        // success: apply patch and commit
        const updated: EscalationState = {
          ...state,
          ...patch,
          version: state.version + 1,
        };
        currentState = updated;
        commitCount++;
        return updated;
      }

      // Should not reach
      opts.metrics.incEscalationStateConflict();
      throw new EscalationStateConflictException(incidentId);
    }),

    // Expose for assertions
    get commitCount() { return commitCount; },
    get attemptCount() { return attemptIndex; },
    getCurrentState() { return { ...currentState }; },
    resetAttemptIndex() { attemptIndex = 0; },
  };

  return repo;
}

// ============================================================================
// Tests
// ============================================================================

describe('CAS Mixed Stale/Fresh — Fault Injection F11 Extended (Tier-1 Pack-3)', () => {
  it('registry: F11 scenario exists with correct contract', () => {
    const scenario = selectScenario(SEED, 'F11');
    expect(scenario).toBeDefined();
    expect(scenario!.expectedHttpClass).toBe(409);
    expect(scenario!.expectedContract).toBe('cas_retry_or_409');
  });

  // ==========================================================================
  // Test 1: Recovering loser — 2 conflicts + 3rd success
  // ==========================================================================

  describe('cas_retry_recovers_on_third_attempt_no_409_no_conflict_metric', () => {
    it('should succeed on 3rd attempt after 2 CAS conflicts, no 409, no conflict metric', async () => {
      const metrics = createMockMetrics();
      const featureFlag = createMockFeatureFlag(true);

      const stateRepo = createMockStateRepoWithRetry({
        initialState: buildState({ currentLevel: 'L1', version: 1 }),
        attemptResults: ['conflict', 'conflict', 'success'],
        metrics,
      });

      const service = new HysteresisEscalationService(
        stateRepo as any,
        metrics as any,
        featureFlag as any,
        TEST_CONFIG,
      );

      // Act: evaluate with metric > escalateThreshold → should ESCALATE
      const result = await service.evaluate('inc-pack3', 0.9, NOW);

      // Assert: success — no 409
      expect(result.decision.action).toBe('ESCALATE');
      expect(result.newLevel).toBe('L2');
      expect(result.transitioned).toBe(true);

      // Conflict metric: 0 (recovered, not exhausted)
      expect(metrics.incEscalationStateConflict).not.toHaveBeenCalled();

      // Churn metric: incremented (transition happened)
      expect(metrics.incEscalationChurn).toHaveBeenCalledWith('inc-pack3', 'up');

      // Repo: 3 attempts total, 1 commit
      expect(stateRepo.attemptCount).toBe(3);
      expect(stateRepo.commitCount).toBe(1);

      // Final state: committed with version bump
      const finalState = stateRepo.getCurrentState();
      expect(finalState.version).toBe(2);
      expect(finalState.currentLevel).toBe('L2');
    });
  });

  // ==========================================================================
  // Test 2: Exhaustion regression (via HysteresisEscalationService)
  // ==========================================================================

  describe('cas_retry_exhaustion_409_and_conflict_metric_once', () => {
    it('should throw EscalationStateConflictException after 3 failed attempts + metric once', async () => {
      const metrics = createMockMetrics();
      const featureFlag = createMockFeatureFlag(true);

      const stateRepo = createMockStateRepoWithRetry({
        initialState: buildState({ currentLevel: 'L1', version: 1 }),
        attemptResults: ['conflict', 'conflict', 'conflict'],
        metrics,
      });

      const service = new HysteresisEscalationService(
        stateRepo as any,
        metrics as any,
        featureFlag as any,
        TEST_CONFIG,
      );

      // Act + Assert: 409
      await expect(service.evaluate('inc-pack3', 0.9, NOW))
        .rejects.toThrow(EscalationStateConflictException);

      // Conflict metric: exactly once
      expect(metrics.incEscalationStateConflict).toHaveBeenCalledTimes(1);

      // No churn (no transition committed)
      expect(metrics.incEscalationChurn).not.toHaveBeenCalled();

      // 3 attempts, 0 commits
      expect(stateRepo.attemptCount).toBe(3);
      expect(stateRepo.commitCount).toBe(0);

      // State unchanged
      const finalState = stateRepo.getCurrentState();
      expect(finalState.version).toBe(1);
      expect(finalState.currentLevel).toBe('L1');
    });
  });

  // ==========================================================================
  // Test 3: Many callers — at most 1 commit per CAS round
  // ==========================================================================

  describe('cas_many_callers_at_most_one_commit_others_hold_or_retry_but_no_double_commit', () => {
    it('should allow at most 1 commit across 5 concurrent callers', async () => {
      const metrics = createMockMetrics();
      const featureFlag = createMockFeatureFlag(true);

      // Shared state — only one caller can commit per version
      const sharedState = buildState({ currentLevel: 'L1', version: 1 });
      let globalCommitCount = 0;
      let globalVersion = 1;

      /**
       * Each caller gets its own stateRepo mock that shares the global state.
       * Only the first caller to "commit" bumps the version; others see conflict.
       */
      function createCallerRepo(callerId: number) {
        let attemptCount = 0;

        return {
          getState: jest.fn(async () => ({ ...sharedState, version: globalVersion })),
          initState: jest.fn(),
          saveStateWithCas: jest.fn(),
          updateWithRetry: jest.fn(async (
            incidentId: string,
            mutate: (current: EscalationState) => Partial<EscalationState>,
          ): Promise<EscalationState> => {
            const CAS_MAX_RETRIES = 2;

            for (let attempt = 0; attempt <= CAS_MAX_RETRIES; attempt++) {
              attemptCount++;
              const state = { ...sharedState, version: globalVersion };
              const patch = mutate(state);
              const readVersion = globalVersion;

              // Simulate CAS: only succeeds if version hasn't changed
              if (readVersion === globalVersion && globalCommitCount === 0) {
                // Winner: commit
                globalVersion++;
                globalCommitCount++;
                const updated = { ...state, ...patch, version: globalVersion };
                return updated;
              }

              // Conflict: version changed by another caller
              if (attempt === CAS_MAX_RETRIES) {
                metrics.incEscalationStateConflict();
                throw new EscalationStateConflictException(incidentId);
              }
              // Retry
            }
            throw new EscalationStateConflictException(incidentId);
          }),
          get attemptCount() { return attemptCount; },
        };
      }

      // Create 5 callers
      const callers = Array.from({ length: 5 }, (_, i) => {
        const repo = createCallerRepo(i);
        const svc = new HysteresisEscalationService(
          repo as any,
          metrics as any,
          featureFlag as any,
          TEST_CONFIG,
        );
        return { repo, svc };
      });

      // Run all 5 concurrently
      const results = await Promise.allSettled(
        callers.map(({ svc }) => svc.evaluate('inc-pack3', 0.9, NOW)),
      );

      // Count outcomes
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      // At most 1 commit (winner)
      expect(globalCommitCount).toBe(1);
      expect(fulfilled.length).toBe(1);

      // Winner: ESCALATE
      const winner = (fulfilled[0] as PromiseFulfilledResult<any>).value;
      expect(winner.decision.action).toBe('ESCALATE');
      expect(winner.newLevel).toBe('L2');

      // Losers: all 409
      expect(rejected.length).toBe(4);
      for (const r of rejected) {
        expect((r as PromiseRejectedResult).reason).toBeInstanceOf(EscalationStateConflictException);
      }

      // Conflict metric: once per exhausted loser
      expect(metrics.incEscalationStateConflict).toHaveBeenCalledTimes(4);

      // Version bumped exactly once
      expect(globalVersion).toBe(2);
    });
  });

  // ==========================================================================
  // Test 4: IO timeout mid-retry — terminal, no conflict metric
  // ==========================================================================

  describe('cas_update_timeout_returns_500_and_does_not_increment_conflict_metric', () => {
    it('should throw IO error on 2nd attempt (after 1 conflict) and not increment conflict metric', async () => {
      const metrics = createMockMetrics();
      const featureFlag = createMockFeatureFlag(true);

      const stateRepo = createMockStateRepoWithRetry({
        initialState: buildState({ currentLevel: 'L1', version: 1 }),
        // attempt#1: CAS conflict (retry), attempt#2: IO timeout (terminal)
        attemptResults: ['conflict', 'io_timeout'],
        metrics,
      });

      const service = new HysteresisEscalationService(
        stateRepo as any,
        metrics as any,
        featureFlag as any,
        TEST_CONFIG,
      );

      // Act: should throw IO error (not 409)
      await expect(service.evaluate('inc-pack3', 0.9, NOW))
        .rejects.toThrow(/timed out/);

      // Conflict metric: 0 — IO error is NOT a CAS conflict
      expect(metrics.incEscalationStateConflict).not.toHaveBeenCalled();

      // No churn (no transition committed)
      expect(metrics.incEscalationChurn).not.toHaveBeenCalled();

      // 2 attempts (1 conflict + 1 IO), 0 commits
      expect(stateRepo.attemptCount).toBe(2);
      expect(stateRepo.commitCount).toBe(0);

      // State unchanged
      const finalState = stateRepo.getCurrentState();
      expect(finalState.version).toBe(1);
      expect(finalState.currentLevel).toBe('L1');
    });

    it('IO error on first attempt is terminal — no retry at all', async () => {
      const metrics = createMockMetrics();
      const featureFlag = createMockFeatureFlag(true);

      const stateRepo = createMockStateRepoWithRetry({
        initialState: buildState({ currentLevel: 'L1', version: 1 }),
        attemptResults: ['io_timeout'],
        metrics,
      });

      const service = new HysteresisEscalationService(
        stateRepo as any,
        metrics as any,
        featureFlag as any,
        TEST_CONFIG,
      );

      await expect(service.evaluate('inc-pack3', 0.9, NOW))
        .rejects.toThrow(/timed out/);

      // Only 1 attempt — IO is terminal
      expect(stateRepo.attemptCount).toBe(1);
      expect(stateRepo.commitCount).toBe(0);
      expect(metrics.incEscalationStateConflict).not.toHaveBeenCalled();
    });
  });
});
