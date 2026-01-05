/**
 * RECIPE PAUSE SERVICE (v32)
 * 
 * Recipe'leri pause/unpause etme.
 * Paused recipe'ler orchestrator tarafından planlanmaz.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface RecipePauseInfo {
  recipeId: string;
  isPaused: boolean;
  reason: string | null;
  pausedAt: Date | null;
}

@Injectable()
export class RecipePauseService {
  private readonly logger = new Logger(RecipePauseService.name);
  private cache: Map<string, boolean> = new Map();
  private cacheLoadedAt: Date | null = null;
  private readonly CACHE_TTL_MS = 30000; // 30 seconds

  constructor(private prisma: PrismaService) {}

  /**
   * Pause a recipe
   */
  async pauseRecipe(
    tenantId: string,
    recipeId: string,
    reason?: string,
  ): Promise<RecipePauseInfo> {
    const pause = await this.prisma.icrabotRecipePause.upsert({
      where: {
        tenantId_recipeId: { tenantId, recipeId },
      },
      create: {
        tenantId,
        recipeId,
        isPaused: true,
        reason: reason || null,
      },
      update: {
        isPaused: true,
        reason: reason || null,
      },
    });

    this.clearCache();
    this.logger.log(`Recipe ${recipeId} paused: ${reason || 'no reason'}`);

    return {
      recipeId: pause.recipeId,
      isPaused: pause.isPaused,
      reason: pause.reason,
      pausedAt: pause.updatedAt,
    };
  }

  /**
   * Unpause a recipe
   */
  async unpauseRecipe(tenantId: string, recipeId: string): Promise<RecipePauseInfo> {
    const pause = await this.prisma.icrabotRecipePause.upsert({
      where: {
        tenantId_recipeId: { tenantId, recipeId },
      },
      create: {
        tenantId,
        recipeId,
        isPaused: false,
        reason: null,
      },
      update: {
        isPaused: false,
        reason: null,
      },
    });

    this.clearCache();
    this.logger.log(`Recipe ${recipeId} unpaused`);

    return {
      recipeId: pause.recipeId,
      isPaused: pause.isPaused,
      reason: pause.reason,
      pausedAt: null,
    };
  }

  /**
   * Check if a recipe is paused
   */
  async isRecipePaused(tenantId: string, recipeId: string): Promise<boolean> {
    await this.ensureCacheLoaded(tenantId);
    return this.cache.get(recipeId) || false;
  }

  /**
   * Get all paused recipes
   */
  async getPausedRecipes(tenantId: string): Promise<RecipePauseInfo[]> {
    const pauses = await this.prisma.icrabotRecipePause.findMany({
      where: { tenantId, isPaused: true },
    });

    return pauses.map(p => ({
      recipeId: p.recipeId,
      isPaused: p.isPaused,
      reason: p.reason,
      pausedAt: p.updatedAt,
    }));
  }

  /**
   * Ensure cache is loaded
   */
  private async ensureCacheLoaded(tenantId: string): Promise<void> {
    if (this.cacheLoadedAt && Date.now() - this.cacheLoadedAt.getTime() < this.CACHE_TTL_MS) {
      return;
    }

    const pauses = await this.prisma.icrabotRecipePause.findMany({
      where: { tenantId, isPaused: true },
      select: { recipeId: true },
    });

    this.cache.clear();
    for (const p of pauses) {
      this.cache.set(p.recipeId, true);
    }
    this.cacheLoadedAt = new Date();
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheLoadedAt = null;
  }
}
