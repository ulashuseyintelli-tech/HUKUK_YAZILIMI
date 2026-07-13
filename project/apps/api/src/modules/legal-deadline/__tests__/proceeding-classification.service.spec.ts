/**
 * MPB-028(a) PR-3C — ProceedingClassificationService birim testleri (mock Prisma).
 *
 * Üç endişe grubu:
 * 1) Case.proceedingType boşsa UNRESOLVED (gizli fallback YOK — CaseType/subType/
 *    executionPath'ten TAHMİN edilmez).
 * 2) SubType seçimi ProceedingType'a göre doğru alandan (rentalType/bankruptcyType/
 *    judgmentExecutionType) okunur.
 * 3) Tenant-scoped sorgu + case bulunamazsa NotFoundException.
 */
import { NotFoundException } from "@nestjs/common";
import { ProceedingType, RentalType, BankruptcyType, JudgmentExecutionType } from "@prisma/client";
import { ProceedingClassificationService } from "../proceeding-classification.service";

function buildPrisma(caseRecord: unknown) {
  return {
    case: { findFirst: jest.fn().mockResolvedValue(caseRecord) },
  } as any;
}

describe("ProceedingClassificationService — UNRESOLVED (gizli fallback yok)", () => {
  it("proceedingType null ise UNRESOLVED (null) döner", async () => {
    const prisma = buildPrisma({
      proceedingType: null,
      rentalType: null,
      bankruptcyType: null,
      judgmentExecutionType: null,
    });
    const svc = new ProceedingClassificationService(prisma);

    const result = await svc.resolveProceedingClassification("tenant-a", "case-1");

    expect(result).toBeNull();
  });

  it("case bulunamazsa NotFoundException (cross-tenant enumeration yok)", async () => {
    const prisma = buildPrisma(null);
    const svc = new ProceedingClassificationService(prisma);

    await expect(svc.resolveProceedingClassification("tenant-a", "yok")).rejects.toThrow(NotFoundException);
  });

  it("tenant-scoped where ile sorgulanır", async () => {
    const prisma = buildPrisma({
      proceedingType: ProceedingType.GENERAL_EXECUTION,
      rentalType: null,
      bankruptcyType: null,
      judgmentExecutionType: null,
    });
    const svc = new ProceedingClassificationService(prisma);

    await svc.resolveProceedingClassification("tenant-a", "case-1");

    expect(prisma.case.findFirst).toHaveBeenCalledWith({
      where: { id: "case-1", tenantId: "tenant-a" },
      select: {
        proceedingType: true,
        rentalType: true,
        bankruptcyType: true,
        judgmentExecutionType: true,
      },
    });
  });
});

describe("ProceedingClassificationService — subType seçimi", () => {
  it("GENERAL_EXECUTION/CAMBIO/EVICTION/PLEDGE/MORTGAGE/PUBLIC_RECEIVABLE: subTypeCode her zaman null", async () => {
    for (const proceedingType of [
      ProceedingType.GENERAL_EXECUTION,
      ProceedingType.CAMBIO,
      ProceedingType.EVICTION,
      ProceedingType.PLEDGE,
      ProceedingType.MORTGAGE,
      ProceedingType.PUBLIC_RECEIVABLE,
    ]) {
      const prisma = buildPrisma({
        proceedingType,
        rentalType: RentalType.GENERAL, // dolu olsa bile bu ProceedingType'larda okunmaz
        bankruptcyType: BankruptcyType.ORDINARY,
        judgmentExecutionType: JudgmentExecutionType.MONEY_OR_SECURITY,
      });
      const svc = new ProceedingClassificationService(prisma);

      const result = await svc.resolveProceedingClassification("tenant-a", "case-1");

      expect(result).toEqual({ proceedingType, subTypeCode: null });
    }
  });

  it("RENT: subTypeCode rentalType'tan okunur", async () => {
    const prisma = buildPrisma({
      proceedingType: ProceedingType.RENT,
      rentalType: RentalType.RESIDENTIAL_COMMERCIAL,
      bankruptcyType: null,
      judgmentExecutionType: null,
    });
    const svc = new ProceedingClassificationService(prisma);

    const result = await svc.resolveProceedingClassification("tenant-a", "case-1");

    expect(result).toEqual({
      proceedingType: ProceedingType.RENT,
      subTypeCode: RentalType.RESIDENTIAL_COMMERCIAL,
    });
  });

  it("BANKRUPTCY: subTypeCode bankruptcyType'tan okunur", async () => {
    const prisma = buildPrisma({
      proceedingType: ProceedingType.BANKRUPTCY,
      rentalType: null,
      bankruptcyType: BankruptcyType.CAMBIO,
      judgmentExecutionType: null,
    });
    const svc = new ProceedingClassificationService(prisma);

    const result = await svc.resolveProceedingClassification("tenant-a", "case-1");

    expect(result).toEqual({ proceedingType: ProceedingType.BANKRUPTCY, subTypeCode: BankruptcyType.CAMBIO });
  });

  it("JUDGMENT_ENFORCEMENT: subTypeCode judgmentExecutionType'tan okunur", async () => {
    const prisma = buildPrisma({
      proceedingType: ProceedingType.JUDGMENT_ENFORCEMENT,
      rentalType: null,
      bankruptcyType: null,
      judgmentExecutionType: JudgmentExecutionType.MORTGAGE_JUDGMENT,
    });
    const svc = new ProceedingClassificationService(prisma);

    const result = await svc.resolveProceedingClassification("tenant-a", "case-1");

    expect(result).toEqual({
      proceedingType: ProceedingType.JUDGMENT_ENFORCEMENT,
      subTypeCode: JudgmentExecutionType.MORTGAGE_JUDGMENT,
    });
  });

  it("RENT ama rentalType boş: subTypeCode null döner (RULE_MATRIX zaten UNRESOLVED üretecek)", async () => {
    const prisma = buildPrisma({
      proceedingType: ProceedingType.RENT,
      rentalType: null,
      bankruptcyType: null,
      judgmentExecutionType: null,
    });
    const svc = new ProceedingClassificationService(prisma);

    const result = await svc.resolveProceedingClassification("tenant-a", "case-1");

    expect(result).toEqual({ proceedingType: ProceedingType.RENT, subTypeCode: null });
  });
});
