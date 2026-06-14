/**
 * D (vergi) K2 — summary-engine TAX_* mahsubu metadata.taxParentCategory tier'ine.
 *
 * TAX tek başına masraf/fer'i değil; parent tier'ine yönlenir. metadata yoksa warn+dışla.
 */

import { SummaryEngineService } from '../summary-engine.service';
import { TBK100AllocatorService } from '../../interest-engine/allocation/tbk100-allocator.service';

function build(claimItems: any[]) {
  const real = new TBK100AllocatorService();
  let capturedDebt: any;
  const allocator: any = {
    allocate: (amt: number, debt: any, opts: any) => {
      capturedDebt = debt;
      return real.allocate(amt, debt, opts);
    },
  };
  const svc = new SummaryEngineService({} as any, allocator);
  (svc as any).rules = { ledger_allocation: { enabled: true } };
  const warn = jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);

  const created: any[] = [];
  const tx: any = {
    case: { findFirst: async () => ({ id: 'c1', currency: 'TRY', claimItems }) },
    ledgerEntry: {
      create: async ({ data }: any) => {
        const allocs = data.allocations?.create ?? [];
        created.push(...allocs);
        return { id: 'le1', allocations: allocs };
      },
    },
    claimItem: { update: async () => ({}) },
  };
  return { svc, tx, created, warn, getDebt: () => capturedDebt };
}

const tax = (parent: string | null, id = 'tax1', amount = 100) => ({
  id,
  itemType: 'TAX_KDV',
  demandedAmount: amount,
  collectedAmount: 0,
  amount,
  metadata: parent === null ? null : { taxParentCategory: parent },
});

describe('D K2 — TAX parent-category tier routing', () => {
  it('1) TAX(parent=PRINCIPAL) → principal tier', async () => {
    const { svc, tx, created, getDebt } = build([tax('PRINCIPAL')]);
    await svc.allocatePaymentToLedgerInTx(tx, 't1', 'c1', 100);
    expect(getDebt().principal).toBe(100);
    expect(getDebt().costs.size).toBe(0);
    expect(getDebt().ancillaries.size).toBe(0);
    expect(created.find((a) => a.claimItemId === 'tax1')?.amount).toBe(100);
  });

  it('2) TAX(parent=INTEREST) → interest tier', async () => {
    const { svc, tx, getDebt } = build([tax('INTEREST')]);
    await svc.allocatePaymentToLedgerInTx(tx, 't1', 'c1', 100);
    expect(getDebt().accruedInterest).toBe(100);
    expect(getDebt().principal).toBe(0);
  });

  it('3) TAX(parent=COST) → costs[DIGER]', async () => {
    const { svc, tx, getDebt } = build([tax('COST')]);
    await svc.allocatePaymentToLedgerInTx(tx, 't1', 'c1', 100);
    expect(getDebt().costs.get('DIGER')).toBe(100);
    expect(getDebt().ancillaries.size).toBe(0);
  });

  it('4) TAX(parent=ANCILLARY) → ancillaries[DIGER]', async () => {
    const { svc, tx, getDebt } = build([tax('ANCILLARY')]);
    await svc.allocatePaymentToLedgerInTx(tx, 't1', 'c1', 100);
    expect(getDebt().ancillaries.get('DIGER')).toBe(100);
    expect(getDebt().costs.size).toBe(0);
  });

  it('5) TAX metadata YOK → warn + DIŞLA (debtState\'e girmez, ledger satırı yok)', async () => {
    const { svc, tx, created, warn, getDebt } = build([tax(null)]);
    await svc.allocatePaymentToLedgerInTx(tx, 't1', 'c1', 100);
    const debt = getDebt();
    expect(debt.principal).toBe(0);
    expect(debt.accruedInterest).toBe(0);
    expect(debt.costs.size).toBe(0);
    expect(debt.ancillaries.size).toBe(0);
    expect(created.find((a) => a.claimItemId === 'tax1')).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('TAX item without valid taxParentCategory'));
  });

  it('6) TAX(PRINCIPAL)+PRINCIPAL item → principal havuzu çift-saymaz', async () => {
    const { svc, tx, created } = build([
      tax('PRINCIPAL', 'tax1', 100),
      { id: 'pr1', itemType: 'PRINCIPAL', demandedAmount: 1000, collectedAmount: 0, amount: 1000 },
    ]);
    await svc.allocatePaymentToLedgerInTx(tx, 't1', 'c1', 200); // principal havuzu 1100, ödeme 200
    const total = created.reduce((s, a) => s + a.amount, 0);
    expect(total).toBe(200); // AŞMAZ
  });
});
