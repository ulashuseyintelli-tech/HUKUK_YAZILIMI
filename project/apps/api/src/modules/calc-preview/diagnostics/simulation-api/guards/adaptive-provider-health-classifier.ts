/**
 * ProviderHealthClassifier — Pure Function
 *
 * SD-3 D3 Task 1: Provider error rate → ProviderHealthZone classification
 *
 * Pure function: same input → same output, no side-effects.
 * O(1) time complexity — threshold comparison only.
 *
 * Classification rules (R3-AC1):
 *   errorRate ≤ 0                                    → OK (defensive: negative input)
 *   0 < errorRate ≤ providerDegradedThreshold        → OK
 *   providerDegradedThreshold < errorRate ≤ providerOutageThreshold → DEGRADED
 *   errorRate > providerOutageThreshold              → OUTAGE
 *
 * Invariant: providerDegradedThreshold ≤ providerOutageThreshold
 *
 * Edge case: If degradedThreshold == outageThreshold, the DEGRADED band
 * collapses; classification becomes OK up to threshold, OUTAGE above.
 *
 * Import direction: this file → adaptive-controller.types.ts (read-only)
 * FORBIDDEN: adaptive-controller.ts → this file
 *
 * @see .kiro/specs/sd-3-adaptive-transition/requirements.md — R3
 * @see .kiro/specs/sd-3-adaptive-transition/design.md — B1, P3
 */

import { ProviderHealthZone } from './adaptive-controller.types';

// ============================================================================
// Config
// ============================================================================

export interface ProviderHealthClassifierConfig {
  /** DEGRADED threshold (error rate). TBD — staging sonrası kalibre edilecek */
  readonly providerDegradedThreshold: number;
  /** OUTAGE threshold (error rate). TBD — staging sonrası kalibre edilecek */
  readonly providerOutageThreshold: number;
}

// ============================================================================
// Pure Function
// ============================================================================

/**
 * Classifies provider error rate into a closed-set ProviderHealthZone.
 *
 * @param errorRate - Provider error rate (precomputed, bounded)
 * @param config - Threshold configuration
 * @returns ProviderHealthZone enum member (OK | DEGRADED | OUTAGE)
 */
export function classifyProviderHealth(
  errorRate: number,
  config: ProviderHealthClassifierConfig,
): ProviderHealthZone {
  if (errorRate <= 0) return ProviderHealthZone.OK;
  if (errorRate > config.providerOutageThreshold) return ProviderHealthZone.OUTAGE;
  if (errorRate > config.providerDegradedThreshold) return ProviderHealthZone.DEGRADED;
  return ProviderHealthZone.OK;
}
