import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CaseBalanceService } from '../case-balance.service';

const D = (value: number | string) => new Prisma.Decimal(value);
const CREATED_AT = new Date('2026-06-30T09:10:11.000Z');

function buildHarness(options: { balance?: Prisma.Decimal } = {}) {
  const balance = {
    id: 'case-balance-1',
    tenantId: 'tenant-1',
    caseId: 'case-1',
    balance: options.balance ?? D(1000),
    lowThreshold: D(500),
  };
  const tx = {
    balanceLedger: { create: jest.fn() },
    caseBalance: { update: jest.fn() },
  };
  const prisma = {
    caseBalance: {
      upsert: jest.fn().mockResolvedValue(balance),
    },
    $transaction: jest.fn().mockImplementation(async (callback: (txArg: any) => Promise<unknown>) => callback(tx)),
  };
  const journalWriter = {
    write: jest.fn().mockResolvedValue({
      ok: true,
      output: {
        status: 'CREATED',
        journalEntryId: 'journal-1',
        idempotencyKey: 'idem-1',
        sourceVersion: 'version-1',
        lineCount: 2,
      },
    }),
  };
  const service = new CaseBalanceService(prisma as never, journalWriter as never);

  return { balance, tx, prisma, journalWriter, service };
}

describe('CaseBalanceService ACCT-1D-1 BalanceLedger journal wiring', () => {
  it('credit writes direct BalanceLedger journal in the same transaction', async () => {
    const { tx, journalWriter, service } = buildHarness();
    tx.balanceLedger.create.mockResolvedValue({
      id: 'bl-credit',
      tenantId: 'tenant-1',
      caseBalanceId: 'case-balance-1',
      type: 'CREDIT',
      amount: D(100),
      currency: 'TRY',
      source: 'expense_request:expense-1',
      sourceId: 'expense-1',
      description: 'credit',
      createdById: 'user-1',
      createdAt: CREATED_AT,
    });
    tx.caseBalance.update.mockResolvedValue({ balance: D(1100), lowThreshold: D(500) });

    const result = await service.credit('tenant-1', 'case-1', { amount: 100, source: 'expense_request:expense-1', sourceId: 'expense-1' }, 'user-1');

    expect(result).toEqual(expect.objectContaining({ success: true, newBalance: 1100, ledgerId: 'bl-credit' }));
    expect(journalWriter.write).toHaveBeenCalledTimes(1);
    expect(journalWriter.write).toHaveBeenCalledWith(
      {
        draft: expect.objectContaining({
          tenantId: 'tenant-1',
          sourceType: 'BALANCE_LEDGER',
          sourceId: 'bl-credit',
          sourceAction: 'posted',
          entryType: 'CLIENT_ADVANCE_LEDGER_RECORDED',
          lines: expect.arrayContaining([
            expect.objectContaining({ accountCode: 'CASH_CLEARING', direction: 'DEBIT', amount: '100', balanceLedgerId: 'bl-credit' }),
            expect.objectContaining({ accountCode: 'CLIENT_ADVANCE_BALANCE', direction: 'CREDIT', amount: '100', balanceLedgerId: 'bl-credit' }),
          ]),
        }),
      },
      tx,
    );
  });

  it('debit writes direct BalanceLedger journal with positive amount and reversed directions', async () => {
    const { tx, journalWriter, service } = buildHarness();
    tx.balanceLedger.create.mockResolvedValue({
      id: 'bl-debit',
      tenantId: 'tenant-1',
      caseBalanceId: 'case-balance-1',
      type: 'DEBIT',
      amount: D(-40),
      currency: 'TRY',
      source: 'operation:haciz',
      sourceId: 'operation-1',
      description: 'debit',
      createdById: 'user-1',
      createdAt: CREATED_AT,
    });
    tx.caseBalance.update.mockResolvedValue({ balance: D(960), lowThreshold: D(500) });

    const result = await service.debit('tenant-1', 'case-1', { amount: 40, source: 'operation:haciz', sourceId: 'operation-1' }, 'user-1');

    expect(result).toEqual(expect.objectContaining({ success: true, newBalance: 960, ledgerId: 'bl-debit', isLow: false }));
    const draft = journalWriter.write.mock.calls[0][0].draft;
    expect(draft.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: 'CLIENT_ADVANCE_BALANCE', direction: 'DEBIT', amount: '40', balanceLedgerId: 'bl-debit' }),
      expect.objectContaining({ accountCode: 'CASH_CLEARING', direction: 'CREDIT', amount: '40', balanceLedgerId: 'bl-debit' }),
    ]));
  });

  it('does not journal correlated disposition_line BalanceLedger rows', async () => {
    const { tx, journalWriter, service } = buildHarness();
    tx.balanceLedger.create.mockResolvedValue({
      id: 'bl-correlated',
      tenantId: 'tenant-1',
      caseBalanceId: 'case-balance-1',
      type: 'CREDIT',
      amount: D(50),
      currency: 'TRY',
      source: 'disposition_line:line-1',
      sourceId: 'line-1',
      description: 'correlated',
      createdById: 'user-1',
      createdAt: CREATED_AT,
    });
    tx.caseBalance.update.mockResolvedValue({ balance: D(1050), lowThreshold: D(500) });

    await service.credit('tenant-1', 'case-1', { amount: 50, source: 'disposition_line:line-1', sourceId: 'line-1' }, 'user-1');

    expect(journalWriter.write).not.toHaveBeenCalled();
  });

  it('does not journal ADJUST and propagates journal write failures for direct rows', async () => {
    const { tx, journalWriter, service } = buildHarness();
    tx.balanceLedger.create.mockResolvedValue({
      id: 'bl-adjust',
      tenantId: 'tenant-1',
      caseBalanceId: 'case-balance-1',
      type: 'ADJUST',
      amount: D(10),
      currency: 'TRY',
      source: 'manual_adjust',
      sourceId: null,
      description: 'adjust',
      createdById: 'user-1',
      createdAt: CREATED_AT,
    });
    tx.caseBalance.update.mockResolvedValue({ balance: D(1010), lowThreshold: D(500) });

    await service.adjust('tenant-1', 'case-1', 10, 'manual', 'user-1');
    expect(journalWriter.write).not.toHaveBeenCalled();

    tx.balanceLedger.create.mockResolvedValue({
      id: 'bl-credit-fail',
      tenantId: 'tenant-1',
      caseBalanceId: 'case-balance-1',
      type: 'CREDIT',
      amount: D(10),
      currency: 'TRY',
      source: 'manual',
      sourceId: null,
      description: 'credit',
      createdById: 'user-1',
      createdAt: CREATED_AT,
    });
    journalWriter.write.mockResolvedValueOnce({ ok: false, errors: [{ code: 'DB_WRITE_FAILED' }] });

    await expect(service.credit('tenant-1', 'case-1', { amount: 10, source: 'manual' }, 'user-1')).rejects.toBeInstanceOf(ConflictException);
  });
});
