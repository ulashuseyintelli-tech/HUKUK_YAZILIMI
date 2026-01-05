/**
 * SLA BOOST SERVICE (v32)
 * 
 * Job yaşına göre priority boost hesaplama.
 * Uzun süre bekleyen job'lar daha yüksek öncelik alır.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { IcrabotBundleType } from '@prisma/client';

export interface SlaPolicyStage {
  max_age_minutes: number;
  boost_priority: number;
}

export interface SlaPolicy {
  stages: Record<string, SlaPolicyStage>;
}

export interface JobWithBoost {
  jobId: string;
  originalPriority: number;
  boostedPriority: number;
  ageMinutes: number;
  stage: string;
  boostApplied: number;
}

@Injectable()
export class SlaBoostService {
  private readonly logger = new Logger(SlaBoostService.name);
  private policyCache: SlaPolicy | null = null;
  private policyCacheLoadedAt: Date | null = null;
  private readonly CACHE_TTL_MS = 60000; // 1 minute

  constructor(private prisma: PrismaService) {}

  /**
   * Load SLA policy from DB bundle
   */
  async loadPolicy(tenantId: string): Promise<SlaPolicy> {
    if (this.policyCache && this.policyCacheLoadedAt && 
        Date.now() - this.policyCacheLoadedAt.getTime() < this.CACHE_TTL_MS) {
      return this.policyCache;
    }

    const bundle = await this.prisma.icrabotBundle.findFirst({
      where: {
        tenantId,
        type: IcrabotBundleType.SLA_POLICY,
        status: 'ACTIVE',
      },
      orderBy: { version: 'desc' },
    });

    if (!bundle) {
      // Default policy
      this.policyCache = {
        stages: {
          TEBLIGAT: { max_age_minutes: 60, boost_priority: -10 },
          KESINLESME: { max_age_minutes: 1440, boost_priority: -5 },
          VARLIK: { max_age_minutes: 10080, boost_priority: 0 },
          HACIZ: { max_age_minutes: 4320, boost_priority: -5 },
          TAHSILAT: { max_age_minutes: 2880, boost_priority: -3 },
        },
      };
    } else {
      const content = bundle.content as { policy?: SlaPolicy };
      this.policyCache = content.policy || { stages: {} };
    }

    this.policyCacheLoadedAt = new Date();
    return this.policyCache;
  }

  /**
   * Calculate priority boost for a job based on its age and stage
   */
  async calculateBoost(
    tenantId: string,
    jobId: string,
    stage: string,
    createdAt: Date,
    originalPriority: number,
  ): Promise<JobWithBoost> {
    const policy = await this.loadPolicy(tenantId);
    const stagePolicy = policy.stages[stage];

    const ageMinutes = Math.floor((Date.now() - createdAt.getTime()) / 60000);
    let boostApplied = 0;

    if (stagePolicy && ageMinutes > stagePolicy.max_age_minutes) {
      // Job exceeded SLA, apply boost
      boostApplied = stagePolicy.boost_priority;
    }

    return {
      jobId,
      originalPriority,
      boostedPriority: originalPriority + boostApplied,
      ageMinutes,
      stage,
      boostApplied,
    };
  }

  /**
   * Apply SLA boost to all queued jobs
   */
  async applyBoostToQueuedJobs(tenantId: string): Promise<number> {
    const policy = await this.loadPolicy(tenantId);
    let updatedCount = 0;

    // Get all queued jobs with their case stage
    const queuedJobs = await this.prisma.icrabotJobRun.findMany({
      where: {
        tenantId,
        status: 'QUEUED',
      },
      include: {
        case: {
          select: { stage: true },
        },
      },
    });

    for (const job of queuedJobs) {
      const stage = job.case?.stage || 'UNKNOWN';
      const stagePolicy = policy.stages[stage];

      if (!stagePolicy) continue;

      const ageMinutes = Math.floor((Date.now() - job.createdAt.getTime()) / 60000);

      if (ageMinutes > stagePolicy.max_age_minutes) {
        const newPriority = job.priority + stagePolicy.boost_priority;

        // Only update if priority actually changes
        if (newPriority !== job.priority) {
          await this.prisma.icrabotJobRun.update({
            where: { id: job.id },
            data: { priority: newPriority },
          });
          updatedCount++;
          this.logger.debug(
            `Job ${job.jobId} priority boosted: ${job.priority} → ${newPriority} (stage: ${stage}, age: ${ageMinutes}m)`,
          );
        }
      }
    }

    if (updatedCount > 0) {
      this.logger.log(`Applied SLA boost to ${updatedCount} jobs`);
    }

    return updatedCount;
  }

  /**
   * Clear policy cache
   */
  clearCache(): void {
    this.policyCache = null;
    this.policyCacheLoadedAt = null;
  }
}
