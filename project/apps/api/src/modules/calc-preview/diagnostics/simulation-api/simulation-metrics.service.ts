/**
 * Simulation Metrics Service
 *
 * Sprint 3 - Task 1.3
 *
 * Prometheus counters for promote, drift, escalation observability.
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md
 */

import { Injectable } from '@nestjs/common';

// ============================================================================
// Counter wrapper (prom-client agnostic for now)
// ============================================================================

interface CounterLike {
  inc(labels?: Record<string, string>, value?: number): void;
}

function createCounter(name: string, help: string, labelNames: string[] = []): CounterLike {
  // TODO: Replace with prom-client Counter once @nestjs/prometheus or prom-client is wired
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

  // ── Guard tripwire metrics (Task 6.2) ─────────────────────────────

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
  private readonly killSwitchStateGauge = createCounter(
    'kill_switch_state',
    'Kill-switch state (1=active, 0=inactive)',
    ['tenant', 'operation'],
  );

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

  // ── Guard tripwire methods (Task 6.2) ─────────────────────────────

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
   * NOT free-form reasonCodes (cardinality risk).
   */
  incGuardHold(reason: string): void {
    this.guardHoldTotal.inc({ reason });
  }

  setKillSwitchState(tenant: string, operation: string, active: boolean): void {
    this.killSwitchStateGauge.inc({ tenant, operation }, active ? 1 : 0);
  }
}
