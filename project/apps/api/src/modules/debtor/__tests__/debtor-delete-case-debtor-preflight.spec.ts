import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DebtorService } from "../debtor.service";

describe("PR-D2 DebtorService.delete CaseDebtor preflight", () => {
  const tenantId = "tenant-1";
  const debtorId = "debtor-1";

  function makeService(caseDebtorCount = 0) {
    const prisma = {
      caseDebtor: {
        count: jest.fn().mockResolvedValue(caseDebtorCount),
      },
      debtor: {
        delete: jest.fn().mockResolvedValue({ id: debtorId }),
      },
    };

    const service = new DebtorService(prisma as any);
    jest.spyOn(service, "findOne").mockResolvedValue({ id: debtorId } as any);

    return { service, prisma };
  }

  it("CaseDebtor ilişkisi olmayan borçluyu hard-delete eder", async () => {
    const { service, prisma } = makeService(0);

    await expect(service.delete(tenantId, debtorId)).resolves.toEqual({
      id: debtorId,
    });

    expect(service.findOne).toHaveBeenCalledWith(tenantId, debtorId);
    expect(prisma.caseDebtor.count).toHaveBeenCalledWith({
      where: {
        debtorId,
        case: { tenantId },
      },
    });
    expect(prisma.debtor.delete).toHaveBeenCalledWith({ where: { id: debtorId } });
  });

  it("aktif CaseDebtor varken prisma.debtor.delete öncesi bloklar", async () => {
    const { service, prisma } = makeService(1);

    await expect(service.delete(tenantId, debtorId)).rejects.toBeInstanceOf(
      BadRequestException
    );

    expect(prisma.caseDebtor.count).toHaveBeenCalledWith({
      where: {
        debtorId,
        case: { tenantId },
      },
    });
    expect(prisma.debtor.delete).not.toHaveBeenCalled();
  });

  it("PASSIVE CaseDebtor varken hard-delete yolunu bloklar", async () => {
    const { service, prisma } = makeService(1);

    await expect(service.delete(tenantId, debtorId)).rejects.toThrow(
      "Dosya bağlantısı veya tarihçe varken borçlu silinemez."
    );

    expect(prisma.caseDebtor.count).toHaveBeenCalledWith({
      where: {
        debtorId,
        case: { tenantId },
      },
    });
    expect(prisma.debtor.delete).not.toHaveBeenCalled();
  });

  it("kapalı/tarihsel CaseDebtor varken caseStatus filtresine düşmeden bloklar", async () => {
    const { service, prisma } = makeService(1);

    await expect(service.delete(tenantId, debtorId)).rejects.toBeInstanceOf(
      BadRequestException
    );

    expect(prisma.caseDebtor.count).toHaveBeenCalledWith({
      where: {
        debtorId,
        case: { tenantId },
      },
    });
    expect(prisma.caseDebtor.count.mock.calls[0][0].where.case).not.toHaveProperty(
      "caseStatus"
    );
    expect(prisma.debtor.delete).not.toHaveBeenCalled();
  });

  it("CaseDebtor + ServiceHistory tarihçesi varken parent cascade yolunu bloklar", async () => {
    const { service, prisma } = makeService(1);

    await expect(service.delete(tenantId, debtorId)).rejects.toBeInstanceOf(
      BadRequestException
    );

    expect(prisma.debtor.delete).not.toHaveBeenCalled();
  });

  it("Collection/Tebligat atıfları CaseDebtor üzerinden korunurken hard-delete bloklanır", async () => {
    const { service, prisma } = makeService(1);

    await expect(service.delete(tenantId, debtorId)).rejects.toBeInstanceOf(
      BadRequestException
    );

    expect(prisma.caseDebtor.count).toHaveBeenCalledWith({
      where: {
        debtorId,
        case: { tenantId },
      },
    });
    expect(prisma.debtor.delete).not.toHaveBeenCalled();
  });

  it("cross-tenant veya bulunamayan borçlu NotFound kalır; count/delete çalışmaz", async () => {
    const { service, prisma } = makeService(0);
    (service.findOne as jest.Mock).mockRejectedValueOnce(
      new NotFoundException("Borçlu bulunamadı")
    );

    await expect(service.delete("foreign-tenant", debtorId)).rejects.toBeInstanceOf(
      NotFoundException
    );

    expect(service.findOne).toHaveBeenCalledWith("foreign-tenant", debtorId);
    expect(prisma.caseDebtor.count).not.toHaveBeenCalled();
    expect(prisma.debtor.delete).not.toHaveBeenCalled();
  });
});
