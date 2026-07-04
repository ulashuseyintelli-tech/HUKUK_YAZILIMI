import { NotFoundException } from "@nestjs/common";
import { DebtorController } from "../debtor.controller";
import { DebtorService } from "../debtor.service";

describe("PR-L7a DebtorService.getDebtorsForCase active-only readers", () => {
  const tenantId = "tenant-1";
  const caseId = "case-1";

  const address = {
    id: "addr-1",
    district: "Kadikoy",
    city: "Istanbul",
    fullText: "Adres 1",
  };

  const makeCaseDebtor = (overrides: Record<string, unknown> = {}) => ({
    id: "cd-active",
    caseId,
    lifecycleStatus: "ACTIVE",
    role: "ASIL_BORCLU",
    serviceStatus: "DELIVERED",
    serviceChannel: null,
    trackingNo: null,
    sentAt: null,
    deliveredAt: new Date("2026-01-01T00:00:00.000Z"),
    returnedAt: null,
    returnReason: null,
    assetVehicle: "UNKNOWN",
    assetRealEstate: "UNKNOWN",
    assetBank: "UNKNOWN",
    assetSgkWage: "UNKNOWN",
    assetLastQueryAt: null,
    selectedAddress: address,
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    debtor: {
      id: "debtor-active",
      name: "Aktif Borclu",
      type: "INDIVIDUAL",
      identityNo: "11111111111",
      tckn: "11111111111",
      vkn: null,
      phone: "05551234567",
      email: null,
      riskLevel: null,
      status: null,
      debtorAddresses: [address],
    },
    ...overrides,
  });

  const passiveCaseDebtor = makeCaseDebtor({
    id: "cd-passive",
    lifecycleStatus: "PASSIVE",
    serviceStatus: "RETURNED",
    deliveredAt: null,
    returnedAt: new Date("2026-01-03T00:00:00.000Z"),
    returnReason: "MOVED",
    debtor: {
      id: "debtor-passive",
      name: "Pasif Borclu",
      type: "INDIVIDUAL",
      identityNo: "22222222222",
      tckn: "22222222222",
      vkn: null,
      phone: "05557654321",
      email: null,
      riskLevel: null,
      status: null,
      debtorAddresses: [address],
    },
  });

  function makeService(caseDebtors = [makeCaseDebtor()]) {
    const prisma: any = {
      case: {
        findFirst: jest.fn().mockResolvedValue({ id: caseId }),
      },
      caseDebtor: {
        findMany: jest.fn().mockResolvedValue(caseDebtors),
      },
      debtorAddress: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      addressResearch: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    return {
      service: new DebtorService(
        prisma,
        { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) } as any,
        {} as any,
      ),
      prisma,
    };
  }

  it("default reader only queries ACTIVE CaseDebtor records", async () => {
    const activeCaseDebtor = makeCaseDebtor();
    const { service, prisma } = makeService([activeCaseDebtor]);

    const result = await service.getDebtorsForCase(tenantId, caseId);

    expect(prisma.case.findFirst).toHaveBeenCalledWith({
      where: { id: caseId, tenantId },
      select: { id: true },
    });
    expect(prisma.caseDebtor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { caseId, lifecycleStatus: "ACTIVE" },
      })
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        caseDebtorId: "cd-active",
        lifecycleStatus: "ACTIVE",
      })
    );
    expect(result.summary.total).toBe(1);
    expect(result.summary.delivered).toBe(1);
  });

  it("includePassive=true includes PASSIVE records but keeps operational summary ACTIVE-only", async () => {
    const activeCaseDebtor = makeCaseDebtor();
    const { service, prisma } = makeService([activeCaseDebtor, passiveCaseDebtor]);

    const result = await service.getDebtorsForCase(tenantId, caseId, true);

    expect(prisma.caseDebtor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { caseId },
      })
    );
    expect(result.items.map((item) => item.lifecycleStatus)).toEqual([
      "ACTIVE",
      "PASSIVE",
    ]);
    expect(result.summary.total).toBe(1);
    expect(result.summary.delivered).toBe(1);
    expect(result.summary.returned).toBe(0);
  });

  it("tenant isolation remains enforced before reader query", async () => {
    const { service, prisma } = makeService();
    prisma.case.findFirst.mockResolvedValue(null);

    await expect(service.getDebtorsForCase(tenantId, caseId)).rejects.toBeInstanceOf(
      NotFoundException
    );

    expect(prisma.case.findFirst).toHaveBeenCalledWith({
      where: { id: caseId, tenantId },
      select: { id: true },
    });
    expect(prisma.caseDebtor.findMany).not.toHaveBeenCalled();
  });
});

describe("PR-L7a DebtorController.getDebtorsForCase query contract", () => {
  it("passes includePassive=true as true", () => {
    const debtorService = {
      getDebtorsForCase: jest.fn(),
    } as unknown as DebtorService;
    const controller = new DebtorController(debtorService);

    controller.getDebtorsForCase("tenant-1", "case-1", "true");

    expect(debtorService.getDebtorsForCase).toHaveBeenCalledWith(
      "tenant-1",
      "case-1",
      true
    );
  });

  it("defaults includePassive to false", () => {
    const debtorService = {
      getDebtorsForCase: jest.fn(),
    } as unknown as DebtorService;
    const controller = new DebtorController(debtorService);

    controller.getDebtorsForCase("tenant-1", "case-1");

    expect(debtorService.getDebtorsForCase).toHaveBeenCalledWith(
      "tenant-1",
      "case-1",
      false
    );
  });
});
