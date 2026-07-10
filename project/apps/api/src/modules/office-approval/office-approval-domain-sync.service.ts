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
}
