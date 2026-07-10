/** @jest-environment node */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CollectionDispositionStatus, OfficeApprovalExecutionStatus, OfficeApprovalStatus } from '@prisma/client';
import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';
import {
  CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
  CLAIM_ITEM_INTENT_VERSION,
} from '../../claim-item/claim-item-approval.constants';
import {
  FINANCIAL_CASE_CLOSE_ACTION_CODE,
  FINANCIAL_CASE_CLOSE_INTENT_VERSION,
  FINANCIAL_CASE_CLOSE_TARGET_TYPE,
} from '../../case-status/financial-case-close.constants';
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

describe('OWN-29-C OfficeApprovalDomainSyncService financial case close', () => {
  const financialCloseReq = (over: Record<string, unknown> = {}) => ({
    id: 'financial-close-appr-1',
    tenantId: 't1',
    actionCode: FINANCIAL_CASE_CLOSE_ACTION_CODE,
    targetType: FINANCIAL_CASE_CLOSE_TARGET_TYPE,
    targetRef: 'case-1',
    requesterUserId: 'requester-u',
    approverUserId: 'approver-u',
    status: OfficeApprovalStatus.APPROVED,
    savedIntent: {
      version: FINANCIAL_CASE_CLOSE_INTENT_VERSION,
      caseId: 'case-1',
      status: 'HITAM',
      reason: 'tam ödeme',
    },
    ...over,
  });

  const financialCloseTx = (count = 1) => ({
    officeApprovalRequest: {
      updateMany: jest.fn().mockResolvedValue({ count }),
    },
    case: {
      findFirst: jest.fn().mockResolvedValue({ caseStatus: 'DERDEST', isAutomationEnabled: true }),
      update: jest.fn().mockResolvedValue({ id: 'case-1', caseStatus: 'HITAM' }),
    },
    caseStatusHistory: {
      create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
    },
    decisionLog: {
      create: jest.fn().mockResolvedValue({ id: 'decision-1' }),
    },
  });

  it('APPROVED FINANCIAL_CASE_CLOSE execution lock alir, CaseStatusService helper ile uygular ve SUCCEEDED isaretler', async () => {
    const svc = new OfficeApprovalDomainSyncService();
    const db = financialCloseTx();

    await svc.syncAfterDecision(db as any, financialCloseReq() as any);

    expect(db.officeApprovalRequest.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'financial-close-appr-1',
        status: OfficeApprovalStatus.APPROVED,
        executionStatus: OfficeApprovalExecutionStatus.NOT_RUN,
      },
      data: {
        executionStatus: OfficeApprovalExecutionStatus.RUNNING,
        runningStartedAt: expect.any(Date),
      },
    });
    expect(db.case.findFirst).toHaveBeenCalledWith({
      where: { id: 'case-1', tenantId: 't1' },
      select: { caseStatus: true, isAutomationEnabled: true },
    });
    expect(db.case.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: {
        caseStatus: 'HITAM',
        isAutomationEnabled: false,
        nextActionAt: null,
      },
    });
    expect(db.caseStatusHistory.create).toHaveBeenCalledWith({
      data: {
        caseId: 'case-1',
        fromStatus: 'DERDEST',
        toStatus: 'HITAM',
        reason: 'tam ödeme',
        changedById: 'approver-u',
        automationWasEnabled: false,
      },
    });
    expect(db.decisionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId: 'case-1',
        decisionType: 'STATUS_CHANGE',
        decision: 'Statü değiştirildi: DERDEST -> HITAM',
        reasoning: 'tam ödeme',
        isAutomatic: false,
      }),
    });
    expect(db.officeApprovalRequest.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'financial-close-appr-1',
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
  ])('%s FINANCIAL_CASE_CLOSE icin status mutation yapmaz', async (status) => {
    const svc = new OfficeApprovalDomainSyncService();
    const db = financialCloseTx();

    await svc.syncAfterDecision(db as any, financialCloseReq({ status }) as any);

    expect(db.case.update).not.toHaveBeenCalled();
    expect(db.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
  });

  it('duplicate execution lock count=0 ise status mutation yapmaz', async () => {
    const svc = new OfficeApprovalDomainSyncService();
    const db = financialCloseTx(0);

    await expect(svc.syncAfterDecision(db as any, financialCloseReq() as any)).rejects.toBeInstanceOf(ConflictException);
    expect(db.case.update).not.toHaveBeenCalled();
  });

  it('APPROVED_WITH_CHANGES FINANCIAL_CASE_CLOSE icin fail-closed kalir', async () => {
    const svc = new OfficeApprovalDomainSyncService();
    const db = financialCloseTx();

    await expect(
      svc.syncAfterDecision(db as any, financialCloseReq({ status: OfficeApprovalStatus.APPROVED_WITH_CHANGES }) as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.case.update).not.toHaveBeenCalled();
  });

  it('savedIntent financial-close olmayan status tasiyorsa mutation baslamadan fail-closed olur', async () => {
    const svc = new OfficeApprovalDomainSyncService();
    const db = financialCloseTx();

    await expect(
      svc.syncAfterDecision(db as any, financialCloseReq({ savedIntent: {
        version: FINANCIAL_CASE_CLOSE_INTENT_VERSION,
        caseId: 'case-1',
        status: 'AZIL',
        reason: 'vekalet sona erdi',
      } }) as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
    expect(db.case.update).not.toHaveBeenCalled();
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

describe('OWN-29-D OfficeApprovalDomainSyncService claim item high-impact', () => {
  const item = {
    id: 'ci-1',
    tenantId: 't1',
    caseId: 'case-1',
    itemType: 'PRINCIPAL',
    amount: 1000,
    originalAmount: 1000,
    demandedAmount: 1000,
    collectedAmount: 0,
    currency: 'TRY',
    interestType: null,
    interestRate: null,
    interestStartDate: null,
    interestEndDate: null,
    dueDate: null,
    interestAccrualStatus: 'UNKNOWN',
    interestStartDateProvenance: null,
    isAllDebtorsLiable: true,
    liableDebtorIds: [],
    status: 'ACTIVE',
    description: 'old',
    referenceNo: 'ref-old',
    sortOrder: 0,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const snapshot = (over: Record<string, unknown> = {}) => ({
    id: 'ci-1',
    tenantId: 't1',
    caseId: 'case-1',
    itemType: 'PRINCIPAL',
    amount: 1000,
    originalAmount: 1000,
    demandedAmount: 1000,
    collectedAmount: 0,
    currency: 'TRY',
    interestType: null,
    interestRate: null,
    interestStartDate: null,
    interestEndDate: null,
    dueDate: null,
    interestAccrualStatus: 'UNKNOWN',
    interestStartDateProvenance: null,
    isAllDebtorsLiable: true,
    liableDebtorIds: [],
    status: 'ACTIVE',
    description: 'old',
    referenceNo: 'ref-old',
    sortOrder: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });

  const claimItemReq = (intentOver: Record<string, unknown> = {}, reqOver: Record<string, unknown> = {}) => {
    const currentSnapshot = snapshot();
    return {
      id: 'claim-appr-1',
      tenantId: 't1',
      actionCode: CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
      targetType: 'CLAIM_ITEM',
      targetRef: 'ci-1',
      requesterUserId: 'requester-u',
      approverUserId: 'approver-u',
      status: OfficeApprovalStatus.APPROVED,
      savedIntent: {
        version: CLAIM_ITEM_INTENT_VERSION,
        operation: 'UPDATE',
        caseId: 'case-1',
        claimItemId: 'ci-1',
        proposedPatch: { amount: 1200 },
        currentSnapshot,
        currentSnapshotHash: stableJsonHash(currentSnapshot),
        reason: 'test',
        ...intentOver,
      },
      ...reqOver,
    };
  };

  function claimItemTx(over: Record<string, any> = {}) {
    return {
      officeApprovalRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      claimItem: {
        findFirst: jest.fn().mockResolvedValue(item),
        update: jest.fn().mockResolvedValue({ ...item, amount: 1200, updatedAt: new Date('2026-01-02T00:00:00.000Z') }),
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      ...over,
    };
  }

  it('APPROVED high-impact update execution lock alir, patch uygular, audit yazar ve SUCCEEDED isaretler', async () => {
    const svc = new OfficeApprovalDomainSyncService();
    const db = claimItemTx();

    await svc.syncAfterDecision(db as any, claimItemReq() as any);

    expect(db.officeApprovalRequest.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'claim-appr-1',
        status: OfficeApprovalStatus.APPROVED,
        executionStatus: OfficeApprovalExecutionStatus.NOT_RUN,
      },
      data: {
        executionStatus: OfficeApprovalExecutionStatus.RUNNING,
        runningStartedAt: expect.any(Date),
      },
    });
    expect(db.claimItem.update).toHaveBeenCalledWith({
      where: { id: 'ci-1' },
      data: { amount: 1200 },
    });
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CLAIM_ITEM_HIGH_IMPACT_UPDATE_APPLIED',
        entityType: 'ClaimItem',
        entityId: 'ci-1',
        userId: 'approver-u',
        metadata: expect.objectContaining({
          source: 'USER_HIGH_IMPACT_CHANGE_REQUEST',
          approvalRequestId: 'claim-appr-1',
        }),
      }),
    });
    expect(db.officeApprovalRequest.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'claim-appr-1',
        executionStatus: OfficeApprovalExecutionStatus.RUNNING,
      },
      data: {
        executionStatus: OfficeApprovalExecutionStatus.SUCCEEDED,
        executedAt: expect.any(Date),
      },
    });
  });

  it('stale ClaimItem snapshot proposal uygulanmasini engeller', async () => {
    const svc = new OfficeApprovalDomainSyncService();
    const db = claimItemTx({
      claimItem: {
        findFirst: jest.fn().mockResolvedValue({ ...item, amount: 1500 }),
        update: jest.fn(),
        create: jest.fn(),
      },
    });

    await expect(svc.syncAfterDecision(db as any, claimItemReq() as any)).rejects.toBeInstanceOf(ConflictException);
    expect(db.claimItem.update).not.toHaveBeenCalled();
  });

  it('duplicate finalize lock count=0 ise cift mutasyon uretmez', async () => {
    const svc = new OfficeApprovalDomainSyncService();
    const db = claimItemTx({
      officeApprovalRequest: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }),
      },
    });

    await expect(svc.syncAfterDecision(db as any, claimItemReq() as any)).rejects.toBeInstanceOf(ConflictException);
    expect(db.claimItem.update).not.toHaveBeenCalled();
  });

  it('APPROVED_WITH_CHANGES claim item high-impact icin fail-closed kalir', async () => {
    const svc = new OfficeApprovalDomainSyncService();
    const db = claimItemTx();

    await expect(
      svc.syncAfterDecision(db as any, claimItemReq({}, { status: OfficeApprovalStatus.APPROVED_WITH_CHANGES }) as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.claimItem.update).not.toHaveBeenCalled();
  });
});
