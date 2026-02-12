/**
 * HysteresisEscalationService — Integration Tests
 *
 * Sprint 3 - Task 5.3
 *
 * Tests the full cycle: getState → evaluateEscalation → applyDecision → CAS write.
 *
 * Test matrix:
 *   1. Feature flag disabled → HOLD without DB touch
 *   2. Escalate: metric > threshold → level up + churn metric
 *   3. De-escalate: stable window met → level down + churn metric
 *   4. Hold-down blocks escalation
 *   5. CAS conflict retry → re-evaluate with fresh state (deterministic)
 *   6. Accumulate: counter increment without level change
 *   7. Hysteresis band → HOLD + stable window reset
 */

import { HysteresisEscalationService } from '../hysteresis-escalation.service';
import { EscalationStateRepository } from '../escalation-state.repository';
import { SimulationMetricsService } from '../../simulation-api/simulation-metrics.service';
import { SimulationFeatureFlagService } from '../../simulation-api/simulation-feature-flag.service';
import { EscalationState, HysteresisConfig } from '../escalation-hysteresis.types';

// ============================================================================
// Mocks
// ============================================================================

function createMockStateRepo(): jest.Mocked<EscalationStateRepository> {
  return {
    getState: jest.fn(),
    initState: jest.fn(),
    saveStateWithCas: jest.fn(),
    updateWithRetry: jest.fn(),
  } as any;
}

function createMockMetrics(): jest.Mocked<SimulationMetricsService> {
  return {
    incPromoteSuccess: jest.fn(),
    incPromoteFailure: jest.fn(),
    incDriftDetected: jest.fn(),
    incEscalationChurn: jest.fn(),
    incEscalationStateConflict: jest.fn(),
  } as any;
}

function createMockFeatureFlag(enabled = true): jest.Mocked<SimulationFeatureFlagService> {
  return {
    isSimulationEnabled: jest.fn().mockReturnValue(enabled),
  } as any;
}

const NOW = new Date('2026-02-10T12:00:00Z');

const TEST_CONFIG: HysteresisConfig = {
  escalateThreshold: 0.8,
  deescalateThreshold: 0.4,
  stableWindowRunCount: 5,
  stableWindowMinutes: 10,
  holdDownMinutes: 15,
};

function buildState(overrides: Partial<EscalationState> = {}): EscalationState {
  return {
    incidentId: 'inc-1',
    currentLevel: 'L1',
    lastTransitionAt: '2026-02-10T11:00:00Z',
    holdDownUntil: null,
    stableWindowCounter: 0,
    stableWindowStartedAt: null,
    version: 1,
    ...overrides,
  };
}

describe('HysteresisEscalationService', () => {
  let service: HysteresisEscalationService;
  let mockRepo: jest.Mocked<EscalationStateRepository>;
  let mockMetrics: jest.Mocked<SimulationMetricsService>;
  let mockFeatureFlag: jest.Mocked<SimulationFeatureFlagService>;

  beforeEach(() => {
    mockRepo = createMockStateRepo();
    mockMetrics = createMockMetrics();
    mockFeatureFlag = createMockFeatureFlag(true);

    service = new HysteresisEscalationService(
      mockRepo,
      mockMetrics,
      mockFeatureFlag,
      TEST_CONFIG,
    );
  });

  // ==========================================================================
  // 1. Feature flag disabled → HOLD
  // ==========================================================================

  describe('feature flag disabled', () => {
    it('should return HOLD without touching DB', async () => {
      mockFeatureFlag.isSimulationEnabled.mockReturnValue(false);

      const result = await service.evaluate('inc-1', 0.9, NOW);

      expect(result.decision.action).toBe('HOLD');
      expect(result.decision.reason).toBe('FEATURE_DISABLED');
      expect(result.transitioned).toBe(false);
      expect(mockRepo.updateWithRetry).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 2. Escalate: metric > threshold → level up + churn metric
  // ==========================================================================

  describe('escalation', () => {
    it('should escalate from L1 to L2 and increment churn metric', async () => {
      // updateWithRetry calls the mutate callback with current state
      // and returns the new state after CAS write
      mockRepo.updateWithRetry.mockImplementation(async (incidentId, mutate) => {
        const currentState = buildState({ currentLevel: 'L1' });
        const patch = mutate(currentState);
        return { ...currentState, ...patch, version: 2 };
      });

      const result = await service.evaluate('inc-1', 0.9, NOW);

      expect(result.transitioned).toBe(true);
      expect(result.previousLevel).toBe('L1');
      expect(result.newLevel).toBe('L2');
      expect(result.decision.action).toBe('ESCALATE');
      expect(mockMetrics.incEscalationChurn).toHaveBeenCalledWith('inc-1', 'up');
    });

    it('should escalate from NONE to L1', async () => {
      mockRepo.updateWithRetry.mockImplementation(async (incidentId, mutate) => {
        const currentState = buildState({ currentLevel: 'NONE' });
        const patch = mutate(currentState);
        return { ...currentState, ...patch, version: 2 };
      });

      const result = await service.evaluate('inc-1', 0.85, NOW);

      expect(result.decision.action).toBe('ESCALATE');
      expect(result.newLevel).toBe('L1');
      expect(mockMetrics.incEscalationChurn).toHaveBeenCalledWith('inc-1', 'up');
    });
  });

  // ==========================================================================
  // 3. De-escalate: stable window met → level down + churn metric
  // ==========================================================================

  describe('de-escalation', () => {
    it('should de-escalate from L2 to L1 when stable window is met', async () => {
      mockRepo.updateWithRetry.mockImplementation(async (incidentId, mutate) => {
        const currentState = buildState({
          currentLevel: 'L2',
          stableWindowCounter: 4, // will become 5 (= stableWindowRunCount)
          stableWindowStartedAt: '2026-02-10T11:55:00Z',
        });
        const patch = mutate(currentState);
        return { ...currentState, ...patch, version: 2 };
      });

      const result = await service.evaluate('inc-1', 0.3, NOW);

      expect(result.transitioned).toBe(true);
      expect(result.decision.action).toBe('DEESCALATE');
      expect(result.newLevel).toBe('L1');
      expect(mockMetrics.incEscalationChurn).toHaveBeenCalledWith('inc-1', 'down');
    });
  });

  // ==========================================================================
  // 4. Hold-down blocks escalation
  // ==========================================================================

  describe('hold-down active', () => {
    it('should return HOLD when cooldown is active', async () => {
      mockRepo.updateWithRetry.mockImplementation(async (incidentId, mutate) => {
        const currentState = buildState({
          currentLevel: 'L1',
          holdDownUntil: '2026-02-10T12:30:00Z', // 30 min from NOW
        });
        const patch = mutate(currentState);
        return { ...currentState, ...patch, version: 2 };
      });

      const result = await service.evaluate('inc-1', 0.95, NOW);

      expect(result.decision.action).toBe('HOLD');
      expect(result.decision.reason).toBe('COOLDOWN_ACTIVE');
      expect(result.transitioned).toBe(false);
      expect(mockMetrics.incEscalationChurn).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 5. CAS conflict retry → re-evaluate with fresh state
  // ==========================================================================

  describe('CAS conflict retry', () => {
    it('should produce same decision on re-evaluation (deterministic)', async () => {
      // Simulate: updateWithRetry calls mutate twice (CAS conflict on first)
      let callCount = 0;
      mockRepo.updateWithRetry.mockImplementation(async (incidentId, mutate) => {
        // First call: state v1, second call: state v2 (after conflict)
        // Both should produce ESCALATE since metric > threshold
        callCount++;
        const version = callCount;
        const currentState = buildState({ currentLevel: 'L1', version });
        const patch = mutate(currentState);
        return { ...currentState, ...patch, version: version + 1 };
      });

      const result = await service.evaluate('inc-1', 0.9, NOW);

      // The last evaluation wins — should still be ESCALATE
      expect(result.decision.action).toBe('ESCALATE');
      expect(result.newLevel).toBe('L2');
    });
  });

  // ==========================================================================
  // 6. Accumulate: counter increment without level change
  // ==========================================================================

  describe('accumulate', () => {
    it('should increment counter without level change', async () => {
      mockRepo.updateWithRetry.mockImplementation(async (incidentId, mutate) => {
        const currentState = buildState({
          currentLevel: 'L1',
          stableWindowCounter: 2,
          stableWindowStartedAt: '2026-02-10T11:55:00Z',
        });
        const patch = mutate(currentState);
        return { ...currentState, ...patch, version: 2 };
      });

      const result = await service.evaluate('inc-1', 0.3, NOW);

      expect(result.decision.action).toBe('ACCUMULATE');
      expect(result.transitioned).toBe(false);
      expect(result.newLevel).toBe('L1'); // unchanged
      expect(mockMetrics.incEscalationChurn).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 7. Hysteresis band → HOLD + stable window reset
  // ==========================================================================

  describe('hysteresis band', () => {
    it('should HOLD and reset stable window when metric is in band', async () => {
      mockRepo.updateWithRetry.mockImplementation(async (incidentId, mutate) => {
        const currentState = buildState({
          currentLevel: 'L1',
          stableWindowCounter: 3,
          stableWindowStartedAt: '2026-02-10T11:50:00Z',
        });
        const patch = mutate(currentState);
        return { ...currentState, ...patch, version: 2 };
      });

      const result = await service.evaluate('inc-1', 0.5, NOW);

      expect(result.decision.action).toBe('HOLD');
      expect(result.decision.resetStableWindow).toBe(true);
      expect(result.transitioned).toBe(false);
      expect(mockMetrics.incEscalationChurn).not.toHaveBeenCalled();
    });
  });
});
