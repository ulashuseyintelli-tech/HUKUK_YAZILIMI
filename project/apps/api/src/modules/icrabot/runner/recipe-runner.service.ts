/**
 * RECIPE RUNNER SERVICE (v16)
 * 
 * Recipe execution engine.
 * - ACTIVE bundle'ları yükler
 * - Recipe → Steps → Actions döngüsünü çalıştırır
 * - Her action için JobStep + Snapshot üretir
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { BundleService, BundleContent } from '../bundle/bundle.service';
import { EvidenceService } from '../evidence.service';
import * as crypto from 'crypto';

export interface RunnerResult {
  jobId: string;
  status: 'done' | 'failed' | 'quarantined';
  stepsExecuted: number;
  error?: string;
}

export interface UIWorkerResult {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
}

// UI Worker Interface (stub - gerçek RPA/Selenium sonra bağlanır)
export interface IUIWorker {
  open(navPath: string[]): Promise<UIWorkerResult>;
  click(button: string): Promise<UIWorkerResult>;
  read(fields: string[]): Promise<UIWorkerResult>;
  fill(fields: Record<string, any>): Promise<UIWorkerResult>;
  query(input: Record<string, any>): Promise<UIWorkerResult>;
}

// Stub UI Worker
class StubUIWorker implements IUIWorker {
  async open(navPath: string[]): Promise<UIWorkerResult> {
    return { success: true, data: { opened: navPath } };
  }

  async click(button: string): Promise<UIWorkerResult> {
    return { success: true, data: { clicked: button } };
  }

  async read(fields: string[]): Promise<UIWorkerResult> {
    const data: Record<string, any> = {};
    for (const field of fields) {
      data[field] = null; // Stub returns null
    }
    return { success: true, data };
  }

  async fill(fields: Record<string, any>): Promise<UIWorkerResult> {
    return { success: true, data: { filled: fields } };
  }

  async query(input: Record<string, any>): Promise<UIWorkerResult> {
    return { success: true, data: { queried: input } };
  }
}

@Injectable()
export class RecipeRunnerService {
  private readonly logger = new Logger(RecipeRunnerService.name);
  private worker: IUIWorker;

  constructor(
    private prisma: PrismaService,
    private bundleService: BundleService,
    private evidenceService: EvidenceService,
  ) {
    this.worker = new StubUIWorker();
  }

  // Set custom UI worker (for real RPA integration)
  setUIWorker(worker: IUIWorker): void {
    this.worker = worker;
  }

  async runJob(jobId: string, tenantId: string): Promise<RunnerResult> {
    const job = await this.prisma.icrabotJobRun.findFirst({
      where: { jobId, tenantId },
      include: { case: true },
    });

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.status === 'DONE' || job.status === 'QUARANTINED') {
      return {
        jobId,
        status: job.status === 'DONE' ? 'done' : 'quarantined',
        stepsExecuted: 0,
      };
    }

    // Load active bundles
    const [recipeBundle, paramsBundle, uimapBundle] = await Promise.all([
      this.bundleService.getActiveBundle('recipe', tenantId),
      this.bundleService.getActiveBundle('params', tenantId),
      this.bundleService.getActiveBundle('uimap', tenantId),
    ]);

    if (!recipeBundle || !paramsBundle || !uimapBundle) {
      throw new Error('Missing ACTIVE bundles (recipe/params/uimap)');
    }

    // Find recipe
    const recipe = this.findRecipe(recipeBundle.content, job.recipeId);
    if (!recipe) {
      throw new Error(`Recipe not found: ${job.recipeId}`);
    }

    // Update job status
    await this.prisma.icrabotJobRun.update({
      where: { id: job.id },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        attempt: job.attempt + 1,
      },
    });

    try {
      // Execute recipe
      const stepsExecuted = await this.executeRecipe(job, recipe, paramsBundle.content, uimapBundle.content);

      // Mark as done
      await this.prisma.icrabotJobRun.update({
        where: { id: job.id },
        data: {
          status: 'DONE',
          finishedAt: new Date(),
        },
      });

      return { jobId, status: 'done', stepsExecuted };
    } catch (error: any) {
      this.logger.error(`Job ${jobId} failed: ${error.message}`);

      const newAttempt = job.attempt + 1;
      const shouldQuarantine = newAttempt >= job.maxAttempts;

      await this.prisma.icrabotJobRun.update({
        where: { id: job.id },
        data: {
          status: shouldQuarantine ? 'QUARANTINED' : 'FAILED',
          lastErrorCode: error.name || 'RUNNER_ERROR',
          lastErrorMessage: error.message,
        },
      });

      return {
        jobId,
        status: shouldQuarantine ? 'quarantined' : 'failed',
        stepsExecuted: 0,
        error: error.message,
      };
    }
  }

  private findRecipe(content: BundleContent, recipeId: string): any {
    const recipes = content.recipes || [];
    return recipes.find((r: any) => r.recipe_id === recipeId);
  }

  private async executeRecipe(
    job: any,
    recipe: any,
    params: BundleContent,
    uimap: BundleContent,
  ): Promise<number> {
    const actions = recipe.actions || recipe.steps || [];
    let stepNo = 0;

    // Step 0: Record recipe meta
    const metaPayload = {
      recipe_id: recipe.recipe_id,
      recipe_version: recipe.version,
      uyap_nav_path: recipe.uyap_nav_path,
      params_loaded: true,
      uimap_loaded: true,
    };

    await this.createJobStep(job, 0, 'recipe_meta', recipe.uyap_nav_path, metaPayload);

    // Execute each action
    for (const action of actions) {
      stepNo++;
      await this.executeAction(job, stepNo, action, params, uimap);
    }

    return stepNo;
  }

  private async executeAction(
    job: any,
    stepNo: number,
    action: any,
    params: BundleContent,
    uimap: BundleContent,
  ): Promise<void> {
    const actionType = action.type || 'unknown';
    const navPath = action.uyap_nav_path || action.nav || [];

    let result: UIWorkerResult;

    switch (actionType) {
      case 'open':
        result = await this.worker.open(navPath);
        break;
      case 'click':
        result = await this.worker.click(action.button);
        break;
      case 'read':
        result = await this.worker.read(action.fields || []);
        break;
      case 'fill':
        result = await this.worker.fill(action.fields || {});
        break;
      case 'query':
        result = await this.worker.query(action.input || {});
        break;
      default:
        result = { success: true, data: { noop: true } };
    }

    const payload = {
      step: stepNo,
      action: actionType,
      nav: navPath,
      result: result.data,
      status: result.success ? 'ok' : 'error',
    };

    await this.createJobStep(job, stepNo, actionType, navPath, payload, result.success ? 'ok' : 'error');

    if (!result.success) {
      throw new Error(result.error || `Action failed: ${actionType}`);
    }
  }

  private async createJobStep(
    job: any,
    stepNo: number,
    actionType: string,
    navPath: string[] | undefined,
    payload: any,
    status: string = 'ok',
  ): Promise<void> {
    const snapshotHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

    // Create snapshot
    const snapshot = await this.prisma.icrabotEvidence.create({
      data: {
        caseId: job.caseId,
        snapshotId: `snap_${job.jobId}_${stepNo}`,
        snapshotHash,
        payload,
        tenantId: job.tenantId,
      },
    });

    // Create job step
    await this.prisma.icrabotJobStep.create({
      data: {
        jobId: job.id,
        stepNo,
        actionType,
        uyapNavPath: navPath ? navPath.join(' > ') : null,
        status,
        snapshotHash,
        proofRef: snapshot.snapshotId,
      },
    });
  }
}
