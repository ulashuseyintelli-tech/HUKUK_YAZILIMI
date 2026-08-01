import { AutomationService } from "./automation.service";

/**
 * COLLECTION-STATUS-FILTER-HOTFIX — AutomationService.
 *
 * Nightly cron'un persist ettiği Case.riskScore artık yalnız CONFIRMED
 * tahsilatı sayar; getRiskFactors.hasCollections da CONFIRMED'e bakar.
 * Saf birim test: prisma mock'lanır, updateRiskScores public yolu kullanılır;
 * WorkflowEngine/PoaExpiry/CrossCaseNotification bu yolda kullanılmadığından stub'dır.
 */
describe("AutomationService — collection status filtresi (nightly riskScore)", () => {
  function makePrisma(cases: any[]) {
    return {
      case: {
        findMany: jest.fn().mockResolvedValue(cases),
        update: jest.fn().mockResolvedValue({}),
      },
      riskReport: { create: jest.fn().mockResolvedValue({}) },
    } as any;
  }

  function makeService(prisma: any) {
    return new AutomationService(prisma, {} as any, {} as any, {} as any, {} as any);
  }

  function makeCaseData(collections: Array<{ amount: number; status: string }>) {
    return {
      id: "case-1",
      principalAmount: 100000,
      workflowStage: "INITIAL",
      createdAt: new Date(), // taze dosya → yaş etkisi yok
      collections,
      debtors: [], // varlık etkisi yok
    };
  }

  it("REGRESYON: yalnız CANCELLED/PENDING/REFUNDED varsa tahsilat indirimi uygulanmaz (riskScore 50) ve hasCollections=false", async () => {
    const prisma = makePrisma([
      makeCaseData([
        { amount: 40000, status: "CANCELLED" },
        { amount: 10000, status: "PENDING" },
        { amount: 5000, status: "REFUNDED" },
      ]),
    ]);
    const svc = makeService(prisma);

    await svc.updateRiskScores();

    // Eski (hatalı) davranış: 55000/100000 → 50 - floor(0.55*30) = 34 olurdu.
    expect(prisma.case.update).toHaveBeenCalledWith({
      where: { id: "case-1" },
      data: { riskScore: 50 },
    });
    expect(prisma.riskReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          factors: expect.objectContaining({ hasCollections: false }),
        }),
      }),
    );
  });

  it("POZİTİF: CONFIRMED tahsilat indirimi uygulanır (50000 → riskScore 35) ve hasCollections=true", async () => {
    const prisma = makePrisma([
      makeCaseData([
        { amount: 50000, status: "CONFIRMED" },
        { amount: 900000, status: "CANCELLED" }, // dahil olsaydı floor(9.5*30)=285 → skor 0'a çakılırdı
      ]),
    ]);
    const svc = makeService(prisma);

    await svc.updateRiskScores();

    // 50 - floor(0.5 * 30) = 35 (yalnız CONFIRMED oranıyla)
    expect(prisma.case.update).toHaveBeenCalledWith({
      where: { id: "case-1" },
      data: { riskScore: 35 },
    });
    expect(prisma.riskReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          factors: expect.objectContaining({ hasCollections: true }),
        }),
      }),
    );
  });
});
