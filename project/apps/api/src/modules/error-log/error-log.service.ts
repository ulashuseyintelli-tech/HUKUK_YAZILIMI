import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface LogErrorParams {
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
}

@Injectable()
export class ErrorLogService {
  private readonly logger = new Logger(ErrorLogService.name);

  constructor(private prisma: PrismaService) {}

  async log(params: LogErrorParams) {
    try {
      return await this.prisma.errorLog.create({
        data: {
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
        },
      });
    } catch (e) {
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
    return this.prisma.errorLog.update({
      where: { id },
      data: { isResolved: true, resolvedAt: new Date(), resolvedBy: userId, resolution },
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
