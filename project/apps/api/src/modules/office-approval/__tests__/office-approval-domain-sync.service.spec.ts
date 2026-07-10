/** @jest-environment node */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CollectionDispositionStatus, OfficeApprovalExecutionStatus, OfficeApprovalStatus } from '@prisma/client';
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

const collectionVoidReq = (over: Record<string, unknown> = {}) => ({
  id: 'void-appr-1',
  tenantId: 't1',
  actionCode: 'COLLECTION_VOID',
  targetType: 'COLLECTION',
  targetRef: 'col-1',
  requesterUserId: 'requester-u',
  approverUserId: 'approver-u',
  status: OfficeApprovalStatus.APPROVED,
  savedIntent: {
    caseId: 'case-1',
    collectionId: 'col-1',
    cancelReason: 'sehven kayit',
  },
  ...over,
});

const collectionVoidTx = () => ({
  officeApprovalRequest: {
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  collection: {
    findFirst: jest.fn().mockResolvedValue({
      id: 'col-1',
      tenantId: 't1',
      caseId: 'case-1',
      status: 'CONFIRMED',
      amount: 100,
      currency: 'TRY',
      date: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
    update: jest.fn().mockResolvedValue({
      id: 'col-1',
      tenantId: 't1',
      caseId: 'case-1',
      status: 'CANCELLED',
      amount: 100,
      currency: 'TRY',
      cancelledAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    }),
  },
  icrabotTimelineEntry: {
    findFirst: jest.fn().mockResolvedValue({ body: { header: { eventId: 'pay-evt-1' } } }),
  },
  accountingJournalEntry: {
    findFirst: jest.fn().mockResolvedValue({ id: 'journal-1', metadata: { sourceVersion: 'recorded-v1' } }),
  },
  ledgerEntry: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
  collectionOverpayment: {
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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

describe('OWN-29-B OfficeApprovalDomainSyncService collection void', () => {
  it('APPROVED COLLECTION_VOID icin execution lock alir, reversal executor calisir ve SUCCEEDED isaretler', async () => {
    const domainEventIngest = { appendInTransaction: jest.fn().mockResolvedValue(undefined) };
    const journalWriter = { write: jest.fn().mockResolvedValue({ ok: true }) };
    const svc = new OfficeApprovalDomainSyncService(domainEventIngest as any, journalWriter as any);
    const db = collectionVoidTx();

    await svc.syncAfterDecision(db as any, collectionVoidReq() as any);

    expect(db.officeApprovalRequest.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'void-appr-1',
        status: OfficeApprovalStatus.APPROVED,
        executionStatus: OfficeApprovalExecutionStatus.NOT_RUN,
      },
      data: {
        executionStatus: OfficeApprovalExecutionStatus.RUNNING,
        runningStartedAt: expect.any(Date),
      },
    });
    expect(db.collection.update).toHaveBeenCalledWith({
      where: { id: 'col-1' },
      data: {
        status: 'CANCELLED',
        cancelledAt: expect.any(Date),
        cancelReason: 'sehven kayit',
      },
    });
    expect(journalWriter.write).toHaveBeenCalledTimes(1);
    expect(domainEventIngest.appendInTransaction).toHaveBeenCalledWith(db, expect.objectContaining({
      header: expect.objectContaining({
        eventType: 'PAYMENT_REVERSED',
        actor: { type: 'HUMAN', userId: 'approver-u' },
      }),
      payload: expect.objectContaining({
        collectionId: 'col-1',
        cancelReason: 'sehven kayit',
      }),
    }));
    expect(db.officeApprovalRequest.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'void-appr-1',
        executionStatus: OfficeApprovalExecutionStatus.RUNNING,
      },
      data: {
        executionStatus: OfficeApprovalExecutionStatus.SUCCEEDED,
        executedAt: expect.any(Date),
      },
    });
  });

  it.each([
    OfficeApprovalStatus.REJECTED,
    OfficeApprovalStatus.REVISION_REQUESTED,
    OfficeApprovalStatus.CANCELLED,
  ])('%s COLLECTION_VOID icin finansal mutasyon yapmaz', async (status) => {
    const svc = new OfficeApprovalDomainSyncService({ appendInTransaction: jest.fn() } as any, { write: jest.fn() } as any);
    const db = collectionVoidTx();

    await svc.syncAfterDecision(db as any, collectionVoidReq({ status }) as any);

    expect(db.collection.update).not.toHaveBeenCalled();
    expect(db.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
  });

  it('APPROVED_WITH_CHANGES COLLECTION_VOID icin fail-closed kalir', async () => {
    const svc = new OfficeApprovalDomainSyncService({ appendInTransaction: jest.fn() } as any, { write: jest.fn() } as any);
    const db = collectionVoidTx();

    await expect(
      svc.syncAfterDecision(db as any, collectionVoidReq({ status: OfficeApprovalStatus.APPROVED_WITH_CHANGES }) as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.collection.update).not.toHaveBeenCalled();
  });
});
