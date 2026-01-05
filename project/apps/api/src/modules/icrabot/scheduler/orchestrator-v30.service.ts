/**
 * ORCHESTRATOR V30 SERVICE
 * 
 * Debtor-scoped planning + per-recipe interval + adaptive scheduling
 * 
 * v30 Yenilikleri:
 * - scope: 'case' → tek job per case
 * - scope: 'debtor' → her borçlu için ayrı job
 * - interval_seconds: recipe bazında cooldown
 * - adaptive: fail rate'e göre interval ayarlama
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PlanLoaderService, StageRecipe } from '../plan/plan-loader.service';
import { AdaptiveSchedulerService } from './adaptive-scheduler.service';

export interface PlannedJob {
  caseId: string;
  debtorId: string | null;
  recipeId: string;
  riskLevel: string;
  intervalSeconds: number;
}

@Injectable()
export class OrchestratorV30Service {
  private readonly logger = new Logger(OrchestratorV30Service.name);

  constructor(
    private prisma: PrismaService,
    private planLoader: PlanLoaderService,
    private adaptiveScheduler: AdaptiveSchedulerService,
  ) {}

  /**
   * Plan jobs for a case based on its stage
   */
  async planForCase(caseId: string, tenantId: string): Promise<PlannedJob[]> {
    // Get case with debtors
    const caseData = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        stage: true,
        debtors: {
          select: { id: true },
        },
      },
    });

    if (!caseData) {
      this.logger.warn(`Case ${caseId} not found`);
      return [];
    }

    const stage = caseData.stage || 'DEFAULT';
    const plan = await this.planLoader.loadActivePlan(tenantId);
    const adaptiveConfig = plan.adaptive;

    // Get recipes for this stage (or DEFAULT)
    const stageSpec = plan.stages[stage] || plan.stages['DEFAULT'];
    if (!stageSpec?.recipes?.length) {
      return [];
    }

    const jobs: PlannedJob[] = [];

    for (const recipe of stageSpec.recipes) {
      if (!recipe.recipe_id) continue;

      const baseInterval = recipe.interval_seconds ?? plan.cooldown_seconds;
      const scope = recipe.scope || 'case';

      // Apply adaptive scheduling
      let effectiveInterval = baseInterval;
      if (adaptiveConfig?.enabled) {
        effectiveInterval = await this.adaptiveScheduler.getAdjustedInterval(
          tenantId,
          recipe.recipe_id,
          baseInterval,
          {
            enabled: adaptiveConfig.enabled,
            windowHours: adaptiveConfig.window_hours,
            minSamples: adaptiveConfig.min_samples,
            failRateSoft: adaptiveConfig.fail_rate_soft,
            failRateHard: adaptiveConfig.fail_rate_hard,
          },
        );
      }

      if (scope === 'debtor') {
        // Create job for each debtor
        for (const debtor of caseData.debtors) {
          const inCooldown = await this.planLoader.isInCooldownV2(
            caseId,
            tenantId,
            recipe.recipe_id,
            debtor.id,
            effectiveInterval,
          );

          if (!inCooldown) {
            jobs.push({
              caseId,
              debtorId: debtor.id,
              recipeId: recipe.recipe_id,
              riskLevel: recipe.risk_level || 'read_only',
              intervalSeconds: effectiveInterval,
            });
          }
        }
      } else {
        // Create single job for case
        const inCooldown = await this.planLoader.isInCooldownV2(
          caseId,
          tenantId,
          recipe.recipe_id,
          null,
          effectiveInterval,
        );

        if (!inCooldown) {
          jobs.push({
            caseId,
            debtorId: null,
            recipeId: recipe.recipe_id,
            riskLevel: recipe.risk_level || 'read_only',
            intervalSeconds: effectiveInterval,
          });
        }
      }
    }

    return jobs;
  }

  /**
   * Create job runs from planned jobs
   */
  async createJobRuns(tenantId: string, plannedJobs: PlannedJob[]): Promise<string[]> {
    const createdIds: string[] = [];

    for (const job of plannedJobs) {
      const created = await this.prisma.icrabotJobRun.create({
        data: {
          tenantId,
          caseId: job.caseId,
          debtorId: job.debtorId,
          recipeId: job.recipeId,
          recipeVersion: 1,
          status: 'QUEUED',
          riskLevel: job.riskLevel.toUpperCase() as any,
        },
      });
      createdIds.push(created.id);
    }

    return createdIds;
  }

  /**
   * Plan and create jobs for a case
   */
  async orchestrateCase(caseId: string, tenantId: string): Promise<string[]> {
    const plannedJobs = await this.planForCase(caseId, tenantId);
    
    if (!plannedJobs.length) {
      return [];
    }

    return this.createJobRuns(tenantId, plannedJobs);
  }

  /**
   * Get recipe stats for monitoring
   */
  async getRecipeStats(tenantId: string, recipeId: string, windowHours: number = 6) {
    return this.adaptiveScheduler.computeRecipeStats(tenantId, recipeId, windowHours);
  }
}
