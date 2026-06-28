import { ErrorLogService } from "../error-log.service";

function makePrisma() {
  return {
    errorLog: {
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

const baseEntry = {
  level: "ERROR" as const,
  source: "API",
  message: "boom",
  stack: "at f (/a.ts:1:2)",
  endpoint: "/api/cases/1",
  method: "POST",
  statusCode: 500,
  tenantId: "t1",
  errorName: "Error",
};

describe("ErrorLogService.log — kalıcı dedupe upsert (PR-2b)", () => {
  it("yeni olay → upsert; where.activeDedupeKey 64-hex; create fingerprint+occurrenceCount=1+firstSeenAt+lastSeenAt", async () => {
    const prisma = makePrisma();
    const svc = new ErrorLogService(prisma as any);
    await svc.log({ ...baseEntry });
    expect(prisma.errorLog.upsert).toHaveBeenCalledTimes(1);
    const arg = prisma.errorLog.upsert.mock.calls[0][0];
    expect(arg.where.activeDedupeKey).toMatch(/^[0-9a-f]{64}$/);
    expect(arg.create.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(arg.create.occurrenceCount).toBe(1);
    expect(arg.create.firstSeenAt).toBeInstanceOf(Date);
    expect(arg.create.lastSeenAt).toBeInstanceOf(Date);
    expect(arg.create.activeDedupeKey).toBe(arg.where.activeDedupeKey);
    expect(arg.update.occurrenceCount).toEqual({ increment: 1 });
    expect(arg.update.lastSeenAt).toBeInstanceOf(Date);
  });

  it("aynı parametre iki kez → AYNI activeDedupeKey (determinizm)", async () => {
    const prisma = makePrisma();
    const svc = new ErrorLogService(prisma as any);
    await svc.log({ ...baseEntry });
    await svc.log({ ...baseEntry });
    const k1 = prisma.errorLog.upsert.mock.calls[0][0].where.activeDedupeKey;
    const k2 = prisma.errorLog.upsert.mock.calls[1][0].where.activeDedupeKey;
    expect(k1).toBe(k2);
  });

  it("farklı tenant → farklı activeDedupeKey (kabul #5)", async () => {
    const prisma = makePrisma();
    const svc = new ErrorLogService(prisma as any);
    await svc.log({ ...baseEntry, tenantId: "t1" });
    await svc.log({ ...baseEntry, tenantId: "t2" });
    expect(prisma.errorLog.upsert.mock.calls[0][0].where.activeDedupeKey).not.toBe(
      prisma.errorLog.upsert.mock.calls[1][0].where.activeDedupeKey,
    );
  });

  it("/cases/123 ve /cases/456 → AYNI activeDedupeKey (kabul #7, endpoint normalize)", async () => {
    const prisma = makePrisma();
    const svc = new ErrorLogService(prisma as any);
    await svc.log({ ...baseEntry, endpoint: "/api/cases/123" });
    await svc.log({ ...baseEntry, endpoint: "/api/cases/456" });
    expect(prisma.errorLog.upsert.mock.calls[0][0].where.activeDedupeKey).toBe(
      prisma.errorLog.upsert.mock.calls[1][0].where.activeDedupeKey,
    );
  });

  it("P2002 yarış → updateMany increment fallback (kabul #10)", async () => {
    const prisma = makePrisma();
    prisma.errorLog.upsert.mockRejectedValueOnce({ code: "P2002" });
    const svc = new ErrorLogService(prisma as any);
    await svc.log({ ...baseEntry });
    expect(prisma.errorLog.updateMany).toHaveBeenCalledTimes(1);
    const arg = prisma.errorLog.updateMany.mock.calls[0][0];
    expect(arg.where.activeDedupeKey).toMatch(/^[0-9a-f]{64}$/);
    expect(arg.data.occurrenceCount).toEqual({ increment: 1 });
  });

  it("LOGGING ISOLATION: upsert generic hata atarsa log() ATMAZ (undefined döner)", async () => {
    const prisma = makePrisma();
    prisma.errorLog.upsert.mockRejectedValueOnce(new Error("db down"));
    const svc = new ErrorLogService(prisma as any);
    await expect(svc.log({ ...baseEntry })).resolves.toBeUndefined();
    expect(prisma.errorLog.updateMany).not.toHaveBeenCalled();
  });
});

describe("ErrorLogService.resolve — activeDedupeKey null (PR-2b)", () => {
  it("resolve → update data.activeDedupeKey=null + isResolved + resolvedBy (kabul #9)", async () => {
    const prisma = makePrisma();
    const svc = new ErrorLogService(prisma as any);
    await svc.resolve("log1", "admin1", "fixed");
    const arg = prisma.errorLog.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "log1" });
    expect(arg.data.activeDedupeKey).toBeNull();
    expect(arg.data.isResolved).toBe(true);
    expect(arg.data.resolvedBy).toBe("admin1");
    expect(arg.data.resolution).toBe("fixed");
  });
});
