import { SummaryEngineService } from '../summary-engine.service';

function makeService(item: any = {
  id: 'ci-1',
  tenantId: 't1',
  originalAmount: 1000,
  demandedAmount: 1000,
  collectedAmount: 0,
  amount: 1000,
}) {
  const prisma: any = {
    claimItem: {
      findFirst: jest.fn().mockResolvedValue(item),
      update: jest.fn(),
    },
  };
  const claimItemService = {
    updateFromUser: jest.fn().mockResolvedValue({
      applied: false,
      approvalRequired: true,
      approvalRequestId: 'approval-1',
    }),
  };
  return {
    service: new SummaryEngineService(prisma, undefined, claimItemService as any),
    prisma,
    claimItemService,
  };
}

describe('SummaryEngine demanded amount approval gate', () => {
  it('routes demandedAmount=0 to existing high-impact approval without direct write', async () => {
    const { service, prisma, claimItemService } = makeService();

    await expect(service.updateDemandedAmount('t1', 'actor-1', 'ci-1', 0)).resolves.toMatchObject({
      applied: false,
      approvalRequired: true,
    });

    expect(prisma.claimItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'ci-1', tenantId: 't1' },
    });
    expect(prisma.claimItem.update).not.toHaveBeenCalled();
    expect(claimItemService.updateFromUser).toHaveBeenCalledWith(
      't1',
      'actor-1',
      'ci-1',
      { amount: 0 },
    );
  });

  it('fails tenant isolation before requesting approval', async () => {
    const { service, claimItemService } = makeService(null);

    await expect(service.updateDemandedAmount('foreign', 'actor-1', 'ci-1', 10))
      .rejects.toThrow('Alacak kalemi bulunamadı');
    expect(claimItemService.updateFromUser).not.toHaveBeenCalled();
  });

  it('keeps explicit canonical zero instead of legacy amount fallback', () => {
    const { service } = makeService();

    expect((service as any).amountOrLegacy(0, 1000)).toBe(0);
    expect((service as any).amountOrLegacy(null, 1000)).toBe(1000);
  });
});
