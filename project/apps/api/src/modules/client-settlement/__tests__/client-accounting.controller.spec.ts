import { ClientAccountingController } from '../client-accounting.controller';

function summary() {
  return {
    clientId: 'client-1',
    currency: 'TRY',
    clientScoped: {
      payableNet: '0',
      paidToClient: '0',
      expenseRequested: '0',
      expensePaid: '0',
      expenseUnpaid: '0',
      offsetApplied: '0',
      offsettableNetPosition: '0',
    },
    caseScopedContext: {
      debtorCollection: '0',
      pendingDistribution: '0',
      advanceBalance: '0',
    },
    needsReview: false,
    caseBreakdown: [],
  };
}

describe('ClientAccountingController', () => {
  it('routes summary through the fallback-safe summary read service and preserves response shape', async () => {
    const readService = { listClientCases: jest.fn() };
    const summaryReadService = { getClientAccountingSummary: jest.fn().mockResolvedValue(summary()) };
    const movementsReadService = { getClientAccountingMovements: jest.fn() };
    const controller = new ClientAccountingController(readService as any, summaryReadService as any, movementsReadService as any);

    const out = await controller.summary({ user: { id: 'user-1', tenantId: 'tenant-1' } }, 'client-1', 'USD');

    expect(out).toEqual({ data: summary() });
    expect(summaryReadService.getClientAccountingSummary).toHaveBeenCalledWith('tenant-1', 'client-1', 'USD');
    expect(movementsReadService.getClientAccountingMovements).not.toHaveBeenCalled();
  });
});