/**
 * PLAN LOADER SERVICE (v29-v30)
 * 
 * Stage-based planning artık DB plan bundle'dan geliyor.
 * bundle_kind='plan' olan ACTIVE ParamBundle kullanılır.
 * 
 * v30 Yenilikleri:
 * - Per-recipe interval_seconds
 * - Debtor-scoped jobs (scope: 'case' | 'debtor')
 * - Adaptive scheduling config
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import * as yaml from 'js-yaml';

export type RecipeScope = 'case' | 'debtor';

export interface StageRecipe {
  recipe_id: string;
  risk_level: string;
  interval_seconds?: number;  // v30: per-recipe interval
  scope?: RecipeScope;        // v30: 'case' | 'debtor'
}

export interface StagePlan {
  recipes: StageRecipe[];
}

export interface AdaptiveConfig {
  enabled: boolean;
  window_hours: number;
  min_samples: number;
  fail_rate_soft: number;
  fail_rate_hard: number;
}

export interface PlanBundle {
  stages: Record<string, StagePlan>;
  cooldown_seconds: number;
  adaptive?: AdaptiveConfig;  // v30: adaptive scheduling
}

// Default plan (fallback)
const DEFAULT_PLAN: PlanBundle = {
  stages: {
    ACILIS: {
      recipes: [
        { recipe_id: 'EnsureUYAPSession', risk_level: 'read_only', interval_seconds: 900, scope: 'case' },
        { recipe_id: 'SyncSafahatTimeline', risk_level: 'read_only', interval_seconds: 21600, scope: 'case' },
      ],
    },
    TEBLIGAT: {
      recipes: [
        { recipe_id: 'EnsureUYAPSession', risk_level: 'read_only', interval_seconds: 900, scope: 'case' },
        { recipe_id: 'SyncSafahatTimeline', risk_level: 'read_only', interval_seconds: 21600, scope: 'case' },
        { recipe_id: 'FetchPreparedETebligatlar_Debtor', risk_level: 'read_only', interval_seconds: 21600, scope: 'debtor' },
      ],
    },
    KESINLESME: {
      recipes: [
        { recipe_id: 'EnsureUYAPSession', risk_level: 'read_only', interval_seconds: 900, scope: 'case' },
        { recipe_id: 'SyncSafahatTimeline', risk_level: 'read_only', interval_seconds: 21600, scope: 'case' },
        { recipe_id: 'DetectFinalizationCandidate_ByIcraType', risk_level: 'controlled_write', interval_seconds: 86400, scope: 'case' },
      ],
    },
    VARLIK: {
      recipes: [
        { recipe_id: 'EnsureUYAPSession', risk_level: 'read_only', interval_seconds: 900, scope: 'case' },
        { recipe_id: 'RunAssetQueries_Debtor', risk_level: 'read_only', interval_seconds: 604800, scope: 'debtor' },
        { recipe_id: 'ScoreAssetProfile_Debtor', risk_level: 'controlled_write', interval_seconds: 86400, scope: 'debtor' },
      ],
    },
    HACIZ: {
      recipes: [
        { recipe_id: 'EnsureUYAPSession', risk_level: 'read_only', interval_seconds: 900, scope: 'case' },
        { recipe_id: 'PrepareHacizRequests', risk_level: 'controlled_write', interval_seconds: 86400, scope: 'case' },
      ],
    },
    SATIS: {
      recipes: [
        { recipe_id: 'EnsureUYAPSession', risk_level: 'read_only', interval_seconds: 900, scope: 'case' },
        { recipe_id: 'MonitorSaleStatus', risk_level: 'read_only', interval_seconds: 21600, scope: 'case' },
      ],
    },
    TAHSILAT: {
      recipes: [
        { recipe_id: 'EnsureUYAPSession', risk_level: 'read_only', interval_seconds: 900, scope: 'case' },
        { recipe_id: 'SyncTahsilat', risk_level: 'read_only', interval_seconds: 21600, scope: 'case' },
        { recipe_id: 'EvaluateCaseClosure', risk_level: 'controlled_write', interval_seconds: 86400, scope: 'case' },
      ],
    },
  },
  cooldown_seconds: 900, // 15 minutes (default fallback)
  adaptive: {
    enabled: false,
    window_hours: 6,
    min_samples: 10,
    fail_rate_soft: 0.2,
    fail_rate_hard: 0.4,
  },
};

@Injectable()
export class PlanLoaderService {
  private readonly logger = new Logger(PlanLoaderService.name);
  private cache: { data: PlanBundle; loadedAt: Date } | null = null;
  private readonly CACHE_TTL_MS = 60000; // 1 minute

  constructor(private prisma: PrismaService) {}

  /**
   * Load active plan bundle
   */
  async loadActivePlan(tenantId: string): Promise<PlanBundle> {
    if (this.cache && Date.now() - this.cache.loadedAt.getTime() < this.CACHE_TTL_MS) {
      return this.cache.data;
    }

    const bundle = await this.prisma.icrabotBundle.findFirst({
      where: {
        tenantId,
        type: 'PLAN',
        status: 'ACTIVE',
      },
      orderBy: { version: 'desc' },
    });

    if (!bundle) {
      this.logger.warn(`No active plan bundle found for tenant ${tenantId}, using defaults`);
      return DEFAULT_PLAN;
    }

    const data = this.parseContent(bundle.content);
    const plan = data.plan || data;

    const result: PlanBundle = {
      stages: plan.stages || DEFAULT_PLAN.stages,
      cooldown_seconds: plan.cooldown_seconds ?? DEFAULT_PLAN.cooldown_seconds,
      adaptive: plan.adaptive ? {
        enabled: Boolean(plan.adaptive.enabled),
        window_hours: Number(plan.adaptive.window_hours) || 6,
        min_samples: Number(plan.adaptive.min_samples) || 10,
        fail_rate_soft: Number(plan.adaptive.fail_rate_soft) || 0.2,
        fail_rate_hard: Number(plan.adaptive.fail_rate_hard) || 0.4,
      } : DEFAULT_PLAN.adaptive,
    };

    this.cache = { data: result, loadedAt: new Date() };
    return result;
  }

  /**
   * Get recipes for a specific stage
   */
  async getRecipesForStage(tenantId: string, stage: string): Promise<StageRecipe[]> {
    const plan = await this.loadActivePlan(tenantId);
    return plan.stages[stage]?.recipes || [];
  }

  /**
   * Get cooldown seconds
   */
  async getCooldownSeconds(tenantId: string): Promise<number> {
    const plan = await this.loadActivePlan(tenantId);
    return plan.cooldown_seconds;
  }

  /**
   * Check if recipe is in cooldown for a case
   */
  async isInCooldown(
    caseId: string,
    tenantId: string,
    recipeId: string,
  ): Promise<boolean> {
    const cooldownSeconds = await this.getCooldownSeconds(tenantId);
    const cooldownThreshold = new Date(Date.now() - cooldownSeconds * 1000);

    const recentJob = await this.prisma.icrabotJobRun.findFirst({
      where: {
        caseId,
        tenantId,
        recipeId,
        createdAt: { gte: cooldownThreshold },
      },
    });

    return !!recentJob;
  }

  /**
   * Check if recipe is in cooldown for a case+debtor (v30)
   * Uses per-recipe interval if specified
   */
  async isInCooldownV2(
    caseId: string,
    tenantId: string,
    recipeId: string,
    debtorId: string | null,
    intervalSeconds: number,
  ): Promise<boolean> {
    const cooldownThreshold = new Date(Date.now() - intervalSeconds * 1000);

    const whereClause: any = {
      caseId,
      tenantId,
      recipeId,
      createdAt: { gte: cooldownThreshold },
      status: { not: 'FAILED' }, // Don't count failed jobs
    };

    if (debtorId) {
      whereClause.debtorId = debtorId;
    } else {
      whereClause.debtorId = null;
    }

    const recentJob = await this.prisma.icrabotJobRun.findFirst({
      where: whereClause,
    });

    return !!recentJob;
  }

  /**
   * Get adaptive config
   */
  async getAdaptiveConfig(tenantId: string): Promise<AdaptiveConfig | undefined> {
    const plan = await this.loadActivePlan(tenantId);
    return plan.adaptive;
  }

  /**
   * Parse YAML or JSON content
   */
  private parseContent(content: string): any {
    try {
      return yaml.load(content) || {};
    } catch {
      try {
        return JSON.parse(content);
      } catch {
        return {};
      }
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache = null;
  }
}
