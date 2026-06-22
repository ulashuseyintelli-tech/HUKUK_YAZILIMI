/**
 * G3a — SummaryEngineService.allocatePaymentToLedgerInTx unit testleri.
 *
 * tx-aware kanonik ledger yazımı:
 *  - LEDGER_DISABLED → yazma yok
 *  - NO_CLAIM_ITEMS (S5(i)) → ledger YAZILMAZ, diagnostic döner
 *  - ClaimItem var → LedgerEntry+LedgerAllocation + collectedAmount güncelle
 */

import { SummaryEngineService } from '../summary-engine.service';

function buildService(opts: { enabled?: boolean; allocator?: any } = {}) {
  const svc = new SummaryEngineService({} as any, opts.allocator);
  // onModuleInit/YAML'a bağımlı olmadan kuralları doğrudan ver.
  (svc as any).rules = { ledger_allocation: { enabled: opts.enabled ?? true } };
  return svc;
}

function mockTx(claimItems: any[]) {
  return {
    case: { findFirst: jest.fn(async () => ({ id: 'c1', currency: 'TRY', claimItems })) },
    ledgerEntry: {
      create: jest.fn(async ({ data }: any) => ({ id: 'le1', allocations: data.allocations?.create ?? [] })),
    },
    claimItem: { update: jest.fn(async () => ({})) },
  } as any;
}

describe('SummaryEngineService.allocatePaymentToLedgerInTx (G3a)', () => {
  it('LEDGER_DISABLED → hiçbir yazma/okuma yapmaz', async () => {
    const svc = buildService({ enabled: false });
    const tx = mockTx([]);
    const r = await svc.allocatePaymentToLedgerInTx(tx, 't1', 'c1', 1000, { collectionId: 'col1' });
    expect(r.allocated).toBe(false);
    expect(r.reason).toBe('LEDGER_DISABLED');
    expect(tx.case.findFirst).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('NO_CLAIM_ITEMS (S5(i)) → ledger YAZILMAZ, diagnostic döner', async () => {
    const svc = buildService({ enabled: true });
    const tx = mockTx([]); // ACTIVE ClaimItem yok
    const r = await svc.allocatePaymentToLedgerInTx(tx, 't1', 'c1', 1000, { collectionId: 'col1' });
    expect(r.allocated).toBe(false);
    expect(r.reason).toBe('NO_CLAIM_ITEMS');
    expect(r.ledgerEntry).toBeNull();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(tx.claimItem.update).not.toHaveBeenCalled();
  });

  it('ClaimItem var → LedgerEntry+allocation yazılır, collectedAmount güncellenir', async () => {
    const allocator = {
      allocate: (amount: number) => ({ allocations: [{ category: 'PRINCIPAL', amountAllocated: amount }] }),
    };
    const svc = buildService({ enabled: true, allocator });
    const tx = mockTx([{ id: 'ci1', itemType: 'PRINCIPAL', demandedAmount: 1000, collectedAmount: 0, amount: 1000 }]);

    const r = await svc.allocatePaymentToLedgerInTx(tx, 't1', 'c1', 1000, { collectionId: 'col1' });

    expect(r.allocated).toBe(true);
    expect(tx.ledgerEntry.create).toHaveBeenCalledTimes(1);
    const data = (tx.ledgerEntry.create as jest.Mock).mock.calls[0][0].data;
    expect(data.entryType).toBe('PAYMENT');
    expect(data.collectionId).toBe('col1');
    expect(data.allocations.create[0].claimItemId).toBe('ci1');
    expect(data.allocations.create[0].amount).toBe(1000);
    expect(tx.claimItem.update).toHaveBeenCalledWith({
      where: { id: 'ci1' },
      data: { collectedAmount: { increment: 1000 } },
    });
  });
});
