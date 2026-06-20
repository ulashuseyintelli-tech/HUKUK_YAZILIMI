import { BadRequestException } from "@nestjs/common";
import { DocumentService } from "../document.service";
import { DocumentTemplateService } from "../document-template.service";

const activeCaseDebtor = {
  debtor: {
    name: "Aktif Borclu",
    identityNo: "11111111111",
    addresses: { primary: "Adres" },
  },
};

const makeCase = (debtors: any[]) => ({
  id: "case-1",
  fileNumber: "2026/1",
  principalAmount: 100,
  interestRate: 0,
  createdAt: new Date("2026-01-01"),
  startDate: new Date("2026-01-01"),
  client: { name: "Alacakli", identityNo: "22222222222", address: { text: "Adres" } },
  debtors,
  lawyers: [],
  formType: null,
  collections: [],
  executionOffice: null,
  dues: [],
  notes: null,
});

describe("PR-RE2 document passive policy", () => {
  it("DocumentService ACTIVE-only debtor filtresi ve tenant-safe lookup kullanir", async () => {
    const prisma: any = {
      case: { findFirst: jest.fn().mockResolvedValue(makeCase([activeCaseDebtor])) },
    };
    const service = new DocumentService(prisma, {} as any);

    const data = await service.prepareDocumentData("case-1", "tenant-1");

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
    expect(data.debtor.name).toBe("Aktif Borclu");
  });

  it("DocumentService all-PASSIVE case icin kontrollu hata verir", async () => {
    const prisma: any = {
      case: { findFirst: jest.fn().mockResolvedValue(makeCase([])) },
    };
    const service = new DocumentService(prisma, {} as any);

    await expect(service.generatePaymentOrder("case-1", "tenant-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("DocumentTemplateService template degiskenlerinde ACTIVE-only debtor kullanir", async () => {
    const prisma: any = {
      case: { findFirst: jest.fn().mockResolvedValue(makeCase([activeCaseDebtor])) },
      documentTemplate: {
        findUnique: jest.fn().mockResolvedValue({
          templateContent: "Borclu: {{debtor.name}}",
        }),
      },
    };
    const service = new DocumentTemplateService(prisma);

    await service.generateDocument("case-1", "ODEME_EMRI", "tenant-1");

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
  });
});
