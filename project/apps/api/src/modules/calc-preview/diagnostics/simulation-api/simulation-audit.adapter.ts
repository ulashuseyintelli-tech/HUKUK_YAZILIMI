/**
 * Simulation Audit Adapter
 *
 * Sprint 3 - Task 7.1
 *
 * Wraps DiagnosticsAuditService with simulation-specific event types
 * and composite idempotency key duplicate suppression.
 *
 * Idempotency key: (event_type + incident_id + run_id + request_id)
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { DiagnosticsAuditService } from '../diagnostics-audit.service';
import {
  SimulationAuditEvent,
  buildAuditIdempotencyKey,
} from './simulation-audit.types';

@Injectable()
export class SimulationAuditAdapter {
  private readonly logger = new Logger(SimulationAuditAdapter.name);

  /** Seen idempotency keys — duplicate suppression */
  private readonly seenKeys = new Set<string>();

  constructor(private readonly auditService: DiagnosticsAuditService) {}

  /**
   * Log a simulation lifecycle event.
   * Duplicate events (same composite key) are silently suppressed.
   * Audit write failures are fire-and-forget (do not block caller).
   */
  logSimulationEvent(event: SimulationAuditEvent): void {
    const key = buildAuditIdempotencyKey(event);

    if (this.seenKeys.has(key)) {
      this.logger.debug('[SimulationAudit] Duplicate suppressed', { key });
      return;
    }
    this.seenKeys.add(key);

    try {
      // Delegate to existing audit service using logAccessAttempt
      this.auditService.logAccessAttempt(
        /* ctx */ {
          tenantId: '',
          userId: event.actorId,
          role: 'internal-ops',
        } as any,
        /* action */ event.eventType,
        /* resourceType */ 'trace',
        /* resourceId */ event.incidentId,
        /* allowed */ true,
        /* reason */ event.detail,
      );
    } catch (err) {
      // Fire-and-forget: audit failure must not block promote/escalation
      this.logger.warn('[SimulationAudit] Write failed (fire-and-forget)', {
        eventType: event.eventType,
        error: (err as Error).message,
      });
    }
  }
}
