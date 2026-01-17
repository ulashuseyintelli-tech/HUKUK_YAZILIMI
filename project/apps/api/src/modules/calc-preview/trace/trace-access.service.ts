/**
 * Phase 5.1+ - Trace Access Control Service
 * 
 * RBAC + Tenant Isolation + Access Audit
 * 
 * Roller:
 * - tenant-admin: Kendi tenant'ının trace'lerine erişebilir
 * - internal-ops: Tüm trace'lere erişebilir
 * - system: Otomatik işlemler (retention, export)
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 5.1
 */

import { Injectable, Logger, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { TraceBundle } from './trace.types';

// ============================================================================
// TYPES
// ============================================================================

export type TraceAccessRole = 'tenant-admin' | 'internal-ops' | 'system' | 'anonymous';

export interface TraceAccessContext {
  userId: string;
  tenantId: string;
  role: TraceAccessRole;
  clientIp?: string;
  userAgent?: string;
}

export interface TraceAccessLog {
  timestamp: string;
  action: 'VIEW' | 'DOWNLOAD' | 'QUERY' | 'EXPORT';
  traceId?: string;
  userId: string;
  tenantId: string;
  role: TraceAccessRole;
  clientIp?: string;
  allowed: boolean;
  reason?: string;
}

// ============================================================================
// TRACE ACCESS SERVICE
// ============================================================================

@Injectable()
export class TraceAccessService {
  private readonly logger = new Logger(TraceAccessService.name);
  
  /** Access log ring buffer */
  private accessLogs: TraceAccessLog[] = [];
  private readonly MAX_ACCESS_LOGS = 10000;
  
  /** Rate limit per user */
  private downloadCounts = new Map<string, { count: number; resetAt: number }>();
  private readonly DOWNLOAD_LIMIT_PER_HOUR = 100;
  private readonly DOWNLOAD_SIZE_LIMIT_BYTES = 10 * 1024 * 1024; // 10MB

  // ============================================================================
  // ACCESS CONTROL
  // ============================================================================

  /**
   * Trace'e erişim kontrolü
   */
  checkAccess(
    trace: TraceBundle,
    context: TraceAccessContext,
    action: 'VIEW' | 'DOWNLOAD' | 'QUERY' | 'EXPORT',
  ): void {
    // Anonymous erişim yasak
    if (context.role === 'anonymous') {
      this.logAccess(action, trace.meta.traceId, context, false, 'Anonymous access denied');
      throw new UnauthorizedException('Authentication required to access traces');
    }
    
    // internal-ops her şeye erişebilir
    if (context.role === 'internal-ops' || context.role === 'system') {
      this.logAccess(action, trace.meta.traceId, context, true);
      return;
    }
    
    // tenant-admin sadece kendi tenant'ına erişebilir
    if (context.role === 'tenant-admin') {
      if (trace.meta.tenantId !== context.tenantId) {
        this.logAccess(action, trace.meta.traceId, context, false, 'Tenant mismatch');
        throw new ForbiddenException('Access denied: trace belongs to different tenant');
      }
      
      this.logAccess(action, trace.meta.traceId, context, true);
      return;
    }
    
    // Default: deny
    this.logAccess(action, trace.meta.traceId, context, false, 'Unknown role');
    throw new ForbiddenException('Access denied');
  }

  /**
   * Query erişim kontrolü (tenant filter zorunlu)
   */
  checkQueryAccess(
    context: TraceAccessContext,
    queryTenantId?: string,
  ): void {
    if (context.role === 'anonymous') {
      throw new UnauthorizedException('Authentication required');
    }
    
    // internal-ops tüm tenant'ları sorgulayabilir
    if (context.role === 'internal-ops' || context.role === 'system') {
      this.logAccess('QUERY', undefined, context, true);
      return;
    }
    
    // tenant-admin sadece kendi tenant'ını sorgulayabilir
    if (context.role === 'tenant-admin') {
      if (!queryTenantId || queryTenantId !== context.tenantId) {
        this.logAccess('QUERY', undefined, context, false, 'Must query own tenant');
        throw new ForbiddenException('Tenant admins can only query their own tenant');
      }
      
      this.logAccess('QUERY', undefined, context, true);
      return;
    }
    
    throw new ForbiddenException('Access denied');
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  /**
   * Download rate limit kontrolü
   */
  checkDownloadRateLimit(context: TraceAccessContext): void {
    const key = `${context.userId}:${context.tenantId}`;
    const now = Date.now();
    
    let record = this.downloadCounts.get(key);
    
    // Reset if hour passed
    if (!record || record.resetAt < now) {
      record = { count: 0, resetAt: now + 60 * 60 * 1000 };
    }
    
    if (record.count >= this.DOWNLOAD_LIMIT_PER_HOUR) {
      throw new ForbiddenException(
        `Download rate limit exceeded. Limit: ${this.DOWNLOAD_LIMIT_PER_HOUR}/hour`
      );
    }
    
    record.count++;
    this.downloadCounts.set(key, record);
  }

  /**
   * Download size limit kontrolü
   */
  checkDownloadSizeLimit(trace: TraceBundle): void {
    const size = JSON.stringify(trace).length;
    
    if (size > this.DOWNLOAD_SIZE_LIMIT_BYTES) {
      throw new ForbiddenException(
        `Trace too large for download. Size: ${(size / 1024 / 1024).toFixed(2)}MB, Limit: ${this.DOWNLOAD_SIZE_LIMIT_BYTES / 1024 / 1024}MB`
      );
    }
  }

  // ============================================================================
  // ACCESS LOGGING
  // ============================================================================

  /**
   * Access log kaydet
   */
  private logAccess(
    action: TraceAccessLog['action'],
    traceId: string | undefined,
    context: TraceAccessContext,
    allowed: boolean,
    reason?: string,
  ): void {
    const log: TraceAccessLog = {
      timestamp: new Date().toISOString(),
      action,
      traceId,
      userId: context.userId,
      tenantId: context.tenantId,
      role: context.role,
      clientIp: context.clientIp,
      allowed,
      reason,
    };
    
    this.accessLogs.push(log);
    
    // Ring buffer
    if (this.accessLogs.length > this.MAX_ACCESS_LOGS) {
      this.accessLogs.shift();
    }
    
    // Log to console for audit
    if (!allowed) {
      this.logger.warn(`[TraceAccess] DENIED: ${action} trace=${traceId} user=${context.userId} tenant=${context.tenantId} reason=${reason}`);
    } else {
      this.logger.debug(`[TraceAccess] ALLOWED: ${action} trace=${traceId} user=${context.userId} tenant=${context.tenantId}`);
    }
  }

  /**
   * Access log'ları getir (internal-ops only)
   */
  getAccessLogs(limit: number = 100): TraceAccessLog[] {
    return this.accessLogs.slice(-limit);
  }

  /**
   * Denied access'leri getir
   */
  getDeniedAccessLogs(limit: number = 50): TraceAccessLog[] {
    return this.accessLogs
      .filter(log => !log.allowed)
      .slice(-limit);
  }
}
