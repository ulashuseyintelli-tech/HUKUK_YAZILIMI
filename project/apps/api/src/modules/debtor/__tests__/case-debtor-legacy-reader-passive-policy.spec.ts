import { CaseDebtorService } from "../case-debtor.service";

describe("PR-RE2 legacy CaseDebtor reader passive policy", () => {
  it("GET /cases/:caseId/debtors default reader ACTIVE-only kalir", async () => {
    const prisma: any = {
      case: { findFirst: jest.fn().mockResolvedValue({ id: "case-1" }) },
      caseDebtor: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CaseDebtorService(prisma);

    await service.getCaseDebtors("tenant-1", "case-1");

    expect(prisma.caseDebtor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { caseId: "case-1", lifecycleStatus: "ACTIVE" },
      }),
    );
  });

  it("legacy statistics ACTIVE-only sayim yapar", async () => {
    const prisma: any = {
      caseDebtor: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CaseDebtorService(prisma);

    await service.getCaseDebtorStatistics("tenant-1", "case-1");

    expect(prisma.caseDebtor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          caseId: "case-1",
          lifecycleStatus: "ACTIVE",
          case: { tenantId: "tenant-1" },
        },
      }),
    );
  });
});
