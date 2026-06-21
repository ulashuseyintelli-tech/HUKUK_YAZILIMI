import { CaseService } from '../case.service';

const stub = {} as any;

function makePrisma() {
  return {
    case: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'case-1',
        type: 'GENERAL',
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

function makeService(prisma: any, canonical: any) {
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
  it('legacy hesap ozeti alanlarini koruyarak computeCaseBalance diagnostic ekler', async () => {
    const prisma = makePrisma();
    const canonical = makeCanonical();
    const service = makeService(prisma, canonical);

    const result = await service.getCalculationSummary('tenant-1', 'case-1', '2026-06-21');

    expect(prisma.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'case-1', tenantId: 'tenant-1' },
    }));
    expect(canonical.computeCaseBalance).toHaveBeenCalledWith('tenant-1', 'case-1', '2026-06-21');
    expect(result.asilAlacak).toBe(1000);
    expect(result.canonicalShadow).toEqual({
      status: 'OK',
      source: 'computeCaseBalance',
      asOfDate: '2026-06-21',
      engineSource: 'LEDGER',
      currencyResults: [
        {
          currency: 'TRY',
          totalDue: 1234.56,
          totalInterest: 34.56,
          preEnforcementInterest: 0,
          postEnforcementInterest: 34.56,
          skippedReason: null,
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
      error: 'engine down',
    });
  });
});
