/**
 * Diagnostics Audit Service
 * 
 * Phase 7A - Sprint 2 - Task 2.4
 * 
 * Her trace erişiminde audit log kaydı.
 * 
 * Kritik: Audit, RBAC fail olsa bile "deneme"yi loglar (allowed=false).
 * 
 * @see .kiro/specs/self-serve-diagnostics/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  TenantAccessContext,
  DiagnosticsAuditEntry,
  AuditAction,
  TraceListQuery,
} from './diagnostics.types';
import { DEFAULT_REGION } from '../region/region.constants';

// ============================================================================
// AUDIT SERVICE
// ============================================================================

@Injectable()
export class DiagnosticsAuditService {
  private readonly logger = new Logger(DiagnosticsAuditService.name);
  
  // Ring buffer for in-memory audit logs
  private readonly auditLogs: DiagnosticsAuditEntry[] = [];
  private readonly MAX_LOGS = 100000;

  /**
   * Log trace list access
   * 
   * @param ctx - Tenant access context
   * @param query - Query parameters
   * @param allowed - Whether access was allowed
   * @param reason - Reason for denial (if not allowed)
   */
  logTraceListAccess(
    ctx: TenantAccessContext,
    query: Partial<TraceListQuery>,
    allowed: boolean,
    reason?: string,
  ): void {
    const entry = this.createEntry(ctx, 'LIST', allowed, reason);
    entry.resource = {
      type: 'traces',
      query,
    };
    
    this.writeLog(entry);
  }

  /**
   * Log trace detail access
   * 
   * @param ctx - Tenant access context
   * @param traceId - Trace ID accessed
   * @param allowed - Whether access was allowed
   * @param reason - Reason for denial (if not allowed)
   */
  logTraceDetailAccess(
    ctx: TenantAccessContext,
    traceId: string,
    allowed: boolean,
    reason?: string,
  ): void {
    const entry = this.createEntry(ctx, 'DETAIL', allowed, reason);
    entry.resource = {
      type: 'trace',
      traceId,
    };
    
    this.writeLog(entry);
  }

  /**
   * Log trace download access
   * 
   * @param ctx - Tenant access context
   * @param traceId - Trace ID downloaded
   * @param allowed - Whether access was allowed
   * @param reason - Reason for denial (if not allowed)
   */
  logTraceDownloadAccess(
    ctx: TenantAccessContext,
    traceId: string,
    allowed: boolean,
    reason?: string,
  ): void {
    const entry = this.createEntry(ctx, 'DOWNLOAD', allowed, reason);
    entry.resource = {
      type: 'trace',
      traceId,
    };
    
    this.writeLog(entry);
  }

  /**
   * Log access attempt (generic)
   * 
   * Kritik: Bu method RBAC fail olsa bile çağrılır (allowed=false).
   */
  logAccessAttempt(
    ctx: TenantAccessContext | null,
    action: AuditAction,
    resourceType: 'trace' | 'traces',
    resourceId: string | undefined,
    allowed: boolean,
    reason?: string,
  ): void {
    const entry: DiagnosticsAuditEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      actor: ctx ? {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        role: ctx.role,
        ...(ctx.clientIp ? { clientIp: ctx.clientIp } : {}),
      } : {
        userId: 'anonymous',
        tenantId: 'unknown',
        role: 'tenant-admin', // Default for anonymous
      },
      action,
      resource: {
        type: resourceType,
        ...(resourceId ? { traceId: resourceId } : {}),
      },
      tenantScope: ctx?.tenantId || 'unknown',
      regionId: DEFAULT_REGION,
      allowed,
      ...(reason ? { reason } : {}),
    };
    
    this.writeLog(entry);
  }

  /**
   * Get recent audit logs (for diagnostics/debugging)
   * 
   * @param limit - Max logs to return
   * @param tenantId - Filter by tenant (optional)
   */
  getRecentLogs(limit: number = 100, tenantId?: string): DiagnosticsAuditEntry[] {
    let logs = [...this.auditLogs];
    
    if (tenantId) {
      logs = logs.filter(l => l.tenantScope === tenantId);
    }
    
    return logs.slice(-limit).reverse();
  }

  /**
   * Get audit statistics
   */
  getStats(): {
    totalLogs: number;
    allowedCount: number;
    deniedCount: number;
    byAction: Partial<Record<AuditAction, number>>;
  } {
    const byAction: Partial<Record<AuditAction, number>> = {
      LIST: 0,
      DETAIL: 0,
      DOWNLOAD: 0,
    };
    
    let allowedCount = 0;
    let deniedCount = 0;
    
    for (const log of this.auditLogs) {
      byAction[log.action] = (byAction[log.action] ?? 0) + 1;
      if (log.allowed) {
        allowedCount++;
      } else {
        deniedCount++;
      }
    }
    
    return {
      totalLogs: this.auditLogs.length,
      allowedCount,
      deniedCount,
      byAction,
    };
  }

  /**
   * Clear audit logs (for testing)
   */
  clear(): void {
    this.auditLogs.length = 0;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private createEntry(
    ctx: TenantAccessContext,
    action: AuditAction,
    allowed: boolean,
    reason?: string,
  ): DiagnosticsAuditEntry {
    return {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      actor: {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        role: ctx.role,
        ...(ctx.clientIp ? { clientIp: ctx.clientIp } : {}),
      },
      action,
      resource: {
        type: 'trace',
      },
      tenantScope: ctx.tenantId,
      regionId: DEFAULT_REGION,
      allowed,
      ...(reason ? { reason } : {}),
    };
  }

  private writeLog(entry: DiagnosticsAuditEntry): void {
    // Add to ring buffer
    this.auditLogs.push(entry);
    
    // Trim if over limit
    if (this.auditLogs.length > this.MAX_LOGS) {
      this.auditLogs.shift();
    }
    
    // Console log for external aggregation (JSON format)
    const logLevel = entry.allowed ? 'log' : 'warn';
    this.logger[logLevel]('[Audit] Trace access', {
      id: entry.id,
      actor: `${entry.actor.role}:${entry.actor.userId}`,
      action: entry.action,
      resource: entry.resource.traceId || 'list',
      tenantScope: entry.tenantScope,
      allowed: entry.allowed,
      reason: entry.reason,
    });
  }
}
