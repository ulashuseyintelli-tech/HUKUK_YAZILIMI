import { FactStoreService } from './fact-store.service';

/**
 * COLLECTION-STATUS-FILTER-HOTFIX — FactStoreService.getComputedMetrics.
 *
 * Policy-engine computed metriklerindeki collectedAmount/collectionRate artık
 * yalnız CONFIRMED tahsilatı sayar. Saf birim test: prisma mock'lanır;
 * getFacts zinciri (icrabotCaseFact/Flag + addCaseLevelFacts) boş/null ile geçilir.
 */
describe('FactStoreService — collection status filtresi (getComputedMetrics)', () => {
  function makePrisma(metricsRow: any) {
    return {
      icrabotCaseFact: { findMany: jest.fn().mockResolvedValue([]) },
      icrabotCaseFlag: { findMany: jest.fn().mockResolvedValue([]) },
      case: {
        // İlk çağrı addCaseLevelFacts (collections seçmez) → null (guard'lı erken dönüş);
        // ikinci çağrı getComputedMetrics (collections seçer) → metricsRow.
        findUnique: jest.fn().mockImplementation((args: any) =>
          args?.select?.collections ? Promise.resolve(metricsRow) : Promise.resolve(null),
        ),
      },
    } as any;
  }

  it('REGRESYON: collectedAmount/collectionRate yalnız CONFIRMED üzerinden hesaplanır', async () => {
    const prisma = makePrisma({
      principalAmount: 100000,
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      riskScore: 42,
      collections: [
        { amount: 20000, status: 'CONFIRMED' },
        { amount: 5000, status: 'PENDING' },
        { amount: 50000, status: 'CANCELLED' },
        { amount: 1000, status: 'REFUNDED' },
      ],
    });
    const svc = new FactStoreService(prisma);

    const metrics = await svc.getComputedMetrics('case-1');

    // Eski (hatalı) davranış: 76000 / 0.76 olurdu.
    expect(metrics.collectedAmount).toBe(20000);
    expect(metrics.collectionRate).toBe(0.2);
    expect(metrics.totalDebtAmount).toBe(100000);
    expect(metrics.riskScore).toBe(42);
  });

  it('hiç CONFIRMED yoksa collectedAmount 0 / collectionRate 0', async () => {
    const prisma = makePrisma({
      principalAmount: 100000,
      createdAt: new Date(),
      riskScore: null,
      collections: [
        { amount: 5000, status: 'PENDING' },
        { amount: 50000, status: 'CANCELLED' },
        { amount: 1000, status: 'REFUNDED' },
      ],
    });
    const svc = new FactStoreService(prisma);

    const metrics = await svc.getComputedMetrics('case-1');

    expect(metrics.collectedAmount).toBe(0);
    expect(metrics.collectionRate).toBe(0);
  });
});
