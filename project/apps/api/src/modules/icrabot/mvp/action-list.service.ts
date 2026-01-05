/**
 * ACTION LIST SERVICE (v37)
 * 
 * Dosya için bekleyen aksiyonları listeler.
 * Açık kilitler, onay bekleyenler, masraf avansı bekleyenler.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface ActionItem {
  type: 'LOCK' | 'APPROVAL' | 'PAYMENT' | 'TASK';
  priority: 'high' | 'medium' | 'low';
  message: string;
  detail: string | null;
  createdAt?: Date;
}

export interface ActionListResponse {
  caseId: string;
  actions: ActionItem[];
  totalCount: number;
}

@Injectable()
export class ActionListService {
  private readonly logger = new Logger(ActionListService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Build action list for a case
   */
  async buildActionList(tenantId: string, caseId: string): Promise<ActionListResponse> {
    // Verify case exists
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true },
    });

    if (!caseData) {
      throw new NotFoundException('Case not found');
    }

    const actions: ActionItem[] = [];
    const prismaAny = this.prisma as any;

    // 1. Open locks -> required actions
    const locks = await prismaAny.icrabotLock.findMany({
      where: { caseId, isOpen: true },
      select: {
        id: true,
        lockType: true,
        reason: true,
        createdAt: true,
      },
    });

    for (const lock of locks) {
      actions.push({
        type: 'LOCK',
        priority: 'high',
        message: `Açık kilit: ${lock.lockType}`,
        detail: lock.reason,
        createdAt: lock.createdAt,
      });
    }

    // 2. Facts with flags -> pending approvals / costs
    const facts = await prismaAny.icrabotFact.findMany({
      where: { caseId, factType: 'Flag' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        key: true,
        value: true,
        createdAt: true,
      },
    });

    for (const fact of facts) {
      if (fact.key === 'needs_attorney_review') {
        actions.push({
          type: 'APPROVAL',
          priority: 'high',
          message: 'Avukat incelemesi gerekiyor',
          detail: typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value),
          createdAt: fact.createdAt,
        });
      }
      if (fact.key === 'awaiting_cost_advance') {
        actions.push({
          type: 'PAYMENT',
          priority: 'medium',
          message: 'Masraf avansı bekleniyor',
          detail: typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value),
          createdAt: fact.createdAt,
        });
      }
      if (fact.key === 'needs_client_approval') {
        actions.push({
          type: 'APPROVAL',
          priority: 'medium',
          message: 'Müvekkil onayı bekleniyor',
          detail: typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value),
          createdAt: fact.createdAt,
        });
      }
    }

    // 3. Queued jobs that need attention
    const pendingJobs = await prismaAny.icrabotJobRun.findMany({
      where: { 
        caseId, 
        status: 'QUEUED',
        riskLevel: { in: ['HIGH', 'CRITICAL'] },
      },
      select: {
        id: true,
        recipeId: true,
        createdAt: true,
      },
      take: 5,
    });

    for (const job of pendingJobs) {
      actions.push({
        type: 'TASK',
        priority: 'medium',
        message: `Yüksek riskli iş bekliyor: ${job.recipeId}`,
        detail: `Job ID: ${job.id}`,
        createdAt: job.createdAt,
      });
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    this.logger.log(`Case ${caseId} has ${actions.length} pending actions`);

    return {
      caseId,
      actions,
      totalCount: actions.length,
    };
  }
}
