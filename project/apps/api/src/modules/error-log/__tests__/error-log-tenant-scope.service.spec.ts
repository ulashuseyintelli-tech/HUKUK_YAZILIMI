import { ForbiddenException } from "@nestjs/common";
import { ErrorLogService } from "../error-log.service";

function makePrisma() {
  return {
    errorLog: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

// SEC-TENANT-HARDEN-P01 (ERRLOG-TID-01/02): getLogs/getStats artık tenantId zorunlu ve
// fail-closed — eski "if (tenantId) where.tenantId = tenantId" / "tenantId ? {...} : {}"
// fail-open düşüşü kaldırıldı.
describe("ErrorLogService.getLogs — tenant-scope + fail-closed (ERRLOG-TID-02)", () => {
  it("tenant ile scope eder — where.tenantId her zaman auth-tenant'a eşit", async () => {
    const prisma = makePrisma();
    const svc = new ErrorLogService(prisma as any);

    await svc.getLogs("tenant-A", { level: "ERROR", page: 1, limit: 50 });

    expect(prisma.errorLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-A", level: "ERROR" }) }),
    );
    expect(prisma.errorLog.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-A" }) }),
    );
  });

  it("tenantId olmadan (boş string) fail-closed reddeder, hiçbir sorgu çalışmaz", async () => {
    const prisma = makePrisma();
    const svc = new ErrorLogService(prisma as any);

    await expect(svc.getLogs("", { page: 1, limit: 50 })).rejects.toThrow(ForbiddenException);
    expect(prisma.errorLog.findMany).not.toHaveBeenCalled();
    expect(prisma.errorLog.count).not.toHaveBeenCalled();
  });
});

describe("ErrorLogService.getStats — tenant-scope + fail-closed (ERRLOG-TID-01)", () => {
  it("tenant ile scope eder — 4 count çağrısının tamamında where.tenantId auth-tenant'a eşit", async () => {
    const prisma = makePrisma();
    const svc = new ErrorLogService(prisma as any);

    await svc.getStats("tenant-A");

    expect(prisma.errorLog.count).toHaveBeenCalledTimes(4);
    for (const call of prisma.errorLog.count.mock.calls) {
      expect(call[0].where).toEqual(expect.objectContaining({ tenantId: "tenant-A" }));
    }
  });

  it("tenantId olmadan (boş string) fail-closed reddeder, hiçbir sorgu çalışmaz", async () => {
    const prisma = makePrisma();
    const svc = new ErrorLogService(prisma as any);

    await expect(svc.getStats("")).rejects.toThrow(ForbiddenException);
    expect(prisma.errorLog.count).not.toHaveBeenCalled();
  });
});
