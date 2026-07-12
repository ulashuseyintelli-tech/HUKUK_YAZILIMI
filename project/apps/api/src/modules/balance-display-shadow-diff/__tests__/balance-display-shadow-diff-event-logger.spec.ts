import { Logger } from '@nestjs/common';
import {
  BalanceDisplayShadowDiffEventLogger,
  failureCodeForShadowReport,
} from '../balance-display-shadow-diff-event-logger';
import type { BalanceDisplayShadowDiffReport, ShadowAmountDiffStatus } from '../balance-display-shadow-diff.types';

function report(input: {
  legacyAvailable?: boolean;
  canonicalAvailable?: boolean;
  safe?: boolean;
  statuses?: ShadowAmountDiffStatus[];
  blockers?: string[];
} = {}): BalanceDisplayShadowDiffReport {
  const statuses = input.statuses ?? [];
  return {
    tenantId: 'tenant-secret',
    caseId: 'case-secret',
    sources: {
      legacyCalculationSummary: { available: input.legacyAvailable ?? true },
      canonicalBalanceDisplay: { available: input.canonicalAvailable ?? true },
    },
    totals: {
      legacy: { totalDebtAmount: 12345 },
      canonical: { totalDebtAmount: 12346 },
      diffs: statuses.map((status, index) => ({ code: `DIFF_${index}`, status })),
    },
    bucketDiffs: [],
    diagnostics: [{ message: 'raw-secret-message', stack: 'raw-stack' }],
    cutoverReadiness: {
      safeForPrimaryDisplay: input.safe ?? false,
      blockers: input.blockers ?? [],
    },
  } as unknown as BalanceDisplayShadowDiffReport;
}

function parsedLastCall(spy: jest.SpyInstance): Record<string, unknown> {
  const value = spy.mock.calls.at(-1)?.[0];
  expect(typeof value).toBe('string');
  return JSON.parse(value as string) as Record<string, unknown>;
}

describe('BalanceDisplayShadowDiffEventLogger', () => {
  afterEach(() => jest.restoreAllMocks());

  it('start ve successful component olaylarini INFO olarak emit eder', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const eventLogger = new BalanceDisplayShadowDiffEventLogger();

    eventLogger.recordComparisonStarted();
    eventLogger.recordComponent('LEGACY', true);

    expect(log).toHaveBeenCalledTimes(2);
    expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({
      event_type: 'ADR014_SHADOW_COMPARISON_STARTED',
      component: 'SHADOW_COMPARE',
      operation: 'COMPARE',
      result: 'SUCCESS',
      failure_code: 'NONE',
    });
    expect(parsedLastCall(log)).toMatchObject({
      event_type: 'ADR014_SHADOW_COMPONENT_COMPLETED',
      component: 'LEGACY',
      operation: 'CALCULATE',
      result: 'SUCCESS',
      failure_code: 'NONE',
    });
  });

  it('failed legacy/canonical component olaylarini raw error olmadan CRITICAL emit eder', () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const eventLogger = new BalanceDisplayShadowDiffEventLogger();

    eventLogger.recordComponent('LEGACY', false);
    eventLogger.recordComponent('CANONICAL', false);

    expect(error).toHaveBeenCalledTimes(2);
    expect(JSON.parse(error.mock.calls[0][0] as string)).toMatchObject({
      event_type: 'ADR014_SHADOW_COMPONENT_FAILED',
      severity: 'CRITICAL',
      component: 'LEGACY',
      result: 'ERROR',
      failure_code: 'LEGACY_SOURCE_ERROR',
    });
    expect(parsedLastCall(error)).toMatchObject({
      component: 'CANONICAL',
      failure_code: 'CANONICAL_SOURCE_ERROR',
    });
  });

  it('safe report icin tek successful terminal comparison olayi üretir', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const eventLogger = new BalanceDisplayShadowDiffEventLogger();

    eventLogger.recordReport(report({ safe: true }));

    expect(log).toHaveBeenCalledTimes(1);
    expect(parsedLastCall(log)).toMatchObject({
      event_type: 'ADR014_SHADOW_COMPARISON_COMPLETED',
      severity: 'INFO',
      component: 'SHADOW_COMPARE',
      result: 'SUCCESS',
      failure_code: 'NONE',
    });
  });

  it.each([
    [['MAJOR_DELTA'], [], 'NON_ZERO_FINANCIAL_DELTA'],
    [['LEGACY_ONLY'], [], 'MANDATORY_COMPARISON_UNKNOWN'],
    [['NOT_COMPARABLE'], [], 'MANDATORY_FIELD_NOT_COMPARABLE'],
    [[], ['CURRENCY_MISMATCH'], 'CURRENCY_INTEGRITY_FAILURE'],
    [[], ['CLAIM_ITEM_AUTHORITY_CONTAMINATION'], 'AUTHORITY_INTEGRITY_FAILURE'],
    [[], ['MISSING_PAYMENT_ALLOCATION_COMPARISON_EVIDENCE'], 'MISSING_PAYMENT_ALLOCATION_EVIDENCE'],
    [[], ['MISSING_INTEREST_BASE_COMPARISON_EVIDENCE'], 'MISSING_INTEREST_BASE_EVIDENCE'],
    [[], ['MISSING_FEE_PROJECTION_COMPARISON_EVIDENCE'], 'MISSING_FEE_PROJECTION_EVIDENCE'],
  ] as const)('blocked report mapping: %j / %j -> %s', (statuses, blockers, expected) => {
    const value = report({ statuses: [...statuses], blockers: [...blockers] });
    expect(failureCodeForShadowReport(value)).toBe(expected);
  });

  it('blocked financial reportu WARNING degil HARD_STOP olarak emit eder', () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const eventLogger = new BalanceDisplayShadowDiffEventLogger();

    eventLogger.recordReport(report({ statuses: ['MAJOR_DELTA'] }));

    expect(parsedLastCall(error)).toMatchObject({
      event_type: 'ADR014_SHADOW_COMPARISON_BLOCKED',
      severity: 'HARD_STOP',
      operation: 'EVALUATE_READINESS',
      result: 'BLOCKED',
      failure_code: 'NON_ZERO_FINANCIAL_DELTA',
    });
  });

  it.each([
    [false, true, 'LEGACY_SOURCE_UNAVAILABLE'],
    [true, false, 'CANONICAL_SOURCE_UNAVAILABLE'],
  ] as const)('source availability %s/%s icin deterministic unavailable olayi üretir', (legacy, canonical, code) => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const eventLogger = new BalanceDisplayShadowDiffEventLogger();

    eventLogger.recordReport(report({ legacyAvailable: legacy, canonicalAvailable: canonical }));

    expect(parsedLastCall(error)).toMatchObject({
      event_type: 'ADR014_SHADOW_COMPARISON_UNAVAILABLE',
      severity: 'HARD_STOP',
      result: 'UNAVAILABLE',
      failure_code: code,
    });
  });

  it('raw report PII, amount, message, stack veya arbitrary metadata serialize etmez', () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const eventLogger = new BalanceDisplayShadowDiffEventLogger();

    eventLogger.recordReport(report({ statuses: ['NOT_COMPARABLE'] }));

    const serialized = error.mock.calls[0][0] as string;
    for (const forbidden of ['tenant-secret', 'case-secret', '12345', '12346', 'raw-secret-message', 'raw-stack']) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(Object.keys(JSON.parse(serialized))).not.toContain('metadata');
  });

  it('Nest Logger sink hatasini business flowa tasimaz', () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {
      throw new Error('sink down');
    });
    const eventLogger = new BalanceDisplayShadowDiffEventLogger();

    expect(() => eventLogger.recordComparisonStarted()).not.toThrow();
  });
});
