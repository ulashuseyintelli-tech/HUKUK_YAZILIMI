import { CaseService } from '../case.service';

const stub = {} as any;

function caseRecord() {
  return {
    id: 'case-1',
    clientId: null,
    principalAmount: 1000,
    debtors: [],
    lawyers: [],
    lifecycleEvents: [],
    collections: [],
    expenseRequests: [],
    _count: { tasks: 0 },
  };
}

describe('CaseService.findAll ClaimItem total authority', () => {
  it('keeps demanded total zero when ClaimItems exist', async () => {
    const prisma: any = {
      case: {
        findMany: jest.fn().mockResolvedValue([caseRecord()]),
        count: jest.fn().mockResolvedValue(1),
      },
      collection: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
      expenseRequest: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: null, paidAmount: null } }),
      },
      claimItem: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { demandedAmount: 0 }, _count: 1 }),
      },
    };
    const service = new CaseService(prisma, stub, stub, stub, stub, stub, stub, stub, stub, stub);

    const result = await service.findAll('t1');

    expect(result.data[0].totalClaim).toBe(0);
    expect(prisma.claimItem.aggregate).toHaveBeenCalledWith({
      where: { caseId: 'case-1' },
      _sum: { demandedAmount: true },
      _count: true,
    });
  });

  it('uses legacy principal only when no ClaimItem exists', async () => {
    const prisma: any = {
      case: {
        findMany: jest.fn().mockResolvedValue([caseRecord()]),
        count: jest.fn().mockResolvedValue(1),
      },
      collection: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
      expenseRequest: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: null, paidAmount: null } }),
      },
      claimItem: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { demandedAmount: null }, _count: 0 }),
      },
    };
    const service = new CaseService(prisma, stub, stub, stub, stub, stub, stub, stub, stub, stub);

    const result = await service.findAll('t1');

    expect(result.data[0].totalClaim).toBe(1000);
  });
});
