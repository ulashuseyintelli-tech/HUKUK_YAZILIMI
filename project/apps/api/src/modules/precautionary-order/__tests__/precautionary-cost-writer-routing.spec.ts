import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
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
      auditLog: {
        create: jest.fn(),
      },
      domainEvent: {
        create: jest.fn(),
      },
      outboxEvent: {
        create: jest.fn(),
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
      prisma,
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

  async function expectUnsupportedComponent(promise: Promise<unknown>) {
    try {
      await promise;
      throw new Error('Expected UNSUPPORTED_COMPONENT');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        code: 'UNSUPPORTED_COMPONENT',
        message: 'Precautionary cost component is not supported.',
      });
    }
  }

  function expectNoBusinessWrites(surface: ReturnType<typeof setup>) {
    expect(surface.prisma.precautionaryOrder.findFirst).not.toHaveBeenCalled();
    expect(surface.prisma.$transaction).not.toHaveBeenCalled();
    expect(surface.tx.precautionaryCost.count).not.toHaveBeenCalled();
    expect(surface.tx.precautionaryCost.create).not.toHaveBeenCalled();
    expect(surface.tx.precautionaryCost.update).not.toHaveBeenCalled();
    expect(surface.writerRouter.createSystemClaimItem).not.toHaveBeenCalled();
    expect(surface.tx.claimItem.create).not.toHaveBeenCalled();
    expect(surface.tx.auditLog.create).not.toHaveBeenCalled();
    expect(surface.tx.domainEvent.create).not.toHaveBeenCalled();
    expect(surface.tx.outboxEvent.create).not.toHaveBeenCalled();
  }

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

  it.each([
    ['DIGER', 'DIGER'],
    ['unknown', 'UNKNOWN_RUNTIME_VALUE'],
    ['null', null],
    ['undefined', undefined],
    ['blank', ''],
    ['whitespace', '   '],
  ])('rejects claimed %s before lookup, transaction, or any writer', async (_label, costType) => {
    const surface = setup();

    await expectUnsupportedComponent(
      surface.service.addCost('tenant-1', {
        ...dto,
        costType,
        isClaimedInEnforcement: true,
      } as any, 'requester-1'),
    );

    expectNoBusinessWrites(surface);
  });

  it('treats an omitted claim flag as claimed and rejects DIGER before any writer', async () => {
    const surface = setup();

    await expectUnsupportedComponent(
      surface.service.addCost('tenant-1', {
        ...dto,
        costType: 'DIGER',
      }, 'requester-1'),
    );

    expectNoBusinessWrites(surface);
  });

  it('returns the same deterministic error for repeated invalid claimed cost admission', async () => {
    const first = setup();
    const second = setup();
    const request = {
      ...dto,
      costType: 'DIGER',
      isClaimedInEnforcement: true,
    } as any;

    await expectUnsupportedComponent(first.service.addCost('tenant-1', request, 'requester-1'));
    await expectUnsupportedComponent(second.service.addCost('tenant-1', request, 'requester-1'));

    expectNoBusinessWrites(first);
    expectNoBusinessWrites(second);
  });

  it.each([
    ['HARC', 'FEE'],
    ['POSTA', 'EXPENSE'],
    ['VEKALET', 'ATTORNEY_FEE'],
    ['TEMINAT', 'EXPENSE'],
    ['YEDIEMIN', 'EXPENSE'],
    ['BILIRKISI', 'EXPENSE'],
    ['MUHAFAZA', 'EXPENSE'],
  ] as const)('preserves the claimed %s to %s mapping', async (costType, itemType) => {
    const surface = setup();

    await surface.service.addCost('tenant-1', {
      ...dto,
      costType,
      isClaimedInEnforcement: true,
    }, 'requester-1');

    expect(surface.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(surface.writerRouter.createSystemClaimItem).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ itemType }),
      }),
      surface.tx,
    );
  });

  it('preserves non-claimed DIGER as an operational cost without ClaimItem routing', async () => {
    const surface = setup();

    await surface.service.addCost('tenant-1', {
      ...dto,
      costType: 'DIGER',
      isClaimedInEnforcement: false,
    }, 'requester-1');

    expect(surface.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(surface.tx.precautionaryCost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        costType: 'DIGER',
        isClaimedInEnforcement: false,
      }),
    });
    expect(surface.writerRouter.createSystemClaimItem).not.toHaveBeenCalled();
    expect(surface.tx.claimItem.create).not.toHaveBeenCalled();
    expect(surface.tx.precautionaryCost.update).not.toHaveBeenCalled();
  });

  it('keeps claimed-cost validation before transaction and contains no OTHER fallback', () => {
    const source = readFileSync(
      join(__dirname, '..', 'precautionary-order.service.ts'),
      'utf8',
    );
    const addCostStart = source.indexOf('async addCost(');
    const updateCostStart = source.indexOf('async updateCost(', addCostStart);
    const addCostSource = source.slice(addCostStart, updateCostStart);
    const mappingStart = source.indexOf('private mapCostTypeToClaimItemType(');
    const mappingSource = source.slice(mappingStart);

    expect(addCostStart).toBeGreaterThanOrEqual(0);
    expect(updateCostStart).toBeGreaterThan(addCostStart);
    expect(addCostSource.indexOf('this.assertSupportedClaimedCostType'))
      .toBeLessThan(addCostSource.indexOf('this.prisma.$transaction'));
    expect(mappingSource).not.toMatch(/DIGER\s*:\s*['"]OTHER['"]/);
    expect(mappingSource).not.toMatch(/(?:\|\||\?\?)\s*['"]OTHER['"]/);
    expect(mappingSource).not.toMatch(/default[\s\S]*?['"](?:OTHER|PRINCIPAL)['"]/);
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
