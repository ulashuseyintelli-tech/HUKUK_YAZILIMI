/**
 * TM3 M2 — DispositionPostingService testleri.
 * Acceptance: HELD→POSTED; sum==totalAmount (eksik/fazla reddedilir); HELD satırı yasak;
 * CLUSTER client-attributed caseClientId zorunlu; non-HELD reddedilir; collection re-verify;
 * OFFSET→BalanceLedger CREDIT korelasyonlu.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DispositionPostingService } from '../disposition-posting.service';

const D = (n: number) => new Prisma.Decimal(n);

const DISP_SINGLE = {
  id: 'd1', collectionId: 'col1', caseId: 'case1', beneficiaryScope: 'SINGLE_CASE_CLIENT',
  caseClientId: 'cc-A', totalAmount: D(100), currency: 'TRY', status: 'HELD_PENDING_DISTRIBUTION',
};

function buildPrisma(opts: { disp?: any; col?: any; validCaseClients?: any[] } = {}) {
  const tx = {
    collectionDispositionLine: {
      deleteMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: `line-${data.type}` })),
    },
    caseBalance: { findFirst: jest.fn().mockResolvedValue({ id: 'cb-1' }), create: jest.fn().mockResolvedValue({ id: 'cb-new' }) },
    balanceLedger: { create: jest.fn().mockResolvedValue({}) },
    collectionDisposition: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma: any = {
    collectionDisposition: { findFirst: jest.fn().mockResolvedValue(opts.disp === undefined ? DISP_SINGLE : opts.disp) },
    collection: { findFirst: jest.fn().mockResolvedValue(opts.col === undefined ? { status: 'CONFIRMED' } : opts.col) },
    caseClient: { findMany: jest.fn().mockResolvedValue(opts.validCaseClients ?? [{ id: 'cc-A' }]) },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  return { prisma, tx };
}
const svc = (p: any) => new DispositionPostingService(p);

describe('DispositionPostingService.post', () => {
  it('SINGLE happy: sum==total → POSTED + lines + caseClientId inherit + actor', async () => {
    const { prisma, tx } = buildPrisma();
    const res = await svc(prisma).post('t1', 'd1', { lines: [{ type: 'CLIENT_PAYABLE', amount: '100' }] }, { userId: 'u1' });

    expect(res.posted).toBe(true);
    expect(tx.collectionDispositionLine.deleteMany).toHaveBeenCalledWith({ where: { dispositionId: 'd1' } });
    expect(tx.collectionDispositionLine.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'CLIENT_PAYABLE', caseClientId: 'cc-A' }) }),
    );
    expect(tx.collectionDisposition.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'POSTED', postedById: 'u1' }) }),
    );
  });

  it('tum non-HELD bucketlar cok satirli post icinde kabul edilir ve toplam tahsilata esitlenir', async () => {
    const { prisma, tx } = buildPrisma();

    const res = await svc(prisma).post(
      't1',
      'd1',
      {
        lines: [
          { type: 'CLIENT_PAYABLE', amount: '10' },
          { type: 'CLIENT_EXPENSE_REIMBURSEMENT', amount: '15' },
          { type: 'CONTRACTUAL_FEE_WITHHELD', amount: '20' },
          { type: 'FIRM_EXPENSE_REIMBURSEMENT', amount: '5' },
          { type: 'OFFSET_CLIENT_ADVANCE', amount: '25' },
          { type: 'OTHER', amount: '25' },
        ],
      },
      { userId: 'u1' },
    );

    expect(res).toEqual({ posted: true, dispositionId: 'd1', lineCount: 6 });
    expect(tx.collectionDispositionLine.create).toHaveBeenCalledTimes(6);
    expect(tx.collectionDispositionLine.create.mock.calls.map(([arg]: any[]) => arg.data.type)).toEqual([
      'CLIENT_PAYABLE',
      'CLIENT_EXPENSE_REIMBURSEMENT',
      'CONTRACTUAL_FEE_WITHHELD',
      'FIRM_EXPENSE_REIMBURSEMENT',
      'OFFSET_CLIENT_ADVANCE',
      'OTHER',
    ]);
    expect(tx.collectionDisposition.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'd1' }, data: expect.objectContaining({ status: 'POSTED', postedById: 'u1' }) }),
    );
  });

  it('cok satirli post accepted: client payable + fee withheld ayni disposition icinde yazilir', async () => {
    const { prisma, tx } = buildPrisma();

    const res = await svc(prisma).post(
      't1',
      'd1',
      {
        lines: [
          { type: 'CLIENT_PAYABLE', amount: '75' },
          { type: 'CONTRACTUAL_FEE_WITHHELD', amount: '25' },
        ],
      },
      {},
    );

    expect(res.lineCount).toBe(2);
    expect(tx.collectionDispositionLine.create).toHaveBeenCalledTimes(2);
    expect(tx.collectionDisposition.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'POSTED' }) }),
    );
  });
  it('sum < total (eksik) → reject, transaction açılmaz', async () => {
    const { prisma } = buildPrisma();
    await expect(
      svc(prisma).post('t1', 'd1', { lines: [{ type: 'CLIENT_PAYABLE', amount: '70' }] }, { userId: 'u1' }),
    ).rejects.toThrow(/eşit olmalı/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sum > total (fazla) → reject', async () => {
    const { prisma } = buildPrisma();
    await expect(
      svc(prisma).post('t1', 'd1', { lines: [{ type: 'CLIENT_PAYABLE', amount: '120' }] }, {}),
    ).rejects.toThrow(/eşit olmalı/);
  });

  it('HELD_PENDING_DISTRIBUTION POSTED satır olamaz → reject', async () => {
    const { prisma } = buildPrisma();
    await expect(
      svc(prisma).post('t1', 'd1', { lines: [{ type: 'HELD_PENDING_DISTRIBUTION', amount: '100' }] }, {}),
    ).rejects.toThrow(/HELD_PENDING_DISTRIBUTION/);
  });

  it('CLUSTER CLIENT_PAYABLE caseClientId yoksa → reject', async () => {
    const disp = { ...DISP_SINGLE, beneficiaryScope: 'CASE_CREDITOR_CLUSTER', caseClientId: null };
    const { prisma } = buildPrisma({ disp });
    await expect(
      svc(prisma).post('t1', 'd1', { lines: [{ type: 'CLIENT_PAYABLE', amount: '100' }] }, {}),
    ).rejects.toThrow(/caseClientId zorunlu/);
  });

  it('CLUSTER CLIENT_EXPENSE_REIMBURSEMENT caseClientId yoksa → reject', async () => {
    const disp = { ...DISP_SINGLE, beneficiaryScope: 'CASE_CREDITOR_CLUSTER', caseClientId: null };
    const { prisma } = buildPrisma({ disp });
    await expect(
      svc(prisma).post('t1', 'd1', { lines: [{ type: 'CLIENT_EXPENSE_REIMBURSEMENT', amount: '100' }] }, {}),
    ).rejects.toThrow(/caseClientId zorunlu/);
  });

  it('CLUSTER client-attributed bucketlar explicit caseClientId ile kabul edilir', async () => {
    const disp = { ...DISP_SINGLE, beneficiaryScope: 'CASE_CREDITOR_CLUSTER', caseClientId: null };
    const { prisma, tx } = buildPrisma({ disp, validCaseClients: [{ id: 'cc-A' }, { id: 'cc-B' }] });

    const res = await svc(prisma).post(
      't1',
      'd1',
      {
        lines: [
          { type: 'CLIENT_PAYABLE', amount: '70', caseClientId: 'cc-A' },
          { type: 'CLIENT_EXPENSE_REIMBURSEMENT', amount: '30', caseClientId: 'cc-B' },
        ],
      },
      {},
    );

    expect(res.lineCount).toBe(2);
    expect(prisma.caseClient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['cc-A', 'cc-B'] }, caseId: 'case1' }),
        select: { id: true },
      }),
    );
    expect(tx.collectionDispositionLine.create.mock.calls.map(([arg]: any[]) => arg.data.caseClientId)).toEqual(['cc-A', 'cc-B']);
  });

  it('CLUSTER non-client bucketlar caseClientId olmadan kabul edilir', async () => {
    const disp = { ...DISP_SINGLE, beneficiaryScope: 'CASE_CREDITOR_CLUSTER', caseClientId: null };
    const { prisma, tx } = buildPrisma({ disp, validCaseClients: [] });

    const res = await svc(prisma).post(
      't1',
      'd1',
      {
        lines: [
          { type: 'CONTRACTUAL_FEE_WITHHELD', amount: '20' },
          { type: 'FIRM_EXPENSE_REIMBURSEMENT', amount: '20' },
          { type: 'OFFSET_CLIENT_ADVANCE', amount: '30' },
          { type: 'OTHER', amount: '30' },
        ],
      },
      {},
    );

    expect(res.lineCount).toBe(4);
    expect(prisma.caseClient.findMany).not.toHaveBeenCalled();
    expect(tx.collectionDispositionLine.create.mock.calls.map(([arg]: any[]) => arg.data.caseClientId)).toEqual([null, null, null, null]);
  });
  it('disposition HELD değilse → reject', async () => {
    const { prisma } = buildPrisma({ disp: { ...DISP_SINGLE, status: 'POSTED' } });
    await expect(
      svc(prisma).post('t1', 'd1', { lines: [{ type: 'CLIENT_PAYABLE', amount: '100' }] }, {}),
    ).rejects.toThrow(/HELD_PENDING_DISTRIBUTION post/);
  });

  it('collection CONFIRMED değilse → reject (M1 sonrası iptal guard)', async () => {
    const { prisma } = buildPrisma({ col: { status: 'CANCELLED' } });
    await expect(
      svc(prisma).post('t1', 'd1', { lines: [{ type: 'CLIENT_PAYABLE', amount: '100' }] }, {}),
    ).rejects.toThrow(/posting yasak/);
  });

  it('OFFSET_CLIENT_ADVANCE → BalanceLedger CREDIT korelasyonlu yazılır', async () => {
    const { prisma, tx } = buildPrisma();
    await svc(prisma).post('t1', 'd1', { lines: [{ type: 'OFFSET_CLIENT_ADVANCE', amount: '100' }] }, { userId: 'u1' });
    expect(tx.balanceLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 't1',
          caseBalanceId: 'cb-1',
          type: 'CREDIT',
          amount: D(100),
          currency: 'TRY',
          source: 'disposition_line:line-OFFSET_CLIENT_ADVANCE',
          sourceId: 'line-OFFSET_CLIENT_ADVANCE',
          description: 'Tahsilat avans mahsubu (OFFSET_CLIENT_ADVANCE)',
          createdById: 'u1',
        }),
      }),
    );
  });

  it('yabancı/uygunsuz caseClientId → reject (foreign-case veya rol değil)', async () => {
    const disp = { ...DISP_SINGLE, beneficiaryScope: 'CASE_CREDITOR_CLUSTER', caseClientId: null };
    const { prisma } = buildPrisma({ disp, validCaseClients: [] }); // findMany boş → eligible değil
    await expect(
      svc(prisma).post('t1', 'd1', { lines: [{ type: 'CLIENT_PAYABLE', amount: '100', caseClientId: 'cc-FOREIGN' }] }, {}),
    ).rejects.toThrow(/geçersiz\/yabancı|uygun rolde/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('disposition bulunamazsa → NotFound', async () => {
    const { prisma } = buildPrisma({ disp: null });
    await expect(
      svc(prisma).post('t1', 'd1', { lines: [{ type: 'CLIENT_PAYABLE', amount: '100' }] }, {}),
    ).rejects.toThrow(NotFoundException);
  });
});
