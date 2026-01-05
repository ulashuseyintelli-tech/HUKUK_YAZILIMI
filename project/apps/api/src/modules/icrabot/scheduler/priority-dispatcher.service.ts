/**
 * PRIORITY DISPATCHER SERVICE (v31)
 * 
 * Priority + quota bazlı job dispatch.
 * - Düşük priority değeri = yüksek öncelik
 * - Risk queue kotaları
 * - Global/per-case concurrency limitleri
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { QueuePolicyLoaderService } from './queue-policy-loader.service';

export interface DispatchResult {
  dispatched: number;
  skippedGlobalLimit: number;
  skippedCaseLimit: number;
  skippedRiskLimit: number;
  jobIds: string[];
}

@Injectable()
export class PriorityDispatcherService {
  private readonly logger = new Logger(PriorityDispatcherService.name);

  constructor(
    private prisma: PrismaService,
    private queuePolicyLoader: QueuePolicyLoaderService,
  ) {}

  /**
   * Dispatch queued jobs based on priority and quotas
   */
  async dispatchJobs(tenantId: string, maxDispatch: number = 50): Promise<DispatchResult> {
    const result: DispatchResult = {
      dispatched: 0,
      skippedGlobalLimit: 0,
      skippedCaseLimit: 0,
      skippedRiskLimit: 0,
      jobIds: [],
    };

    const policy = await this.queuePolicyLoader.loadActivePolicy(tenantId);

    // Get queued jobs ordered by priority (lower = higher priority), then by created_at
    const queuedJobs = await this.prisma.icrabotJobRun.findMany({
      where: {
        tenantId,
        status: 'QUEUED',
      },
      orderBy: [
        { priority: 'asc' },
        { createdAt: 'desc' },
      ],
      take: maxDispatch * 2, // Get more than needed to account for skips
    });

    for (const job of queuedJobs) {
      if (result.dispatched >= maxDispatch) break;

      // Check global limit
      if (await this.queuePolicyLoader.isGlobalLimitReached(tenantId)) {
        result.skippedGlobalLimit++;
        continue;
      }

      // Check per-case limit
      if (await this.queuePolicyLoader.isCaseLimitReached(tenantId, job.caseId)) {
        result.skippedCaseLimit++;
        continue;
      }

      // Check per-case write limit for write jobs
      const isWriteJob = ['CONTROLLED_WRITE', 'HIGH_IMPACT_WRITE'].includes(job.riskLevel);
      if (isWriteJob && await this.queuePolicyLoader.isCaseWriteLimitReached(tenantId, job.caseId)) {
        result.skippedCaseLimit++;
        continue;
      }

      // Check risk queue limit
      if (await this.queuePolicyLoader.isRiskQueueLimitReached(tenantId, job.riskLevel)) {
        result.skippedRiskLimit++;
        continue;
      }

      // Dispatch job (mark as RUNNING)
      await this.prisma.icrabotJobRun.update({
        where: { id: job.id },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      result.dispatched++;
      result.jobIds.push(job.id);
    }

    if (result.dispatched > 0) {
      this.logger.log(`Dispatched ${result.dispatched} jobs for tenant ${tenantId}`);
    }

    return result;
  }

  /**
   * Calculate effective priority for a job
   * Base priority + risk-based boost
   */
  async calculateEffectivePriority(
    tenantId: string,
    basePriority: number,
    riskLevel: string,
  ): Promise<number> {
    const boost = await this.queuePolicyLoader.getPriorityBoost(tenantId, riskLevel);
    return basePriority + boost;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(tenantId: string): Promise<{
    queued: number;
    running: number;
    byRiskLevel: Record<string, { queued: number; running: number }>;
  }> {
    const [queued, running] = await Promise.all([
      this.prisma.icrabotJobRun.count({
        where: { tenantId, status: 'QUEUED' },
      }),
      this.prisma.icrabotJobRun.count({
        where: { tenantId, status: 'RUNNING' },
      }),
    ]);

    // Group by risk level
    const byRiskLevel: Record<string, { queued: number; running: number }> = {};
    
    const riskLevels = ['READ_ONLY', 'CONTROLLED_WRITE', 'HIGH_IMPACT_WRITE'];
    for (const rl of riskLevels) {
      const [rlQueued, rlRunning] = await Promise.all([
        this.prisma.icrabotJobRun.count({
          where: { tenantId, status: 'QUEUED', riskLevel: rl as any },
        }),
        this.prisma.icrabotJobRun.count({
          where: { tenantId, status: 'RUNNING', riskLevel: rl as any },
        }),
      ]);
      byRiskLevel[rl] = { queued: rlQueued, running: rlRunning };
    }

    return { queued, running, byRiskLevel };
  }
}
