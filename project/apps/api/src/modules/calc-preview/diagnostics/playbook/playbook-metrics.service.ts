/**
 * Playbook Metrics Service
 * 
 * Phase 7B - Sprint 2 - Task 2.6
 * 
 * Self-observability metrics for the playbook system.
 * 
 * Metrics:
 * - Playbook execution metrics
 * - Action metrics
 * - Lease metrics
 * - Escalation metrics
 * - Notification metrics
 * 
 * @see .kiro/specs/ops-playbook/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  ExecutionResultStatus,
  ActionResultStatus,
  ActionType,
  AutoActionType,
  LeaseAuditEvent,
  NotificationChannelType,
} from './playbook.types';
import { IncidentSeverity } from '../diagnostics.types';

// ============================================================================
// METRIC TYPES
// ============================================================================

interface Histogram {
  count: number;
  sum: number;
  buckets: Map<number, number>;
}

interface PlaybookExecutionMetric {
  playbookId: string;
  result: ExecutionResultStatus;
  dryRun: boolean;
  count: number;
  totalDurationMs: number;
}

interface ActionMetric {
  actionType: ActionType;
  result: ActionResultStatus;
  count: number;
  totalDurationMs: number;
}

interface LeaseMetric {
  actionType: AutoActionType;
  event: LeaseAuditEvent;
  count: number;
}

interface EscalationMetric {
  fromSeverity: IncidentSeverity;
  toSeverity: IncidentSeverity;
  count: number;
}

interface NotificationMetric {
  channel: NotificationChannelType;
  result: 'success' | 'failure' | 'dead_letter';
  count: number;
  totalLatencyMs: number;
  retryCount: number;
}


// ============================================================================
// PLAYBOOK METRICS SERVICE
// ============================================================================

@Injectable()
export class PlaybookMetricsService {
  private readonly logger = new Logger(PlaybookMetricsService.name);
  
  // Execution metrics
  private readonly executionMetrics = new Map<string, PlaybookExecutionMetric>();
  
  // Action metrics
  private readonly actionMetrics = new Map<string, ActionMetric>();
  
  // Lease metrics
  private readonly leaseMetrics = new Map<string, LeaseMetric>();
  
  // Escalation metrics
  private readonly escalationMetrics = new Map<string, EscalationMetric>();
  
  // Notification metrics
  private readonly notificationMetrics = new Map<string, NotificationMetric>();
  
  // Duration histograms (buckets in ms)
  private readonly DURATION_BUCKETS = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  private readonly executionDurationHistogram = new Map<string, Histogram>();
  private readonly actionDurationHistogram = new Map<string, Histogram>();
  private readonly notificationLatencyHistogram = new Map<string, Histogram>();

  // ============================================================================
  // EXECUTION METRICS
  // ============================================================================

  /**
   * Record playbook execution
   */
  recordExecution(
    playbookId: string,
    result: ExecutionResultStatus,
    dryRun: boolean,
    durationMs: number,
  ): void {
    const key = this.buildExecutionKey(playbookId, result, dryRun);
    
    const existing = this.executionMetrics.get(key);
    if (existing) {
      existing.count++;
      existing.totalDurationMs += durationMs;
    } else {
      this.executionMetrics.set(key, {
        playbookId,
        result,
        dryRun,
        count: 1,
        totalDurationMs: durationMs,
      });
    }
    
    // Update histogram
    this.updateHistogram(
      this.executionDurationHistogram,
      playbookId,
      durationMs,
    );
    
    this.logger.debug('[Metrics] Execution recorded', {
      playbookId,
      result,
      dryRun,
      durationMs,
    });
  }

  // ============================================================================
  // ACTION METRICS
  // ============================================================================

  /**
   * Record action execution
   */
  recordAction(
    actionType: ActionType,
    result: ActionResultStatus,
    durationMs: number,
  ): void {
    const key = this.buildActionKey(actionType, result);
    
    const existing = this.actionMetrics.get(key);
    if (existing) {
      existing.count++;
      existing.totalDurationMs += durationMs;
    } else {
      this.actionMetrics.set(key, {
        actionType,
        result,
        count: 1,
        totalDurationMs: durationMs,
      });
    }
    
    // Update histogram
    this.updateHistogram(
      this.actionDurationHistogram,
      actionType,
      durationMs,
    );
  }

  /**
   * Record action rejection
   */
  recordActionRejection(
    actionType: ActionType,
    reason: string,
  ): void {
    this.recordAction(actionType, 'REJECTED', 0);
    
    this.logger.debug('[Metrics] Action rejection recorded', {
      actionType,
      reason,
    });
  }

  // ============================================================================
  // LEASE METRICS
  // ============================================================================

  /**
   * Record lease event
   */
  recordLease(
    actionType: AutoActionType,
    event: LeaseAuditEvent,
  ): void {
    const key = this.buildLeaseKey(actionType, event);
    
    const existing = this.leaseMetrics.get(key);
    if (existing) {
      existing.count++;
    } else {
      this.leaseMetrics.set(key, {
        actionType,
        event,
        count: 1,
      });
    }
  }

  /**
   * Get active lease count by action type
   */
  getActiveLeaseCount(actionType?: AutoActionType): number {
    let created = 0;
    let ended = 0;
    
    for (const metric of this.leaseMetrics.values()) {
      if (actionType && metric.actionType !== actionType) continue;
      
      if (metric.event === 'CREATED') {
        created += metric.count;
      } else {
        ended += metric.count;
      }
    }
    
    return Math.max(0, created - ended);
  }


  // ============================================================================
  // ESCALATION METRICS
  // ============================================================================

  /**
   * Record escalation
   */
  recordEscalation(
    fromSeverity: IncidentSeverity,
    toSeverity: IncidentSeverity,
  ): void {
    const key = this.buildEscalationKey(fromSeverity, toSeverity);
    
    const existing = this.escalationMetrics.get(key);
    if (existing) {
      existing.count++;
    } else {
      this.escalationMetrics.set(key, {
        fromSeverity,
        toSeverity,
        count: 1,
      });
    }
  }

  /**
   * Record escalation cancellation
   */
  recordEscalationCancelled(reason: string): void {
    this.logger.debug('[Metrics] Escalation cancelled', { reason });
  }

  // ============================================================================
  // NOTIFICATION METRICS
  // ============================================================================

  /**
   * Record notification
   */
  recordNotification(
    channel: NotificationChannelType,
    result: 'success' | 'failure' | 'dead_letter',
    latencyMs: number,
    isRetry: boolean = false,
  ): void {
    const key = this.buildNotificationKey(channel, result);
    
    const existing = this.notificationMetrics.get(key);
    if (existing) {
      existing.count++;
      existing.totalLatencyMs += latencyMs;
      if (isRetry) existing.retryCount++;
    } else {
      this.notificationMetrics.set(key, {
        channel,
        result,
        count: 1,
        totalLatencyMs: latencyMs,
        retryCount: isRetry ? 1 : 0,
      });
    }
    
    // Update histogram
    this.updateHistogram(
      this.notificationLatencyHistogram,
      channel,
      latencyMs,
    );
  }

  // ============================================================================
  // METRICS EXPORT (Prometheus-compatible format)
  // ============================================================================

  /**
   * Get all metrics in Prometheus format
   */
  getPrometheusMetrics(): string {
    const lines: string[] = [];
    
    // Execution metrics
    lines.push('# HELP playbook_executions_total Total playbook executions');
    lines.push('# TYPE playbook_executions_total counter');
    for (const metric of this.executionMetrics.values()) {
      lines.push(
        `playbook_executions_total{playbook_id="${metric.playbookId}",result="${metric.result}",dry_run="${metric.dryRun}"} ${metric.count}`
      );
    }
    
    lines.push('');
    lines.push('# HELP playbook_execution_duration_ms Playbook execution duration');
    lines.push('# TYPE playbook_execution_duration_ms histogram');
    for (const [playbookId, histogram] of this.executionDurationHistogram) {
      this.appendHistogramLines(lines, 'playbook_execution_duration_ms', { playbook_id: playbookId }, histogram);
    }
    
    // Action metrics
    lines.push('');
    lines.push('# HELP playbook_actions_total Total playbook actions');
    lines.push('# TYPE playbook_actions_total counter');
    for (const metric of this.actionMetrics.values()) {
      lines.push(
        `playbook_actions_total{action_type="${metric.actionType}",result="${metric.result}"} ${metric.count}`
      );
    }
    
    // Lease metrics
    lines.push('');
    lines.push('# HELP playbook_leases_total Total lease events');
    lines.push('# TYPE playbook_leases_total counter');
    for (const metric of this.leaseMetrics.values()) {
      lines.push(
        `playbook_leases_total{action_type="${metric.actionType}",event="${metric.event}"} ${metric.count}`
      );
    }
    
    lines.push('');
    lines.push('# HELP playbook_leases_active Current active leases');
    lines.push('# TYPE playbook_leases_active gauge');
    const actionTypes: AutoActionType[] = [
      'extend_cache_ttl',
      'force_circuit_half_open',
      'enable_stale_serve',
      'increase_timeout',
      'reduce_rate_limit',
    ];
    for (const actionType of actionTypes) {
      const count = this.getActiveLeaseCount(actionType);
      if (count > 0) {
        lines.push(`playbook_leases_active{action_type="${actionType}"} ${count}`);
      }
    }
    
    // Escalation metrics
    lines.push('');
    lines.push('# HELP playbook_escalations_total Total escalations');
    lines.push('# TYPE playbook_escalations_total counter');
    for (const metric of this.escalationMetrics.values()) {
      lines.push(
        `playbook_escalations_total{from_severity="${metric.fromSeverity}",to_severity="${metric.toSeverity}"} ${metric.count}`
      );
    }
    
    // Notification metrics
    lines.push('');
    lines.push('# HELP playbook_notifications_total Total notifications');
    lines.push('# TYPE playbook_notifications_total counter');
    for (const metric of this.notificationMetrics.values()) {
      lines.push(
        `playbook_notifications_total{channel="${metric.channel}",result="${metric.result}"} ${metric.count}`
      );
    }
    
    lines.push('');
    lines.push('# HELP playbook_notification_retry_total Total notification retries');
    lines.push('# TYPE playbook_notification_retry_total counter');
    for (const metric of this.notificationMetrics.values()) {
      if (metric.retryCount > 0) {
        lines.push(
          `playbook_notification_retry_total{channel="${metric.channel}"} ${metric.retryCount}`
        );
      }
    }
    
    return lines.join('\n');
  }


  /**
   * Get metrics as JSON object
   */
  getMetrics(): {
    executions: PlaybookExecutionMetric[];
    actions: ActionMetric[];
    leases: LeaseMetric[];
    escalations: EscalationMetric[];
    notifications: NotificationMetric[];
    summary: {
      totalExecutions: number;
      totalActions: number;
      totalLeases: number;
      totalEscalations: number;
      totalNotifications: number;
      activeLeases: number;
    };
  } {
    const executions = Array.from(this.executionMetrics.values());
    const actions = Array.from(this.actionMetrics.values());
    const leases = Array.from(this.leaseMetrics.values());
    const escalations = Array.from(this.escalationMetrics.values());
    const notifications = Array.from(this.notificationMetrics.values());
    
    return {
      executions,
      actions,
      leases,
      escalations,
      notifications,
      summary: {
        totalExecutions: executions.reduce((sum, m) => sum + m.count, 0),
        totalActions: actions.reduce((sum, m) => sum + m.count, 0),
        totalLeases: leases.reduce((sum, m) => sum + m.count, 0),
        totalEscalations: escalations.reduce((sum, m) => sum + m.count, 0),
        totalNotifications: notifications.reduce((sum, m) => sum + m.count, 0),
        activeLeases: this.getActiveLeaseCount(),
      },
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private buildExecutionKey(
    playbookId: string,
    result: ExecutionResultStatus,
    dryRun: boolean,
  ): string {
    return `exec:${playbookId}:${result}:${dryRun}`;
  }

  private buildActionKey(
    actionType: ActionType,
    result: ActionResultStatus,
  ): string {
    return `action:${actionType}:${result}`;
  }

  private buildLeaseKey(
    actionType: AutoActionType,
    event: LeaseAuditEvent,
  ): string {
    return `lease:${actionType}:${event}`;
  }

  private buildEscalationKey(
    fromSeverity: IncidentSeverity,
    toSeverity: IncidentSeverity,
  ): string {
    return `esc:${fromSeverity}:${toSeverity}`;
  }

  private buildNotificationKey(
    channel: NotificationChannelType,
    result: 'success' | 'failure' | 'dead_letter',
  ): string {
    return `notif:${channel}:${result}`;
  }

  private updateHistogram(
    histograms: Map<string, Histogram>,
    key: string,
    value: number,
  ): void {
    let histogram = histograms.get(key);
    
    if (!histogram) {
      histogram = {
        count: 0,
        sum: 0,
        buckets: new Map(this.DURATION_BUCKETS.map(b => [b, 0])),
      };
      histograms.set(key, histogram);
    }
    
    histogram.count++;
    histogram.sum += value;
    
    for (const bucket of this.DURATION_BUCKETS) {
      if (value <= bucket) {
        histogram.buckets.set(bucket, (histogram.buckets.get(bucket) || 0) + 1);
      }
    }
  }

  private appendHistogramLines(
    lines: string[],
    metricName: string,
    labels: Record<string, string>,
    histogram: Histogram,
  ): void {
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    
    for (const [bucket, count] of histogram.buckets) {
      lines.push(`${metricName}_bucket{${labelStr},le="${bucket}"} ${count}`);
    }
    lines.push(`${metricName}_bucket{${labelStr},le="+Inf"} ${histogram.count}`);
    lines.push(`${metricName}_sum{${labelStr}} ${histogram.sum}`);
    lines.push(`${metricName}_count{${labelStr}} ${histogram.count}`);
  }

  // ============================================================================
  // TEST HELPERS
  // ============================================================================

  /**
   * Clear all metrics (for testing only)
   */
  clear(): void {
    this.executionMetrics.clear();
    this.actionMetrics.clear();
    this.leaseMetrics.clear();
    this.escalationMetrics.clear();
    this.notificationMetrics.clear();
    this.executionDurationHistogram.clear();
    this.actionDurationHistogram.clear();
    this.notificationLatencyHistogram.clear();
  }
}
