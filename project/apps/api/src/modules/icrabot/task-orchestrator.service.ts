import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { 
  BotTask, 
  BotTaskStatus, 
  TaskPriority,
  Recipe,
} from './types/recipe.types';
import { RecipeService } from './recipe.service';
import { EvidenceService } from './evidence.service';
import { Cron, CronExpression } from '@nestjs/schedule';

/**
 * TASK ORCHESTRATOR SERVICE
 * 
 * Görev kuyruğu yönetimi:
 * - Kuyruk (queue)
 * - Önceliklendirme
 * - Retry/backoff
 * - "İnsan onayı gerektiren görev" flag'i
 */
@Injectable()
export class TaskOrchestratorService {
  private readonly logger = new Logger(TaskOrchestratorService.name);
  private isProcessing = false;

  constructor(
    private prisma: PrismaService,
    private recipeService: RecipeService,
    private evidenceService: EvidenceService,
  ) {}

  /**
   * Görevi kuyruğa ekle
   */
  async enqueueTask(params: {
    recipeId: string;
    caseId: string;
    tenantId: string;
    priority?: TaskPriority;
    inputData?: Record<string, any>;
    scheduledAt?: Date;
  }): Promise<BotTask> {
    const recipe = this.recipeService.getRecipeById(params.recipeId);
    if (!recipe) {
      throw new Error(`Recipe not found: ${params.recipeId}`);
    }

    // Aynı görev zaten kuyrukta mı kontrol et
    const existingTask = await this.prisma.botTask.findFirst({
      where: {
        recipeId: params.recipeId,
        caseId: params.caseId,
        status: { in: ['PENDING', 'QUEUED', 'RUNNING'] },
      },
    });

    if (existingTask) {
      this.logger.log(`Task already queued: ${params.recipeId} for case ${params.caseId}`);
      return existingTask as unknown as BotTask;
    }

    const task = await this.prisma.botTask.create({
      data: {
        recipeId: params.recipeId,
        caseId: params.caseId,
        tenantId: params.tenantId,
        status: 'PENDING',
        priority: params.priority || recipe.priority || 'MEDIUM',
        scheduledAt: params.scheduledAt || new Date(),
        attemptCount: 0,
        maxAttempts: recipe.retry?.maxAttempts || 3,
        inputData: params.inputData || {},
        requiresApproval: recipe.requiresApproval || false,
      },
    });

    this.logger.log(`Task enqueued: ${params.recipeId} for case ${params.caseId}`);
    return task as unknown as BotTask;
  }

  /**
   * Birden fazla görevi kuyruğa ekle
   */
  async enqueueTasks(
    recipeIds: string[],
    caseId: string,
    tenantId: string
  ): Promise<BotTask[]> {
    const tasks: BotTask[] = [];
    
    for (const recipeId of recipeIds) {
      try {
        const task = await this.enqueueTask({ recipeId, caseId, tenantId });
        tasks.push(task);
      } catch (error) {
        this.logger.error(`Failed to enqueue task ${recipeId}:`, error);
      }
    }
    
    return tasks;
  }

  /**
   * Dosya için bekleyen görevleri getir
   */
  async getPendingTasks(caseId: string): Promise<BotTask[]> {
    const tasks = await this.prisma.botTask.findMany({
      where: {
        caseId,
        status: { in: ['PENDING', 'QUEUED', 'NEEDS_APPROVAL'] },
      },
      orderBy: [
        { priority: 'asc' }, // CRITICAL=0, HIGH=1, MEDIUM=2, LOW=3
        { scheduledAt: 'asc' },
      ],
    });

    return tasks as unknown as BotTask[];
  }

  /**
   * Görevi onayla
   */
  async approveTask(taskId: string, approvedBy: string): Promise<BotTask> {
    const task = await this.prisma.botTask.update({
      where: { id: taskId },
      data: {
        status: 'QUEUED',
        approvedBy,
        approvedAt: new Date(),
      },
    });

    this.logger.log(`Task approved: ${taskId} by ${approvedBy}`);
    return task as unknown as BotTask;
  }

  /**
   * Görevi iptal et
   */
  async cancelTask(taskId: string, reason?: string): Promise<BotTask> {
    const task = await this.prisma.botTask.update({
      where: { id: taskId },
      data: {
        status: 'CANCELLED',
        lastError: reason || 'Cancelled by user',
      },
    });

    this.logger.log(`Task cancelled: ${taskId}`);
    return task as unknown as BotTask;
  }

  /**
   * Kuyruktan sonraki görevi al ve çalıştır
   */
  async processNextTask(): Promise<BotTask | null> {
    // Çalıştırılabilir görevi bul
    const task = await this.prisma.botTask.findFirst({
      where: {
        status: 'QUEUED',
        scheduledAt: { lte: new Date() },
        OR: [
          { requiresApproval: false },
          { approvedAt: { not: null } },
        ],
      },
      orderBy: [
        { priority: 'asc' },
        { scheduledAt: 'asc' },
      ],
    });

    if (!task) {
      return null;
    }

    // Görevi çalıştır
    return this.executeTask(task.id);
  }

  /**
   * Görevi çalıştır
   */
  async executeTask(taskId: string): Promise<BotTask> {
    // Durumu RUNNING yap
    let task = await this.prisma.botTask.update({
      where: { id: taskId },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });

    const recipe = this.recipeService.getRecipeById(task.recipeId);
    if (!recipe) {
      return this.failTask(taskId, `Recipe not found: ${task.recipeId}`);
    }

    try {
      this.logger.log(`Executing task: ${task.recipeId} for case ${task.caseId}`);

      // Recipe'yi çalıştır
      const result = await this.runRecipe(recipe, task);

      // Başarılı
      task = await this.prisma.botTask.update({
        where: { id: taskId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          outputData: result,
        },
      });

      // Kanıt kaydet
      await this.evidenceService.recordEvidence({
        taskId,
        caseId: task.caseId,
        recipeId: task.recipeId,
        action: 'TASK_COMPLETED',
        data: result,
      });

      // Sonraki görevleri kuyruğa ekle
      if (result.tasksToEnqueue?.length > 0) {
        await this.enqueueTasks(result.tasksToEnqueue, task.caseId, task.tenantId);
      }

      this.logger.log(`Task completed: ${task.recipeId}`);
      return task as unknown as BotTask;

    } catch (error: any) {
      return this.handleTaskError(taskId, task, recipe, error);
    }
  }

  /**
   * Recipe'yi çalıştır
   */
  private async runRecipe(
    recipe: Recipe,
    task: any
  ): Promise<Record<string, any>> {
    // Dosya bilgilerini al
    const twin = await this.recipeService.buildDigitalTwin(task.caseId);

    // Karar kurallarını değerlendir
    const decisions = await this.recipeService.evaluateDecisions(recipe, {
      ...twin,
      ...task.inputData,
    });

    // Güncellemeleri uygula
    if (Object.keys(decisions.updates).length > 0) {
      await this.applyUpdates(task.caseId, decisions.updates);
    }

    // Lifecycle event ekle
    await this.prisma.caseLifecycle.create({
      data: {
        caseId: task.caseId,
        stage: twin.stage as any,
        action: `BOT_TASK_${recipe.recipeId}`,
        description: recipe.name,
        triggeredBy: 'AUTO',
        metadata: {
          recipeId: recipe.recipeId,
          taskId: task.id,
          decisions,
        },
      },
    });

    return {
      success: true,
      tasksToEnqueue: decisions.tasksToEnqueue,
      updates: decisions.updates,
      actions: decisions.actions,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Güncellemeleri uygula
   */
  private async applyUpdates(caseId: string, updates: Record<string, any>): Promise<void> {
    // Basit alan güncellemeleri
    const caseUpdates: Record<string, any> = {};

    for (const [key, value] of Object.entries(updates)) {
      // Template değişkenleri çöz (basit implementasyon)
      const resolvedValue = typeof value === 'string' && value.startsWith('${')
        ? this.resolveTemplate(value)
        : value;

      // Case alanı mı kontrol et
      if (['workflowStage', 'nextActionAt', 'riskScore'].includes(key)) {
        caseUpdates[key] = resolvedValue;
      }
    }

    if (Object.keys(caseUpdates).length > 0) {
      await this.prisma.case.update({
        where: { id: caseId },
        data: caseUpdates,
      });
    }
  }

  /**
   * Template değişkenlerini çöz
   */
  private resolveTemplate(template: string): any {
    // ${now()} → şu anki tarih
    if (template === '${now()}') {
      return new Date();
    }
    // Diğer template'ler için genişletilebilir
    return template;
  }

  /**
   * Görev hatasını işle
   */
  private async handleTaskError(
    taskId: string,
    task: any,
    recipe: Recipe,
    error: Error
  ): Promise<BotTask> {
    this.logger.error(`Task failed: ${task.recipeId}`, error);

    const maxAttempts = recipe.retry?.maxAttempts || 3;
    const shouldRetry = task.attemptCount < maxAttempts;

    if (shouldRetry) {
      // Retry için zamanla
      const backoffMs = recipe.retry?.backoffMs || 60000;
      const nextAttempt = new Date(Date.now() + backoffMs * task.attemptCount);

      const updatedTask = await this.prisma.botTask.update({
        where: { id: taskId },
        data: {
          status: 'RETRY',
          scheduledAt: nextAttempt,
          lastError: error.message,
        },
      });

      this.logger.log(`Task scheduled for retry: ${task.recipeId} at ${nextAttempt}`);
      return updatedTask as unknown as BotTask;
    }

    return this.failTask(taskId, error.message);
  }

  /**
   * Görevi başarısız olarak işaretle
   */
  private async failTask(taskId: string, error: string): Promise<BotTask> {
    const task = await this.prisma.botTask.update({
      where: { id: taskId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        lastError: error,
      },
    });

    // Kanıt kaydet
    await this.evidenceService.recordEvidence({
      taskId,
      caseId: task.caseId,
      recipeId: task.recipeId,
      action: 'TASK_FAILED',
      data: { error },
    });

    return task as unknown as BotTask;
  }

  /**
   * Her 2 dakikada bir kuyruktan görev işle
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Retry durumundaki görevleri QUEUED'a çevir
      await this.prisma.botTask.updateMany({
        where: {
          status: 'RETRY',
          scheduledAt: { lte: new Date() },
        },
        data: { status: 'QUEUED' },
      });

      // Pending görevleri QUEUED'a çevir (onay gerekmeyenler)
      await this.prisma.botTask.updateMany({
        where: {
          status: 'PENDING',
          requiresApproval: false,
          scheduledAt: { lte: new Date() },
        },
        data: { status: 'QUEUED' },
      });

      // Onay bekleyenleri NEEDS_APPROVAL'a çevir
      await this.prisma.botTask.updateMany({
        where: {
          status: 'PENDING',
          requiresApproval: true,
          approvedAt: null,
        },
        data: { status: 'NEEDS_APPROVAL' },
      });

      // Kuyruktan görev işle (max 5 adet)
      for (let i = 0; i < 5; i++) {
        const task = await this.processNextTask();
        if (!task) break;
      }
    } catch (error) {
      this.logger.error('Queue processing error:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Kuyruk istatistiklerini getir
   */
  async getQueueStats(tenantId?: string): Promise<{
    pending: number;
    queued: number;
    running: number;
    needsApproval: number;
    failed: number;
    completedToday: number;
  }> {
    const where = tenantId ? { tenantId } : {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [pending, queued, running, needsApproval, failed, completedToday] = await Promise.all([
      this.prisma.botTask.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.botTask.count({ where: { ...where, status: 'QUEUED' } }),
      this.prisma.botTask.count({ where: { ...where, status: 'RUNNING' } }),
      this.prisma.botTask.count({ where: { ...where, status: 'NEEDS_APPROVAL' } }),
      this.prisma.botTask.count({ where: { ...where, status: 'FAILED' } }),
      this.prisma.botTask.count({
        where: {
          ...where,
          status: 'COMPLETED',
          completedAt: { gte: today },
        },
      }),
    ]);

    return { pending, queued, running, needsApproval, failed, completedToday };
  }
}
