import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CaseDebtorService } from "./case-debtor.service";
import { PrismaService } from "@/prisma/prisma.service";

describe("CaseDebtorService.removeCaseDebtor", () => {
  let service: CaseDebtorService;

  const TENANT = "tenant-1";
  const CASE = "case-1";
  const DEBTOR = "debtor-1";
  const CASE_DEBTOR = "cd-1";
  const USER = "user-1";

  const activeCaseDebtor = {
    id: CASE_DEBTOR,
    caseId: CASE,
    debtorId: DEBTOR,
    role: "ASIL_BORCLU",
    lifecycleStatus: "ACTIVE",
    passivatedAt: null,
    passivatedById: null,
    passivationReason: null,
    passivationNote: null,
    passivationEffectiveAt: null,
  };

  const txMock = {
    addressTask: { updateMany: jest.fn() },
    caseDebtor: {
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockPrisma = {
    caseDebtor: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    debtorAddress: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockExistingCaseDebtor = (overrides: Record<string, unknown> = {}) => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue({
      ...activeCaseDebtor,
      ...overrides,
    });
  };

  const expectTenantScopedLookup = () => {
    expect(mockPrisma.caseDebtor.findFirst).toHaveBeenCalledWith({
      where: { id: CASE_DEBTOR, case: { tenantId: TENANT } },
    });
  };

  const expectAddressTaskCancellation = () => {
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
    txMock.caseDebtor.update.mockResolvedValue({
      ...activeCaseDebtor,
      lifecycleStatus: "PASSIVE",
      passivatedById: USER,
      passivationReason: "MANUAL",
    });
  });

  it("aktif CaseDebtor kaydını hard-delete yerine PASSIVE yapar", async () => {
    mockExistingCaseDebtor();

    const result = await service.removeCaseDebtor(TENANT, CASE_DEBTOR, USER);

    expectTenantScopedLookup();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.caseDebtor.update).toHaveBeenCalledWith({
      where: { id: CASE_DEBTOR },
      data: {
        lifecycleStatus: "PASSIVE",
        passivatedAt: expect.any(Date),
        passivatedById: USER,
        passivationReason: "MANUAL",
        passivationNote: null,
        passivationEffectiveAt: null,
      },
    });
    expect(txMock.caseDebtor.delete).not.toHaveBeenCalled();
    expect(result.lifecycleStatus).toBe("PASSIVE");
  });

  it("açık AddressTask kayıtlarını tenant+case+debtor pinli şekilde CANCELLED yapar", async () => {
    mockExistingCaseDebtor();

    await service.removeCaseDebtor(TENANT, CASE_DEBTOR, USER);

    expectAddressTaskCancellation();
  });

  it("terminal AddressTask statülerini cancellation filtresine dahil etmez", async () => {
    mockExistingCaseDebtor();

    await service.removeCaseDebtor(TENANT, CASE_DEBTOR, USER);

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

  it("tenant uyuşmazlığında veya kayıt yoksa mutation yapmaz", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue(null);

    await expect(
      service.removeCaseDebtor(TENANT, CASE_DEBTOR, USER)
    ).rejects.toBeInstanceOf(NotFoundException);

    expectTenantScopedLookup();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(txMock.addressTask.updateMany).not.toHaveBeenCalled();
    expect(txMock.caseDebtor.update).not.toHaveBeenCalled();
    expect(txMock.caseDebtor.delete).not.toHaveBeenCalled();
  });

  it("PASSIVE kayıt için idempotent döner ve passivation metadata değerlerini ezmez", async () => {
    const passivatedAt = new Date("2026-01-01T00:00:00.000Z");
    mockExistingCaseDebtor({
      lifecycleStatus: "PASSIVE",
      passivatedAt,
      passivatedById: "existing-user",
      passivationReason: "EXISTING_REASON",
      passivationNote: "existing note",
      passivationEffectiveAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    const result = await service.removeCaseDebtor(TENANT, CASE_DEBTOR, USER);

    expectAddressTaskCancellation();
    expect(txMock.caseDebtor.update).not.toHaveBeenCalled();
    expect(txMock.caseDebtor.delete).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        lifecycleStatus: "PASSIVE",
        passivatedAt,
        passivatedById: "existing-user",
        passivationReason: "EXISTING_REASON",
        passivationNote: "existing note",
      })
    );
  });

  it("currentUser yoksa passivatedById null bırakılır", async () => {
    mockExistingCaseDebtor();

    await service.removeCaseDebtor(TENANT, CASE_DEBTOR);

    expect(txMock.caseDebtor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passivatedById: null }),
      })
    );
  });
});

describe("CaseDebtorService.updateCaseDebtor", () => {
  let service: CaseDebtorService;

  const mockPrisma = {
    caseDebtor: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    debtorAddress: { findFirst: jest.fn() },
  };

  const existingCaseDebtor = {
    id: "case-debtor-1",
    caseId: "case-1",
    debtorId: "debtor-1",
    role: "ASIL_BORCLU",
    lifecycleStatus: "ACTIVE",
    ilanenJustification: null,
    case: { tenantId: "tenant-1" },
    debtor: { kepAddress: null },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CaseDebtorService(mockPrisma as any);
  });

  it("PASSIVE CaseDebtor üzerinde PUT mutasyonunu engeller", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue({
      ...existingCaseDebtor,
      lifecycleStatus: "PASSIVE",
    });

    await expect(
      service.updateCaseDebtor("tenant-1", "case-debtor-1", {
        caseNote: "pasif kayıt güncellemesi",
      } as any)
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockPrisma.caseDebtor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "case-debtor-1", case: { tenantId: "tenant-1" } },
      })
    );
    expect(mockPrisma.debtorAddress.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.caseDebtor.update).not.toHaveBeenCalled();
  });

  it("ACTIVE CaseDebtor üzerinde mevcut update davranışını korur", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue(existingCaseDebtor);
    mockPrisma.caseDebtor.update.mockResolvedValue({
      ...existingCaseDebtor,
      caseNote: "aktif kayıt güncellemesi",
    });

    const result = await service.updateCaseDebtor("tenant-1", "case-debtor-1", {
      caseNote: "aktif kayıt güncellemesi",
    } as any);

    expect(mockPrisma.caseDebtor.update).toHaveBeenCalledWith({
      where: { id: "case-debtor-1" },
      data: { caseNote: "aktif kayıt güncellemesi" },
      include: {
        debtor: { include: { debtorAddresses: true } },
        selectedAddress: true,
      },
    });
    expect(result.caseNote).toBe("aktif kayıt güncellemesi");
  });
});
