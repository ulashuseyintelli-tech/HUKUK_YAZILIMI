/**
 * Phase-7 Config Snapshot
 *
 * Immutable config captured once per request lifecycle.
 * Prevents config nondeterminism (D8.2 risk mitigation).
 *
 * Rules:
 * - capturePhase7Config() called ONCE at pipeline entry
 * - Passed as param to calculateDrift / fetchFreshSnapshot
 * - Never re-read mid-request
 *
 * @see .kiro/specs/fault-injection-harness/design.md — D8
 */

import { DRIFT_THRESHOLD } from '../evidence/drift-utils';

// ============================================================================
// Config Snapshot
// ============================================================================

export interface Phase7ConfigSnapshot {
  /** Drift threshold — frozen at request start */
  readonly driftThreshold: number;
  /** Phase-7 drift detection enabled */
  readonly phase7Enabled: boolean;
  /** ISO timestamp when config was captured */
  readonly capturedAt: string;
}

// ============================================================================
// Env Keys
// ============================================================================

export const PHASE7_ENV_KEYS = {
  PHASE7_ENABLED: 'PHASE7_ENABLED',
  DRIFT_THRESHOLD_OVERRIDE: 'DRIFT_THRESHOLD_OVERRIDE',
} as const;

// ============================================================================
// Capture (once per request)
// ============================================================================

/**
 * Capture Phase-7 config snapshot — immutable for request lifetime.
 *
 * @param now - Injected timestamp for determinism (no Date.now())
 */
export function capturePhase7Config(now: Date): Phase7ConfigSnapshot {
  const thresholdOverride = process.env[PHASE7_ENV_KEYS.DRIFT_THRESHOLD_OVERRIDE];
  const parsedThreshold = thresholdOverride ? parseFloat(thresholdOverride) : NaN;

  return {
    driftThreshold: Number.isFinite(parsedThreshold) ? parsedThreshold : DRIFT_THRESHOLD,
    phase7Enabled: process.env[PHASE7_ENV_KEYS.PHASE7_ENABLED] !== 'false',
    capturedAt: now.toISOString(),
  };
}
