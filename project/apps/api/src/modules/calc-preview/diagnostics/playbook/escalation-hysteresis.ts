/**
 * evaluateEscalation — Pure Function
 *
 * Sprint 3 - Task 5.1 / 5.2
 *
 * Deterministic escalation decision engine.
 * Time is injected via `now` parameter — no Date.now() calls.
 *
 * Decision flow:
 *   1. Hold-down check → HOLD if cooldown active
 *   2. Escalate check → metric > upper band threshold
 *   3. De-escalate check → metric < lower threshold + stable window satisfied
 *   4. Accumulate → metric < lower threshold but stable window not yet met
 *   5. Hysteresis band → HOLD + reset stable window
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md §4
 */

import {
  EscalationState,
  EscalationLevel,
  EscalationDecision,
  HysteresisConfig,
} from './escalation-hysteresis.types';

// ============================================================================
// Level ordering (NONE < L1 < L2 < L3)
// ============================================================================

const LEVEL_ORDER: readonly EscalationLevel[] = ['NONE', 'L1', 'L2', 'L3'];

function levelIndex(level: EscalationLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

function nextLevel(level: EscalationLevel): EscalationLevel | null {
  const idx = levelIndex(level);
  return idx < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[idx + 1] : null;
}

function prevLevel(level: EscalationLevel): EscalationLevel | null {
  const idx = levelIndex(level);
  return idx > 0 ? LEVEL_ORDER[idx - 1] : null;
}

// ============================================================================
// evaluateEscalation (pure)
// ============================================================================

/**
 * Pure escalation decision function.
 *
 * @param state   - Current persisted escalation state
 * @param metricValue - Current metric reading (e.g. risk score from ranker)
 * @param config  - Hysteresis thresholds & window config
 * @param now     - Current time (injected for determinism)
 * @returns EscalationDecision — what to do next
 */
export function evaluateEscalation(
  state: EscalationState,
  metricValue: number,
  config: HysteresisConfig,
  now: Date,
): EscalationDecision {
  // ──────────────────────────────────────────────────────────────────────────
  // 1. Hold-down check: cooldown active → no level change allowed
  // ──────────────────────────────────────────────────────────────────────────
  if (state.holdDownUntil && now.getTime() < new Date(state.holdDownUntil).getTime()) {
    return { action: 'HOLD', reason: 'COOLDOWN_ACTIVE' };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Escalate check: metric exceeds upper threshold → go up
  // ──────────────────────────────────────────────────────────────────────────
  if (metricValue > config.escalateThreshold) {
    const next = nextLevel(state.currentLevel);
    if (next) {
      const holdDownUntil = addMinutes(now, config.holdDownMinutes).toISOString();
      return {
        action: 'ESCALATE',
        newLevel: next,
        holdDownUntil,
      };
    }
    // Already at L3 (max) — hold
    return { action: 'HOLD', reason: 'ALREADY_MAX_LEVEL' };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. De-escalate / Accumulate: metric below lower threshold
  // ──────────────────────────────────────────────────────────────────────────
  if (metricValue < config.deescalateThreshold) {
    // Can't de-escalate below NONE
    const prev = prevLevel(state.currentLevel);
    if (!prev) {
      return { action: 'HOLD', reason: 'ALREADY_MIN_LEVEL' };
    }

    const newCounter = state.stableWindowCounter + 1;
    const windowStart = state.stableWindowStartedAt ?? now.toISOString();
    const windowElapsedMs = now.getTime() - new Date(windowStart).getTime();
    const windowElapsedMinutes = windowElapsedMs / 60_000;

    // Stable window satisfied: enough consecutive runs OR enough time
    if (
      newCounter >= config.stableWindowRunCount ||
      windowElapsedMinutes >= config.stableWindowMinutes
    ) {
      const holdDownUntil = addMinutes(now, config.holdDownMinutes).toISOString();
      return {
        action: 'DEESCALATE',
        newLevel: prev,
        holdDownUntil,
      };
    }

    // Not yet — accumulate
    return {
      action: 'ACCUMULATE',
      stableWindowCounter: newCounter,
      stableWindowStartedAt: windowStart,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. In hysteresis band (between deescalateThreshold and escalateThreshold)
  //    → no change, reset stable window counter
  // ──────────────────────────────────────────────────────────────────────────
  return { action: 'HOLD', reason: 'IN_HYSTERESIS_BAND', resetStableWindow: true };
}

// ============================================================================
// Helpers
// ============================================================================

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

// ============================================================================
// Exports for testing
// ============================================================================

export { nextLevel, prevLevel, levelIndex, LEVEL_ORDER };
