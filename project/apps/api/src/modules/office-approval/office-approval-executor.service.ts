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

    // 5-7) EFFECTIVE INTENT + SHAPE + STALENESS (salt-okuma; resolveExecutableIntent — executeRetry ile PAYLAŞILIR, drift YOK).
    //    AWC-missing/already-target/case-yok → stale · malformed → failed · aksi → apply. (Marking BURADA; row NOT_RUN.)
    const resolved = await this.resolveExecutableIntent(req);
    if (resolved.kind === 'stale') {
      this.logger.warn(`execute(${requestId}): intent/staleness → STALE`);
      return this.officeApproval.markExecutionStale(requestId, approverUserId);
    }
    if (resolved.kind === 'failed') {
      this.logger.warn(`execute(${requestId}): geçersiz CHANGE_STATUS intent → FAILED`);
      return this.officeApproval.markExecutionFailed(requestId, approverUserId);
    }

    // 8) RUNNING-LOCK CLAIM (K3) — NOT_RUN→RUNNING compare-and-set. Eşzamanlı/çift executor → ConflictException (propagate).
    await this.officeApproval.markExecutionRunning(requestId, approverUserId);

    // 9) APPLY + MARK (PAYLAŞILAN applyValidatedIntent — PURE changeStatus controller-BYPASS; actor=approverUserId K4).
    return this.applyValidatedIntent(req, approverUserId, resolved.intent, executorUserId);
  }

  /**
   * P4-5C-2 — FAILED satırı BOUNDED retry ile yeniden yürütür (cron PASS-FAILED çağırır). execute()'tan AYRI giriş:
   * entry guard = FAILED + retryCount<maxAttempts (execute() NOT_RUN-only KALIR, K6). Claim FAILED→RUNNING (markExecutionRetrying),
   * sonra ORTAK resolveExecutableIntent + applyValidatedIntent (drift YOK; row RUNNING → markStale/Failed çalışır).
   * Backoff eligibility CRON'da kontrol edilir (burada DEĞİL). actor=approverUserId (K4). Apply tekrar fail → markExecutionFailed
   * retryCount++ → eninde-sonunda retryCount>=MAX (cron enumerate etmez) = sonsuz-döngü YOK.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler: OfficeApprovalExecutorCronService.runSweep() PASS-FAILED (P4-5C-2; internal; route YOK).
   * /// </remarks>
   */
  async executeRetry(
    requestId: string,
    tenantId: string,
    executorUserId: string,
    maxAttempts: number,
  ): Promise<OfficeApprovalRequest> {
    const req = await this.officeApproval.getByIdForTenant(requestId, tenantId);
    // SCOPE GUARD (K7) — yabancı action → executionStatus'a dokunma, typed refusal.
    if (req.actionCode !== 'CHANGE_STATUS' || req.targetType !== 'LegalCase') {
      throw new BadRequestException(
        `UNSUPPORTED_ACTION_CODE: Executor kapsamı CHANGE_STATUS/LegalCase; '${req.actionCode}/${req.targetType}' yürütülmez.`,
      );
    }
    // STATUS GUARD
    const executable =
      req.status === OfficeApprovalStatus.APPROVED || req.status === OfficeApprovalStatus.APPROVED_WITH_CHANGES;
    if (!executable) {
      throw new ConflictException(
        `Retry yürütülemez: talep '${req.status}' durumunda (APPROVED/APPROVED_WITH_CHANGES bekleniyor).`,
      );
    }
    // ENTRY GUARD — yalnız FAILED (retry-only; execute() NOT_RUN-only ile AYRI).
    if (req.executionStatus !== OfficeApprovalExecutionStatus.FAILED) {
      throw new ConflictException(`executeRetry yalnız FAILED için; '${req.executionStatus}' uygun değil.`);
    }
    // EXHAUSTED GUARD — retryCount < maxAttempts (markExecutionRetrying CAS'inde de re-check edilir).
    if (req.retryCount >= maxAttempts) {
      throw new ConflictException(`retryCount ${req.retryCount} >= MAX ${maxAttempts}; tükendi (re-enumerate edilmez).`);
    }
    const approverUserId = req.approverUserId;
    if (!approverUserId) {
      throw new ConflictException('FAILED satırda approver kimliği yok (bozuk kayıt); retry edilemez.');
    }
    // CLAIM (FAILED→RUNNING; retryCount<maxAttempts). Sonra resolve+apply ROW=RUNNING üzerinden.
    await this.officeApproval.markExecutionRetrying(requestId, approverUserId, maxAttempts);
    const resolved = await this.resolveExecutableIntent(req);
    if (resolved.kind === 'stale') {
      this.logger.warn(`retry(${requestId}): intent/staleness → STALE`);
      return this.officeApproval.markExecutionStale(requestId, approverUserId);
    }
    if (resolved.kind === 'failed') {
      this.logger.warn(`retry(${requestId}): geçersiz CHANGE_STATUS intent → FAILED`);
      return this.officeApproval.markExecutionFailed(requestId, approverUserId);
    }
    return this.applyValidatedIntent(req, approverUserId, resolved.intent, executorUserId);
  }

  /**
   * P4-5C-2 — effective intent seç + shape-validate + staleness probe (SALT-OKUMA; marking YOK → çağıran row-state'ine göre işaretler).
   * execute() (NOT_RUN'da) + executeRetry() (claim sonrası RUNNING'de) PAYLAŞIR → drift YOK. (reconcileStuckRunning AYRI karar
   * tablosu kullanır → onu paylaşmaz.) AWC-missing/case-yok/already-target → stale · malformed → failed · aksi → apply.
   */
  private async resolveExecutableIntent(
    req: OfficeApprovalRequest,
  ): Promise<{ kind: 'stale' } | { kind: 'failed' } | { kind: 'apply'; intent: ChangeStatusIntent }> {
    const rawIntent =
      req.status === OfficeApprovalStatus.APPROVED_WITH_CHANGES ? req.replacementSavedIntent : req.savedIntent;
    if (
      req.status === OfficeApprovalStatus.APPROVED_WITH_CHANGES &&
      (rawIntent === null || rawIntent === undefined)
    ) {
      return { kind: 'stale' }; // AWC ama replacement yok = uygulanabilir niyet yapısal yok
    }
    const intent = this.parseChangeStatusIntent(rawIntent);
    if (!intent) return { kind: 'failed' }; // malformed → FAILED
    // STALENESS PROBE (K5): case YOK ∨ caseStatus ZATEN intent.status → STALE (Guided-Open → transition-conflict YOK).
    const current = await this.prisma.case.findFirst({
      where: { id: req.targetRef, tenantId: req.tenantId },
      select: { caseStatus: true },
    });
    if (!current || current.caseStatus === intent.status) return { kind: 'stale' };
    return { kind: 'apply', intent };
  }

  /**
   * P4-5C-2 — onaylı niyeti uygular: PURE CaseStatusService.changeStatus (controller BYPASS) → markExecutionSucceeded;
   * hata → markExecutionFailed (retryCount++ via 5C-1). execute() + executeRetry() PAYLAŞIR (row RUNNING; changeStatus/mark drift YOK).
   * NOT: changeStatus kendi $transaction'ında; mark ayrı tx (changeStatus tx-injectable değil → outer-tx YOK — kasıtlı).
   */
  private async applyValidatedIntent(
    req: OfficeApprovalRequest,
    approverUserId: string,
    intent: ChangeStatusIntent,
    executorUserId: string,
  ): Promise<OfficeApprovalRequest> {
    try {
      await this.caseStatus.changeStatus(req.tenantId, req.targetRef, intent.status, approverUserId, intent.reason);
    } catch (err) {
      this.logger.error(`apply(${req.id}): changeStatus hata → FAILED: ${(err as Error)?.message ?? err}`);
      return this.officeApproval.markExecutionFailed(req.id, approverUserId);
    }
    this.logger.log(`apply(${req.id}): CHANGE_STATUS uygulandı (→${intent.status}; trigger=${executorUserId}) → SUCCEEDED`);
    return this.officeApproval.markExecutionSucceeded(req.id, approverUserId);
  }

  /**
   * P4-5C-1 — STUCK-RUNNING RECONCILE (PRECISE; hakikat kaynağı = case.caseStatus). Cron'un reconcile-pass'i çağırır.
   * Crash sonrası orphan RUNNING (executor RUNNING-lock aldı ama terminal işaretlemeden düştü) çözer.
   * P4-5B age-blind idi (timestamp yoktu); P4-5C-1 runningStartedAt ile YAŞA BAKAR — cron stuckCutoff (now - STUCK_TIMEOUT) geçirir:
   *   - runningStartedAt > stuckCutoff (henüz stuck değil) → ConflictException (DOKUNMA) → taze in-flight claim'i YANLIŞ STALE'lemez (yarış elenir).
   *   - runningStartedAt NULL (pre-migration orphan) → eligible (sonsuz-eski sayılır).
   * Karar tablosu (timeout dolduysa):
   *   - case YOK → STALE (hedef yok; başarı iddia edilemez)
   *   - caseStatus === effective intent.status → SUCCEEDED (mutation OLMUŞ = applied-but-unmarked crash; DÜRÜST, RE-APPLY YOK)
   *   - caseStatus !== intent.status → FAILED (mutation OLMAMIŞ → bounded-retry havuzuna düşer [5C-2]; markExecutionFailed
   *     retryCount'u artırır → orphan da sayaca dahil = sonsuz-döngü YOK). P4-5B'deki STALE bilinçli revize (R2/lock 7).
   *   - intent malformed/AWC-missing → STALE (hedef belirsiz, asla başaramaz → retry havuzuna SOKULMAZ).
   * markExecution* zaten WHERE {NOT_RUN,RUNNING} → RUNNING'i doğrudan terminal'e sürer; canlı executor önce terminalize ettiyse
   * count===0 → ConflictException = idempotent no-op. actor=approverUserId (K4). markExecutionRunning ÇAĞRILMAZ (claim-lock korunur).
   *
   * /// <remarks>
   * /// Çağrıldığı yerler: OfficeApprovalExecutorCronService.runSweep() reconcile-pass (P4-5C-1; internal; route YOK).
   * /// </remarks>
   */
  async reconcileStuckRunning(requestId: string, tenantId: string, stuckCutoff: Date): Promise<OfficeApprovalRequest> {
    const req = await this.officeApproval.getByIdForTenant(requestId, tenantId);
    if (req.executionStatus !== OfficeApprovalExecutionStatus.RUNNING) {
      throw new ConflictException(`Reconcile yalnız RUNNING satır için; '${req.executionStatus}' uygun değil.`);
    }
    // P4-5C-1 precise age-gate: runningStartedAt stuckCutoff'tan SONRAYSA henüz stuck değil → DOKUNMA (taze in-flight yarış elenir).
    // NULL runningStartedAt = pre-migration orphan = sonsuz-eski = eligible (devam).
    if (req.runningStartedAt && req.runningStartedAt > stuckCutoff) {
      throw new ConflictException('RUNNING henüz stuck-timeout dolmadı; reconcile edilmez.');
    }
    const approverUserId = req.approverUserId;
    if (!approverUserId) {
      throw new ConflictException('RUNNING satırda approver kimliği yok (bozuk kayıt); reconcile edilemez.');
    }
    // effective intent: execute() ile AYNI seçim + parse (drift YOK).
    const rawIntent =
      req.status === OfficeApprovalStatus.APPROVED_WITH_CHANGES ? req.replacementSavedIntent : req.savedIntent;
    const intent = this.parseChangeStatusIntent(rawIntent);
    if (!intent) {
      // malformed/AWC-missing → hedef belirsiz, asla başaramaz → STALE (retry havuzuna sokma).
      this.logger.warn(`reconcile(${requestId}): RUNNING ama intent geçersiz → STALE`);
      return this.officeApproval.markExecutionStale(requestId, approverUserId);
    }
    const current = await this.prisma.case.findFirst({
      where: { id: req.targetRef, tenantId: req.tenantId },
      select: { caseStatus: true },
    });
    if (!current) {
      this.logger.warn(`reconcile(${requestId}): case YOK → STALE`);
      return this.officeApproval.markExecutionStale(requestId, approverUserId);
    }
    if (current.caseStatus === intent.status) {
      // applied-but-unmarked (crash sub-case B): mutation gerçekten oldu → SUCCEEDED (dürüst; re-apply YOK).
      this.logger.warn(`reconcile(${requestId}): caseStatus zaten ${intent.status} (applied-but-unmarked) → SUCCEEDED`);
      return this.officeApproval.markExecutionSucceeded(requestId, approverUserId);
    }
    // not-applied (crash sub-case A): mutation OLMADI → FAILED (bounded-retry havuzu [5C-2]; retryCount++ orphan'ı da sayar).
    this.logger.warn(`reconcile(${requestId}): caseStatus ${current.caseStatus} != ${intent.status} (not-applied) → FAILED`);
    return this.officeApproval.markExecutionFailed(requestId, approverUserId);
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
