/** @jest-environment node */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OfficeApprovalStatus } from '@prisma/client';
import { CollectionService } from '../collection.service';

function buildService(collection: any, officeApproval: any) {
  const prisma = {
    collection: {
      findFirst: jest.fn(async () => collection),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const svc = new CollectionService(
    prisma as any,
    { appendInTransaction: jest.fn() } as any,
    {} as any,
    undefined,
    { write: jest.fn() } as any,
    officeApproval,
  );
  return { svc, prisma };
}

describe('OWN-29-B CollectionService.requestCancel', () => {
  it('confirmed collection icin OfficeApprovalRequest olusturur ve finansal mutasyon yapmaz', async () => {
    const officeApproval = {
      createPendingRequest: jest.fn(async () => ({
        id: 'appr-1',
        status: OfficeApprovalStatus.PENDING_APPROVAL,
      })),
    };
    const { svc, prisma } = buildService({ id: 'col-1', caseId: 'case-1', status: 'CONFIRMED' }, officeApproval);

    const result = await svc.requestCancel(
      'tenant-1',
      'col-1',
      { cancelReason: 'sehven kayit' },
      'requester-1',
      'case-1',
      { correlationId: 'corr-void-request' },
    );

    expect(result).toEqual({
      requested: true,
      approvalRequestId: 'appr-1',
      status: OfficeApprovalStatus.PENDING_APPROVAL,
      collectionId: 'col-1',
    });
    expect(officeApproval.createPendingRequest).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      actionCode: 'COLLECTION_VOID',
      targetType: 'COLLECTION',
      targetRef: 'col-1',
      requesterUserId: 'requester-1',
      savedIntent: {
        caseId: 'case-1',
        collectionId: 'col-1',
        cancelReason: 'sehven kayit',
        correlationId: 'corr-void-request',
      },
      reason: 'Confirmed/posted tahsilat iptali K4 four-eyes onayı gerektirir.',
      idempotencyKey: 'collection-void:col-1',
    });
    expect(prisma.collection.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('route caseId/tenant guard fail-closed kalir', async () => {
    const officeApproval = { createPendingRequest: jest.fn() };
    const { svc } = buildService(null, officeApproval);

    await expect(
      svc.requestCancel('tenant-1', 'col-1', { cancelReason: 'sehven kayit' }, 'requester-1', 'wrong-case'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
  });

  it('gerekcesiz void request acmaz', async () => {
    const officeApproval = { createPendingRequest: jest.fn() };
    const { svc } = buildService({ id: 'col-1', caseId: 'case-1', status: 'CONFIRMED' }, officeApproval);

    await expect(
      svc.requestCancel('tenant-1', 'col-1', { cancelReason: '   ' }, 'requester-1', 'case-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
  });

  it('draft/unposted collection icin confirmed void approval acmaz', async () => {
    const officeApproval = { createPendingRequest: jest.fn() };
    const { svc } = buildService({ id: 'col-1', caseId: 'case-1', status: 'PENDING' }, officeApproval);

    await expect(
      svc.requestCancel('tenant-1', 'col-1', { cancelReason: 'taslak iptal' }, 'requester-1', 'case-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
  });
});
