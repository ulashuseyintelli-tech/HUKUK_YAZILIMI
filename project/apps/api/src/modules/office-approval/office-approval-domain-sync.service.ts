import { BadRequestException, ConflictException, Injectable, Optional } from '@nestjs/common';
import {
  CollectionDispositionStatus,
  OfficeApprovalExecutionStatus,
  OfficeApprovalRequest,
  OfficeApprovalStatus,
  Prisma,
} from '@prisma/client';
import { buildCanonicalWriteEnvelopeV1 } from '../../common/canonical-write-envelope';
import { assertStoredCaseClaimCurrency } from '../claim-item/case-claim-currency-policy';
import { AccountingJournalWriterService } from '../accounting-journal';
import { DomainEventIngestService } from '../icrabot/domain-event-ingest';
import {
  COLLECTION_VOID_ACTION_CODE,
  COLLECTION_VOID_TARGET_TYPE,
  executeCollectionCancelInTransaction,
  type CollectionVoidSavedIntent,
} from '../collection/collection-cancel-executor';
import {
  CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
  CLAIM_ITEM_INTENT_VERSION,
  CLAIM_ITEM_LIABILITY_SELECTION_INTENT_VERSION,
  CLAIM_ITEM_TARGET_TYPE,
  CLAIM_ITEM_CASE_TARGET_TYPE,
  type ClaimItemHighImpactSavedIntent,
  type ClaimItemLiabilityProjection,
} from '../claim-item/claim-item-approval.constants';
import {
  claimItemCreationAmounts,
  claimItemNormalUpdateAmounts,
} from '../claim-item/claim-item-amount-contract';
import { ClaimItemSourceIntegrityGuard } from '../claim-item/claim-item-source-integrity.guard';
import { CLAIM_ITEM_HUMAN_WRITE_POLICY_REF } from '../claim-item/claim-item-writer-routes';
import { throwClaimItemFormationContextRequired } from '../claim-item/claim-item-formation-containment';
import {
  assertInvoiceClaimItemCreateAllowed,
  assertInvoiceClaimItemTypeTransitionAllowed,
} from '../claim-item/invoice-claim-item.policy';
import {
  FINANCIAL_CASE_CLOSE_ACTION_CODE,
  FINANCIAL_CASE_CLOSE_INTENT_VERSION,
  FINANCIAL_CASE_CLOSE_STATUSES,
  FINANCIAL_CASE_CLOSE_TARGET_TYPE,
  type FinancialCaseCloseSavedIntent,
} from '../case-status/financial-case-close.constants';
import { applyCaseStatusChange } from '../case-status/case-status.service';
import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';
import { interestWriteData, normalizeInterestWriteIntent } from '../claim-item/interest-write-admission';
import { validateInterestAccrualState } from '../claim-item/interest-accrual-policy';
import { assertAttorneyFeeBasisMatchesItemType, effectiveField } from '../claim-item/attorney-fee-basis';
import {
  CLAIM_ITEM_DESCRIPTIVE_FIELDS,
  evaluateClaimItemApprovalStaleness,
  isExplainableByIndependentChange,
} from '../claim-item/claim-item-approval-staleness';

import { AuditService } from '../audit/audit.service';
import { ActionCode } from '../policy-engine/types/action-code.enum';
import { createCollectionMutationTrace } from '../collection/collection-audit';
import {
  appendClaimItemContinuity,
  assertClaimItemCreateStatus,
  assertClaimItemLifecycleMutation,
  claimItemLifecycleRecordHash,
  lockClaimItemCaseBeforeWrite,
  type ClaimItemLifecycleRecord,
} from '../claim-item/claim-item-lifecycle-contract';

/**
 * K3 AUTO-GENERATE FORMATION (PR-3) — çok kalemli formation onayının hedef türü. Değer
 * `CLAIM_ITEM_FORMATION_BATCH_APPROVAL_TARGET_TYPE` (claim-item formation sözleşmesi) ile AYNIDIR; sözleşme modülünü
 * buradan içe aktarmamak için yerel sabit (formation bileşenleri OfficeApproval'a bağımlılık yönünü tersine çevirmez).
 */
export const CLAIM_ITEM_FORMATION_BATCH_TARGET_TYPE = 'CLAIM_ITEM_FORMATION_BATCH' as const;

/**
 * Onaylanan toplu formation talebini karar transaction'ı İÇİNDE kesin kalemlere çeviren işleyici. Fırlatırsa karar
 * dahil hiçbir yazma kalmaz (talep PENDING_APPROVAL'da kalır).
 */
export type ClaimItemFormationBatchApprovalHandler = (
  tx: Prisma.TransactionClient,
  req: OfficeApprovalRequest,
) => Promise<void>;

/**
 * Seçimlik sorumluluk (karar günlüğü 2026-11-15) — onaylanan seçim niyetini karar transaction'ı İÇİNDE uygulayan
 * işleyici: dosya kilidi + durum özeti doğrulaması + seçim sürümü yazımı. Kalemin iki eski alanına yazılacak izdüşümü
 * DÖNDÜRÜR; kalem satırını bu servis (mevcut onaylı kalem yazarı) süreklilik kaydıyla günceller. Fırlatırsa karar
 * dahil hiçbir yazma kalmaz (talep PENDING_APPROVAL'da kalır).
 */
export type ClaimItemLiabilitySelectionApprovalHandler = (
  tx: Prisma.TransactionClient,
  req: OfficeApprovalRequest,
) => Promise<ClaimItemLiabilityProjection[]>;

const COLLECTION_DISPOSITION_APPROVAL_ACTION = 'COLLECTION_DISPOSITION_POST';
/** Zincir doğrulamasında kayıt saati ile satır sürüm saati arasındaki saat farkı payı. */
const CLAIM_ITEM_AUDIT_CHAIN_CLOCK_MARGIN_MS = 5 * 60 * 1000;
/** Zincir doğrulamasında okunacak en çok kayıt; aşılırsa zincir kurulamaz sayılır (talep bayat kalır). */
const CLAIM_ITEM_AUDIT_CHAIN_MAX_RECORDS = 200;
const COLLECTION_DISPOSITION_TARGET_TYPE = 'COLLECTION_DISPOSITION';

@Injectable()
export class OfficeApprovalDomainSyncService {
  private readonly claimItemSourceIntegrity = new ClaimItemSourceIntegrityGuard();
  private claimItemFormationBatchHandler?: ClaimItemFormationBatchApprovalHandler;
  private claimItemLiabilitySelectionHandler?: ClaimItemLiabilitySelectionApprovalHandler;

  constructor(
    @Optional() private readonly domainEventIngestService?: DomainEventIngestService,
    @Optional() private readonly journalWriter?: AccountingJournalWriterService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  /**
   * OfficeApproval kararindan sonra, yalniz domain state'i approval karariyla birlikte atomik guncellenmesi gereken
   * action'lari senkronize eder. Generic action'lar icin no-op kalir; executor semantigine dokunmaz.
   *
   * /// <remarks>
   * /// Cagrildigi yerler:
   * ///  - OfficeApprovalService.commitDecision() -> generic approval terminal karari sonrasi domain sync
   * ///  - OfficeApprovalService.cancel() -> requester cancel sonrasi domain sync
   * /// </remarks>
   */
  async syncAfterDecision(tx: Prisma.TransactionClient, req: OfficeApprovalRequest): Promise<void> {
    if (this.isClaimItemFormationBatchApproval(req)) {
      return this.syncClaimItemFormationBatch(tx, req);
    }
    if (this.isCollectionDispositionPostApproval(req)) {
      return this.syncCollectionDisposition(tx, req);
    }
    if (this.isCollectionVoidApproval(req)) {
      return this.syncCollectionVoid(tx, req);
    }
    // Sorumluluk seçimi aynı işlem kodunu ve hedef türlerini taşır; niyet sürümüyle ayrışır ve genel kalem
    // değişikliği dalından ÖNCE yakalanır.
    if (this.isClaimItemLiabilitySelectionApproval(req)) {
      return this.syncClaimItemLiabilitySelection(tx, req);
    }
    if (this.isClaimItemHighImpactApproval(req)) {
      return this.syncClaimItemHighImpact(tx, req);
    }
    if (this.isFinancialCaseCloseApproval(req)) {
      return this.syncFinancialCaseClose(tx, req);
    }
    if (this.isClientPayoutPostApproval(req)) {
      return this.syncClientPayoutPost(req);
    }
  }

  /**
   * K3 AUTO-GENERATE FORMATION (PR-3) — toplu formation işleyicisinin tek kaydı. İşleyici yalnız çalışma zamanı
   * bayrağı açıkken kaydedilir; kayıt yoksa ONAY kapalı-hata verir (aşağıda), ret/revizyon/iptal yine no-op.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - CekAutoGenerateFormationService.onModuleInit() → bayrak açıkken işleyici kaydı
   * /// </remarks>
   */
  registerClaimItemFormationBatchHandler(handler: ClaimItemFormationBatchApprovalHandler): void {
    if (this.claimItemFormationBatchHandler && this.claimItemFormationBatchHandler !== handler) {
      throw new Error('ClaimItem formation batch approval handler is already registered');
    }
    this.claimItemFormationBatchHandler = handler;
  }

  /**
   * Seçimlik sorumluluk — onay yürütme işleyicisinin tek kaydı. Kayıt yoksa ONAY kapalı-hata verir; ret, revizyon ve
   * iptal yine no-op'tur.
   */
  registerClaimItemLiabilitySelectionHandler(handler: ClaimItemLiabilitySelectionApprovalHandler): void {
    if (this.claimItemLiabilitySelectionHandler && this.claimItemLiabilitySelectionHandler !== handler) {
      throw new Error('ClaimItem liability selection approval handler is already registered');
    }
    this.claimItemLiabilitySelectionHandler = handler;
  }

  private isClaimItemLiabilitySelectionApproval(req: OfficeApprovalRequest): boolean {
    if (req.actionCode !== CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE) return false;
    if (req.targetType !== CLAIM_ITEM_TARGET_TYPE && req.targetType !== CLAIM_ITEM_CASE_TARGET_TYPE) return false;
    const intent = req.savedIntent as { version?: unknown } | null;
    return Boolean(intent && typeof intent === 'object' && intent.version === CLAIM_ITEM_LIABILITY_SELECTION_INTENT_VERSION);
  }

  /**
   * Onay → seçim sürümleri ve kalem izdüşümleri karar transaction'ında birlikte yazılır (ya hep ya hiç). Ret,
   * revizyon ve iptal hiçbir seçim YAZMAZ. Değiştirerek onay desteklenmez: onay içeriği önizlenen seçime bağlıdır.
   */
  private async syncClaimItemLiabilitySelection(tx: Prisma.TransactionClient, req: OfficeApprovalRequest): Promise<void> {
    switch (req.status) {
      case OfficeApprovalStatus.APPROVED:
        return this.approveClaimItemLiabilitySelection(tx, req);
      case OfficeApprovalStatus.REJECTED:
      case OfficeApprovalStatus.REVISION_REQUESTED:
      case OfficeApprovalStatus.CANCELLED:
        return;
      case OfficeApprovalStatus.APPROVED_WITH_CHANGES:
        throw new BadRequestException(
          'Borçlu sorumluluğu seçimi değiştirilerek onaylanamaz; revizyon isteyin veya normal onaylayın.',
        );
      default:
        return;
    }
  }

  private async approveClaimItemLiabilitySelection(tx: Prisma.TransactionClient, req: OfficeApprovalRequest): Promise<void> {
    if (!req.approverUserId) {
      throw new ConflictException('Onayli CLAIM_ITEM approval kaydinda approverUserId yok.');
    }
    if (!this.claimItemLiabilitySelectionHandler) {
      throw new ConflictException({
        code: 'LIABILITY_SELECTION_HANDLER_UNAVAILABLE',
        message: 'Borçlu sorumluluğu seçimi onayı bu ortamda uygulanamaz; talep onay bekler durumda kalır.',
      });
    }
    const claim = await tx.officeApprovalRequest.updateMany({
      where: {
        id: req.id,
        status: OfficeApprovalStatus.APPROVED,
        executionStatus: OfficeApprovalExecutionStatus.NOT_RUN,
      },
      data: {
        executionStatus: OfficeApprovalExecutionStatus.RUNNING,
        runningStartedAt: new Date(),
      },
    });
    if (claim.count === 0) {
      throw new ConflictException('ClaimItem approval zaten yurutulmus veya yurutme icin kilitlenmis.');
    }

    // İşleyici: dosya kilidi → durum özeti yeniden doğrulanır → seçim sürümü yazılır. Kalem izdüşümü aynı işlemde,
    // mevcut onaylı kalem yazarının süreklilik (denetim + olay) kaydıyla yazılır.
    const projections = await this.claimItemLiabilitySelectionHandler(tx, req);
    for (const projection of projections) {
      const current = await tx.claimItem.findFirst({
        where: { id: projection.claimItemId, tenantId: req.tenantId },
      });
      if (!current) {
        throw new ConflictException('CLAIM_ITEM hedef kalem bulunamadi.');
      }
      const unchanged =
        current.isAllDebtorsLiable === projection.isAllDebtorsLiable &&
        stableJsonHash([...current.liableDebtorIds].sort()) === stableJsonHash([...projection.liableDebtorIds].sort());
      if (unchanged) continue;
      const updated = await tx.claimItem.update({
        where: { id: projection.claimItemId },
        data: { isAllDebtorsLiable: projection.isAllDebtorsLiable, liableDebtorIds: projection.liableDebtorIds },
      });
      await appendClaimItemContinuity({
        tx,
        domainEventIngest: this.domainEventIngestService,
        envelope: this.buildApprovedClaimItemEnvelope(req, current.caseId, projection.claimItemId, undefined, String(updated.currency)),
        operation: 'UPDATE',
        before: current as ClaimItemLifecycleRecord,
        after: updated as ClaimItemLifecycleRecord,
        auditAction: 'CLAIM_ITEM_LIABILITY_SELECTION_APPLIED',
        auditUserId: req.approverUserId ?? undefined,
        auditSource: 'USER_LIABILITY_SELECTION_REQUEST',
        approvalRequired: true,
      });
    }

    const done = await tx.officeApprovalRequest.updateMany({
      where: {
        id: req.id,
        executionStatus: OfficeApprovalExecutionStatus.RUNNING,
      },
      data: {
        executionStatus: OfficeApprovalExecutionStatus.SUCCEEDED,
        executedAt: new Date(),
      },
    });
    if (done.count === 0) {
      throw new ConflictException('ClaimItem approval yurutme sonucu isaretlenemedi.');
    }
  }

  private isClaimItemFormationBatchApproval(req: OfficeApprovalRequest): boolean {
    return (
      req.actionCode === CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE &&
      req.targetType === CLAIM_ITEM_FORMATION_BATCH_TARGET_TYPE
    );
  }

  /**
   * Onay → kalemlerin TAMAMI karar transaction'ında oluşur (işleyici fırlatırsa karar da geri alınır). Ret, revizyon
   * ve iptal kesin kalem OLUŞTURMAZ. Değiştirerek onay desteklenmez: onay içeriği değişmez formation niyetlerine
   * bağlıdır.
   */
  private async syncClaimItemFormationBatch(tx: Prisma.TransactionClient, req: OfficeApprovalRequest): Promise<void> {
    switch (req.status) {
      case OfficeApprovalStatus.APPROVED:
        if (!this.claimItemFormationBatchHandler) {
          throw new ConflictException({
            code: 'FORMATION_BATCH_HANDLER_UNAVAILABLE',
            message: 'Alacak kalemi oluşum onayı bu ortamda uygulanamaz; talep onay bekler durumda kalır.',
          });
        }
        return this.claimItemFormationBatchHandler(tx, req);
      case OfficeApprovalStatus.REJECTED:
      case OfficeApprovalStatus.REVISION_REQUESTED:
      case OfficeApprovalStatus.CANCELLED:
        return;
      case OfficeApprovalStatus.APPROVED_WITH_CHANGES:
        throw new BadRequestException(
          'Alacak kalemi oluşum talebi değiştirilerek onaylanamaz; revizyon isteyin veya normal onaylayın.',
        );
      default:
        return;
    }
  }

  private async syncCollectionDisposition(tx: Prisma.TransactionClient, req: OfficeApprovalRequest): Promise<void> {
    switch (req.status) {
      case OfficeApprovalStatus.APPROVED:
        return this.approveCollectionDisposition(tx, req);
      case OfficeApprovalStatus.REJECTED:
      case OfficeApprovalStatus.REVISION_REQUESTED:
      case OfficeApprovalStatus.CANCELLED:
        return this.releaseCollectionDispositionForRevision(tx, req);
      case OfficeApprovalStatus.APPROVED_WITH_CHANGES:
        throw new BadRequestException(
          'CollectionDisposition onayi degistirerek onaylanamaz; revizyon isteyin veya normal onaylayin.',
        );
      default:
        return;
    }
  }

  private async syncCollectionVoid(tx: Prisma.TransactionClient, req: OfficeApprovalRequest): Promise<void> {
    switch (req.status) {
      case OfficeApprovalStatus.APPROVED:
        return this.approveCollectionVoid(tx, req);
      case OfficeApprovalStatus.REJECTED:
      case OfficeApprovalStatus.REVISION_REQUESTED:
      case OfficeApprovalStatus.CANCELLED:
        return;
      case OfficeApprovalStatus.APPROVED_WITH_CHANGES:
        throw new BadRequestException(
          'Tahsilat iptal onayi degistirerek onaylanamaz; revizyon isteyin veya normal onaylayin.',
        );
      default:
        return;
    }
  }

  private isCollectionDispositionPostApproval(req: OfficeApprovalRequest): boolean {
    return (
      req.actionCode === COLLECTION_DISPOSITION_APPROVAL_ACTION &&
      req.targetType === COLLECTION_DISPOSITION_TARGET_TYPE
    );
  }

  private isCollectionVoidApproval(req: OfficeApprovalRequest): boolean {
    return req.actionCode === COLLECTION_VOID_ACTION_CODE && req.targetType === COLLECTION_VOID_TARGET_TYPE;
  }

  private isClaimItemHighImpactApproval(req: OfficeApprovalRequest): boolean {
    return (
      req.actionCode === CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE &&
      (req.targetType === CLAIM_ITEM_TARGET_TYPE || req.targetType === CLAIM_ITEM_CASE_TARGET_TYPE)
    );
  }

  private isFinancialCaseCloseApproval(req: OfficeApprovalRequest): boolean {
    return req.actionCode === FINANCIAL_CASE_CLOSE_ACTION_CODE && req.targetType === FINANCIAL_CASE_CLOSE_TARGET_TYPE;
  }

  private isClientPayoutPostApproval(req: OfficeApprovalRequest): boolean {
    return req.actionCode === ActionCode.CLIENT_PAYOUT_POST;
  }

  /**
   * Müvekkile ödeme talebi: "değiştirerek onay" desteklenmez. Ödeme kesinleştirmesi (ClientPayoutService.finalize) yalnız
   * ORİJİNAL niyetle çalışır (tutar / müvekkil / para birimi talepten okunur); APPROVED_WITH_CHANGES kaydı kesinleştirilemez
   * ve talep çıkışsız kalırdı. Diğer onay türlerindeki kalıpla aynı: karar kaydı geri alınır, talep PENDING_APPROVAL'da kalır.
   * Durum / öz-onay / onaylayıcı yeterliliği kapıları bu noktadan ÖNCE çalışır ve DEĞİŞMEZ; onay, ret ve revizyon etkilenmez.
   */
  private syncClientPayoutPost(req: OfficeApprovalRequest): void {
    if (req.status === OfficeApprovalStatus.APPROVED_WITH_CHANGES) {
      throw new BadRequestException(
        'Müvekkile ödeme talebi değiştirilerek onaylanamaz; revizyon isteyin veya normal onaylayın.',
      );
    }
  }

  private async syncFinancialCaseClose(tx: Prisma.TransactionClient, req: OfficeApprovalRequest): Promise<void> {
    switch (req.status) {
      case OfficeApprovalStatus.APPROVED:
        return this.approveFinancialCaseClose(tx, req);
      case OfficeApprovalStatus.REJECTED:
      case OfficeApprovalStatus.REVISION_REQUESTED:
      case OfficeApprovalStatus.CANCELLED:
        return;
      case OfficeApprovalStatus.APPROVED_WITH_CHANGES:
        throw new BadRequestException(
          'Finansal dosya kapanisi degistirerek onaylanamaz; revizyon isteyin veya normal onaylayin.',
        );
      default:
        return;
    }
  }

  private async approveFinancialCaseClose(tx: Prisma.TransactionClient, req: OfficeApprovalRequest): Promise<void> {
    if (!req.approverUserId) {
      throw new ConflictException('Onayli FINANCIAL_CASE_CLOSE approval kaydinda approverUserId yok.');
    }
    const intent = this.readFinancialCaseCloseIntent(req);
    const claim = await tx.officeApprovalRequest.updateMany({
      where: {
        id: req.id,
        status: OfficeApprovalStatus.APPROVED,
        executionStatus: OfficeApprovalExecutionStatus.NOT_RUN,
      },
      data: {
        executionStatus: OfficeApprovalExecutionStatus.RUNNING,
        runningStartedAt: new Date(),
      },
    });
    if (claim.count === 0) {
      throw new ConflictException('Finansal dosya kapanis onayi zaten yurutulmus veya yurutme icin kilitlenmis.');
    }

    await applyCaseStatusChange(tx, req.tenantId, intent.caseId, intent.status, req.approverUserId, intent.reason ?? undefined);

    const done = await tx.officeApprovalRequest.updateMany({
      where: {
        id: req.id,
        executionStatus: OfficeApprovalExecutionStatus.RUNNING,
      },
      data: {
        executionStatus: OfficeApprovalExecutionStatus.SUCCEEDED,
        executedAt: new Date(),
      },
    });
    if (done.count === 0) {
      throw new ConflictException('Finansal dosya kapanis onayi yurutme sonucu isaretlenemedi.');
    }
  }

  private readFinancialCaseCloseIntent(req: OfficeApprovalRequest): FinancialCaseCloseSavedIntent {
    const value = req.savedIntent as Partial<FinancialCaseCloseSavedIntent> | null;
    if (!value || typeof value !== 'object' || value.version !== FINANCIAL_CASE_CLOSE_INTENT_VERSION) {
      throw new ConflictException('FINANCIAL_CASE_CLOSE savedIntent gecersiz.');
    }
    if (!value.caseId || value.caseId !== req.targetRef) {
      throw new ConflictException('FINANCIAL_CASE_CLOSE savedIntent hedef bilgisi gecersiz.');
    }
    if (!value.status || typeof value.status !== 'string' || !FINANCIAL_CASE_CLOSE_STATUSES.has(value.status)) {
      throw new ConflictException('FINANCIAL_CASE_CLOSE savedIntent status bilgisi gecersiz.');
    }
    return value as FinancialCaseCloseSavedIntent;
  }

  private async syncClaimItemHighImpact(tx: Prisma.TransactionClient, req: OfficeApprovalRequest): Promise<void> {
    switch (req.status) {
      case OfficeApprovalStatus.APPROVED:
        return this.approveClaimItemHighImpact(tx, req);
      case OfficeApprovalStatus.REJECTED:
      case OfficeApprovalStatus.REVISION_REQUESTED:
      case OfficeApprovalStatus.CANCELLED:
        return;
      case OfficeApprovalStatus.APPROVED_WITH_CHANGES:
        throw new BadRequestException(
          'ClaimItem high-impact degisikligi degistirerek onaylanamaz; revizyon isteyin veya normal onaylayin.',
        );
      default:
        return;
    }
  }

  private async approveCollectionDisposition(tx: Prisma.TransactionClient, req: OfficeApprovalRequest): Promise<void> {
    if (!req.approverUserId) {
      throw new ConflictException('Onayli CollectionDisposition approval kaydinda approverUserId yok.');
    }
    const res = await tx.collectionDisposition.updateMany({
      where: {
        id: req.targetRef,
        tenantId: req.tenantId,
        approvalRequestId: req.id,
        status: CollectionDispositionStatus.DISTRIBUTION_RECOMMENDED,
      },
      data: {
        status: CollectionDispositionStatus.DISTRIBUTION_APPROVED,
        approvedAt: req.decidedAt ?? new Date(),
        approvedById: req.approverUserId,
      },
    });
    if (res.count === 0) {
      throw new ConflictException(
        'CollectionDisposition sync uygulanamadi: beklenen DISTRIBUTION_RECOMMENDED durumunda aktif approval bulunamadi.',
      );
    }
  }

  private async releaseCollectionDispositionForRevision(
    tx: Prisma.TransactionClient,
    req: OfficeApprovalRequest,
  ): Promise<void> {
    const res = await tx.collectionDisposition.updateMany({
      where: {
        id: req.targetRef,
        tenantId: req.tenantId,
        approvalRequestId: req.id,
        status: CollectionDispositionStatus.DISTRIBUTION_RECOMMENDED,
      },
      data: {
        status: CollectionDispositionStatus.HELD_PENDING_DISTRIBUTION,
        approvalRequestId: null,
        approvedAt: null,
        approvedById: null,
      },
    });
    if (res.count === 0) {
      throw new ConflictException(
        'CollectionDisposition sync uygulanamadi: beklenen DISTRIBUTION_RECOMMENDED durumunda aktif approval bulunamadi.',
      );
    }
  }

  private async approveCollectionVoid(tx: Prisma.TransactionClient, req: OfficeApprovalRequest): Promise<void> {
    if (!req.approverUserId) {
      throw new ConflictException('Onayli COLLECTION_VOID approval kaydinda approverUserId yok.');
    }
    if (!this.domainEventIngestService || !this.journalWriter || !this.auditService) {
      throw new ConflictException('COLLECTION_VOID finalize dependencies are not available.');
    }

    const intent = this.readCollectionVoidIntent(req);
    const claim = await tx.officeApprovalRequest.updateMany({
      where: {
        id: req.id,
        status: OfficeApprovalStatus.APPROVED,
        executionStatus: OfficeApprovalExecutionStatus.NOT_RUN,
      },
      data: {
        executionStatus: OfficeApprovalExecutionStatus.RUNNING,
        runningStartedAt: new Date(),
      },
    });
    if (claim.count === 0) {
      throw new ConflictException('Tahsilat iptal onayi zaten yurutulmus veya yurutme icin kilitlenmis.');
    }

    await executeCollectionCancelInTransaction(tx, {
      domainEventIngestService: this.domainEventIngestService,
      journalWriter: this.journalWriter,
      auditService: this.auditService,
    }, {
      tenantId: req.tenantId,
      id: intent.collectionId,
      dto: { cancelReason: intent.cancelReason },
      actorUserId: req.approverUserId,
      expectedCaseId: intent.caseId,
      trace: createCollectionMutationTrace(intent.correlationId, req.id),
      approvalRequestId: req.id,
    });

    const done = await tx.officeApprovalRequest.updateMany({
      where: {
        id: req.id,
        executionStatus: OfficeApprovalExecutionStatus.RUNNING,
      },
      data: {
        executionStatus: OfficeApprovalExecutionStatus.SUCCEEDED,
        executedAt: new Date(),
      },
    });
    if (done.count === 0) {
      throw new ConflictException('Tahsilat iptal onayi yurutme sonucu isaretlenemedi.');
    }
  }

  private readCollectionVoidIntent(req: OfficeApprovalRequest): CollectionVoidSavedIntent {
    const value = req.savedIntent as Partial<CollectionVoidSavedIntent> | null;
    if (!value || typeof value !== 'object') {
      throw new ConflictException('COLLECTION_VOID savedIntent gecersiz.');
    }
    const caseId = typeof value.caseId === 'string' ? value.caseId.trim() : '';
    const collectionId = typeof value.collectionId === 'string' ? value.collectionId.trim() : '';
    const cancelReason = typeof value.cancelReason === 'string' ? value.cancelReason.trim() : '';
    const correlationId = typeof value.correlationId === 'string' ? value.correlationId.trim() : '';
    if (!caseId || !collectionId || !cancelReason || collectionId !== req.targetRef) {
      throw new ConflictException('COLLECTION_VOID savedIntent hedef/gerekce bilgisi gecersiz.');
    }
    return { caseId, collectionId, cancelReason, ...(correlationId ? { correlationId } : {}) };
  }

  private async approveClaimItemHighImpact(tx: Prisma.TransactionClient, req: OfficeApprovalRequest): Promise<void> {
    if (!req.approverUserId) {
      throw new ConflictException('Onayli CLAIM_ITEM approval kaydinda approverUserId yok.');
    }
    const intent = this.readClaimItemIntent(req);
    const claim = await tx.officeApprovalRequest.updateMany({
      where: {
        id: req.id,
        status: OfficeApprovalStatus.APPROVED,
        executionStatus: OfficeApprovalExecutionStatus.NOT_RUN,
      },
      data: {
        executionStatus: OfficeApprovalExecutionStatus.RUNNING,
        runningStartedAt: new Date(),
      },
    });
    if (claim.count === 0) {
      throw new ConflictException('ClaimItem approval zaten yurutulmus veya yurutme icin kilitlenmis.');
    }

    if (intent.operation === 'CREATE') {
      await this.applyClaimItemCreate(tx, req, intent);
    } else {
      await this.applyClaimItemUpdateOrDelete(tx, req, intent);
    }

    const done = await tx.officeApprovalRequest.updateMany({
      where: {
        id: req.id,
        executionStatus: OfficeApprovalExecutionStatus.RUNNING,
      },
      data: {
        executionStatus: OfficeApprovalExecutionStatus.SUCCEEDED,
        executedAt: new Date(),
      },
    });
    if (done.count === 0) {
      throw new ConflictException('ClaimItem approval yurutme sonucu isaretlenemedi.');
    }
  }

  private readClaimItemIntent(req: OfficeApprovalRequest): ClaimItemHighImpactSavedIntent {
    const value = req.savedIntent as Partial<ClaimItemHighImpactSavedIntent> | null;
    if (!value || typeof value !== 'object' || value.version !== CLAIM_ITEM_INTENT_VERSION) {
      throw new ConflictException('CLAIM_ITEM savedIntent gecersiz.');
    }
    if (!value.caseId || typeof value.caseId !== 'string') {
      throw new ConflictException('CLAIM_ITEM savedIntent caseId gecersiz.');
    }
    if (!value.proposedPatch || typeof value.proposedPatch !== 'object') {
      throw new ConflictException('CLAIM_ITEM savedIntent proposedPatch gecersiz.');
    }
    if (!['CREATE', 'UPDATE', 'DELETE'].includes(String(value.operation))) {
      throw new ConflictException('CLAIM_ITEM savedIntent operation gecersiz.');
    }
    if (value.operation === 'CREATE') {
      throwClaimItemFormationContextRequired();
    }
    if (!value.claimItemId || value.claimItemId !== req.targetRef) {
      throw new ConflictException('CLAIM_ITEM savedIntent hedef bilgisi gecersiz.');
    }
    return value as ClaimItemHighImpactSavedIntent;
  }

  private async applyClaimItemCreate(
    tx: Prisma.TransactionClient,
    req: OfficeApprovalRequest,
    intent: ClaimItemHighImpactSavedIntent,
  ): Promise<void> {
    const patch = this.normalizeApprovedInterestPatch(intent.proposedPatch as any, null, req.requesterUserId);
    if (req.targetType !== CLAIM_ITEM_CASE_TARGET_TYPE || req.targetRef !== intent.caseId || patch.caseId !== intent.caseId) {
      throw new ConflictException('CLAIM_ITEM create hedef bilgisi gecersiz.');
    }
    assertInvoiceClaimItemCreateAllowed(patch);
    assertAttorneyFeeBasisMatchesItemType(patch.itemType, patch.attorneyFeeBasis);
    const caseExists = await tx.case.findFirst({
      where: { id: intent.caseId, tenantId: req.tenantId },
      select: { id: true },
    });
    if (!caseExists) {
      throw new ConflictException('CLAIM_ITEM create case bulunamadi.');
    }
    const createData = this.buildClaimItemCreateData(req.tenantId, patch);
    assertClaimItemCreateStatus(createData.status);
    const sourceDocumentId = createData.sourceDocumentId;
    const envelope = this.buildApprovedClaimItemEnvelope(
      req,
      intent.caseId,
      undefined,
      typeof sourceDocumentId === 'string' ? sourceDocumentId : undefined,
      String(createData.currency ?? 'TRY'),
    );
    const guardedData =
      typeof sourceDocumentId === 'string' && sourceDocumentId.length > 0
        ? await this.claimItemSourceIntegrity.prepareHumanDocumentCreate(
            {
              tenantId: req.tenantId,
              caseId: intent.caseId,
              data: createData,
              envelope,
            },
            tx,
          )
        : createData;
    const created = await tx.claimItem.create({ data: guardedData as any });
    await appendClaimItemContinuity({
      tx,
      domainEventIngest: this.domainEventIngestService,
      envelope,
      operation: 'CREATE',
      before: null,
      after: created as ClaimItemLifecycleRecord,
      auditAction: 'CLAIM_ITEM_HIGH_IMPACT_CREATE_APPLIED',
      auditUserId: req.approverUserId ?? undefined,
      auditSource: 'USER_HIGH_IMPACT_CHANGE_REQUEST',
      approvalRequired: true,
    });
  }

  private buildApprovedClaimItemEnvelope(
    req: OfficeApprovalRequest,
    caseId: string,
    claimItemId: string | undefined,
    sourceDocumentId: string | undefined,
    currency: string,
  ) {
    if (!req.approverUserId) {
      throw new ConflictException('Onayli CLAIM_ITEM approval kaydinda approverUserId yok.');
    }
    const occurredAt = (req.decidedAt ?? new Date()).toISOString();
    return buildCanonicalWriteEnvelopeV1({
      tenantId: req.tenantId,
      caseId,
      target: {
        aggregateType: 'ClaimItem' as const,
        ...(claimItemId === undefined ? {} : { aggregateId: claimItemId }),
      },
      actor: { type: 'HUMAN', userId: req.requesterUserId },
      correlationId: `claim-item-approval:${req.id}`,
      causationId: `office-approval:${req.id}`,
      idempotencyKey: `claim-item-approved:${req.id}`,
      occurredAt,
      effectiveAt: occurredAt,
      source: {
        sourceType: sourceDocumentId ? 'USER_DOCUMENT' : 'USER_COMMAND',
        sourceId: sourceDocumentId ?? claimItemId ?? caseId,
        evidenceRefs: [
          `approval:${req.id}`,
          `requester:${req.requesterUserId}`,
          `approver:${req.approverUserId}`,
        ],
      },
      authority: {
        policyRef: CLAIM_ITEM_HUMAN_WRITE_POLICY_REF,
        approvalRequestId: req.id,
      },
      currency,
    });
  }

  private async applyClaimItemUpdateOrDelete(
    tx: Prisma.TransactionClient,
    req: OfficeApprovalRequest,
    intent: ClaimItemHighImpactSavedIntent,
  ): Promise<void> {
    // Dosya kilidi ÖNCE (tahsilat / mahsup, sorumluluk seçimi onayı ve öteki kalem yazarlarıyla AYNI kilit, AYNI sıra):
    // kalem bu kilit altında okunur, bayatlık bu okumayla değerlendirilir ve aynı işlemde yazılır.
    await lockClaimItemCaseBeforeWrite(tx, intent.caseId);
    const current = await tx.claimItem.findFirst({
      where: { id: intent.claimItemId, tenantId: req.tenantId },
    });
    if (!current) {
      throw new ConflictException('CLAIM_ITEM hedef kalem bulunamadi.');
    }
    const currentSnapshot = this.snapshotClaimItem(current);
    const stalenessInput = {
      operation: intent.operation,
      proposedPatch: intent.proposedPatch as Record<string, unknown>,
      requestSnapshot: intent.currentSnapshot,
      requestSnapshotHash: intent.currentSnapshotHash,
      currentSnapshot,
    };
    let staleness = evaluateClaimItemApprovalStaleness({ ...stalenessInput, independentChangesVerifiedByRecord: false });
    // Değişen alanlar yalnız bağımsız alanlar (sorumluluk izdüşümü / açıklayıcı alanlar) ve / veya sürüm alanıysa kayıttan
    // doğrulanır: talep anındaki satırdan bu yana yapılan bütün yazımlar kayıtlı mı ve fark yalnız bu alanlarda mı?
    if (staleness.stale && isExplainableByIndependentChange(staleness.changedFields)) {
      staleness = evaluateClaimItemApprovalStaleness({
        ...stalenessInput,
        independentChangesVerifiedByRecord: await this.independentChangesVerifiedByAuditChain(
          tx,
          req,
          intent,
          current as ClaimItemLifecycleRecord,
        ),
      });
    }
    if (staleness.stale) {
      const fields = staleness.changedFields.length > 0 ? ` (degisen alanlar: ${staleness.changedFields.join(', ')})` : '';
      throw new ConflictException(`ClaimItem stale-state conflict: kayit approval talebinden sonra degismis${fields}.`);
    }
    assertInvoiceClaimItemTypeTransitionAllowed(
      current,
      (intent.proposedPatch as Record<string, unknown>).itemType,
    );
    // Seçimlik sorumluluk: etkin seçimi olan kalemde iki eski alanın eski yoldan değiştirilmesi yürütmede de
    // reddedilir (talep seçimden ÖNCE açılmış olabilir). Sorumluluk yalnız seçim işlemiyle değişir.
    if (intent.operation !== 'DELETE') {
      const legacyPatch = intent.proposedPatch as Record<string, unknown>;
      const touchesLiability =
        Object.prototype.hasOwnProperty.call(legacyPatch, 'isAllDebtorsLiable') ||
        Object.prototype.hasOwnProperty.call(legacyPatch, 'liableDebtorIds');
      if (touchesLiability) {
        const activeSelection = await tx.claimItemLiabilitySet.findFirst({
          where: { claimItemId: current.id, tenantId: req.tenantId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (activeSelection) {
          throw new ConflictException({
            code: 'CLAIM_ITEM_LIABILITY_SELECTION_ACTIVE',
            message:
              'Bu kalemde etkin borçlu sorumluluğu seçimi var; sorumluluk alanları yalnız sorumluluk seçimi işlemiyle değiştirilebilir.',
          });
        }
      }
    }
    const normalizedPatch = intent.operation === 'DELETE'
      ? intent.proposedPatch
      : this.normalizeApprovedInterestPatch(intent.proposedPatch, current, req.requesterUserId);
    if (intent.operation !== 'DELETE') {
      // Onay anındaki etkin tür + etkin vekâlet ücreti kaynağı uyumlu olmalı (DB CHECK kısıtıyla aynı kural).
      const approvedPatch = normalizedPatch as Record<string, unknown>;
      assertAttorneyFeeBasisMatchesItemType(
        effectiveField(approvedPatch, current as Record<string, unknown>, 'itemType'),
        effectiveField(approvedPatch, current as Record<string, unknown>, 'attorneyFeeBasis'),
      );
    }
    const data = intent.operation === 'DELETE'
      ? { status: 'CANCELLED' }
      : this.buildClaimItemUpdateData(normalizedPatch as Record<string, unknown>);
    const lifecycle = assertClaimItemLifecycleMutation(current.status, data);
    if (intent.operation !== 'DELETE' && !lifecycle.noOp) {
      await assertStoredCaseClaimCurrency(tx, req.tenantId, current.caseId,
        data.currency === undefined ? current.currency : data.currency, true);
    }
    const updated = lifecycle.noOp
      ? current
      : await tx.claimItem.update({
          where: { id: intent.claimItemId },
          data,
        });
    if (lifecycle.noOp) return;

    const envelope = this.buildApprovedClaimItemEnvelope(
      req,
      intent.caseId,
      intent.claimItemId,
      undefined,
      String(updated.currency),
    );
    await appendClaimItemContinuity({
      tx,
      domainEventIngest: this.domainEventIngestService,
      envelope,
      operation: intent.operation === 'DELETE' ? 'CANCEL' : 'UPDATE',
      before: current as ClaimItemLifecycleRecord,
      after: updated as ClaimItemLifecycleRecord,
      auditAction:
        intent.operation === 'DELETE'
          ? 'CLAIM_ITEM_HIGH_IMPACT_DELETE_APPLIED'
          : 'CLAIM_ITEM_HIGH_IMPACT_UPDATE_APPLIED',
      auditUserId: req.approverUserId ?? undefined,
      auditSource: 'USER_HIGH_IMPACT_CHANGE_REQUEST',
      approvalRequired: true,
      ...(intent.operation === 'DELETE'
        ? { retentionDisposition: 'TOMBSTONE_RETAINED' as const }
        : {}),
    });
  }

  /**
   * Bayatlık istisnasının KAYIT doğrulaması (tam satır): talep anındaki satırdan şimdiki satıra giden BÜTÜN yazımlar
   * denetim kaydında kesintisiz zincir mi ve iki satır arasındaki fark YALNIZ bağımsız değişiklik alanlarında mı?
   *
   * Her kalem yazımı denetim kaydına yazımdan önceki ve sonraki TAM satırın özetini bırakır. Talep anındaki satır, şimdiki
   * satırın bağımsız alanları (iki sorumluluk izdüşümü + açıklayıcı alanlar) ve `updatedAt` talep görüntüsündeki
   * değerlere çevrilerek yeniden kurulur. Zincir:
   *  - "önceki" özeti talep anındaki satıra eşit olan kayıttan başlar (o kayıttan önceki yazımlar talep görüntüsünü
   *    üretenlerdir; talep yazım anına denk gelip "bayat doğmuş" olsa da doğru yerden başlanır),
   *  - ardışık kayıtlar birbirine bağlıdır (aralarında kayıtsız yazım yok),
   *  - son kaydın "sonraki" özeti şimdiki satırdır (ardından kayıtsız yazım yok).
   * Görüntüde bulunmayan alanlar dahil bağımsız alanlar dışındaki HERHANGİ bir fark ya da kayıtsız yazım zinciri koparır
   * ve talep bayat kalır. Dosya kilidi altında çağrılır.
   *
   * <remarks>
   * Cagrildigi yerler:
   * - OfficeApprovalDomainSyncService.applyClaimItemUpdateOrDelete() → onay kararı transaction'ı
   * </remarks>
   */
  private async independentChangesVerifiedByAuditChain(
    tx: Prisma.TransactionClient,
    req: OfficeApprovalRequest,
    intent: ClaimItemHighImpactSavedIntent,
    current: ClaimItemLifecycleRecord,
  ): Promise<boolean> {
    const requested = intent.currentSnapshot;
    if (!requested) return false;
    const requestedUpdatedAt = typeof requested.updatedAt === 'string' ? new Date(requested.updatedAt) : null;
    if (!requestedUpdatedAt || Number.isNaN(requestedUpdatedAt.getTime())) return false;
    if (typeof requested.isAllDebtorsLiable !== 'boolean' || !Array.isArray(requested.liableDebtorIds)) return false;
    for (const field of CLAIM_ITEM_DESCRIPTIVE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(requested, field)) return false;
    }

    const rowAtRequest: ClaimItemLifecycleRecord = {
      ...current,
      isAllDebtorsLiable: requested.isAllDebtorsLiable,
      liableDebtorIds: [...requested.liableDebtorIds],
      description: requested.description ?? null,
      referenceNo: requested.referenceNo ?? null,
      sortOrder: requested.sortOrder ?? 0,
      updatedAt: requestedUpdatedAt,
    };
    const rowAtRequestHash = claimItemLifecycleRecordHash(rowAtRequest);

    // Talep görüntüsünün alındığı sürümden bu yana kalemin süreklilik kayıtları (pay bırakılır: kayıt saati ile satır
    // sürüm saati farklı saatlerden gelir; fazladan gelen eski kayıtlar zincir başlangıcı aranırken atlanır).
    const since = new Date(requestedUpdatedAt.getTime() - CLAIM_ITEM_AUDIT_CHAIN_CLOCK_MARGIN_MS);
    const records = await tx.auditLog.findMany({
      where: { tenantId: req.tenantId, entityType: 'ClaimItem', entityId: current.id, createdAt: { gte: since } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { oldValues: true, newValues: true },
      take: CLAIM_ITEM_AUDIT_CHAIN_MAX_RECORDS + 1,
    });
    if (records.length === 0 || records.length > CLAIM_ITEM_AUDIT_CHAIN_MAX_RECORDS) return false;
    const hashOf = (value: unknown): string | null => {
      const hash = (value as { recordHash?: unknown } | null)?.recordHash;
      return typeof hash === 'string' && hash.length > 0 ? hash : null;
    };
    const start = records.findIndex((record) => hashOf(record.oldValues) === rowAtRequestHash);
    if (start < 0) return false;
    for (let index = start + 1; index < records.length; index += 1) {
      const previous = hashOf(records[index - 1].newValues);
      if (!previous || previous !== hashOf(records[index].oldValues)) return false;
    }
    return hashOf(records[records.length - 1].newValues) === claimItemLifecycleRecordHash(current);
  }

  private normalizeApprovedInterestPatch(
    proposedPatch: Record<string, unknown>,
    current: Record<string, any> | null,
    requesterUserId: string,
  ): Record<string, unknown> {
    const interestFields = [
      'interestTypeCode',
      'interestType',
      'interestRate',
      'interestAccrualStatus',
      'noInterestReason',
      'interestStartDate',
      'interestEndDate',
      'interestStartDateProvenance',
    ];
    if (!interestFields.some((field) => Object.prototype.hasOwnProperty.call(proposedPatch, field))) {
      return proposedPatch;
    }

    const richExplicit = Object.prototype.hasOwnProperty.call(proposedPatch, 'interestTypeCode');
    const legacyExplicit = Object.prototype.hasOwnProperty.call(proposedPatch, 'interestType');
    const explicitNoInterest = proposedPatch.interestAccrualStatus === 'NO_INTEREST';
    if (
      explicitNoInterest &&
      proposedPatch.noInterestConfirmedById !== requesterUserId
    ) {
      throw new ConflictException('NO_INTEREST actor approval requester ile uyumsuz.');
    }

    const normalized = normalizeInterestWriteIntent({
      interestTypeCode: richExplicit ? proposedPatch.interestTypeCode as any : current?.interestTypeCode,
      legacyInterestType: legacyExplicit
        ? proposedPatch.interestType as string | null
        : richExplicit
          ? undefined
          : current?.interestType,
      interestRate: explicitNoInterest && !Object.prototype.hasOwnProperty.call(proposedPatch, 'interestRate')
        ? null
        : Object.prototype.hasOwnProperty.call(proposedPatch, 'interestRate')
          ? proposedPatch.interestRate
        : current?.interestRate == null
          ? current?.interestRate
          : Number(current.interestRate),
      explicitNoInterest,
      noInterestReason: proposedPatch.noInterestReason as string | null | undefined,
    });

    let patch = proposedPatch;
    if (normalized.mode !== 'OMITTED') {
      const data = interestWriteData(normalized);
      patch = normalized.mode === 'NO_INTEREST'
        ? {
            ...proposedPatch,
            ...data,
            noInterestReason: normalized.noInterestReason,
            noInterestConfirmedById: requesterUserId,
          }
        : {
            ...proposedPatch,
            ...data,
            noInterestReason: null,
            noInterestConfirmedById: null,
            noInterestConfirmedAt: null,
          };
    }

    const effective = (field: string) => Object.prototype.hasOwnProperty.call(patch, field)
      ? patch[field]
      : current?.[field];
    const status = String(effective('interestAccrualStatus') ?? 'UNKNOWN');
    validateInterestAccrualState(
      {
        interestAccrualStatus: status,
        interestType: effective('interestType') as string | null | undefined,
        interestTypeCode: effective('interestTypeCode') as string | null | undefined,
        interestRate: effective('interestRate') == null
          ? effective('interestRate') as null | undefined
          : Number(effective('interestRate')),
        interestStartDate: effective('interestStartDate') as string | null | undefined,
        interestStartDateProvenance: effective('interestStartDateProvenance') as string | null | undefined,
        noInterestReason: effective('noInterestReason') as string | null | undefined,
        noInterestConfirmedById: effective('noInterestConfirmedById') as string | null | undefined,
      },
      explicitNoInterest,
    );
    return patch;
  }

  private buildClaimItemCreateData(tenantId: string, patch: any): Record<string, unknown> {
    return {
      tenantId,
      caseId: patch.caseId,
      itemType: patch.itemType,
      ...claimItemCreationAmounts(patch.amount),
      currency: patch.currency || 'TRY',
      sourceDocumentId: patch.sourceDocumentId,
      sourceDocumentType: patch.sourceDocumentType,
      interestType: patch.interestType,
      interestTypeCode: patch.interestTypeCode,
      interestRate: patch.interestRate,
      interestStartDate: patch.interestStartDate ? new Date(patch.interestStartDate) : null,
      interestEndDate: patch.interestEndDate ? new Date(patch.interestEndDate) : null,
      dueDate: patch.dueDate ? new Date(patch.dueDate) : null,
      issueDate: patch.issueDate ? new Date(patch.issueDate) : null,
      interestAccrualStatus: patch.interestAccrualStatus ?? 'UNKNOWN',
      interestStartDateProvenance: patch.interestStartDateProvenance ?? null,
      attorneyFeeBasis: patch.attorneyFeeBasis ?? null,
      noInterestReason: patch.noInterestReason ?? null,
      noInterestConfirmedById: patch.noInterestConfirmedById ?? null,
      noInterestConfirmedAt: patch.noInterestConfirmedById ? new Date() : null,
      description: patch.description,
      referenceNo: patch.referenceNo,
      isAllDebtorsLiable: patch.isAllDebtorsLiable ?? true,
      liableDebtorIds: patch.liableDebtorIds || [],
      sortOrder: patch.sortOrder || 0,
    };
  }

  /** applyClaimItemUpdateOrDelete: runs the approved ClaimItem update in the decision transaction. */
  private buildClaimItemUpdateData(patch: Record<string, unknown>): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    if (patch.itemType) data.itemType = patch.itemType;
    if (patch.amount !== undefined) Object.assign(data, claimItemNormalUpdateAmounts(patch.amount));
    if (patch.currency) data.currency = patch.currency;
    if (Object.prototype.hasOwnProperty.call(patch, 'interestType')) data.interestType = patch.interestType;
    if (Object.prototype.hasOwnProperty.call(patch, 'interestTypeCode')) data.interestTypeCode = patch.interestTypeCode;
    if (patch.interestRate !== undefined) data.interestRate = patch.interestRate;
    // An explicit null clears the approved interest field. Omission preserves the stored value.
    if (patch.interestStartDate !== undefined) {
      data.interestStartDate = patch.interestStartDate === null ? null : new Date(String(patch.interestStartDate));
    }
    if (patch.interestEndDate !== undefined) {
      data.interestEndDate = patch.interestEndDate === null ? null : new Date(String(patch.interestEndDate));
    }
    if (patch.dueDate) data.dueDate = new Date(String(patch.dueDate));
    if (patch.interestAccrualStatus) data.interestAccrualStatus = patch.interestAccrualStatus;
    if (patch.interestStartDateProvenance !== undefined) {
      data.interestStartDateProvenance = patch.interestStartDateProvenance;
    }
    // Açık null = "bilinmiyor"a dönüş (onaylı); alan yamada yoksa dokunulmaz.
    if (Object.prototype.hasOwnProperty.call(patch, 'attorneyFeeBasis')) data.attorneyFeeBasis = patch.attorneyFeeBasis ?? null;
    if (patch.interestAccrualStatus === 'NO_INTEREST') {
      data.noInterestReason = patch.noInterestReason;
      data.noInterestConfirmedById = patch.noInterestConfirmedById;
      data.noInterestConfirmedAt = new Date();
    } else if (patch.interestAccrualStatus === 'UNKNOWN' || patch.interestAccrualStatus === 'ACCRUES') {
      // Owner kararı 2026-09-28 (5-A): ACCRUES'a geçişte aktif kayıt faizsizlik beyanı taşımaz. Önceki
      // beyan bu talebin değişmez savedIntent.currentSnapshot'ında kalır (stale-state hash kapısı ile
      // gerçek önceki durumla eşleşir); uygulama denetim kaydı approvalRequestId ile ona bağlanır.
      data.noInterestReason = null;
      data.noInterestConfirmedById = null;
      data.noInterestConfirmedAt = null;
    }
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.referenceNo !== undefined) data.referenceNo = patch.referenceNo;
    if (patch.isAllDebtorsLiable !== undefined) data.isAllDebtorsLiable = patch.isAllDebtorsLiable;
    if (patch.liableDebtorIds) data.liableDebtorIds = patch.liableDebtorIds;
    if (patch.status) data.status = patch.status;
    if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
    return data;
  }

  private snapshotClaimItem(item: any): Record<string, unknown> {
    return {
      id: item.id,
      tenantId: item.tenantId,
      caseId: item.caseId,
      itemType: item.itemType,
      amount: this.scalar(item.amount),
      originalAmount: this.scalar(item.originalAmount),
      demandedAmount: this.scalar(item.demandedAmount),
      collectedAmount: this.scalar(item.collectedAmount),
      currency: item.currency,
      interestType: item.interestType ?? null,
      interestTypeCode: item.interestTypeCode ?? null,
      interestRate: this.scalar(item.interestRate),
      interestStartDate: this.dateScalar(item.interestStartDate),
      interestEndDate: this.dateScalar(item.interestEndDate),
      dueDate: this.dateScalar(item.dueDate),
      interestAccrualStatus: item.interestAccrualStatus ?? null,
      interestStartDateProvenance: item.interestStartDateProvenance ?? null,
      attorneyFeeBasis: item.attorneyFeeBasis ?? null,
      noInterestReason: item.noInterestReason ?? null,
      noInterestConfirmedById: item.noInterestConfirmedById ?? null,
      noInterestConfirmedAt: this.dateScalar(item.noInterestConfirmedAt),
      isAllDebtorsLiable: item.isAllDebtorsLiable,
      liableDebtorIds: Array.isArray(item.liableDebtorIds) ? [...item.liableDebtorIds] : [],
      status: item.status,
      description: item.description ?? null,
      referenceNo: item.referenceNo ?? null,
      sortOrder: item.sortOrder ?? 0,
      updatedAt: this.dateScalar(item.updatedAt),
    };
  }

  private scalar(value: unknown): string | number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    return String(value);
  }

  private dateScalar(value: unknown): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }

}
