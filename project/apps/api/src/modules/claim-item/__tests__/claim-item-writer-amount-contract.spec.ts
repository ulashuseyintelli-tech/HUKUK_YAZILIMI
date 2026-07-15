import { BadRequestException } from '@nestjs/common';
import { ClaimItemService } from '../claim-item.service';

function makeWriterService(generatedItems: any[] = []) {
  const claimItem = {
    create: jest.fn(async ({ data }: any) => ({ id: 'ci-created', ...data })),
  };
  const prisma: any = {
    case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
    claimItem,
  };
  const claimEngine = {
    generateClaimItems: jest.fn().mockReturnValue(generatedItems),
  };
  const writerRouter = {
    createSystemClaimItem: jest.fn(async ({ data }: any) => claimItem.create({ data })),
  };
  return {
    service: new ClaimItemService(
      prisma, claimEngine as any, undefined, undefined, writerRouter as any,
    ),
    claimItem,
  };
}

describe('ClaimItem writer three-amount contract', () => {
  it('internal explicit create rejects invoice-derived TAX_KDV before write', async () => {
    const { service, claimItem } = makeWriterService();

    await expect(service.create('t1', {
      caseId: 'case-1',
      itemType: 'TAX_KDV',
      sourceDocumentType: 'FATURA',
      amount: 180,
    } as any)).rejects.toBeInstanceOf(BadRequestException);

    expect(claimItem.create).not.toHaveBeenCalled();
  });

  it('internal explicit create preserves non-invoice TAX_KDV', async () => {
    const { service, claimItem } = makeWriterService();

    await service.create('t1', {
      caseId: 'case-1',
      itemType: 'TAX_KDV',
      sourceDocumentType: 'DIGER',
      amount: 180,
    } as any);

    expect(claimItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        itemType: 'TAX_KDV',
        sourceDocumentType: 'DIGER',
        originalAmount: 180,
        demandedAmount: 180,
        amount: 180,
      }),
    }));
  });

  it('internal create initializes all three fields and preserves zero', async () => {
    const { service, claimItem } = makeWriterService();

    await service.create('t1', {
      caseId: 'case-1',
      itemType: 'PRINCIPAL',
      amount: 0,
    } as any);

    expect(claimItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ originalAmount: 0, demandedAmount: 0, amount: 0 }),
    }));
  });

  it('rule generator initializes all three fields and preserves required zero item', async () => {
    const { service, claimItem } = makeWriterService([{
      type: 'PRINCIPAL',
      amount: 0,
      required: true,
      label: 'Asıl alacak',
    }]);

    await service.generateFromRuleEngine('t1', 'requester-1', 'case-1', 'SUB', {}, {});

    expect(claimItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ originalAmount: 0, demandedAmount: 0, amount: 0 }),
    });
  });

  it.each([
    ['addExpenseItem', ['t1', 'case-1', 0, 'Masraf']],
    ['addFeeItem', ['t1', 'case-1', 0, 'Harç']],
    ['addAttorneyFeeItem', ['t1', 'case-1', 0, 'Vekalet']],
  ])('%s retained helper initializes all three fields', async (method, args) => {
    const { service, claimItem } = makeWriterService();

    await (service as any)[method](...args);

    expect(claimItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ originalAmount: 0, demandedAmount: 0, amount: 0 }),
    });
  });
});
