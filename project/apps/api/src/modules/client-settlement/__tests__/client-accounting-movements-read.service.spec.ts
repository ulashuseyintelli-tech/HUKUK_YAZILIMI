import { ClientAccountingMovementsReadService } from '../client-accounting-movements-read.service';
import { ACCOUNTING_JOURNAL_PRIMARY_READ_MODE_ENV } from '../client-accounting-movements-read-mode';

const ORIGINAL_READ_MODE = process.env[ACCOUNTING_JOURNAL_PRIMARY_READ_MODE_ENV];

function result(overrides: any = {}) {
  return {
    items: overrides.items ?? [],
    page: overrides.page ?? 1,
    pageSize: overrides.pageSize ?? 50,
    total: overrides.total ?? 0,
  };
}

function readinessReport(candidateStatus: 'READY' | 'SHADOW_ONLY' | 'BLOCKED') {
  return {
    candidateScopes: [
      {
        scope: 'CLIENT_ACCOUNTING_MOVEMENTS_CLIENT_SPECIFIC',
        candidateStatus,
        fallbackRequired: candidateStatus !== 'READY',
        blockerCodes: candidateStatus === 'BLOCKED' ? ['LEGAL_LEDGER_UNSUPPORTED_CANCEL_REVERSAL_BACKFILL'] : [],
      },
    ],
  };
}

function buildService(overrides: any = {}) {
  const legacy = {
    getClientAccountingMovements: jest.fn().mockResolvedValue(overrides.legacyResult ?? result()),
  };
  const journalReader = {
    getMovements: jest.fn().mockResolvedValue(overrides.journalResult ?? result({
      items: [{ id: 'journal-row-1', sourceType: 'CLIENT_PAYOUT' }],
      total: 1,
    })),
  };
  const cutoverReadiness = {
    getCutoverReadiness: jest.fn().mockResolvedValue(overrides.readiness ?? readinessReport('READY')),
  };
  return {
    service: new ClientAccountingMovementsReadService(legacy as any, journalReader as any, cutoverReadiness as any),
    legacy,
    journalReader,
    cutoverReadiness,
  };
}

describe('ClientAccountingMovementsReadService', () => {
  afterEach(() => {
    if (ORIGINAL_READ_MODE === undefined) {
      delete process.env[ACCOUNTING_JOURNAL_PRIMARY_READ_MODE_ENV];
    } else {
      process.env[ACCOUNTING_JOURNAL_PRIMARY_READ_MODE_ENV] = ORIGINAL_READ_MODE;
    }
  });

  it('falls back to legacy projection when journal read mode is disabled', async () => {
    delete process.env[ACCOUNTING_JOURNAL_PRIMARY_READ_MODE_ENV];
    const { service, legacy, journalReader, cutoverReadiness } = buildService();

    const out = await service.getClientAccountingMovements('tenant-1', 'client-1', { currency: 'TRY' });

    expect(out).toEqual(expect.objectContaining({
      source: 'LEGACY_PROJECTION',
      readMode: 'disabled',
      fallbackReason: 'READ_MODE_DISABLED',
    }));
    expect(legacy.getClientAccountingMovements).toHaveBeenCalledWith('tenant-1', 'client-1', { currency: 'TRY' });
    expect(cutoverReadiness.getCutoverReadiness).not.toHaveBeenCalled();
    expect(journalReader.getMovements).not.toHaveBeenCalled();
  });

  it.each([
    ['shadow', 'SHADOW_ONLY'],
    ['pilot', 'READY'],
  ] as const)('uses journal reader in %s mode when the readiness gate is not blocked', async (mode, candidateStatus) => {
    process.env[ACCOUNTING_JOURNAL_PRIMARY_READ_MODE_ENV] = mode;
    const { service, legacy, journalReader, cutoverReadiness } = buildService({
      readiness: readinessReport(candidateStatus),
    });

    const out = await service.getClientAccountingMovements('tenant-1', 'client-1', {
      scope: 'case',
      caseId: 'case-1',
      group: 'CLIENT_SPECIFIC',
      currency: 'TRY',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T23:59:59.999Z',
    });

    expect(out).toEqual(expect.objectContaining({
      source: 'ACCOUNTING_JOURNAL',
      readMode: mode,
      fallbackReason: null,
      total: 1,
    }));
    expect(cutoverReadiness.getCutoverReadiness).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      currency: 'TRY',
      caseId: 'case-1',
      postedFrom: '2026-01-01T00:00:00.000Z',
      postedTo: '2026-01-31T23:59:59.999Z',
    });
    expect(journalReader.getMovements).toHaveBeenCalled();
    expect(legacy.getClientAccountingMovements).not.toHaveBeenCalled();
  });

  it('falls back to legacy projection when the cutover readiness gate is blocked', async () => {
    process.env[ACCOUNTING_JOURNAL_PRIMARY_READ_MODE_ENV] = 'pilot';
    const { service, legacy, journalReader } = buildService({
      readiness: readinessReport('BLOCKED'),
    });

    const out = await service.getClientAccountingMovements('tenant-1', 'client-1', { currency: 'TRY' });

    expect(out).toEqual(expect.objectContaining({
      source: 'LEGACY_PROJECTION',
      readMode: 'pilot',
      fallbackReason: 'CUTOVER_READINESS_BLOCKED',
    }));
    expect(legacy.getClientAccountingMovements).toHaveBeenCalled();
    expect(journalReader.getMovements).not.toHaveBeenCalled();
  });
});
