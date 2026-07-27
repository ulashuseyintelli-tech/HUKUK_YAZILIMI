/**
 * v28 Engine Run Service
 * 
 * Engine run tracking - compute/decision execution records.
 * OpenAPI spec: GET /engine/runs/{run_id}
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxScope } from './outbox-scope';
import { assertCaseInScope, isCaseInScope } from './case-scope';

export type EngineRunStatus = 'started' | 'succeeded' | 'failed';

export interface EngineRunResponse {
  run_id: string;
  case_id: string;
  rule_id: string;
  trigger_event_id: string | null;
  snapshot_hash: string;
  status: EngineRunStatus;
  started_at: string;
  finished_at: string | null;
  compute_summary: Record<string, any> | null;
  error: Record<string, any> | null;
}

export interface CreateEngineRunParams {
  caseId: string;
  ruleId: string;
  triggerEventId?: string;
  snapshotHash: string;
}

@Injectable()
export class EngineRunService {
  private readonly logger = new Logger(EngineRunService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Yeni engine run başlatır
   */
  async startRun(params: CreateEngineRunParams): Promise<string> {
    const run = await (this.prisma as any).icrabotEngineRun.create({
      data: {
        caseId: params.caseId,
        ruleId: params.ruleId,
        triggerEventId: params.triggerEventId,
        snapshotHash: params.snapshotHash,
        status: 'started',
        startedAt: new Date(),
      },
    });

    this.logger.debug(`Engine run started: ${run.id} (rule=${params.ruleId})`);
    return run.id;
  }

  /**
   * Engine run'ı başarılı olarak işaretle
   */
  async markSucceeded(runId: string, computeSummary?: Record<string, any>): Promise<void> {
    await (this.prisma as any).icrabotEngineRun.update({
      where: { id: runId },
      data: {
        status: 'succeeded',
        finishedAt: new Date(),
        computeSummary: computeSummary || {},
      },
    });
    this.logger.debug(`Engine run succeeded: ${runId}`);
  }

  /**
   * Engine run'ı başarısız olarak işaretle
   */
  async markFailed(runId: string, error: Record<string, any>): Promise<void> {
    await (this.prisma as any).icrabotEngineRun.update({
      where: { id: runId },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        error,
      },
    });
    this.logger.warn(`Engine run failed: ${runId}`);
  }

  /**
   * Engine run detayını döner
   * OpenAPI spec: GET /engine/runs/{run_id}
   */
  async getRun(runId: string, scope: OutboxScope): Promise<EngineRunResponse> {
    const run = await (this.prisma as any).icrabotEngineRun.findUnique({
      where: { id: runId },
    });

    // V28-XTEN-I02: runId cagiran-kontrollu. Kapsam disi run ile VAR OLMAYAN run
    // AYNI hatayi verir — cagiran run'in varligini yanittan cikaramaz.
    if (!run || !(await isCaseInScope(this.prisma as any, run.caseId, scope))) {
      throw new NotFoundException(`Engine run not found: ${runId}`);
    }

    return this.toApiFormat(run);
  }

  /**
   * Dosya için engine run'ları döner
   */
  async getRunsByCaseId(
    caseId: string,
    scope: OutboxScope,
    options?: {
      status?: EngineRunStatus;
      ruleId?: string;
      limit?: number;
    },
  ): Promise<EngineRunResponse[]> {
    await assertCaseInScope(this.prisma as any, caseId, scope);

    const where: any = { caseId };
    if (options?.status) where.status = options.status;
    if (options?.ruleId) where.ruleId = options.ruleId;

    const runs = await (this.prisma as any).icrabotEngineRun.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: options?.limit || 50,
    });

    return runs.map((r: any) => this.toApiFormat(r));
  }

  /**
   * Son N gündeki run istatistikleri
   */
  async getStats(scope: OutboxScope, days = 7): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    avgDurationMs: number;
  }> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // V28-XTEN-I02: onceki hali TUM tenant'lardaki run'lari sayan global aggregate'ti.
    // `IcrabotEngineRun` tenantId TASIMAZ ve `Case`'e Prisma relation'i YOKTUR; bu
    // yuzden kapsam, tek authoritative kaynak olan `Case.tenantId` ile parametreli
    // bir JOIN uzerinden kurulur (tenant'in tum case kimliklerini belleğe cekmeden).
    const runs: Array<{ status: string; startedAt: Date; finishedAt: Date | null }> =
      scope.kind === 'platform'
        ? await (this.prisma as any).icrabotEngineRun.findMany({
            where: { startedAt: { gte: since } },
            select: { status: true, startedAt: true, finishedAt: true },
          })
        : await (this.prisma as any).$queryRaw`
            SELECT r."status", r."startedAt", r."finishedAt"
            FROM "IcrabotEngineRun" r
            JOIN "Case" c ON c."id" = r."caseId"
            WHERE r."startedAt" >= ${since} AND c."tenantId" = ${scope.tenantId}
          `;

    let succeeded = 0;
    let failed = 0;
    let totalDuration = 0;
    let completedCount = 0;

    for (const run of runs) {
      if (run.status === 'succeeded') succeeded++;
      if (run.status === 'failed') failed++;
      if (run.finishedAt) {
        totalDuration += run.finishedAt.getTime() - run.startedAt.getTime();
        completedCount++;
      }
    }

    return {
      total: runs.length,
      succeeded,
      failed,
      avgDurationMs: completedCount > 0 ? Math.round(totalDuration / completedCount) : 0,
    };
  }

  /**
   * DB formatından API formatına dönüştürür (snake_case)
   */
  private toApiFormat(run: any): EngineRunResponse {
    return {
      run_id: run.id,
      case_id: run.caseId,
      rule_id: run.ruleId,
      trigger_event_id: run.triggerEventId || null,
      snapshot_hash: run.snapshotHash,
      status: run.status,
      started_at: run.startedAt.toISOString(),
      finished_at: run.finishedAt?.toISOString() || null,
      compute_summary: run.computeSummary && Object.keys(run.computeSummary).length > 0 
        ? run.computeSummary 
        : null,
      error: run.error && Object.keys(run.error).length > 0 ? run.error : null,
    };
  }
}
