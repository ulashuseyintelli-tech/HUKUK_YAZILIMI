import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { CaseDebtorService } from "./case-debtor.service";
import { PrismaService } from "@/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { OfficeApprovalService } from "../office-approval/office-approval.service";
import { CaseDebtorLifecycleGuardService } from "../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service";

describe("CaseDebtorService.removeCaseDebtor", () => {
  let service: CaseDebtorService;
  // C1A: passivate capability-gate — testler eligible aktör varsayar (isApproverEligible=true);
  // yetkisiz/actor-yok senaryosu ayrı describe bloğunda.
  const mockAudit = { log: jest.fn(), logInTransaction: jest.fn().mockResolvedValue(undefined) };
  const mockOfficeApproval = { isApproverEligible: jest.fn().mockResolvedValue(true) };

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
        { provide: AuditService, useValue: mockAudit },
        { provide: OfficeApprovalService, useValue: mockOfficeApproval },
        // DBND-D2: constructor 4. parametre aldı; bu blok removeCaseDebtor'u test eder,
        // updateCaseDebtor'a (dolayısıyla guard'a) dokunmaz → boş stub yeter.
        { provide: CaseDebtorLifecycleGuardService, useValue: {} },
      ],
    }).compile();

    service = module.get<CaseDebtorService>(CaseDebtorService);

    jest.clearAllMocks();
    mockOfficeApproval.isApproverEligible.mockResolvedValue(true);
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

  // C1A: eski davranış (actor yoksa yine de passivatedById:null ile sessizce geçerdi) KAPANDI.
  // Capability-gate actor gerektirir; actor yoksa isApproverEligible'a hiç girmeden 403.
  it("currentUser yoksa 403 (capability-gate actor gerektirir), mutation yapılmaz", async () => {
    mockExistingCaseDebtor();

    await expect(
      service.removeCaseDebtor(TENANT, CASE_DEBTOR)
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(txMock.caseDebtor.update).not.toHaveBeenCalled();
  });

  it("yetkisiz kullanıcı (isApproverEligible=false) → 403, addressTask iptali dahil hiçbir yazma yapılmaz, audit YOK", async () => {
    mockExistingCaseDebtor();
    mockOfficeApproval.isApproverEligible.mockResolvedValueOnce(false);

    await expect(
      service.removeCaseDebtor(TENANT, CASE_DEBTOR, USER)
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(txMock.addressTask.updateMany).not.toHaveBeenCalled();
    expect(txMock.caseDebtor.update).not.toHaveBeenCalled();
    expect(mockAudit.logInTransaction).not.toHaveBeenCalled();
  });

  it("audit AYNI transaction içinde actor + tam old snapshot ile yazılır (CASE_DEBTOR_PASSIVATE, entityType CASE_DEBTOR)", async () => {
    mockExistingCaseDebtor();

    await service.removeCaseDebtor(TENANT, CASE_DEBTOR, USER);

    expect(mockAudit.logInTransaction).toHaveBeenCalledTimes(1);
    const [, input] = mockAudit.logInTransaction.mock.calls[0];
    expect(input).toMatchObject({
      tenantId: TENANT,
      action: "CASE_DEBTOR_PASSIVATE",
      entityType: "CASE_DEBTOR",
      entityId: CASE_DEBTOR,
      userId: USER,
      oldValues: activeCaseDebtor,
      newValues: expect.objectContaining({ lifecycleStatus: "PASSIVE", passivatedById: USER }),
    });
  });

  it("PASSIVE kayıt için no-op dalında audit YAZILMAZ (gerçek geçiş yok)", async () => {
    mockExistingCaseDebtor({ lifecycleStatus: "PASSIVE" });

    await service.removeCaseDebtor(TENANT, CASE_DEBTOR, USER);

    expect(mockAudit.logInTransaction).not.toHaveBeenCalled();
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

  // DBND-D2: updateCaseDebtor() artık merkezi CaseDebtorLifecycleGuardService kullanıyor
  // (eski kopya "if (lifecycleStatus === PASSIVE) throw" yerine) + değişen alanları audit'e yazıyor.
  const mockLifecycleGuard = { assertActiveByCaseDebtorId: jest.fn() };
  const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

  const existingCaseDebtor = {
    id: "case-debtor-1",
    caseId: "case-1",
    debtorId: "debtor-1",
    role: "ASIL_BORCLU",
    liabilityAmount: 1000,
    lifecycleStatus: "ACTIVE",
    ilanenJustification: null,
    case: { tenantId: "tenant-1" },
    debtor: { kepAddress: null },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLifecycleGuard.assertActiveByCaseDebtorId.mockResolvedValue({
      id: "case-debtor-1",
      caseId: "case-1",
      debtorId: "debtor-1",
      lifecycleStatus: "ACTIVE",
    });
    // C1A: constructor 2 yeni parametre aldı; DBND-D2: 4. parametre (lifecycle guard) +
    // audit artık gerçek mock (removeCaseDebtor'a dokunmaz, boş officeApproval mock yeter).
    service = new CaseDebtorService(mockPrisma as any, mockAudit as any, {} as any, mockLifecycleGuard as any);
  });

  it("PASSIVE CaseDebtor üzerinde PUT mutasyonunu merkezi guard reddeder", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue({
      ...existingCaseDebtor,
      lifecycleStatus: "PASSIVE",
    });
    mockLifecycleGuard.assertActiveByCaseDebtorId.mockRejectedValue(
      new BadRequestException("Pasif dosya borçlusu yeni operasyon hedefi olamaz.")
    );

    await expect(
      service.updateCaseDebtor("tenant-1", "case-debtor-1", {
        caseNote: "pasif kayıt güncellemesi",
      } as any)
    ).rejects.toBeInstanceOf(BadRequestException);

    // Merkezi guard GERÇEKTEN çağrıldı (eski kopya kontrol değil).
    expect(mockLifecycleGuard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(
      "tenant-1",
      "case-debtor-1",
      { expectedCaseId: "case-1" },
    );
    expect(mockPrisma.debtorAddress.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.caseDebtor.update).not.toHaveBeenCalled();
    expect(mockAudit.log).not.toHaveBeenCalled();
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

  it("role değişikliği CASE_DEBTOR_UPDATE audit'e eski/yeni değeri yazar", async () => {
    mockPrisma.caseDebtor.findFirst
      .mockResolvedValueOnce(existingCaseDebtor) // ilk fetch
      .mockResolvedValueOnce(null); // role-uniqueness check: çakışma yok
    mockPrisma.caseDebtor.update.mockResolvedValue({
      ...existingCaseDebtor,
      role: "MUTESELSIL_KEFIL",
    });

    await service.updateCaseDebtor(
      "tenant-1",
      "case-debtor-1",
      { role: "MUTESELSIL_KEFIL" } as any,
      { userId: "user-1" },
    );

    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        action: "CASE_DEBTOR_UPDATE",
        entityType: "CASE_DEBTOR",
        entityId: "case-debtor-1",
        userId: "user-1",
        metadata: {
          fieldDiff: expect.arrayContaining([
            expect.objectContaining({ field: "role", old: "ASIL_BORCLU", new: "MUTESELSIL_KEFIL" }),
          ]),
        },
      }),
    );
  });

  it("liabilityAmount değişikliği audit'e eski/yeni değeri yazar", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue(existingCaseDebtor);
    mockPrisma.caseDebtor.update.mockResolvedValue({
      ...existingCaseDebtor,
      liabilityAmount: 2500,
    });

    await service.updateCaseDebtor(
      "tenant-1",
      "case-debtor-1",
      { liabilityAmount: 2500 } as any,
      { userId: "user-1" },
    );

    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CASE_DEBTOR_UPDATE",
        metadata: {
          fieldDiff: expect.arrayContaining([
            expect.objectContaining({ field: "liabilityAmount", old: 1000, new: 2500 }),
          ]),
        },
      }),
    );
  });

  it("aktör bilgisi yoksa güvenli davranır — audit userId=undefined ile yazılır, mutasyon engellenmez", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue(existingCaseDebtor);
    mockPrisma.caseDebtor.update.mockResolvedValue({
      ...existingCaseDebtor,
      liabilityAmount: 3000,
    });

    const result = await service.updateCaseDebtor("tenant-1", "case-debtor-1", { liabilityAmount: 3000 } as any);

    expect(result.liabilityAmount).toBe(3000);
    expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ userId: undefined }));
  });

  it("değişiklik yoksa (aynı role/liabilityAmount) gereksiz audit üretilmez", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue(existingCaseDebtor);
    mockPrisma.caseDebtor.update.mockResolvedValue({ ...existingCaseDebtor });

    await service.updateCaseDebtor("tenant-1", "case-debtor-1", {
      role: existingCaseDebtor.role,
      liabilityAmount: existingCaseDebtor.liabilityAmount,
    } as any);

    expect(mockAudit.log).not.toHaveBeenCalled();
  });
});
