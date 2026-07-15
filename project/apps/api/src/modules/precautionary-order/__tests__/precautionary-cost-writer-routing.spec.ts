import { ForbiddenException } from '@nestjs/common';
import { PrecautionaryOrderService } from '../precautionary-order.service';

describe('RCV-P2-WS01-P03 precautionary cost ClaimItem routing', () => {
  function setup(denied = false) {
    const tx: any = {
      precautionaryCost: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'cost-1', amount: 100 }),
        update: jest.fn().mockResolvedValue({ id: 'cost-1', claimItemId: 'claim-1' }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'cost-1',
          tenantId: 'tenant-1',
          claimItemId: 'claim-1',
          currency: 'TRY',
          precautionaryOrder: {
            id: 'order-1',
            tenantId: 'tenant-1',
            caseId: 'case-1',
          },
        }),
        delete: jest.fn().mockResolvedValue({ id: 'cost-1' }),
      },
      claimItem: {
        create: jest.fn().mockResolvedValue({ id: 'claim-1' }),
      },
    };
    const prisma: any = {
      precautionaryOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'order-1',
          tenantId: 'tenant-1',
          caseId: 'case-1',
        }),
      },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const writerRouter: any = {
      createSystemClaimItem: jest.fn(async ({ data }: any, database: any) => {
        if (denied) throw new ForbiddenException('route denied');
        return database.claimItem.create({ data });
      }),
      cancelSystemClaimItem: jest.fn().mockResolvedValue({
        id: 'claim-1',
        status: 'CANCELLED',
      }),
    };
    return {
      service: new PrecautionaryOrderService(prisma, writerRouter),
      tx,
      writerRouter,
    };
  }

  const dto = {
    precautionaryOrderId: 'order-1',
    costType: 'HARC' as const,
    amount: 100,
    currency: 'TRY',
  };

  it('classifies the writer and routes the ClaimItem create in the same transaction', async () => {
    const { service, tx, writerRouter } = setup();

    await service.addCost('tenant-1', dto, 'requester-1');

    expect(writerRouter.createSystemClaimItem).toHaveBeenCalledWith(
      expect.objectContaining({
        route: 'PRECAUTIONARY_COST_WRITER',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        sourceId: 'cost-1',
        initiatedByUserId: 'requester-1',
      }),
      tx,
    );
    expect(tx.precautionaryCost.update).toHaveBeenCalledWith({
      where: { id: 'cost-1' },
      data: { claimItemId: 'claim-1' },
    });
  });

  it('does not link the cost when the routed authorization is denied', async () => {
    const { service, tx } = setup(true);

    await expect(service.addCost('tenant-1', dto, 'requester-1'))
      .rejects.toBeInstanceOf(ForbiddenException);

    expect(tx.claimItem.create).not.toHaveBeenCalled();
    expect(tx.precautionaryCost.update).not.toHaveBeenCalled();
  });

  it('delete, ClaimItem hard-delete yerine aynı tx içinde retained-tombstone cancel uygular', async () => {
    const { service, tx, writerRouter } = setup();

    await service.deleteCost('tenant-1', 'cost-1', 'requester-1');

    expect(writerRouter.cancelSystemClaimItem).toHaveBeenCalledWith(
      {
        route: 'PRECAUTIONARY_COST_WRITER',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        sourceId: 'cost-1',
        initiatedByUserId: 'requester-1',
        claimItemId: 'claim-1',
        currency: 'TRY',
      },
      tx,
    );
    expect(tx.precautionaryCost.delete).toHaveBeenCalledWith({
      where: { id: 'cost-1' },
    });
  });
});
