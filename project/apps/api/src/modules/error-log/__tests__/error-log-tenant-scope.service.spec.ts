import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ErrorLogService } from "../error-log.service";

function makePrisma() {
  return {
    errorLog: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

function makeResolvePrisma() {
  return {
    errorLog: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue({
        id: "log-1",
        tenantId: "tenant-A",
        message: "boom",
        stack: "at f (/a.ts:1:2)",
        isResolved: true,
      }),
      update: jest.fn(), // varlığı yalnız "hiç çağrılmadı" iddiası için — atomic updateMany deseni update() kullanmaz
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

// SEC-ERRLOG-RESOLVE-P01: resolve artık tenantId zorunlu ve atomik tenant-scoped updateMany
// kullanıyor (önce find, sonra korumasız update({id}) YOK) — eski hali hiçbir tenant filtresi
// taşımıyordu (opsiyonel parametre bile yoktu, SEC-TENANT-HARDEN-P01'in düzelttiği "optional
// tenantId fail-open" desenden yapısal olarak farklı, daha temel bir gap'ti).

describe("ErrorLogService.resolve — (A) aynı tenant", () => {
  it("kendi tenant'ına ait kaydı resolve eder, yalnız {id, tenantId} ile atomik updateMany yapar", async () => {
    const prisma = makeResolvePrisma();
    const svc = new ErrorLogService(prisma as any);

    const result = await svc.resolve("log-1", "admin-1", "tenant-A", "fixed - root cause X");

    expect(prisma.errorLog.updateMany).toHaveBeenCalledWith({
      where: { id: "log-1", tenantId: "tenant-A" },
      data: expect.objectContaining({
        isResolved: true,
        resolvedBy: "admin-1",
        resolution: "fixed - root cause X",
        activeDedupeKey: null,
      }),
    });
    expect(prisma.errorLog.update).not.toHaveBeenCalled(); // atomic: update({id}) hiç kullanılmaz
    expect(prisma.errorLog.findFirst).toHaveBeenCalledWith({ where: { id: "log-1", tenantId: "tenant-A" } });
    expect(result).toMatchObject({ id: "log-1", tenantId: "tenant-A" });
  });
});

describe("ErrorLogService.resolve — (B) cross-tenant reddi", () => {
  it("Tenant A ADMIN + Tenant B'nin id'si → NotFoundException, hedef kayıt değişmez, hiçbir alan sızmaz", async () => {
    const prisma = makeResolvePrisma();
    // Tenant A'nın where'iyle eşleşen satır yok (kayıt gerçekte Tenant B'ye ait) → count 0.
    prisma.errorLog.updateMany.mockResolvedValue({ count: 0 });
    const svc = new ErrorLogService(prisma as any);

    await expect(svc.resolve("foreign-log", "admin-A", "tenant-A", "trying to resolve")).rejects.toThrow(
      NotFoundException,
    );

    // Yabancı kaydın hiçbir alanı (message/stack/tenantId/userId) response'a taşınmadı —
    // çünkü count=0 dalında hiçbir okuma (findFirst) yapılmıyor, yalnız exception fırlatılıyor.
    expect(prisma.errorLog.findFirst).not.toHaveBeenCalled();
    expect(prisma.errorLog.updateMany).toHaveBeenCalledWith({
      where: { id: "foreign-log", tenantId: "tenant-A" }, // asla { id: "foreign-log" } tek başına değil
      data: expect.anything(),
    });
  });
});

describe("ErrorLogService.resolve — (C) eksik tenant context", () => {
  it.each([["" as const], [undefined as any], [null as any]])(
    "tenantId=%p → fail-closed reddeder, updateMany hiç çağrılmaz",
    async (badTenantId) => {
      const prisma = makeResolvePrisma();
      const svc = new ErrorLogService(prisma as any);

      await expect(svc.resolve("log-1", "admin-1", badTenantId, "fixed")).rejects.toThrow(ForbiddenException);

      expect(prisma.errorLog.updateMany).not.toHaveBeenCalled();
      expect(prisma.errorLog.findFirst).not.toHaveBeenCalled();
    },
  );
});

describe("ErrorLogService.resolve — (D) enumeration resistance", () => {
  it("var olmayan id ile yabancı-tenant id'si aynı dış davranışı üretir (aynı exception, aynı mesaj şekli)", async () => {
    const prismaNonExistent = makeResolvePrisma();
    prismaNonExistent.errorLog.updateMany.mockResolvedValue({ count: 0 }); // id hiç yok
    const svcNonExistent = new ErrorLogService(prismaNonExistent as any);

    const prismaForeignTenant = makeResolvePrisma();
    prismaForeignTenant.errorLog.updateMany.mockResolvedValue({ count: 0 }); // id var ama başka tenant
    const svcForeignTenant = new ErrorLogService(prismaForeignTenant as any);

    let errA: any, errB: any;
    try {
      await svcNonExistent.resolve("nonexistent-id", "admin-1", "tenant-A", "fixed");
    } catch (e) {
      errA = e;
    }
    try {
      await svcForeignTenant.resolve("nonexistent-id", "admin-1", "tenant-A", "fixed");
    } catch (e) {
      errB = e;
    }

    expect(errA).toBeInstanceOf(NotFoundException);
    expect(errB).toBeInstanceOf(NotFoundException);
    expect(errA.message).toBe(errB.message); // ikisi de aynı id ile aynı mesajı üretir — ayırt edilemez
    expect(errA.getStatus()).toBe(errB.getStatus());
  });
});
