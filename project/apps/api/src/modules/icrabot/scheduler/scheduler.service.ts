/**
 * SCHEDULER SERVICE (v15-v16)
 * 
 * Periyodik job planlama ve kuyruğa ekleme.
 * - Tüm aktif dosyalar için job planlar
 * - Stage ve locks'a göre hangi recipe'lerin çalışacağını belirler
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { BundleService } from '../bundle/bundle.service';
import { RecipeRunnerService } from '../runner/recipe-runner.service';
import { RECIPES } from '../recipes';

export interface PlanResult {
  caseId: string;
  jobsCreated: string[];
}

export interface SchedulerTickResult {
  processedCases: number;
  createdJobs: number;
  errors: string[];
}

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private isRunning = false;

  constructor(
    private prisma: PrismaService,
    private bundleService: BundleService,
    private recipeRunner: RecipeRunnerService,
  ) {}

  // Her 10 dakikada bir çalışır
  @Cron(CronExpression.EVERY_10_MINUTES)
  async tick(): Promise<SchedulerTickResult> {
    if (this.isRunning) {
      this.logger.warn('Scheduler already running, skipping tick');
      return { processedCases: 0, createdJobs: 0, errors: ['Already running'] };
    }

    this.isRunning = true;
    const result: SchedulerTickResult = {
      processedCases: 0,
      createdJobs: 0,
      errors: [],
    };

    try {
      // Get all tenants with active bundles
      const tenants = await this.prisma.office.findMany({
        select: { id: true },
      });

      for (const tenant of tenants) {
        try {
          const tickResult = await this.planAndEnqueueForTenant(tenant.id);
          result.processedCases += tickResult.processedCases;
          result.createdJobs += tickResult.createdJobs;
        } catch (error: any) {
          result.errors.push(`Tenant ${tenant.id}: ${error.message}`);
        }
      }

      this.logger.log(`Scheduler tick completed: ${result.createdJobs} jobs created for ${result.processedCases} cases`);
    } finally {
      this.isRunning = false;
    }

    return result;
  }

  async planAndEnqueueForTenant(tenantId: string, limit = 200): Promise<{ processedCases: number; createdJobs: number }> {
    // Check if active bundles exist
    const validation = await this.bundleService.validateAllActiveBundles(tenantId);
    if (!validation.valid) {
      this.logger.warn(`Tenant ${tenantId} has invalid bundles, skipping`);
      return { processedCases: 0, createdJobs: 0 };
    }

    // Get active cases (not in terminal stages)
    const cases = await this.prisma.case.findMany({
      where: {
        tenantId,
        workflowStage: {
          notIn: ['CLOSED', 'SUSPENDED'],
        },
        isArchived: false,
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        workflowStage: true,
        type: true,
        uyapDosyaId: true,
      },
    });

    let createdJobs = 0;

    for (const caseData of cases) {
      const jobs = await this.planForCase(caseData, tenantId);
      createdJobs += jobs.length;
    }

    return { processedCases: cases.length, createdJobs };
  }

  async planForCase(caseData: any, tenantId: string): Promise<string[]> {
    const stage = caseData.workflowStage;
    const createdJobIds: string[] = [];

    // Base recipes for all stages
    const baseRecipes = ['EnsureUYAPSession', 'SyncSafahatTimeline'];

    // Stage-specific recipes
    const stageRecipes: Record<string, string[]> = {
      ACILIS: ['SyncCaseHeader', 'SyncEvrakIndex'],
      TEBLIGAT: ['FetchPreparedETebligatlar_Debtor', 'ComputeServiceEffectiveDate_ETebligat_Debtor'],
      KESINLESME: ['DetectFinalizationCandidate', 'DetectFinalizationCandidate_ByIcraType'],
      VARLIK: ['RunAssetQueriesBatch', 'ScoreAssetProfile_Debtor'],
      HACIZ: ['PrepareHacizRequests', 'TrackHacizResults'],
      TAHSILAT: ['SyncTahsilat', 'EvaluateCaseClosure'],
      SATIS: ['MonitorSaleStatus'],
    };

    const recipesToRun = [...baseRecipes, ...(stageRecipes[stage] || [])];

    // Check for existing queued/running jobs
    const existingJobs = await this.prisma.icrabotJobRun.findMany({
      where: {
        caseId: caseData.id,
        tenantId,
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      select: { recipeId: true },
    });

    const existingRecipeIds = new Set(existingJobs.map((j: { recipeId: string }) => j.recipeId));

    // Create jobs for recipes not already queued
    for (const recipeId of recipesToRun) {
      if (existingRecipeIds.has(recipeId)) {
        continue;
      }

      // Check if recipe exists
      const recipe = RECIPES.find(r => r.recipeId === recipeId);
      if (!recipe || !recipe.isActive) {
        continue;
      }

      // Check locks
      const hasBlockingLock = await this.checkLocks(caseData.id, recipe, tenantId);
      if (hasBlockingLock) {
        continue;
      }

      // Create job
      const jobId = `job_${caseData.id}_${recipeId}_${Date.now()}`;
      await this.prisma.icrabotJobRun.create({
        data: {
          jobId,
          caseId: caseData.id,
          recipeId,
          recipeVersion: 1,
          status: 'QUEUED',
          riskLevel: (recipe.audit?.level?.toUpperCase() as any) || 'READ_ONLY',
          attempt: 0,
          maxAttempts: 4,
          tenantId,
        },
      });

      createdJobIds.push(jobId);
    }

    return createdJobIds;
  }

  private async checkLocks(caseId: string, recipe: any, tenantId: string): Promise<boolean> {
    // Check if any required locks are open
    const locks = await this.prisma.icrabotLock.findMany({
      where: {
        caseId,
        tenantId,
        isOpen: true,
      },
    });

    // If recipe requires approval and there's a blocking lock
    if (recipe.requiresApproval) {
      const blockingLocks = locks.filter((l: { lockType: string }) => 
        l.lockType === 'LOCK_EXECUTION_ACTIONS' || 
        l.lockType === 'LOCK_COST_ACTIONS'
      );
      return blockingLocks.length > 0;
    }

    return false;
  }

  // Manual trigger for testing
  async triggerTick(tenantId: string): Promise<SchedulerTickResult> {
    const result = await this.planAndEnqueueForTenant(tenantId);
    return {
      processedCases: result.processedCases,
      createdJobs: result.createdJobs,
      errors: [],
    };
  }

  // Process queued jobs
  async processQueuedJobs(tenantId: string, limit = 10): Promise<number> {
    const jobs = await this.prisma.icrabotJobRun.findMany({
      where: {
        tenantId,
        status: 'QUEUED',
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    let processed = 0;

    for (const job of jobs) {
      try {
        await this.recipeRunner.runJob(job.jobId, tenantId);
        processed++;
      } catch (error: any) {
        this.logger.error(`Failed to run job ${job.jobId}: ${error.message}`);
      }
    }

    return processed;
  }
}
