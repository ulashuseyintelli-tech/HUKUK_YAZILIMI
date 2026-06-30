import { Prisma } from '@prisma/client';
import { AccountingJournalLegalShadowCompareService } from '../accounting-journal-legal-shadow-compare.service';

const D = (value: string | number) => new Prisma.Decimal(value);

function prismaMock(overrides: Record<string, unknown[]> = {}) {
  return {
    accountingJournalLine: { findMany: jest.fn().mockResolvedValue(overrides.journalLines ?? []) },
    collectionDispositionLine: { findMany: jest.fn().mockResolvedValue(overrides.dispositionLines ?? []) },
    clientPayout: { findMany: jest.fn().mockResolvedValue(overrides.clientPayouts ?? []) },
    clientOffset: { findMany: jest.fn().mockResolvedValue(overrides.clientOffsets ?? []) },
    balanceLedger: { findMany: jest.fn().mockResolvedValue(overrides.balanceLedgerRows ?? []) },
    ledgerEntry: { findMany: jest.fn().mockResolvedValue(overrides.ledgerEntries ?? []) },
  } as any;
}

function journalLine(overrides: any = {}) {
  return {
    accountCode: overrides.accountCode ?? 'CASH_CLEARING',
    direction: overrides.direction ?? 'DEBIT',
    amount: D(overrides.amount ?? '100.00'),
    currency: overrides.currency ?? 'TRY',
    caseId: overrides.caseId ?? 'case-1',
    clientId: overrides.clientId ?? null,
    caseClientId: overrides.caseClientId ?? null,
    journalEntry: {
      sourceType: overrides.sourceType ?? 'COLLECTION_DISPOSITION_LINE',
      sourceAction: overrides.sourceAction ?? 'posted',
      sourceId: overrides.sourceId ?? 'dl-1',
    },
  };
}

function dispositionLine(overrides: any = {}) {
  return {
    id: overrides.id ?? 'dl-1',
    type: overrides.type ?? 'CLIENT_PAYABLE',
    amount: D(overrides.amount ?? '100.00'),
    caseClientId: overrides.caseClientId ?? 'cc-A',
    disposition: {
      caseId: overrides.caseId ?? 'case-1',
      collectionId: overrides.collectionId ?? 'col-1',
      currency: overrides.currency ?? 'TRY',
      manualReversalRequiredAt: overrides.manualReversalRequiredAt ?? null,
    },
  };
}

function clientPayout(overrides: any = {}) {
  return {
    id: overrides.id ?? 'payout-1',
    tenantId: overrides.tenantId ?? 'tenant-1',
    caseId: overrides.caseId ?? 'case-1',
    caseClientId: overrides.caseClientId ?? 'cc-A',
    amount: D(overrides.amount ?? '40.00'),
    currency: overrides.currency ?? 'TRY',
  };
}

function clientOffset(overrides: any = {}) {
  return {
    id: overrides.id ?? 'offset-1',
    tenantId: overrides.tenantId ?? 'tenant-1',
    clientId: overrides.clientId ?? 'client-1',
    amount: D(overrides.amount ?? '15.00'),
    currency: overrides.currency ?? 'TRY',
    kind: overrides.kind ?? 'APPLY',
    payableCaseId: overrides.payableCaseId ?? 'case-payable',
    payableCaseClientId: overrides.payableCaseClientId ?? 'cc-payable',
    expenseCaseId: overrides.expenseCaseId ?? 'case-expense',
    expenseRequestId: overrides.expenseRequestId ?? 'er-1',
  };
}

function balanceLedger(overrides: any = {}) {
  return {
    id: overrides.id ?? 'bl-1',
    tenantId: overrides.tenantId ?? 'tenant-1',
    amount: D(overrides.amount ?? '20.00'),
    currency: overrides.currency ?? 'TRY',
    type: overrides.type ?? 'CREDIT',
    source: overrides.source ?? 'manual',
    sourceId: overrides.sourceId ?? null,
    caseBalance: { caseId: overrides.caseId ?? 'case-advance' },
  };
}

function ledgerEntry(overrides: any = {}) {
  return {
    id: overrides.id ?? 'le-1',
    tenantId: overrides.tenantId ?? 'tenant-1',
    caseId: overrides.caseId ?? 'case-legal',
    collectionId: overrides.collectionId ?? null,
    reversesLedgerEntryId: overrides.reversesLedgerEntryId ?? null,
    entryType: overrides.entryType ?? 'PAYMENT',
    amount: D(overrides.amount ?? '120.00'),
    currency: overrides.currency ?? 'TRY',
    sourceType: overrides.sourceType ?? null,
    sourceId: overrides.sourceId ?? null,
    allocations: overrides.allocations ?? [{ amount: D('120.00') }],
  };
}

describe('AccountingJournalLegalShadowCompareService', () => {
  it('produces MATCH rows for representative projection sources and blocks primary cutover without legal sample', async () => {
    const prisma = prismaMock({
      journalLines: [
        journalLine({ sourceId: 'dl-pay', accountCode: 'CASH_CLEARING', direction: 'DEBIT', amount: '100.00', caseId: 'case-1', caseClientId: 'cc-A' }),
        journalLine({ sourceId: 'dl-pay', accountCode: 'CLIENT_PAYABLE', direction: 'CREDIT', amount: '100.00', caseId: 'case-1', caseClientId: 'cc-A' }),
        journalLine({ sourceType: 'CLIENT_PAYOUT', sourceAction: 'recorded', sourceId: 'payout-1', accountCode: 'CLIENT_PAYABLE', direction: 'DEBIT', amount: '40.00', caseId: 'case-1', caseClientId: 'cc-A' }),
        journalLine({ sourceType: 'CLIENT_PAYOUT', sourceAction: 'recorded', sourceId: 'payout-1', accountCode: 'CASH_CLEARING', direction: 'CREDIT', amount: '40.00', caseId: 'case-1', caseClientId: 'cc-A' }),
        journalLine({ sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', sourceId: 'offset-1', accountCode: 'CLIENT_PAYABLE', direction: 'DEBIT', amount: '15.00', caseId: 'case-payable', clientId: 'client-1', caseClientId: 'cc-payable' }),
        journalLine({ sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', sourceId: 'offset-1', accountCode: 'CLIENT_EXPENSE_RECEIVABLE', direction: 'CREDIT', amount: '15.00', caseId: 'case-expense', clientId: 'client-1', caseClientId: null }),
        journalLine({ sourceType: 'BALANCE_LEDGER', sourceAction: 'posted', sourceId: 'bl-credit', accountCode: 'CASH_CLEARING', direction: 'DEBIT', amount: '20.00', caseId: 'case-advance' }),
        journalLine({ sourceType: 'BALANCE_LEDGER', sourceAction: 'posted', sourceId: 'bl-credit', accountCode: 'CLIENT_ADVANCE_BALANCE', direction: 'CREDIT', amount: '20.00', caseId: 'case-advance' }),
      ],
      dispositionLines: [dispositionLine({ id: 'dl-pay', amount: '100.00', caseClientId: 'cc-A' })],
      clientPayouts: [clientPayout({ id: 'payout-1', amount: '40.00' })],
      clientOffsets: [clientOffset({ id: 'offset-1', amount: '15.00' })],
      balanceLedgerRows: [balanceLedger({ id: 'bl-credit', amount: '20.00' })],
      ledgerEntries: [],
    });

    const report = await new AccountingJournalLegalShadowCompareService(prisma).compare({ tenantId: 'tenant-1', currency: 'TRY' });

    expect(report.rows).toHaveLength(8);
    expect(report.rows.every((row) => row.matchStatus === 'MATCH')).toBe(true);
    expect(report.coverage).toEqual(expect.objectContaining({ matchRows: 8, divergentRows: 0, summaryOnlyRows: 0, engineOnlyRows: 0 }));
    expect(report.cutoverReadiness.safeForOptInShadow).toBe(true);
    expect(report.cutoverReadiness.safeForPrimaryCutover).toBe(false);
    expect(report.cutoverReadiness.blockers).toContain('LEGAL_LEDGER_SAMPLE_MISSING');
  });

  it('classifies divergent, summary-only and engine-only rows fail-closed', async () => {
    const prisma = prismaMock({
      journalLines: [
        journalLine({ sourceId: 'dl-1', accountCode: 'CASH_CLEARING', direction: 'DEBIT', amount: '90.00', caseClientId: 'cc-A' }),
        journalLine({ sourceType: 'CLIENT_PAYOUT', sourceAction: 'recorded', sourceId: 'payout-orphan', accountCode: 'CASH_CLEARING', direction: 'CREDIT', amount: '10.00', caseClientId: 'cc-A' }),
      ],
      dispositionLines: [dispositionLine({ id: 'dl-1', amount: '100.00', caseClientId: 'cc-A' })],
    });

    const report = await new AccountingJournalLegalShadowCompareService(prisma).compare({ tenantId: 'tenant-1' });
    const statuses = report.rows.map((row) => row.matchStatus);

    expect(statuses).toEqual(expect.arrayContaining(['DIVERGENT', 'SUMMARY_ONLY', 'ENGINE_ONLY']));
    expect(report.cutoverReadiness.blockers).toEqual(
      expect.arrayContaining(['DIVERGENT_SHADOW_ROW', 'SUMMARY_ONLY_SHADOW_ROW', 'ENGINE_ONLY_SHADOW_ROW']),
    );
    expect(report.cutoverReadiness.safeForPrimaryCutover).toBe(false);
  });

  it('reports LedgerEntry/LedgerAllocation as legal summary-only until journal source mapping exists', async () => {
    const prisma = prismaMock({
      ledgerEntries: [
        ledgerEntry({
          id: 'le-payment',
          amount: '120.00',
          allocations: [{ amount: D('70.00') }, { amount: D('50.00') }],
        }),
      ],
    });

    const report = await new AccountingJournalLegalShadowCompareService(prisma).compare({ tenantId: 'tenant-1' });
    const legal = report.rows.find((row) => row.sourceType === 'LEGAL_LEDGER');

    expect(legal).toEqual(
      expect.objectContaining({
        sourceId: 'le-payment',
        accountCode: 'LEGAL_LEDGER_ALLOCATED_AMOUNT',
        legalProjectionAmount: '120.00',
        journalAmount: null,
        matchStatus: 'SUMMARY_ONLY',
        legalSourcePolicy: 'BLOCKED',
        legalSourcePolicyCode: 'LEGAL_LEDGER_SOURCE_UNMAPPED',
      }),
    );
    expect(legal?.blockerCodes).toEqual(expect.arrayContaining(['LEGAL_LEDGER_ACCOUNTING_SOURCE_UNMAPPED', 'LEGAL_LEDGER_SOURCE_UNMAPPED']));
    expect(report.cutoverReadiness.blockers).toEqual(expect.arrayContaining(['LEGAL_LEDGER_ACCOUNTING_SOURCE_UNMAPPED', 'LEGAL_LEDGER_SOURCE_UNMAPPED']));
    expect(report.cutoverReadiness.safeForPrimaryCutover).toBe(false);
  });

  it('classifies legal source policy matrix without silently dropping legal rows', async () => {
    const prisma = prismaMock({
      ledgerEntries: [
        ledgerEntry({
          id: 'le-mapped-payout',
          sourceType: 'CLIENT_PAYOUT',
          sourceId: 'payout-mapped',
          amount: '45.00',
          allocations: [{ amount: D('45.00') }],
        }),
        ledgerEntry({
          id: 'le-manual',
          sourceType: 'MANUEL',
          sourceId: 'manual-1',
          entryType: 'ADJUSTMENT',
          amount: '10.00',
          allocations: [{ amount: D('10.00') }],
        }),
        ledgerEntry({
          id: 'le-null-source',
          amount: '20.00',
          allocations: [{ amount: D('20.00') }],
        }),
        ledgerEntry({
          id: 'le-free-form',
          sourceType: 'LEGACY_IMPORT',
          sourceId: 'legacy-1',
          amount: '30.00',
          allocations: [{ amount: D('30.00') }],
        }),
        ledgerEntry({
          id: 'le-cancel',
          sourceType: 'COLLECTION_CANCEL',
          sourceId: 'col-cancel',
          entryType: 'REVERSAL',
          reversesLedgerEntryId: 'le-original',
          amount: '-40.00',
          allocations: [{ amount: D('-40.00') }],
        }),
      ],
    });

    const report = await new AccountingJournalLegalShadowCompareService(prisma).compare({ tenantId: 'tenant-1' });
    const byId = new Map(report.rows.map((row) => [row.sourceId, row]));

    expect(report.coverage).toEqual(expect.objectContaining({
      legalMappedRows: 1,
      legalAcceptedExclusionRows: 1,
      legalBlockedRows: 3,
    }));
    expect(byId.get('payout-mapped')).toEqual(expect.objectContaining({
      sourceType: 'CLIENT_PAYOUT',
      sourceAction: 'recorded',
      legalSourcePolicy: 'MAPPED',
      legalSourcePolicyCode: 'LEGAL_LEDGER_SOURCE_MAPPED',
    }));
    expect(byId.get('le-manual')).toEqual(expect.objectContaining({
      sourceType: 'LEGAL_LEDGER',
      legalSourcePolicy: 'ACCEPTED_EXCLUSION',
      legalSourcePolicyCode: 'LEGAL_LEDGER_ACCEPTED_EXCLUSION',
    }));
    expect(byId.get('le-null-source')).toEqual(expect.objectContaining({
      legalSourcePolicy: 'BLOCKED',
      legalSourcePolicyCode: 'LEGAL_LEDGER_SOURCE_UNMAPPED',
    }));
    expect(byId.get('le-free-form')).toEqual(expect.objectContaining({
      legalSourcePolicy: 'BLOCKED',
      legalSourcePolicyCode: 'LEGAL_LEDGER_SOURCE_UNMAPPED',
    }));
    expect(byId.get('le-cancel')).toEqual(expect.objectContaining({
      legalSourcePolicy: 'BLOCKED',
      legalSourcePolicyCode: 'LEGAL_LEDGER_UNSUPPORTED_CANCEL_REVERSAL_BACKFILL',
    }));
    expect(report.rows).toHaveLength(5);
    expect(report.cutoverReadiness.blockers).toEqual(expect.arrayContaining([
      'LEGAL_LEDGER_ACCEPTED_EXCLUSION',
      'LEGAL_LEDGER_SOURCE_UNMAPPED',
      'LEGAL_LEDGER_UNSUPPORTED_CANCEL_REVERSAL_BACKFILL',
      'SUMMARY_ONLY_SHADOW_ROW',
    ]));
    expect(report.cutoverReadiness.safeForPrimaryCutover).toBe(false);
  });
  it('keeps unsupported sources as blockers and suppresses correlated disposition BalanceLedger rows', async () => {
    const prisma = prismaMock({
      dispositionLines: [
        dispositionLine({ id: 'dl-other', type: 'OTHER', amount: '7.00', caseClientId: null }),
        dispositionLine({
          id: 'dl-manual',
          type: 'CLIENT_PAYABLE',
          amount: '8.00',
          manualReversalRequiredAt: new Date('2026-06-30T08:00:00.000Z'),
        }),
      ],
      balanceLedgerRows: [
        balanceLedger({ id: 'bl-adjust', type: 'ADJUST', amount: '5.00' }),
        balanceLedger({ id: 'bl-suppressed', type: 'CREDIT', amount: '9.00', source: 'disposition_line:dl-offset', sourceId: null }),
      ],
    });

    const report = await new AccountingJournalLegalShadowCompareService(prisma).compare({ tenantId: 'tenant-1' });

    expect(report.coverage.suppressedSourceCount).toBe(1);
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain('SUPPRESSED_CORRELATED_BALANCE_LEDGER');
    expect(report.cutoverReadiness.blockers).toEqual(
      expect.arrayContaining([
        'UNSUPPORTED_DISPOSITION_LINE_TYPE',
        'MANUAL_REVERSAL_DISPOSITION_LINE_UNMAPPED',
        'UNSUPPORTED_BALANCE_LEDGER_TYPE',
      ]),
    );
    expect(report.rows.filter((row) => row.matchStatus === 'SUMMARY_ONLY')).toHaveLength(3);
  });
});
