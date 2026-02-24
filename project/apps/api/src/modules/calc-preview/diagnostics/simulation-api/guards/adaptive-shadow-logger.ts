/**
 * AdaptiveShadowLogger — Structured Log Adapter Interface
 *
 * SD-2.5 Task 3: Structured logging for shadow evaluation
 *
 * Contract:
 *   - One structured log line per evaluation (debug level) — R7-AC1
 *   - Fields: prevState, nextState, guardMode, outputReason, stateReason,
 *     overrideActive, sigmaZone, tenantId, operation — R7-AC2
 *   - No PII — R7-AC3
 *   - All reason values from closed-set enums — R7-AC4
 *
 * @see .kiro/specs/sd-25-adaptive-shadow-wiring/requirements.md — R7
 * @see .kiro/specs/sd-25-adaptive-shadow-wiring/design.md — D5
 */

import type { ControlOutput } from './adaptive-controller.types';
import type { GuardOperation } from './guard-policy-resolver.types';

// ============================================================================
// Log Entry (for testing capture)
// ============================================================================

export interface AdaptiveShadowLogEntry {
  readonly prevState: string;
  readonly nextState: string;
  readonly guardMode: string;
  readonly outputReason: string;
  readonly stateReason: string;
  readonly overrideActive: boolean;
  readonly sigmaZone: string;
  readonly tenantId: string;
  readonly operation: string;
}

// ============================================================================
// Interface
// ============================================================================

export interface AdaptiveShadowLogger {
  logEvaluation(
    output: ControlOutput,
    tenantId: string,
    operation: GuardOperation,
    sigmaZone: string,
  ): void;
}

// ============================================================================
// Noop Implementation (production default)
// ============================================================================

export class NoopAdaptiveShadowLogger implements AdaptiveShadowLogger {
  logEvaluation(
    _output: ControlOutput,
    _tenantId: string,
    _operation: GuardOperation,
    _sigmaZone: string,
  ): void {
    // intentionally empty
  }
}

// ============================================================================
// In-Memory Implementation (testing)
// ============================================================================

export class InMemoryAdaptiveShadowLogger implements AdaptiveShadowLogger {
  readonly entries: AdaptiveShadowLogEntry[] = [];

  logEvaluation(
    output: ControlOutput,
    tenantId: string,
    operation: GuardOperation,
    sigmaZone: string,
  ): void {
    this.entries.push({
      prevState: output.previousState,
      nextState: output.state,
      guardMode: output.guardMode,
      outputReason: output.outputReason,
      stateReason: output.stateReason,
      overrideActive: output.overrideActive,
      sigmaZone,
      tenantId,
      operation,
    });
  }

  clear(): void {
    this.entries.length = 0;
  }
}
