import { ConflictException, ForbiddenException } from '@nestjs/common';
import { OfficeApprovalStatus } from '@prisma/client';
import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';
import {
  CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
  CLAIM_ITEM_INTENT_VERSION,
  CLAIM_ITEM_TARGET_TYPE,
} from '../claim-item-approval.constants';
import { ClaimItemService } from '../claim-item.service';

const baseItem = {
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

function makeSvc(opts: {
  eligible?: boolean;
  existingApproval?: any;
  item?: any;
} = {}) {
  const item = opts.item ?? baseItem;
  const tx: any = {
    claimItem: {
      findFirst: jest.fn().mockResolvedValue(item),
      update: jest.fn().mockResolvedValue({ ...item, description: 'new', referenceNo: 'ref-new', sortOrder: 2 }),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  };
  const prisma: any = {
    $transaction: jest.fn((fn) => fn(tx)),
    case: {
      findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }),
    },
    claimItem: {
      findFirst: jest.fn().mockResolvedValue(item),
      update: jest.fn(),
      create: jest.fn(),
    },
    officeApprovalRequest: {
      findUnique: jest.fn().mockResolvedValue(opts.existingApproval ?? null),
    },
  };
  const audit = {
    logInTransaction: jest.fn((auditTx, input) => auditTx.auditLog.create({ data: input })),
  };
  const officeApproval = {
    isApproverEligible: jest.fn().mockResolvedValue(opts.eligible ?? true),
    createPendingRequest: jest.fn().mockResolvedValue({ id: 'appr-1' }),
  };
  return { svc: new ClaimItemService(prisma, undefined, audit as any, officeApproval as any), prisma, tx, audit, officeApproval };
}

describe('OWN-29-D ClaimItemService user mutation gate', () => {
  it('metadata edit capability sahibi aktorce transaction icinde uygulanir ve immutable audit yazar', async () => {
    const { svc, tx, audit } = makeSvc();

    const res = await svc.updateFromUser('t1', 'u1', 'ci-1', {
      description: 'new',
      referenceNo: 'ref-new',
      sortOrder: 2,
    } as any);

    expect(res).toMatchObject({ applied: true, approvalRequired: false });
    expect(tx.claimItem.update).toHaveBeenCalledWith({
      where: { id: 'ci-1' },
      data: { description: 'new', referenceNo: 'ref-new', sortOrder: 2 },
    });
    expect(audit.logInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
      action: 'CLAIM_ITEM_METADATA_UPDATED',
      entityType: 'ClaimItem',
      entityId: 'ci-1',
      userId: 'u1',
      metadata: expect.objectContaining({
        source: 'USER_DIRECT_METADATA_EDIT',
        approvalRequired: false,
      }),
    }));
  });

  it('metadata edit capability yoksa reddedilir', async () => {
    const { svc, tx } = makeSvc({ eligible: false });

    await expect(
      svc.updateFromUser('t1', 'u1', 'ci-1', { description: 'new' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.claimItem.update).not.toHaveBeenCalled();
  });

  it('high-impact patch ClaimItem degistirmez ve approval request olusturur', async () => {
    const { svc, prisma, officeApproval } = makeSvc();

    const res = await svc.updateFromUser('t1', 'requester-u', 'ci-1', { amount: 1200 } as any);

    expect(res).toMatchObject({ applied: false, approvalRequired: true, approvalRequestId: 'appr-1' });
    expect(prisma.claimItem.update).not.toHaveBeenCalled();
    expect(officeApproval.createPendingRequest).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 't1',
      actionCode: CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
      targetType: CLAIM_ITEM_TARGET_TYPE,
      targetRef: 'ci-1',
      requesterUserId: 'requester-u',
      idempotencyKey: 'claim-item-high-impact:ci-1',
      savedIntent: expect.objectContaining({
        version: CLAIM_ITEM_INTENT_VERSION,
        operation: 'UPDATE',
        caseId: 'case-1',
        claimItemId: 'ci-1',
        proposedPatch: { amount: 1200 },
        currentSnapshotHash: expect.any(String),
      }),
    }));
  });

  it('high-impact amount=0 degerini approval intent icinde korur', async () => {
    const { svc, officeApproval } = makeSvc();

    await svc.updateFromUser('t1', 'requester-u', 'ci-1', { amount: 0 } as any);

    expect(officeApproval.createPendingRequest).toHaveBeenCalledWith(expect.objectContaining({
      savedIntent: expect.objectContaining({ proposedPatch: { amount: 0 } }),
    }));
  });

  it('farkli icerikli duplicate pending high-impact request engellenir', async () => {
    const { svc } = makeSvc({
      existingApproval: {
        id: 'appr-existing',
        status: OfficeApprovalStatus.PENDING_APPROVAL,
        payloadHash: stableJsonHash({ some: 'other-intent' }),
      },
    });

    await expect(
      svc.updateFromUser('t1', 'requester-u', 'ci-1', { amount: 1200 } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('delete/cancel dogrudan uygulamaz, approval request olusturur', async () => {
    const { svc, officeApproval } = makeSvc();

    const res = await svc.removeFromUser('t1', 'requester-u', 'ci-1');

    expect(res).toMatchObject({ applied: false, approvalRequired: true, approvalRequestId: 'appr-1' });
    expect(officeApproval.createPendingRequest).toHaveBeenCalledWith(expect.objectContaining({
      actionCode: CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
      savedIntent: expect.objectContaining({
        operation: 'DELETE',
        proposedPatch: { status: 'CANCELLED' },
      }),
    }));
  });

  it('system/internal update yolu approval istemeden calismaya devam eder', async () => {
    const { svc, prisma, officeApproval } = makeSvc();
    prisma.claimItem.update.mockResolvedValue({ id: 'ci-1', amount: 1200 });

    await expect(svc.update('t1', 'ci-1', { amount: 1200 } as any)).resolves.toEqual({ id: 'ci-1', amount: 1200 });
    expect(prisma.claimItem.update).toHaveBeenCalledWith({
      where: { id: 'ci-1' },
      data: { demandedAmount: 1200, amount: 1200 },
    });
    expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
  });
});
