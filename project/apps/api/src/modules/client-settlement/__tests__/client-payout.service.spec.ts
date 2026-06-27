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

function buildPrisma(opts: {
  cc?: any;
  existing?: any;
  dupInTx?: any;
  payableLines?: any[];
  confirmedCollections?: any[];
  paid?: Prisma.Decimal | null;
} = {}) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    clientPayout: {
      findUnique: jest.fn().mockResolvedValue(opts.dupInTx ?? null),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: opts.paid ?? null } }),
      create: jest.fn().mockResolvedValue({ id: 'payout-1' }),
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
const OUT_1000 = { payableLines: [{ amount: D(1000), disposition: { collectionId: 'col1', manualReversalRequiredAt: null } }], confirmedCollections: [{ id: 'col1' }] };

describe('ClientPayoutService.create', () => {
  it('happy: amount<=outstanding → RECORDED + advisory-lock + create', async () => {
    const { prisma, tx } = buildPrisma(OUT_1000);
    const res = await svc(prisma).create('t1', DTO({ amount: '400' }), ACTOR);
    expect(res.created).toBe(true);
    expect(tx.$executeRaw).toHaveBeenCalled(); // pg_advisory_xact_lock (concurrency guard)
    expect(tx.clientPayout.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: D(400), status: 'RECORDED', paidById: 'u1', caseClientId: 'cc-A' }) }),
    );
  });

  it('over-payout: amount > outstanding → reject', async () => {
    const { prisma } = buildPrisma(OUT_1000);
    await expect(svc(prisma).create('t1', DTO({ amount: '1500' }), ACTOR)).rejects.toThrow(/aşamaz/);
  });

  it('partial: paid=600 → outstanding 400; amount 500 reject, 400 ok', async () => {
    const a = buildPrisma({ ...OUT_1000, paid: D(600) });
    await expect(svc(a.prisma).create('t1', DTO({ amount: '500' }), ACTOR)).rejects.toThrow(/aşamaz/);
    const b = buildPrisma({ ...OUT_1000, paid: D(600) });
    const res = await svc(b.prisma).create('t1', DTO({ amount: '400' }), ACTOR);
    expect(res.created).toBe(true);
  });

  it('collection CONFIRMED değil → payable outstanding\'e girmez (amount>0 reject)', async () => {
    const { prisma } = buildPrisma({ payableLines: [{ amount: D(1000), disposition: { collectionId: 'col1' } }], confirmedCollections: [] });
    await expect(svc(prisma).create('t1', DTO({ amount: '100' }), ACTOR)).rejects.toThrow(/aşamaz/);
  });

  it('manualReversalRequiredAt dolu POSTED payable yeni payout eligibility disinda kalir', async () => {
    const { prisma, tx } = buildPrisma({
      payableLines: [{ amount: D(1000), disposition: { collectionId: 'col1', manualReversalRequiredAt: new Date('2026-06-27T00:00:00.000Z') } }],
      confirmedCollections: [{ id: 'col1' }],
    });
    await expect(svc(prisma).create('t1', DTO({ amount: '100' }), ACTOR)).rejects.toThrow(/outstanding/i);
    expect(tx.clientPayout.create).not.toHaveBeenCalled();
    expect(tx.collectionDispositionLine.findMany.mock.calls[0][0].where.disposition).toEqual(
      expect.objectContaining({ manualReversalRequiredAt: null }),
    );
  });

  it('idempotency (pre-check, AYNI payload): replay, transaction açılmaz', async () => {
    const { prisma } = buildPrisma({ existing: { id: 'old-payout', caseId: 'case1', caseClientId: 'cc-A', amount: D(400), currency: 'TRY' } });
    const res = await svc(prisma).create('t1', DTO(), ACTOR);
    expect(res).toEqual({ created: false, payoutId: 'old-payout', idempotentReplay: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('idempotency (in-tx race, AYNI payload): replay', async () => {
    const { prisma } = buildPrisma({ ...OUT_1000, dupInTx: { id: 'race-payout', caseId: 'case1', caseClientId: 'cc-A', amount: D(400), currency: 'TRY' } });
    const res = await svc(prisma).create('t1', DTO(), ACTOR);
    expect(res).toEqual({ created: false, payoutId: 'race-payout', idempotentReplay: true });
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

  it('actor (req.user.id) yoksa → reject (body actor olamaz)', async () => {
    const { prisma } = buildPrisma(OUT_1000);
    await expect(svc(prisma).create('t1', DTO(), {})).rejects.toThrow(/actor/);
  });
});
