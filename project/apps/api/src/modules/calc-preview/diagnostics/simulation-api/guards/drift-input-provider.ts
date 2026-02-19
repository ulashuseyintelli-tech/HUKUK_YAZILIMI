/**
 * DriftInputProvider — Impure drift input source
 *
 * SD-1 Drift Guard Wiring — Task 4.1
 *
 * Abstracts drift input retrieval for DI and testability.
 * Provider is impure — may read from config store, headers, configmap.
 *
 * Provider rules (D2.1):
 *   - MUST NOT truncate or default-fill fields
 *   - Missing field → undefined → evaluateDrift fail-closed
 *   - Exception → caught at factory level (DRIFT_PROVIDER_ERROR)
 *
 * @see .kiro/specs/sd-1-drift-guard-wiring/design.md — D2.1, D2.4
 */

import type { DriftInput } from './drift-guard.types';
import type { GuardOperation } from './guard-policy-resolver.types';

// ============================================================================
// Interface
// ============================================================================

/**
 * Provides drift input for evaluateDrift().
 * Called ONCE per request (snapshot semantics).
 */
export interface DriftInputProvider {
  getDriftInput(tenantId: string, operation: GuardOperation, nowMs: number): DriftInput;
}

// ============================================================================
// Noop Implementation (default — no drift input available)
// ============================================================================

/**
 * Returns minimal DriftInput with no optional fields.
 * evaluateDrift will fail-closed (DRIFT_INPUT_MISSING) if driftGuardEnabled=true.
 * Safe default for DI when no real provider is configured.
 */
export class NoopDriftInputProvider implements DriftInputProvider {
  getDriftInput(tenantId: string, operation: GuardOperation, nowMs: number): DriftInput {
    return { tenantId, operation, policyVersion: '0.0.0', nowMs };
  }
}

// ============================================================================
// Static Implementation (testing)
// ============================================================================

/**
 * Returns a fixed DriftInput. Useful for testing specific drift scenarios.
 */
export class StaticDriftInputProvider implements DriftInputProvider {
  constructor(private readonly input: DriftInput) {}

  getDriftInput(_tenantId: string, _operation: GuardOperation, _nowMs: number): DriftInput {
    return this.input;
  }
}
