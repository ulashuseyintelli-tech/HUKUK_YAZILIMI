/**
 * Snapshot Audit Event Types
 * 
 * Phase 8 - Sprint 2C
 * 
 * Audit events for snapshot lifecycle changes.
 * Events are only emitted on actual changes (not no-ops).
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 */

import { RetentionPolicy } from './retention-policy';

/**
 * Actor types for audit events
 */
export type AuditActor = 'system' | 'user' | 'service';

/**
 * Snapshot audit event types
 */
export type SnapshotAuditEventType =
  | 'SNAPSHOT_CREATED'
  | 'SNAPSHOT_PROMOTED'
  | 'SNAPSHOT_LEGAL_HOLD_APPLIED'
  | 'SNAPSHOT_POLICY_CHANGED'
  | 'SNAPSHOT_DELETED'
  | 'SNAPSHOT_EXPIRED';

/**
 * Base audit event interface
 */
export interface BaseSnapshotAuditEvent {
  /** Event type */
  eventType: SnapshotAuditEventType;
  /** Snapshot ID */
  snapshotId: string;
  /** Incident ID (for correlation) */
  incidentId: string;
  /** Tenant ID */
  tenantId: string;
  /** Event timestamp */
  timestamp: string;
  /** Actor who triggered the event */
  actor: AuditActor;
  /** Optional correlation ID (e.g., runId from simulation) */
  correlationId?: string;
  /** Optional reason for the action */
  reason?: string;
}

/**
 * Snapshot created event
 */
export interface SnapshotCreatedEvent extends BaseSnapshotAuditEvent {
  eventType: 'SNAPSHOT_CREATED';
  /** Initial retention policy */
  policy: RetentionPolicy;
  /** Expiration time */
  expiresAt: string | null;
}

/**
 * Snapshot promoted event
 */
export interface SnapshotPromotedEvent extends BaseSnapshotAuditEvent {
  eventType: 'SNAPSHOT_PROMOTED';
  /** Previous policy */
  previousPolicy: RetentionPolicy;
  /** New policy (always PROMOTED) */
  newPolicy: 'PROMOTED';
  /** Promotion timestamp */
  promotedAt: string;
}

/**
 * Legal hold applied event
 */
export interface SnapshotLegalHoldAppliedEvent extends BaseSnapshotAuditEvent {
  eventType: 'SNAPSHOT_LEGAL_HOLD_APPLIED';
  /** Previous policy */
  previousPolicy: RetentionPolicy;
  /** New policy (always LEGAL_HOLD) */
  newPolicy: 'LEGAL_HOLD';
}

/**
 * Policy changed event (generic)
 */
export interface SnapshotPolicyChangedEvent extends BaseSnapshotAuditEvent {
  eventType: 'SNAPSHOT_POLICY_CHANGED';
  /** Previous policy */
  previousPolicy: RetentionPolicy;
  /** New policy */
  newPolicy: RetentionPolicy;
  /** New expiration time */
  newExpiresAt: string | null;
}

/**
 * Snapshot deleted event
 */
export interface SnapshotDeletedEvent extends BaseSnapshotAuditEvent {
  eventType: 'SNAPSHOT_DELETED';
  /** Policy at time of deletion */
  policy: RetentionPolicy;
  /** Deletion reason */
  deletionReason: 'EXPIRED' | 'MANUAL' | 'CLEANUP';
}

/**
 * Union type for all snapshot audit events
 */
export type SnapshotAuditEvent =
  | SnapshotCreatedEvent
  | SnapshotPromotedEvent
  | SnapshotLegalHoldAppliedEvent
  | SnapshotPolicyChangedEvent
  | SnapshotDeletedEvent;

/**
 * Audit event emitter interface
 */
export interface ISnapshotAuditEmitter {
  emit(event: SnapshotAuditEvent): void;
}

/**
 * No-op audit emitter (for testing or when audit is disabled)
 */
export class NoOpSnapshotAuditEmitter implements ISnapshotAuditEmitter {
  emit(_event: SnapshotAuditEvent): void {
    // No-op
  }
}

/**
 * In-memory audit emitter (for testing)
 */
export class InMemorySnapshotAuditEmitter implements ISnapshotAuditEmitter {
  private readonly events: SnapshotAuditEvent[] = [];

  emit(event: SnapshotAuditEvent): void {
    this.events.push(event);
  }

  getEvents(): SnapshotAuditEvent[] {
    return [...this.events];
  }

  getEventsByType<T extends SnapshotAuditEvent>(
    eventType: T['eventType'],
  ): T[] {
    return this.events.filter((e) => e.eventType === eventType) as T[];
  }

  clear(): void {
    this.events.length = 0;
  }
}
