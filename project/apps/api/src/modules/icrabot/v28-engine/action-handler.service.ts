/**
 * v28 Action Handler Service
 * 
 * Outbox action'larını işleyen servis.
 * Python v28_factstore_actions/engine_v28/actions/handlers.py'den port edildi.
 * Python v28_factstore_actions/engine_v28/actions/router.py'den port edildi.
 * Python v28_policy_feedback/engine_v28/patches/dispatch_outbox_with_feedback.py'den port edildi.
 * 
 * Action Types:
 * - open_lock: Distributed lock açma
 * - release_lock: Lock serbest bırakma
 * - enqueue: Queue'ya iş ekleme
 * - send_email: Email gönderme
 * - send_sms: SMS gönderme
 * - send_notification: In-app bildirim
 * - uyap_submit: UYAP'a belge gönderme
 * - update_case_status: Dosya durumu güncelleme
 * - create_task: Görev oluşturma
 * - set_fact: Fact değeri set etme
 * - set_flag: Flag değeri set etme
 * 
 * Feedback Integration:
 * - Action sonuçları FactStore'a yazılır
 * - actions.<action_type>.last_status, last_action_id, last_result
 * - actions.last.success_at / fail_at timestamps
 */
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from './outbox.service';
import { TimelineService } from './timeline.service';
import { FactStoreService } from './factstore.service';
import { maskPhone } from '../../../common/pii-mask.util';

export type ActionHandler = (payload: Record<string, any>, caseId: string) => Promise<Record<string, any> | void>;

export interface ActionDispatchResult {
  success: boolean;
  actionId: string;
  actionType: string;
  result?: Record<string, any>;
  error?: string;
  retryScheduled?: boolean;
  deadLettered?: boolean;
  feedbackWritten?: boolean;
}

export interface LockInfo {
  key: string;
  expiresAt: number;
  owner?: string;
}

@Injectable()
export class ActionHandlerService {
  private readonly logger = new Logger(ActionHandlerService.name);
  private readonly handlers: Map<string, ActionHandler> = new Map();
  private readonly locks: Map<string, LockInfo> = new Map(); // In-memory lock (dev only)
  private readonly MAX_ATTEMPTS = 8;
  private readonly RETRY_BASE_SECONDS = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly timeline: TimelineService,
    private readonly factStore: FactStoreService,
  ) {
    this.registerDefaultHandlers();
    this.startLockCleanupInterval();
  }

  /**
   * Handler register eder
   */
  register(actionType: string, handler: ActionHandler): void {
    this.handlers.set(actionType, handler);
    this.logger.log(`Action handler registered: ${actionType}`);
  }

  /**
   * Action'ı dispatch eder (Python router.dispatch pattern + feedback)
   */
  async dispatch(actionId: string): Promise<ActionDispatchResult> {
    const action = await (this.prisma as any).icrabotOutboxAction.findUnique({
      where: { id: actionId },
    });

    if (!action) {
      return {
        success: false,
        actionId,
        actionType: 'unknown',
        error: `Action not found: ${actionId}`,
      };
    }

    const handler = this.handlers.get(action.actionType);
    if (!handler) {
      return {
        success: false,
        actionId,
        actionType: action.actionType,
        error: `No handler for action type: ${action.actionType}`,
      };
    }

    // outbox.tenantId DB-NOT NULL (Adım B) → her satır tenant taşır. caseId→tenant fallback
    // KALDIRILDI (Adım C / bridge full removal); yakalanan tenant'a doğrudan güvenilir.
    const effectiveTenantId = action.tenantId;

    // Mark as sent (processing)
    await this.outbox.markSent(actionId);

    try {
      // Handler may return a result object
      const handlerResult = await handler(action.payload, action.caseId);
      await this.outbox.markDone(actionId);

      // Timeline: OUTCOME success
      await this.timeline.addEntry({
        caseId: action.caseId,
        tenantId: effectiveTenantId, // fail-closed resolved tenant (boundary hardening)
        type: 'OUTCOME',
        title: `Action done: ${action.actionType}`,
        severity: 'info',
        body: { 
          action_id: actionId, 
          action_type: action.actionType,
          status: 'done',
          result: handlerResult,
        },
        runId: action.runId,
        source: 'system',
      });

      // Write feedback facts (v28_policy_feedback integration)
      await this.writeActionFeedback(
        action.caseId,
        action.actionType,
        actionId,
        'done',
        handlerResult as Record<string, any> | undefined,
        action.runId,
        effectiveTenantId,
      );

      return {
        success: true,
        actionId,
        actionType: action.actionType,
        result: handlerResult as Record<string, any> | undefined,
        feedbackWritten: true,
      };

    } catch (error: any) {
      // Get updated action to check attempt count
      const updatedAction = await (this.prisma as any).icrabotOutboxAction.findUnique({
        where: { id: actionId },
      });
      
      const newAttemptCount = (updatedAction?.attemptCount || 0) + 1;
      const isDead = newAttemptCount >= this.MAX_ATTEMPTS;

      await this.outbox.markFailed(actionId, error.message);

      if (isDead) {
        // Timeline: OUTCOME dead-lettered
        await this.timeline.addEntry({
          caseId: action.caseId,
          tenantId: effectiveTenantId, // fail-closed resolved tenant (boundary hardening)
          type: 'OUTCOME',
          title: `Action dead-lettered: ${action.actionType}`,
          severity: 'critical',
          body: { 
            action_id: actionId, 
            action_type: action.actionType,
            status: 'dead',
            last_error: { error: error.message },
            attempt_count: newAttemptCount,
          },
          runId: action.runId,
          source: 'system',
        });

        // Write feedback facts for dead action
        await this.writeActionFeedback(
          action.caseId,
          action.actionType,
          actionId,
          'dead',
          { error: error.message },
          action.runId,
          effectiveTenantId,
        );

        return {
          success: false,
          actionId,
          actionType: action.actionType,
          error: error.message,
          deadLettered: true,
          feedbackWritten: true,
        };
      } else {
        // Timeline: OUTCOME failed (will retry)
        const retryDelayMs = this.RETRY_BASE_SECONDS * 1000 * Math.pow(2, newAttemptCount - 1);
        const nextRetryAt = new Date(Date.now() + retryDelayMs);
        
        await this.timeline.addEntry({
          caseId: action.caseId,
          tenantId: effectiveTenantId, // fail-closed resolved tenant (boundary hardening)
          type: 'OUTCOME',
          title: `Action failed (will retry): ${action.actionType}`,
          severity: 'warn',
          body: { 
            action_id: actionId, 
            action_type: action.actionType,
            status: 'pending',
            last_error: { error: error.message },
            attempt_count: newAttemptCount,
            next_retry_at: nextRetryAt.toISOString(),
          },
          runId: action.runId,
          source: 'system',
        });

        // Write feedback facts for failed action
        await this.writeActionFeedback(
          action.caseId,
          action.actionType,
          actionId,
          'failed',
          { error: error.message },
          action.runId,
          effectiveTenantId,
        );

        return {
          success: false,
          actionId,
          actionType: action.actionType,
          error: error.message,
          retryScheduled: true,
          feedbackWritten: true,
        };
      }
    }
  }

  /**
   * Action feedback'i FactStore'a yazar (v28_policy_feedback)
   */
  private async writeActionFeedback(
    caseId: string,
    actionType: string,
    actionId: string,
    status: 'done' | 'failed' | 'dead',
    result?: Record<string, any>,
    runId?: string,
    tenantId?: string, // fail-closed resolved tenant (dispatch'ten gelir; boundary hardening)
  ): Promise<void> {
    // fail-closed: tenant yoksa feedback timeline'ı yazma (non-critical; null yazımı YOK).
    // Pratikte dispatch daima effectiveTenantId geçer → tetiklenmez; tip daraltması + savunma.
    if (!tenantId) {
      this.logger.warn(`Action feedback skipped: tenantId yok (actionId=${actionId})`);
      return;
    }
    try {
      const now = new Date().toISOString();

      const facts: Record<string, any> = {
        [`actions.${actionType}.last_status`]: status,
        [`actions.${actionType}.last_action_id`]: actionId,
        [`actions.last.status`]: status,
      };

      if (status === 'done') {
        facts['actions.last.success_at'] = now;
        facts[`actions.${actionType}.last_success_at`] = now;
      } else {
        facts['actions.last.fail_at'] = now;
        facts[`actions.${actionType}.last_fail_at`] = now;
      }

      if (result !== undefined) {
        facts[`actions.${actionType}.last_result`] = result;
      }

      await this.factStore.write(
        caseId,
        facts,
        {},
        {
          source: 'action_feedback',
          action_id: actionId,
          action_type: actionType,
          status,
        },
      );

      // Timeline entry for feedback write
      await this.timeline.addEntry({
        caseId,
        tenantId, // fail-closed resolved tenant (dispatch effectiveTenantId)
        type: 'FACT_WRITE',
        title: 'Action feedback written',
        severity: 'info',
        body: { facts, action_id: actionId, action_type: actionType, status },
        runId,
        source: 'system',
      });

      this.logger.debug(`Action feedback written: ${actionType} -> ${status} for case ${caseId}`);
    } catch (e: any) {
      // Don't fail the action if feedback write fails
      this.logger.warn(`Failed to write action feedback: ${e.message}`);
    }
  }

  /**
   * Pending action'ları işler (Python dispatch_outbox.py pattern)
   */
  async processPendingActions(limit = 10): Promise<ActionDispatchResult[]> {
    const actions = await this.outbox.getPendingActions(limit);
    const results: ActionDispatchResult[] = [];

    for (const action of actions) {
      const result = await this.dispatch(action.id);
      results.push(result);
      
      if (!result.success) {
        this.logger.error(`Failed to process action ${action.id}: ${result.error}`);
      }
    }

    return results;
  }

  /**
   * Retry edilebilir action'ları işler
   */
  async processRetryableActions(limit = 10): Promise<ActionDispatchResult[]> {
    const now = new Date();
    const actions = await (this.prisma as any).icrabotOutboxAction.findMany({
      where: {
        status: 'pending',
        nextRetryAt: { lte: now },
        attemptCount: { lt: this.MAX_ATTEMPTS },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: limit,
    });

    const results: ActionDispatchResult[] = [];
    for (const action of actions) {
      const result = await this.dispatch(action.id);
      results.push(result);
    }

    return results;
  }

  /**
   * Varsayılan handler'ları register eder
   */
  private registerDefaultHandlers(): void {
    // Open Lock Handler (Python handle_open_lock)
    this.register('open_lock', async (payload, caseId) => {
      const { key, ttl_sec = 3600, owner } = payload;
      if (!key) throw new Error('open_lock requires payload.key');

      const lockKey = `${caseId}:${key}`;
      const expiresAt = Date.now() + ttl_sec * 1000;
      
      if (this.locks.has(lockKey)) {
        const existing = this.locks.get(lockKey)!;
        if (existing.expiresAt > Date.now()) {
          this.logger.debug(`Lock already exists: ${lockKey}`);
          return; // Lock exists, treat as success (Python behavior)
        }
      }

      this.locks.set(lockKey, { key: lockKey, expiresAt, owner });
      this.logger.debug(`Lock acquired: ${lockKey} (expires in ${ttl_sec}s)`);
    });

    // Release Lock Handler
    this.register('release_lock', async (payload, caseId) => {
      const { key } = payload;
      if (!key) throw new Error('release_lock requires payload.key');

      const lockKey = `${caseId}:${key}`;
      this.locks.delete(lockKey);
      this.logger.debug(`Lock released: ${lockKey}`);
    });

    // Enqueue Handler (Python handle_enqueue)
    this.register('enqueue', async (payload, caseId) => {
      const { queue, ...data } = payload;
      if (!queue) throw new Error('enqueue requires payload.queue');

      // DB-based queue (production'da Celery/BullMQ kullanılmalı)
      await (this.prisma as any).icrabotQueueItem.create({
        data: {
          queue,
          caseId,
          payload: data,
          status: 'pending',
        },
      });

      this.logger.debug(`Enqueued to ${queue}: caseId=${caseId}`);
    });

    // Send Email Handler (Python handle_send_email)
    this.register('send_email', async (payload, caseId) => {
      const { to, subject, body, template, from_email } = payload;
      if (!to || !subject) throw new Error('send_email requires to and subject');

      const toList = Array.isArray(to) ? to : [to];
      
      // Email gönderimi (production'da gerçek email servisi kullanılmalı)
      this.logger.log(`[EMAIL] To: ${toList.join(', ')}, Subject: ${subject}`);
      
      // Log to DB
      await (this.prisma as any).icrabotEmailLog.create({
        data: {
          caseId,
          to: toList.join(','),
          subject,
          body: body || '',
          template,
          fromEmail: from_email,
          status: 'sent',
        },
      });
    });

    // Send SMS Handler
    this.register('send_sms', async (payload, caseId) => {
      const { phone, message } = payload;
      if (!phone || !message) throw new Error('send_sms requires phone and message');

      // SMS gönderimi (production'da gerçek SMS servisi kullanılmalı)
      this.logger.log(`[SMS] To: ${maskPhone(phone)}, Message: ${message.substring(0, 50)}...`);

      // Log to DB
      await (this.prisma as any).icrabotSmsLog.create({
        data: {
          caseId,
          phone,
          message,
          status: 'sent',
        },
      });
    });

    // Send Notification Handler
    this.register('send_notification', async (payload, caseId) => {
      const { type, recipient, title, message } = payload;

      // In-app notification
      await (this.prisma as any).icrabotNotification.create({
        data: {
          caseId,
          type: type || 'info',
          recipient: recipient || 'all',
          title: title || 'Bildirim',
          message: message || '',
          isRead: false,
        },
      });

      this.logger.debug(`Notification created: ${type} for ${recipient}`);
    });

    // UYAP Submit Handler
    this.register('uyap_submit', async (payload, caseId) => {
      const { document_type, document_id } = payload;

      // UYAP submission placeholder
      // Gerçek implementasyonda UYAP API'sine bağlanılacak
      this.logger.log(`[UYAP] Submit document: ${document_type} (${document_id}) for case ${caseId}`);

      // Log submission attempt
      await (this.prisma as any).icrabotUyapSubmission.create({
        data: {
          caseId,
          documentType: document_type,
          documentId: document_id,
          status: 'pending',
          payload,
        },
      });
    });

    // Update Case Status Handler
    this.register('update_case_status', async (payload, caseId) => {
      const { status, reason } = payload;

      await this.prisma.case.update({
        where: { id: caseId },
        data: {
          status,
        },
      });

      // Add to lifecycle separately - use INITIAL stage for system actions
      await this.prisma.caseLifecycle.create({
        data: {
          caseId,
          stage: 'INITIAL',
          action: 'STATUS_CHANGED',
          description: reason || `Status changed to ${status}`,
          triggeredBy: 'SYSTEM',
        },
      });

      this.logger.debug(`Case ${caseId} status updated to ${status}`);
    });

    // Create Task Handler
    this.register('create_task', async (payload, caseId) => {
      const { title, description, dueDate, assignee, priority } = payload;

      await (this.prisma as any).icrabotTask.create({
        data: {
          caseId,
          title,
          description,
          dueDate: dueDate ? new Date(dueDate) : null,
          assignee,
          priority: priority || 'medium',
          status: 'pending',
        },
      });

      this.logger.debug(`Task created: ${title} for case ${caseId}`);
    });

    // Set Fact Handler (FactStore integration)
    this.register('set_fact', async (payload, caseId) => {
      const { key, value, meta } = payload;
      if (!key) throw new Error('set_fact requires payload.key');

      await this.factStore.write(caseId, { [key]: value }, {}, meta || { source: 'action' });
      this.logger.debug(`Fact set: ${key} for case ${caseId}`);
    });

    // Set Flag Handler (FactStore integration)
    this.register('set_flag', async (payload, caseId) => {
      const { key, value, meta } = payload;
      if (!key) throw new Error('set_flag requires payload.key');

      await this.factStore.write(caseId, {}, { [key]: Boolean(value) }, meta || { source: 'action' });
      this.logger.debug(`Flag set: ${key}=${value} for case ${caseId}`);
    });

    // Batch Set Facts Handler
    this.register('batch_set_facts', async (payload, caseId) => {
      const { facts, flags, meta } = payload;

      await this.factStore.batchWrite(caseId, facts || {}, flags || {}, meta || { source: 'action' });
      this.logger.debug(`Batch facts/flags set for case ${caseId}`);
    });

    // HTTP Webhook Handler
    this.register('webhook', async (payload, caseId) => {
      const { url, method = 'POST', headers, body } = payload;
      if (!url) throw new Error('webhook requires payload.url');

      // Log webhook attempt (actual HTTP call would be here in production)
      this.logger.log(`[WEBHOOK] ${method} ${url} for case ${caseId}`);

      await (this.prisma as any).icrabotWebhookLog.create({
        data: {
          caseId,
          url,
          method,
          headers,
          body,
          status: 'sent',
        },
      });
    });

    this.logger.log(`Registered ${this.handlers.size} default action handlers`);
  }

  /**
   * Lock'u kontrol eder
   */
  isLocked(caseId: string, key: string): boolean {
    const lockKey = `${caseId}:${key}`;
    const lock = this.locks.get(lockKey);
    if (!lock) return false;
    if (lock.expiresAt <= Date.now()) {
      this.locks.delete(lockKey);
      return false;
    }
    return true;
  }

  /**
   * Lock'u serbest bırakır
   */
  releaseLock(caseId: string, key: string): void {
    const lockKey = `${caseId}:${key}`;
    this.locks.delete(lockKey);
    this.logger.debug(`Lock released: ${lockKey}`);
  }

  /**
   * Tüm aktif lock'ları listeler
   */
  getActiveLocks(): LockInfo[] {
    const now = Date.now();
    const active: LockInfo[] = [];
    
    for (const [key, lock] of this.locks.entries()) {
      if (lock.expiresAt > now) {
        active.push(lock);
      }
    }
    
    return active;
  }

  /**
   * Lock bilgisini döner
   */
  getLockInfo(caseId: string, key: string): LockInfo | null {
    const lockKey = `${caseId}:${key}`;
    const lock = this.locks.get(lockKey);
    if (!lock || lock.expiresAt <= Date.now()) {
      return null;
    }
    return lock;
  }

  /**
   * Expired lock'ları temizler
   */
  private cleanupExpiredLocks(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, lock] of this.locks.entries()) {
      if (lock.expiresAt <= now) {
        this.locks.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired locks`);
    }
  }

  /**
   * Lock cleanup interval başlatır
   */
  private startLockCleanupInterval(): void {
    // Her 5 dakikada bir expired lock'ları temizle
    setInterval(() => this.cleanupExpiredLocks(), 5 * 60 * 1000);
  }

  /**
   * Handler listesini döner
   */
  getRegisteredHandlers(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Handler var mı kontrol eder
   */
  hasHandler(actionType: string): boolean {
    return this.handlers.has(actionType);
  }

  /**
   * Action'ı doğrudan çalıştırır (outbox'a eklemeden)
   */
  async executeDirectly(actionType: string, payload: Record<string, any>, caseId: string): Promise<void> {
    const handler = this.handlers.get(actionType);
    if (!handler) {
      throw new Error(`No handler for action type: ${actionType}`);
    }
    await handler(payload, caseId);
  }

  /**
   * Batch action dispatch
   */
  async dispatchBatch(actionIds: string[]): Promise<ActionDispatchResult[]> {
    const results: ActionDispatchResult[] = [];
    
    for (const actionId of actionIds) {
      const result = await this.dispatch(actionId);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Action istatistiklerini döner
   */
  async getHandlerStats(): Promise<Record<string, { total: number; success: number; failed: number }>> {
    const stats: Record<string, { total: number; success: number; failed: number }> = {};
    
    for (const actionType of this.handlers.keys()) {
      const [total, success, failed] = await Promise.all([
        (this.prisma as any).icrabotOutboxAction.count({ where: { actionType } }),
        (this.prisma as any).icrabotOutboxAction.count({ where: { actionType, status: 'done' } }),
        (this.prisma as any).icrabotOutboxAction.count({ where: { actionType, status: 'dead' } }),
      ]);
      
      stats[actionType] = { total, success, failed };
    }
    
    return stats;
  }
}
