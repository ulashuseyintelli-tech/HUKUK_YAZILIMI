import type {
  FinancialStatementReadReport,
  FinancialStatementReadRequest,
} from '../accounting-journal-financial-statement.types';

const readRequest: FinancialStatementReadRequest = {
  tenantId: 'tenant-1',
  statementType: 'CLIENT_CASE_STATEMENT',
  period: {
    from: '2026-06-01T00:00:00.000Z',
    to: '2026-06-30T23:59:59.999Z',
    dateBasis: 'postedAt',
  },
  currency: 'TRY',
  scope: {
    caseId: 'case-1',
    clientId: 'client-1',
    caseClientId: 'case-client-1',
  },
};

const report: FinancialStatementReadReport = {
  tenantId: 'tenant-1',
  statementType: 'CLIENT_CASE_STATEMENT',
  surface: 'FINANCIAL_STATEMENT',
  sourceBasis: 'JOURNAL_DERIVED_PROJECTION',
  period: readRequest.period,
  currency: 'TRY',
  scope: readRequest.scope,
  opening: { amount: '0.00', currency: 'TRY' },
  movements: [
    {
      lineNo: 1,
      statementDate: '2026-06-15T10:30:00.000Z',
      accountCode: 'CLIENT_PAYABLE',
      direction: 'CREDIT',
      amount: '100.00',
      currency: 'TRY',
      caseId: 'case-1',
      clientId: 'client-1',
      caseClientId: 'case-client-1',
      source: {
        sourceType: 'COLLECTION_DISPOSITION_LINE',
        sourceAction: 'posted',
        displayRef: 'collection-distribution:1',
      },
      note: 'Journal-derived client payable movement',
    },
  ],
  closing: { amount: '100.00', currency: 'TRY' },
  reconciliation: {
    status: 'READY',
    trialBalanceEvidenceStatus: 'BALANCED',
    legalLedgerComparisonStatus: 'PENDING',
    warnings: [
      {
        code: 'LEGAL_LEDGER_COMPARISON_NOT_AUTHORITATIVE',
        message: 'Legal ledger comparison is reconciliation evidence, not a legal authority switch.',
      },
    ],
  },
};

const FORBIDDEN_INTERNAL_KEYS = new Set([
  'actorId',
  'diagnostics',
  'fxRate',
  'idempotencyKey',
  'idempotencyMaterial',
  'journalEntryId',
  'ledgerAllocationId',
  'ledgerEntryId',
  'metadata',
  'postedById',
  'reportingCurrency',
  'sourceBreakdown',
  'sourceHash',
  'sourceId',
  'tbk100Allocation',
  'trialBalanceRows',
]);

function collectForbiddenKeys(value: unknown, path = '$'): string[] {
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectForbiddenKeys(item, `${path}[${index}]`));
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`;
    const current = FORBIDDEN_INTERNAL_KEYS.has(key) ? [childPath] : [];
    return [...current, ...collectForbiddenKeys(child, childPath)];
  });
}

describe('ACCT-5A Financial Statement read contract', () => {
  it('locks the first narrow statement scope to auth tenant, statement type, period, date basis, and currency', () => {
    expect(readRequest).toEqual({
      tenantId: 'tenant-1',
      statementType: 'CLIENT_CASE_STATEMENT',
      period: {
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-30T23:59:59.999Z',
        dateBasis: 'postedAt',
      },
      currency: 'TRY',
      scope: {
        caseId: 'case-1',
        clientId: 'client-1',
        caseClientId: 'case-client-1',
      },
    });
    expect((readRequest as Record<string, unknown>).tenantIdOverride).toBeUndefined();
    expect((readRequest as Record<string, unknown>).queryTenantId).toBeUndefined();
  });

  it('keeps the response as a reporting statement surface, not a Trial Balance diagnostic contract', () => {
    expect(report.surface).toBe('FINANCIAL_STATEMENT');
    expect(report.sourceBasis).toBe('JOURNAL_DERIVED_PROJECTION');
    expect(report.reconciliation.trialBalanceEvidenceStatus).toBe('BALANCED');
    expect((report as Record<string, unknown>).rows).toBeUndefined();
    expect((report as Record<string, unknown>).totals).toBeUndefined();
    expect((report as Record<string, unknown>).diagnostics).toBeUndefined();
    expect((report as Record<string, unknown>).sourceBreakdown).toBeUndefined();
  });

  it('keeps currency explicit and forbids silent FX conversion fields', () => {
    expect(report.currency).toBe('TRY');
    expect(report.opening.currency).toBe(report.currency);
    expect(report.closing.currency).toBe(report.currency);
    expect(report.movements.every((movement) => movement.currency === report.currency)).toBe(true);
    expect((report as Record<string, unknown>).reportingCurrency).toBeUndefined();
    expect((report as Record<string, unknown>).fxRate).toBeUndefined();
  });

  it('does not expose writer, raw journal, legal ledger, or TBK100 internals in the read contract', () => {
    expect(collectForbiddenKeys(report)).toEqual([]);
    expect(report.reconciliation.legalLedgerComparisonStatus).toBe('PENDING');
    expect(report.reconciliation.warnings).toEqual([
      expect.objectContaining({ code: 'LEGAL_LEDGER_COMPARISON_NOT_AUTHORITATIVE' }),
    ]);
  });
});