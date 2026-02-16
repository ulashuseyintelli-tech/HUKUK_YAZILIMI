/**
 * GuardTelemetry — Bounded Best-Effort Telemetry Adapter
 *
 * Operational Guard Phase — Task 6.0
 *
 * Contract:
 *   - emitDecision(): void — synchronous, fire-and-forget
 *   - throw ⇒ swallow at call site (interceptor try/catch)
 *   - guard kararını rehin alamaz
 *   - HOLD/BLOCK_503/ALLOW/DEGRADE tüm kararlar için çağrılır
 *
 * Cardinality policy:
 *   - Metrics labels: decision, operation, mode (bounded enums)
 *   - tenantId, reasonCodes, riskContextHash → log/audit only
 *
 * @see .kiro/specs/operational-guard-phase/design.md — D4.6
 * @see .kiro/specs/operational-guard-phase/requirements.md — R4, R5, R8
 */

import { GuardDecision, GuardOperation } from './guard-policy-resolver.types';
import type { GuardMode } from './guard-policy-resolver.types';

// ============================================================================
// Telemetry Event
// ============================================================================

/** Immutable event emitted for every guard decision */
export interface GuardTelemetryEvent {
  readonly tenantId: string;
  readonly operation: GuardOperation;
  readonly decision: GuardDecision;
  readonly mode: string | null;
  readonly reasonCodes: readonly string[];
  readonly policyVersion: string;
  readonly evaluatedAtMs: number;
  readonly riskContextHash: string;
  /** Guard mode — 'shadow' | 'enforce' (disabled → no event emitted) */
  readonly guardMode: GuardMode;
  /**
   * Would this decision have been enforced?
   * true if decision === BLOCK_503 || decision === HOLD
   * NR-1: derived from same snapshot, no second evaluation
   */
  readonly wouldEnforce: boolean;
  /**
   * Snapshot compute duration in milliseconds.
   * Measured in interceptor: performance.now() around factory.createSnapshot().
   * Source metric for guard_snapshot_duration_seconds_bucket{guardMode}.
   * A7 alert depends on this value.
   */
  readonly snapshotDurationMs: number;
}

// ============================================================================
// Telemetry Interface
// ============================================================================

/**
 * Guard telemetry adapter.
 *
 * Implementations MUST NOT block. If async work is needed (e.g. remote
 * audit), it must be fire-and-forget inside the implementation.
 */
export interface GuardTelemetry {
  emitDecision(event: GuardTelemetryEvent): void;
}

// ============================================================================
// Noop Implementation (production default until Prometheus wired)
// ============================================================================

/** Does nothing. Safe default for DI when no telemetry backend is configured. */
export class NoopGuardTelemetry implements GuardTelemetry {
  emitDecision(_event: GuardTelemetryEvent): void {
    // intentionally empty
  }
}

// ============================================================================
// In-Memory Implementation (testing)
// ============================================================================

/** Captures events in memory for test assertions. */
export class InMemoryGuardTelemetry implements GuardTelemetry {
  readonly events: GuardTelemetryEvent[] = [];

  emitDecision(event: GuardTelemetryEvent): void {
    this.events.push(event);
  }

  /** Reset captured events */
  clear(): void {
    this.events.length = 0;
  }
}

// ============================================================================
// Throwing Implementation (testing — verifies swallow behavior)
// ============================================================================

/** Always throws. Used to verify interceptor swallows telemetry errors. */
export class ThrowingGuardTelemetry implements GuardTelemetry {
  emitDecision(_event: GuardTelemetryEvent): void {
    throw new Error('Telemetry failure — simulated');
  }
}
