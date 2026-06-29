import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OfficeApprovalExecutionStatus, OfficeApprovalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OfficeApprovalExecutorService } from './office-approval-executor.service';
import { readOfficeApprovalExecutorConfig } from './office-approval-executor.config';

// P4-5B — OfficeApproval executor AUTOMATION (config-gated cron). Onaylanmış (APPROVED/APPROVED_WITH_CHANGES) NOT_RUN
// backlog'unu deferred yürütür + crash sonrası stuck RUNNING'i reconcile eder. Yetki+karar P4-4'te verildi; burası zamanlayıcı.
//
// KESİN (Ulaş kilidi):
//  - CONFIG-GATED, DEFAULT OFF: enabled=false → prisma'ya HİÇ dokunmaz, sessiz no-op (retention K3 modeli). Merge → runtime SIFIR değişir.
//  - EVERY_30_MINUTES (R3): @Cron literal (env-driven OLAMAZ — decorator class-load'da değerlenir).
//  - SIRA: PASS-1 RUNNING reconcile (önceki tick'in stuck RUNNING'i YENİ iş ÖNCESİ temizlenir) → PASS-2 NOT_RUN scan.
//  - CROSS-TENANT (cron'un tek tenantId'si yok; her satırın kendi tenantId'si executor'a geçer) · SIRALI (concurrency=1).
//  - PER-ROW try/catch → satır hatası tick'i ASLA düşürmez (Ulaş ek-kilidi). execute()/reconcile() beklenen yarışlarda THROW eder.
//  - FAILED RETRY YOK (R1=A): scan-pass YALNIZ executionStatus=NOT_RUN tarar; FAILED satırlar ENUMERATE EDİLMEZ → P4-5C.
//  - VISIBILITY = tick başına özet log (R4); counters/groupBy API YOK. Mutation actor=approverUserId (executor içinde, K4);
//    cron-actor='SYSTEM_CRON' yalnız "kim tetikledi" trigger context'i (resmi case-history/audit actor'ı DEĞİL).
//  - PUBLIC ROUTE YOK · MIGRATION YOK · CHANGE_STATUS controller değişmez (executor PURE service çağırır).
//
// /// <remarks>
// /// Çağrıldığı yerler: @Cron timer (otomatik, enabled ise) + testler runSweep()'i DOĞRUDAN çağırır. HTTP route YOK.
// /// </remarks>

const CRON_ACTOR = 'SYSTEM_CRON';
const EXECUTABLE_STATUSES = [OfficeApprovalStatus.APPROVED, OfficeApprovalStatus.APPROVED_WITH_CHANGES];
const SCOPE = { actionCode: 'CHANGE_STATUS', targetType: 'LegalCase' } as const;

export interface ExecutorSweepResult {
  enabled: boolean;
  scanned: number;
  applied: number;
  failed: number;
  stale: number;
  reconciled: number;
}

@Injectable()
export class OfficeApprovalExecutorCronService {
  private readonly logger = new Logger(OfficeApprovalExecutorCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: OfficeApprovalExecutorService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES, { name: 'officeApprovalExecutor' })
  async handleCron(): Promise<void> {
    await this.runSweep();
  }

  /**
   * Tek tick: PASS-1 RUNNING reconcile → PASS-2 NOT_RUN scan. Testler DOĞRUDAN çağırır.
   * enabled=false → prisma'ya dokunmadan no-op döner. Satır hataları YUTULUR (app/tick düşmez). FAILED ENUMERATE EDİLMEZ.
   */
  async runSweep(): Promise<ExecutorSweepResult> {
    const config = readOfficeApprovalExecutorConfig();
    if (!config.enabled) {
      // default-off: prisma'ya HİÇ erişmeden no-op (spam log YOK).
      return { enabled: false, scanned: 0, applied: 0, failed: 0, stale: 0, reconciled: 0 };
    }

    let scanned = 0;
    let applied = 0;
    let failed = 0;
    let stale = 0;
    let reconciled = 0;

    // PASS-1 — RUNNING reconcile (P4-5C-1 PRECISE: runningStartedAt stuckCutoff'tan eski olanlar; taze in-flight claim ATLANIR).
    //   runningStartedAt=null → pre-migration orphan → eligible. stuckCutoff = now - STUCK_TIMEOUT.
    const stuckCutoff = new Date(Date.now() - config.stuckTimeoutMinutes * 60_000);
    const running = await this.prisma.officeApprovalRequest.findMany({
      where: {
        status: { in: EXECUTABLE_STATUSES },
        executionStatus: OfficeApprovalExecutionStatus.RUNNING,
        ...SCOPE,
        OR: [{ runningStartedAt: { lte: stuckCutoff } }, { runningStartedAt: null }],
      },
      select: { id: true, tenantId: true },
      orderBy: { createdAt: 'asc' },
      take: config.batchSize,
    });
    for (const row of running) {
      try {
        await this.executor.reconcileStuckRunning(row.id, row.tenantId, stuckCutoff);
        reconciled++;
      } catch (e) {
        // beklenen yarış: canlı executor önce terminalize etti → markExecution* count=0 Conflict → logla+devam.
        this.logger.warn(`reconcile satır ${row.id} atlandı: ${(e as Error)?.message ?? e}`);
      }
    }

    // PASS-2 — NOT_RUN scan (onaylı backlog drain; YALNIZ NOT_RUN → FAILED retry YOK, R1=A).
    const pending = await this.prisma.officeApprovalRequest.findMany({
      where: { status: { in: EXECUTABLE_STATUSES }, executionStatus: OfficeApprovalExecutionStatus.NOT_RUN, ...SCOPE },
      select: { id: true, tenantId: true },
      orderBy: { createdAt: 'asc' },
      take: config.batchSize,
    });
    for (const row of pending) {
      scanned++;
      try {
        const r = await this.executor.execute(row.id, row.tenantId, CRON_ACTOR);
        if (r.executionStatus === OfficeApprovalExecutionStatus.SUCCEEDED) applied++;
        else if (r.executionStatus === OfficeApprovalExecutionStatus.FAILED) failed++;
        else if (r.executionStatus === OfficeApprovalExecutionStatus.STALE) stale++;
      } catch (e) {
        // execute() beklenen yarışlarda THROW eder (Conflict/BadRequest/NotFound) → satır hatası tick'i DÜŞÜRMEZ (Ulaş ek-kilidi).
        this.logger.warn(`execute satır ${row.id} atlandı: ${(e as Error)?.message ?? e}`);
      }
    }

    // R4 — tick başına özet log (counters API YOK).
    this.logger.log(
      `P4-5B tick: scanned=${scanned} applied=${applied} failed=${failed} stale=${stale} reconciled=${reconciled}`,
    );
    return { enabled: true, scanned, applied, failed, stale, reconciled };
  }
}
