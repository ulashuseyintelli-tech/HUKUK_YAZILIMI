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
import { LRUCache } from 'lru-cache';
import { DiagnosticsAuditService } from '../diagnostics-audit.service';
import { SimulationMetricsService } from './simulation-metrics.service';
import {
  SimulationAuditEvent,
  buildAuditIdempotencyKey,
} from './simulation-audit.types';

// ============================================================================
// seenKeys cache config — bounded to prevent OOM (F13 fix)
// ============================================================================

const SEEN_KEYS_MAX = 50_000;
const SEEN_KEYS_TTL = 86_400_000; // 24 hours in ms

@Injectable()
export class SimulationAuditAdapter {
  private readonly logger = new Logger(SimulationAuditAdapter.name);

  /** Seen idempotency keys — bounded LRU cache (max=50k, ttl=24h) */
  private readonly seenKeys = new LRUCache<string, true>({
    max: SEEN_KEYS_MAX,
    ttl: SEEN_KEYS_TTL,
  });

  constructor(
    private readonly auditService: DiagnosticsAuditService,
    private readonly metrics: SimulationMetricsService,
  ) {}

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
    this.seenKeys.set(key, true);

    try {
      // Delegate to existing audit service using logAccessAttempt
      const result = this.auditService.logAccessAttempt(
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

      // Async safety: if logAccessAttempt returns a Promise, catch rejections
      if (result && typeof (result as any).catch === 'function') {
        (result as any).catch((err: Error) => {
          this.metrics.incAuditWriteFailed();
          this.logger.warn('[SimulationAudit] Async write failed (fire-and-forget)', {
            key,
            eventType: event.eventType,
            incidentId: event.incidentId,
            error: err.message,
          });
        });
      }
    } catch (err) {
      // Fire-and-forget: audit failure must not block promote/escalation
      this.metrics.incAuditWriteFailed();
      this.logger.warn('[SimulationAudit] Write failed (fire-and-forget)', {
        key,
        eventType: event.eventType,
        incidentId: event.incidentId,
        error: (err as Error).message,
      });
    }
  }
}
