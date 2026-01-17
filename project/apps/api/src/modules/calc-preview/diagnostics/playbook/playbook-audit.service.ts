/**
 * Playbook Audit Service
 * 
 * Phase 7B - Sprint 2 - Task 2.5
 * 
 * Immutable audit logs for playbook executions.
 * 
 * Log Types:
 * - Execution logs: playbook execution start/end
 * - Action logs: individual action results
 * - Lease logs: lease lifecycle events
 * 
 * @see .kiro/specs/ops-playbook/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  ExecutionAuditEntry,
  ActionAuditEntry,
  LeaseAuditEntry,
  ExecutionResultStatus,
  ActionResultStatus,
  ActionType,
  AutoActionType,
  LeaseAuditEvent,
} from './playbook.types';

// ============================================================================
// PLAYBOOK AUDIT SERVICE
// ============================================================================

@Injectable()
export class PlaybookAuditService {
  private readonly logger = new Logger(PlaybookAuditService.name);
  
  // Immutable audit logs (ring buffers)
  private readonly executionLogs: ExecutionAuditEntry[] = [];
  private readonly actionLogs: ActionAuditEntry[] = [];
  private readonly leaseLogs: LeaseAuditEntry[] = [];
  
  // Max log sizes
  private readonly MAX_EXECUTION_LOGS = 100000;
  private readonly MAX_ACTION_LOGS = 500000;
  private readonly MAX_LEASE_LOGS = 100000;

  // ============================================================================
  // EXECUTION LOGGING
  // ============================================================================

  /**
   * Log execution start/end
   */
  logExecution(entry: Omit<ExecutionAuditEntry, 'id' | 'timestamp'>): ExecutionAuditEntry {
    const fullEntry: ExecutionAuditEntry = {
      id: this.generateId('exec'),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    
    this.executionLogs.push(fullEntry);
    this.trimIfNeeded(this.executionLogs, this.MAX_EXECUTION_LOGS);
    
    this.logger.log('[Audit] Execution logged', {
      executionId: fullEntry.executionId,
      playbookId: fullEntry.playbookId,
      result: fullEntry.result,
    });
    
    return fullEntry;
  }

  /**
   * Create execution audit entry helper
   */
  createExecutionEntry(
    executionId: string,
    playbookId: string,
    playbookVersion: string,
    incidentId: string,
    tenantId: string,
    triggeredBy: 'auto' | 'manual',
    dryRun: boolean,
    result: ExecutionResultStatus,
    durationMs: number,
    userId?: string,
  ): ExecutionAuditEntry {
    const entry: Omit<ExecutionAuditEntry, 'id' | 'timestamp'> = {
      executionId,
      playbookId,
      playbookVersion,
      incidentId,
      tenantId,
      triggeredBy,
      dryRun,
      result,
      durationMs,
    };
    
    if (userId) entry.userId = userId;
    
    return this.logExecution(entry);
  }

  // ============================================================================
  // ACTION LOGGING
  // ============================================================================

  /**
   * Log action execution
   */
  logAction(entry: Omit<ActionAuditEntry, 'id' | 'timestamp'>): ActionAuditEntry {
    const fullEntry: ActionAuditEntry = {
      id: this.generateId('action'),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    
    this.actionLogs.push(fullEntry);
    this.trimIfNeeded(this.actionLogs, this.MAX_ACTION_LOGS);
    
    this.logger.debug('[Audit] Action logged', {
      executionId: fullEntry.executionId,
      actionId: fullEntry.actionId,
      actionType: fullEntry.actionType,
      result: fullEntry.result,
    });
    
    return fullEntry;
  }

  /**
   * Create action audit entry helper
   */
  createActionEntry(
    executionId: string,
    actionId: string,
    actionType: ActionType,
    result: ActionResultStatus,
    durationMs: number,
    params?: Record<string, unknown>,
    rejectionReason?: string,
    leaseId?: string,
    error?: string,
  ): ActionAuditEntry {
    const entry: Omit<ActionAuditEntry, 'id' | 'timestamp'> = {
      executionId,
      actionId,
      actionType,
      result,
      durationMs,
    };
    
    if (params) entry.params = params;
    if (rejectionReason) entry.rejectionReason = rejectionReason;
    if (leaseId) entry.leaseId = leaseId;
    if (error) entry.error = error;
    
    return this.logAction(entry);
  }

  // ============================================================================
  // LEASE LOGGING
  // ============================================================================

  /**
   * Log lease event
   */
  logLease(entry: Omit<LeaseAuditEntry, 'id' | 'timestamp'>): LeaseAuditEntry {
    const fullEntry: LeaseAuditEntry = {
      id: this.generateId('lease'),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    
    this.leaseLogs.push(fullEntry);
    this.trimIfNeeded(this.leaseLogs, this.MAX_LEASE_LOGS);
    
    this.logger.log('[Audit] Lease event logged', {
      leaseId: fullEntry.leaseId,
      event: fullEntry.event,
      actionType: fullEntry.actionType,
    });
    
    return fullEntry;
  }

  /**
   * Create lease audit entry helper
   */
  createLeaseEntry(
    leaseId: string,
    event: LeaseAuditEvent,
    actionType: AutoActionType,
    incidentId: string,
    tenantId: string,
    originalState?: Record<string, unknown>,
    revokedBy?: string,
  ): LeaseAuditEntry {
    const entry: Omit<LeaseAuditEntry, 'id' | 'timestamp'> = {
      leaseId,
      event,
      actionType,
      incidentId,
      tenantId,
    };
    
    if (originalState) entry.originalState = originalState;
    if (revokedBy) entry.revokedBy = revokedBy;
    
    return this.logLease(entry);
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  /**
   * Get execution history
   */
  getExecutionHistory(
    tenantId?: string,
    playbookId?: string,
    since?: Date,
    limit?: number,
  ): ExecutionAuditEntry[] {
    let entries = [...this.executionLogs];
    
    if (tenantId) {
      entries = entries.filter(e => e.tenantId === tenantId);
    }
    
    if (playbookId) {
      entries = entries.filter(e => e.playbookId === playbookId);
    }
    
    if (since) {
      const sinceTime = since.getTime();
      entries = entries.filter(e => new Date(e.timestamp).getTime() >= sinceTime);
    }
    
    // Sort by timestamp descending (newest first)
    entries.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    if (limit && limit > 0) {
      entries = entries.slice(0, limit);
    }
    
    return entries;
  }

  /**
   * Get action history for an execution
   */
  getActionHistory(
    executionId: string,
    actionType?: ActionType,
  ): ActionAuditEntry[] {
    let entries = this.actionLogs.filter(e => e.executionId === executionId);
    
    if (actionType) {
      entries = entries.filter(e => e.actionType === actionType);
    }
    
    return entries;
  }

  /**
   * Get lease history
   */
  getLeaseHistory(
    tenantId?: string,
    leaseId?: string,
    since?: Date,
  ): LeaseAuditEntry[] {
    let entries = [...this.leaseLogs];
    
    if (tenantId) {
      entries = entries.filter(e => e.tenantId === tenantId);
    }
    
    if (leaseId) {
      entries = entries.filter(e => e.leaseId === leaseId);
    }
    
    if (since) {
      const sinceTime = since.getTime();
      entries = entries.filter(e => new Date(e.timestamp).getTime() >= sinceTime);
    }
    
    return entries;
  }

  /**
   * Get execution by ID
   */
  getExecution(executionId: string): ExecutionAuditEntry | undefined {
    return this.executionLogs.find(e => e.executionId === executionId);
  }

  /**
   * Get all actions for an incident
   */
  getActionsForIncident(incidentId: string): ActionAuditEntry[] {
    const executions = this.executionLogs.filter(e => e.incidentId === incidentId);
    const executionIds = new Set(executions.map(e => e.executionId));
    return this.actionLogs.filter(a => executionIds.has(a.executionId));
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get audit statistics
   */
  getStats(): {
    executionLogCount: number;
    actionLogCount: number;
    leaseLogCount: number;
    executionsByResult: Record<ExecutionResultStatus, number>;
    actionsByResult: Record<ActionResultStatus, number>;
    leasesByEvent: Record<LeaseAuditEvent, number>;
  } {
    const executionsByResult: Record<ExecutionResultStatus, number> = {
      SUCCESS: 0,
      PARTIAL: 0,
      FAILED: 0,
    };
    
    for (const entry of this.executionLogs) {
      executionsByResult[entry.result]++;
    }
    
    const actionsByResult: Record<ActionResultStatus, number> = {
      EXECUTED: 0,
      SKIPPED: 0,
      FAILED: 0,
      REJECTED: 0,
      DRY_RUN: 0,
    };
    
    for (const entry of this.actionLogs) {
      actionsByResult[entry.result]++;
    }
    
    const leasesByEvent: Record<LeaseAuditEvent, number> = {
      CREATED: 0,
      EXPIRED: 0,
      REVOKED: 0,
      ROLLED_BACK: 0,
      EXTENDED: 0,
    };
    
    for (const entry of this.leaseLogs) {
      leasesByEvent[entry.event]++;
    }
    
    return {
      executionLogCount: this.executionLogs.length,
      actionLogCount: this.actionLogs.length,
      leaseLogCount: this.leaseLogs.length,
      executionsByResult,
      actionsByResult,
      leasesByEvent,
    };
  }

  // ============================================================================
  // EXPORT (JSON format for external aggregation)
  // ============================================================================

  /**
   * Export execution logs as JSON
   */
  exportExecutionLogs(since?: Date): string {
    const entries = since 
      ? this.getExecutionHistory(undefined, undefined, since)
      : this.executionLogs;
    return JSON.stringify(entries, null, 2);
  }

  /**
   * Export action logs as JSON
   */
  exportActionLogs(executionId?: string): string {
    const entries = executionId
      ? this.getActionHistory(executionId)
      : this.actionLogs;
    return JSON.stringify(entries, null, 2);
  }

  /**
   * Export lease logs as JSON
   */
  exportLeaseLogs(since?: Date): string {
    const entries = since
      ? this.getLeaseHistory(undefined, undefined, since)
      : this.leaseLogs;
    return JSON.stringify(entries, null, 2);
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Generate unique ID
   */
  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Trim array if it exceeds max size (ring buffer behavior)
   */
  private trimIfNeeded<T>(array: T[], maxSize: number): void {
    if (array.length > maxSize) {
      const toRemove = array.length - maxSize;
      array.splice(0, toRemove);
    }
  }

  // ============================================================================
  // TEST HELPERS
  // ============================================================================

  /**
   * Clear all logs (for testing only)
   */
  clear(): void {
    this.executionLogs.length = 0;
    this.actionLogs.length = 0;
    this.leaseLogs.length = 0;
  }

  /**
   * Get raw log counts (for testing)
   */
  getLogCounts(): {
    executions: number;
    actions: number;
    leases: number;
  } {
    return {
      executions: this.executionLogs.length,
      actions: this.actionLogs.length,
      leases: this.leaseLogs.length,
    };
  }
}
