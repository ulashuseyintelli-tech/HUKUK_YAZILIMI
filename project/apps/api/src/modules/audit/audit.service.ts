import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { projectAuditLogSafe } from './audit-safe-projection';

export interface AuditLogInput {
  tenantId: string;
  action: string;
  entityType: string;
  entityId?: string;
  userId?: string;
  userName?: string;
  userIp?: string;
  userAgent?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  description?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: input.tenantId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          userId: input.userId,
          userName: input.userName,
          userIp: input.userIp,
          userAgent: input.userAgent,
          oldValues: input.oldValues,
          newValues: input.newValues,
          description: input.description,
          metadata: input.metadata,
        },
      });
    } catch (error) {
      this.logger.error(`Audit log failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Transaction-içi audit yazımı (C0-a). log()'tan farkı: hata YUTMAZ — çağıran
   * mutation ile AYNI $transaction içinde tx.auditLog.create yapar; audit yazılamazsa
   * exception fırlatır → çağıran transaction ROLLBACK olur (audit'siz mutation kalmaz).
   * Mevcut log() davranışı DEĞİŞMEZ (diğer çağıranlar etkilenmez).
   *
   * Çağrıldığı yerler:
   *  - ClientService.create/update/remove() → client mutasyonu + audit aynı tx içinde
   */
  async logInTransaction(tx: Prisma.TransactionClient, input: AuditLogInput): Promise<void> {
    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        userId: input.userId,
        userName: input.userName,
        userIp: input.userIp,
        userAgent: input.userAgent,
        oldValues: input.oldValues,
        newValues: input.newValues,
        description: input.description,
        metadata: input.metadata,
      },
    });
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AuditController.getLogs() → GET /audit/logs (sayfalı audit kayıtlarını döndürür)
  /// </remarks>
  async getLogs(
    tenantId: string,
    filters?: {
      action?: string;
      entityType?: string;
      entityId?: string;
      userId?: string;
      startDate?: Date;
      endDate?: Date;
    },
    page = 1,
    limit = 50,
  ) {
    const where: any = { tenantId };

    if (filters?.action) where.action = filters.action;
    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.entityId) where.entityId = filters.entityId;
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      logs: logs.map((log) => this.withSafeProjection(log)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AuditController.getEntityHistory() → GET /audit/entity-history (tek entity audit geçmişini döndürür)
  /// </remarks>
  async getEntityHistory(tenantId: string, entityType: string, entityId: string) {
    const logs = await this.prisma.auditLog.findMany({
      where: { tenantId, entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });
    return logs.map((log) => this.withSafeProjection(log));
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AuditController.getUserActivity() → GET /audit/user-activity (kullanıcı aktivite audit kayıtlarını döndürür)
  /// </remarks>
  async getUserActivity(tenantId: string, userId: string, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        userId,
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'desc' },
    });
    return logs.map((log) => this.withSafeProjection(log));
  }

  /**
   * P3-1b — Guided-Open confirm-token REPLAY tespiti (best-effort, salt-okuma).
   *
   * Aynı nonce ile DAHA ÖNCE başarıyla tüketilmiş (result='CONSUMED') bir
   * CONFIRM_TOKEN_CONSUMED kaydı var mı? Yalnız indeksli kolonlarla (tenantId/action/
   * entityType/entityId=targetRef) sorgular, nonce/result/actionCode'u metadata'dan tarar.
   * ŞEMA DEĞİŞİKLİĞİ YOK; yeni tablo YOK.
   *
   * Best-effort sözleşme: katı tek-kullanımlık DB-unique garantisi DEĞİL. Okuma hatası
   * akışı bozmaz → "önceki tüketim yok" (false) döner + loglar (kısa TTL + binding korur).
   *
   * Çağrıldığı yerler:
   *  - ConfirmationTokenService.consume (P3-1b; henüz hiçbir route'a bağlı değil)
   */
  async hasPriorConfirmTokenConsumption(input: {
    tenantId: string;
    targetRef: string;
    nonce: string;
    actionCode: string;
  }): Promise<boolean> {
    try {
      const rows = await this.prisma.auditLog.findMany({
        where: {
          tenantId: input.tenantId,
          action: 'CONFIRM_TOKEN_CONSUMED',
          entityType: 'GUIDED_OPEN_CONFIRM',
          entityId: input.targetRef,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      return rows.some((row) => {
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        return (
          meta.nonce === input.nonce &&
          meta.result === 'CONSUMED' &&
          meta.actionCode === input.actionCode
        );
      });
    } catch (error) {
      this.logger.error(
        `confirm-token replay read failed: ${(error as Error)?.message ?? error}`,
      );
      return false;
    }
  }

  private withSafeProjection<T extends Parameters<typeof projectAuditLogSafe>[0]>(
    log: T,
  ): T & { safeProjection: ReturnType<typeof projectAuditLogSafe> } {
    return { ...log, safeProjection: projectAuditLogSafe(log) };
  }
}
