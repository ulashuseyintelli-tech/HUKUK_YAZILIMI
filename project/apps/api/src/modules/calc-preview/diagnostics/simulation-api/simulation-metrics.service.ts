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
}
