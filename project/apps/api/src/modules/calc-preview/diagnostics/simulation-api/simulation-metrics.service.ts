/**
 * Simulation Metrics Service
 *
 * Sprint 3 - Task 1.3 → I0 Metrics Runway refactor
 *
 * I0 scope metrics (prom-client):
 *   - simulation_drift_total{type, operation, guardMode}
 *   - drift_provider_errors_total{operation, guardMode}
 *   - kill_switch_state{tenant, operation}
 *
 * Non-I0 metrics remain as stub counters — will be migrated in later iterations.
 *
 * @see .kiro/specs/i0-metrics-runway/design.md
 * @see .kiro/specs/sprint-3-deploy-ready/design.md
 */

import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { Counter, Gauge, Registry } from 'prom-client';
import { DRIFT_TYPE_VALUES } from './guards/drift-guard.types';

// ============================================================================
// Stub counter wrapper (non-I0 metrics — prom-client migration deferred)
// ============================================================================

interface CounterLike {
  inc(labels?: Record<string, string>, value?: number): void;
}

function createCounter(name: string, help: string, labelNames: string[] = []): CounterLike {
  let _total = 0;
  return {
    inc(_labels?: Record<string, string>, value = 1) {
      _total += value;
    },
  };
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class SimulationMetricsService {
  private readonly logger = new Logger(SimulationMetricsService.name);

  /** Closed-set whitelist for type label — SD-1 DriftType enum */
  private static readonly ALLOWED_DRIFT_TYPES: ReadonlySet<string> = new Set(
    DRIFT_TYPE_VALUES as readonly string[],
  );

  // ── Non-I0 stub counters (unchanged) ─────────────────────────────

  private readonly promoteSuccessTotal = createCounter(
    'promote_success_total',
    'Total successful promote requests',
  );
  private readonly promoteFailureTotal = createCounter(
    'promote_failure_total',
    'Total failed promote requests',
    ['reason'],
  );
  private readonly driftDetectedTotal = createCounter(
    'drift_detected_total',
    'Total drift-detected promote blocks',
    ['incidentId'],
  );
  private readonly escalationChurnTotal = createCounter(
    'escalation_churn_total',
    'Total escalation level transitions',
    ['incidentId', 'direction'],
  );
  private readonly escalationStateConflictTotal = createCounter(
    'escalation_state_conflict_total',
    'Total CAS conflicts on escalation state',
  );
  private readonly auditWriteFailedTotal = createCounter(
    'audit_write_failed_total',
    'Total audit write failures (fire-and-forget)',
  );
  private readonly phase7EvaluationsTotal = createCounter(
    'phase7_evaluations_total',
    'Total Phase-7 drift evaluations',
  );
  private readonly phase7BlocksTotal = createCounter(
    'phase7_blocks_total',
    'Total Phase-7 blocks',
    ['reason'],
  );
  private readonly phase7FaultsTotal = createCounter(
    'phase7_faults_total',
    'Total Phase-7 faults (F6/F7)',
    ['fault'],
  );

  // ── Non-I0 stub tripwire counters (unchanged) ────────────────────

  private readonly dbWriteTimeoutTotal = createCounter(
    'db_write_timeout_total',
    'Total DB write timeouts',
  );
  private readonly dbReadTimeoutTotal = createCounter(
    'db_read_timeout_total',
    'Total DB read timeouts',
  );
  private readonly guardHoldTotal = createCounter(
    'escalation_evaluate_hold_total',
    'Total guard-forced HOLD decisions',
    ['reason'],
  );

  // ── I0 prom-client metrics ───────────────────────────────────────

  private readonly simulationDriftTotal: Counter;
  private readonly driftProviderErrorsTotal: Counter;
  private readonly killSwitchStateGauge: Gauge;

  constructor(@Inject('PROM_REGISTRY') @Optional() registry?: Registry) {
    const reg = registry ?? new Registry();

    this.simulationDriftTotal = new Counter({
      name: 'simulation_drift_total',
      help: 'Total runtime drift detections',
      labelNames: ['type', 'operation', 'guardMode'],
      registers: [reg],
    });

    this.driftProviderErrorsTotal = new Counter({
      name: 'drift_provider_errors_total',
      help: 'Total DriftInputProvider failures (exception caught at factory)',
      labelNames: ['operation', 'guardMode'],
      registers: [reg],
    });

    this.killSwitchStateGauge = new Gauge({
      name: 'kill_switch_state',
      help: 'Kill-switch state (1=active, 0=inactive)',
      labelNames: ['tenant', 'operation'],
      registers: [reg],
    });
  }

  // ── Non-I0 methods (unchanged) ───────────────────────────────────

  incPromoteSuccess(): void {
    this.promoteSuccessTotal.inc();
  }

  incPromoteFailure(reason: string): void {
    this.promoteFailureTotal.inc({ reason });
  }

  incDriftDetected(incidentId: string): void {
    this.driftDetectedTotal.inc({ incidentId });
  }

  incEscalationChurn(incidentId: string, direction: 'up' | 'down'): void {
    this.escalationChurnTotal.inc({ incidentId, direction });
  }

  incEscalationStateConflict(): void {
    this.escalationStateConflictTotal.inc();
  }

  incAuditWriteFailed(): void {
    this.auditWriteFailedTotal.inc();
  }

  incPhase7Evaluation(): void {
    this.phase7EvaluationsTotal.inc();
  }

  incPhase7Block(reason: 'DRIFT' | 'FEATURE_DISABLED'): void {
    this.phase7BlocksTotal.inc({ reason });
  }

  incPhase7Fault(fault: 'F6' | 'F7'): void {
    this.phase7FaultsTotal.inc({ fault });
  }

  incDbWriteTimeout(): void {
    this.dbWriteTimeoutTotal.inc();
  }

  incDbReadTimeout(): void {
    this.dbReadTimeoutTotal.inc();
  }

  /**
   * Increment guard HOLD counter.
   * reason label: bounded enum — DEGRADED | STALE_FAILSAFE | MISSING_SIGNALS |
   *   INSUFFICIENT_SIGNALS | THRESHOLD_BREACH | UNKNOWN
   */
  incGuardHold(reason: string): void {
    this.guardHoldTotal.inc({ reason });
  }

  // ── I0 prom-client methods ───────────────────────────────────────

  /**
   * Set kill-switch state gauge.
   */
  setKillSwitchState(tenant: string, operation: string, active: boolean): void {
    this.killSwitchStateGauge.set({ tenant, operation }, active ? 1 : 0);
  }

  /**
   * Increment simulation drift counter.
   * Called by interceptor when reasonCodes contain DRIFT:* prefix.
   * Labels: type (DriftType enum), operation, guardMode — all bounded.
   *
   * Runtime whitelist: type ∉ DriftType → warning log + skip (no metric pollution).
   * Gating rule: DRIFT_PROVIDER_ERROR does NOT trigger this counter.
   * DRIFT_PROVIDER_ERROR starts with 'DRIFT_', not 'DRIFT:' — excluded by prefix check.
   */
  incSimulationDrift(type: string, operation: string, guardMode: string): void {
    if (!SimulationMetricsService.ALLOWED_DRIFT_TYPES.has(type)) {
      this.logger.warn(
        `incSimulationDrift called with unknown type="${type}" — skipping metric. Allowed: ${[...SimulationMetricsService.ALLOWED_DRIFT_TYPES].join(', ')}`,
      );
      return;
    }
    this.simulationDriftTotal.inc({ type, operation, guardMode });
  }

  /**
   * Increment drift provider error counter.
   * Called by interceptor when reasonCodes contain DRIFT_PROVIDER_ERROR.
   * Separate from simulation_drift_total — provider error is pipeline health, not structural drift.
   */
  incDriftProviderError(operation: string, guardMode: string): void {
    this.driftProviderErrorsTotal.inc({ operation, guardMode });
  }
}
