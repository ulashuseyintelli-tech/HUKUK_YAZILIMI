import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CaseDebtorLifecycleStatus } from "@prisma/client";
import { CaseDebtorLifecycleGuardService } from "./case-debtor-lifecycle-guard.service";

describe("CaseDebtorLifecycleGuardService", () => {
  const TENANT_ID = "tenant-1";
  const CASE_ID = "case-1";
  const OTHER_CASE_ID = "case-2";
  const DEBTOR_ID = "debtor-1";
  const CASE_DEBTOR_ID = "case-debtor-1";

  const activeCaseDebtor = {
    id: CASE_DEBTOR_ID,
    caseId: CASE_ID,
    debtorId: DEBTOR_ID,
    lifecycleStatus: CaseDebtorLifecycleStatus.ACTIVE,
  };

  const passiveCaseDebtor = {
    ...activeCaseDebtor,
    lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE,
  };

  const mockPrisma = {
    caseDebtor: {
      findFirst: jest.fn(),
    },
  };

  let service: CaseDebtorLifecycleGuardService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CaseDebtorLifecycleGuardService(mockPrisma as any);
  });

  it("active caseDebtor passes by caseDebtorId + tenantId", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue(activeCaseDebtor);

    const result = await service.assertActiveByCaseDebtorId(
      TENANT_ID,
      CASE_DEBTOR_ID
    );

    expect(result).toBe(activeCaseDebtor);
    expect(mockPrisma.caseDebtor.findFirst).toHaveBeenCalledWith({
      where: {
        id: CASE_DEBTOR_ID,
        case: { tenantId: TENANT_ID },
      },
      select: {
        id: true,
        caseId: true,
        debtorId: true,
        lifecycleStatus: true,
      },
    });
  });

  it("passive caseDebtor blocks by caseDebtorId + tenantId", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue(passiveCaseDebtor);

    await expect(
      service.assertActiveByCaseDebtorId(TENANT_ID, CASE_DEBTOR_ID)
    ).rejects.toThrow(BadRequestException);
  });

  it("not-found or wrong-tenant blocks safely by caseDebtorId + tenantId", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue(null);

    await expect(
      service.assertActiveByCaseDebtorId(TENANT_ID, CASE_DEBTOR_ID)
    ).rejects.toThrow(NotFoundException);

    await expect(
      service.assertActiveByCaseDebtorId(TENANT_ID, CASE_DEBTOR_ID)
    ).rejects.toThrow("Dosya borçlusu bulunamadı.");
  });

  it("wrong expected caseId blocks safely", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue(null);

    await expect(
      service.assertActiveByCaseDebtorId(TENANT_ID, CASE_DEBTOR_ID, {
        expectedCaseId: OTHER_CASE_ID,
      })
    ).rejects.toThrow(NotFoundException);

    expect(mockPrisma.caseDebtor.findFirst).toHaveBeenCalledWith({
      where: {
        id: CASE_DEBTOR_ID,
        case: {
          tenantId: TENANT_ID,
          id: OTHER_CASE_ID,
        },
      },
      select: {
        id: true,
        caseId: true,
        debtorId: true,
        lifecycleStatus: true,
      },
    });
  });

  it("tenantId + caseId + debtorId active membership passes", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue(activeCaseDebtor);

    const result = await service.assertActiveByCaseAndDebtor(
      TENANT_ID,
      CASE_ID,
      DEBTOR_ID
    );

    expect(result).toBe(activeCaseDebtor);
    expect(mockPrisma.caseDebtor.findFirst).toHaveBeenCalledWith({
      where: {
        caseId: CASE_ID,
        debtorId: DEBTOR_ID,
        case: { tenantId: TENANT_ID },
      },
      select: {
        id: true,
        caseId: true,
        debtorId: true,
        lifecycleStatus: true,
      },
    });
  });

  it("tenantId + caseId + debtorId passive membership blocks", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue(passiveCaseDebtor);

    await expect(
      service.assertActiveByCaseAndDebtor(TENANT_ID, CASE_ID, DEBTOR_ID)
    ).rejects.toThrow(BadRequestException);
  });

  it("no membership blocks safely by tenantId + caseId + debtorId", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue(null);

    await expect(
      service.assertActiveByCaseAndDebtor(TENANT_ID, CASE_ID, DEBTOR_ID)
    ).rejects.toThrow(NotFoundException);

    await expect(
      service.assertActiveByCaseAndDebtor(TENANT_ID, CASE_ID, DEBTOR_ID)
    ).rejects.toThrow("Dosya borçlusu bulunamadı.");
  });
});
