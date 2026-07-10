import { RiskService } from "./risk.service";

/**
 * COLLECTION-STATUS-FILTER-HOTFIX — RiskService.
 *
 * calculateCollectionScore ve calculateBehaviorScore artık yalnız CONFIRMED
 * tahsilatı sayar; PENDING/CANCELLED/REFUNDED "tahsil edildi" sinyali üretmez.
 * Saf birim test (DB yok): prisma mock'lanır, analyzeCase public yolu kullanılır.
 */
describe("RiskService — collection status filtresi", () => {
  function makePrisma() {
    return {
      case: { findFirst: jest.fn(), findMany: jest.fn() },
      riskReport: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn(), findMany: jest.fn() },
    } as any;
  }

  function makeCaseData(collections: Array<{ amount: number; status: string }>) {
    return {
      id: "case-1",
      principalAmount: 100000,
      workflowStage: "INITIAL",
      createdAt: new Date(), // taze dosya → ageScore 0
      collections,
      debtors: [],
      enforcementActions: [],
      lifecycleEvents: [],
      notifications: [],
    };
  }

  it("REGRESYON: yalnız PENDING/CANCELLED/REFUNDED varsa hiç tahsilat yok sayılır (collectionScore 25, behavior -3 uygulanmaz)", async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue(
      makeCaseData([
        { amount: 90000, status: "CANCELLED" },
        { amount: 5000, status: "REFUNDED" },
        { amount: 10000, status: "PENDING" },
      ]),
    );
    const svc = new RiskService(prisma);

    const result = await svc.analyzeCase("tenant-A", "case-1");

    // Eski (hatalı) davranış: 105000/100000 → rate 1.05 → skor 0 olurdu.
    expect(result.factors.collectionHistoryScore).toBe(25); // hiç tahsilat yok
    // Eski davranış: collections.length > 0 → 7-3 = 4 olurdu.
    expect(result.factors.debtorBehaviorScore).toBe(7); // -3 uygulanmadı
  });

  it("POZİTİF: CONFIRMED tahsilat sayılır (CANCELLED gürültüsüne rağmen)", async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue(
      makeCaseData([
        { amount: 85000, status: "CONFIRMED" },
        { amount: 900000, status: "CANCELLED" },
      ]),
    );
    const svc = new RiskService(prisma);

    const result = await svc.analyzeCase("tenant-A", "case-1");

    // 85000/100000 = 0.85 ≥ 0.8 → 0 (CANCELLED dahil olsaydı rate 9.85 ile de 0 olurdu,
    // ama aşağıdaki behavior ayrımı + regresyon testi filtreyi kanıtlıyor)
    expect(result.factors.collectionHistoryScore).toBe(0);
    expect(result.factors.debtorBehaviorScore).toBe(4); // CONFIRMED var → 7-3
  });

  it("ARA BANT: yalnız CONFIRMED oranı kullanılır (%40 → skor 15)", async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue(
      makeCaseData([
        { amount: 40000, status: "CONFIRMED" },
        { amount: 60000, status: "PENDING" }, // dahil olsaydı rate 1.0 → skor 0 olurdu
      ]),
    );
    const svc = new RiskService(prisma);

    const result = await svc.analyzeCase("tenant-A", "case-1");

    expect(result.factors.collectionHistoryScore).toBe(15); // 0.2 ≤ 0.4 < 0.5
  });
});
