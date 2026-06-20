import { ReportService } from "../report.service";

const collectionService = {
  getCollectedBreakdown: jest.fn().mockResolvedValue({ PRINCIPAL: 50 }),
};

const validationGate = {
  checkPreHacizIntelligence: jest.fn().mockResolvedValue({
    overallLevel: "YOK",
    debtors: [],
  }),
};

describe("PR-RE2 report passive policy", () => {
  it("case debt report lifecycleStatus alanini tasir", async () => {
    const prisma: any = {
      case: {
        findFirst: jest.fn().mockResolvedValue({
          id: "case-1",
          fileNumber: "2026/1",
          executionFileNumber: null,
          client: { displayName: "Alacakli", name: "Alacakli" },
          caseStatus: "DERDEST",
          caseDate: new Date("2026-01-01"),
          createdAt: new Date("2026-01-01"),
          principalAmount: 100,
          interestRate: 0,
          currency: "TRY",
          debtors: [
            {
              id: "cd-active",
              role: "ASIL_BORCLU",
              lifecycleStatus: "ACTIVE",
              debtor: { id: "d1", name: "Aktif", tckn: "111", vkn: null },
            },
            {
              id: "cd-passive",
              role: "ASIL_BORCLU",
              lifecycleStatus: "PASSIVE",
              debtor: { id: "d2", name: "Pasif", tckn: "222", vkn: null },
            },
          ],
        }),
      },
      collection: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ReportService(prisma, collectionService as any, validationGate as any);

    const result = await service.getCaseDebtReport("tenant-1", "case-1");

    expect(result.debtors.map((d) => d.lifecycleStatus)).toEqual(["ACTIVE", "PASSIVE"]);
    expect(result.debtors[1]).toMatchObject({
      caseDebtorId: "cd-passive",
      lifecycleLabel: "PASSIVE",
    });
  });

  it("collection history PASSIVE kaydi saklar ve lifecycle metadata ekler", async () => {
    const prisma: any = {
      collection: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "col-1",
            caseDebtorId: "cd-passive",
            date: new Date("2026-01-02"),
            amount: 100,
            currency: "TRY",
            channel: "BANKA",
            sourceType: "MANUAL",
            status: "CONFIRMED",
            case: { fileNumber: "2026/1" },
            description: "Tahsilat",
          },
        ]),
      },
      caseDebtor: {
        findMany: jest.fn().mockResolvedValue([
          { id: "cd-passive", lifecycleStatus: "PASSIVE" },
        ]),
      },
    };
    const service = new ReportService(prisma, collectionService as any, validationGate as any);

    const result = await service.getCollectionHistoryReport("tenant-1", {});

    expect(result.collections).toHaveLength(1);
    expect(result.collections[0]).toMatchObject({
      id: "col-1",
      caseDebtorId: "cd-passive",
      caseDebtorLifecycleStatus: "PASSIVE",
      caseDebtorLifecycleLabel: "PASSIVE",
    });
    expect(prisma.caseDebtor.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["cd-passive"] }, case: { tenantId: "tenant-1" } },
      select: { id: true, lifecycleStatus: true },
    });
  });

  it("pre-haciz summary debtor count ACTIVE-only semantigiyle sayar", async () => {
    const prisma: any = {
      case: { findMany: jest.fn().mockResolvedValue([{ id: "case-1" }]) },
      caseDebtor: { count: jest.fn().mockResolvedValue(1) },
    };
    const service = new ReportService(prisma, collectionService as any, validationGate as any);

    const result = await service.getPreHacizRiskDistribution("tenant-1", {});

    expect(prisma.caseDebtor.count).toHaveBeenCalledWith({
      where: { caseId: { in: ["case-1"] }, lifecycleStatus: "ACTIVE" },
    });
    expect(result.params.debtorLifecycleScope).toBe("ACTIVE_ONLY");
  });

  it("collection summary deterministic lifecycle semantics dondurur", async () => {
    const prisma: any = {
      collection: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { amount: 10 }, _count: { id: 1 } })
          .mockResolvedValueOnce({ _sum: { amount: 100 } })
          .mockResolvedValueOnce({ _sum: { amount: 5 }, _count: { id: 1 } }),
      },
    };
    const service = new ReportService(prisma, collectionService as any, validationGate as any);

    const result = await service.getCollectionSummary("tenant-1", "month");

    expect(result.semantics).toEqual({
      collectionScope: "ALL_COLLECTIONS_BY_STATUS",
      debtorLifecycleScope: "HISTORICAL_COLLECTIONS_INCLUDE_PASSIVE_WHEN_LINKED",
    });
  });
});
