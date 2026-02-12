/**
 * evaluateEscalation — Unit Tests
 *
 * Sprint 3 - Task 5.1 / 5.2
 *
 * Bloklayan minimum set:
 *   1. Hold-down aktifken yükseltme engeli
 *   2. Stable window dolmadan seviye değişmeme
 *   3. Downshift kriteri + counter reset doğruluğu
 *   4. Determinism: aynı input → aynı output
 *   5. Escalate: metric > threshold → next level
 *   6. Already at max level → HOLD
 *   7. Already at min level → HOLD
 *   8. Hysteresis band → HOLD + resetStableWindow
 *   9. Accumulate → counter increment + window start
 *  10. Stable window by time (minutes elapsed)
 */

import {
  evaluateEscalation,
  nextLevel,
  prevLevel,
  LEVEL_ORDER,
} from '../escalation-hysteresis';
import {
  EscalationState,
  HysteresisConfig,
} from '../escalation-hysteresis.types';

// ============================================================================
// Fixtures
// ============================================================================

const NOW = new Date('2026-02-10T12:00:00Z');

const DEFAULT_CONFIG: HysteresisConfig = {
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

// ============================================================================
// Tests
// ============================================================================

describe('evaluateEscalation', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // 1. Hold-down aktifken yükseltme engeli (Property 9)
  // ──────────────────────────────────────────────────────────────────────────

  describe('hold-down (cooldown) active', () => {
    it('should return HOLD regardless of metric value when cooldown is active', () => {
      const state = buildState({
        holdDownUntil: '2026-02-10T12:30:00Z', // 30 min from now
        currentLevel: 'L1',
      });

      // Even with metric way above escalate threshold
      const decision = evaluateEscalation(state, 0.99, DEFAULT_CONFIG, NOW);

      expect(decision.action).toBe('HOLD');
      expect(decision.reason).toBe('COOLDOWN_ACTIVE');
      expect(decision.newLevel).toBeUndefined();
    });

    it('should return HOLD even with metric below deescalate threshold', () => {
      const state = buildState({
        holdDownUntil: '2026-02-10T12:30:00Z',
        currentLevel: 'L2',
      });

      const decision = evaluateEscalation(state, 0.1, DEFAULT_CONFIG, NOW);

      expect(decision.action).toBe('HOLD');
      expect(decision.reason).toBe('COOLDOWN_ACTIVE');
    });

    it('should allow action when hold-down has expired', () => {
      const state = buildState({
        holdDownUntil: '2026-02-10T11:30:00Z', // 30 min ago — expired
        currentLevel: 'L1',
      });

      const decision = evaluateEscalation(state, 0.9, DEFAULT_CONFIG, NOW);

      // Hold-down expired → escalate check proceeds
      expect(decision.action).toBe('ESCALATE');
      expect(decision.newLevel).toBe('L2');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Stable window dolmadan seviye değişmeme
  // ──────────────────────────────────────────────────────────────────────────

  describe('stable window not yet met → no de-escalation', () => {
    it('should ACCUMULATE when counter < stableWindowRunCount and time < stableWindowMinutes', () => {
      const state = buildState({
        currentLevel: 'L2',
        stableWindowCounter: 2,
        stableWindowStartedAt: '2026-02-10T11:55:00Z', // 5 min ago (< 10 min)
      });

      const decision = evaluateEscalation(state, 0.3, DEFAULT_CONFIG, NOW);

      expect(decision.action).toBe('ACCUMULATE');
      expect(decision.stableWindowCounter).toBe(3);
      expect(decision.newLevel).toBeUndefined();
    });

    it('should NOT deescalate with counter=4 and time=9min (both just under threshold)', () => {
      const state = buildState({
        currentLevel: 'L1',
        stableWindowCounter: 3, // will become 4 (< 5)
        stableWindowStartedAt: '2026-02-10T11:51:00Z', // 9 min ago (< 10 min)
      });

      const decision = evaluateEscalation(state, 0.2, DEFAULT_CONFIG, NOW);

      expect(decision.action).toBe('ACCUMULATE');
      expect(decision.stableWindowCounter).toBe(4);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Downshift (de-escalation) + counter reset
  // ──────────────────────────────────────────────────────────────────────────

  describe('de-escalation when stable window is met', () => {
    it('should DEESCALATE when counter reaches stableWindowRunCount', () => {
      const state = buildState({
        currentLevel: 'L2',
        stableWindowCounter: 4, // will become 5 (= stableWindowRunCount)
        stableWindowStartedAt: '2026-02-10T11:55:00Z',
      });

      const decision = evaluateEscalation(state, 0.3, DEFAULT_CONFIG, NOW);

      expect(decision.action).toBe('DEESCALATE');
      expect(decision.newLevel).toBe('L1');
      expect(decision.holdDownUntil).toBeDefined();
    });

    it('should DEESCALATE when time window is met (even with low counter)', () => {
      const state = buildState({
        currentLevel: 'L1',
        stableWindowCounter: 1, // low counter
        stableWindowStartedAt: '2026-02-10T11:49:00Z', // 11 min ago (>= 10 min)
      });

      const decision = evaluateEscalation(state, 0.2, DEFAULT_CONFIG, NOW);

      expect(decision.action).toBe('DEESCALATE');
      expect(decision.newLevel).toBe('NONE');
    });

    it('should set holdDownUntil = now + holdDownMinutes on de-escalation', () => {
      const state = buildState({
        currentLevel: 'L2',
        stableWindowCounter: 4,
        stableWindowStartedAt: '2026-02-10T11:50:00Z',
      });

      const decision = evaluateEscalation(state, 0.3, DEFAULT_CONFIG, NOW);

      expect(decision.action).toBe('DEESCALATE');
      const expectedHoldDown = new Date(NOW.getTime() + 15 * 60_000).toISOString();
      expect(decision.holdDownUntil).toBe(expectedHoldDown);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Determinism: same input → same output
  // ──────────────────────────────────────────────────────────────────────────

  describe('determinism', () => {
    it('should produce identical decisions for identical inputs', () => {
      const state = buildState({ currentLevel: 'L1', stableWindowCounter: 2 });
      const metric = 0.5; // in hysteresis band

      const d1 = evaluateEscalation(state, metric, DEFAULT_CONFIG, NOW);
      const d2 = evaluateEscalation(state, metric, DEFAULT_CONFIG, NOW);

      expect(d1).toEqual(d2);
    });

    it('should produce identical decisions across multiple metric values', () => {
      const metrics = [0.0, 0.2, 0.39, 0.4, 0.5, 0.79, 0.8, 0.81, 0.99, 1.0];

      for (const m of metrics) {
        const state = buildState({ currentLevel: 'L1' });
        const d1 = evaluateEscalation(state, m, DEFAULT_CONFIG, NOW);
        const d2 = evaluateEscalation(state, m, DEFAULT_CONFIG, NOW);
        expect(d1).toEqual(d2);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Escalate: metric > threshold → next level
  // ──────────────────────────────────────────────────────────────────────────

  describe('escalation', () => {
    it('should ESCALATE from NONE to L1 when metric > escalateThreshold', () => {
      const state = buildState({ currentLevel: 'NONE' });

      const decision = evaluateEscalation(state, 0.85, DEFAULT_CONFIG, NOW);

      expect(decision.action).toBe('ESCALATE');
      expect(decision.newLevel).toBe('L1');
      expect(decision.holdDownUntil).toBeDefined();
    });

    it('should ESCALATE from L1 to L2', () => {
      const state = buildState({ currentLevel: 'L1' });

      const decision = evaluateEscalation(state, 0.9, DEFAULT_CONFIG, NOW);

      expect(decision.action).toBe('ESCALATE');
      expect(decision.newLevel).toBe('L2');
    });

    it('should ESCALATE from L2 to L3', () => {
      const state = buildState({ currentLevel: 'L2' });

      const decision = evaluateEscalation(state, 0.95, DEFAULT_CONFIG, NOW);

      expect(decision.action).toBe('ESCALATE');
      expect(decision.newLevel).toBe('L3');
    });

    it('should set holdDownUntil = now + holdDownMinutes on escalation', () => {
      const state = buildState({ currentLevel: 'NONE' });

      const decision = evaluateEscalation(state, 0.9, DEFAULT_CONFIG, NOW);

      const expectedHoldDown = new Date(NOW.getTime() + 15 * 60_000).toISOString();
      expect(decision.holdDownUntil).toBe(expectedHoldDown);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Already at max level (L3) → HOLD
  // ──────────────────────────────────────────────────────────────────────────

  describe('max level', () => {
    it('should HOLD when already at L3 and metric > escalateThreshold', () => {
      const state = buildState({ currentLevel: 'L3' });

      const decision = evaluateEscalation(state, 0.95, DEFAULT_CONFIG, NOW);

      expect(decision.action).toBe('HOLD');
      expect(decision.reason).toBe('ALREADY_MAX_LEVEL');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Already at min level (NONE) → HOLD
  // ──────────────────────────────────────────────────────────────────────────

  describe('min level', () => {
    it('should HOLD when already at NONE and metric < deescalateThreshold', () => {
      const state = buildState({ currentLevel: 'NONE' });

      const decision = evaluateEscalation(state, 0.1, DEFAULT_CONFIG, NOW);

      expect(decision.action).toBe('HOLD');
      expect(decision.reason).toBe('ALREADY_MIN_LEVEL');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Hysteresis band → HOLD + resetStableWindow
  // ──────────────────────────────────────────────────────────────────────────

  describe('hysteresis band', () => {
    it('should HOLD and reset stable window when metric is in band', () => {
      const state = buildState({
        currentLevel: 'L1',
        stableWindowCounter: 3,
        stableWindowStartedAt: '2026-02-10T11:50:00Z',
      });

      // 0.5 is between deescalateThreshold (0.4) and escalateThreshold (0.8)
      const decision = evaluateEscalation(state, 0.5, DEFAULT_CONFIG, NOW);

      expect(decision.action).toBe('HOLD');
      expect(decision.reason).toBe('IN_HYSTERESIS_BAND');
      expect(decision.resetStableWindow).toBe(true);
    });

    it('should HOLD at exact deescalateThreshold (boundary: >= deescalate, not <)', () => {
      const state = buildState({ currentLevel: 'L1' });

      // metric === deescalateThreshold → in band (not below)
      const decision = evaluateEscalation(state, 0.4, DEFAULT_CONFIG, NOW);

      expect(decision.action).toBe('HOLD');
      expect(decision.reason).toBe('IN_HYSTERESIS_BAND');
    });

    it('should HOLD at exact escalateThreshold (boundary: <= escalate, not >)', () => {
      const state = buildState({ currentLevel: 'L1' });

      // metric === escalateThreshold → in band (not above)
      const decision = evaluateEscalation(state, 0.8, DEFAULT_CONFIG, NOW);

      expect(decision.action).toBe('HOLD');
      expect(decision.reason).toBe('IN_HYSTERESIS_BAND');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 9. Accumulate → counter increment + window start
  // ──────────────────────────────────────────────────────────────────────────

  describe('accumulate', () => {
    it('should start stable window on first below-threshold reading', () => {
      const state = buildState({
        currentLevel: 'L1',
        stableWindowCounter: 0,
        stableWindowStartedAt: null,
      });

      const decision = evaluateEscalation(state, 0.2, DEFAULT_CONFIG, NOW);

      expect(decision.action).toBe('ACCUMULATE');
      expect(decision.stableWindowCounter).toBe(1);
      expect(decision.stableWindowStartedAt).toBe(NOW.toISOString());
    });

    it('should preserve existing window start on subsequent readings', () => {
      const existingStart = '2026-02-10T11:55:00Z';
      const state = buildState({
        currentLevel: 'L2',
        stableWindowCounter: 2,
        stableWindowStartedAt: existingStart,
      });

      const decision = evaluateEscalation(state, 0.3, DEFAULT_CONFIG, NOW);

      expect(decision.action).toBe('ACCUMULATE');
      expect(decision.stableWindowCounter).toBe(3);
      expect(decision.stableWindowStartedAt).toBe(existingStart);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 10. Stable window by time
  // ──────────────────────────────────────────────────────────────────────────

  describe('stable window by time', () => {
    it('should DEESCALATE when time window met even with counter=0', () => {
      const state = buildState({
        currentLevel: 'L1',
        stableWindowCounter: 0,
        stableWindowStartedAt: '2026-02-10T11:49:00Z', // 11 min ago
      });

      const decision = evaluateEscalation(state, 0.2, DEFAULT_CONFIG, NOW);

      // counter becomes 1 (< 5), but time is 11 min (>= 10 min)
      expect(decision.action).toBe('DEESCALATE');
      expect(decision.newLevel).toBe('NONE');
    });
  });
});

// ============================================================================
// Level helpers
// ============================================================================

describe('level helpers', () => {
  it('nextLevel should follow NONE → L1 → L2 → L3 → null', () => {
    expect(nextLevel('NONE')).toBe('L1');
    expect(nextLevel('L1')).toBe('L2');
    expect(nextLevel('L2')).toBe('L3');
    expect(nextLevel('L3')).toBeNull();
  });

  it('prevLevel should follow L3 → L2 → L1 → NONE → null', () => {
    expect(prevLevel('L3')).toBe('L2');
    expect(prevLevel('L2')).toBe('L1');
    expect(prevLevel('L1')).toBe('NONE');
    expect(prevLevel('NONE')).toBeNull();
  });

  it('LEVEL_ORDER should be [NONE, L1, L2, L3]', () => {
    expect([...LEVEL_ORDER]).toEqual(['NONE', 'L1', 'L2', 'L3']);
  });
});
