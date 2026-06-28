import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { computePersistentFingerprint, computeActiveDedupeKey } from './internal/error-dedupe-key';

export interface LogErrorParams {
  tenantId?: string;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  source: string;
  message: string;
  stack?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  userId?: string;
  userIp?: string;
  userAgent?: string;
  metadata?: any;
  /** PR-2b: fingerprint hesabı için hata tipi/adı (varsa). İstemci loglarında undefined olabilir. */
  errorName?: string;
}

@Injectable()
export class ErrorLogService {
  private readonly logger = new Logger(ErrorLogService.name);

  constructor(private prisma: PrismaService) {}

  async log(params: LogErrorParams) {
    try {
      // PR-2b: KALICI dedupe. fingerprint=hata kimliği, activeDedupeKey=aktif olay kimliği.
      const fingerprint = computePersistentFingerprint({
        name: params.errorName,
        message: params.message,
        stack: params.stack,
        statusCode: params.statusCode,
      });
      const activeDedupeKey = computeActiveDedupeKey({
        tenantId: params.tenantId,
        source: params.source,
        method: params.method,
        endpoint: params.endpoint,
        statusCode: params.statusCode,
        fingerprint,
      });
      const now = new Date();
      const data = {
        tenantId: params.tenantId,
        level: params.level,
        source: params.source,
        message: params.message,
        stack: params.stack,
        endpoint: params.endpoint,
        method: params.method,
        statusCode: params.statusCode,
        userId: params.userId,
        userIp: params.userIp,
        userAgent: params.userAgent,
        metadata: params.metadata,
        fingerprint,
      };

      try {
        // AKTİF (unresolved) aynı olay varsa → occurrenceCount++ ; yoksa yeni kayıt.
        // Resolved kayıtların activeDedupeKey'i NULL olduğundan eşleşmez → re-explosion yeni kayıt açar.
        return await this.prisma.errorLog.upsert({
          where: { activeDedupeKey },
          update: { occurrenceCount: { increment: 1 }, lastSeenAt: now },
          create: { ...data, activeDedupeKey, occurrenceCount: 1, firstSeenAt: now, lastSeenAt: now },
        });
      } catch (e: any) {
        // PR-2b yarış: eşzamanlı iki aynı olay → biri INSERT, diğeri unique ihlali (P2002).
        // Yeni satır yerine increment'e düş (atomiklik garantisi).
        if (e?.code === 'P2002') {
          return await this.prisma.errorLog.updateMany({
            where: { activeDedupeKey },
            data: { occurrenceCount: { increment: 1 }, lastSeenAt: now },
          });
        }
        throw e;
      }
    } catch (e) {
      // LOGGING-FAILURE ISOLATION: hiçbir loglama hatası çağıran isteği bozmaz.
      this.logger.error('Error logging failed', e);
    }
  }

  async getLogs(tenantId: string, filters: { level?: string; source?: string; page?: number; limit?: number }) {
    const { level, source, page = 1, limit = 50 } = filters;
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (level) where.level = level;
    if (source) where.source = source;

    const [logs, total] = await Promise.all([
      this.prisma.errorLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.errorLog.count({ where }),
    ]);
    return { logs, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async resolve(id: string, userId: string, resolution: string) {
    // PR-2b: resolve → activeDedupeKey NULL. Böylece aynı hata yarın tekrar patlarsa
    // eski resolved kayda gömülmez; yeni unresolved aktif olay açılır.
    return this.prisma.errorLog.update({
      where: { id },
      data: { isResolved: true, resolvedAt: new Date(), resolvedBy: userId, resolution, activeDedupeKey: null },
    });
  }

  async getStats(tenantId?: string) {
    const where: any = tenantId ? { tenantId } : {};
    const [total, errors, warnings, unresolved] = await Promise.all([
      this.prisma.errorLog.count({ where }),
      this.prisma.errorLog.count({ where: { ...where, level: 'ERROR' } }),
      this.prisma.errorLog.count({ where: { ...where, level: 'WARN' } }),
      this.prisma.errorLog.count({ where: { ...where, isResolved: false } }),
    ]);
    return { total, errors, warnings, unresolved };
  }
}
