/**
 * Action Lease Manager Service
 * 
 * Phase 7B - Sprint 2 - Task 2.2
 * 
 * Temporary effect'lerin yaşam döngüsünü yönetir.
 * 
 * Kritik Özellikler:
 * 1. Lease creation with original state capture
 * 2. Active lease tracking
 * 3. Lease revocation (early rollback)
 * 4. Background job for expired leases
 * 5. Auto-rollback execution
 * 
 * @see .kiro/specs/ops-playbook/design.md
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  Lease,
  LeaseConfig,
  LeaseAuditEntry,
  LeaseAuditEvent,
  AutoAction,
  AutoActionType,
  LEASE_CONSTRAINTS,
} from './playbook.types';
import { DiagnosticsIncident } from '../diagnostics.types';

// ============================================================================
// ROLLBACK RESULT TYPES
// ============================================================================

export interface RollbackResult {
  success: boolean;
  leaseId: string;
  actionType: AutoActionType;
  error?: string;
  restoredState?: Record<string, unknown>;
}

export interface RevokeResult {
  success: boolean;
  leaseId: string;
  rollbackResult?: RollbackResult;
  error?: string;
}

export interface LeaseCreationResult {
  success: boolean;
  lease?: Lease;
  error?: string;
}

// ============================================================================
// ROLLBACK HANDLER TYPE
// ============================================================================

export type RollbackHandler = (
  actionType: AutoActionType,
  params: Record<string, unknown>,
  originalState: Record<string, unknown>,
) => Promise<RollbackResult>;

// ============================================================================
// ACTION LEASE MANAGER SERVICE
// ============================================================================

@Injectable()
export class ActionLeaseManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ActionLeaseManager.name);
  
  // Active leases storage
  private readonly leases = new Map<string, Lease>();
  
  // Audit log (ring buffer)
  private readonly auditLog: LeaseAuditEntry[] = [];
  private readonly MAX_AUDIT_ENTRIES = 10000;
  
  // Background job interval
  private expiryCheckInterval: NodeJS.Timeout | null = null;
  private readonly EXPIRY_CHECK_INTERVAL_MS = 30000; // 30 seconds
  
  // Rollback handlers (injected by ActionExecutor)
  private rollbackHandler: RollbackHandler | null = null;

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  onModuleInit(): void {
    this.startExpiryCheckJob();
    this.logger.log('[LeaseManager] Started with expiry check interval', {
      intervalMs: this.EXPIRY_CHECK_INTERVAL_MS,
    });
  }

  onModuleDestroy(): void {
    this.stopExpiryCheckJob();
    this.logger.log('[LeaseManager] Stopped');
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Register rollback handler (called by ActionExecutor)
   */
  registerRollbackHandler(handler: RollbackHandler): void {
    this.rollbackHandler = handler;
    this.logger.debug('[LeaseManager] Rollback handler registered');
  }

  /**
   * Create a new lease for a temporary action
   */
  createLease(
    action: AutoAction,
    incident: DiagnosticsIncident,
    leaseConfig: LeaseConfig,
    executionId: string,
    originalState: Record<string, unknown>,
  ): LeaseCreationResult {
    // Validate lease duration
    if (leaseConfig.durationMs < LEASE_CONSTRAINTS.MIN_DURATION_MS) {
      return {
        success: false,
        error: `Lease duration ${leaseConfig.durationMs}ms is below minimum ${LEASE_CONSTRAINTS.MIN_DURATION_MS}ms`,
      };
    }
    
    if (leaseConfig.durationMs > LEASE_CONSTRAINTS.MAX_DURATION_MS) {
      return {
        success: false,
        error: `Lease duration ${leaseConfig.durationMs}ms exceeds maximum ${LEASE_CONSTRAINTS.MAX_DURATION_MS}ms`,
      };
    }
    
    const now = Date.now();
    const leaseId = this.generateLeaseId(executionId, action.id);
    
    const lease: Lease = {
      id: leaseId,
      actionId: action.id,
      incidentId: incident.id,
      playbookId: '', // Will be set by executor
      tenantId: incident.tenantId,
      actionType: action.action,
      params: action.params as unknown as Record<string, unknown>,
      originalState,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + leaseConfig.durationMs).toISOString(),
      status: 'ACTIVE',
    };
    
    if (leaseConfig.rollbackAction) {
      lease.rollbackAction = leaseConfig.rollbackAction;
    }
    
    this.leases.set(leaseId, lease);
    
    // Audit log
    this.logLeaseEvent(lease, 'CREATED');
    
    this.logger.log('[LeaseManager] Lease created', {
      leaseId,
      actionType: action.action,
      incidentId: incident.id,
      expiresAt: lease.expiresAt,
      durationMs: leaseConfig.durationMs,
    });
    
    return { success: true, lease };
  }

  /**
   * Set playbook ID on lease (called after creation)
   */
  setPlaybookId(leaseId: string, playbookId: string): void {
    const lease = this.leases.get(leaseId);
    if (lease) {
      lease.playbookId = playbookId;
    }
  }

  /**
   * Get all active leases, optionally filtered by tenant
   */
  getActiveLeases(tenantId?: string): Lease[] {
    const active = Array.from(this.leases.values())
      .filter(l => l.status === 'ACTIVE');
    
    if (tenantId) {
      return active.filter(l => l.tenantId === tenantId);
    }
    
    return active;
  }

  /**
   * Get lease by ID
   */
  getLease(leaseId: string): Lease | undefined {
    return this.leases.get(leaseId);
  }

  /**
   * Revoke a lease early (manual rollback)
   */
  async revokeLease(leaseId: string, revokedBy?: string): Promise<RevokeResult> {
    const lease = this.leases.get(leaseId);
    
    if (!lease) {
      return {
        success: false,
        leaseId,
        error: 'Lease not found',
      };
    }
    
    if (lease.status !== 'ACTIVE') {
      return {
        success: false,
        leaseId,
        error: `Lease is not active (status: ${lease.status})`,
      };
    }
    
    // Execute rollback
    const rollbackResult = await this.executeRollback(lease);
    
    if (rollbackResult.success) {
      lease.status = 'REVOKED';
      this.logLeaseEvent(lease, 'REVOKED', revokedBy);
      
      this.logger.log('[LeaseManager] Lease revoked', {
        leaseId,
        actionType: lease.actionType,
        revokedBy,
      });
    } else {
      this.logger.error('[LeaseManager] Lease revocation failed', {
        leaseId,
        error: rollbackResult.error,
      });
    }
    
    const result: RevokeResult = {
      success: rollbackResult.success,
      leaseId,
      rollbackResult,
    };
    
    if (rollbackResult.error) {
      result.error = rollbackResult.error;
    }
    
    return result;
  }

  /**
   * Process expired leases (called by background job)
   */
  async processExpiredLeases(): Promise<void> {
    const now = Date.now();
    const expiredLeases: Lease[] = [];
    
    for (const lease of this.leases.values()) {
      if (lease.status === 'ACTIVE') {
        const expiresAt = new Date(lease.expiresAt).getTime();
        if (expiresAt <= now) {
          expiredLeases.push(lease);
        }
      }
    }
    
    if (expiredLeases.length === 0) {
      return;
    }
    
    this.logger.log('[LeaseManager] Processing expired leases', {
      count: expiredLeases.length,
    });
    
    for (const lease of expiredLeases) {
      await this.handleExpiredLease(lease);
    }
  }

  /**
   * Execute rollback for a lease
   */
  async executeRollback(lease: Lease): Promise<RollbackResult> {
    if (!this.rollbackHandler) {
      this.logger.warn('[LeaseManager] No rollback handler registered');
      return {
        success: false,
        leaseId: lease.id,
        actionType: lease.actionType,
        error: 'No rollback handler registered',
      };
    }
    
    try {
      const result = await this.rollbackHandler(
        lease.actionType,
        lease.params,
        lease.originalState,
      );
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error('[LeaseManager] Rollback execution failed', {
        leaseId: lease.id,
        actionType: lease.actionType,
        error: errorMessage,
      });
      
      return {
        success: false,
        leaseId: lease.id,
        actionType: lease.actionType,
        error: errorMessage,
      };
    }
  }

  /**
   * Get lease audit history
   */
  getAuditHistory(
    tenantId?: string,
    leaseId?: string,
    since?: Date,
  ): LeaseAuditEntry[] {
    let entries = [...this.auditLog];
    
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
   * Get lease statistics
   */
  getStats(): {
    totalLeases: number;
    activeLeases: number;
    expiredLeases: number;
    revokedLeases: number;
    rolledBackLeases: number;
    auditLogSize: number;
  } {
    const leases = Array.from(this.leases.values());
    
    return {
      totalLeases: leases.length,
      activeLeases: leases.filter(l => l.status === 'ACTIVE').length,
      expiredLeases: leases.filter(l => l.status === 'EXPIRED').length,
      revokedLeases: leases.filter(l => l.status === 'REVOKED').length,
      rolledBackLeases: leases.filter(l => l.status === 'ROLLED_BACK').length,
      auditLogSize: this.auditLog.length,
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Handle an expired lease
   */
  private async handleExpiredLease(lease: Lease): Promise<void> {
    lease.status = 'EXPIRED';
    this.logLeaseEvent(lease, 'EXPIRED');
    
    this.logger.log('[LeaseManager] Lease expired', {
      leaseId: lease.id,
      actionType: lease.actionType,
    });
    
    // Auto-rollback if configured
    const rollbackResult = await this.executeRollback(lease);
    
    if (rollbackResult.success) {
      lease.status = 'ROLLED_BACK';
      this.logLeaseEvent(lease, 'ROLLED_BACK');
      
      this.logger.log('[LeaseManager] Auto-rollback successful', {
        leaseId: lease.id,
        actionType: lease.actionType,
      });
    } else {
      // Rollback failed - alert needed
      this.logger.error('[LeaseManager] Auto-rollback FAILED', {
        leaseId: lease.id,
        actionType: lease.actionType,
        error: rollbackResult.error,
      });
      
      // TODO: Emit alert/notification for failed rollback
    }
  }

  /**
   * Generate unique lease ID
   */
  private generateLeaseId(executionId: string, actionId: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `lease_${executionId.substring(0, 8)}_${actionId}_${timestamp}_${random}`;
  }

  /**
   * Log lease event to audit log
   */
  private logLeaseEvent(
    lease: Lease,
    event: LeaseAuditEvent,
    revokedBy?: string,
  ): void {
    const entry: LeaseAuditEntry = {
      id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      leaseId: lease.id,
      event,
      actionType: lease.actionType,
      incidentId: lease.incidentId,
      tenantId: lease.tenantId,
    };
    
    if (event === 'CREATED') {
      entry.originalState = lease.originalState;
    }
    
    if (revokedBy) {
      entry.revokedBy = revokedBy;
    }
    
    this.auditLog.push(entry);
    
    // Ring buffer cleanup
    if (this.auditLog.length > this.MAX_AUDIT_ENTRIES) {
      this.auditLog.shift();
    }
  }

  /**
   * Start background job for expiry check
   */
  private startExpiryCheckJob(): void {
    this.expiryCheckInterval = setInterval(
      () => this.processExpiredLeases(),
      this.EXPIRY_CHECK_INTERVAL_MS,
    );
  }

  /**
   * Stop background job
   */
  private stopExpiryCheckJob(): void {
    if (this.expiryCheckInterval) {
      clearInterval(this.expiryCheckInterval);
      this.expiryCheckInterval = null;
    }
  }

  // ============================================================================
  // TEST HELPERS
  // ============================================================================

  /**
   * Clear all state (for testing only)
   */
  clear(): void {
    this.leases.clear();
    this.auditLog.length = 0;
  }

  /**
   * Force process expired leases (for testing)
   */
  async forceProcessExpired(): Promise<void> {
    await this.processExpiredLeases();
  }
}
