/** @jest-environment node */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CollectionDispositionStatus, OfficeApprovalStatus } from '@prisma/client';
import { OfficeApprovalDomainSyncService } from '../office-approval-domain-sync.service';

const decidedAt = new Date('2026-01-01T12:00:00.000Z');

const req = (over: Record<string, unknown> = {}) => ({
  id: 'appr-1',
  tenantId: 't1',
  actionCode: 'COLLECTION_DISPOSITION_POST',
  targetType: 'COLLECTION_DISPOSITION',
  targetRef: 'd1',
  requesterUserId: 'requester-u',
  approverUserId: 'approver-u',
  status: OfficeApprovalStatus.APPROVED,
  decidedAt,
  ...over,
});

const tx = (count = 1) => ({
  collectionDisposition: {
    updateMany: jest.fn().mockResolvedValue({ count }),
  },
});

describe('DBIND-P1 OfficeApprovalDomainSyncService', () => {
  let svc: OfficeApprovalDomainSyncService;

  beforeEach(() => {
    svc = new OfficeApprovalDomainSyncService();
  });

  it('generic actionCode/targetType icin no-op kalir', async () => {
    const db = tx();

    await svc.syncAfterDecision(db as any, req({ actionCode: 'CHANGE_STATUS', targetType: 'LegalCase' }) as any);

    expect(db.collectionDisposition.updateMany).not.toHaveBeenCalled();
  });

  it('APPROVED: DISTRIBUTION_RECOMMENDED guard ile DISTRIBUTION_APPROVED yapar', async () => {
    const db = tx();

    await svc.syncAfterDecision(db as any, req() as any);

    expect(db.collectionDisposition.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'd1',
        tenantId: 't1',
        approvalRequestId: 'appr-1',
        status: CollectionDispositionStatus.DISTRIBUTION_RECOMMENDED,
      },
      data: {
        status: CollectionDispositionStatus.DISTRIBUTION_APPROVED,
        approvedAt: decidedAt,
        approvedById: 'approver-u',
      },
    });
  });

  it.each([
    OfficeApprovalStatus.REJECTED,
    OfficeApprovalStatus.REVISION_REQUESTED,
    OfficeApprovalStatus.CANCELLED,
  ])('%s: DISTRIBUTION_RECOMMENDED guard ile HELD_PENDING_DISTRIBUTION durumuna dondurur', async (status) => {
    const db = tx();

    await svc.syncAfterDecision(db as any, req({ status }) as any);

    expect(db.collectionDisposition.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'd1',
        tenantId: 't1',
        approvalRequestId: 'appr-1',
        status: CollectionDispositionStatus.DISTRIBUTION_RECOMMENDED,
      },
      data: {
        status: CollectionDispositionStatus.HELD_PENDING_DISTRIBUTION,
        approvalRequestId: null,
        approvedAt: null,
        approvedById: null,
      },
    });
  });

  it('guard count=0 ise drift yaratmadan ConflictException firlatir', async () => {
    const db = tx(0);

    await expect(svc.syncAfterDecision(db as any, req() as any)).rejects.toBeInstanceOf(ConflictException);
  });

  it('APPROVED_WITH_CHANGES disposition approval icin fail-closed kalir', async () => {
    const db = tx();

    await expect(
      svc.syncAfterDecision(db as any, req({ status: OfficeApprovalStatus.APPROVED_WITH_CHANGES }) as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.collectionDisposition.updateMany).not.toHaveBeenCalled();
  });

  it('APPROVED kayitta approverUserId yoksa disposition approved yazmaz', async () => {
    const db = tx();

    await expect(svc.syncAfterDecision(db as any, req({ approverUserId: null }) as any)).rejects.toBeInstanceOf(ConflictException);
    expect(db.collectionDisposition.updateMany).not.toHaveBeenCalled();
  });
});
