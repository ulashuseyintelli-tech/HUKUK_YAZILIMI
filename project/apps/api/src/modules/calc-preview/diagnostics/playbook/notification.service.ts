/**
 * Notification Service
 * 
 * Phase 7B - Sprint 3 - Task 3.1
 * 
 * Sistemin "ses telleri" - incident'lar hakkında bildirim gönderir.
 * 
 * Özellikler:
 * - Channel abstraction (console, webhook, slack, email)
 * - Delivery state tracking (PENDING → SENT | FAILED)
 * - Retry with exponential backoff (3 attempts)
 * - Dedupe (same incident + template + channel + time window)
 * - Dead letter queue for failed notifications
 * 
 * @see .kiro/specs/ops-playbook/design.md
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  Notification,
  NotificationStatus,
  NotificationChannelType,
  TemplateVariables,
  WebhookConfig,
  SlackConfig,
  ConsoleConfig,
} from './playbook.types';
import { PlaybookMetricsService } from './playbook-metrics.service';
import { fetchWithTimeout } from '../../../../common/fetch-with-timeout.util';

// ============================================================================
// NOTIFICATION RESULT TYPES
// ============================================================================

export interface NotificationResult {
  success: boolean;
  notificationId: string;
  channel: NotificationChannelType;
  status: NotificationStatus;
  sentAt?: string | undefined;
  error?: string | undefined;
  retryCount: number;
  deduplicated?: boolean;
}

export interface DeliveryAttempt {
  attemptNumber: number;
  timestamp: string;
  success: boolean;
  error?: string | undefined;
  durationMs: number;
}

// ============================================================================
// CHANNEL CONFIGURATION
// ============================================================================

export interface ChannelConfig {
  webhook?: WebhookConfig;
  slack?: SlackConfig;
  console?: ConsoleConfig;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const DEDUPE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_DEAD_LETTER_SIZE = 1000;
const RETRY_CHECK_INTERVAL_MS = 10000; // 10 seconds


// ============================================================================
// NOTIFICATION SERVICE
// ============================================================================

@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  
  // Channel configurations
  private readonly channelConfigs = new Map<NotificationChannelType, ChannelConfig>();
  
  // Notification storage
  private readonly notifications = new Map<string, Notification>();
  
  // Delivery attempts
  private readonly deliveryAttempts = new Map<string, DeliveryAttempt[]>();
  
  // Dedupe tracking: key = dedupe_key, value = timestamp
  private readonly dedupeTracker = new Map<string, number>();
  
  // Dead letter queue
  private readonly deadLetterQueue: Notification[] = [];
  
  // Retry queue
  private readonly retryQueue: Notification[] = [];
  
  // Background job
  private retryInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly metrics: PlaybookMetricsService,
  ) {}

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  onModuleInit(): void {
    this.startRetryJob();
    this.logger.log('[NotificationService] Started');
  }

  onModuleDestroy(): void {
    this.stopRetryJob();
    this.logger.log('[NotificationService] Stopped');
  }

  // ============================================================================
  // CHANNEL CONFIGURATION
  // ============================================================================

  /**
   * Configure a notification channel
   */
  configureChannel(channel: NotificationChannelType, config: ChannelConfig): void {
    this.channelConfigs.set(channel, config);
    this.logger.log('[NotificationService] Channel configured', { channel });
  }

  /**
   * Get channel configuration
   */
  getChannelConfig(channel: NotificationChannelType): ChannelConfig | undefined {
    return this.channelConfigs.get(channel);
  }

  // ============================================================================
  // SEND NOTIFICATION
  // ============================================================================

  /**
   * Send a notification
   */
  async send(
    channel: NotificationChannelType,
    template: string,
    variables: TemplateVariables,
    incidentId: string,
    playbookId: string,
  ): Promise<NotificationResult> {
    const notificationId = this.generateNotificationId();
    
    // Check dedupe
    const dedupeKey = this.buildDedupeKey(incidentId, template, channel);
    if (this.isDuplicate(dedupeKey)) {
      this.logger.debug('[NotificationService] Notification deduplicated', {
        notificationId,
        incidentId,
        template,
        channel,
      });
      
      return {
        success: true,
        notificationId,
        channel,
        status: 'SENT',
        retryCount: 0,
        deduplicated: true,
      };
    }
    
    // Create notification record
    const notification: Notification = {
      id: notificationId,
      channel,
      template,
      variables,
      incidentId,
      playbookId,
      status: 'PENDING',
      retryCount: 0,
    };
    
    this.notifications.set(notificationId, notification);
    
    // Attempt delivery
    const result = await this.attemptDelivery(notification);
    
    // Record dedupe
    if (result.success) {
      this.recordDedupe(dedupeKey);
    }
    
    return result;
  }

  /**
   * Retry a failed notification
   */
  async retry(notificationId: string): Promise<NotificationResult> {
    const notification = this.notifications.get(notificationId);
    
    if (!notification) {
      return {
        success: false,
        notificationId,
        channel: 'console',
        status: 'FAILED',
        error: 'Notification not found',
        retryCount: 0,
      };
    }
    
    if (notification.status === 'SENT') {
      return {
        success: true,
        notificationId,
        channel: notification.channel,
        status: 'SENT',
        sentAt: notification.sentAt,
        retryCount: notification.retryCount,
      };
    }
    
    return this.attemptDelivery(notification);
  }


  // ============================================================================
  // DELIVERY LOGIC
  // ============================================================================

  /**
   * Attempt to deliver a notification
   */
  private async attemptDelivery(notification: Notification): Promise<NotificationResult> {
    const startTime = Date.now();
    
    try {
      // Deliver based on channel
      let deliveryResult: { success: boolean; error?: string };
      
      switch (notification.channel) {
        case 'console':
          deliveryResult = this.deliverToConsole(notification);
          break;
        case 'webhook':
          deliveryResult = await this.deliverToWebhook(notification);
          break;
        case 'slack':
          deliveryResult = await this.deliverToSlack(notification);
          break;
        case 'email':
          deliveryResult = { success: false, error: 'Email channel not implemented' };
          break;
        default:
          deliveryResult = { success: false, error: `Unknown channel: ${notification.channel}` };
      }
      
      const durationMs = Date.now() - startTime;
      
      // Record attempt
      this.recordDeliveryAttempt(notification.id, {
        attemptNumber: notification.retryCount + 1,
        timestamp: new Date().toISOString(),
        success: deliveryResult.success,
        error: deliveryResult.error,
        durationMs,
      });
      
      if (deliveryResult.success) {
        notification.status = 'SENT';
        notification.sentAt = new Date().toISOString();
        
        this.metrics.recordNotification(notification.channel, 'success', durationMs);
        
        this.logger.log('[NotificationService] Notification sent', {
          notificationId: notification.id,
          channel: notification.channel,
          template: notification.template,
          durationMs,
        });
        
        return {
          success: true,
          notificationId: notification.id,
          channel: notification.channel,
          status: 'SENT',
          sentAt: notification.sentAt,
          retryCount: notification.retryCount,
        };
      } else {
        // Handle failure
        notification.retryCount++;
        notification.error = deliveryResult.error;
        
        this.metrics.recordNotification(notification.channel, 'failure', durationMs);
        
        if (notification.retryCount < MAX_RETRY_ATTEMPTS) {
          // Queue for retry
          this.queueForRetry(notification);
          
          this.logger.warn('[NotificationService] Notification failed, queued for retry', {
            notificationId: notification.id,
            channel: notification.channel,
            retryCount: notification.retryCount,
            error: deliveryResult.error,
          });
        } else {
          // Move to dead letter queue
          notification.status = 'FAILED';
          this.moveToDeadLetter(notification);
          
          this.logger.error('[NotificationService] Notification failed permanently', {
            notificationId: notification.id,
            channel: notification.channel,
            retryCount: notification.retryCount,
            error: deliveryResult.error,
          });
        }
        
        return {
          success: false,
          notificationId: notification.id,
          channel: notification.channel,
          status: notification.status,
          error: deliveryResult.error,
          retryCount: notification.retryCount,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startTime;
      
      this.recordDeliveryAttempt(notification.id, {
        attemptNumber: notification.retryCount + 1,
        timestamp: new Date().toISOString(),
        success: false,
        error: errorMessage,
        durationMs,
      });
      
      notification.retryCount++;
      notification.error = errorMessage;
      
      this.metrics.recordNotification(notification.channel, 'failure', durationMs);
      
      if (notification.retryCount < MAX_RETRY_ATTEMPTS) {
        this.queueForRetry(notification);
      } else {
        notification.status = 'FAILED';
        this.moveToDeadLetter(notification);
      }
      
      return {
        success: false,
        notificationId: notification.id,
        channel: notification.channel,
        status: notification.status,
        error: errorMessage,
        retryCount: notification.retryCount,
      };
    }
  }

  // ============================================================================
  // CHANNEL DELIVERY IMPLEMENTATIONS
  // ============================================================================

  /**
   * Deliver to console (development/testing)
   */
  private deliverToConsole(notification: Notification): { success: boolean; error?: string } {
    const message = this.renderTemplate(notification.template, notification.variables);
    
    this.logger.log(`[NOTIFICATION] [${notification.channel}] [${notification.template}]`, {
      incidentId: notification.incidentId,
      playbookId: notification.playbookId,
      message,
    });
    
    return { success: true };
  }

  /**
   * Deliver to webhook (HTTP POST)
   */
  private async deliverToWebhook(notification: Notification): Promise<{ success: boolean; error?: string }> {
    const config = this.channelConfigs.get('webhook');
    const webhookConfig = config?.webhook;
    
    if (!webhookConfig?.url) {
      return { success: false, error: 'Webhook URL not configured' };
    }
    
    try {
      const payload = {
        notification_id: notification.id,
        incident_id: notification.incidentId,
        playbook_id: notification.playbookId,
        template: notification.template,
        message: this.renderTemplate(notification.template, notification.variables),
        variables: notification.variables,
        timestamp: new Date().toISOString(),
      };
      
      const response = await fetchWithTimeout(webhookConfig.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(webhookConfig.headers || {}),
        },
        body: JSON.stringify(payload),
      }, webhookConfig.timeoutMs || 10_000);
      
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Webhook delivery failed: ${errorMessage}` };
    }
  }

  /**
   * Deliver to Slack (via webhook)
   */
  private async deliverToSlack(notification: Notification): Promise<{ success: boolean; error?: string }> {
    const config = this.channelConfigs.get('slack');
    const slackConfig = config?.slack;
    
    if (!slackConfig?.webhookUrl) {
      return { success: false, error: 'Slack webhook URL not configured' };
    }
    
    try {
      const message = this.renderTemplate(notification.template, notification.variables);
      
      const payload = {
        channel: slackConfig.channel,
        username: slackConfig.username || 'Ops Playbook',
        icon_emoji: slackConfig.iconEmoji || ':robot_face:',
        text: `*[${notification.template}]* - Incident: ${notification.incidentId}`,
        attachments: [
          {
            color: this.getSeverityColor(notification.variables.severity),
            text: message,
            fields: [
              { title: 'Incident ID', value: notification.incidentId, short: true },
              { title: 'Playbook', value: notification.playbookId, short: true },
              { title: 'Severity', value: notification.variables.severity || 'unknown', short: true },
              { title: 'Tenant', value: notification.variables.tenantId || 'global', short: true },
            ],
            ts: Math.floor(Date.now() / 1000).toString(),
          },
        ],
      };
      
      const response = await fetchWithTimeout(slackConfig.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, 10_000);
      
      if (!response.ok) {
        return { success: false, error: `Slack HTTP ${response.status}: ${response.statusText}` };
      }
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Slack delivery failed: ${errorMessage}` };
    }
  }

  /**
   * Get Slack color based on severity
   */
  private getSeverityColor(severity?: string): string {
    switch (severity) {
      case 'critical': return '#dc3545'; // red
      case 'high': return '#fd7e14'; // orange
      case 'medium': return '#ffc107'; // yellow
      case 'low': return '#28a745'; // green
      default: return '#6c757d'; // gray
    }
  }

  // ============================================================================
  // TEMPLATE RENDERING
  // ============================================================================

  /**
   * Render a notification template with variables
   */
  renderTemplate(template: string, variables: TemplateVariables): string {
    let message = this.getTemplateContent(template);
    
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      message = message.replace(placeholder, String(value ?? ''));
    }
    
    return message;
  }

  /**
   * Get template content by name
   */
  private getTemplateContent(template: string): string {
    const templates: Record<string, string> = {
      circuit_breaker_alert: `🔴 Circuit Breaker Açıldı

Servis: {{serviceName}}
Bağımlılık: {{dependencyName}}
Hata Oranı: {{errorRate}}%
Son Hata: {{lastError}}

Önerilen Aksiyon: {{recommendation}}`,

      error_rate_alert: `⚠️ Yüksek Hata Oranı Tespit Edildi

Servis: {{serviceName}}
Mevcut Hata Oranı: {{errorRate}}%
Eşik: {{threshold}}%
Etkilenen İşlem: {{affectedOperation}}

Önerilen Aksiyon: {{recommendation}}`,

      rate_limit_alert: `🚦 Rate Limit Aşıldı

Tenant: {{tenantId}}
Endpoint: {{endpoint}}
Mevcut RPS: {{currentRps}}
Limit: {{rateLimit}}

Önerilen Aksiyon: {{recommendation}}`,

      degraded_service_alert: `🟡 Servis Performansı Düştü

Servis: {{serviceName}}
Mevcut Latency: {{currentLatency}}ms
Normal Latency: {{normalLatency}}ms
Etkilenen Endpoint: {{affectedEndpoint}}

Önerilen Aksiyon: {{recommendation}}`,

      slo_breach_alert: `🎯 SLO İhlali

SLO: {{sloName}}
Hedef: {{target}}%
Mevcut: {{current}}%
Kalan Bütçe: {{remainingBudget}}%

Önerilen Aksiyon: {{recommendation}}`,

      escalation_alert: `📢 Escalation - Seviye {{escalationLevel}}

Incident: {{incidentId}}
Süre: {{duration}} dakika
Önceki Bildirimler: {{previousNotifications}}

Acil müdahale gerekiyor.`,

      lease_expiry_warning: `⏰ Lease Süresi Doluyor

Lease ID: {{leaseId}}
Aksiyon: {{actionType}}
Kalan Süre: {{remainingTime}}
Otomatik Rollback: {{autoRollback}}

Gerekirse lease'i uzatın veya manuel rollback yapın.`,

      action_executed: `✅ Otomatik Aksiyon Çalıştırıldı

Aksiyon: {{actionType}}
Incident: {{incidentId}}
Playbook: {{playbookId}}
Sonuç: {{result}}

Lease ID: {{leaseId}} ({{leaseDuration}} süreyle aktif)`,

      action_rejected: `❌ Aksiyon Reddedildi

Aksiyon: {{actionType}}
Incident: {{incidentId}}
Sebep: {{rejectionReason}}

Manuel müdahale gerekebilir.`,
    };
    
    return templates[template] || `[${template}] {{message}}`;
  }

  // ============================================================================
  // DEDUPE LOGIC
  // ============================================================================

  /**
   * Build dedupe key: incident_id + template + channel + recipient + time_bucket
   */
  private buildDedupeKey(
    incidentId: string,
    template: string,
    channel: NotificationChannelType,
    recipient?: string,
  ): string {
    const timeBucket = Math.floor(Date.now() / DEDUPE_WINDOW_MS);
    const recipientPart = recipient || 'default';
    return `${incidentId}:${template}:${channel}:${recipientPart}:${timeBucket}`;
  }

  /**
   * Check if notification is duplicate
   */
  private isDuplicate(dedupeKey: string): boolean {
    const lastSent = this.dedupeTracker.get(dedupeKey);
    if (!lastSent) return false;
    
    const elapsed = Date.now() - lastSent;
    return elapsed < DEDUPE_WINDOW_MS;
  }

  /**
   * Record dedupe entry
   */
  private recordDedupe(dedupeKey: string): void {
    this.dedupeTracker.set(dedupeKey, Date.now());
    
    // Cleanup old entries periodically
    if (this.dedupeTracker.size > 10000) {
      const cutoff = Date.now() - DEDUPE_WINDOW_MS;
      for (const [key, timestamp] of this.dedupeTracker.entries()) {
        if (timestamp < cutoff) {
          this.dedupeTracker.delete(key);
        }
      }
    }
  }

  // ============================================================================
  // RETRY & DEAD LETTER QUEUE
  // ============================================================================

  /**
   * Queue notification for retry
   */
  private queueForRetry(notification: Notification): void {
    const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, notification.retryCount - 1);
    notification.nextRetryAt = new Date(Date.now() + delay).toISOString();
    
    this.retryQueue.push(notification);
    
    this.logger.debug('[NotificationService] Queued for retry', {
      notificationId: notification.id,
      retryCount: notification.retryCount,
      nextRetryAt: notification.nextRetryAt,
    });
  }

  /**
   * Move notification to dead letter queue
   */
  private moveToDeadLetter(notification: Notification): void {
    notification.status = 'FAILED';
    
    if (this.deadLetterQueue.length >= MAX_DEAD_LETTER_SIZE) {
      this.deadLetterQueue.shift();
    }
    
    this.deadLetterQueue.push(notification);
    
    this.metrics.recordNotification(notification.channel, 'dead_letter', 0);
    
    this.logger.error('[NotificationService] Moved to dead letter queue', {
      notificationId: notification.id,
      channel: notification.channel,
      template: notification.template,
      retryCount: notification.retryCount,
      error: notification.error,
    });
  }

  /**
   * Record delivery attempt
   */
  private recordDeliveryAttempt(notificationId: string, attempt: DeliveryAttempt): void {
    const attempts = this.deliveryAttempts.get(notificationId) || [];
    attempts.push(attempt);
    this.deliveryAttempts.set(notificationId, attempts);
  }

  // ============================================================================
  // BACKGROUND RETRY JOB
  // ============================================================================

  /**
   * Start background retry job
   */
  private startRetryJob(): void {
    this.retryInterval = setInterval(() => {
      this.processRetryQueue();
    }, RETRY_CHECK_INTERVAL_MS);
  }

  /**
   * Stop background retry job
   */
  private stopRetryJob(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
  }

  /**
   * Process retry queue
   */
  private async processRetryQueue(): Promise<void> {
    const now = Date.now();
    const dueNotifications: Notification[] = [];
    
    for (let i = this.retryQueue.length - 1; i >= 0; i--) {
      const notification = this.retryQueue[i];
      if (notification.nextRetryAt && new Date(notification.nextRetryAt).getTime() <= now) {
        dueNotifications.push(notification);
        this.retryQueue.splice(i, 1);
      }
    }
    
    for (const notification of dueNotifications) {
      await this.attemptDelivery(notification);
    }
    
    if (dueNotifications.length > 0) {
      this.logger.debug('[NotificationService] Processed retry queue', {
        processed: dueNotifications.length,
        remaining: this.retryQueue.length,
      });
    }
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  /**
   * Get notification by ID
   */
  getNotification(notificationId: string): Notification | undefined {
    return this.notifications.get(notificationId);
  }

  /**
   * Get delivery attempts for a notification
   */
  getDeliveryAttempts(notificationId: string): DeliveryAttempt[] {
    return this.deliveryAttempts.get(notificationId) || [];
  }

  /**
   * Get dead letter queue
   */
  getDeadLetterQueue(): Notification[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Get retry queue
   */
  getRetryQueue(): Notification[] {
    return [...this.retryQueue];
  }

  /**
   * Get notification stats
   */
  getStats(): {
    total: number;
    pending: number;
    sent: number;
    failed: number;
    retryQueue: number;
    deadLetter: number;
    dedupeEntries: number;
  } {
    let pending = 0;
    let sent = 0;
    let failed = 0;
    
    for (const notification of this.notifications.values()) {
      switch (notification.status) {
        case 'PENDING': pending++; break;
        case 'SENT': sent++; break;
        case 'FAILED': failed++; break;
      }
    }
    
    return {
      total: this.notifications.size,
      pending,
      sent,
      failed,
      retryQueue: this.retryQueue.length,
      deadLetter: this.deadLetterQueue.length,
      dedupeEntries: this.dedupeTracker.size,
    };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Generate unique notification ID
   */
  private generateNotificationId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generate idempotency key (for external deduplication)
   */
  generateIdempotencyKey(
    incidentId: string,
    playbookId: string,
    template: string,
    channel: NotificationChannelType,
    recipient?: string,
  ): string {
    const timeBucket = Math.floor(Date.now() / DEDUPE_WINDOW_MS);
    const data = `${incidentId}:${playbookId}:${template}:${channel}:${recipient || 'default'}:${timeBucket}`;
    
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `idem_${Math.abs(hash).toString(36)}`;
  }

  // ============================================================================
  // TEST HELPERS
  // ============================================================================

  /**
   * Clear all state (for testing)
   */
  clear(): void {
    this.notifications.clear();
    this.deliveryAttempts.clear();
    this.dedupeTracker.clear();
    this.deadLetterQueue.length = 0;
    this.retryQueue.length = 0;
    this.channelConfigs.clear();
  }
}
