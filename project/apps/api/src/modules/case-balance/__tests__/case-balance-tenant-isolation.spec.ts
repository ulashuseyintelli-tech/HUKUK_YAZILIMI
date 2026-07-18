import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CaseBalanceService } from '../case-balance.service';

/**
 * CLIENT-P0-T04-C1 — CaseBalance tenant fail-closed containment regression suite.
 *
 * Kapsam: route-erişilebilir dört yol (getBalance / getLedger / credit / debit) authenticated
 * tenant üzerinden fail-closed çalışmalı. Cross-tenant erişim engellenmeli; hiçbir finansal
 * satır (CaseBalance / BalanceLedger / AccountingJournal) oluşturulmamalı veya değiştirilmemeli;
 * mevcut same-tenant davranışı korunmalı; historical tenant-mismatch auto-repair edilmemeli.
 *
 * Deterministic mock fixtures; gerçek production verisi veya cross-tenant exploit denemesi yok.
 */

const D = (value: number | string) => new Prisma.Decimal(value);
const CREATED_AT = new Date('2026-07-01T00:00:00.000Z');

interface HarnessOptions {
  /** caseId -> sahip tenant. `case.findFirst({ id, tenantId })` yalnız eşleşmede satır döner. */
  caseOwner?: Record<string, string>;
  /** caseId için mevcut CaseBalance satırı (tenantId dahil) veya null. */
  existingBalance?: { id: string; tenantId: string; caseId: string; balance: Prisma.Decimal; lowThreshold: Prisma.Decimal } | null;
}

function buildHarness(options: HarnessOptions = {}) {
  const caseOwner = options.caseOwner ?? {};
  const existingBalance = options.existingBalance ?? null;

  const tx = {
    balanceLedger: {
      create: jest.fn().mockResolvedValue({
        id: 'ledger-new',
        tenantId: 'tenant-A',
        caseBalanceId: existingBalance?.id ?? 'cb-new',
        type: 'CREDIT',
        amount: D(100),
        currency: 'TRY',
        source: 'manual',
        sourceId: null,
        description: 'test',
        createdById: 'user-A',
        createdAt: CREATED_AT,
      }),
    },
    caseBalance: { update: jest.fn().mockResolvedValue({ balance: D(1100), lowThreshold: D(500) }) },
  };

  const prisma = {
    case: {
      findFirst: jest.fn(async (args: { where: { id: string; tenantId: string } }) => {
        const { id, tenantId } = args.where;
        return caseOwner[id] === tenantId ? { id } : null;
      }),
    },
    caseBalance: {
      findUnique: jest.fn(async (args: { where: { caseId: string } }) =>
        existingBalance && existingBalance.caseId === args.where.caseId ? existingBalance : null,
      ),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'cb-new', ...args.data })),
    },
    balanceLedger: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn().mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
  };

  const journalWriter = {
    write: jest.fn().mockResolvedValue({
      ok: true,
      output: { status: 'CREATED', journalEntryId: 'j-1', idempotencyKey: 'i-1', sourceVersion: 'v-1', lineCount: 2 },
    }),
  };

  const service = new CaseBalanceService(prisma as never, journalWriter as never);
  return { tx, prisma, journalWriter, service };
}

function expectNoFinancialSideEffect(h: ReturnType<typeof buildHarness>) {
  // Hiçbir bakiye/ledger/journal yan etkisi başlamamalı.
  expect(h.prisma.$transaction).not.toHaveBeenCalled();
  expect(h.tx.balanceLedger.create).not.toHaveBeenCalled();
  expect(h.tx.caseBalance.update).not.toHaveBeenCalled();
  expect(h.journalWriter.write).not.toHaveBeenCalled();
  // Yabancı/uyumsuz CaseBalance satırı oluşturulmamalı.
  expect(h.prisma.caseBalance.create).not.toHaveBeenCalled();
}

describe('CaseBalanceService CLIENT-P0-T04-C1 tenant fail-closed containment', () => {
  const OWNED = { caseOwner: { 'case-A': 'tenant-A' } } as const;
  const OWNED_WITH_BALANCE = {
    caseOwner: { 'case-A': 'tenant-A' },
    existingBalance: { id: 'cb-A', tenantId: 'tenant-A', caseId: 'case-A', balance: D(1000), lowThreshold: D(500) },
  } as const;

  describe('same-tenant positive (mevcut davranış korunur)', () => {
    it('own case balance read succeeds', async () => {
      const h = buildHarness(OWNED_WITH_BALANCE);
      const res = await h.service.getBalance('tenant-A', 'case-A');
      expect(res).toEqual(expect.objectContaining({ id: 'cb-A', tenantId: 'tenant-A', isLow: false }));
      expect(h.prisma.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'case-A', tenantId: 'tenant-A' } }));
    });

    it('own case ledger read succeeds', async () => {
      const h = buildHarness(OWNED_WITH_BALANCE);
      const res = await h.service.getLedger('tenant-A', 'case-A');
      expect(res).toEqual([]);
      expect(h.prisma.balanceLedger.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { caseBalanceId: 'cb-A' } }));
    });

    it('own case missing balance can be created (ownership verified before create)', async () => {
      const h = buildHarness(OWNED); // sahip var, mevcut bakiye yok
      const res = await h.service.getBalance('tenant-A', 'case-A');
      expect(h.prisma.case.findFirst).toHaveBeenCalled();
      expect(h.prisma.caseBalance.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-A', caseId: 'case-A', balance: 0 }) }),
      );
      expect(res).toEqual(expect.objectContaining({ tenantId: 'tenant-A', caseId: 'case-A' }));
    });

    it('own case credit succeeds', async () => {
      const h = buildHarness(OWNED_WITH_BALANCE);
      const res = await h.service.credit('tenant-A', 'case-A', { amount: 100, source: 'manual' }, 'user-A');
      expect(res).toEqual(expect.objectContaining({ success: true }));
      expect(h.tx.balanceLedger.create).toHaveBeenCalledTimes(1);
    });

    it('own case debit succeeds', async () => {
      const h = buildHarness(OWNED_WITH_BALANCE);
      const res = await h.service.debit('tenant-A', 'case-A', { amount: 100, source: 'operation:haciz' }, 'user-A');
      expect(res).toEqual(expect.objectContaining({ success: true }));
      expect(h.tx.caseBalance.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('cross-tenant negative (fail-closed, zero side-effect)', () => {
    // case-A tenant-A'ya ait; saldırgan tenant-B.
    it('foreign case balance read denied — no side effect, no oracle', async () => {
      const h = buildHarness(OWNED_WITH_BALANCE);
      await expect(h.service.getBalance('tenant-B', 'case-A')).rejects.toBeInstanceOf(NotFoundException);
      // Yabancı bakiye okunmamalı (ownership fail → findUnique'e hiç gidilmez).
      expect(h.prisma.caseBalance.findUnique).not.toHaveBeenCalled();
      expect(h.prisma.balanceLedger.findMany).not.toHaveBeenCalled();
      expectNoFinancialSideEffect(h);
    });

    it('foreign case ledger read denied — no side effect', async () => {
      const h = buildHarness(OWNED_WITH_BALANCE);
      await expect(h.service.getLedger('tenant-B', 'case-A')).rejects.toBeInstanceOf(NotFoundException);
      expect(h.prisma.balanceLedger.findMany).not.toHaveBeenCalled();
      expectNoFinancialSideEffect(h);
    });

    it('foreign case credit denied — CaseBalance/BalanceLedger/AccountingJournal unchanged', async () => {
      const h = buildHarness(OWNED_WITH_BALANCE);
      await expect(h.service.credit('tenant-B', 'case-A', { amount: 500, source: 'manual' }, 'attacker')).rejects.toBeInstanceOf(NotFoundException);
      expectNoFinancialSideEffect(h);
    });

    it('foreign case debit denied — CaseBalance/BalanceLedger/AccountingJournal unchanged', async () => {
      const h = buildHarness(OWNED_WITH_BALANCE);
      await expect(h.service.debit('tenant-B', 'case-A', { amount: 500, source: 'operation:haciz' }, 'attacker')).rejects.toBeInstanceOf(NotFoundException);
      expectNoFinancialSideEffect(h);
    });

    it('cross-tenant credit on a case with NO existing balance does not create a foreign balance row', async () => {
      const h = buildHarness(OWNED); // case-A tenant-A'ya ait, henüz bakiye satırı yok
      await expect(h.service.credit('tenant-B', 'case-A', { amount: 500, source: 'manual' }, 'attacker')).rejects.toBeInstanceOf(NotFoundException);
      expectNoFinancialSideEffect(h); // create() çağrılmaz → yabancı/uyumsuz satır oluşmaz
    });
  });

  describe('corrupt / mismatched state (fail-closed, no auto-repair)', () => {
    // case-A tenant-A'ya ait, ama mevcut CaseBalance satırı tenant-B taşıyor (historical corruption).
    const CORRUPT = {
      caseOwner: { 'case-A': 'tenant-A' },
      existingBalance: { id: 'cb-corrupt', tenantId: 'tenant-B', caseId: 'case-A', balance: D(1000), lowThreshold: D(500) },
    } as const;

    it('legit owner credit on tenant-mismatched balance row fails closed with no mutation and no auto-repair', async () => {
      const h = buildHarness(CORRUPT);
      await expect(h.service.credit('tenant-A', 'case-A', { amount: 100, source: 'manual' }, 'user-A')).rejects.toBeInstanceOf(ForbiddenException);
      expectNoFinancialSideEffect(h);
    });

    it('legit owner balance read on tenant-mismatched row fails closed', async () => {
      const h = buildHarness(CORRUPT);
      await expect(h.service.getBalance('tenant-A', 'case-A')).rejects.toBeInstanceOf(ForbiddenException);
      expectNoFinancialSideEffect(h);
    });
  });

  describe('unknown case (fail-closed)', () => {
    it('unknown caseId denied — no balance or ledger creation', async () => {
      const h = buildHarness({ caseOwner: {} }); // hiçbir tenant sahibi değil
      await expect(h.service.getBalance('tenant-A', 'case-unknown')).rejects.toBeInstanceOf(NotFoundException);
      expect(h.prisma.caseBalance.findUnique).not.toHaveBeenCalled();
      expectNoFinancialSideEffect(h);
    });

    it('unknown caseId credit denied — no financial side effect', async () => {
      const h = buildHarness({ caseOwner: {} });
      await expect(h.service.credit('tenant-A', 'case-unknown', { amount: 100, source: 'manual' }, 'user-A')).rejects.toBeInstanceOf(NotFoundException);
      expectNoFinancialSideEffect(h);
    });
  });
});
