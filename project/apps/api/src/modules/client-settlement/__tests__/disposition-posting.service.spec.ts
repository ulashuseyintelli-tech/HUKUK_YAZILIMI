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
        data: expect.objectContaining({ type: 'CREDIT', source: expect.stringContaining('disposition_line:') }),
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
