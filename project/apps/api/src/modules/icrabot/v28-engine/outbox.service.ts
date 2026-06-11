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

export type OutboxStatus = 'pending' | 'sent' | 'done' | 'failed' | 'dead';

export interface CreateOutboxActionParams {
  caseId: string;
  /** outbox-tenancy Phase 1: write-time tenant capture (üretici elindeyse yazar; nullable). */
  tenantId?: string;
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

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Outbox'a yeni action ekler (idempotent)
   * Aynı idempotencyKey varsa null döner
   */
  async createAction(params: CreateOutboxActionParams): Promise<string | null> {
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
        tenantId: params.tenantId ?? null, // write-time tenant capture (Phase 1; nullable)
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
   * Pending action'ları döner (dispatch için)
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
   * Action'ı başarılı olarak işaretle
   */
  async markDone(actionId: string): Promise<void> {
    await (this.prisma as any).icrabotOutboxAction.update({
      where: { id: actionId },
      data: {
        status: 'done',
        attemptCount: { increment: 1 },
      },
    });
  }

  /**
   * Action'ı başarısız olarak işaretle (retry için)
   */
  async markFailed(actionId: string, error: string, retryDelayMs = 60000): Promise<void> {
    const action = await (this.prisma as any).icrabotOutboxAction.findUnique({
      where: { id: actionId },
    });

    const newAttemptCount = (action?.attemptCount || 0) + 1;
    const maxAttempts = 5;

    await (this.prisma as any).icrabotOutboxAction.update({
      where: { id: actionId },
      data: {
        status: newAttemptCount >= maxAttempts ? 'dead' : 'failed',
        attemptCount: newAttemptCount,
        lastError: { error, timestamp: new Date().toISOString() },
        nextRetryAt: newAttemptCount < maxAttempts 
          ? new Date(Date.now() + retryDelayMs * Math.pow(2, newAttemptCount - 1))
          : null,
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
