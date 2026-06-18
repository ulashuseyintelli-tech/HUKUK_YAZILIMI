import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CaseDebtorService } from "./case-debtor.service";
import { PrismaService } from "@/prisma/prisma.service";

/**
 * CaseDebtorService.removeCaseDebtor — unit tests (mock Prisma).
 *
 * Odak: borçlu dosyadan çıkarılırken o (caseId, debtorId) için açık AddressTask'lar
 * AYNI transaction içinde CANCELLED (reason MANUAL_CANCEL) yapılır; sonra CaseDebtor silinir.
 *
 * NOT: Mock Prisma `updateMany`'i gerçekten FİLTRELEMEZ — bu yüzden burada where'in
 * tam olarak {tenantId, caseId, debtorId, açık-status} ile pinlendiğini assert ederiz
 * (pair+tenant scope'unun MANTIKSAL kanıtı). Gerçek satır-izolasyonu (Case A/Debtor 2
 * durur, Case B/Debtor 1 durur) describeDb integration spec'inde EMPİRİK kanıtlanır.
 */
describe("CaseDebtorService.removeCaseDebtor", () => {
  let service: CaseDebtorService;

  const TENANT = "tenant-1";
  const CASE = "case-1";
  const DEBTOR = "debtor-1";
  const CASE_DEBTOR = "cd-1";

  // Transaction client mock (this.prisma.$transaction(async (tx) => ...) içine geçer)
  const txMock = {
    addressTask: { updateMany: jest.fn() },
    caseDebtor: { delete: jest.fn() },
  };

  const mockPrisma = {
    caseDebtor: { findFirst: jest.fn() },
    thirdParty: { count: jest.fn() },
    collection: { count: jest.fn() },
    $transaction: jest.fn(),
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
    // Default: $transaction callback'i txMock ile çalıştırır ve sonucunu döndürür.
    mockPrisma.$transaction.mockImplementation((cb: any) => cb(txMock));
    txMock.addressTask.updateMany.mockResolvedValue({ count: 0 });
    txMock.caseDebtor.delete.mockResolvedValue({ id: CASE_DEBTOR });
    // Default: bağlı tahsilat yok (guard'ı geçer); tahsilat senaryosu testinde override edilir.
    mockPrisma.collection.count.mockResolvedValue(0);
  });

  it("açık AddressTask'ları (caseId+debtorId+tenant pinli) CANCELLED yapar ve CaseDebtor'u aynı tx'te siler", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue({
      id: CASE_DEBTOR,
      caseId: CASE,
      debtorId: DEBTOR,
      case: { tenantId: TENANT },
    });
    mockPrisma.thirdParty.count.mockResolvedValue(0);
    txMock.caseDebtor.delete.mockResolvedValue({ id: CASE_DEBTOR });

    const result = await service.removeCaseDebtor(TENANT, CASE_DEBTOR);

    // İptal tek transaction içinde
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

    // updateMany TAM olarak pair+tenant+açık-status ile pinlenir
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

    // Sonra CaseDebtor silinir; dönüş değeri korunur (silinen kayıt)
    expect(txMock.caseDebtor.delete).toHaveBeenCalledWith({
      where: { id: CASE_DEBTOR },
    });
    expect(result).toEqual({ id: CASE_DEBTOR });
  });

  it("data.status filtresi yalnız açık statüleri (PENDING/IN_PROGRESS/WAITING_EXTERNAL) hedefler — terminal'leri değil", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue({
      id: CASE_DEBTOR,
      caseId: CASE,
      debtorId: DEBTOR,
      case: { tenantId: TENANT },
    });
    mockPrisma.thirdParty.count.mockResolvedValue(0);

    await service.removeCaseDebtor(TENANT, CASE_DEBTOR);

    const where = txMock.addressTask.updateMany.mock.calls[0][0].where;
    expect(where.status.in).toEqual([
      "PENDING",
      "IN_PROGRESS",
      "WAITING_EXTERNAL",
    ]);
    // DONE/FAILED/CANCELLED/RESOLVED hedeflenmez
    expect(where.status.in).not.toContain("DONE");
    expect(where.status.in).not.toContain("FAILED");
    expect(where.status.in).not.toContain("CANCELLED");
    expect(where.status.in).not.toContain("RESOLVED");
  });

  it("tenant uyuşmazlığında NotFound atar — hiçbir iptal/silme yapılmaz", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue({
      id: CASE_DEBTOR,
      caseId: CASE,
      debtorId: DEBTOR,
      case: { tenantId: "baska-tenant" },
    });

    await expect(
      service.removeCaseDebtor(TENANT, CASE_DEBTOR)
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(mockPrisma.thirdParty.count).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(txMock.addressTask.updateMany).not.toHaveBeenCalled();
    expect(txMock.caseDebtor.delete).not.toHaveBeenCalled();
  });

  it("CaseDebtor bulunamazsa NotFound atar — hiçbir iptal/silme yapılmaz", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue(null);

    await expect(
      service.removeCaseDebtor(TENANT, CASE_DEBTOR)
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(txMock.addressTask.updateMany).not.toHaveBeenCalled();
  });

  it("bağlı üçüncü şahıs varsa BadRequest atar — hiçbir iptal/silme yapılmaz", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue({
      id: CASE_DEBTOR,
      caseId: CASE,
      debtorId: DEBTOR,
      case: { tenantId: TENANT },
    });
    mockPrisma.thirdParty.count.mockResolvedValue(2);

    await expect(
      service.removeCaseDebtor(TENANT, CASE_DEBTOR)
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(txMock.addressTask.updateMany).not.toHaveBeenCalled();
    expect(txMock.caseDebtor.delete).not.toHaveBeenCalled();
  });

  it("bağlı tahsilat (Collection) varsa BadRequest atar — hiçbir iptal/silme yapılmaz", async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue({
      id: CASE_DEBTOR,
      caseId: CASE,
      debtorId: DEBTOR,
      case: { tenantId: TENANT },
    });
    mockPrisma.thirdParty.count.mockResolvedValue(0);
    mockPrisma.collection.count.mockResolvedValue(1);

    await expect(
      service.removeCaseDebtor(TENANT, CASE_DEBTOR)
    ).rejects.toBeInstanceOf(BadRequestException);

    // Tahsilat sayımı tenant + caseDebtorId ile pinlenir (multitenant + defense-in-depth)
    expect(mockPrisma.collection.count).toHaveBeenCalledWith({
      where: { caseDebtorId: CASE_DEBTOR, tenantId: TENANT },
    });
    // Blok: ne transaction ne silme
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(txMock.addressTask.updateMany).not.toHaveBeenCalled();
    expect(txMock.caseDebtor.delete).not.toHaveBeenCalled();
  });
});
