/**
 * Escalation Service
 * 
 * Phase 7B - Sprint 3 - Task 3.3
 * 
 * Time-based escalation scheduling and execution.
 * 
 * Özellikler:
 * - Time-based escalation scheduling (T+5m → notify, T+15m → page, T+30m → manager)
 * - Escalation cancellation on incident resolve
 * - Background job for due escalations (30s interval)
 * - Loop prevention (max escalations per incident)
 * - Min interval between escalations (10m)
 * 
 * @see .kiro/specs/ops-playbook/design.md
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  EscalationTimer,
  EscalationAction,
} from './playbook.types';
import { IncidentSeverity } from '../diagnostics.types';
import { PlaybookMetricsService } from './playbook-metrics.service';
import { NotificationService } from './notification.service';

// ============================================================================
// CONSTANTS
// ============================================================================

const ESCALATION_CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds
const MIN_ESCALATION_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_MAX_ESCALATIONS = 3;
const MAX_TIMERS_PER_INCIDENT = 10;

// ============================================================================
// ESCALATION RESULT TYPES
// ============================================================================

export interface EscalationResult {
  success: boolean;
  timerId?: string;
  error?: string;
  cancelled?: boolean;
  executed?: boolean;
}

export interface EscalationStats {
  totalTimers: number;
  pendingTimers: number;
  executedTimers: number;
  cancelledTimers: number;
  escalationsByIncident: Map<string, number>;
}

// ============================================================================
// ESCALATION SERVICE
// ============================================================================

@Injectable()
export class EscalationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EscalationService.name);
  
  // Timer storage
  private readonly timers = new Map<string, EscalationTimer>();
  
  // Escalation count per incident (for loop prevention)
  private readonly escalationCounts = new Map<string, number>();
  
  // Last escalation time per incident (for min interval)
  private readonly lastEscalationTime = new Map<string, number>();
  
  // Background job
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly metrics: PlaybookMetricsService,
    private readonly notifications: NotificationService,
  ) {}

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  onModuleInit(): void {
    this.startBackgroundJob();
    this.logger.log('[EscalationService] Started');
  }

  onModuleDestroy(): void {
    this.stopBackgroundJob();
    this.logger.log('[EscalationService] Stopped');
  }

  // ============================================================================
  // SCHEDULE ESCALATION
  // ============================================================================

  /**
   * Schedule an escalation for an incident
   */
  scheduleEscalation(
    incidentId: string,
    playbookId: string,
    actionId: string,
    tenantId: string,
    escalation: EscalationAction,
    currentSeverity: IncidentSeverity,
  ): EscalationResult {
    // Check loop prevention
    const currentCount = this.escalationCounts.get(incidentId) || 0;
    const maxEscalations = escalation.maxEscalations || DEFAULT_MAX_ESCALATIONS;
    
    if (currentCount >= maxEscalations) {
      this.logger.warn('[EscalationService] Max escalations reached', {
        incidentId,
        currentCount,
        maxEscalations,
      });
      
      this.metrics.recordEscalationCancelled('max_escalations_reached');
      
      return {
        success: false,
        error: `Max escalations (${maxEscalations}) reached for incident ${incidentId}`,
      };
    }
    
    // Check min interval
    const lastTime = this.lastEscalationTime.get(incidentId);
    if (lastTime) {
      const elapsed = Date.now() - lastTime;
      if (elapsed < MIN_ESCALATION_INTERVAL_MS) {
        const remainingMs = MIN_ESCALATION_INTERVAL_MS - elapsed;
        
        this.logger.warn('[EscalationService] Min interval not met', {
          incidentId,
          elapsedMs: elapsed,
          minIntervalMs: MIN_ESCALATION_INTERVAL_MS,
          remainingMs,
        });
        
        this.metrics.recordEscalationCancelled('min_interval_not_met');
        
        return {
          success: false,
          error: `Min interval not met. Wait ${Math.ceil(remainingMs / 1000)}s`,
        };
      }
    }
    
    // Check max timers per incident
    const existingTimers = this.getTimersForIncident(incidentId);
    if (existingTimers.length >= MAX_TIMERS_PER_INCIDENT) {
      this.logger.warn('[EscalationService] Max timers per incident reached', {
        incidentId,
        timerCount: existingTimers.length,
      });
      
      return {
        success: false,
        error: `Max timers (${MAX_TIMERS_PER_INCIDENT}) per incident reached`,
      };
    }
    
    // Create timer
    const timerId = this.generateTimerId();
    const now = new Date();
    const dueAt = new Date(now.getTime() + escalation.delayMs);
    
    const timer: EscalationTimer = {
      id: timerId,
      incidentId,
      playbookId,
      actionId,
      tenantId,
      fromSeverity: currentSeverity,
      toSeverity: escalation.toSeverity,
      scheduledAt: now.toISOString(),
      dueAt: dueAt.toISOString(),
      status: 'PENDING',
      escalationCount: currentCount + 1,
      maxEscalations,
    };
    
    this.timers.set(timerId, timer);
    
    this.logger.log('[EscalationService] Escalation scheduled', {
      timerId,
      incidentId,
      fromSeverity: currentSeverity,
      toSeverity: escalation.toSeverity,
      dueAt: dueAt.toISOString(),
      escalationCount: timer.escalationCount,
    });
    
    return {
      success: true,
      timerId,
    };
  }

  // ============================================================================
  // CANCEL ESCALATION
  // ============================================================================

  /**
   * Cancel all escalations for an incident (e.g., on resolve)
   */
  cancelEscalation(incidentId: string, reason: string = 'incident_resolved'): EscalationResult {
    const timers = this.getTimersForIncident(incidentId);
    let cancelledCount = 0;
    
    for (const timer of timers) {
      if (timer.status === 'PENDING') {
        timer.status = 'CANCELLED';
        cancelledCount++;
        
        this.logger.log('[EscalationService] Escalation cancelled', {
          timerId: timer.id,
          incidentId,
          reason,
        });
      }
    }
    
    if (cancelledCount > 0) {
      this.metrics.recordEscalationCancelled(reason);
    }
    
    // Clear escalation count for this incident
    this.escalationCounts.delete(incidentId);
    this.lastEscalationTime.delete(incidentId);
    
    return {
      success: true,
      cancelled: cancelledCount > 0,
    };
  }

  /**
   * Cancel a specific escalation timer
   */
  cancelTimer(timerId: string, reason: string = 'manual_cancel'): EscalationResult {
    const timer = this.timers.get(timerId);
    
    if (!timer) {
      return {
        success: false,
        error: `Timer ${timerId} not found`,
      };
    }
    
    if (timer.status !== 'PENDING') {
      return {
        success: false,
        error: `Timer ${timerId} is not pending (status: ${timer.status})`,
      };
    }
    
    timer.status = 'CANCELLED';
    
    this.logger.log('[EscalationService] Timer cancelled', {
      timerId,
      incidentId: timer.incidentId,
      reason,
    });
    
    this.metrics.recordEscalationCancelled(reason);
    
    return {
      success: true,
      timerId,
      cancelled: true,
    };
  }

  // ============================================================================
  // PROCESS DUE ESCALATIONS
  // ============================================================================

  /**
   * Process all due escalations (called by background job)
   */
  async processDueEscalations(): Promise<number> {
    const now = Date.now();
    const dueTimers: EscalationTimer[] = [];
    
    for (const timer of this.timers.values()) {
      if (timer.status === 'PENDING') {
        const dueTime = new Date(timer.dueAt).getTime();
        if (dueTime <= now) {
          dueTimers.push(timer);
        }
      }
    }
    
    let executedCount = 0;
    
    for (const timer of dueTimers) {
      const success = await this.executeEscalation(timer);
      if (success) {
        executedCount++;
      }
    }
    
    if (dueTimers.length > 0) {
      this.logger.debug('[EscalationService] Processed due escalations', {
        checked: dueTimers.length,
        executed: executedCount,
      });
    }
    
    return executedCount;
  }

  /**
   * Execute a single escalation
   */
  private async executeEscalation(timer: EscalationTimer): Promise<boolean> {
    try {
      // Update escalation count
      const currentCount = this.escalationCounts.get(timer.incidentId) || 0;
      this.escalationCounts.set(timer.incidentId, currentCount + 1);
      this.lastEscalationTime.set(timer.incidentId, Date.now());
      
      // Send escalation notification
      await this.notifications.send(
        'console', // Default to console, can be configured
        'escalation_alert',
        {
          incidentId: timer.incidentId,
          escalationLevel: timer.escalationCount.toString(),
          fromSeverity: timer.fromSeverity,
          toSeverity: timer.toSeverity,
          duration: Math.floor((Date.now() - new Date(timer.scheduledAt).getTime()) / 60000).toString(),
          previousNotifications: currentCount.toString(),
        },
        timer.incidentId,
        timer.playbookId,
      );
      
      // Mark as executed
      timer.status = 'EXECUTED';
      
      // Record metrics
      this.metrics.recordEscalation(timer.fromSeverity, timer.toSeverity);
      
      this.logger.log('[EscalationService] Escalation executed', {
        timerId: timer.id,
        incidentId: timer.incidentId,
        fromSeverity: timer.fromSeverity,
        toSeverity: timer.toSeverity,
        escalationCount: timer.escalationCount,
      });
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error('[EscalationService] Escalation execution failed', {
        timerId: timer.id,
        incidentId: timer.incidentId,
        error: errorMessage,
      });
      
      return false;
    }
  }

  // ============================================================================
  // LOOP DETECTION
  // ============================================================================

  /**
   * Check if escalation would create a loop
   */
  checkEscalationLoop(incidentId: string, maxEscalations: number = DEFAULT_MAX_ESCALATIONS): boolean {
    const currentCount = this.escalationCounts.get(incidentId) || 0;
    return currentCount >= maxEscalations;
  }

  /**
   * Get escalation count for an incident
   */
  getEscalationCount(incidentId: string): number {
    return this.escalationCounts.get(incidentId) || 0;
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  /**
   * Get timer by ID
   */
  getTimer(timerId: string): EscalationTimer | undefined {
    return this.timers.get(timerId);
  }

  /**
   * Get all timers for an incident
   */
  getTimersForIncident(incidentId: string): EscalationTimer[] {
    const result: EscalationTimer[] = [];
    
    for (const timer of this.timers.values()) {
      if (timer.incidentId === incidentId) {
        result.push(timer);
      }
    }
    
    return result;
  }

  /**
   * Get all pending timers
   */
  getPendingTimers(): EscalationTimer[] {
    const result: EscalationTimer[] = [];
    
    for (const timer of this.timers.values()) {
      if (timer.status === 'PENDING') {
        result.push(timer);
      }
    }
    
    return result;
  }

  /**
   * Get escalation stats
   */
  getStats(): EscalationStats {
    let pending = 0;
    let executed = 0;
    let cancelled = 0;
    const byIncident = new Map<string, number>();
    
    for (const timer of this.timers.values()) {
      switch (timer.status) {
        case 'PENDING': pending++; break;
        case 'EXECUTED': executed++; break;
        case 'CANCELLED': cancelled++; break;
      }
      
      const count = byIncident.get(timer.incidentId) || 0;
      byIncident.set(timer.incidentId, count + 1);
    }
    
    return {
      totalTimers: this.timers.size,
      pendingTimers: pending,
      executedTimers: executed,
      cancelledTimers: cancelled,
      escalationsByIncident: byIncident,
    };
  }

  // ============================================================================
  // BACKGROUND JOB
  // ============================================================================

  private startBackgroundJob(): void {
    this.checkInterval = setInterval(() => {
      this.processDueEscalations().catch(error => {
        this.logger.error('[EscalationService] Background job error', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, ESCALATION_CHECK_INTERVAL_MS);
  }

  private stopBackgroundJob(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private generateTimerId(): string {
    return `esc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // ============================================================================
  // TEST HELPERS
  // ============================================================================

  /**
   * Clear all state (for testing)
   */
  clear(): void {
    this.timers.clear();
    this.escalationCounts.clear();
    this.lastEscalationTime.clear();
  }

  /**
   * Force process due escalations (for testing)
   */
  async forceProcessDue(): Promise<number> {
    return this.processDueEscalations();
  }
}
