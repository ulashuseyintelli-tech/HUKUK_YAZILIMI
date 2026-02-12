/**
 * Simulation Audit Types
 *
 * Sprint 3 - Task 1.1
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md
 */

// ============================================================================
// Audit Action Enum
// ============================================================================

export type SimulationAuditAction =
  | 'SIMULATION_STARTED'
  | 'SIMULATION_COMPLETED'
  | 'SIMULATION_FAILED'
  | 'PROMOTE_REQUESTED'
  | 'PROMOTE_ACCEPTED'
  | 'PROMOTE_DRIFT_BLOCKED'
  | 'ESCALATION_TRIGGERED'
  | 'DEESCALATION_TRIGGERED'
  | 'ESCALATION_STATE_CONFLICT';

// ============================================================================
// Audit Event
// ============================================================================

export interface SimulationAuditEvent {
  /** UUID — used for idempotency */
  eventId: string;
  eventType: SimulationAuditAction;
  /** ISO 8601 */
  timestamp: string;
  actorId: string;
  incidentId: string;
  /** Optional run / request context */
  runId?: string;
  requestId?: string;
  /** Extra detail (error message, drift score, etc.) */
  detail?: string;
}

/**
 * Idempotency key composition:
 *   event_type + incident_id + run_id + request_id
 *
 * Used by SimulationAuditAdapter for duplicate suppression.
 */
export function buildAuditIdempotencyKey(event: SimulationAuditEvent): string {
  return [
    event.eventType,
    event.incidentId,
    event.runId ?? '',
    event.requestId ?? '',
  ].join(':');
}
