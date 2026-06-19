import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CaseDebtorService } from "./case-debtor.service";
import { PrismaService } from "@/prisma/prisma.service";

/**
 * CaseDebtorService.removeCaseDebtor — unit tests (mock Prisma).
 *
 * Odak:
 * - PR-L1 stopgap preflight sadece bağımlılık var/yok kontrolü yapar.
 * - Bloklayıcı kayıt varsa hard-delete başlamaz.
 * - Bloklayıcı yoksa açık AddressTask'lar aynı transaction içinde CANCELLED olur,
 *   sonra CaseDebtor silinir.
 *
 * NOT: Mock Prisma gerçek satır filtrelemez; tenant/case izolasyonunu burada where
 * şekliyle assert ederiz. Gerçek AddressTask satır izolasyonu describeDb integration
 * spec'inde ayrıca kanıtlanır.
 */
describe("CaseDebtorService.removeCaseDebtor", () => {
  let service: CaseDebtorService;

  const TENANT = "tenant-1";
  const CASE = "case-1";
  const DEBTOR = "debtor-1";
  const CASE_DEBTOR = "cd-1";

  const txMock = {
    addressTask: { updateMany: jest.fn() },
    caseDebtor: { delete: jest.fn() },
  };

  const mockPrisma = {
    caseDebtor: { findFirst: jest.fn() },
    serviceHistory: { count: jest.fn() },
    externalCase: { count: jest.fn() },
    uyapQuery: { count: jest.fn() },
    institutionLetter: { count: jest.fn() },
    addressResearch: { count: jest.fn() },
    assetQuery: { count: jest.fn() },
    tebligat: { count: jest.fn() },
    collection: { count: jest.fn() },
    thirdParty: { count: jest.fn() },
    $transaction: jest.fn(),
  };

  const blockerCountMocks: jest.Mock[] = [
    mockPrisma.serviceHistory.count,
    mockPrisma.externalCase.count,
    mockPrisma.uyapQuery.count,
    mockPrisma.institutionLetter.count,
    mockPrisma.addressResearch.count,
    mockPrisma.assetQuery.count,
    mockPrisma.tebligat.count,
    mockPrisma.collection.count,
    mockPrisma.thirdParty.count,
  ];

  const blockerCases: Array<[string, jest.Mock]> = [
    ["ServiceHistory", mockPrisma.serviceHistory.count],
    ["ExternalCase", mockPrisma.externalCase.count],
    ["UyapQuery", mockPrisma.uyapQuery.count],
    ["InstitutionLetter", mockPrisma.institutionLetter.count],
    ["AddressResearch", mockPrisma.addressResearch.count],
    ["AssetQuery", mockPrisma.assetQuery.count],
    ["Tebligat", mockPrisma.tebligat.count],
    ["Collection", mockPrisma.collection.count],
    ["ThirdParty", mockPrisma.thirdParty.count],
  ];

  const mockExistingCaseDebtor = (tenantId = TENANT) => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue({
      id: CASE_DEBTOR,
      caseId: CASE,
      debtorId: DEBTOR,
      case: { tenantId },
    });
  };

  const expectNoDeleteSideEffect = () => {
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(txMock.addressTask.updateMany).not.toHaveBeenCalled();
    expect(txMock.caseDebtor.delete).not.toHaveBeenCalled();
  };

  const expectPreflightTenantScope = () => {
    const relationScopedWhere = {
      caseDebtorId: CASE_DEBTOR,
      caseDebtor: { case: { tenantId: TENANT } },
    };
    const looseScalarWhere = {
      caseDebtorId: CASE_DEBTOR,
      caseId: CASE,
      case: { tenantId: TENANT },
    };

    expect(mockPrisma.serviceHistory.count).toHaveBeenCalledWith({
      where: relationScopedWhere,
    });
    expect(mockPrisma.externalCase.count).toHaveBeenCalledWith({
      where: relationScopedWhere,
    });
    expect(mockPrisma.uyapQuery.count).toHaveBeenCalledWith({
      where: relationScopedWhere,
    });
    expect(mockPrisma.institutionLetter.count).toHaveBeenCalledWith({
      where: relationScopedWhere,
    });
    expect(mockPrisma.addressResearch.count).toHaveBeenCalledWith({
      where: relationScopedWhere,
    });
    expect(mockPrisma.assetQuery.count).toHaveBeenCalledWith({
      where: relationScopedWhere,
    });
    expect(mockPrisma.tebligat.count).toHaveBeenCalledWith({
      where: looseScalarWhere,
    });
    expect(mockPrisma.collection.count).toHaveBeenCalledWith({
      where: looseScalarWhere,
    });
    expect(mockPrisma.thirdParty.count).toHaveBeenCalledWith({
      where: relationScopedWhere,
    });
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaseDebtorService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CaseDebtorService>(CaseDebtorService);

    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((cb: any) => cb(txMock));
    txMock.addressTask.updateMany.mockResolvedValue({ count: 0 });
    txMock.caseDebtor.delete.mockResolvedValue({ id: CASE_DEBTOR });
    blockerCountMocks.forEach((count) => count.mockResolvedValue(0));
  });

  it("bloklayıcı bağımlılık yoksa CaseDebtor'u siler", async () => {
    mockExistingCaseDebtor();

    const result = await service.removeCaseDebtor(TENANT, CASE_DEBTOR);

    expectPreflightTenantScope();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.caseDebtor.delete).toHaveBeenCalledWith({
      where: { id: CASE_DEBTOR },
    });
    expect(result).toEqual({ id: CASE_DEBTOR });
  });

  it("açık AddressTask'ları (caseId+debtorId+tenant pinli) CANCELLED yapar ve CaseDebtor'u aynı tx'te siler", async () => {
    mockExistingCaseDebtor();

    await service.removeCaseDebtor(TENANT, CASE_DEBTOR);

    expect(txMock.addressTask.updateMany).toHaveBeenCalledTimes(1);
    expect(txMock.addressTask.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT,
        caseId: CASE,
        debtorId: DEBTOR,
        status: { in: ["PENDING", "IN_PROGRESS", "WAITING_EXTERNAL"] },
      },
      data: expect.objectContaining({
        status: "CANCELLED",
        cancellationReason: "MANUAL_CANCEL",
        completedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    });
  });

  it("data.status filtresi yalnız açık statüleri hedefler; terminal AddressTask blocker değildir", async () => {
    mockExistingCaseDebtor();

    await service.removeCaseDebtor(TENANT, CASE_DEBTOR);

    const where = txMock.addressTask.updateMany.mock.calls[0][0].where;
    expect(where.status.in).toEqual([
      "PENDING",
      "IN_PROGRESS",
      "WAITING_EXTERNAL",
    ]);
    expect(where.status.in).not.toContain("DONE");
    expect(where.status.in).not.toContain("FAILED");
    expect(where.status.in).not.toContain("CANCELLED");
    expect(where.status.in).not.toContain("RESOLVED");
  });

  it("tenant uyuşmazlığında NotFound atar ve preflight/silme yapmaz", async () => {
    mockExistingCaseDebtor("baska-tenant");

    await expect(
      service.removeCaseDebtor(TENANT, CASE_DEBTOR)
    ).rejects.toBeInstanceOf(NotFoundException);

    blockerCountMocks.forEach((count) => expect(count).not.toHaveBeenCalled());
    expectNoDeleteSideEffect();
  });

  it("CaseDebtor bulunamazsa NotFound atar ve preflight/silme yapmaz", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue(null);

    await expect(
      service.removeCaseDebtor(TENANT, CASE_DEBTOR)
    ).rejects.toBeInstanceOf(NotFoundException);

    blockerCountMocks.forEach((count) => expect(count).not.toHaveBeenCalled());
    expectNoDeleteSideEffect();
  });

  it.each(blockerCases)(
    "bağlı %s varsa BadRequest atar ve hard-delete başlamaz",
    async (_name, countMock) => {
      mockExistingCaseDebtor();
      countMock.mockResolvedValue(1);

      await expect(
        service.removeCaseDebtor(TENANT, CASE_DEBTOR)
      ).rejects.toBeInstanceOf(BadRequestException);

      expectNoDeleteSideEffect();
    }
  );
});
