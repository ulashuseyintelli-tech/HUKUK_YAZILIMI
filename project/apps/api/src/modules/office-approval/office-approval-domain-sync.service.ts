import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { CollectionDispositionStatus, OfficeApprovalRequest, OfficeApprovalStatus, Prisma } from '@prisma/client';

const COLLECTION_DISPOSITION_APPROVAL_ACTION = 'COLLECTION_DISPOSITION_POST';
const COLLECTION_DISPOSITION_TARGET_TYPE = 'COLLECTION_DISPOSITION';

@Injectable()
export class OfficeApprovalDomainSyncService {
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
    if (!this.isCollectionDispositionPostApproval(req)) return;

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

  private isCollectionDispositionPostApproval(req: OfficeApprovalRequest): boolean {
    return (
      req.actionCode === COLLECTION_DISPOSITION_APPROVAL_ACTION &&
      req.targetType === COLLECTION_DISPOSITION_TARGET_TYPE
    );
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
}
