import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OfficeApprovalStatus } from '@prisma/client';
import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';
import {
  CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
  CLAIM_ITEM_INTENT_VERSION,
  CLAIM_ITEM_TARGET_TYPE,
} from '../claim-item-approval.constants';
import { ClaimItemController } from '../claim-item.controller';
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
  interestTypeCode: null,
  interestRate: null,
  interestStartDate: null,
  interestEndDate: null,
  dueDate: null,
  interestAccrualStatus: 'UNKNOWN',
  interestStartDateProvenance: null,
  noInterestReason: null,
  noInterestConfirmedById: null,
  noInterestConfirmedAt: null,
  isAllDebtorsLiable: true,
  liableDebtorIds: [],
  status: 'ACTIVE',
  description: 'old',
  referenceNo: 'ref-old',
  sortOrder: 0,
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function makeSvc(opts: {
  gateDenied?: boolean;
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
    createPendingRequest: jest.fn().mockResolvedValue({ id: 'appr-1' }),
  };
  const domainEventIngest = {
    appendInTransaction: jest.fn().mockResolvedValue({ id: 'event-1' }),
  };
  const writerRouter = {
    evaluateHuman: jest.fn(async (input: any) => {
      if (opts.gateDenied) {
        return {
          outcome: 'DENIED',
          actorType: 'HUMAN',
          reasonCode: 'OBJECT_PERMISSION_DENIED',
          approvalRequired: false,
          scope: { tenantId: input.tenantId, caseId: input.caseId, claimItemId: input.claimItemId },
        };
      }
      const lowImpact =
        input.operation === 'UPDATE' &&
        Object.keys(input.payload).every((key) => ['description', 'referenceNo', 'sortOrder'].includes(key));
      return lowImpact
        ? {
            outcome: 'DIRECT_ALLOWED',
            actorType: 'HUMAN',
            permission: 'EDIT_FINANCE',
            permissionSource: 'CASE_STAFF',
            approvalRequired: false,
            scope: { tenantId: input.tenantId, caseId: input.caseId, claimItemId: input.claimItemId },
          }
        : {
            outcome: 'OFFICE_APPROVAL_REQUIRED',
            actorType: 'HUMAN',
            permission: 'EDIT_FINANCE',
            permissionSource: 'CASE_STAFF',
            approvalRequired: true,
            approvalActionCode: CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
            scope: { tenantId: input.tenantId, caseId: input.caseId, claimItemId: input.claimItemId },
          };
    }),
  };
  return {
    svc: new ClaimItemService(
      prisma,
      undefined,
      audit as any,
      officeApproval as any,
      writerRouter as any,
      domainEventIngest as any,
    ),
    prisma,
    tx,
    audit,
    officeApproval,
    writerRouter,
    domainEventIngest,
  };
}

describe('OWN-29-D ClaimItemService user mutation gate', () => {
  it('FATURA + TAX_KDV create talebini approval olusturmadan reddeder', async () => {
    const { svc, prisma, officeApproval } = makeSvc();

    await expect(svc.createFromUser('t1', 'requester-u', {
      caseId: 'case-1',
      itemType: 'TAX_KDV',
      sourceDocumentType: 'FATURA',
      amount: 180,
    } as any)).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.case.findFirst).not.toHaveBeenCalled();
    expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
  });

  it.each([
    ['source-less', {}],
    ['CASE_DOCUMENT adayi', { sourceDocumentId: 'doc-1', sourceDocumentType: 'DIGER' }],
  ])('%s human create talebini authorization sonrasinda deterministic fail-closed durdurur', async (_name, source) => {
    const { svc, prisma, tx, officeApproval, writerRouter, domainEventIngest } = makeSvc();

    await expect(svc.createFromUser('t1', 'requester-u', {
      caseId: 'case-1',
      itemType: 'PRINCIPAL',
      amount: 180,
      ...source,
    } as any)).rejects.toMatchObject({
      response: {
        code: 'FORMATION_CONTEXT_REQUIRED',
        message: 'Complete claim formation context is required.',
      },
      status: 400,
    });

    expect(prisma.case.findFirst).toHaveBeenCalledWith({
      where: { id: 'case-1', tenantId: 't1' },
      select: { id: true },
    });
    expect(writerRouter.evaluateHuman).toHaveBeenCalledTimes(1);
    expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
    expect(prisma.claimItem.create).not.toHaveBeenCalled();
    expect(prisma.claimItem.update).not.toHaveBeenCalled();
    expect(tx.claimItem.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(domainEventIngest.appendInTransaction).not.toHaveBeenCalled();
  });

  it('identical human create retry ayni deterministic error contractini uretir', async () => {
    const { svc, officeApproval } = makeSvc();
    const command = {
      caseId: 'case-1',
      itemType: 'PRINCIPAL',
      amount: 180,
    } as any;

    const responses: unknown[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await svc.createFromUser('t1', 'requester-u', command);
      } catch (error) {
        responses.push((error as BadRequestException).getResponse());
      }
    }

    expect(responses).toEqual([
      { code: 'FORMATION_CONTEXT_REQUIRED', message: 'Complete claim formation context is required.' },
      { code: 'FORMATION_CONTEXT_REQUIRED', message: 'Complete claim formation context is required.' },
    ]);
    expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
  });

  it('unauthorized human create mevcut permission sonucunu formation guard oncesinde korur', async () => {
    const { svc, officeApproval, writerRouter } = makeSvc({ gateDenied: true });

    await expect(svc.createFromUser('t1', 'requester-u', {
      caseId: 'case-1',
      itemType: 'PRINCIPAL',
      amount: 180,
    } as any)).rejects.toBeInstanceOf(ForbiddenException);

    expect(writerRouter.evaluateHuman).toHaveBeenCalledTimes(1);
    expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
  });

  it('missing veya cross-tenant case mevcut not-found contractini formation guard oncesinde korur', async () => {
    const { svc, prisma, officeApproval, writerRouter } = makeSvc();
    prisma.case.findFirst.mockResolvedValueOnce(null);

    await expect(svc.createFromUser('t1', 'requester-u', {
      caseId: 'foreign-case',
      itemType: 'PRINCIPAL',
      amount: 180,
    } as any)).rejects.toBeInstanceOf(NotFoundException);

    expect(writerRouter.evaluateHuman).not.toHaveBeenCalled();
    expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
  });

  it.each([
    ['add-expense', (controller: ClaimItemController) => controller.addExpense(
      't1', 'requester-u', 'case-1', { amount: 10, description: 'Masraf' },
    )],
    ['add-fee', (controller: ClaimItemController) => controller.addFee(
      't1', 'requester-u', 'case-1', { amount: 20, description: 'Harc' },
    )],
    ['add-attorney-fee', (controller: ClaimItemController) => controller.addAttorneyFee(
      't1', 'requester-u', 'case-1', { amount: 30 },
    )],
  ])('%s convenience route ortak containment boundarysinde write uretmez', async (_name, invoke) => {
    const { svc, prisma, tx, officeApproval, writerRouter, domainEventIngest } = makeSvc();
    const controller = new ClaimItemController(svc);

    await expect(invoke(controller)).rejects.toMatchObject({
      response: {
        code: 'FORMATION_CONTEXT_REQUIRED',
        message: 'Complete claim formation context is required.',
      },
      status: 400,
    });

    expect(writerRouter.evaluateHuman).toHaveBeenCalledTimes(1);
    expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
    expect(prisma.claimItem.create).not.toHaveBeenCalled();
    expect(prisma.claimItem.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(domainEventIngest.appendInTransaction).not.toHaveBeenCalled();
  });

  it('metadata edit capability sahibi aktorce transaction icinde uygulanir ve immutable audit yazar', async () => {
    const { svc, tx, domainEventIngest } = makeSvc();

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
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CLAIM_ITEM_METADATA_UPDATED',
        entityType: 'ClaimItem',
        entityId: 'ci-1',
        userId: 'u1',
        metadata: expect.objectContaining({
          source: 'USER_DIRECT_METADATA_EDIT',
          approvalRequired: false,
        }),
      }),
    });
    expect(domainEventIngest.appendInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        header: expect.objectContaining({
          aggregateType: 'Case',
          aggregateId: 'case-1',
          eventType: 'CLAIM_ITEM_UPDATED',
          actor: { type: 'HUMAN', userId: 'u1' },
        }),
        payload: expect.objectContaining({ claimItemId: 'ci-1', operation: 'UPDATE' }),
      }),
    );
  });

  it('metadata edit capability yoksa reddedilir', async () => {
    const { svc, tx } = makeSvc({ gateDenied: true });

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

  it('rich code high-impact olur ve variable rate null-normalize edilir', async () => {
    const { svc, officeApproval } = makeSvc();

    await svc.updateFromUser('t1', 'requester-u', 'ci-1', {
      interestTypeCode: 'COMMERCIAL_AVANS_3095_2_2',
      interestRate: 99,
    } as any);

    expect(officeApproval.createPendingRequest).toHaveBeenCalledWith(expect.objectContaining({
      savedIntent: expect.objectContaining({
        proposedPatch: expect.objectContaining({
          interestTypeCode: 'COMMERCIAL_AVANS_3095_2_2',
          interestType: 'TICARI',
          interestRate: null,
        }),
      }),
    }));
  });

  it('explicit NO_INTEREST actorunu authenticated requesterdan turetir', async () => {
    const { svc, officeApproval } = makeSvc();

    await svc.updateFromUser('t1', 'requester-u', 'ci-1', {
      interestAccrualStatus: 'NO_INTEREST',
      noInterestReason: '  sözleşmede faiz yok  ',
    } as any);

    expect(officeApproval.createPendingRequest).toHaveBeenCalledWith(expect.objectContaining({
      requesterUserId: 'requester-u',
      savedIntent: expect.objectContaining({
        proposedPatch: expect.objectContaining({
          interestTypeCode: null,
          interestType: null,
          interestRate: null,
          interestAccrualStatus: 'NO_INTEREST',
          noInterestReason: 'sözleşmede faiz yok',
          noInterestConfirmedById: 'requester-u',
        }),
      }),
    }));
  });

  it('FATURA PRINCIPAL -> TAX_KDV high-impact gecisini approval olusturmadan reddeder', async () => {
    const { svc, officeApproval } = makeSvc({
      item: { ...baseItem, sourceDocumentType: 'FATURA' },
    });

    await expect(
      svc.updateFromUser('t1', 'requester-u', 'ci-1', { itemType: 'TAX_KDV' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
  });

  it.each(['PRINCIPAL', 'FEE', 'EXPENSE', 'ATTORNEY_FEE'])(
    '%s -> OTHER update admission talebini approval ve write oncesi reddeder',
    async (currentType) => {
      const { svc, prisma, tx, officeApproval, writerRouter, domainEventIngest } = makeSvc({
        item: { ...baseItem, itemType: currentType },
      });

      await expect(
        svc.updateFromUser('t1', 'requester-u', 'ci-1', { itemType: 'OTHER' } as any),
      ).rejects.toMatchObject({
        response: {
          code: 'UNSUPPORTED_COMPONENT',
          message: 'Claim component is not supported.',
        },
      });

      expect(writerRouter.evaluateHuman).not.toHaveBeenCalled();
      expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
      expect(prisma.claimItem.update).not.toHaveBeenCalled();
      expect(tx.claimItem.update).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
      expect(domainEventIngest.appendInTransaction).not.toHaveBeenCalled();
    },
  );

  it.each([null, '', '   ', '___UNKNOWN___'])(
    'runtime invalid itemType %p update admission talebini fail-closed reddeder',
    async (itemType) => {
      const { svc, prisma, tx, officeApproval, writerRouter, domainEventIngest } = makeSvc();

      await expect(
        svc.updateFromUser('t1', 'requester-u', 'ci-1', { itemType } as any),
      ).rejects.toMatchObject({
        response: {
          code: 'UNSUPPORTED_COMPONENT',
          message: 'Claim component is not supported.',
        },
      });

      expect(writerRouter.evaluateHuman).not.toHaveBeenCalled();
      expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
      expect(prisma.claimItem.update).not.toHaveBeenCalled();
      expect(tx.claimItem.update).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
      expect(domainEventIngest.appendInTransaction).not.toHaveBeenCalled();
    },
  );

  it('legacy OTHER kaydinda itemType disi metadata editini korur', async () => {
    const { svc, tx } = makeSvc({
      item: { ...baseItem, itemType: 'OTHER' },
    });

    await expect(
      svc.updateFromUser('t1', 'u1', 'ci-1', { description: 'new' } as any),
    ).resolves.toMatchObject({ applied: true, approvalRequired: false });

    expect(tx.claimItem.update).toHaveBeenCalledWith({
      where: { id: 'ci-1' },
      data: { description: 'new' },
    });
  });

  it('legacy OTHER kaydinin itemType reclassification talebini fail-closed reddeder', async () => {
    const { svc, prisma, tx, officeApproval, writerRouter, domainEventIngest } = makeSvc({
      item: { ...baseItem, itemType: 'OTHER' },
    });

    await expect(
      svc.updateFromUser('t1', 'requester-u', 'ci-1', { itemType: 'PRINCIPAL' } as any),
    ).rejects.toMatchObject({
      response: {
        code: 'UNSUPPORTED_COMPONENT',
        message: 'Claim component is not supported.',
      },
    });

    expect(writerRouter.evaluateHuman).not.toHaveBeenCalled();
    expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
    expect(prisma.claimItem.update).not.toHaveBeenCalled();
    expect(tx.claimItem.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(domainEventIngest.appendInTransaction).not.toHaveBeenCalled();
  });

  it('tarihsel FATURA + TAX_KDV kaydinin normal metadata editini engellemez', async () => {
    const { svc, tx } = makeSvc({
      item: { ...baseItem, itemType: 'TAX_KDV', sourceDocumentType: 'FATURA' },
    });

    await expect(
      svc.updateFromUser('t1', 'u1', 'ci-1', { description: 'new' } as any),
    ).resolves.toMatchObject({ applied: true, approvalRequired: false });

    expect(tx.claimItem.update).toHaveBeenCalledWith({
      where: { id: 'ci-1' },
      data: { description: 'new' },
    });
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

  it('system/internal update yolu OTHER admission talebini write oncesi reddeder', async () => {
    const { svc, prisma, officeApproval } = makeSvc();

    await expect(
      svc.update('t1', 'ci-1', { itemType: 'OTHER' } as any),
    ).rejects.toMatchObject({
      response: {
        code: 'UNSUPPORTED_COMPONENT',
        message: 'Claim component is not supported.',
      },
    });

    expect(prisma.claimItem.update).not.toHaveBeenCalled();
    expect(officeApproval.createPendingRequest).not.toHaveBeenCalled();
  });
});
