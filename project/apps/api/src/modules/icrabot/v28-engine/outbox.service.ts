/**
 * v28 Outbox Service
 * 
 * Action queue sistemi - idempotent action dispatch.
 * Python v28_decision_timeline/db/schema.sql'den port edildi.
 * 
 * Action Types:
 * - open_lock: Redis/DB lock açma
 * - enqueue: Celery/queue'ya iş ekleme
 * - send_email: Email gönderme
 * - send_sms: SMS gönderme
 * - uyap_submit: UYAP'a belge gönderme
 * - notify_client: Müvekkile bildirim
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  getIcrabotOutboxMaxAttempts,
  getIcrabotOutboxRetryBaseMs,
} from './outbox.constants';

export type OutboxStatus = 'pending' | 'sent' | 'done' | 'failed' | 'dead';

export interface OutboxFailureMarkResult {
  status: Extract<OutboxStatus, 'failed' | 'dead'>;
  attemptCount: number;
  nextRetryAt: Date | null;
}

export interface CreateOutboxActionParams {
  caseId: string;
  /**
   * outbox-tenancy Adım A: write-time tenant capture — ZORUNLU (fail-closed).
   * Üreticiler tenantId taşımak zorunda; sessiz NULL yazımı tip + runtime guard ile engellenir.
   */
  tenantId: string;
  actionType: string;
  idempotencyKey: string;
  payload: Record<string, any>;
  runId?: string;
}

// OpenAPI spec uyumlu response format
export interface OutboxActionResponse {
  action_id: string;
  run_id: string | null;
  case_id: string;
  action_type: string;
  idempotency_key: string;
  payload: Record<string, any>;
  status: OutboxStatus;
  attempt_count: number;
  last_error: Record<string, any> | null;
  next_retry_at: string | null;
  created_at: string;
  updated_at: string | null;
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private readonly maxAttempts = getIcrabotOutboxMaxAttempts();
  private readonly retryBaseMs = getIcrabotOutboxRetryBaseMs();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Outbox'a yeni action ekler (idempotent)
   * Aynı idempotencyKey varsa null döner
   *
   * @remarks
   * Çağrıldığı yerler:
   * - EngineRunnerService.<rule-action-dispatch>() → engine-runner.service.ts:220 (kural aksiyonu enqueue; tenantId=scope)
   * - SeedService.<seed-uyap-events>() → seed.service.ts:110 (demo/seed enqueue; tenantId=seed)
   * NOT: domain-event-ingest.service.ts:122 outbox satırını DOĞRUDAN (bu servisi baypas ederek) yazar;
   *      orada da ayrı runtime guard var (Adım A).
   * outbox-tenancy Adım A: tenantId ZORUNLU — fail-closed guard ile sessiz NULL yazımı engellenir.
   */
  async createAction(params: CreateOutboxActionParams): Promise<string | null> {
    // outbox-tenancy Adım A: fail-closed tenant guard. Tip zorunlu kılsa da untyped/`as any`
    // çağrılara karşı runtime koruma; NULL tenant satırı yazmak yerine throw.
    if (!params.tenantId) {
      throw new Error(
        `outbox_tenant_required: createAction tenantId olmadan çağrıldı (caseId=${params.caseId}, actionType=${params.actionType})`,
      );
    }

    // Check idempotency
    const existing = await (this.prisma as any).icrabotOutboxAction.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });

    if (existing) {
      this.logger.debug(`Outbox action duplicate (ignored): ${params.actionType} - ${params.idempotencyKey}`);
      return null;
    }

    const action = await (this.prisma as any).icrabotOutboxAction.create({
      data: {
        caseId: params.caseId,
        tenantId: params.tenantId, // write-time tenant capture (Adım A: zorunlu + guard'lı)
        actionType: params.actionType,
        idempotencyKey: params.idempotencyKey,
        payload: params.payload,
        runId: params.runId,
        status: 'pending',
        attemptCount: 0,
      },
    });

    this.logger.debug(`Outbox action created: ${params.actionType} (id=${action.id})`);
    return action.id;
  }

  /**
   * Pending action'ları döner (dispatch için).
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * /// - ActionHandlerService.processPendingActions() → pending action dispatch listesi
   * /// - OutboxController.getPending() → GET /icrabot/v28/outbox/pending (operasyonel görünürlük)
   * /// </remarks>
   */
  async getPendingActions(limit = 100): Promise<any[]> {
    return (this.prisma as any).icrabotOutboxAction.findMany({
      where: {
        status: 'pending',
        OR: [
          { nextRetryAt: null },
          { nextRetryAt: { lte: new Date() } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }
  /**
   * Retry edilebilir failed action'ları döner.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * /// - ActionHandlerService.processRetryableActions() → failed + due action retry dispatch listesi
   * /// </remarks>
   */
  async getRetryableActions(limit = 100): Promise<any[]> {
    return (this.prisma as any).icrabotOutboxAction.findMany({
      where: {
        status: 'failed',
        nextRetryAt: { lte: new Date() },
        attemptCount: { lt: this.maxAttempts },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Dispatch öncesi action'ı atomik şekilde claim eder.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * /// - ActionHandlerService.dispatch() → cron/manual çakışmasında aynı action'ın çift çalışmasını engeller
   * /// </remarks>
   */
  async claimForProcessing(actionId: string): Promise<boolean> {
    const result = await (this.prisma as any).icrabotOutboxAction.updateMany({
      where: {
        id: actionId,
        status: { in: ['pending', 'failed'] },
        attemptCount: { lt: this.maxAttempts },
      },
      data: { status: 'sent' },
    });

    return result.count === 1;
  }
  /**
   * Action'ı başarılı olarak işaretler.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * /// - ActionHandlerService.dispatch() → handler başarı sonrası outbox action tamamlama
   * /// </remarks>
   */
  async markDone(actionId: string): Promise<void> {
    await (this.prisma as any).icrabotOutboxAction.update({
      where: { id: actionId },
      data: {
        status: 'done',
        attemptCount: { increment: 1 },
        lastError: null,
        nextRetryAt: null,
      },
    });
  }
  /**
   * Action'ı başarısız olarak işaretle (retry için).
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * /// - ActionHandlerService.dispatch() → handler hatası sonrası retry/dead-letter status güncellemesi
   * /// </remarks>
   */
  async markFailed(
    actionId: string,
    error: string,
    retryDelayMs = this.retryBaseMs,
  ): Promise<OutboxFailureMarkResult> {
    const action = await (this.prisma as any).icrabotOutboxAction.findUnique({
      where: { id: actionId },
    });

    const newAttemptCount = (action?.attemptCount || 0) + 1;
    const isDead = newAttemptCount >= this.maxAttempts;
    const nextRetryAt = isDead
      ? null
      : new Date(Date.now() + retryDelayMs * Math.pow(2, newAttemptCount - 1));

    await (this.prisma as any).icrabotOutboxAction.update({
      where: { id: actionId },
      data: {
        status: isDead ? 'dead' : 'failed',
        attemptCount: newAttemptCount,
        lastError: { error, timestamp: new Date().toISOString() },
        nextRetryAt,
      },
    });

    return {
      status: isDead ? 'dead' : 'failed',
      attemptCount: newAttemptCount,
      nextRetryAt,
    };
  }

  /**
   * Action'ı terminal dead-letter durumuna alır.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * /// - ActionHandlerService.dispatch() → tenantId eksik action fail-closed terminal kapatma
   * /// </remarks>
   */
  async markDeadLetter(actionId: string, error: Record<string, any>): Promise<void> {
    await (this.prisma as any).icrabotOutboxAction.update({
      where: { id: actionId },
      data: {
        status: 'dead',
        lastError: { ...error, timestamp: new Date().toISOString() },
        nextRetryAt: null,
      },
    });
  }
  /**
   * Action'ı sent olarak işaretle (processing)
   */
  async markSent(actionId: string): Promise<void> {
    await (this.prisma as any).icrabotOutboxAction.update({
      where: { id: actionId },
      data: { status: 'sent' },
    });
  }

  /**
   * Dosya için outbox action'larını döner
   */
  async getActionsByCaseId(
    caseId: string,
    options?: {
      status?: OutboxStatus;
      actionType?: string;
      limit?: number;
    },
  ): Promise<any[]> {
    const where: any = { caseId };
    if (options?.status) where.status = options.status;
    if (options?.actionType) where.actionType = options.actionType;

    return (this.prisma as any).icrabotOutboxAction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
    });
  }

  /**
   * Outbox istatistiklerini döner
   */
  async getStats(): Promise<Record<OutboxStatus, number>> {
    const stats = await (this.prisma as any).icrabotOutboxAction.groupBy({
      by: ['status'],
      _count: true,
    });

    const result: Record<string, number> = {
      pending: 0,
      sent: 0,
      done: 0,
      failed: 0,
      dead: 0,
    };

    for (const s of stats) {
      result[s.status] = s._count;
    }

    return result as Record<OutboxStatus, number>;
  }

  /**
   * Dead letter queue'daki action'ları döner
   */
  async getDeadLetterQueue(limit = 100): Promise<any[]> {
    return (this.prisma as any).icrabotOutboxAction.findMany({
      where: { status: 'dead' },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Dead action'ı retry için pending'e çevir
   */
  async retryDeadAction(actionId: string): Promise<void> {
    await (this.prisma as any).icrabotOutboxAction.update({
      where: { id: actionId },
      data: {
        status: 'pending',
        attemptCount: 0,
        lastError: null,
        nextRetryAt: null,
      },
    });
  }

  /**
   * Tek bir action döner
   * OpenAPI spec: GET /actions/{action_id}
   */
  async getAction(actionId: string): Promise<OutboxActionResponse | null> {
    const action = await (this.prisma as any).icrabotOutboxAction.findUnique({
      where: { id: actionId },
    });
    return action ? this.toApiFormat(action) : null;
  }

  /**
   * DB formatından API formatına dönüştürür (snake_case)
   */
  private toApiFormat(action: any): OutboxActionResponse {
    return {
      action_id: action.id,
      run_id: action.runId || null,
      case_id: action.caseId,
      action_type: action.actionType,
      idempotency_key: action.idempotencyKey,
      payload: action.payload,
      status: action.status,
      attempt_count: action.attemptCount,
      last_error: action.lastError && Object.keys(action.lastError).length > 0 
        ? action.lastError 
        : null,
      next_retry_at: action.nextRetryAt?.toISOString() || null,
      created_at: action.createdAt.toISOString(),
      updated_at: action.updatedAt?.toISOString() || null,
    };
  }
}
