/**
 * PLAN LIMITS SERVICE (v38)
 * 
 * Billing / plan limitleri kontrolü.
 * FREE/PRO/ENTERPRISE planları için kota yönetimi.
 */

import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export type PlanType = 'FREE' | 'PRO' | 'ENTERPRISE';

export interface PlanLimits {
  maxCases: number;
  maxJobsPerDay: number;
  maxUsersPerTenant: number;
  maxStorageGb: number;
  features: string[];
}

export interface UsageStats {
  currentCases: number;
  jobsToday: number;
  usersCount: number;
  storageUsedGb: number;
}

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  currentUsage: number;
  limit: number;
}

@Injectable()
export class PlanLimitsService {
  private readonly logger = new Logger(PlanLimitsService.name);

  // Plan configurations
  private readonly plans: Record<PlanType, PlanLimits> = {
    FREE: {
      maxCases: 200,
      maxJobsPerDay: 500,
      maxUsersPerTenant: 3,
      maxStorageGb: 1,
      features: ['basic_automation', 'manual_sync'],
    },
    PRO: {
      maxCases: 5000,
      maxJobsPerDay: 20000,
      maxUsersPerTenant: 20,
      maxStorageGb: 50,
      features: ['basic_automation', 'manual_sync', 'scheduled_sync', 'reports', 'api_access'],
    },
    ENTERPRISE: {
      maxCases: 200000,
      maxJobsPerDay: 500000,
      maxUsersPerTenant: 1000,
      maxStorageGb: 1000,
      features: ['basic_automation', 'manual_sync', 'scheduled_sync', 'reports', 'api_access', 'sso', 'audit_export', 'custom_workflows', 'priority_support'],
    },
  };

  constructor(private prisma: PrismaService) {}

  /**
   * Get plan limits for a plan type
   */
  getPlanLimits(plan: PlanType): PlanLimits {
    return this.plans[plan] || this.plans.FREE;
  }

  /**
   * Get current usage stats for a tenant
   */
  async getUsageStats(tenantId: string): Promise<UsageStats> {
    const prismaAny = this.prisma as any;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [currentCases, jobsToday, usersCount] = await Promise.all([
      this.prisma.case.count({ where: { tenantId } }),
      prismaAny.icrabotJobRun?.count({
        where: {
          tenantId,
          createdAt: { gte: todayStart },
        },
      }).catch(() => 0) || 0,
      this.prisma.lawyer.count({ where: { tenantId } }),
    ]);

    return {
      currentCases,
      jobsToday,
      usersCount,
      storageUsedGb: 0, // TODO: Calculate actual storage
    };
  }

  /**
   * Check if a new case can be created
   */
  async canCreateCase(tenantId: string, plan: PlanType): Promise<LimitCheckResult> {
    const limits = this.getPlanLimits(plan);
    const stats = await this.getUsageStats(tenantId);

    if (stats.currentCases >= limits.maxCases) {
      return {
        allowed: false,
        reason: `Plan limiti aşıldı: Maksimum ${limits.maxCases} dosya`,
        currentUsage: stats.currentCases,
        limit: limits.maxCases,
      };
    }

    return {
      allowed: true,
      currentUsage: stats.currentCases,
      limit: limits.maxCases,
    };
  }

  /**
   * Check if a new job can be created
   */
  async canCreateJob(tenantId: string, plan: PlanType): Promise<LimitCheckResult> {
    const limits = this.getPlanLimits(plan);
    const stats = await this.getUsageStats(tenantId);

    if (stats.jobsToday >= limits.maxJobsPerDay) {
      return {
        allowed: false,
        reason: `Günlük iş limiti aşıldı: Maksimum ${limits.maxJobsPerDay} iş/gün`,
        currentUsage: stats.jobsToday,
        limit: limits.maxJobsPerDay,
      };
    }

    return {
      allowed: true,
      currentUsage: stats.jobsToday,
      limit: limits.maxJobsPerDay,
    };
  }

  /**
   * Check if a feature is available for a plan
   */
  hasFeature(plan: PlanType, feature: string): boolean {
    const limits = this.getPlanLimits(plan);
    return limits.features.includes(feature);
  }

  /**
   * Enforce case creation limit (throws if exceeded)
   */
  async enforceCaseLimit(tenantId: string, plan: PlanType): Promise<void> {
    const check = await this.canCreateCase(tenantId, plan);
    if (!check.allowed) {
      throw new ForbiddenException(check.reason);
    }
  }

  /**
   * Enforce job creation limit (throws if exceeded)
   */
  async enforceJobLimit(tenantId: string, plan: PlanType): Promise<void> {
    const check = await this.canCreateJob(tenantId, plan);
    if (!check.allowed) {
      throw new ForbiddenException(check.reason);
    }
  }

  /**
   * Get usage summary for a tenant
   */
  async getUsageSummary(tenantId: string, plan: PlanType): Promise<{
    plan: PlanType;
    limits: PlanLimits;
    usage: UsageStats;
    percentages: {
      cases: number;
      jobsToday: number;
      users: number;
      storage: number;
    };
  }> {
    const limits = this.getPlanLimits(plan);
    const usage = await this.getUsageStats(tenantId);

    return {
      plan,
      limits,
      usage,
      percentages: {
        cases: Math.round((usage.currentCases / limits.maxCases) * 100),
        jobsToday: Math.round((usage.jobsToday / limits.maxJobsPerDay) * 100),
        users: Math.round((usage.usersCount / limits.maxUsersPerTenant) * 100),
        storage: Math.round((usage.storageUsedGb / limits.maxStorageGb) * 100),
      },
    };
  }
}
