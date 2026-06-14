/**
 * PR-AO-3 — summary-engine cost/fer'i sınıflaması + çift-dağıtım fix.
 *
 * Gerçek TBK100AllocatorService + capturing wrapper ile uçtan uca:
 *  - CONTRACTUAL_PENALTY artık düşmüyor (DIGER/fer'i)
 *  - PENALTY artık CEK değil DIGER
 *  - çoklu itemType→tek AncillaryType (DIGER) çift dağıtmıyor
 *  - CHECK_PENALTY+PENALTY toplamı ödemeyi aşmıyor
 *  - TAX_* hâlâ kapsam dışı (debtState'e girmiyor)
 *  - regresyon: FEE/EXPENSE→costs, ATTORNEY_FEE→fer'i
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
  return { svc, tx, created, getDebt: () => capturedDebt };
}

const item = (over: Partial<any>) => ({
  id: 'x',
  itemType: 'OTHER',
  demandedAmount: 100,
  collectedAmount: 0,
  amount: 100,
  ...over,
});

const sum = (rows: any[]) => rows.reduce((s, r) => s + r.amount, 0);

describe('PR-AO-3 classification + double-distribution fix', () => {
  it('1) CONTRACTUAL_PENALTY artık DÜŞMÜYOR → feri (DIGER) mahsup edilir', async () => {
    const { svc, tx, created, getDebt } = build([
      item({ id: 'cp1', itemType: 'CONTRACTUAL_PENALTY', demandedAmount: 100, amount: 100 }),
    ]);
    await svc.allocatePaymentToLedgerInTx(tx, 't1', 'c1', 100);

    expect(getDebt().ancillaries.get('DIGER')).toBe(100); // debtState'e girdi
    expect(created.find((a) => a.claimItemId === 'cp1')?.amount).toBe(100); // ledger satırı var
  });

  it('2) PENALTY artık CEK değil → DIGER (feri)', async () => {
    const { svc, tx, getDebt } = build([
      item({ id: 'p1', itemType: 'PENALTY', demandedAmount: 50, amount: 50 }),
    ]);
    await svc.allocatePaymentToLedgerInTx(tx, 't1', 'c1', 50);

    const debt = getDebt();
    expect(debt.ancillaries.get('DIGER')).toBe(50);
    expect(debt.ancillaries.get('CEK_TAZMINATI')).toBeUndefined();
  });

  it('3) çoklu itemType→DIGER ÇİFT DAĞITMIYOR (kısmi ödeme)', async () => {
    const { svc, tx, created } = build([
      item({ id: 'p1', itemType: 'PENALTY', demandedAmount: 100, amount: 100 }),
      item({ id: 'c1', itemType: 'CONTRACTUAL_PENALTY', demandedAmount: 100, amount: 100 }),
      item({ id: 'o1', itemType: 'OTHER', demandedAmount: 100, amount: 100 }),
    ]);
    await svc.allocatePaymentToLedgerInTx(tx, 't1', 'c1', 150); // DIGER toplam 300, ödeme 150

    expect(sum(created)).toBe(150); // 150'yi AŞMAZ (eski kod 300+ üretirdi)
    expect(created.find((a) => a.claimItemId === 'p1')?.amount).toBe(100);
    expect(created.find((a) => a.claimItemId === 'c1')?.amount).toBe(50);
    expect(created.find((a) => a.claimItemId === 'o1')).toBeUndefined();
  });

  it('4) CHECK_PENALTY + PENALTY toplamı ödemeyi AŞMAZ', async () => {
    const { svc, tx, created } = build([
      item({ id: 'ch1', itemType: 'CHECK_PENALTY', demandedAmount: 100, amount: 100 }),
      item({ id: 'p1', itemType: 'PENALTY', demandedAmount: 100, amount: 100 }),
    ]);
    await svc.allocatePaymentToLedgerInTx(tx, 't1', 'c1', 250);

    expect(sum(created)).toBeLessThanOrEqual(250);
    expect(sum(created)).toBe(200); // CEK 100 + DIGER 100, ayrı kovalar
  });

  it('5) TAX_* hala KAPSAM DISI (debtState e girmez, duser)', async () => {
    const { svc, tx, created, getDebt } = build([
      item({ id: 'tax1', itemType: 'TAX_KDV', demandedAmount: 100, amount: 100 }),
      item({ id: 'pr1', itemType: 'PRINCIPAL', demandedAmount: 1000, amount: 1000 }),
    ]);
    await svc.allocatePaymentToLedgerInTx(tx, 't1', 'c1', 100);

    const debt = getDebt();
    expect(debt.costs.size).toBe(0);
    expect(debt.ancillaries.size).toBe(0);
    expect(debt.principal).toBe(1000);
    expect(created.find((a) => a.claimItemId === 'tax1')).toBeUndefined(); // TAX mahsup almaz
  });

  it('6) regresyon: FEE/EXPENSE→costs (masraf), ATTORNEY_FEE→feri', async () => {
    const { svc, tx, getDebt } = build([
      item({ id: 'f1', itemType: 'FEE', demandedAmount: 30, amount: 30 }),
      item({ id: 'e1', itemType: 'EXPENSE', demandedAmount: 20, amount: 20 }),
      item({ id: 'a1', itemType: 'ATTORNEY_FEE', demandedAmount: 40, amount: 40 }),
    ]);
    await svc.allocatePaymentToLedgerInTx(tx, 't1', 'c1', 200);

    const debt = getDebt();
    expect(debt.costs.get('HARC')).toBe(30);
    expect(debt.costs.get('TEBLIGAT_MASRAFI')).toBe(20);
    expect(debt.ancillaries.get('VEKALET_UCRETI')).toBe(40);
  });
});
