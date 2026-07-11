import { BadRequestException, ConflictException, Injectable, Optional } from '@nestjs/common';
import {
  CollectionDispositionStatus,
  OfficeApprovalExecutionStatus,
  OfficeApprovalRequest,
  OfficeApprovalStatus,
  Prisma,
} from '@prisma/client';
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
  CLAIM_ITEM_TARGET_TYPE,
  CLAIM_ITEM_CASE_TARGET_TYPE,
  type ClaimItemHighImpactSavedIntent,
} from '../claim-item/claim-item-approval.constants';
import {
  claimItemCreationAmounts,
  claimItemNormalUpdateAmounts,
} from '../claim-item/claim-item-amount-contract';
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

const COLLECTION_DISPOSITION_APPROVAL_ACTION = 'COLLECTION_DISPOSITION_POST';
const COLLECTION_DISPOSITION_TARGET_TYPE = 'COLLECTION_DISPOSITION';

@Injectable()
export class OfficeApprovalDomainSyncService {
  constructor(
    @Optional() private readonly domainEventIngestService?: DomainEventIngestService,
    @Optional() private readonly journalWriter?: AccountingJournalWriterService,
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
    if (this.isCollectionDispositionPostApproval(req)) {
      return this.syncCollectionDisposition(tx, req);
    }
    if (this.isCollectionVoidApproval(req)) {
      return this.syncCollectionVoid(tx, req);
    }
    if (this.isClaimItemHighImpactApproval(req)) {
      return this.syncClaimItemHighImpact(tx, req);
    }
    if (this.isFinancialCaseCloseApproval(req)) {
      return this.syncFinancialCaseClose(tx, req);
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
    if (!this.domainEventIngestService || !this.journalWriter) {
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
    }, {
      tenantId: req.tenantId,
      id: intent.collectionId,
      dto: { cancelReason: intent.cancelReason },
      actorUserId: req.approverUserId,
      expectedCaseId: intent.caseId,
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
    if (!caseId || !collectionId || !cancelReason || collectionId !== req.targetRef) {
      throw new ConflictException('COLLECTION_VOID savedIntent hedef/gerekce bilgisi gecersiz.');
    }
    return { caseId, collectionId, cancelReason };
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
    if (value.operation !== 'CREATE' && (!value.claimItemId || value.claimItemId !== req.targetRef)) {
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
    const caseExists = await tx.case.findFirst({
      where: { id: intent.caseId, tenantId: req.tenantId },
      select: { id: true },
    });
    if (!caseExists) {
      throw new ConflictException('CLAIM_ITEM create case bulunamadi.');
    }
    const created = await tx.claimItem.create({
      data: this.buildClaimItemCreateData(req.tenantId, patch) as any,
    });
    await this.writeClaimItemAudit(tx, req, created.id, intent.caseId, {}, this.snapshotClaimItem(created), 'CLAIM_ITEM_HIGH_IMPACT_CREATE_APPLIED');
  }

  private async applyClaimItemUpdateOrDelete(
    tx: Prisma.TransactionClient,
    req: OfficeApprovalRequest,
    intent: ClaimItemHighImpactSavedIntent,
  ): Promise<void> {
    const current = await tx.claimItem.findFirst({
      where: { id: intent.claimItemId, tenantId: req.tenantId },
    });
    if (!current) {
      throw new ConflictException('CLAIM_ITEM hedef kalem bulunamadi.');
    }
    const currentSnapshot = this.snapshotClaimItem(current);
    const comparableSnapshot = intent.currentSnapshot
      ? Object.fromEntries(Object.keys(intent.currentSnapshot).map((key) => [key, currentSnapshot[key]]))
      : currentSnapshot;
    if (intent.currentSnapshotHash && stableJsonHash(comparableSnapshot) !== intent.currentSnapshotHash) {
      throw new ConflictException('ClaimItem stale-state conflict: kayit approval talebinden sonra degismis.');
    }
    assertInvoiceClaimItemTypeTransitionAllowed(
      current,
      (intent.proposedPatch as Record<string, unknown>).itemType,
    );
    const normalizedPatch = intent.operation === 'DELETE'
      ? intent.proposedPatch
      : this.normalizeApprovedInterestPatch(intent.proposedPatch, current, req.requesterUserId);
    const data = intent.operation === 'DELETE'
      ? { status: 'CANCELLED' }
      : this.buildClaimItemUpdateData(normalizedPatch as Record<string, unknown>);
    const updated = await tx.claimItem.update({
      where: { id: intent.claimItemId },
      data,
    });
    await this.writeClaimItemAudit(
      tx,
      req,
      intent.claimItemId!,
      intent.caseId,
      currentSnapshot,
      this.snapshotClaimItem(updated),
      intent.operation === 'DELETE' ? 'CLAIM_ITEM_HIGH_IMPACT_DELETE_APPLIED' : 'CLAIM_ITEM_HIGH_IMPACT_UPDATE_APPLIED',
    );
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

  private buildClaimItemUpdateData(patch: Record<string, unknown>): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    if (patch.itemType) data.itemType = patch.itemType;
    if (patch.amount !== undefined) Object.assign(data, claimItemNormalUpdateAmounts(patch.amount));
    if (patch.currency) data.currency = patch.currency;
    if (Object.prototype.hasOwnProperty.call(patch, 'interestType')) data.interestType = patch.interestType;
    if (Object.prototype.hasOwnProperty.call(patch, 'interestTypeCode')) data.interestTypeCode = patch.interestTypeCode;
    if (patch.interestRate !== undefined) data.interestRate = patch.interestRate;
    if (patch.interestStartDate) data.interestStartDate = new Date(String(patch.interestStartDate));
    if (patch.interestEndDate) data.interestEndDate = new Date(String(patch.interestEndDate));
    if (patch.dueDate) data.dueDate = new Date(String(patch.dueDate));
    if (patch.interestAccrualStatus) data.interestAccrualStatus = patch.interestAccrualStatus;
    if (patch.interestStartDateProvenance) data.interestStartDateProvenance = patch.interestStartDateProvenance;
    if (patch.interestAccrualStatus === 'NO_INTEREST') {
      data.noInterestReason = patch.noInterestReason;
      data.noInterestConfirmedById = patch.noInterestConfirmedById;
      data.noInterestConfirmedAt = new Date();
    } else if (patch.interestAccrualStatus === 'UNKNOWN') {
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

  private async writeClaimItemAudit(
    tx: Prisma.TransactionClient,
    req: OfficeApprovalRequest,
    entityId: string,
    caseId: string,
    oldValues: Record<string, unknown>,
    newValues: Record<string, unknown>,
    action: string,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        tenantId: req.tenantId,
        action,
        entityType: 'ClaimItem',
        entityId,
        userId: req.approverUserId ?? undefined,
        oldValues: oldValues as any,
        newValues: newValues as any,
        description: 'ClaimItem high-impact mutation audit',
        metadata: {
          caseId,
          claimItemId: entityId,
          source: 'USER_HIGH_IMPACT_CHANGE_REQUEST',
          approvalRequestId: req.id,
          approvalRequired: true,
        },
      },
    });
  }
}
