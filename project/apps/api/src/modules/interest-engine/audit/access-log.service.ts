/**
 * Task 11.8 - Audit Access Log Service
 * 
 * Immutable, append-only, 5 yıl saklama
 * KVKK m.12 uyumlu
 */

import { Injectable } from '@nestjs/common';
import { Role, ResourceType, AccessLevel } from './access-control.service';

// ═══════════════════════════════════════════════════════════════════════════
// ACCESS LOG ENTRY
// ═══════════════════════════════════════════════════════════════════════════

export interface AccessLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userRole: Role;
  tenantId: string;
  action: AccessAction;
  resourceType: ResourceType;
  resourceId: string;
  accessLevel: AccessLevel;
  allowed: boolean;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  checksum: string;
}

export type AccessAction = 
  | 'READ'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'EXPORT'
  | 'PRINT'
  | 'SHARE';

// ═══════════════════════════════════════════════════════════════════════════
// ACCESS LOG QUERY
// ═══════════════════════════════════════════════════════════════════════════

export interface AccessLogQuery {
  userId?: string;
  tenantId?: string;
  resourceType?: ResourceType;
  resourceId?: string;
  action?: AccessAction;
  allowed?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCESS LOG SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class AccessLogService {
  private logs: AccessLogEntry[] = [];
  private idCounter = 0;

  /**
   * Log an access attempt (append-only)
   */
  async logAccess(
    entry: Omit<AccessLogEntry, 'id' | 'timestamp' | 'checksum'>,
  ): Promise<string> {
    const id = `AL-${Date.now()}-${++this.idCounter}`;
    const timestamp = new Date().toISOString();
    
    const fullEntry: AccessLogEntry = {
      ...entry,
      id,
      timestamp,
      checksum: '', // Will be calculated
    };

    // Calculate checksum for integrity
    fullEntry.checksum = this.calculateChecksum(fullEntry);

    // Append-only: no modification allowed
    this.logs.push(Object.freeze(fullEntry) as AccessLogEntry);

    return id;
  }

  /**
   * Query access logs
   */
  async queryLogs(query: AccessLogQuery): Promise<AccessLogEntry[]> {
    let results = [...this.logs];

    if (query.userId) {
      results = results.filter(l => l.userId === query.userId);
    }
    if (query.tenantId) {
      results = results.filter(l => l.tenantId === query.tenantId);
    }
    if (query.resourceType) {
      results = results.filter(l => l.resourceType === query.resourceType);
    }
    if (query.resourceId) {
      results = results.filter(l => l.resourceId === query.resourceId);
    }
    if (query.action) {
      results = results.filter(l => l.action === query.action);
    }
    if (query.allowed !== undefined) {
      results = results.filter(l => l.allowed === query.allowed);
    }
    if (query.startDate) {
      results = results.filter(l => l.timestamp >= query.startDate!);
    }
    if (query.endDate) {
      results = results.filter(l => l.timestamp <= query.endDate!);
    }

    // Sort by timestamp descending (newest first)
    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 100;
    return results.slice(offset, offset + limit);
  }

  /**
   * Get access log by ID
   */
  async getLog(id: string): Promise<AccessLogEntry | undefined> {
    return this.logs.find(l => l.id === id);
  }

  /**
   * Get logs for a specific resource
   */
  async getLogsForResource(
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<AccessLogEntry[]> {
    return this.queryLogs({ resourceType, resourceId });
  }

  /**
   * Get logs for a specific user
   */
  async getLogsForUser(userId: string, limit: number = 100): Promise<AccessLogEntry[]> {
    return this.queryLogs({ userId, limit });
  }

  /**
   * Get denied access attempts
   */
  async getDeniedAttempts(
    tenantId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<AccessLogEntry[]> {
    return this.queryLogs({
      tenantId,
      allowed: false,
      startDate,
      endDate,
    });
  }

  /**
   * Verify log integrity
   */
  verifyIntegrity(entry: AccessLogEntry): boolean {
    const expectedChecksum = this.calculateChecksum({
      ...entry,
      checksum: '',
    });
    return entry.checksum === expectedChecksum;
  }

  /**
   * Verify all logs integrity
   */
  async verifyAllIntegrity(): Promise<{ valid: number; invalid: string[] }> {
    const invalid: string[] = [];
    let valid = 0;

    for (const log of this.logs) {
      if (this.verifyIntegrity(log)) {
        valid++;
      } else {
        invalid.push(log.id);
      }
    }

    return { valid, invalid };
  }

  /**
   * Get statistics
   */
  async getStatistics(tenantId: string): Promise<{
    totalLogs: number;
    allowedCount: number;
    deniedCount: number;
    byAction: Record<AccessAction, number>;
    byResource: Record<ResourceType, number>;
  }> {
    const tenantLogs = this.logs.filter(l => l.tenantId === tenantId);

    const byAction: Record<string, number> = {};
    const byResource: Record<string, number> = {};

    for (const log of tenantLogs) {
      byAction[log.action] = (byAction[log.action] || 0) + 1;
      byResource[log.resourceType] = (byResource[log.resourceType] || 0) + 1;
    }

    return {
      totalLogs: tenantLogs.length,
      allowedCount: tenantLogs.filter(l => l.allowed).length,
      deniedCount: tenantLogs.filter(l => !l.allowed).length,
      byAction: byAction as Record<AccessAction, number>,
      byResource: byResource as Record<ResourceType, number>,
    };
  }

  /**
   * Clear all logs (for testing only)
   */
  clearAll(): void {
    this.logs = [];
    this.idCounter = 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private calculateChecksum(entry: Omit<AccessLogEntry, 'checksum'> & { checksum: string }): string {
    const data = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp,
      userId: entry.userId,
      userRole: entry.userRole,
      tenantId: entry.tenantId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      accessLevel: entry.accessLevel,
      allowed: entry.allowed,
    });

    // Simple hash for demo (in production use crypto)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `CHK-${Math.abs(hash).toString(16).padStart(8, '0')}`;
  }
}
