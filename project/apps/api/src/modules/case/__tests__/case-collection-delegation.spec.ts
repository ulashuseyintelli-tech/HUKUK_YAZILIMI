/**
 * G3d — CaseService tahsilat create/cancel → CollectionService delegasyonu.
 *
 * /cases/:id/collections artık kanonik yola delege eder (event+ledger+guard).
 */

import { CaseService } from '../case.service';

function buildService(coll: any) {
  // CaseService deps sırası: prisma, audit, clientInfo, interestEngine, expenseRequest,
  // domainEventIngest, collectionService.
  return new CaseService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    coll,
  );
}

describe('CaseService collection delegation (G3d)', () => {
  it('T1: createCollection → collectionService.create(tenantId, dto, userId)', async () => {
    const coll = { create: jest.fn(async () => ({ id: 'col1' })), cancel: jest.fn() };
    const svc = buildService(coll);

    await svc.createCollection(
      't1',
      'c1',
      {
        caseDebtorId: 'd1',
        amount: 1000,
        currency: 'TRY',
        type: 'CASH',
        channel: 'BANKA',
        date: '2026-01-01',
        description: 'x',
      } as any,
      'u1',
    );

    expect(coll.create).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        caseId: 'c1',
        caseDebtorId: 'd1',
        amount: 1000,
        type: 'CASH',
        channel: 'BANKA',
        date: '2026-01-01',
      }),
      'u1',
    );
  });

  it('T4: cancelCollection → collectionService.cancel(tenantId, collectionId, {cancelReason})', async () => {
    const coll = { create: jest.fn(), cancel: jest.fn(async () => ({ id: 'col1' })) };
    const svc = buildService(coll);

    await svc.cancelCollection('t1', 'c1', 'col1', 'iptal nedeni');

    expect(coll.cancel).toHaveBeenCalledWith('t1', 'col1', { cancelReason: 'iptal nedeni' });
  });
});
