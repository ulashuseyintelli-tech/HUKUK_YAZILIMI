/**
 * TM3 M3 — ClientPayoutService testleri.
 * Acceptance: amount>0; amount<=outstanding; outstanding = ΣPOSTED CLIENT_PAYABLE(confirmed) − ΣRECORDED payout;
 * tenant+case+caseClientId+currency scoped; idempotency (pre + in-tx + P2002); concurrency advisory-lock;
 * foreign/wrong-role caseClientId reject; collection CONFIRMED değilse outstanding'e girmez; BalanceLedger YOK.
 */
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClientPayoutService } from '../client-payout.service';
import { ClientSettlementReadService } from '../client-settlement-read.service';

const D = (n: number) => new Prisma.Decimal(n);
const POSTED_AT = new Date('2026-06-01T00:00:00.000Z');

function payableLine(over: any = {}) {
  const disposition = over.disposition ?? {};
  const dispositionId = over.dispositionId ?? disposition.id ?? 'disp-1';
  const collectionId = over.collectionId ?? disposition.collectionId ?? 'col1';
  return {
    id: over.id ?? 'line-1',
    dispositionId,
    amount: over.amount ?? D(1000),
    caseClientId: over.caseClientId ?? 'cc-A',
    disposition: {
      id: dispositionId,
      collectionId,
      postedAt: over.postedAt ?? disposition.postedAt ?? POSTED_AT,
      manualReversalRequiredAt: over.manualReversalRequiredAt ?? disposition.manualReversalRequiredAt ?? null,
      ...disposition,
    },
  };
}

function buildPrisma(opts: {
  cc?: any;
  existing?: any;
  dupInTx?: any;
  payableLines?: any[];
  confirmedCollections?: any[];
  paid?: Prisma.Decimal | null;
  journalCreateError?: Error;
} = {}) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    clientPayout: {
      findUnique: jest.fn().mockResolvedValue(opts.dupInTx ?? null),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: opts.paid ?? null } }),
      create: jest.fn().mockResolvedValue({ id: 'payout-1', paidAt: new Date('2026-06-30T08:00:00.000Z') }),
    },
    clientPayoutAllocation: {
      createMany: jest.fn().mockImplementation((args: any) => Promise.resolve({ count: args.data.length })),
    },
    accountingJournalEntry: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(() => {
        if (opts.journalCreateError) return Promise.reject(opts.journalCreateError);
        return Promise.resolve({ id: 'journal-payout-1', _count: { lines: 2 } });
      }),
    },
    collectionDispositionLine: {
      findMany: jest.fn().mockImplementation((args?: any) => {
        const rows = opts.payableLines ?? [];
        if (args?.where?.disposition?.manualReversalRequiredAt === null) {
          return Promise.resolve(rows.filter((row) => row.disposition?.manualReversalRequiredAt == null));
        }
        return Promise.resolve(rows);
      }),
    },
    collection: { findMany: jest.fn().mockResolvedValue(opts.confirmedCollections ?? []) },
    // TM3 Faz C C-1 — computeOutstanding artık offset okur (tx içinde); no-op (yokken sonuç birebir aynı).
    clientOffset: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }), findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma: any = {
    caseClient: { findFirst: jest.fn().mockResolvedValue(opts.cc === undefined ? { id: 'cc-A' } : opts.cc) },
    clientPayout: { findUnique: jest.fn().mockResolvedValue(opts.existing ?? null) },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  return { prisma, tx };
}
const svc = (p: any) => new ClientPayoutService(p, new ClientSettlementReadService(p));
const DTO = (over: any = {}) => ({ caseId: 'case1', caseClientId: 'cc-A', amount: '400', idempotencyKey: 'k1', ...over });
const ACTOR = { userId: 'u1' };

// outstanding=1000 senaryosu: 1 payable line (collection CONFIRMED), paid yok
const OUT_1000 = { payableLines: [payableLine()], confirmedCollections: [{ id: 'col1' }] };

describe('ClientPayoutService.create', () => {
  it('happy: amount<=outstanding → RECORDED + advisory-lock + create + allocation source-link', async () => {
    const { prisma, tx } = buildPrisma(OUT_1000);
    const res = await svc(prisma).create('t1', DTO({ amount: '400' }), ACTOR);
    expect(res.created).toBe(true);
    expect(tx.$executeRaw).toHaveBeenCalled(); // pg_advisory_xact_lock (concurrency guard)
    expect(tx.clientPayout.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: D(400), status: 'RECORDED', paidById: 'u1', caseClientId: 'cc-A' }) }),
    );
    expect(tx.clientPayoutAllocation.createMany).toHaveBeenCalledTimes(1);
    expect(tx.clientPayout.create.mock.invocationCallOrder[0]).toBeLessThan(tx.clientPayoutAllocation.createMany.mock.invocationCallOrder[0]);
    const allocationRows = tx.clientPayoutAllocation.createMany.mock.calls[0][0].data;
    expect(allocationRows).toHaveLength(1);
    expect(allocationRows[0]).toEqual(
      expect.objectContaining({
        tenantId: 't1',
        caseId: 'case1',
        caseClientId: 'cc-A',
        clientPayoutId: 'payout-1',
        collectionId: 'col1',
        collectionDispositionId: 'disp-1',
        collectionDispositionLineId: 'line-1',
        currency: 'TRY',
        allocatedById: 'u1',
      }),
    );
    expect(allocationRows[0].amount.equals(D(400))).toBe(true);
    expect(tx.accountingJournalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryType: 'CLIENT_PAYOUT_RECORDED',
          sourceType: 'CLIENT_PAYOUT',
          sourceId: 'payout-1',
          sourceAction: 'recorded',
          idempotencyKey: 'acct-journal:v1:t1:CLIENT_PAYOUT:payout-1:recorded:2026-06-30T08:00:00.000Z:payout-1',
          lines: {
            create: expect.arrayContaining([
              expect.objectContaining({ accountCode: 'CLIENT_PAYABLE', direction: 'DEBIT', payoutId: 'payout-1', caseClientId: 'cc-A' }),
              expect.objectContaining({ accountCode: 'CASH_CLEARING', direction: 'CREDIT', payoutId: 'payout-1', caseClientId: 'cc-A' }),
            ]),
          },
        }),
      }),
    );
    expect(tx.clientPayoutAllocation.createMany.mock.invocationCallOrder[0]).toBeLessThan(tx.accountingJournalEntry.create.mock.invocationCallOrder[0]);
  });

  it('ACCT-1B-3A seam: current runtime always calls journal writer inside successful payout transaction', async () => {
    const { prisma, tx } = buildPrisma(OUT_1000);

    const res = await svc(prisma).create('t1', DTO({ amount: '400' }), ACTOR);

    expect(res).toEqual({ created: true, payoutId: 'payout-1' });
    expect(tx.clientPayout.create).toHaveBeenCalledTimes(1);
    expect(tx.clientPayoutAllocation.createMany).toHaveBeenCalledTimes(1);
    expect(tx.accountingJournalEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.clientPayoutAllocation.createMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.accountingJournalEntry.create.mock.invocationCallOrder[0],
    );
    expect(tx.accountingJournalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryType: 'CLIENT_PAYOUT_RECORDED',
          sourceType: 'CLIENT_PAYOUT',
          sourceId: 'payout-1',
          sourceAction: 'recorded',
          idempotencyKey: 'acct-journal:v1:t1:CLIENT_PAYOUT:payout-1:recorded:2026-06-30T08:00:00.000Z:payout-1',
        }),
      }),
    );
  });

  it('ACCT-1B-3A seam: current runtime remains fail-closed when journal writer fails', async () => {
    const { prisma, tx } = buildPrisma({ ...OUT_1000, journalCreateError: new Error('journal db down') });

    await expect(svc(prisma).create('t1', DTO({ amount: '400' }), ACTOR)).rejects.toThrow(/Accounting journal write failed/);

    expect(tx.clientPayout.create).toHaveBeenCalledTimes(1);
    expect(tx.clientPayoutAllocation.createMany).toHaveBeenCalledTimes(1);
    expect(tx.accountingJournalEntry.create).toHaveBeenCalledTimes(1);
  });
  it('over-payout: amount > outstanding → reject', async () => {
    const { prisma, tx } = buildPrisma(OUT_1000);
    await expect(svc(prisma).create('t1', DTO({ amount: '1500' }), ACTOR)).rejects.toThrow(/aşamaz/);
    expect(tx.clientPayoutAllocation.createMany).not.toHaveBeenCalled();
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('partial: paid=600 → outstanding 400; amount 500 reject, 400 ok', async () => {
    const a = buildPrisma({ ...OUT_1000, paid: D(600) });
    await expect(svc(a.prisma).create('t1', DTO({ amount: '500' }), ACTOR)).rejects.toThrow(/aşamaz/);
    expect(a.tx.clientPayoutAllocation.createMany).not.toHaveBeenCalled();
    expect(a.tx.accountingJournalEntry.create).not.toHaveBeenCalled();
    const b = buildPrisma({ ...OUT_1000, paid: D(600) });
    const res = await svc(b.prisma).create('t1', DTO({ amount: '400' }), ACTOR);
    expect(res.created).toBe(true);
    const allocationRows = b.tx.clientPayoutAllocation.createMany.mock.calls[0][0].data;
    expect(allocationRows).toHaveLength(1);
    expect(allocationRows[0].collectionDispositionLineId).toBe('line-1');
    expect(allocationRows[0].amount.equals(D(400))).toBe(true);
    expect(b.tx.accountingJournalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryType: 'CLIENT_PAYOUT_RECORDED',
          sourceType: 'CLIENT_PAYOUT',
          sourceId: 'payout-1',
          sourceAction: 'recorded',
          idempotencyKey: 'acct-journal:v1:t1:CLIENT_PAYOUT:payout-1:recorded:2026-06-30T08:00:00.000Z:payout-1',
          lines: {
            create: expect.arrayContaining([
              expect.objectContaining({ accountCode: 'CLIENT_PAYABLE', direction: 'DEBIT', payoutId: 'payout-1', caseClientId: 'cc-A' }),
              expect.objectContaining({ accountCode: 'CASH_CLEARING', direction: 'CREDIT', payoutId: 'payout-1', caseClientId: 'cc-A' }),
            ]),
          },
        }),
      }),
    );
    expect(b.tx.clientPayoutAllocation.createMany.mock.invocationCallOrder[0]).toBeLessThan(b.tx.accountingJournalEntry.create.mock.invocationCallOrder[0]);
  });

  it('allocation planning consumes prior aggregate paid before splitting new payout by source line order', async () => {
    const lineA = payableLine({ id: 'line-A', dispositionId: 'disp-A', collectionId: 'col-A', amount: D(100), postedAt: new Date('2026-06-01T00:00:00.000Z') });
    const lineB = payableLine({ id: 'line-B', dispositionId: 'disp-B', collectionId: 'col-B', amount: D(50), postedAt: new Date('2026-06-02T00:00:00.000Z') });
    const { prisma, tx } = buildPrisma({
      payableLines: [lineB, lineA],
      confirmedCollections: [{ id: 'col-A' }, { id: 'col-B' }],
      paid: D(80),
    });

    const res = await svc(prisma).create('t1', DTO({ amount: '40' }), ACTOR);

    expect(res.created).toBe(true);
    const allocationRows = tx.clientPayoutAllocation.createMany.mock.calls[0][0].data;
    expect(allocationRows).toHaveLength(2);
    expect(allocationRows[0].collectionDispositionLineId).toBe('line-A');
    expect(allocationRows[0].collectionDispositionId).toBe('disp-A');
    expect(allocationRows[0].collectionId).toBe('col-A');
    expect(allocationRows[0].amount.equals(D(20))).toBe(true);
    expect(allocationRows[1].collectionDispositionLineId).toBe('line-B');
    expect(allocationRows[1].collectionDispositionId).toBe('disp-B');
    expect(allocationRows[1].collectionId).toBe('col-B');
    expect(allocationRows[1].amount.equals(D(20))).toBe(true);
  });

  it('collection CONFIRMED değil → payable outstanding\'e girmez (amount>0 reject)', async () => {
    const { prisma } = buildPrisma({ payableLines: [payableLine()], confirmedCollections: [] });
    await expect(svc(prisma).create('t1', DTO({ amount: '100' }), ACTOR)).rejects.toThrow(/aşamaz/);
  });

  it('manualReversalRequiredAt dolu POSTED payable yeni payout eligibility disinda kalir', async () => {
    const { prisma, tx } = buildPrisma({
      payableLines: [payableLine({ manualReversalRequiredAt: new Date('2026-06-27T00:00:00.000Z') })],
      confirmedCollections: [{ id: 'col1' }],
    });
    await expect(svc(prisma).create('t1', DTO({ amount: '100' }), ACTOR)).rejects.toThrow(/outstanding/i);
    expect(tx.clientPayout.create).not.toHaveBeenCalled();
    expect(tx.clientPayoutAllocation.createMany).not.toHaveBeenCalled();
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
    expect(tx.collectionDispositionLine.findMany.mock.calls[0][0].where.disposition).toEqual(
      expect.objectContaining({ manualReversalRequiredAt: null }),
    );
  });

  it('idempotency (pre-check, AYNI payload): replay, transaction açılmaz', async () => {
    const { prisma, tx } = buildPrisma({ existing: { id: 'old-payout', caseId: 'case1', caseClientId: 'cc-A', amount: D(400), currency: 'TRY' } });
    const res = await svc(prisma).create('t1', DTO(), ACTOR);
    expect(res).toEqual({ created: false, payoutId: 'old-payout', idempotentReplay: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.clientPayoutAllocation.createMany).not.toHaveBeenCalled();
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('idempotency (in-tx race, AYNI payload): replay', async () => {
    const { prisma, tx } = buildPrisma({ ...OUT_1000, dupInTx: { id: 'race-payout', caseId: 'case1', caseClientId: 'cc-A', amount: D(400), currency: 'TRY' } });
    const res = await svc(prisma).create('t1', DTO(), ACTOR);
    expect(res).toEqual({ created: false, payoutId: 'race-payout', idempotentReplay: true });
    expect(tx.clientPayoutAllocation.createMany).not.toHaveBeenCalled();
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('idempotency reuse FARKLI amount → IDEMPOTENCY_KEY_CONFLICT (sessiz eski dönme YOK)', async () => {
    const { prisma } = buildPrisma({ existing: { id: 'old', caseId: 'case1', caseClientId: 'cc-A', amount: D(300), currency: 'TRY' } });
    await expect(svc(prisma).create('t1', DTO({ amount: '400' }), ACTOR)).rejects.toThrow(/farklı payload/i);
  });

  it('idempotency reuse FARKLI caseClientId → conflict', async () => {
    const { prisma } = buildPrisma({ existing: { id: 'old', caseId: 'case1', caseClientId: 'cc-OTHER', amount: D(400), currency: 'TRY' } });
    await expect(svc(prisma).create('t1', DTO(), ACTOR)).rejects.toThrow(/farklı payload/i);
  });

  it('FARKLI tenant aynı key → izinli (tenant-scoped unique; existing yok → create)', async () => {
    const { prisma, tx } = buildPrisma({ ...OUT_1000, existing: null });
    const res = await svc(prisma).create('t2', DTO(), ACTOR);
    expect(res.created).toBe(true);
    expect(tx.clientPayout.create).toHaveBeenCalled();
  });

  it('foreign/wrong-role caseClientId → reject', async () => {
    const { prisma } = buildPrisma({ cc: null });
    await expect(svc(prisma).create('t1', DTO(), ACTOR)).rejects.toThrow(/geçersiz\/yabancı|uygun rolde/);
  });

  it('amount <= 0 → reject', async () => {
    const { prisma } = buildPrisma(OUT_1000);
    await expect(svc(prisma).create('t1', DTO({ amount: '0' }), ACTOR)).rejects.toThrow(/pozitif/);
  });

  it('idempotencyKey yoksa → reject', async () => {
    const { prisma } = buildPrisma(OUT_1000);
    await expect(svc(prisma).create('t1', DTO({ idempotencyKey: '' }), ACTOR)).rejects.toThrow(/idempotencyKey/);
  });

  it('journal writer failure rejects payout transaction', async () => {
    const { prisma, tx } = buildPrisma({ ...OUT_1000, journalCreateError: new Error('journal db down') });

    await expect(svc(prisma).create('t1', DTO({ amount: '400' }), ACTOR)).rejects.toThrow(/Accounting journal write failed/);

    expect(tx.clientPayout.create).toHaveBeenCalled();
    expect(tx.clientPayoutAllocation.createMany).toHaveBeenCalled();
    expect(tx.accountingJournalEntry.create).toHaveBeenCalled();
  });
  it('actor (req.user.id) yoksa → reject (body actor olamaz)', async () => {
    const { prisma } = buildPrisma(OUT_1000);
    await expect(svc(prisma).create('t1', DTO(), {})).rejects.toThrow(/actor/);
  });
});
