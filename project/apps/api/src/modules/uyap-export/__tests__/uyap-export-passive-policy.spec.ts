import { BadRequestException } from "@nestjs/common";
import { UyapCaseMapperService } from "../uyap-case-mapper.service";
import { UyapExportService } from "../uyap-export.service";

const activeDebtor = {
  role: "ASIL_BORCLU",
  debtor: {
    type: "INDIVIDUAL",
    firstName: "Aktif",
    lastName: "Borclu",
    name: "Aktif Borclu",
    tckn: "11111111111",
  },
};

const caseData = (debtors: any[]) => ({
  id: "case-1",
  fileNumber: "2026/1",
  type: "ILAMSIZ",
  subType: null,
  executionPath: "HACIZ",
  notes: null,
  uyapBirimKodu: "34",
  hasUyapWarning: false,
  caseClients: [
    {
      client: {
        type: "INDIVIDUAL",
        firstName: "Alacakli",
        lastName: "Kisi",
        name: "Alacakli Kisi",
        tckn: "22222222222",
      },
    },
  ],
  debtors,
  lawyers: [],
  claimItems: [],
  dues: [],
});

describe("PR-RE2 UYAP export passive policy", () => {
  it("mapper tenant-safe lookup yapar ve sadece ACTIVE CaseDebtor okur", async () => {
    const prisma: any = {
      case: { findFirst: jest.fn().mockResolvedValue(caseData([activeDebtor])) },
      lawyer: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const mapper = new UyapCaseMapperService(prisma);

    const result = await mapper.mapCaseToTakipTalebi("case-1", "tenant-1");

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
    expect(result.taraflar).toHaveLength(2);
  });

  it("mapper all-PASSIVE case icin kontrollu hata verir", async () => {
    const prisma: any = {
      case: { findFirst: jest.fn().mockResolvedValue(caseData([])) },
    };
    const mapper = new UyapCaseMapperService(prisma);

    await expect(mapper.mapCaseToTakipTalebi("case-1", "tenant-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("export validation PASSIVE borclulari exportable saymaz", async () => {
    const prisma: any = {
      case: { findFirst: jest.fn().mockResolvedValue(caseData([])) },
    };
    const service = new UyapExportService(prisma, {} as any, {} as any, {} as any);

    const result = await service.validateCaseForExport("case-1", "tenant-1");

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
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Dosyada aktif borçlu tanımlı değil");
  });
});
