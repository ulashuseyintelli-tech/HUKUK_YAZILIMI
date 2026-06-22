/**
 * G3a — SummaryEngineService.allocatePaymentToLedgerInTx unit testleri.
 *
 * tx-aware kanonik ledger yazımı:
 *  - LEDGER_DISABLED → yazma yok
 *  - NO_CLAIM_ITEMS (S5(i)) → ledger YAZILMAZ, diagnostic döner
 *  - ClaimItem var → LedgerEntry+LedgerAllocation + collectedAmount güncelle
 */

import { SummaryEngineService } from '../summary-engine.service';
import { TBK100AllocatorService } from '../../interest-engine/allocation/tbk100-allocator.service';

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

const sumAmounts = (rows: Array<{ amount: number }>) =>
  rows.reduce((sum, row) => sum + Number(row.amount), 0);

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

  it('kısmi ödeme → yalnız allocate edilen tutar kadar LedgerAllocation ve collectedAmount increment üretir', async () => {
    const svc = buildService({ enabled: true, allocator: new TBK100AllocatorService() });
    const tx = mockTx([
      {
        id: 'ci-principal',
        itemType: 'PRINCIPAL',
        demandedAmount: 1000,
        collectedAmount: 0,
        amount: 1000,
      },
    ]);

    const r = await svc.allocatePaymentToLedgerInTx(tx, 'tenant-1', 'case-partial', 400, {
      collectionId: 'col-partial',
    });

    expect(r.allocated).toBe(true);
    expect(tx.case.findFirst).toHaveBeenCalledWith({
      where: { id: 'case-partial', tenantId: 'tenant-1' },
      include: {
        claimItems: {
          where: { status: 'ACTIVE' },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    const data = (tx.ledgerEntry.create as jest.Mock).mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: 'tenant-1',
      caseId: 'case-partial',
      collectionId: 'col-partial',
      entryType: 'PAYMENT',
      amount: 400,
    });
    expect(data.allocations.create).toEqual([
      { claimItemId: 'ci-principal', amount: 400, allocationOrder: 1 },
    ]);
    expect(sumAmounts(data.allocations.create)).toBe(400);
    expect(tx.claimItem.update).toHaveBeenCalledTimes(1);
    expect(tx.claimItem.update).toHaveBeenCalledWith({
      where: { id: 'ci-principal' },
      data: { collectedAmount: { increment: 400 } },
    });
  });

  it('multi ClaimItem → TBK100 sırası ile per-ClaimItem increment üretir', async () => {
    const svc = buildService({ enabled: true, allocator: new TBK100AllocatorService() });
    const tx = mockTx([
      { id: 'ci-fee', itemType: 'FEE', demandedAmount: 100, collectedAmount: 0, amount: 100 },
      { id: 'ci-attorney', itemType: 'ATTORNEY_FEE', demandedAmount: 200, collectedAmount: 0, amount: 200 },
      { id: 'ci-interest', itemType: 'INTEREST', demandedAmount: 300, collectedAmount: 0, amount: 300 },
      { id: 'ci-principal', itemType: 'PRINCIPAL', demandedAmount: 1000, collectedAmount: 0, amount: 1000 },
    ]);

    const r = await svc.allocatePaymentToLedgerInTx(tx, 'tenant-1', 'case-matrix', 750, {
      collectionId: 'col-matrix',
    });

    expect(r.allocated).toBe(true);
    const data = (tx.ledgerEntry.create as jest.Mock).mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: 'tenant-1',
      caseId: 'case-matrix',
      collectionId: 'col-matrix',
      entryType: 'PAYMENT',
      amount: 750,
    });
    expect(data.allocations.create).toEqual([
      { claimItemId: 'ci-fee', amount: 100, allocationOrder: 1 },
      { claimItemId: 'ci-attorney', amount: 200, allocationOrder: 2 },
      { claimItemId: 'ci-interest', amount: 300, allocationOrder: 3 },
      { claimItemId: 'ci-principal', amount: 150, allocationOrder: 4 },
    ]);
    expect(sumAmounts(data.allocations.create)).toBe(750);
    expect(tx.claimItem.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'ci-fee' },
      data: { collectedAmount: { increment: 100 } },
    });
    expect(tx.claimItem.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'ci-attorney' },
      data: { collectedAmount: { increment: 200 } },
    });
    expect(tx.claimItem.update).toHaveBeenNthCalledWith(3, {
      where: { id: 'ci-interest' },
      data: { collectedAmount: { increment: 300 } },
    });
    expect(tx.claimItem.update).toHaveBeenNthCalledWith(4, {
      where: { id: 'ci-principal' },
      data: { collectedAmount: { increment: 150 } },
    });
  });
});
