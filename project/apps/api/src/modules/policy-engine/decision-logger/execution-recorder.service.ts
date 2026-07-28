import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
  /**
   * DEBTOR-CPE-TENANT-HARDENING-P1-I01 (DEBTOR-IDOR-02): `tenantId` zorunludur ve
   * CasePolicyEngine'in dogruladigi Case sahipliginden tasinir. Execution kaydi artik
   * kendi tenant baglamini acikca tasir; `caseId` uzerinden dolayli turetime bagimli
   * degildir (retention/incident/raporlama sorgulari dogrudan filtreleyebilir).
   */
  async startExecution(
    tenantId: string,
    executionId: string,
    caseId: string,
    actionCode: ActionCode,
    context?: ActionContext,
    ruleVersion?: string,
  ): Promise<{ isNew: boolean; record: any }> {
    if (typeof tenantId !== 'string' || tenantId.length === 0) {
      throw new Error('cpe_execution_tenant_required: tenantId cozumlenemedi');
    }
    if (typeof executionId !== 'string' || executionId.length === 0) {
      throw new Error('cpe_execution_id_required: executionId zorunludur');
    }

    // UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02: duplicate arama TENANT-SCOPED'dir.
    // Onceden `findUnique({ executionId })` GLOBAL idi: istemci govdesinden gelen bir
    // `executionId` baska tenant'in kaydini dondurebiliyor, cagiran tenant'in kaydi
    // "duplicate" sayilip state transition'i SESSIZCE atlanabiliyordu.
    const existing = await this.findByTenantExecution(tenantId, executionId);

    if (existing) {
      this.logger.debug(`Duplicate executionId: ${executionId}`);
      return { isNew: false, record: existing };
    }

    // UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02: check-then-create yarisi.
    // Ayni (tenantId, executionId) ile es zamanli iki cagri, ikisi de `existing`
    // bulamayip create'e gecebilir. Kaybeden taraf P2002 alir; ham Prisma hatasi
    // sizdirilmaz — kazananin kaydi okunup NORMAL duplicate cevabi uretilir
    // (idempotency sozlesmesi es zamanlilik altinda da deterministiktir).
    try {
      const record = await this.db.cpeExecutionRecord.create({
        data: {
          tenantId,
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
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }
      const winner = await this.findByTenantExecution(tenantId, executionId);
      if (!winner) {
        // Unique ihlali var ama kazanan satir okunamiyor → sessiz gecis YOK.
        throw error;
      }
      this.logger.debug(`Concurrent duplicate executionId: ${executionId}`);
      return { isNew: false, record: winner };
    }
  }

  /** Tenant-scoped tekil arama — idempotency namespace'i tenant basinadir. */
  private async findByTenantExecution(tenantId: string, executionId: string): Promise<any | null> {
    return this.db.cpeExecutionRecord.findUnique({
      where: { tenantId_executionId: { tenantId, executionId } },
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
    );
  }

  /** Fail-closed tenant guard — tenant baglami olmadan hicbir execution kaydi okunmaz/yazilmaz. */
  private requireTenant(tenantId: string): void {
    if (typeof tenantId !== 'string' || tenantId.length === 0) {
      throw new Error('cpe_execution_tenant_required: tenantId cozumlenemedi');
    }
  }

  /**
   * Execution'ı tamamlar.
   */
  /**
   * UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02: `tenantId` ZORUNLU. `executionId` tek basina
   * artik tekil DEGILDIR (tenant-scoped namespace); tenant'siz guncelleme baska bir
   * tenant'in kaydini hedefleyebilirdi.
   */
  async completeExecution(
    tenantId: string,
    executionId: string,
    result: ActionResult,
    stateBeforeHash?: string,
    stateAfterHash?: string,
  ): Promise<void> {
    this.requireTenant(tenantId);
    await this.db.cpeExecutionRecord.update({
      where: { tenantId_executionId: { tenantId, executionId } },
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
  async markAsNoop(tenantId: string, executionId: string): Promise<void> {
    this.requireTenant(tenantId);
    await this.db.cpeExecutionRecord.update({
      where: { tenantId_executionId: { tenantId, executionId } },
      data: {
        finishedAt: new Date(),
        status: 'NOOP',
      },
    });
  }

  /**
   * ExecutionId ile kayıt bulur (tenant-scoped).
   */
  async getExecution(tenantId: string, executionId: string): Promise<any | null> {
    this.requireTenant(tenantId);
    return this.findByTenantExecution(tenantId, executionId);
  }

  /**
   * Dosya için execution geçmişini döndürür.
   * UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02: `caseId` tek basina tenant siniri DEGILDIR.
   */
  async getExecutionHistory(
    tenantId: string,
    caseId: string,
    options?: {
      actionCode?: ActionCode;
      status?: 'PENDING' | 'SUCCESS' | 'FAILED' | 'NOOP';
      limit?: number;
    },
  ): Promise<any[]> {
    this.requireTenant(tenantId);
    return this.db.cpeExecutionRecord.findMany({
      where: {
        tenantId,
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
   * UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02: tenant-scoped — global tarama YOK.
   */
  async getPendingExecutions(tenantId: string, olderThanMinutes: number = 30): Promise<any[]> {
    this.requireTenant(tenantId);
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    return this.db.cpeExecutionRecord.findMany({
      where: {
        tenantId,
        status: 'PENDING',
        startedAt: { lt: cutoff },
      },
    });
  }

  /**
   * Stale pending execution'ları FAILED olarak işaretler.
   * UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02: tenant-scoped — global yazma YOK.
   */
  async cleanupStaleExecutions(tenantId: string, olderThanMinutes: number = 30): Promise<number> {
    this.requireTenant(tenantId);
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    const result = await this.db.cpeExecutionRecord.updateMany({
      where: {
        tenantId,
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
