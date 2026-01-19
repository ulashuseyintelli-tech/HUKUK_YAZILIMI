/**
 * CrossTenantAuditRepository
 * 
 * APPEND-ONLY audit repository for cross-tenant access events.
 * 
 * CRITICAL INVARIANT: This repository has NO update or delete methods.
 * All audit records are immutable once written.
 * 
 * DB-level enforcement: BEFORE UPDATE/DELETE trigger should RAISE EXCEPTION
 */

import { Injectable, Logger } from '@nestjs/common';
import { CrossTenantAuditEvent, CrossTenantEventType } from '../../break-glass.types';

/**
 * Filter for querying audit events
 */
export interface AuditEventFilter {
  requestId?: string;
  grantId?: string;
  requesterId?: string;
  approverId?: string;
  targetTenantId?: string;
  eventType?: CrossTenantEventType;
  fromTimestamp?: string;
  toTimestamp?: string;
  limit?: number;
  offset?: number;
}

/**
 * Audit repository interface - APPEND-ONLY
 * 
 * NO update() method
 * NO delete() method
 * NO softDelete() method
 */
export interface ICrossTenantAuditRepository {
  /**
   * Append a new audit event (immutable write)
   */
  append(event: CrossTenantAuditEvent): Promise<void>;

  /**
   * List audit events with filtering
   */
  list(filter: AuditEventFilter): Promise<CrossTenantAuditEvent[]>;

  /**
   * Get single event by ID
   */
  findById(eventId: string): Promise<CrossTenantAuditEvent | null>;

  /**
   * Count events matching filter
   */
  count(filter: AuditEventFilter): Promise<number>;
}

/**
 * In-memory implementation for development/testing
 * 
 * Production should use PostgreSQL with trigger protection
 */
@Injectable()
export class InMemoryCrossTenantAuditRepository implements ICrossTenantAuditRepository {
  private readonly logger = new Logger(InMemoryCrossTenantAuditRepository.name);
  private readonly events: CrossTenantAuditEvent[] = [];

  async append(event: CrossTenantAuditEvent): Promise<void> {
    // Validate event has required fields
    if (!event.eventId || !event.eventType || !event.timestamp) {
      throw new Error('Invalid audit event: missing required fields');
    }

    // Check for duplicate (idempotency)
    const existing = this.events.find(e => e.eventId === event.eventId);
    if (existing) {
      this.logger.warn(`Duplicate audit event ignored: ${event.eventId}`);
      return;
    }

    // Append (immutable)
    this.events.push(Object.freeze({ ...event }));
    
    this.logger.debug(`Audit event appended: ${event.eventType}`, {
      eventId: event.eventId,
      requestId: event.requestId,
      targetTenantId: event.targetTenantId,
    });
  }

  async list(filter: AuditEventFilter): Promise<CrossTenantAuditEvent[]> {
    let result = [...this.events];

    // Apply filters
    if (filter.requestId) {
      result = result.filter(e => e.requestId === filter.requestId);
    }
    if (filter.grantId) {
      result = result.filter(e => e.grantId === filter.grantId);
    }
    if (filter.requesterId) {
      result = result.filter(e => e.requesterId === filter.requesterId);
    }
    if (filter.approverId) {
      result = result.filter(e => e.approverId === filter.approverId);
    }
    if (filter.targetTenantId) {
      result = result.filter(e => e.targetTenantId === filter.targetTenantId);
    }
    if (filter.eventType) {
      result = result.filter(e => e.eventType === filter.eventType);
    }
    if (filter.fromTimestamp) {
      result = result.filter(e => e.timestamp >= filter.fromTimestamp!);
    }
    if (filter.toTimestamp) {
      result = result.filter(e => e.timestamp <= filter.toTimestamp!);
    }

    // Sort by timestamp descending (newest first)
    result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Apply pagination
    const offset = filter.offset || 0;
    const limit = filter.limit || 100;
    return result.slice(offset, offset + limit);
  }

  async findById(eventId: string): Promise<CrossTenantAuditEvent | null> {
    return this.events.find(e => e.eventId === eventId) || null;
  }

  async count(filter: AuditEventFilter): Promise<number> {
    // Create a copy without pagination
    const { limit: _limit, offset: _offset, ...filterWithoutPagination } = filter;
    const filtered = await this.list(filterWithoutPagination);
    return filtered.length;
  }

  /**
   * For testing only - clear all events
   * @internal
   */
  _clearForTesting(): void {
    this.events.length = 0;
  }
}

/**
 * Repository token for DI
 */
export const CROSS_TENANT_AUDIT_REPOSITORY = 'CROSS_TENANT_AUDIT_REPOSITORY';
