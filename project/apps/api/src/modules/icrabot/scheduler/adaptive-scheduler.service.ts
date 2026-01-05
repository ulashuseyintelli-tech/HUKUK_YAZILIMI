/**
 * ADAPTIVE SCHEDULER SERVICE (v30)
 * 
 * Son X saat fail rate'e göre interval otomatik ayarlanır:
 * - fail_rate >= hard (0.4): interval x2
 * - fail_rate >= soft (0.2): interval x1.5
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface RecipeStats {
  recipeId: string;
  total: number;
  failed: number;
  failRate: number;
}

export interface AdaptiveConfig {
  enabled: boolean;
  windowHours: number;
  minSamples: number;
  failRateSoft: number;
  failRateHard: number;
}

const DEFAULT_ADAPTIVE_CONFIG: AdaptiveConfig = {
  enabled: false,
  windowHours: 6,
  minSamples: 10,
  failRateSoft: 0.2,
  failRateHard: 0.4,
};

@Injectable()
export class AdaptiveSchedulerService {
  private readonly logger = new Logger(AdaptiveSchedulerService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Compute recipe stats for the given window
   */
  async computeRecipeStats(
    tenantId: string,
    recipeId: string,
    windowHours: number = 6,
  ): Promise<RecipeStats> {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const jobs = await this.prisma.icrabotJobRun.findMany({
      where: {
        tenantId,
        recipeId,
        createdAt: { gte: since },
      },
      select: { status: true },
    });

    const total = jobs.length;
    const failed = jobs.filter(j => j.status === 'FAILED').length;
    const failRate = total > 0 ? failed / total : 0;

    return { recipeId, total, failed, failRate };
  }

  /**
   * Adjust interval based on fail rate
   */
  adjustInterval(
    baseInterval: number,
    stats: RecipeStats,
    config: AdaptiveConfig,
  ): number {
    if (!config.enabled) {
      return baseInterval;
    }

    if (stats.total < config.minSamples) {
      return baseInterval;
    }

    if (stats.failRate >= config.failRateHard) {
      this.logger.warn(
        `Recipe ${stats.recipeId} fail rate ${(stats.failRate * 100).toFixed(1)}% >= hard threshold, interval x2`,
      );
      return Math.floor(baseInterval * 2.0);
    }

    if (stats.failRate >= config.failRateSoft) {
      this.logger.warn(
        `Recipe ${stats.recipeId} fail rate ${(stats.failRate * 100).toFixed(1)}% >= soft threshold, interval x1.5`,
      );
      return Math.floor(baseInterval * 1.5);
    }

    return baseInterval;
  }

  /**
   * Get adjusted interval for a recipe
   */
  async getAdjustedInterval(
    tenantId: string,
    recipeId: string,
    baseInterval: number,
    adaptiveConfig?: Partial<AdaptiveConfig>,
  ): Promise<number> {
    const config: AdaptiveConfig = {
      ...DEFAULT_ADAPTIVE_CONFIG,
      ...adaptiveConfig,
    };

    if (!config.enabled) {
      return baseInterval;
    }

    const stats = await this.computeRecipeStats(
      tenantId,
      recipeId,
      config.windowHours,
    );

    return this.adjustInterval(baseInterval, stats, config);
  }

  /**
   * Parse adaptive config from plan bundle
   */
  parseAdaptiveConfig(adaptive: any): AdaptiveConfig {
    if (!adaptive || typeof adaptive !== 'object') {
      return DEFAULT_ADAPTIVE_CONFIG;
    }

    return {
      enabled: Boolean(adaptive.enabled),
      windowHours: Number(adaptive.window_hours) || DEFAULT_ADAPTIVE_CONFIG.windowHours,
      minSamples: Number(adaptive.min_samples) || DEFAULT_ADAPTIVE_CONFIG.minSamples,
      failRateSoft: Number(adaptive.fail_rate_soft) || DEFAULT_ADAPTIVE_CONFIG.failRateSoft,
      failRateHard: Number(adaptive.fail_rate_hard) || DEFAULT_ADAPTIVE_CONFIG.failRateHard,
    };
  }
}
