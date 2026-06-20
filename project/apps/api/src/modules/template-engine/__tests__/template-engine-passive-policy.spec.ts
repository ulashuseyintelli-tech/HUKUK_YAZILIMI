import { BadRequestException } from "@nestjs/common";
import { TemplateEngineService } from "../template-engine.service";

const activeCaseDebtor = {
  role: "ASIL_BORCLU",
  selectedAddress: null,
  debtor: {
    type: "INDIVIDUAL",
    name: "Aktif Borclu",
    displayName: "Aktif Borclu",
    tckn: "11111111111",
    debtorAddresses: [],
  },
};

const makeCase = (debtors: any[]) => ({
  fileNumber: "2026/1",
  startDate: new Date("2026-01-01"),
  type: "GENERAL_EXECUTION",
  subCategory: "GENEL",
  executionPath: "HACIZ",
  hasCollateral: false,
  currency: "TRY",
  principalAmount: 100,
  executionOffice: null,
  caseClients: [],
  lawyers: [],
  debtors,
  dues: [],
  claimItems: [],
});

describe("PR-RE2 TemplateEngineService passive policy", () => {
  function buildService(caseRecord: any) {
    const prisma: any = {
      case: { findFirst: jest.fn().mockResolvedValue(caseRecord) },
    };
    const feeEngine: any = { getInterestRate: jest.fn().mockReturnValue(0) };
    return { service: new TemplateEngineService(prisma, feeEngine), prisma };
  }

  it("case data tenant-safe lookup ile ACTIVE-only debtors okur", async () => {
    const { service, prisma } = buildService(makeCase([activeCaseDebtor]));

    const data = await (service as any).getCaseData("case-1", "tenant-1");

    expect(prisma.case.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "case-1", tenantId: "tenant-1" },
        include: expect.objectContaining({
          debtors: expect.objectContaining({
            where: { lifecycleStatus: "ACTIVE" },
          }),
        }),
      }),
    );
    expect(data.debtors).toHaveLength(1);
    expect(data.debtors[0].name).toBe("Aktif Borclu");
  });

  it("all-PASSIVE case icin belge uretimini kontrollu hata ile durdurur", async () => {
    const { service } = buildService(makeCase([]));

    await expect(
      service.generateTakipTalebiFromCase("case-1", "tenant-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
