import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { projectAuditLogSafe } from './audit-safe-projection';
import { AuditActorType, AuditDecisionResult } from './audit-types';

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
  // CAP-09A Audit Attribution Foundation (additive, opsiyonel — mevcut çağıranlar etkilenmez)
  actorType?: AuditActorType;
  decisionResult?: AuditDecisionResult;
  reasonCode?: string;
  correlationId?: string;
  requestId?: string;
  policyRef?: string;
  policyVersion?: string;
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
          actorType: input.actorType,
          decisionResult: input.decisionResult,
          reasonCode: input.reasonCode,
          correlationId: input.correlationId,
          requestId: input.requestId,
          policyRef: input.policyRef,
          policyVersion: input.policyVersion,
        },
      });
    } catch (error) {
      this.logger.error(`Audit log failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Transaction-iÃ§i audit yazÄ±mÄ± (C0-a). log()'tan farkÄ±: hata YUTMAZ â€” Ã§aÄŸÄ±ran
   * mutation ile AYNI $transaction iÃ§inde tx.auditLog.create yapar; audit yazÄ±lamazsa
   * exception fÄ±rlatÄ±r â†’ Ã§aÄŸÄ±ran transaction ROLLBACK olur (audit'siz mutation kalmaz).
   * Mevcut log() davranÄ±ÅŸÄ± DEÄÄ°ÅMEZ (diÄŸer Ã§aÄŸÄ±ranlar etkilenmez).
   *
   * Ã‡aÄŸrÄ±ldÄ±ÄŸÄ± yerler:
   *  - ClientService.create/update/remove() â†’ client mutasyonu + audit aynÄ± tx iÃ§inde
   *  - BankService.matchTransaction() -> bank match + canonical Collection admission ayni tx icinde
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
        actorType: input.actorType,
        decisionResult: input.decisionResult,
        reasonCode: input.reasonCode,
        correlationId: input.correlationId,
        requestId: input.requestId,
        policyRef: input.policyRef,
        policyVersion: input.policyVersion,
      },
    });
  }

  /// <remarks>
  /// Ã‡aÄŸrÄ±ldÄ±ÄŸÄ± yerler:
  /// - AuditController.getLogs() â†’ GET /audit/logs (sayfalÄ± audit kayÄ±tlarÄ±nÄ± dÃ¶ndÃ¼rÃ¼r)
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
      logs: await this.withReadProjections(tenantId, logs),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /// <remarks>
  /// Ã‡aÄŸrÄ±ldÄ±ÄŸÄ± yerler:
  /// - AuditController.getEntityHistory() â†’ GET /audit/entity-history (tek entity audit geÃ§miÅŸini dÃ¶ndÃ¼rÃ¼r)
  /// </remarks>
  async getEntityHistory(tenantId: string, entityType: string, entityId: string) {
    const logs = await this.prisma.auditLog.findMany({
      where: { tenantId, entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });
    return this.withReadProjections(tenantId, logs);
  }

  /// <remarks>
  /// Ã‡aÄŸrÄ±ldÄ±ÄŸÄ± yerler:
  /// - AuditController.getUserActivity() â†’ GET /audit/user-activity (kullanÄ±cÄ± aktivite audit kayÄ±tlarÄ±nÄ± dÃ¶ndÃ¼rÃ¼r)
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
    return this.withReadProjections(tenantId, logs);
  }

  /**
   * P3-1b â€” Guided-Open confirm-token REPLAY tespiti (best-effort, salt-okuma).
   *
   * AynÄ± nonce ile DAHA Ã–NCE baÅŸarÄ±yla tÃ¼ketilmiÅŸ (result='CONSUMED') bir
   * CONFIRM_TOKEN_CONSUMED kaydÄ± var mÄ±? YalnÄ±z indeksli kolonlarla (tenantId/action/
   * entityType/entityId=targetRef) sorgular, nonce/result/actionCode'u metadata'dan tarar.
   * ÅEMA DEÄÄ°ÅÄ°KLÄ°ÄÄ° YOK; yeni tablo YOK.
   *
   * Best-effort sÃ¶zleÅŸme: katÄ± tek-kullanÄ±mlÄ±k DB-unique garantisi DEÄÄ°L. Okuma hatasÄ±
   * akÄ±ÅŸÄ± bozmaz â†’ "Ã¶nceki tÃ¼ketim yok" (false) dÃ¶ner + loglar (kÄ±sa TTL + binding korur).
   *
   * Ã‡aÄŸrÄ±ldÄ±ÄŸÄ± yerler:
   *  - ConfirmationTokenService.consume (P3-1b; henÃ¼z hiÃ§bir route'a baÄŸlÄ± deÄŸil)
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

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AuditService.withReadProjections() → generic audit safeProjection ekler.
  /// </remarks>
  private withSafeProjection<T extends Parameters<typeof projectAuditLogSafe>[0]>(
    log: T,
  ): T & { safeProjection: ReturnType<typeof projectAuditLogSafe> } {
    return { ...log, safeProjection: projectAuditLogSafe(log) };
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AuditService.getLogs() → GET /audit/logs için safe read projection ekler.
  /// - AuditService.getEntityHistory() → GET /audit/entity-history için safe read projection ekler.
  /// - AuditService.getUserActivity() → GET /audit/user-activity için safe read projection ekler.
  /// </remarks>
  private async withReadProjections<T extends Parameters<typeof projectAuditLogSafe>[0]>(
    tenantId: string,
    logs: T[],
  ): Promise<Array<T & {
    safeProjection: ReturnType<typeof projectAuditLogSafe>;
    hacizSafeProjection?: HacizAuditSafeProjection | null;
  }>> {
    const debtorLabels = await this.loadHacizDebtorLabels(tenantId, logs);
    return logs.map((log) => ({
      ...this.withSafeProjection(log),
      hacizSafeProjection: this.projectHacizAuditSafe(log, debtorLabels),
    }));
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AuditService.withReadProjections() → Haciz audit projection için tenant-scoped debtor label okur.
  /// </remarks>
  private async loadHacizDebtorLabels<T extends Parameters<typeof projectAuditLogSafe>[0]>(
    tenantId: string,
    logs: T[],
  ): Promise<Map<string, string>> {
    const pairs: Array<{ caseId: string; debtorId: string }> = [];
    for (const log of logs) {
      if (!isHacizAuditLog(log)) continue;
      const metadata = asRecord(log.metadata);
      const debtors = Array.isArray(metadata?.debtors) ? metadata.debtors : [];
      for (const debtor of debtors) {
        const debtorId = asString(asRecord(debtor)?.debtorId);
        if (log.entityId && debtorId) pairs.push({ caseId: log.entityId, debtorId });
      }
    }

    if (pairs.length === 0) return new Map();

    const caseIds = [...new Set(pairs.map((pair) => pair.caseId))];
    const debtorIds = [...new Set(pairs.map((pair) => pair.debtorId))];
    const rows = await this.prisma.caseDebtor.findMany({
      where: {
        caseId: { in: caseIds },
        debtorId: { in: debtorIds },
        case: { is: { tenantId } },
        debtor: { is: { tenantId } },
      },
      select: {
        caseId: true,
        debtorId: true,
        debtor: { select: { name: true } },
      },
    });

    const labels = new Map<string, string>();
    for (const row of rows) {
      const name = typeof row.debtor?.name === 'string' ? row.debtor.name.trim() : '';
      if (name) labels.set(hacizDebtorKey(row.caseId, row.debtorId), name);
    }
    return labels;
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AuditService.withReadProjections() → HACIZ_REQUEST_SUBMITTED kayıtları için action-specific safe projection üretir.
  /// </remarks>
  private projectHacizAuditSafe<T extends Parameters<typeof projectAuditLogSafe>[0]>(
    log: T,
    debtorLabels: Map<string, string>,
  ): HacizAuditSafeProjection | null {
    if (!isHacizAuditLog(log)) return null;

    const metadata = asRecord(log.metadata);
    const targetCode = asString(metadata?.targetType) ?? 'UNKNOWN';
    const overallCode = asRiskLevel(metadata?.overallLevel);
    const cpeWarnings = Array.isArray(metadata?.cpeWarnings) ? metadata.cpeWarnings : [];
    const rawDebtors = Array.isArray(metadata?.debtors) ? metadata.debtors : [];

    return {
      action: 'HACIZ_REQUEST_SUBMITTED',
      targetType: {
        code: targetCode,
        label: HACIZ_TARGET_LABEL[targetCode] ?? targetCode,
      },
      overallLevel: {
        code: overallCode,
        label: HACIZ_RISK_LABEL[overallCode],
      },
      createdAt: log.createdAt ?? null,
      actor: {
        id: log.userId ?? null,
        displayName: log.userName ?? log.userId ?? 'Sistem',
      },
      uyapRequestId: asString(metadata?.uyapRequestId) ?? null,
      cpeTraceId: asString(metadata?.cpeTraceId) ?? null,
      cpeWarningsPresent: cpeWarnings.length > 0,
      cpeWarningsCount: cpeWarnings.length,
      debtors: rawDebtors.map((rawDebtor, index) => {
        const debtor = asRecord(rawDebtor);
        const debtorId = asString(debtor?.debtorId);
        const levelCode = asRiskLevel(debtor?.level);
        const reasonIds = Array.isArray(debtor?.reasonIds)
          ? debtor.reasonIds.map((reasonId) => asString(reasonId)).filter((reasonId): reasonId is string => !!reasonId)
          : [];
        const currentDomainLabel = log.entityId && debtorId
          ? debtorLabels.get(hacizDebtorKey(log.entityId, debtorId))
          : undefined;

        return {
          debtorReference: debtorId ?? null,
          displayLabel: currentDomainLabel ?? `Borçlu #${index + 1}`,
          level: {
            code: levelCode,
            label: HACIZ_RISK_LABEL[levelCode],
          },
          reasonIds,
          reasons: reasonIds.map((reasonId) => ({
            id: reasonId,
            label: HACIZ_REASON_LABEL[reasonId] ?? reasonId,
          })),
        };
      }),
    };
  }
}

type HacizRiskLevel = 'YOK' | 'DUSUK' | 'ORTA' | 'YUKSEK';

export interface HacizAuditSafeProjection {
  action: 'HACIZ_REQUEST_SUBMITTED';
  targetType: { code: string; label: string };
  overallLevel: { code: HacizRiskLevel; label: string };
  createdAt?: Date | string | null;
  actor: { id: string | null; displayName: string | null };
  uyapRequestId: string | null;
  cpeTraceId: string | null;
  cpeWarningsPresent: boolean;
  cpeWarningsCount: number;
  debtors: Array<{
    debtorReference: string | null;
    displayLabel: string;
    level: { code: HacizRiskLevel; label: string };
    reasonIds: string[];
    reasons: Array<{ id: string; label: string }>;
  }>;
}

const HACIZ_RISK_LABEL: Record<HacizRiskLevel, string> = {
  YOK: 'Yok',
  DUSUK: 'Düşük',
  ORTA: 'Orta',
  YUKSEK: 'Yüksek',
};

const HACIZ_TARGET_LABEL: Record<string, string> = {
  BANK: 'Banka',
  VEHICLE: 'Araç',
  PROPERTY: 'Taşınmaz',
  SALARY: 'Maaş',
  UNKNOWN: 'Haciz',
};

const HACIZ_REASON_LABEL: Record<string, string> = {
  INTEL_90D_MISSING: 'Son 90 günde doğrulanmış saha istihbaratı yok',
  INTEL_VERIFIED_ABSENT_RECENT: 'Borçlunun adreste bulunmadığı saha teyidi var',
  INTEL_NO_ADDRESS: 'Borçlunun kayıtlı adresi yok',
  INTEL_ETEBLIGAT_NO_PHYSICAL_VERIFY: 'E-tebligat var ama fiziksel teyit yok',
  INTEL_ADDRESS_UNVERIFIED: 'Tebligat adresi fiili saha doğrulamasından geçmemiş',
};

function isHacizAuditLog<T extends Parameters<typeof projectAuditLogSafe>[0]>(log: T): boolean {
  return log.action === 'HACIZ_REQUEST_SUBMITTED' && log.entityType === 'CASE' && !!log.entityId;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return !!value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asRiskLevel(value: unknown): HacizRiskLevel {
  return value === 'YUKSEK' || value === 'ORTA' || value === 'DUSUK' || value === 'YOK'
    ? value
    : 'YOK';
}

function hacizDebtorKey(caseId: string, debtorId: string): string {
  return `${caseId}:${debtorId}`;
}
