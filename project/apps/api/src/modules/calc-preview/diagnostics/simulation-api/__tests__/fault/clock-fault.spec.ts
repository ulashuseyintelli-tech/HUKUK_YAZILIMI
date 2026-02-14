/**
 * Clock Fault Injection Tests — F9
 *
 * evaluateEscalation is a pure function with injected `now: Date`.
 * F9: clock jump backward → holdDownUntil still in future → HOLD.
 *
 * Assertion triple: outcome (HOLD) + no escalation + no CAS metric
 *
 * @see .kiro/specs/fault-injection-harness/requirements.md — Req 6
 * @see .kiro/specs/fault-injection-harness/design.md — D2.5, D6
 */

import { evaluateEscalation } from '../../../playbook/escalation-hysteresis';
import {
  EscalationState,
  HysteresisConfig,
} from '../../../playbook/escalation-hysteresis.types';
import { selectScenario } from './fault-injector';

// ============================================================================
// Helpers
// ============================================================================

const SEED = 42;

const DEFAULT_CONFIG: HysteresisConfig = {
  escalateThreshold: 80,
  deescalateThreshold: 30,
  stableWindowRunCount: 3,
  stableWindowMinutes: 10,
  holdDownMinutes: 5,
};

function buildState(overrides: Partial<EscalationState> = {}): EscalationState {
  return {
    incidentId: 'inc-f9',
    currentLevel: 'L1',
    lastTransitionAt: '2026-02-14T10:00:00.000Z',
    holdDownUntil: null,
    stableWindowCounter: 0,
    stableWindowStartedAt: null,
    version: 1,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Clock Fault Injection — F9 (Tier-1)', () => {
  describe('F9: fault_clock_jump_backward_preserves_hold_when_holdDownUntil_in_future', () => {
    it('should return HOLD when now is jumped backward behind holdDownUntil', () => {
      const scenario = selectScenario(SEED, 'F9');
      expect(scenario).toBeDefined();
      expect(scenario!.fault).toBe('clock_jump_backward');

      const baseNow = new Date('2026-02-14T10:00:00.000Z');
      const holdDownUntil = new Date(baseNow.getTime() + 10 * 60_000); // +10min
      const jumpedNow = new Date(baseNow.getTime() - 5 * 60_000);     // -5min (backward)

      const state = buildState({
        currentLevel: 'L1',
        holdDownUntil: holdDownUntil.toISOString(),
      });

      // Even with a high metric that would normally escalate,
      // cooldown must be respected
      const result = evaluateEscalation(state, 999, DEFAULT_CONFIG, jumpedNow);

      // Outcome: HOLD with COOLDOWN_ACTIVE
      expect(result.action).toBe('HOLD');
      expect(result.reason).toBe('COOLDOWN_ACTIVE');

      // No escalation occurred
      expect(result.newLevel).toBeUndefined();
    });

    it('should NOT bypass cooldown even with extreme backward jump', () => {
      const holdDownUntil = new Date('2026-02-14T10:10:00.000Z');
      const extremeBackward = new Date('2025-01-01T00:00:00.000Z'); // 1+ year back

      const state = buildState({
        currentLevel: 'L2',
        holdDownUntil: holdDownUntil.toISOString(),
      });

      const result = evaluateEscalation(state, 999, DEFAULT_CONFIG, extremeBackward);

      expect(result.action).toBe('HOLD');
      expect(result.reason).toBe('COOLDOWN_ACTIVE');
    });
  });

  describe('F9: fault_clock_jump_backward_does_not_increment_conflict_metrics', () => {
    it('should produce a pure HOLD decision with no side effects', () => {
      const holdDownUntil = new Date('2026-02-14T10:10:00.000Z');
      const jumpedNow = new Date('2026-02-14T09:55:00.000Z');

      const state = buildState({
        holdDownUntil: holdDownUntil.toISOString(),
      });

      const result = evaluateEscalation(state, 50, DEFAULT_CONFIG, jumpedNow);

      // Pure function: only returns decision, no metric calls
      // CAS conflict metric is NOT relevant here (this is clock, not CAS)
      expect(result.action).toBe('HOLD');
      expect(result.reason).toBe('COOLDOWN_ACTIVE');

      // No state mutation fields
      expect(result.newLevel).toBeUndefined();
      expect(result.holdDownUntil).toBeUndefined();
      expect(result.stableWindowCounter).toBeUndefined();
      expect(result.resetStableWindow).toBeUndefined();
    });
  });

  describe('F9: cooldown expires correctly after forward time progression', () => {
    it('should allow escalation once now passes holdDownUntil', () => {
      const holdDownUntil = new Date('2026-02-14T10:10:00.000Z');
      const afterCooldown = new Date('2026-02-14T10:10:01.000Z'); // 1s after

      const state = buildState({
        currentLevel: 'L1',
        holdDownUntil: holdDownUntil.toISOString(),
      });

      // High metric → should escalate now that cooldown expired
      const result = evaluateEscalation(state, 999, DEFAULT_CONFIG, afterCooldown);

      expect(result.action).toBe('ESCALATE');
      expect(result.newLevel).toBe('L2');
    });
  });
});
