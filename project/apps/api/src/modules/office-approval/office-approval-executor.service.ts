import { Injectable, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import {
  LegalCaseStatus,
  OfficeApprovalRequest,
  OfficeApprovalStatus,
  OfficeApprovalExecutionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OfficeApprovalService } from './office-approval.service';
import { CaseStatusService } from '../case-status/case-status.service';

// P4-5A — savedIntent/replacementSavedIntent untyped Json; intent.status runtime guard'ı için tüm geçerli LegalCaseStatus.
const KNOWN_STATUSES: ReadonlySet<string> = new Set<string>(Object.values(LegalCaseStatus));

interface ChangeStatusIntent {
  status: LegalCaseStatus;
  reason?: string;
}

/**
 * P4-5A — CHANGE_STATUS DEFERRED EXECUTOR (internal CALLABLE service; route/cron/frontend/blocking-response YOK).
 *
 * Onaylanmış (APPROVED / APPROVED_WITH_CHANGES) bir OfficeApprovalRequest'in effective intent'ini, YÜRÜTME ANINDA
 * yeniden doğrulayarak CaseStatusService.changeStatus ile uygular. Yetki + karar P4-4'te verildi (decision-only);
 * burası yalnız deferred yürütmedir.
 *
 * KESİN (Ulaş kilidi):
 *  - K1 TRIGGER: tek public method execute(); @Injectable; route/cron YOK.
 *  - K2 missing-replacement → STALE (execute hatası değil; uygulanabilir intent yapısal yok).
 *  - K3 RUNNING-lock: apply'dan önce markExecutionRunning (NOT_RUN→RUNNING compare-and-set; çift-apply fence).
 *  - K4 ACTOR: changeStatus + markExecution* için actor = request.approverUserId (değişikliği onaylayan adına uygulanır).
 *             execute()'un executorUserId param'ı yalnız "kim tetikledi" internal context'i; resmi audit/case-history actor'ı DEĞİL.
 *  - K5 STALENESS: case YOK ∨ caseStatus ZATEN hedef → STALE. Guided-Open → transition-conflict maddesi YOK.
 *  - K6 ENTRY GUARD = NOT_RUN-only (FAILED-retry P4-5B).
 *  - K7 actionCode/targetType CHANGE_STATUS/LegalCase değilse → executionStatus'a dokunma, mutation yok, typed refusal.
 *  - K8 LEAK-FREE: yeni audit sink yok; yalnız mevcut markExecution* (hash-only) kullanılır; ham savedIntent audit'e yazılmaz.
 *
 * ⚠️ Controller'ı ASLA çağırmaz → case-status.controller'ın guided-open-observe + officeApprovalShadow.evaluate(P4-2/P4-3A)
 *    + guidedEdgeGate(P3 confirm) SARMALI YENİDEN TETİKLENMEZ. En kritik sebep: shadow 'create' mode'da ZATEN-onaylı için
 *    YENİ DUPLICATE PENDING persist ederdi = feedback loop. PURE service üçünü de temiz atlar.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler: şimdilik YOK (internal callable). Test + ileride P4-5B (cron/internal caller). Public route YOK.
 * /// </remarks>
 */
@Injectable()
export class OfficeApprovalExecutorService {
  private readonly logger = new Logger(OfficeApprovalExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly officeApproval: OfficeApprovalService,
    private readonly caseStatus: CaseStatusService,
  ) {}

  /**
   * Onaylanmış CHANGE_STATUS talebini deferred yürütür. Terminal işaretlenmiş OfficeApprovalRequest döner
   * (SUCCEEDED / FAILED / STALE). Scope/status/entry guard ihlalinde fırlatır (yan-etki yok).
   *
   * @param executorUserId yürütmeyi tetikleyen internal context (kim çağırdı); resmi actor DEĞİL (o = approverUserId, K4).
   */
  async execute(requestId: string, tenantId: string, executorUserId: string): Promise<OfficeApprovalRequest> {
    // 1) LOAD — tenant-scoped (çapraz-tenant/yok → 404; existence-oracle yok).
    const req = await this.officeApproval.getByIdForTenant(requestId, tenantId);

    // 2) SCOPE GUARD (K7) — P4-5A YALNIZ CHANGE_STATUS/LegalCase. Yabancı action → executionStatus'a DOKUNMA, mutation YOK,
    //    typed refusal. (Yabancı row'u FAILED işaretlemek o action'ın state-machine'ini bozardı → ASLA.)
    if (req.actionCode !== 'CHANGE_STATUS' || req.targetType !== 'LegalCase') {
      throw new BadRequestException(
        `UNSUPPORTED_ACTION_CODE: Executor kapsamı CHANGE_STATUS/LegalCase; '${req.actionCode}/${req.targetType}' yürütülmez.`,
      );
    }

    // 3) STATUS GUARD — yalnız onaylanmış talepler yürütülür (acceptance #3). Yan-etki yok.
    const executable =
      req.status === OfficeApprovalStatus.APPROVED || req.status === OfficeApprovalStatus.APPROVED_WITH_CHANGES;
    if (!executable) {
      throw new ConflictException(
        `Yürütülemez: talep '${req.status}' durumunda (APPROVED/APPROVED_WITH_CHANGES bekleniyor).`,
      );
    }

    // 4) ENTRY-STATE GUARD (K6=Option A) — yalnız NOT_RUN. SUCCEEDED/RUNNING/STALE/FAILED → tekrar yürütülmez
    //    (acceptance #4). FAILED-retry P4-5B'ye ertelendi (mevcut marker WHERE'i FAILED kabul etmez).
    if (req.executionStatus !== OfficeApprovalExecutionStatus.NOT_RUN) {
      throw new ConflictException(
        `Yürütme zaten '${req.executionStatus}' (NOT_RUN bekleniyordu); tekrar yürütülmez.`,
      );
    }

    // APPROVED/APPROVED_WITH_CHANGES kayıtta approverUserId her zaman set (commitDecision); null = bozuk/legacy satır.
    // markExecution* + changeStatus truthful actor'ı buna bağlı → defensive capture (sonraki adımlar bu local'i kullanır).
    const approverUserId = req.approverUserId;
    if (!approverUserId) {
      throw new ConflictException('Onaylı talepte approver kimliği yok (bozuk kayıt); yürütülemez.');
    }

    // 5) EFFECTIVE INTENT (K2) — APPROVED→savedIntent · APPROVED_WITH_CHANGES→replacementSavedIntent.
    //    AWC ama replacement YOK → uygulanabilir niyet yapısal olarak yok = STALE (execute hatası DEĞİL).
    const rawIntent =
      req.status === OfficeApprovalStatus.APPROVED_WITH_CHANGES ? req.replacementSavedIntent : req.savedIntent;
    if (
      req.status === OfficeApprovalStatus.APPROVED_WITH_CHANGES &&
      (rawIntent === null || rawIntent === undefined)
    ) {
      this.logger.warn(`execute(${requestId}): APPROVED_WITH_CHANGES replacement yok → STALE`);
      return this.officeApproval.markExecutionStale(requestId, approverUserId);
    }

    // 6) INTENT-SHAPE (acceptance #6) — effective intent {status: <geçerli LegalCaseStatus>} olmalı; malformed → FAILED
    //    (mutation hiç açılmaz; changeStatus'un 400'üne güvenme → FAILED deterministik olsun).
    const intent = this.parseChangeStatusIntent(rawIntent);
    if (!intent) {
      this.logger.warn(`execute(${requestId}): geçersiz CHANGE_STATUS intent → FAILED`);
      return this.officeApproval.markExecutionFailed(requestId, approverUserId);
    }

    // 7) STALENESS PROBE (K5) — target case'i oku (caseId = targetRef; savedIntent'e ASLA güvenme). STALE iff:
    //    (1) case YOK (silinmiş/çapraz-tenant) ∨ (2) caseStatus ZATEN intent.status. Guided-Open → transition-conflict YOK.
    const current = await this.prisma.case.findFirst({
      where: { id: req.targetRef, tenantId: req.tenantId },
      select: { caseStatus: true },
    });
    if (!current || current.caseStatus === intent.status) {
      this.logger.warn(
        `execute(${requestId}): staleness (${!current ? 'case YOK' : 'zaten ' + intent.status}) → STALE`,
      );
      return this.officeApproval.markExecutionStale(requestId, approverUserId);
    }

    // 8) RUNNING-LOCK CLAIM (K3) — NOT_RUN→RUNNING compare-and-set. Eşzamanlı/çift executor → ConflictException (propagate).
    await this.officeApproval.markExecutionRunning(requestId, approverUserId);

    // 9) APPLY + MARK — PURE service.changeStatus (controller BYPASS). actor=approverUserId (K4). Sonra Succeeded/Failed.
    //    NOT: changeStatus kendi $transaction'ında; mark ayrı tx (changeStatus tx-injectable değil → outer-tx YOK — kasıtlı).
    try {
      await this.caseStatus.changeStatus(
        req.tenantId,
        req.targetRef,
        intent.status,
        approverUserId,
        intent.reason,
      );
    } catch (err) {
      this.logger.error(
        `execute(${requestId}): changeStatus hata → FAILED: ${(err as Error)?.message ?? err}`,
      );
      return this.officeApproval.markExecutionFailed(requestId, approverUserId);
    }
    this.logger.log(
      `execute(${requestId}): CHANGE_STATUS uygulandı (→${intent.status}; trigger=${executorUserId}) → SUCCEEDED`,
    );
    return this.officeApproval.markExecutionSucceeded(requestId, approverUserId);
  }

  /** savedIntent/replacementSavedIntent (untyped Json) → {status, reason} ya da null (malformed; → FAILED). */
  private parseChangeStatusIntent(raw: unknown): ChangeStatusIntent | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const obj = raw as Record<string, unknown>;
    const status = obj.status;
    if (typeof status !== 'string' || !KNOWN_STATUSES.has(status)) return null;
    const reason = typeof obj.reason === 'string' ? obj.reason : undefined;
    return { status: status as LegalCaseStatus, reason };
  }
}
