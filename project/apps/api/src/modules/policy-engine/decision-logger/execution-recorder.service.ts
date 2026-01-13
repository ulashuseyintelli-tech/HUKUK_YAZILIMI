import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ActionCode, ActionContext, ActionResult, ExecutionResponse } from '../types';

// Type alias for Prisma client with CPE models (will be available after prisma generate)
type PrismaWithCpe = PrismaService & {
  cpeExecutionRecord: any;
};

/**
 * ExecutionRecorder Service
 * 
 * Aksiyon yürütmelerini kaydeder.
 * Idempotency için executionId kullanır.
 * 
 * DecisionLog = "karar verdim"
 * ExecutionRecord = "yaptım"
 */
@Injectable()
export class ExecutionRecorderService {
  private readonly logger = new Logger(ExecutionRecorderService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get db(): PrismaWithCpe {
    return this.prisma as PrismaWithCpe;
  }

  /**
   * Execution başlatır.
   * Duplicate executionId kontrolü yapar.
   * 
   * @returns null if duplicate, otherwise the record
   */
  async startExecution(
    executionId: string,
    caseId: string,
    actionCode: ActionCode,
    context?: ActionContext,
    ruleVersion?: string,
  ): Promise<{ isNew: boolean; record: any }> {
    // Check for duplicate
    const existing = await this.db.cpeExecutionRecord.findUnique({
      where: { executionId },
    });

    if (existing) {
      this.logger.debug(`Duplicate executionId: ${executionId}`);
      return { isNew: false, record: existing };
    }

    // Create new record
    const record = await this.db.cpeExecutionRecord.create({
      data: {
        executionId,
        caseId,
        actionCode,
        contextJson: context ? {
          debtorId: context.debtorId,
          assetId: context.assetId,
          expenseId: context.expenseId,
        } : null,
        status: 'PENDING',
        ruleVersion,
      },
    });

    this.logger.debug(`Execution started: ${executionId} for ${actionCode}`);
    return { isNew: true, record };
  }

  /**
   * Execution'ı tamamlar.
   */
  async completeExecution(
    executionId: string,
    result: ActionResult,
    stateBeforeHash?: string,
    stateAfterHash?: string,
  ): Promise<void> {
    await this.db.cpeExecutionRecord.update({
      where: { executionId },
      data: {
        finishedAt: new Date(),
        status: result.success ? 'SUCCESS' : 'FAILED',
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        stateBeforeHash,
        stateAfterHash,
      },
    });

    this.logger.debug(
      `Execution completed: ${executionId} - ${result.success ? 'SUCCESS' : 'FAILED'}`,
    );
  }

  /**
   * Execution'ı NOOP olarak işaretler (duplicate).
   */
  async markAsNoop(executionId: string): Promise<void> {
    await this.db.cpeExecutionRecord.update({
      where: { executionId },
      data: {
        finishedAt: new Date(),
        status: 'NOOP',
      },
    });
  }

  /**
   * ExecutionId ile kayıt bulur.
   */
  async getExecution(executionId: string): Promise<any | null> {
    return this.db.cpeExecutionRecord.findUnique({
      where: { executionId },
    });
  }

  /**
   * Dosya için execution geçmişini döndürür.
   */
  async getExecutionHistory(
    caseId: string,
    options?: {
      actionCode?: ActionCode;
      status?: 'PENDING' | 'SUCCESS' | 'FAILED' | 'NOOP';
      limit?: number;
    },
  ): Promise<any[]> {
    return this.db.cpeExecutionRecord.findMany({
      where: {
        caseId,
        ...(options?.actionCode && { actionCode: options.actionCode }),
        ...(options?.status && { status: options.status }),
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 100,
    });
  }

  /**
   * Pending execution'ları bulur (cleanup için).
   */
  async getPendingExecutions(olderThanMinutes: number = 30): Promise<any[]> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    
    return this.db.cpeExecutionRecord.findMany({
      where: {
        status: 'PENDING',
        startedAt: { lt: cutoff },
      },
    });
  }

  /**
   * Stale pending execution'ları FAILED olarak işaretler.
   */
  async cleanupStaleExecutions(olderThanMinutes: number = 30): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    
    const result = await this.db.cpeExecutionRecord.updateMany({
      where: {
        status: 'PENDING',
        startedAt: { lt: cutoff },
      },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorCode: 'TIMEOUT',
        errorMessage: 'Execution timed out',
      },
    });

    if (result.count > 0) {
      this.logger.warn(`Cleaned up ${result.count} stale executions`);
    }

    return result.count;
  }
}
