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
      projections: {
        costs: { HARC: 12.5 },
        ancillaries: { VEKALET_UCRETI: 100 },
      },
      diagnostics: { fatal: [], assembler: [], payments: [], currency: [], perCurrency: [] },
      ...overrides,
    }),
  };
}

function legacyShadowInput(overrides: Record<string, any> = {}) {
  return {
    legacyToplamBorc: 1000,
    legacySonBorc: 1000,
    legacyToplamTahsilat: 0,
    legacyKalanBorc: 1000,
    legacyCurrency: 'TRY',
    ...overrides,
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
    expect(result.toplamTahsilat).toBe(0);
    expect(result.sonBorc).toBeCloseTo(11536.26, 2);
    expect(result.kalanBorc).toBeCloseTo(result.sonBorc, 2);

    const expectedDelta = Math.round((1234.56 - result.sonBorc) * 100) / 100;
    const expectedDeltaPercent = Math.round((expectedDelta / result.sonBorc) * 10000) / 100;
    const expectedProjectedTotalDue = Math.round((1234.56 + 12.5 + 100) * 100) / 100;

    expect(result.canonicalShadow).toMatchObject({
      status: 'OK',
      source: 'computeCaseBalance',
      asOfDate: '2026-06-21',
      alignmentStatus: 'SCOPE_MISMATCH',
      comparisonScope: 'RAW_LEGACY_SON_BORC_VS_CANONICAL_TOTAL_DUE',
      legacyToplamBorc: result.toplamBorc,
      legacySonBorc: result.sonBorc,
      legacyToplamTahsilat: result.toplamTahsilat,
      legacyKalanBorc: result.kalanBorc,
      legacyCurrency: 'TRY',
      canonicalTotalDue: 1234.56,
      canonicalProjectionCostsTotal: 12.5,
      canonicalProjectionAncillariesTotal: 100,
      canonicalProjectedTotalDue: expectedProjectedTotalDue,
      rawDelta: expectedDelta,
      engineSource: 'LEDGER',
      currencyResults: [
        {
          currency: 'TRY',
          totalDue: 1234.56,
          canonicalTotalDue: 1234.56,
          totalInterest: 34.56,
          preEnforcementInterest: 0,
          postEnforcementInterest: 34.56,
          skippedReason: null,
          delta: expectedDelta,
          deltaPercent: expectedDeltaPercent,
          rawDelta: expectedDelta,
          alignmentStatus: 'SCOPE_MISMATCH',
          comparisonScope: 'RAW_LEGACY_SON_BORC_VS_CANONICAL_TOTAL_DUE',
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
      alignmentStatus: 'SCOPE_MISMATCH',
      comparisonScope: 'RAW_LEGACY_SON_BORC_VS_CANONICAL_TOTAL_DUE',
      legacyToplamBorc: result.toplamBorc,
      legacySonBorc: result.sonBorc,
      legacyToplamTahsilat: result.toplamTahsilat,
      legacyKalanBorc: result.kalanBorc,
      legacyCurrency: 'TRY',
      canonicalTotalDue: null,
      canonicalProjectionCostsTotal: null,
      canonicalProjectionAncillariesTotal: null,
      canonicalProjectedTotalDue: null,
      rawDelta: null,
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
      alignmentStatus: 'SCOPE_MISMATCH',
      comparisonScope: 'RAW_LEGACY_SON_BORC_VS_CANONICAL_TOTAL_DUE',
      legacyToplamBorc: result.toplamBorc,
      legacySonBorc: result.sonBorc,
      legacyToplamTahsilat: result.toplamTahsilat,
      legacyKalanBorc: result.kalanBorc,
      legacyCurrency: 'TRY',
      canonicalTotalDue: null,
      canonicalProjectionCostsTotal: null,
      canonicalProjectionAncillariesTotal: null,
      canonicalProjectedTotalDue: null,
      rawDelta: null,
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
      legacyShadowInput({ legacySonBorc: 0, legacyKalanBorc: 0 }),
    );

    expect(canonical.computeCaseBalance).toHaveBeenCalledWith('tenant-1', 'case-1', '2026-06-21');
    expect(shadow).toMatchObject({
      alignmentStatus: 'SCOPE_MISMATCH',
      comparisonScope: 'RAW_LEGACY_SON_BORC_VS_CANONICAL_TOTAL_DUE',
      canonicalTotalDue: 1234.56,
      canonicalProjectionCostsTotal: 12.5,
      canonicalProjectionAncillariesTotal: 100,
      canonicalProjectedTotalDue: 1347.06,
      rawDelta: 1234.56,
    });
    expect(shadow.currencyResults[0]).toMatchObject({
      currency: 'TRY',
      totalDue: 1234.56,
      canonicalTotalDue: 1234.56,
      delta: 1234.56,
      deltaPercent: null,
      rawDelta: 1234.56,
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
      legacyShadowInput(),
    );

    expect(shadow).toMatchObject({
      canonicalTotalDue: null,
      canonicalProjectionCostsTotal: 12.5,
      canonicalProjectionAncillariesTotal: 100,
      canonicalProjectedTotalDue: null,
      rawDelta: null,
    });
    expect(shadow.currencyResults[0]).toMatchObject({
      currency: 'USD',
      totalDue: 500,
      canonicalTotalDue: 500,
      delta: null,
      deltaPercent: null,
      rawDelta: null,
      alignmentStatus: 'SCOPE_MISMATCH',
      comparisonScope: 'RAW_LEGACY_SON_BORC_VS_CANONICAL_TOTAL_DUE',
      matchStatus: 'CURRENCY_MISMATCH',
    });
  });
});
