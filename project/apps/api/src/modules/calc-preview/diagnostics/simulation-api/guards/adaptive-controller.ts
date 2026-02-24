/**
 * Adaptive Controller — Core State Machine
 *
 * SD-2 Minimal Viable Adaptive Control — Task 2
 *
 * Pure function: (state, input, config) → StepResult { nextState, output, events }
 * No Date.now(), no randomness, no side effects.
 *
 * Evaluation order (L3):
 *   1. Validate input
 *   2. Precedence overrides (P0 kill-switch → P1 provider outage)
 *   3. Compute candidate state (zone-based)
 *   4. Apply consecutive window guard
 *   5. Apply dwell time guard
 *   6. Apply flip budget guard
 *   7. Build output + telemetry events
 *
 * @see .kiro/specs/sd-2-adaptive-control/design.md
 */

import type { SigmaZone } from './baseline-math';
import type { GuardMode } from './guard-policy-resolver.types';
import {
  AdaptiveState,
  ProviderHealthZone,
  ValidationErrorCode,
  AdaptiveValidationError,
  STATE_SEVERITY,
  SIGMA_ZONE_SEVERITY,
  DEFAULT_ADAPTIVE_CONFIG,
  type ControlInput,
  type ControlOutput,
  type AdaptiveInternalState,
  type AdaptiveConfig,
  type StepResult,
  type TelemetryEvent,
  type OutputReason,
  type StateReason,
} from './adaptive-controller.types';

// ============================================================================
// Constants
// ============================================================================

const ONE_HOUR_MS = 3_600_000;


// ============================================================================
// Input Validation
// ============================================================================

function validateInput(input: ControlInput): void {
  if (input.sigmaZone == null) {
    throw new AdaptiveValidationError(ValidationErrorCode.MISSING_SIGMA_ZONE, 'ControlInput.sigmaZone is required');
  }
  if (typeof input.complianceVerdict !== 'boolean') {
    throw new AdaptiveValidationError(ValidationErrorCode.MISSING_COMPLIANCE_VERDICT, 'ControlInput.complianceVerdict must be boolean');
  }
  if (input.providerHealthZone == null) {
    throw new AdaptiveValidationError(ValidationErrorCode.MISSING_PROVIDER_HEALTH_ZONE, 'ControlInput.providerHealthZone is required');
  }
  if (typeof input.killSwitchActive !== 'boolean') {
    throw new AdaptiveValidationError(ValidationErrorCode.MISSING_KILL_SWITCH, 'ControlInput.killSwitchActive must be boolean');
  }
  if (typeof input.nowMs !== 'number' || !Number.isFinite(input.nowMs)) {
    throw new AdaptiveValidationError(ValidationErrorCode.INVALID_NOW_MS, 'ControlInput.nowMs must be a finite number');
  }

  const validZones: SigmaZone[] = ['NORMAL', 'WARNING', 'ALERT', 'SPIKE'];
  if (!validZones.includes(input.sigmaZone)) {
    throw new AdaptiveValidationError(ValidationErrorCode.INVALID_SIGMA_ZONE, `Invalid sigmaZone: ${input.sigmaZone}`);
  }

  const validHealth = Object.values(ProviderHealthZone);
  if (!validHealth.includes(input.providerHealthZone)) {
    throw new AdaptiveValidationError(ValidationErrorCode.INVALID_PROVIDER_HEALTH_ZONE, `Invalid providerHealthZone: ${input.providerHealthZone}`);
  }
}

// ============================================================================
// Guard Mode Mapping
// ============================================================================

function resolveGuardMode(state: AdaptiveState): GuardMode {
  return state === AdaptiveState.ENFORCE ? 'enforce' : 'shadow';
}

// ============================================================================
// Flip History Pruning — keep only flips within the last hour
// ============================================================================

function pruneFlipHistory(history: readonly number[], nowMs: number): readonly number[] {
  const cutoff = nowMs - ONE_HOUR_MS;
  const pruned = history.filter((ts) => ts > cutoff);
  return Object.freeze(pruned);
}

// ============================================================================
// Zone meets threshold check
// ============================================================================

function zoneMeetsThreshold(zone: SigmaZone, threshold: SigmaZone): boolean {
  return SIGMA_ZONE_SEVERITY[zone] >= SIGMA_ZONE_SEVERITY[threshold];
}


// ============================================================================
// Adjacency Check — no direct jumps (L3)
// ============================================================================

function isAdjacentTransition(from: AdaptiveState, to: AdaptiveState): boolean {
  const diff = Math.abs(STATE_SEVERITY[from] - STATE_SEVERITY[to]);
  return diff === 1;
}

// ============================================================================
// Candidate State Computation — zone-based transitions
// ============================================================================

/**
 * Compute the candidate next state based on current state + zone + compliance.
 * Does NOT apply guards (consecutive, dwell, flip). Just raw transition logic.
 * Returns null if no transition is warranted.
 */
function computeCandidateState(
  currentState: AdaptiveState,
  input: ControlInput,
  config: AdaptiveConfig,
): { candidate: AdaptiveState; reason: StateReason } | null {
  const { sigmaZone, complianceVerdict } = input;

  switch (currentState) {
    case AdaptiveState.NORMAL:
      // NORMAL → ELEVATED: zone ≥ escalationThreshold
      if (zoneMeetsThreshold(sigmaZone, config.escalationZoneThreshold)) {
        return { candidate: AdaptiveState.ELEVATED, reason: 'ZONE_ESCALATION' };
      }
      return null;

    case AdaptiveState.ELEVATED:
      // ELEVATED → VIOLATION: zone ≥ violationThreshold
      if (zoneMeetsThreshold(sigmaZone, config.violationZoneThreshold)) {
        return { candidate: AdaptiveState.VIOLATION, reason: 'ZONE_ESCALATION' };
      }
      // ELEVATED → NORMAL: zone = NORMAL (de-escalation)
      if (sigmaZone === 'NORMAL') {
        return { candidate: AdaptiveState.NORMAL, reason: 'ZONE_DEESCALATION' };
      }
      return null;

    case AdaptiveState.VIOLATION:
      // VIOLATION → ENFORCE: compliance=false AND zone ≥ ALERT sustained
      if (!complianceVerdict && zoneMeetsThreshold(sigmaZone, config.violationZoneThreshold)) {
        return { candidate: AdaptiveState.ENFORCE, reason: 'COMPLIANCE_VIOLATION' };
      }
      // VIOLATION → ELEVATED: zone drops to WARNING or below
      if (!zoneMeetsThreshold(sigmaZone, config.violationZoneThreshold)) {
        return { candidate: AdaptiveState.ELEVATED, reason: 'ZONE_DEESCALATION' };
      }
      return null;

    case AdaptiveState.ENFORCE:
      // ENFORCE → VIOLATION: compliance restored OR zone < ALERT
      if (complianceVerdict || !zoneMeetsThreshold(sigmaZone, config.violationZoneThreshold)) {
        const reason: StateReason = complianceVerdict ? 'COMPLIANCE_RESTORED' : 'ZONE_DEESCALATION';
        return { candidate: AdaptiveState.VIOLATION, reason };
      }
      return null;

    default:
      return null;
  }
}


// ============================================================================
// Telemetry Event Builders
// ============================================================================

function buildTelemetryEvents(
  prevState: AdaptiveState,
  nextState: AdaptiveState,
  output: ControlOutput,
  nowMs: number,
  dwellMs: number,
): readonly TelemetryEvent[] {
  const events: TelemetryEvent[] = [];

  // STATE_GAUGE — current state
  for (const s of Object.values(AdaptiveState)) {
    events.push({
      type: 'STATE_GAUGE',
      labels: { state: s },
      value: s === nextState ? 1 : 0,
      timestampMs: nowMs,
    });
  }

  // TRANSITION_COUNT — if transition occurred
  if (output.transitionOccurred) {
    events.push({
      type: 'TRANSITION_COUNT',
      labels: { from: prevState, to: nextState, reason: output.stateReason },
      value: 1,
      timestampMs: nowMs,
    });
  }

  // DWELL_TIME_OBSERVATION — time spent in previous state
  if (output.transitionOccurred && dwellMs > 0) {
    events.push({
      type: 'DWELL_TIME_OBSERVATION',
      labels: { state: prevState },
      value: dwellMs / 1000, // seconds
      timestampMs: nowMs,
    });
  }

  // FLIP_BUDGET_GAUGE
  events.push({
    type: 'FLIP_BUDGET_GAUGE',
    labels: {},
    value: output.flipBudgetRemaining,
    timestampMs: nowMs,
  });

  return Object.freeze(events);
}

// ============================================================================
// Main Entry Point — evaluateAdaptive (pure function)
// ============================================================================

/**
 * Evaluate one step of the adaptive control loop.
 *
 * Pure: same (state, input, config) → same StepResult.
 * No Date.now(), no side effects.
 *
 * L3 evaluation order:
 *   1. Validate input
 *   2. Precedence overrides (P0 kill-switch, P1 provider outage)
 *   3. Compute candidate state
 *   4. Apply consecutive window guard
 *   5. Apply dwell time guard
 *   6. Apply flip budget guard
 *   7. Build output + events
 */
export function evaluateAdaptive(
  prevState: AdaptiveInternalState,
  input: ControlInput,
  config: AdaptiveConfig = DEFAULT_ADAPTIVE_CONFIG,
): StepResult {
  // ── Step 1: Validate ──────────────────────────────────────────────
  validateInput(input);

  const { nowMs } = input;
  const prunedFlipHistory = pruneFlipHistory(prevState.flipHistory, nowMs);
  const currentFlipCount = prunedFlipHistory.length;
  const flipBudgetRemaining = Math.max(0, config.maxFlipsPerHour - currentFlipCount);
  const dwellElapsed = nowMs - prevState.lastTransitionMs;

  // ── Step 2: Precedence overrides ──────────────────────────────────

  // P0: Kill-switch — force shadow, override state
  if (input.killSwitchActive) {
    return buildOverrideResult(
      prevState, input, config,
      AdaptiveState.NORMAL,
      'KS_FORCED_SHADOW',
      'KILL_SWITCH_OVERRIDE',
      'KILL_SWITCH',
      prunedFlipHistory,
      flipBudgetRemaining,
    );
  }

  // P1: Provider outage — fail-open, force shadow from ELEVATED
  if (input.providerHealthZone === ProviderHealthZone.OUTAGE) {
    return buildOverrideResult(
      prevState, input, config,
      AdaptiveState.ELEVATED,
      'PROVIDER_UNHEALTHY',
      'PROVIDER_FAILURE_OVERRIDE',
      'PROVIDER_OUTAGE',
      prunedFlipHistory,
      flipBudgetRemaining,
    );
  }


  // ── Step 3: Compute candidate state ───────────────────────────────
  const candidateResult = computeCandidateState(prevState.currentState, input, config);

  // No transition warranted → steady state
  if (candidateResult === null) {
    return buildSteadyResult(prevState, input, prunedFlipHistory, flipBudgetRemaining, config);
  }

  const { candidate, reason: candidateReason } = candidateResult;

  // Safety: no direct jumps
  if (!isAdjacentTransition(prevState.currentState, candidate)) {
    return buildSteadyResult(prevState, input, prunedFlipHistory, flipBudgetRemaining, config);
  }

  // ── Step 4: Consecutive window guard ──────────────────────────────
  // Track consecutive evaluations pointing to the same candidate direction
  const zoneMatchesPrevious = input.sigmaZone === prevState.lastZone;
  const newConsecutiveCount = zoneMatchesPrevious ? prevState.consecutiveCount + 1 : 1;

  if (newConsecutiveCount < config.consecutiveWindowsRequired) {
    // Not enough consecutive windows yet
    const nextState: AdaptiveInternalState = Object.freeze({
      ...prevState,
      consecutiveCount: newConsecutiveCount,
      lastZone: input.sigmaZone,
      flipHistory: prunedFlipHistory,
      overrideActive: false,
      overrideSource: null,
    });
    const dwellRemaining = Math.max(0, config.dwellTimeMs - dwellElapsed);
    const output: ControlOutput = Object.freeze({
      state: prevState.currentState,
      previousState: prevState.currentState,
      guardMode: resolveGuardMode(prevState.currentState),
      outputReason: resolveOutputReason(prevState.currentState, false),
      stateReason: 'CONSECUTIVE_WINDOW_PENDING' as StateReason,
      transitionOccurred: false,
      dwellTimeRemainingMs: dwellRemaining,
      flipBudgetRemaining,
      evaluatedAtMs: nowMs,
      overrideActive: false,
    });
    return {
      nextState,
      output,
      events: buildTelemetryEvents(prevState.currentState, prevState.currentState, output, nowMs, 0),
    };
  }

  // ── Step 5: Dwell time guard ──────────────────────────────────────
  if (dwellElapsed < config.dwellTimeMs) {
    const dwellRemaining = config.dwellTimeMs - dwellElapsed;
    const nextState: AdaptiveInternalState = Object.freeze({
      ...prevState,
      consecutiveCount: newConsecutiveCount,
      lastZone: input.sigmaZone,
      flipHistory: prunedFlipHistory,
      overrideActive: false,
      overrideSource: null,
    });
    const output: ControlOutput = Object.freeze({
      state: prevState.currentState,
      previousState: prevState.currentState,
      guardMode: resolveGuardMode(prevState.currentState),
      outputReason: resolveOutputReason(prevState.currentState, false),
      stateReason: 'DWELL_NOT_MET' as StateReason,
      transitionOccurred: false,
      dwellTimeRemainingMs: dwellRemaining,
      flipBudgetRemaining,
      evaluatedAtMs: nowMs,
      overrideActive: false,
    });
    return {
      nextState,
      output,
      events: buildTelemetryEvents(prevState.currentState, prevState.currentState, output, nowMs, 0),
    };
  }

  // ── Step 6: Flip budget guard ─────────────────────────────────────
  if (flipBudgetRemaining <= 0) {
    const nextState: AdaptiveInternalState = Object.freeze({
      ...prevState,
      consecutiveCount: newConsecutiveCount,
      lastZone: input.sigmaZone,
      flipHistory: prunedFlipHistory,
      overrideActive: false,
      overrideSource: null,
    });
    const output: ControlOutput = Object.freeze({
      state: prevState.currentState,
      previousState: prevState.currentState,
      guardMode: resolveGuardMode(prevState.currentState),
      outputReason: resolveOutputReason(prevState.currentState, false),
      stateReason: 'FLIP_BUDGET_EXHAUSTED' as StateReason,
      transitionOccurred: false,
      dwellTimeRemainingMs: 0,
      flipBudgetRemaining: 0,
      evaluatedAtMs: nowMs,
      overrideActive: false,
    });
    return {
      nextState,
      output,
      events: buildTelemetryEvents(prevState.currentState, prevState.currentState, output, nowMs, 0),
    };
  }


  // ── Step 7: All guards passed — execute transition ────────────────
  const newFlipHistory = Object.freeze([...prunedFlipHistory, nowMs]);
  const nextState: AdaptiveInternalState = Object.freeze({
    currentState: candidate,
    enteredAtMs: nowMs,
    lastTransitionMs: nowMs,
    consecutiveCount: 0, // reset on transition
    lastZone: input.sigmaZone,
    flipHistory: newFlipHistory,
    overrideActive: false,
    overrideSource: null,
  });

  const newFlipBudgetRemaining = Math.max(0, config.maxFlipsPerHour - newFlipHistory.length);
  const output: ControlOutput = Object.freeze({
    state: candidate,
    previousState: prevState.currentState,
    guardMode: resolveGuardMode(candidate),
    outputReason: resolveOutputReason(candidate, false),
    stateReason: candidateReason,
    transitionOccurred: true,
    dwellTimeRemainingMs: config.dwellTimeMs, // full dwell starts now
    flipBudgetRemaining: newFlipBudgetRemaining,
    evaluatedAtMs: nowMs,
    overrideActive: false,
  });

  return {
    nextState,
    output,
    events: buildTelemetryEvents(prevState.currentState, candidate, output, nowMs, dwellElapsed),
  };
}

// ============================================================================
// Helper: resolve output reason based on state + override
// ============================================================================

function resolveOutputReason(state: AdaptiveState, _override: boolean): OutputReason {
  return state === AdaptiveState.ENFORCE ? 'ENFORCE_ACTIVE' : 'SHADOW_NORMAL';
}

// ============================================================================
// Helper: build override result (kill-switch / provider outage)
// ============================================================================

function buildOverrideResult(
  prevState: AdaptiveInternalState,
  input: ControlInput,
  _config: AdaptiveConfig,
  targetState: AdaptiveState,
  outputReason: OutputReason,
  stateReason: StateReason,
  overrideSource: 'KILL_SWITCH' | 'PROVIDER_OUTAGE',
  prunedFlipHistory: readonly number[],
  flipBudgetRemaining: number,
): StepResult {
  const { nowMs } = input;
  const transitionOccurred = prevState.currentState !== targetState;
  const dwellElapsed = nowMs - prevState.lastTransitionMs;

  const nextState: AdaptiveInternalState = Object.freeze({
    currentState: targetState,
    enteredAtMs: transitionOccurred ? nowMs : prevState.enteredAtMs,
    lastTransitionMs: transitionOccurred ? nowMs : prevState.lastTransitionMs,
    consecutiveCount: 0,
    lastZone: input.sigmaZone,
    flipHistory: prunedFlipHistory, // overrides don't consume flip budget
    overrideActive: true,
    overrideSource,
  });

  const output: ControlOutput = Object.freeze({
    state: targetState,
    previousState: prevState.currentState,
    guardMode: 'shadow' as GuardMode, // both overrides force shadow
    outputReason,
    stateReason: transitionOccurred ? stateReason : 'STEADY_STATE',
    transitionOccurred,
    dwellTimeRemainingMs: 0, // overrides bypass dwell
    flipBudgetRemaining,
    evaluatedAtMs: nowMs,
    overrideActive: true,
  });

  const events = buildTelemetryEvents(
    prevState.currentState, targetState, output, nowMs,
    transitionOccurred ? dwellElapsed : 0,
  );

  return { nextState, output, events };
}

// ============================================================================
// Helper: build steady-state result (no transition)
// ============================================================================

function buildSteadyResult(
  prevState: AdaptiveInternalState,
  input: ControlInput,
  prunedFlipHistory: readonly number[],
  flipBudgetRemaining: number,
  config: AdaptiveConfig = DEFAULT_ADAPTIVE_CONFIG,
): StepResult {
  const { nowMs } = input;
  const dwellElapsed = nowMs - prevState.lastTransitionMs;
  const dwellRemaining = Math.max(0, config.dwellTimeMs - dwellElapsed);

  const nextState: AdaptiveInternalState = Object.freeze({
    ...prevState,
    lastZone: input.sigmaZone,
    flipHistory: prunedFlipHistory,
    overrideActive: false,
    overrideSource: null,
  });

  const output: ControlOutput = Object.freeze({
    state: prevState.currentState,
    previousState: prevState.currentState,
    guardMode: resolveGuardMode(prevState.currentState),
    outputReason: resolveOutputReason(prevState.currentState, false),
    stateReason: 'STEADY_STATE' as StateReason,
    transitionOccurred: false,
    dwellTimeRemainingMs: dwellRemaining,
    flipBudgetRemaining,
    evaluatedAtMs: nowMs,
    overrideActive: false,
  });

  return {
    nextState,
    output,
    events: buildTelemetryEvents(prevState.currentState, prevState.currentState, output, nowMs, 0),
  };
}
