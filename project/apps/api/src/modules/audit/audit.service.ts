import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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

    return { logs, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getEntityHistory(tenantId: string, entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { tenantId, entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUserActivity(tenantId: string, userId: string, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.prisma.auditLog.findMany({
      where: {
        tenantId,
        userId,
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
