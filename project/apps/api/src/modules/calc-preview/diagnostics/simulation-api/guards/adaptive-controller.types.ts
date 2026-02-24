/**
 * Adaptive Controller — Type Definitions
 *
 * SD-2 Minimal Viable Adaptive Control — Task 1
 *
 * Pure, deterministic control loop types.
 * 6 review locks applied:
 *   L1: overrideActive + effectiveState (kill-switch ≠ NORMAL)
 *   L2: ProviderHealthZone (OK|DEGRADED|OUTAGE), fail-open
 *   L3: Transition evaluation order codified
 *   L4: Event list instead of callback
 *   L5: Full persisted state contract
 *   L6: Dual reason (outputReason + stateReason)
 *
 * @see .kiro/specs/sd-2-adaptive-control/design.md
 * @see .kiro/specs/sd-2-adaptive-control/requirements.md
 */

import { SigmaZone } from './baseline-math';
import { GuardMode } from './guard-policy-resolver.types';

// ============================================================================
// Adaptive State — 4-state machine
// ============================================================================

export enum AdaptiveState {
  NORMAL = 'NORMAL',
  ELEVATED = 'ELEVATED',
  VIOLATION = 'VIOLATION',
  ENFORCE = 'ENFORCE',
}

/** Ordered severity for adjacency checks (no direct jumps) */
export const STATE_SEVERITY: Record<AdaptiveState, number> = {
  [AdaptiveState.NORMAL]: 0,
  [AdaptiveState.ELEVATED]: 1,
  [AdaptiveState.VIOLATION]: 2,
  [AdaptiveState.ENFORCE]: 3,
} as const;

/** All states — frozen */
export const ADAPTIVE_STATES: readonly AdaptiveState[] = Object.freeze([
  AdaptiveState.NORMAL,
  AdaptiveState.ELEVATED,
  AdaptiveState.VIOLATION,
  AdaptiveState.ENFORCE,
]);


// ============================================================================
// Provider Health Zone — L2: 3-level closed set, fail-open
// ============================================================================

/**
 * Provider health classification.
 * OK      → normal adaptive logic
 * DEGRADED → advisory, no override
 * OUTAGE  → fail-open: force shadow, reason PROVIDER_UNHEALTHY
 */
export enum ProviderHealthZone {
  OK = 'OK',
  DEGRADED = 'DEGRADED',
  OUTAGE = 'OUTAGE',
}

// ============================================================================
// Reason Codes — L6: dual reason (output + state)
// ============================================================================

/**
 * Output reason — why guard_mode is shadow or enforce.
 * Answers: "why is the output what it is?"
 */
export type OutputReason =
  | 'ENFORCE_ACTIVE'          // state=ENFORCE → enforce
  | 'SHADOW_NORMAL'           // state=NORMAL/ELEVATED/VIOLATION → shadow
  | 'KS_FORCED_SHADOW'        // L1: kill-switch override → shadow
  | 'PROVIDER_UNHEALTHY';     // L2: provider outage → fail-open shadow

/**
 * State reason — why state changed or didn't change.
 * Answers: "why did/didn't the state transition?"
 */
export type StateReason =
  | 'ZONE_ESCALATION'
  | 'ZONE_DEESCALATION'
  | 'COMPLIANCE_VIOLATION'
  | 'COMPLIANCE_RESTORED'
  | 'PROVIDER_FAILURE_OVERRIDE'
  | 'KILL_SWITCH_OVERRIDE'
  | 'DWELL_NOT_MET'
  | 'FLIP_BUDGET_EXHAUSTED'
  | 'CONSECUTIVE_WINDOW_PENDING'
  | 'STEADY_STATE';

/** Combined reason codes — closed set, 10 state + 4 output */
export const ALL_STATE_REASONS: readonly StateReason[] = Object.freeze([
  'COMPLIANCE_RESTORED',
  'COMPLIANCE_VIOLATION',
  'CONSECUTIVE_WINDOW_PENDING',
  'DWELL_NOT_MET',
  'FLIP_BUDGET_EXHAUSTED',
  'KILL_SWITCH_OVERRIDE',
  'PROVIDER_FAILURE_OVERRIDE',
  'STEADY_STATE',
  'ZONE_DEESCALATION',
  'ZONE_ESCALATION',
]);

export const ALL_OUTPUT_REASONS: readonly OutputReason[] = Object.freeze([
  'ENFORCE_ACTIVE',
  'KS_FORCED_SHADOW',
  'PROVIDER_UNHEALTHY',
  'SHADOW_NORMAL',
]);


// ============================================================================
// Control Input — immutable, injected clock
// ============================================================================

/**
 * Input to evaluateAdaptive() pure function.
 * All fields readonly. nowMs injected — never Date.now().
 *
 * L2: providerHealthZone replaces raw SigmaZone for provider errors.
 *     3-level closed set is more actionable than continuous σ.
 */
export interface ControlInput {
  readonly sigmaZone: SigmaZone;
  readonly complianceVerdict: boolean;
  readonly providerHealthZone: ProviderHealthZone;
  readonly killSwitchActive: boolean;
  readonly nowMs: number;
}

// ============================================================================
// Persisted State — L5: full contract for deterministic replay
// ============================================================================

/**
 * Internal state carried between evaluations.
 * This is the "memory" of the state machine.
 *
 * L5: enteredAtMs, flipHistory, consecutiveCount — all explicit.
 */
export interface AdaptiveInternalState {
  /** Current state machine state */
  readonly currentState: AdaptiveState;
  /** Timestamp when current state was entered */
  readonly enteredAtMs: number;
  /** Timestamp of last transition (for dwell time) */
  readonly lastTransitionMs: number;
  /** Consecutive evaluation count in the same zone direction */
  readonly consecutiveCount: number;
  /** The zone seen in the last evaluation (for consecutive tracking) */
  readonly lastZone: SigmaZone;
  /** Flip timestamps within the current hour window (for budget) */
  readonly flipHistory: readonly number[];
  /** Whether an override (kill-switch or provider) is currently active */
  readonly overrideActive: boolean;
  /** The override source if active, null otherwise */
  readonly overrideSource: 'KILL_SWITCH' | 'PROVIDER_OUTAGE' | null;
}

/** Factory for initial state */
export function createInitialState(nowMs: number): AdaptiveInternalState {
  return Object.freeze({
    currentState: AdaptiveState.NORMAL,
    enteredAtMs: nowMs,
    lastTransitionMs: nowMs,
    consecutiveCount: 0,
    lastZone: 'NORMAL' as SigmaZone,
    flipHistory: Object.freeze([]) as readonly number[],
    overrideActive: false,
    overrideSource: null,
  });
}


// ============================================================================
// Config — all tunables, all with defaults
// ============================================================================

export interface AdaptiveConfig {
  /** Consecutive windows required for state transition (default: 3) */
  readonly consecutiveWindowsRequired: number;
  /** Minimum dwell time in ms before allowing transition (default: 300_000 = 5min) */
  readonly dwellTimeMs: number;
  /** Maximum state transitions per hour (default: 4) */
  readonly maxFlipsPerHour: number;
  /** σ-zone threshold for NORMAL→ELEVATED escalation (default: WARNING) */
  readonly escalationZoneThreshold: SigmaZone;
  /** σ-zone threshold for ELEVATED→VIOLATION escalation (default: ALERT) */
  readonly violationZoneThreshold: SigmaZone;
}

export const DEFAULT_ADAPTIVE_CONFIG: AdaptiveConfig = Object.freeze({
  consecutiveWindowsRequired: 3,
  dwellTimeMs: 300_000,
  maxFlipsPerHour: 4,
  escalationZoneThreshold: 'WARNING' as SigmaZone,
  violationZoneThreshold: 'ALERT' as SigmaZone,
});

// ============================================================================
// Control Output — L1 + L6: dual reason + override tracking
// ============================================================================

/**
 * Output of evaluateAdaptive().
 * Immutable (Object.freeze applied by the function).
 *
 * L1: overrideActive + effectiveState distinguish "system healthy" from "override forced"
 * L6: outputReason (why shadow/enforce) + stateReason (why state changed/didn't)
 */
export interface ControlOutput {
  /** The state machine state after evaluation */
  readonly state: AdaptiveState;
  /** The state before this evaluation */
  readonly previousState: AdaptiveState;
  /** Effective guard mode output */
  readonly guardMode: GuardMode;
  /** L6: why is guardMode what it is */
  readonly outputReason: OutputReason;
  /** L6: why did/didn't the state transition */
  readonly stateReason: StateReason;
  /** Whether a state transition occurred */
  readonly transitionOccurred: boolean;
  /** Remaining dwell time in ms (0 if satisfied) */
  readonly dwellTimeRemainingMs: number;
  /** Remaining flip budget for this hour */
  readonly flipBudgetRemaining: number;
  /** Evaluation timestamp (echoed from input) */
  readonly evaluatedAtMs: number;
  /** L1: whether an override is active */
  readonly overrideActive: boolean;
}


// ============================================================================
// Telemetry Events — L4: event list, not callback
// ============================================================================

/**
 * Telemetry event types emitted by evaluateAdaptive().
 * The function returns these; the caller publishes them.
 * No side effects inside the pure function.
 */
export type TelemetryEventType =
  | 'STATE_GAUGE'
  | 'TRANSITION_COUNT'
  | 'DWELL_TIME_OBSERVATION'
  | 'FLIP_BUDGET_GAUGE';

export interface TelemetryEvent {
  readonly type: TelemetryEventType;
  readonly labels: Readonly<Record<string, string>>;
  readonly value: number;
  readonly timestampMs: number;
}

// ============================================================================
// Step Result — the complete return type
// ============================================================================

/**
 * Complete return type of evaluateAdaptive().
 * Contains next state (for persistence), output (for consumers), and events (for telemetry).
 *
 * L3: evaluation order is codified in the implementation:
 *   1. Validate input
 *   2. Check precedence overrides (P0 kill-switch, P1 provider outage)
 *   3. Compute candidate state (zone-based transitions)
 *   4. Apply consecutive window guard
 *   5. Apply dwell time guard
 *   6. Apply flip budget guard
 *   7. Emit output + events
 */
export interface StepResult {
  readonly nextState: AdaptiveInternalState;
  readonly output: ControlOutput;
  readonly events: readonly TelemetryEvent[];
}

// ============================================================================
// Sigma Zone Severity — for zone comparison
// ============================================================================

export const SIGMA_ZONE_SEVERITY: Record<SigmaZone, number> = {
  NORMAL: 0,
  WARNING: 1,
  ALERT: 2,
  SPIKE: 3,
} as const;

// ============================================================================
// Validation Error Codes — closed set for input validation
// ============================================================================

export enum ValidationErrorCode {
  MISSING_SIGMA_ZONE = 'MISSING_SIGMA_ZONE',
  INVALID_SIGMA_ZONE = 'INVALID_SIGMA_ZONE',
  MISSING_COMPLIANCE_VERDICT = 'MISSING_COMPLIANCE_VERDICT',
  MISSING_PROVIDER_HEALTH_ZONE = 'MISSING_PROVIDER_HEALTH_ZONE',
  INVALID_PROVIDER_HEALTH_ZONE = 'INVALID_PROVIDER_HEALTH_ZONE',
  MISSING_KILL_SWITCH = 'MISSING_KILL_SWITCH',
  INVALID_NOW_MS = 'INVALID_NOW_MS',
}

export class AdaptiveValidationError extends Error {
  constructor(
    public readonly code: ValidationErrorCode,
    message: string,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'AdaptiveValidationError';
  }
}
