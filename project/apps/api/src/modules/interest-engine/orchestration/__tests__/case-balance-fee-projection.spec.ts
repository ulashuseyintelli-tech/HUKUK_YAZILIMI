import { AncillaryType } from '../../types/domain.types';
import {
  buildCaseBalanceFeeProjection,
  type BuildCaseBalanceFeeProjectionInput,
} from '../case-balance-fee-projection';

function source(overrides: Partial<BuildCaseBalanceFeeProjectionInput['sourceItems'][number]> = {}) {
  return {
    sourceItemId: 'fee-1',
    itemType: 'FEE',
    category: 'COST' as const,
    code: AncillaryType.HARC,
    amount: 125.25,
    currency: 'TRY',
    sourceStatus: 'AVAILABLE' as const,
    ...overrides,
  };
}

describe('ADR-014 PR-7 case balance fee projection DTO', () => {
  it('carries trusted persisted projection losslessly without creating fee authority', () => {
    const projection = buildCaseBalanceFeeProjection({
      sourceItems: [source()],
      currencyResults: [{ currency: 'TRY', resultAvailable: true }],
    });

    expect(projection).toMatchObject({
      status: 'AVAILABLE',
      authority: 'SOURCE_PROJECTION_ONLY',
      policyStatus: 'OWNER_GATED',
      aggregation: 'PER_CURRENCY_ONLY',
      currency: 'TRY',
      totalProjectedAmount: 125.25,
    });
    expect(projection.groups).toEqual([
      expect.objectContaining({
        currency: 'TRY',
        status: 'AVAILABLE',
        totalProjectedAmount: 125.25,
        lines: [expect.objectContaining({
          sourceItemId: 'fee-1',
          code: AncillaryType.HARC,
          amount: 125.25,
          source: 'PERSISTED_CLAIM_ITEM',
        })],
      }),
    ]);
    expect(projection.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FEE_POLICY_OWNER_GATED', severity: 'INFO' }),
    ]));
  });

  it('returns NOT_CALCULATED and null instead of a zero fallback when source is absent', () => {
    const projection = buildCaseBalanceFeeProjection({
      sourceItems: [],
      currencyResults: [{ currency: 'TRY', resultAvailable: true }],
    });

    expect(projection).toMatchObject({
      status: 'NOT_CALCULATED',
      authority: 'UNAVAILABLE',
      totalProjectedAmount: null,
      groups: [],
    });
    expect(projection.totalProjectedAmount).not.toBe(0);
    expect(projection.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FEE_PROJECTION_NOT_CALCULATED' }),
    ]));
  });

  it('keeps currencies independent and forbids a cross-currency total', () => {
    const projection = buildCaseBalanceFeeProjection({
      sourceItems: [
        source({ sourceItemId: 'usd-fee', currency: 'USD', amount: 10 }),
        source({ sourceItemId: 'try-fee', currency: 'TRY', amount: 20 }),
      ],
      currencyResults: [
        { currency: 'TRY', resultAvailable: true },
        { currency: 'USD', resultAvailable: true },
      ],
    });

    expect(projection.status).toBe('AVAILABLE');
    expect(projection.currency).toBeNull();
    expect(projection.totalProjectedAmount).toBeNull();
    expect(projection.groups.map((group) => [group.currency, group.totalProjectedAmount])).toEqual([
      ['TRY', 20],
      ['USD', 10],
    ]);
    expect(projection.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FEE_PROJECTION_CROSS_CURRENCY_TOTAL_FORBIDDEN' }),
    ]));
  });

  it.each([
    ['', 'FEE_PROJECTION_CURRENCY_MISSING'],
    ['JPY', 'FEE_PROJECTION_CURRENCY_UNSUPPORTED'],
    ['usd', 'FEE_PROJECTION_CURRENCY_UNSUPPORTED'],
    ['USD', 'FEE_PROJECTION_CURRENCY_MISMATCH'],
  ])('fails closed for currency %p with %s', (currency, diagnosticCode) => {
    const projection = buildCaseBalanceFeeProjection({
      sourceItems: [source({ currency })],
      currencyResults: [{ currency: 'TRY', resultAvailable: true }],
    });

    expect(projection).toMatchObject({ status: 'UNAVAILABLE', totalProjectedAmount: null });
    expect(projection.groups[0]).toMatchObject({ status: 'UNAVAILABLE', totalProjectedAmount: null });
    expect(projection.groups[0].lines[0]).toMatchObject({ amount: null, status: 'UNAVAILABLE' });
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toContain(diagnosticCode);
  });

  it('fails closed on invalid source amount and cent-normalizes trusted amounts', () => {
    const invalid = buildCaseBalanceFeeProjection({
      sourceItems: [source({ amount: 0, sourceStatus: 'INVALID_AMOUNT' })],
      currencyResults: [{ currency: 'TRY', resultAvailable: true }],
    });
    const normalized = buildCaseBalanceFeeProjection({
      sourceItems: [source({ amount: 10.005 })],
      currencyResults: [{ currency: 'TRY', resultAvailable: true }],
    });

    expect(invalid).toMatchObject({ status: 'UNAVAILABLE', totalProjectedAmount: null });
    expect(invalid.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'FEE_PROJECTION_SOURCE_AMOUNT_INVALID',
    );
    expect(normalized.totalProjectedAmount).toBe(10.01);
    expect(normalized.groups[0].lines[0].amount).toBe(10.01);
  });

  it('propagates NO_BUCKETS/reversal-style blockers and keeps ordering deterministic', () => {
    const projection = buildCaseBalanceFeeProjection({
      sourceItems: [
        source({ sourceItemId: 'z', itemType: 'EXPENSE', code: AncillaryType.TEBLIGAT_MASRAFI }),
        source({ sourceItemId: 'a' }),
      ],
      currencyResults: [{ currency: 'TRY', resultAvailable: false, skippedReason: 'NO_BUCKETS' }],
      globalBlockerCodes: ['REVERSAL_INTEGRITY_INVALID', 'NO_BUCKETS'],
    });

    expect(projection).toMatchObject({
      status: 'UNAVAILABLE',
      authority: 'UNAVAILABLE',
      totalProjectedAmount: null,
    });
    expect(projection.groups[0].lines.map((line) => line.sourceItemId)).toEqual(['a', 'z']);
    expect(projection.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'FEE_PROJECTION_LEGAL_BALANCE_BLOCKED',
        details: expect.objectContaining({
          globalBlockerCodes: ['NO_BUCKETS', 'REVERSAL_INTEGRITY_INVALID'],
          skippedReason: 'NO_BUCKETS',
        }),
      }),
    ]));
  });
});
