import { NotFoundException } from '@nestjs/common';
import { CaseService } from '../case.service';

function buildService(prisma: any) {
  const stub = {} as any;
  return new CaseService(prisma, stub, stub, stub, stub, stub, stub, stub, stub, stub);
}

describe('CaseService.create() debtor ownership guard', () => {
  let prisma: any;
  let service: CaseService;

  beforeEach(() => {
    prisma = {
      debtor: { findMany: jest.fn() },
      debtorAddress: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    service = buildService(prisma);
  });

  it('POST /cases caseDebtors içindeki foreign-tenant debtorId değerini reddeder', async () => {
    prisma.debtor.findMany.mockResolvedValue([]);

    await expect(
      service.create('tenant-1', { caseDebtors: [{ debtorId: 'foreign-debtor' }] } as any, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.debtor.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['foreign-debtor'] }, tenantId: 'tenant-1' },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('POST /cases selectedAddressId aynı debtor’a ait değilse reddeder', async () => {
    prisma.debtor.findMany.mockResolvedValue([{ id: 'debtor-1' }]);
    prisma.debtorAddress.findMany.mockResolvedValue([{ id: 'addr-foreign', debtorId: 'debtor-2' }]);

    await expect(
      service.create(
        'tenant-1',
        { caseDebtors: [{ debtorId: 'debtor-1', selectedAddressId: 'addr-foreign' }] } as any,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.debtorAddress.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['addr-foreign'] } },
      select: { id: true, debtorId: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('POST /cases legacy debtors[].id yolunda foreign-tenant debtorId değerini reddeder', async () => {
    prisma.debtor.findMany.mockResolvedValue([]);

    await expect(
      service.create('tenant-1', { debtors: [{ id: 'foreign-legacy-debtor', name: 'Borçlu' }] } as any, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.debtor.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['foreign-legacy-debtor'] }, tenantId: 'tenant-1' },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
