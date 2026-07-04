import { ClientAccountingJournalMovementsReaderService } from '../client-accounting-journal-movements-reader.service';

function buildPrisma(lines: any[] = []) {
  return {
    caseClient: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'cc-A', caseId: 'case-1', case: { fileNumber: '2026/1' } },
      ]),
    },
    accountingJournalLine: {
      findMany: jest.fn().mockResolvedValue(lines),
    },
  } as any;
}

function journalLine(overrides: any = {}) {
  const sourceType = overrides.sourceType ?? 'COLLECTION_DISPOSITION_LINE';
  const sourceAction = overrides.sourceAction ?? 'posted';
  const sourceId = overrides.sourceId ?? 'source-1';
  return {
    id: overrides.id ?? `line-${sourceId}`,
    accountCode: overrides.accountCode ?? 'CLIENT_PAYABLE',
    direction: overrides.direction ?? 'CREDIT',
    amount: overrides.amount ?? '100.00',
    currency: overrides.currency ?? 'TRY',
    caseId: overrides.caseId ?? 'case-1',
    clientId: overrides.clientId ?? 'client-1',
    caseClientId: Object.prototype.hasOwnProperty.call(overrides, 'caseClientId') ? overrides.caseClientId : 'cc-A',
    dispositionLineId: overrides.dispositionLineId ?? null,
    payoutId: overrides.payoutId ?? null,
    offsetId: overrides.offsetId ?? null,
    journalEntry: {
      sourceType,
      sourceAction,
      sourceId,
      sourceOccurredAt: overrides.sourceOccurredAt ?? new Date('2026-01-01T00:00:00.000Z'),
      postedAt: overrides.postedAt ?? new Date('2026-01-01T00:00:00.000Z'),
    },
  };
}

describe('ClientAccountingJournalMovementsReaderService', () => {
  it('projects only client-specific mapped journal sources from CLIENT_PAYABLE caseClient lines', async () => {
    const prisma = buildPrisma([
      journalLine({
        id: 'line-disp',
        sourceType: 'COLLECTION_DISPOSITION_LINE',
        sourceAction: 'posted',
        sourceId: 'disp-line-1',
        dispositionLineId: 'disp-line-1',
        amount: '125.00',
        sourceOccurredAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      journalLine({
        id: 'line-payout',
        sourceType: 'CLIENT_PAYOUT',
        sourceAction: 'recorded',
        sourceId: 'payout-1',
        payoutId: 'payout-1',
        direction: 'DEBIT',
        amount: '40.00',
        sourceOccurredAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
      journalLine({
        id: 'line-offset-apply',
        sourceType: 'CLIENT_OFFSET',
        sourceAction: 'apply',
        sourceId: 'offset-apply-1',
        offsetId: 'offset-apply-1',
        direction: 'DEBIT',
        amount: '10.00',
        sourceOccurredAt: new Date('2026-01-03T00:00:00.000Z'),
      }),
      journalLine({
        id: 'line-offset-reversal',
        sourceType: 'CLIENT_OFFSET',
        sourceAction: 'reversal',
        sourceId: 'offset-reversal-1',
        offsetId: 'offset-reversal-1',
        amount: '10.00',
        sourceOccurredAt: new Date('2026-01-04T00:00:00.000Z'),
      }),
      journalLine({
        id: 'line-expense-leg',
        sourceType: 'CLIENT_OFFSET',
        sourceAction: 'apply',
        sourceId: 'offset-apply-1',
        accountCode: 'CLIENT_EXPENSE_RECEIVABLE',
        caseClientId: null,
      }),
      journalLine({
        id: 'line-balance',
        sourceType: 'BALANCE_LEDGER',
        sourceAction: 'posted',
        sourceId: 'balance-1',
      }),
      journalLine({
        id: 'line-orphan',
        sourceType: 'CLIENT_PAYOUT',
        sourceAction: 'recorded',
        sourceId: 'payout-orphan',
        caseClientId: null,
      }),
    ]);
    const service = new ClientAccountingJournalMovementsReaderService(prisma);

    const result = await service.getMovements('tenant-1', 'client-1', {
      currency: 'TRY',
      group: 'CLIENT_SPECIFIC',
    });

    expect(prisma.accountingJournalLine.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        accountCode: 'CLIENT_PAYABLE',
        currency: 'TRY',
        caseClientId: { in: ['cc-A'] },
        journalEntry: expect.objectContaining({
          tenantId: 'tenant-1',
          AND: expect.any(Array),
        }),
      }),
    }));
    expect(result.total).toBe(4);
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceType: 'COLLECTION_DISPOSITION',
        sourceId: 'disp-line-1',
        scopeGroup: 'CLIENT_SPECIFIC',
        clientEffect: 'INCREASE_CLIENT_PAYABLE',
        status: 'POSTED',
      }),
      expect.objectContaining({
        sourceType: 'CLIENT_PAYOUT',
        sourceId: 'payout-1',
        clientEffect: 'DECREASE_CLIENT_PAYABLE',
        status: 'RECORDED',
      }),
      expect.objectContaining({
        sourceType: 'CLIENT_OFFSET',
        sourceId: 'offset-apply-1',
        clientEffect: 'DECREASE_CLIENT_PAYABLE',
        status: 'APPLY',
      }),
      expect.objectContaining({
        sourceType: 'CLIENT_OFFSET',
        sourceId: 'offset-reversal-1',
        clientEffect: 'INCREASE_CLIENT_PAYABLE',
        status: 'REVERSAL',
      }),
    ]));
    expect(result.items.map((item) => item.caseClientId)).toEqual(['cc-A', 'cc-A', 'cc-A', 'cc-A']);
  });
});
