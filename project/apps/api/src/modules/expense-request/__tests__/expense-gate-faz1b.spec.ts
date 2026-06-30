/**
 * S8-B FAZ-1b — UYAP gate flag + dual-eval. flagOff (default) → legacy status-bazlı (her BLOCKING aday bloklar).
 * flagOn → remaining-bazlı (computeExpenseRemaining≤0 → BLOKLAMAZ; offset/reimbursement-kapalı masraf UYAP'ı açar).
 */
import { Prisma } from '@prisma/client';
import { ExpenseGateService } from '../expense-gate.service';

const D = (n: number) => new Prisma.Decimal(n);

function makeService(opts: { candidates?: any[]; remaining?: Record<string, Prisma.Decimal> } = {}) {
  const prisma = {
    expenseRequest: { findMany: jest.fn().mockResolvedValue(opts.candidates ?? []) },
  } as never;
  const readService = {
    computeExpenseRemaining: jest.fn().mockImplementation(async (_db, _t, id) => opts.remaining?.[id] ?? D(0)),
  } as never;
  return new ExpenseGateService(prisma, readService);
}

const blockingExp = (id: string, total: number, paid: number, status = 'PARTIAL') => ({
  id, tenantId: 't1', stageCode: null, totalAmount: D(total), paidTotal: D(paid), status,
});

describe('ExpenseGateService FAZ-1b dual-eval', () => {
  const FLAG = 'EXPENSE_REMAINING_GATE_ENABLED';
  afterEach(() => { delete process.env[FLAG]; });

  it('flagOff (default): legacy — BLOCKING aday remaining>0 olsa da bloklar (offset/reimbursement yoksayılır)', async () => {
    delete process.env[FLAG];
    // legacy remaining = 100-0 = 100; true remaining = 0 (tamamen kapalı) ama flagOff → yine bloklar
    const svc = makeService({ candidates: [blockingExp('er1', 100, 0)], remaining: { er1: D(0) } });
    const r = await svc.checkGate('case1');
    expect(r.isBlocked).toBe(true);
    expect(r.blockingExpenses[0].remaining).toBe(100); // legacy gösterilir
  });

  it('flagOn: remaining-bazlı — true remaining=0 → BLOKLAMAZ (kapanmış masraf UYAP açar)', async () => {
    process.env[FLAG] = 'true';
    const svc = makeService({ candidates: [blockingExp('er1', 100, 0)], remaining: { er1: D(0) } });
    const r = await svc.checkGate('case1');
    expect(r.isBlocked).toBe(false);
    expect(r.blockingExpenses).toHaveLength(0);
  });

  it('flagOn: true remaining>0 → bloklar; gösterilen remaining = true', async () => {
    process.env[FLAG] = 'true';
    const svc = makeService({ candidates: [blockingExp('er1', 100, 0)], remaining: { er1: D(40) } });
    const r = await svc.checkGate('case1');
    expect(r.isBlocked).toBe(true);
    expect(r.blockingExpenses[0].remaining).toBe(40);
  });

  it('flagOn: çok adaylı — yalnız remaining>0 olanlar bloklar', async () => {
    process.env[FLAG] = 'true';
    const svc = makeService({
      candidates: [blockingExp('er1', 100, 0), blockingExp('er2', 50, 0)],
      remaining: { er1: D(0), er2: D(50) },
    });
    const r = await svc.checkGate('case1');
    expect(r.blockingExpenses.map((e) => e.id)).toEqual(['er2']);
    expect(r.totalPending).toBe(50);
  });

  it('aday yoksa bloklamaz', async () => {
    const svc = makeService({ candidates: [] });
    const r = await svc.checkGate('case1');
    expect(r.isBlocked).toBe(false);
  });
});
