import { CaseService } from '../case.service';

const stub = {} as any;

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    case: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'case-1',
        type: 'GENERAL',
        currency: 'TRY',
        principalAmount: 500,
        caseDate: new Date('2026-01-02T00:00:00.000Z'),
        dues: [
          {
            id: 'due-1',
            type: 'PRINCIPAL',
            amount: 1000,
          },
        ],
        collections: [],
        debtors: [],
        formType: null,
        ...overrides,
      }),
    },
  };
}

function makeCanonical(overrides: Record<string, any> = {}) {
  return {
    computeCaseBalance: jest.fn().mockResolvedValue({
      asOfDate: '2026-06-21',
      source: 'LEDGER',
      currencyResults: [
        {
          currency: 'TRY',
          result: {
            totalDue: 1234.56,
            totalInterest: 34.56,
            preEnforcementInterest: 0,
            postEnforcementInterest: 34.56,
          },
        },
      ],
      projections: { costs: {}, ancillaries: {} },
      diagnostics: { fatal: [], assembler: [], payments: [], currency: [], perCurrency: [] },
      ...overrides,
    }),
  };
}

function makeService(prisma: any, canonical?: any) {
  return new CaseService(
    prisma,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    canonical,
  );
}

describe('CaseService.getCalculationSummary canonicalShadow', () => {
  it('legacy hesap ozeti alanlarini koruyarak delta/deltaPercent diagnostic ekler', async () => {
    const prisma = makePrisma();
    const canonical = makeCanonical();
    const service = makeService(prisma, canonical);

    const result = await service.getCalculationSummary('tenant-1', 'case-1', '2026-06-21');

    expect(prisma.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'case-1', tenantId: 'tenant-1' },
    }));
    expect(canonical.computeCaseBalance).toHaveBeenCalledWith('tenant-1', 'case-1', '2026-06-21');
    expect(result.asilAlacak).toBe(1000);
    expect(result.kalemTuru).toBe('PRINCIPAL');
    expect(result.sonBorc).toBeCloseTo(11536.26, 2);

    const expectedDelta = Math.round((1234.56 - result.sonBorc) * 100) / 100;
    const expectedDeltaPercent = Math.round((expectedDelta / result.sonBorc) * 10000) / 100;

    expect(result.canonicalShadow).toMatchObject({
      status: 'OK',
      source: 'computeCaseBalance',
      asOfDate: '2026-06-21',
      legacySonBorc: result.sonBorc,
      legacyCurrency: 'TRY',
      engineSource: 'LEDGER',
      currencyResults: [
        {
          currency: 'TRY',
          totalDue: 1234.56,
          totalInterest: 34.56,
          preEnforcementInterest: 0,
          postEnforcementInterest: 34.56,
          skippedReason: null,
          delta: expectedDelta,
          deltaPercent: expectedDeltaPercent,
          matchStatus: 'MAJOR_DELTA',
        },
      ],
      diagnostics: { fatal: [], assembler: [], payments: [], currency: [], perCurrency: [] },
    });
  });

  it('computeCaseBalance hata verirse legacy response kirilmadan ERROR diagnostic doner', async () => {
    const prisma = makePrisma();
    const canonical = {
      computeCaseBalance: jest.fn().mockRejectedValue(new Error('engine down')),
    };
    const service = makeService(prisma, canonical);

    const result = await service.getCalculationSummary('tenant-1', 'case-1', '2026-06-21');

    expect(result.asilAlacak).toBe(1000);
    expect(result.kalemTuru).toBe('PRINCIPAL');
    expect(result.canonicalShadow).toEqual({
      status: 'ERROR',
      source: 'computeCaseBalance',
      asOfDate: '2026-06-21',
      legacySonBorc: result.sonBorc,
      legacyCurrency: 'TRY',
      matchStatus: 'ERROR',
      errorCode: 'CANONICAL_SHADOW_COMPUTE_FAILED',
    });
    expect((result.canonicalShadow as any).error).toBeUndefined();
    expect(JSON.stringify(result.canonicalShadow)).not.toContain('engine down');
  });

  it('canonical servis yoksa UNAVAILABLE stable errorCode doner', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    const result = await service.getCalculationSummary('tenant-1', 'case-1', '2026-06-21');

    expect(result.asilAlacak).toBe(1000);
    expect(result.canonicalShadow).toEqual({
      status: 'UNAVAILABLE',
      source: 'computeCaseBalance',
      asOfDate: '2026-06-21',
      legacySonBorc: result.sonBorc,
      legacyCurrency: 'TRY',
      matchStatus: 'UNAVAILABLE',
      errorCode: 'CASE_BALANCE_SERVICE_UNAVAILABLE',
    });
  });

  it('legacySonBorc sifirsa deltaPercent null ve LEGACY_ZERO doner', async () => {
    const prisma = makePrisma();
    const canonical = makeCanonical();
    const service = makeService(prisma, canonical);

    const shadow = await (service as any).buildCalculationSummaryCanonicalShadow(
      'tenant-1',
      'case-1',
      '2026-06-21',
      { legacySonBorc: 0, legacyCurrency: 'TRY' },
    );

    expect(canonical.computeCaseBalance).toHaveBeenCalledWith('tenant-1', 'case-1', '2026-06-21');
    expect(shadow.currencyResults[0]).toMatchObject({
      currency: 'TRY',
      totalDue: 1234.56,
      delta: 1234.56,
      deltaPercent: null,
      matchStatus: 'LEGACY_ZERO',
    });
  });

  it('legacy para birimi disindaki canonical currency CURRENCY_MISMATCH olur', async () => {
    const prisma = makePrisma();
    const canonical = makeCanonical({
      currencyResults: [
        {
          currency: 'USD',
          result: {
            totalDue: 500,
            totalInterest: 0,
            preEnforcementInterest: 0,
            postEnforcementInterest: 0,
          },
        },
      ],
    });
    const service = makeService(prisma, canonical);

    const shadow = await (service as any).buildCalculationSummaryCanonicalShadow(
      'tenant-1',
      'case-1',
      '2026-06-21',
      { legacySonBorc: 1000, legacyCurrency: 'TRY' },
    );

    expect(shadow.currencyResults[0]).toMatchObject({
      currency: 'USD',
      totalDue: 500,
      delta: null,
      deltaPercent: null,
      matchStatus: 'CURRENCY_MISMATCH',
    });
  });
});
