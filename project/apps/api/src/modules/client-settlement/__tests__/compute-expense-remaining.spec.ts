/**
 * S8-B FAZ-1b — computeExpenseRemaining (TEK KAYNAK unpaid/remaining primitive).
 * remaining = totalAmount − paidTotal − ΣOffset(APPLY) + ΣOffset(REVERSAL) − ΣReimb(APPLY) + ΣReimb(REVERSAL).
 * RAW (clamp YOK); paidTotal mutate edilmez (projection-first).
 */
import { Prisma } from '@prisma/client';
import { ClientSettlementReadService } from '../client-settlement-read.service';

const D = (n: number | string) => new Prisma.Decimal(n);
const agg = (sum: Prisma.Decimal | null) => ({ _sum: { amount: sum } });

function makeDb(opts: { offApply?: Prisma.Decimal; offRev?: Prisma.Decimal; reimbApply?: Prisma.Decimal; reimbRev?: Prisma.Decimal } = {}) {
  return {
    clientOffset: {
      aggregate: jest
        .fn()
        .mockResolvedValueOnce(agg(opts.offApply ?? null)) // APPLY
        .mockResolvedValueOnce(agg(opts.offRev ?? null)), // REVERSAL
    },
    collectionDispositionExpenseApplication: {
      aggregate: jest
        .fn()
        .mockResolvedValueOnce(agg(opts.reimbApply ?? null)) // APPLY
        .mockResolvedValueOnce(agg(opts.reimbRev ?? null)), // REVERSAL
    },
  } as never;
}

describe('computeExpenseRemaining (S8-B FAZ-1b)', () => {
  const svc = new ClientSettlementReadService({} as never);

  it('offset/reimbursement yok → total − paid', async () => {
    const r = await svc.computeExpenseRemaining(makeDb(), 't1', 'er1', D(100), D(30));
    expect(r.toString()).toBe('70');
  });

  it('offset APPLY düşer, REVERSAL geri ekler', async () => {
    const r = await svc.computeExpenseRemaining(makeDb({ offApply: D(20), offRev: D(5) }), 't1', 'er1', D(100), D(0));
    expect(r.toString()).toBe('85'); // 100 − 0 − 20 + 5
  });

  it('reimbursement APPLY düşer, REVERSAL geri ekler (simetri → kapanış geri açılır)', async () => {
    const r = await svc.computeExpenseRemaining(makeDb({ reimbApply: D(40), reimbRev: D(10) }), 't1', 'er1', D(100), D(0));
    expect(r.toString()).toBe('70'); // 100 − 0 − 40 + 10
  });

  it('tüm terimler birlikte', async () => {
    const r = await svc.computeExpenseRemaining(
      makeDb({ offApply: D(20), offRev: D(5), reimbApply: D(30), reimbRev: D(0) }),
      't1', 'er1', D(100), D(10),
    );
    expect(r.toString()).toBe('45'); // 100 − 10 − 20 + 5 − 30 + 0
  });

  it('over-application → RAW negatif (clamp YOK; over-application sinyali)', async () => {
    const r = await svc.computeExpenseRemaining(makeDb({ offApply: D(30), reimbApply: D(80) }), 't1', 'er1', D(100), D(0));
    expect(r.toString()).toBe('-10'); // 100 − 0 − 30 − 80
  });

  it('faithful decimal (float artifact yok)', async () => {
    const r = await svc.computeExpenseRemaining(makeDb({ reimbApply: D('33.33') }), 't1', 'er1', D('100.00'), D('0.01'));
    expect(r.toString()).toBe('66.66'); // 100.00 − 0.01 − 33.33
  });
});
