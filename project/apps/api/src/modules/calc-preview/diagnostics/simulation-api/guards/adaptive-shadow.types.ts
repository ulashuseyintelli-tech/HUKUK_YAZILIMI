/**
 * Adaptive Shadow Wiring — Shared Types
 *
 * SD-2.5 Task 0: Interface + DI skeleton
 *
 * Closed-set error codes for guard_adaptive_eval_errors_total{code}.
 * R3-AC4: only these 3 values are valid. No free-text error labels.
 *
 * @see .kiro/specs/sd-25-adaptive-shadow-wiring/requirements.md — R3-AC4
 * @see .kiro/specs/sd-25-adaptive-shadow-wiring/design.md — D4
 */

// ============================================================================
// Error Codes — closed-set (R3-AC4)
// ============================================================================

export type AdaptiveShadowErrorCode =
  | 'EVALUATION_EXCEPTION'
  | 'INPUT_VALIDATION_FAILED'
  | 'STATE_STORE_ERROR'
  | 'REAL_MAPPER_UNAVAILABLE';

export const ALL_SHADOW_ERROR_CODES: readonly AdaptiveShadowErrorCode[] = Object.freeze([
  'EVALUATION_EXCEPTION',
  'INPUT_VALIDATION_FAILED',
  'STATE_STORE_ERROR',
  'REAL_MAPPER_UNAVAILABLE',
]);

// ============================================================================
// Override Source label normalization (R6-AC1)
// ============================================================================

/**
 * Metric label value for overrideSource.
 * null → 'NONE' (never null in metric labels).
 */
export type OverrideSourceLabel = 'KILL_SWITCH' | 'PROVIDER_OUTAGE' | 'NONE';

export function normalizeOverrideSource(
  source: 'KILL_SWITCH' | 'PROVIDER_OUTAGE' | null,
): OverrideSourceLabel {
  return source ?? 'NONE';
}
