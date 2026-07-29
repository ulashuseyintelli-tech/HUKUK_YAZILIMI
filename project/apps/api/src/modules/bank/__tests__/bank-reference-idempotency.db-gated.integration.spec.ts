import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import {
  BANK_REFERENCE_ALREADY_EXISTS,
  BankService,
  BankTransactionData,
} from '../bank.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    'RC-COL-W2.2B-R01 DB gate blocked: CI requires an approved TEST_DATABASE_URL.',
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const MIGRATION_SQL = readFileSync(
  join(
    __dirname,
    '../../../../prisma/migrations/20260729120000_rc_col_w2_2b_bank_reference_idempotency/migration.sql',
  ),
  'utf8',
);

describeWithDisposableDb(
  'RC-COL-W2.2B-R01 bank reference idempotency - disposable PostgreSQL',
  () => {
    jest.setTimeout(90_000);
    let prisma: PrismaClient;

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    async function createTenant(label: string) {
      const suffix = randomUUID();
      return prisma.tenant.create({
        data: {
          id: `bank-ref-${label}-${suffix}`,
          name: `Bank reference ${label}`,
          slug: `bank-ref-${label}-${suffix}`,
        },
      });
    }

    async function createAccount(tenantId: string, label: string) {
      const suffix = randomUUID().replace(/-/g, '');
      return prisma.bankAccount.create({
        data: {
          tenantId,
          bankCode: 'TEST',
          bankName: 'Disposable Test Bank',
          iban: `TR${suffix.slice(0, 24)}`,
          ownerType: 'TENANT',
          ownerName: label,
          isIntegrated: true,
          integrationProvider: 'mock',
        },
      });
    }

    function incoming(
      bankReferenceId: string | undefined,
      overrides: Partial<BankTransactionData> = {},
    ): BankTransactionData {
      return {
        transactionDate: new Date('2026-07-29T09:00:00.000Z'),
        valueDate: new Date('2026-07-29T10:00:00.000Z'),
        amount: 1250,
        currency: 'TRY',
        transactionType: 'INCOMING',
        bankReferenceId,
        ...overrides,
      };
    }

    function buildService(transactions: BankTransactionData[]) {
      const collectionService = {
        create: jest.fn(),
        findById: jest.fn(),
      };
      const service = new BankService(
        {} as never,
        prisma as never,
        collectionService as never,
      );
      jest
        .spyOn(service as any, 'fetchTransactions')
        .mockResolvedValue(transactions);
      const tryAutoMatch = jest
        .spyOn(service as any, 'tryAutoMatch')
        .mockResolvedValue(false);
      return { service, collectionService, tryAutoMatch };
    }

    async function createTransaction(
      tenantId: string,
      bankAccountId: string,
      bankReferenceId: string | null,
    ) {
      return prisma.bankTransaction.create({
        data: {
          tenantId,
          bankAccountId,
          transactionDate: new Date('2026-07-29T09:00:00.000Z'),
          valueDate: new Date('2026-07-29T10:00:00.000Z'),
          amount: 1250,
          currency: 'TRY',
          transactionType: 'INCOMING',
          candidateStatus: 'PENDING',
          bankReferenceId,
        },
      });
    }

    async function financialSnapshot(tenantId: string) {
      const [
        collections,
        journals,
        timelineEntries,
        outboxActions,
        ledgerEntries,
        ledgerAllocations,
        collectionAllocations,
        overpayments,
        auditLogs,
      ] = await Promise.all([
        prisma.collection.count({ where: { tenantId } }),
        prisma.accountingJournalEntry.count({ where: { tenantId } }),
        prisma.icrabotTimelineEntry.count({ where: { tenantId } }),
        prisma.icrabotOutboxAction.count({ where: { tenantId } }),
        prisma.ledgerEntry.count({ where: { tenantId } }),
        prisma.ledgerAllocation.count({
          where: { ledgerEntry: { tenantId } },
        }),
        prisma.collectionAllocation.count({
          where: { collection: { tenantId } },
        }),
        prisma.collectionOverpayment.count({ where: { tenantId } }),
        prisma.auditLog.count({ where: { tenantId } }),
      ]);
      return {
        collections,
        journals,
        timelineEntries,
        outboxActions,
        ledgerEntries,
        ledgerAllocations,
        collectionAllocations,
        overpayments,
        auditLogs,
      };
    }

    it('migration lock, fail-closed preflight, normalized-reference check ve stable unique index içerir', () => {
      expect(MIGRATION_SQL).toContain(
        'LOCK TABLE "BankTransaction" IN SHARE ROW EXCLUSIVE MODE',
      );
      expect(MIGRATION_SQL).toContain('BANK_REFERENCE_PREFLIGHT_FAILED');
      expect(MIGRATION_SQL).toContain(
        'CONSTRAINT "ck_bank_transaction_reference_normalized"',
      );
      expect(MIGRATION_SQL).toContain(
        'CREATE UNIQUE INDEX "uq_bank_transaction_tenant_account_reference"',
      );
      expect(MIGRATION_SQL).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE|CASCADE DELETE/i);
    });

    it('DB aynı tenant + hesap + reference için ikinci inserti reddeder', async () => {
      const tenant = await createTenant('db-unique');
      const account = await createAccount(tenant.id, 'db-unique');
      await createTransaction(tenant.id, account.id, 'BANK-DB-UNIQUE');

      await expect(
        createTransaction(tenant.id, account.id, 'BANK-DB-UNIQUE'),
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        prisma.bankTransaction.count({
          where: {
            tenantId: tenant.id,
            bankAccountId: account.id,
            bankReferenceId: 'BANK-DB-UNIQUE',
          },
        }),
      ).resolves.toBe(1);
    });

    it('aynı reference farklı hesap ve tenant sınırlarında bağımsızdır', async () => {
      const tenantA = await createTenant('scope-a');
      const tenantB = await createTenant('scope-b');
      const accountA1 = await createAccount(tenantA.id, 'scope-a1');
      const accountA2 = await createAccount(tenantA.id, 'scope-a2');
      const accountB = await createAccount(tenantB.id, 'scope-b');

      await createTransaction(tenantA.id, accountA1.id, 'SHARED-REFERENCE');
      await createTransaction(tenantA.id, accountA2.id, 'SHARED-REFERENCE');
      await createTransaction(tenantB.id, accountB.id, 'SHARED-REFERENCE');

      await expect(
        prisma.bankTransaction.count({
          where: {
            bankAccountId: { in: [accountA1.id, accountA2.id, accountB.id] },
            bankReferenceId: 'SHARED-REFERENCE',
          },
        }),
      ).resolves.toBe(3);
    });

    it('null birden çok kez kabul edilir; blank/untrimmed direct write DB tarafından reddedilir', async () => {
      const tenant = await createTenant('null');
      const account = await createAccount(tenant.id, 'null');
      await createTransaction(tenant.id, account.id, null);
      await createTransaction(tenant.id, account.id, null);

      await expect(
        createTransaction(tenant.id, account.id, ''),
      ).rejects.toBeDefined();
      await expect(
        createTransaction(tenant.id, account.id, ' UNTRIMMED '),
      ).rejects.toBeDefined();
      await expect(
        prisma.bankTransaction.count({
          where: { tenantId: tenant.id, bankAccountId: account.id },
        }),
      ).resolves.toBe(2);
    });

    it('service empty/whitespace reference değerlerini null olarak persist eder', async () => {
      const tenant = await createTenant('normalize-null');
      const account = await createAccount(tenant.id, 'normalize-null');

      for (const reference of [undefined, '', '   ']) {
        const { service } = buildService([incoming(reference)]);
        await expect(
          service.syncTransactions(account.id, tenant.id),
        ).resolves.toMatchObject({ success: true, newTransactions: 1 });
      }

      const rows = await prisma.bankTransaction.findMany({
        where: { tenantId: tenant.id, bankAccountId: account.id },
        select: { bankReferenceId: true },
      });
      expect(rows).toHaveLength(3);
      expect(rows.every(row => row.bankReferenceId === null)).toBe(true);
    });

    it('eşzamanlı aynı semantic payload exactly-one insert ve deterministic replay üretir', async () => {
      const tenant = await createTenant('race-replay');
      const account = await createAccount(tenant.id, 'race-replay');
      const { service, collectionService, tryAutoMatch } = buildService([
        incoming('BANK-RACE-REPLAY'),
      ]);

      const results = await Promise.all([
        service.syncTransactions(account.id, tenant.id),
        service.syncTransactions(account.id, tenant.id),
      ]);

      expect(results.every(result => result.success)).toBe(true);
      expect(results.map(result => result.newTransactions).sort()).toEqual([0, 1]);
      await expect(
        prisma.bankTransaction.count({
          where: {
            tenantId: tenant.id,
            bankAccountId: account.id,
            bankReferenceId: 'BANK-RACE-REPLAY',
          },
        }),
      ).resolves.toBe(1);
      expect(tryAutoMatch).toHaveBeenCalledTimes(1);
      expect(collectionService.create).not.toHaveBeenCalled();
    });

    it('eşzamanlı farklı semantic payload exactly-one insert ve stable conflict üretir', async () => {
      const tenant = await createTenant('race-conflict');
      const account = await createAccount(tenant.id, 'race-conflict');
      const { service, collectionService, tryAutoMatch } = buildService([]);
      const fetchTransactions = jest.spyOn(service as any, 'fetchTransactions');
      fetchTransactions
        .mockResolvedValueOnce([incoming('BANK-RACE-CONFLICT', { amount: 1250 })])
        .mockResolvedValueOnce([incoming('BANK-RACE-CONFLICT', { amount: 2500 })]);

      const results = await Promise.all([
        service.syncTransactions(account.id, tenant.id),
        service.syncTransactions(account.id, tenant.id),
      ]);

      expect(results.filter(result => result.success)).toHaveLength(1);
      expect(results.filter(result => !result.success)).toEqual([
        expect.objectContaining({
          errorCode: BANK_REFERENCE_ALREADY_EXISTS,
          newTransactions: 0,
        }),
      ]);
      await expect(
        prisma.bankTransaction.count({
          where: {
            tenantId: tenant.id,
            bankAccountId: account.id,
            bankReferenceId: 'BANK-RACE-CONFLICT',
          },
        }),
      ).resolves.toBe(1);
      expect(tryAutoMatch).toHaveBeenCalledTimes(1);
      expect(collectionService.create).not.toHaveBeenCalled();
      await expect(financialSnapshot(tenant.id)).resolves.toEqual({
        collections: 0,
        journals: 0,
        timelineEntries: 0,
        outboxActions: 0,
        ledgerEntries: 0,
        ledgerAllocations: 0,
        collectionAllocations: 0,
        overpayments: 0,
        auditLogs: 0,
      });
    });
  },
);
