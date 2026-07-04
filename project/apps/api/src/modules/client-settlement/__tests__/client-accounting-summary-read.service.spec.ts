import { ClientAccountingSummaryReadService } from '../client-accounting-summary-read.service';
import { ACCOUNTING_JOURNAL_PRIMARY_READ_MODE_ENV } from '../client-accounting-movements-read-mode';

const ORIGINAL_READ_MODE = process.env[ACCOUNTING_JOURNAL_PRIMARY_READ_MODE_ENV];

function summary(overrides: any = {}) {
  return {
    clientId: 'client-1',
    currency: 'TRY',
    clientScoped: {
      payableNet: '0',
      paidToClient: '0',
      expenseRequested: '0',
      expensePaid: '0',
      expenseUnpaid: '0',
      offsetApplied: '0',
      offsettableNetPosition: '0',
    },
    caseScopedContext: {
      debtorCollection: '0',
      pendingDistribution: '0',
      advanceBalance: '0',
    },
    needsReview: false,
    caseBreakdown: [],
    ...overrides,
  };
}

function readinessReport(candidateStatus: 'READY' | 'SHADOW_ONLY' | 'BLOCKED') {
  return {
    candidateScopes: [
      {
        scope: 'CLIENT_ACCOUNTING_SUMMARY',
        candidateStatus,
        fallbackRequired: true,
        blockerCodes: candidateStatus === 'BLOCKED'
          ? ['JOURNAL_DERIVED_CLIENT_ACCOUNTING_SUMMARY_READER_MISSING']
          : [],
      },
    ],
  };
}

function buildService(overrides: any = {}) {
  const legacy = {
    getClientAccountingSummary: jest.fn().mockResolvedValue(overrides.legacyResult ?? summary()),
  };
  const cutoverReadiness = {
    getCutoverReadiness: jest.fn().mockResolvedValue(overrides.readiness ?? readinessReport('BLOCKED')),
  };
  return {
    service: new ClientAccountingSummaryReadService(legacy as any, cutoverReadiness as any),
    legacy,
    cutoverReadiness,
  };
}

describe('ClientAccountingSummaryReadService', () => {
  afterEach(() => {
    if (ORIGINAL_READ_MODE === undefined) {
      delete process.env[ACCOUNTING_JOURNAL_PRIMARY_READ_MODE_ENV];
    } else {
      process.env[ACCOUNTING_JOURNAL_PRIMARY_READ_MODE_ENV] = ORIGINAL_READ_MODE;
    }
  });

  it('returns legacy summary without readiness lookup when read mode is disabled', async () => {
    delete process.env[ACCOUNTING_JOURNAL_PRIMARY_READ_MODE_ENV];
    const { service, legacy, cutoverReadiness } = buildService();

    const out = await service.getClientAccountingSummaryReadDecision('tenant-1', 'client-1', 'TRY');

    expect(out).toEqual(expect.objectContaining({
      source: 'LEGACY_PROJECTION',
      readMode: 'disabled',
      fallbackReason: 'READ_MODE_DISABLED',
      hybridReadBoundary: expect.objectContaining({
        mode: 'HYBRID_PRIMARY_BOUNDARY',
        caseScopedContextSource: 'LEGACY_CONTEXT',
        journalOnlyPrimarySwitch: 'BLOCKED',
      }),
      primarySwitchUnchanged: true,
    }));
    expect(legacy.getClientAccountingSummary).toHaveBeenCalledWith('tenant-1', 'client-1', 'TRY');
    expect(cutoverReadiness.getCutoverReadiness).not.toHaveBeenCalled();
  });

  it.each([
    ['shadow', 'BLOCKED', 'CUTOVER_READINESS_BLOCKED'],
    ['pilot', 'BLOCKED', 'CUTOVER_READINESS_BLOCKED'],
    ['enforce', 'BLOCKED', 'CUTOVER_READINESS_BLOCKED'],
    ['shadow', 'SHADOW_ONLY', 'CUTOVER_READINESS_SHADOW_ONLY'],
    ['pilot', 'SHADOW_ONLY', 'CUTOVER_READINESS_SHADOW_ONLY'],
    ['enforce', 'SHADOW_ONLY', 'CUTOVER_READINESS_SHADOW_ONLY'],
  ] as const)('falls back to legacy in %s mode when summary readiness is %s', async (mode, candidateStatus, fallbackReason) => {
    process.env[ACCOUNTING_JOURNAL_PRIMARY_READ_MODE_ENV] = mode;
    const { service, legacy, cutoverReadiness } = buildService({
      readiness: readinessReport(candidateStatus),
    });

    const out = await service.getClientAccountingSummaryReadDecision('tenant-1', 'client-1', 'USD');

    expect(out).toEqual(expect.objectContaining({
      source: 'LEGACY_PROJECTION',
      readMode: mode,
      fallbackReason,
      hybridReadBoundary: expect.objectContaining({
        clientScopedSource: 'ACCOUNTING_JOURNAL_SHADOW_ELIGIBLE',
        caseScopedContextSource: 'LEGACY_CONTEXT',
        blockerCodes: [
          'COLLECTION_JOURNAL_SOURCE_MISSING',
          'CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING',
        ],
      }),
      primarySwitchUnchanged: true,
    }));
    expect(cutoverReadiness.getCutoverReadiness).toHaveBeenCalledWith({ tenantId: 'tenant-1', currency: 'USD' });
    expect(legacy.getClientAccountingSummary).toHaveBeenCalledWith('tenant-1', 'client-1', 'USD');
  });

  it('keeps legacy fallback even if readiness becomes READY because journal summary reader is not implemented', async () => {
    process.env[ACCOUNTING_JOURNAL_PRIMARY_READ_MODE_ENV] = 'enforce';
    const { service, legacy } = buildService({ readiness: readinessReport('READY') });

    const out = await service.getClientAccountingSummaryReadDecision('tenant-1', 'client-1', 'TRY');

    expect(out).toEqual(expect.objectContaining({
      source: 'LEGACY_PROJECTION',
      readMode: 'enforce',
      fallbackReason: 'JOURNAL_SUMMARY_READER_MISSING',
      hybridReadBoundary: expect.objectContaining({
        mode: 'HYBRID_PRIMARY_BOUNDARY',
        journalOnlyPrimarySwitch: 'BLOCKED',
      }),
      primarySwitchUnchanged: true,
    }));
    expect(legacy.getClientAccountingSummary).toHaveBeenCalledWith('tenant-1', 'client-1', 'TRY');
  });

  it('preserves public summary response shape by returning only legacy data from getClientAccountingSummary', async () => {
    process.env[ACCOUNTING_JOURNAL_PRIMARY_READ_MODE_ENV] = 'pilot';
    const legacyResult = summary({ clientScoped: { ...summary().clientScoped, payableNet: '42' } });
    const { service } = buildService({ legacyResult, readiness: readinessReport('SHADOW_ONLY') });

    await expect(service.getClientAccountingSummary('tenant-1', 'client-1', 'TRY')).resolves.toBe(legacyResult);
  });
});