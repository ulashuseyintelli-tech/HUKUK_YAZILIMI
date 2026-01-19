/**
 * CrossTenantAuditService
 * 
 * Service for emitting cross-tenant access audit events.
 * All break-glass lifecycle events flow through this service.
 * 
 * INV-3: All grants audited - every lifecycle event produces an immutable audit record
 * 
 * FAIL-SAFE BEHAVIOR:
 * - Audit write failures are tracked with metrics
 * - Consecutive failures trigger DEGRADED mode
 * - In DEGRADED mode, break-glass operations return 503
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CrossTenantAuditEvent,
  CrossTenantEventType,
  BreakGlassRequest,
  BreakGlassGrant,
  BreakGlassReason,
} from '../../break-glass.types';
import {
  ICrossTenantAuditRepository,
  CROSS_TENANT_AUDIT_REPOSITORY,
} from './cross-tenant-audit.repository';

/**
 * Audit health status
 */
export type AuditHealthStatus = 'HEALTHY' | 'DEGRADED';

/**
 * Audit metrics for observability
 */
export interface AuditMetrics {
  /** Total audit events emitted */
  totalEmitted: number;
  /** Total audit write failures */
  totalFailed: number;
  /** Consecutive failures (resets on success) */
  consecutiveFailures: number;
  /** Last failure timestamp */
  lastFailureAt?: string;
  /** Last success timestamp */
  lastSuccessAt?: string;
  /** Current health status */
  status: AuditHealthStatus;
}

/**
 * Configuration for audit failure handling
 */
export interface AuditFailureConfig {
  /** Max consecutive failures before DEGRADED mode */
  maxConsecutiveFailures: number;
  /** Window in ms for failure rate calculation */
  failureWindowMs: number;
}

const DEFAULT_FAILURE_CONFIG: AuditFailureConfig = {
  maxConsecutiveFailures: 3,
  failureWindowMs: 60_000, // 1 minute
};

/**
 * Context for audit event creation
 */
export interface AuditContext {
  ip: string;
  userAgent?: string;
  correlationId: string;
  traceId?: string;
}

/**
 * Payload for REQUESTED event
 */
export interface RequestedEventPayload {
  request: BreakGlassRequest;
  context: AuditContext;
}

/**
 * Payload for GRANTED event
 */
export interface GrantedEventPayload {
  request: BreakGlassRequest;
  grant: BreakGlassGrant;
  context: AuditContext;
}

/**
 * Payload for DENIED event
 */
export interface DeniedEventPayload {
  request: BreakGlassRequest;
  denialReason?: string;
  context: AuditContext;
}

/**
 * Payload for USED event
 */
export interface UsedEventPayload {
  grant: BreakGlassGrant;
  resourceScope: string;
  resourceIds?: string[];
  context: AuditContext;
}

/**
 * Payload for EXPIRED event
 */
export interface ExpiredEventPayload {
  grant: BreakGlassGrant;
}

/**
 * Payload for REVOKED event
 */
export interface RevokedEventPayload {
  grant: BreakGlassGrant;
  revokedBy: string;
  revocationReason?: string;
  context: AuditContext;
}

@Injectable()
export class CrossTenantAuditService {
  private readonly logger = new Logger(CrossTenantAuditService.name);
  
  /** Metrics tracking */
  private metrics: AuditMetrics = {
    totalEmitted: 0,
    totalFailed: 0,
    consecutiveFailures: 0,
    status: 'HEALTHY',
  };
  
  /** Failure configuration */
  private readonly failureConfig: AuditFailureConfig;

  constructor(
    @Inject(CROSS_TENANT_AUDIT_REPOSITORY)
    private readonly repository: ICrossTenantAuditRepository,
    failureConfig?: AuditFailureConfig,
  ) {
    this.failureConfig = failureConfig || DEFAULT_FAILURE_CONFIG;
  }

  /**
   * Get current audit health status
   * 
   * Used by guards to determine if break-glass should be available
   */
  getHealthStatus(): AuditHealthStatus {
    return this.metrics.status;
  }

  /**
   * Get current metrics for observability
   */
  getMetrics(): Readonly<AuditMetrics> {
    return { ...this.metrics };
  }

  /**
   * Check if audit system is healthy (for guards)
   */
  isHealthy(): boolean {
    return this.metrics.status === 'HEALTHY';
  }

  /**
   * Emit CROSS_TENANT_ACCESS_REQUESTED event
   */
  async emitRequested(payload: RequestedEventPayload): Promise<void> {
    const event = this.createBaseEvent(
      'CROSS_TENANT_ACCESS_REQUESTED',
      payload.request,
      payload.context,
    );
    event.outcome = 'ALLOWED'; // Request creation is always "allowed"
    
    await this.emit(event);
  }

  /**
   * Emit CROSS_TENANT_ACCESS_GRANTED event
   */
  async emitGranted(payload: GrantedEventPayload): Promise<void> {
    const event = this.createBaseEvent(
      'CROSS_TENANT_ACCESS_GRANTED',
      payload.request,
      payload.context,
    );
    event.grantId = payload.grant.grantId;
    event.approverId = payload.grant.approverId;
    event.outcome = 'ALLOWED';
    event.metadata = {
      grantedScopes: payload.grant.grantedScopes,
      expiresAt: payload.grant.expiresAt,
      maxRenewals: payload.grant.maxRenewals,
    };
    
    await this.emit(event);
  }

  /**
   * Emit CROSS_TENANT_ACCESS_DENIED event
   */
  async emitDenied(payload: DeniedEventPayload): Promise<void> {
    const event = this.createBaseEvent(
      'CROSS_TENANT_ACCESS_DENIED',
      payload.request,
      payload.context,
    );
    event.outcome = 'DENIED';
    event.metadata = {
      denialReason: payload.denialReason,
    };
    
    await this.emit(event);
  }

  /**
   * Emit CROSS_TENANT_ACCESS_USED event
   */
  async emitUsed(payload: UsedEventPayload): Promise<void> {
    const event: CrossTenantAuditEvent = {
      eventId: randomUUID(),
      eventType: 'CROSS_TENANT_ACCESS_USED',
      requestId: payload.grant.requestId,
      grantId: payload.grant.grantId,
      requesterId: '', // Will be filled from grant metadata if available
      approverId: payload.grant.approverId,
      targetTenantId: payload.grant.targetTenantId,
      resourceScope: payload.resourceScope,
      reason: {
        category: 'UNKNOWN', // Not available in grant, would need lookup
        ticketRef: 'UNKNOWN',
      },
      network: payload.context.userAgent
        ? { ip: payload.context.ip, userAgent: payload.context.userAgent }
        : { ip: payload.context.ip },
      authType: 'BREAK_GLASS_TOKEN',
      timestamp: new Date().toISOString(),
      outcome: 'ALLOWED',
      correlationId: payload.context.correlationId,
      ...(payload.context.traceId && { traceId: payload.context.traceId }),
      metadata: {
        resourceIds: payload.resourceIds,
        renewalsLeft: payload.grant.maxRenewals - payload.grant.renewalCount,
      },
    };
    
    await this.emit(event);
  }

  /**
   * Emit CROSS_TENANT_ACCESS_EXPIRED event
   */
  async emitExpired(payload: ExpiredEventPayload): Promise<void> {
    const event: CrossTenantAuditEvent = {
      eventId: randomUUID(),
      eventType: 'CROSS_TENANT_ACCESS_EXPIRED',
      requestId: payload.grant.requestId,
      grantId: payload.grant.grantId,
      requesterId: '',
      approverId: payload.grant.approverId,
      targetTenantId: payload.grant.targetTenantId,
      reason: {
        category: 'SYSTEM',
        ticketRef: 'AUTO_EXPIRE',
      },
      network: {
        ip: 'system',
      },
      authType: 'SYSTEM',
      timestamp: new Date().toISOString(),
      outcome: 'ALLOWED',
      correlationId: randomUUID(),
      metadata: {
        grantedAt: payload.grant.grantedAt,
        expiresAt: payload.grant.expiresAt,
        renewalCount: payload.grant.renewalCount,
      },
    };
    
    await this.emit(event);
  }

  /**
   * Emit CROSS_TENANT_ACCESS_REVOKED event
   */
  async emitRevoked(payload: RevokedEventPayload): Promise<void> {
    const event: CrossTenantAuditEvent = {
      eventId: randomUUID(),
      eventType: 'CROSS_TENANT_ACCESS_REVOKED',
      requestId: payload.grant.requestId,
      grantId: payload.grant.grantId,
      requesterId: '',
      approverId: payload.grant.approverId,
      targetTenantId: payload.grant.targetTenantId,
      reason: {
        category: 'MANUAL_REVOCATION',
        ticketRef: payload.revocationReason || 'MANUAL',
      },
      network: payload.context.userAgent
        ? { ip: payload.context.ip, userAgent: payload.context.userAgent }
        : { ip: payload.context.ip },
      authType: 'INTERNAL_OPS',
      timestamp: new Date().toISOString(),
      outcome: 'ALLOWED',
      correlationId: payload.context.correlationId,
      ...(payload.context.traceId && { traceId: payload.context.traceId }),
      metadata: {
        revokedBy: payload.revokedBy,
        revocationReason: payload.revocationReason,
      },
    };
    
    await this.emit(event);
  }

  /**
   * Get audit trail for a request
   */
  async getAuditTrail(requestId: string): Promise<CrossTenantAuditEvent[]> {
    return this.repository.list({ requestId });
  }

  /**
   * Get audit trail for a grant
   */
  async getGrantAuditTrail(grantId: string): Promise<CrossTenantAuditEvent[]> {
    return this.repository.list({ grantId });
  }

  /**
   * Core emit method - appends to repository
   * 
   * FAIL-SAFE BEHAVIOR:
   * - Tracks consecutive failures
   * - Emits AUDIT_WRITE_FAILED metric on failure
   * - Transitions to DEGRADED mode after threshold
   * - Re-throws error for caller to handle (fail-closed)
   */
  private async emit(event: CrossTenantAuditEvent): Promise<void> {
    try {
      await this.repository.append(event);
      
      // Success - reset consecutive failures
      this.metrics.totalEmitted++;
      this.metrics.consecutiveFailures = 0;
      this.metrics.lastSuccessAt = new Date().toISOString();
      
      // Recover from DEGRADED if we were in it
      if (this.metrics.status === 'DEGRADED') {
        this.logger.log('Audit system recovered from DEGRADED state');
        this.metrics.status = 'HEALTHY';
      }
      
      this.logger.log(`Audit event emitted: ${event.eventType}`, {
        eventId: event.eventId,
        requestId: event.requestId,
        grantId: event.grantId,
        targetTenantId: event.targetTenantId,
        outcome: event.outcome,
      });
    } catch (error) {
      // Track failure
      this.metrics.totalFailed++;
      this.metrics.consecutiveFailures++;
      this.metrics.lastFailureAt = new Date().toISOString();
      
      // Emit metric for alerting
      this.emitAuditWriteFailedMetric(event, error);
      
      // Check if we should transition to DEGRADED
      if (this.metrics.consecutiveFailures >= this.failureConfig.maxConsecutiveFailures) {
        if (this.metrics.status !== 'DEGRADED') {
          this.logger.error('Audit system entering DEGRADED state - break-glass will be unavailable', {
            consecutiveFailures: this.metrics.consecutiveFailures,
            threshold: this.failureConfig.maxConsecutiveFailures,
          });
          this.metrics.status = 'DEGRADED';
        }
      }
      
      this.logger.error(`AUDIT_WRITE_FAILED: ${event.eventType}`, {
        eventId: event.eventId,
        requestId: event.requestId,
        grantId: event.grantId,
        consecutiveFailures: this.metrics.consecutiveFailures,
        status: this.metrics.status,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // Re-throw to let caller decide how to handle (fail-closed)
      throw error;
    }
  }

  /**
   * Emit AUDIT_WRITE_FAILED metric for alerting
   * 
   * This metric should trigger alerts in monitoring systems.
   * Format: break_glass_audit_write_failed_total
   */
  private emitAuditWriteFailedMetric(
    event: CrossTenantAuditEvent,
    error: unknown,
  ): void {
    // In production, this would emit to Prometheus/CloudWatch/etc.
    // For now, we log in a structured format that can be scraped
    this.logger.warn('METRIC: break_glass_audit_write_failed_total', {
      metric: 'break_glass_audit_write_failed_total',
      labels: {
        event_type: event.eventType,
        target_tenant: event.targetTenantId,
      },
      value: 1,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  /**
   * Create base event from request
   */
  private createBaseEvent(
    eventType: CrossTenantEventType,
    request: BreakGlassRequest,
    context: AuditContext,
  ): CrossTenantAuditEvent {
    const baseEvent: CrossTenantAuditEvent = {
      eventId: randomUUID(),
      eventType,
      requestId: request.requestId,
      requesterId: request.requesterId,
      targetTenantId: request.targetTenantId,
      resourceScope: request.requestedScopes.join(','),
      reason: this.truncateReason(request.reason),
      network: context.userAgent
        ? { ip: context.ip, userAgent: context.userAgent }
        : { ip: context.ip },
      authType: 'INTERNAL_OPS',
      timestamp: new Date().toISOString(),
      outcome: 'ALLOWED',
      correlationId: context.correlationId,
    };
    
    if (context.traceId) {
      baseEvent.traceId = context.traceId;
    }
    
    return baseEvent;
  }

  /**
   * Truncate reason for audit (max 100 chars for description)
   */
  private truncateReason(reason: BreakGlassReason): CrossTenantAuditEvent['reason'] {
    const result: CrossTenantAuditEvent['reason'] = {
      category: reason.category,
      ticketRef: reason.ticketRef,
    };
    
    if (reason.description) {
      result.descriptionTruncated = reason.description.substring(0, 100);
    }
    
    return result;
  }
}
