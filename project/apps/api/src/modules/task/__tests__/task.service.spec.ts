/**
 * PR-PERF-1 — Task kapanış atfı (completedByUserId + resolutionType).
 * Doğrular: (1) manuel COMPLETED → MANUAL + kapatan User, (2) yeniden açma → kapanış izi temizlenir,
 * (3) statü değişmeyen güncellemede kapanış alanlarına dokunulmaz.
 * F03-A1 (K-7): atıf yalnız GERÇEK geçişte (COMPLETED olmayan → COMPLETED) ve satır kilidi altında yazılır.
 *
 * CANDIDATE-J1 (STF-PRD-BOLA-002 baseline) — Task assignee uygunluk kapısı.
 * Doğrular: dolu assignee için aynı-tenant + aktif kontrolü (kabul/ret), null assignee kabulü,
 * yalnız ileriye-dönük write-time enforcement (create + update).
 */

import { BadRequestException } from "@nestjs/common";
import { TaskService } from "../task.service";

/**
 * F03-A1: update() durum geçişi kararını satır kilidi altında verir (işlem + `FOR UPDATE`).
 * F03-A2: create() / update() görev yazımını, geçmiş satırlarını ve denetim kaydını TEK işlemde yazar; aktör işlem içinde okunur.
 * Sahte işlem istemcisi (`$tx`) kök nesnenin `task` sahtelerini paylaşır (aynı `findFirst` / `update` / `create`), aktör okuması
 * ve geçmiş yazımı ise kendi sahteleridir: kök `user.findFirst` yalnız ATANAN uygunluğu için sayılmaya devam eder.
 */
function withTx<T extends Record<string, any>>(prisma: T, actor: { role: string } | null = { role: "USER" }): T {
  const db = prisma as any;
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    task: db.task,
    taskHistoryEvent: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    user: { findFirst: jest.fn(async ({ where }: any) => (actor ? { id: where.id, role: actor.role } : null)) },
  };
  db.$tx = tx;
  db.$queryRaw = tx.$queryRaw;
  db.$transaction = jest.fn(async (fn: (client: unknown) => unknown) => fn(tx));
  return prisma;
}

/** F03-A2: yazım yolları denetim servisi ister (yoksa 503). Testler işlem içi denetim yazımını bu sahteyle görür. */
const auditMock = () => ({ logInTransaction: jest.fn().mockResolvedValue(undefined) });
const serviceOf = (prisma: any, caseViewScope?: any, audit: any = auditMock()) => new TaskService(prisma, undefined, audit, caseViewScope);

const buildPrisma = (existing: any = { id: "tk", status: "PENDING" }) =>
  withTx({
    task: {
      findFirst: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockResolvedValue({}),
    },
  });

describe("TaskService.update — kapanış atfı", () => {
  it("status=COMPLETED → completedByUserId=userId + resolutionType=MANUAL + completedAt set", async () => {
    const prisma = buildPrisma() as any;
    const svc = serviceOf(prisma);

    await svc.update("t1", "tk", "user-9", { status: "COMPLETED" } as any);

    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data.resolutionType).toBe("MANUAL");
    expect(data.completedByUserId).toBe("user-9");
    expect(data.completedAt).toBeInstanceOf(Date);
  });

  it("COMPLETED→PENDING (yeniden açma) → kapanış izi temizlenir (null)", async () => {
    const prisma = buildPrisma({ id: "tk", status: "COMPLETED" }) as any;
    const svc = serviceOf(prisma);

    await svc.update("t1", "tk", "user-9", { status: "PENDING" } as any);

    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data.completedAt).toBeNull();
    expect(data.completedByUserId).toBeNull();
    expect(data.resolutionType).toBeNull();
  });

  it("status verilmeyen güncelleme (ör. başlık) → kapanış alanlarına DOKUNMAZ", async () => {
    const prisma = buildPrisma() as any;
    const svc = serviceOf(prisma);

    await svc.update("t1", "tk", "user-9", { title: "Yeni başlık" } as any);

    const data = prisma.task.update.mock.calls[0][0].data;
    expect("completedAt" in data).toBe(false);
    expect("completedByUserId" in data).toBe(false);
    expect("resolutionType" in data).toBe(false);
  });

  // ── F03-A1 (K-7): atıf yalnız GERÇEK geçişte yazılır ──────────────────────────────────────────────
  it("F03-A1: COMPLETED → COMPLETED gidiş-dönüşü atfı ve tamamlanma anını EZMEZ; diğer alanlar yazılır", async () => {
    const prisma = buildPrisma({ id: "tk", status: "COMPLETED" }) as any;

    await serviceOf(prisma).update("t1", "tk", "user-9", { status: "COMPLETED", title: "Düzenlendi" } as any);

    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "COMPLETED", title: "Düzenlendi" });
    for (const key of ["completedAt", "completedByUserId", "resolutionType"]) expect(data).not.toHaveProperty(key);
  });

  it("F03-A1: geçiş kararı KİLİT ALTINDA okunan duruma göre verilir — eşzamanlı tamamlamada ikinci yazan atfı ezmez", async () => {
    const prisma = buildPrisma() as any;
    // Kilitsiz ön okuma PENDING görür; kilit alındığında başka bir istek görevi çoktan tamamlamıştır.
    prisma.task.findFirst = jest.fn().mockResolvedValueOnce({ id: "tk", status: "PENDING" }).mockResolvedValueOnce({ status: "COMPLETED" });

    await serviceOf(prisma).update("t1", "tk", "user-9", { status: "COMPLETED" } as any);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    // kilit sorgusu, kilit altındaki okumadan ÖNCE çalışır
    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.task.findFirst.mock.invocationCallOrder[1]);
    const data = prisma.task.update.mock.calls[0][0].data;
    for (const key of ["completedAt", "completedByUserId", "resolutionType"]) expect(data).not.toHaveProperty(key);
  });

  it("F03-A1: yeniden açılıp başka kişi tamamlarsa atıf YENİ kişiye geçer", async () => {
    const reopened = buildPrisma({ id: "tk", status: "COMPLETED" }) as any;
    await serviceOf(reopened).update("t1", "tk", "user-2", { status: "PENDING" } as any);
    expect(reopened.task.update.mock.calls[0][0].data).toMatchObject({ status: "PENDING", completedAt: null, completedByUserId: null, resolutionType: null });

    const again = buildPrisma({ id: "tk", status: "PENDING" }) as any;
    await serviceOf(again).update("t1", "tk", "user-2", { status: "COMPLETED" } as any);
    expect(again.task.update.mock.calls[0][0].data).toMatchObject({ completedByUserId: "user-2", resolutionType: "MANUAL" });
  });

  it("F03-A1: kilit altında görev yoksa 404; yazım yapılmaz", async () => {
    const prisma = buildPrisma() as any;
    prisma.task.findFirst = jest.fn().mockResolvedValueOnce({ id: "tk", status: "PENDING" }).mockResolvedValueOnce(null);

    await expect(serviceOf(prisma).update("t1", "tk", "user-9", { status: "COMPLETED" } as any)).rejects.toMatchObject({ status: 404 });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("F03-A1: eşzamanlı yeniden açmadan sonra değişmemiş CANCELLED alanı iptal yetkisi sayılmaz (kilit altında 400)", async () => {
    const prisma = buildPrisma() as any;
    // Ön okuma CANCELLED görür; kilit alındığında görev yeniden açılmıştır.
    prisma.task.findFirst = jest.fn().mockResolvedValueOnce({ id: "tk", status: "CANCELLED" }).mockResolvedValueOnce({ status: "PENDING" });

    await expect(serviceOf(prisma).update("t1", "tk", "user-9", { status: "CANCELLED", title: "x" } as any)).rejects.toMatchObject({ status: 400 });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });
});

describe("TaskService — CANDIDATE-J1 assignee uygunluk kapısı (tenant + aktiflik)", () => {
  const TENANT = "tenant-1";

  // In-memory user tablosu: assertAssigneeEligible'ın `where: { id, tenantId, isActive: true }`
  // sorgusunu gerçekten uygular; böylece 4 senaryo (tenant + aktiflik eksenleri) anlamlı test edilir.
  const USERS = [
    { id: "u-active-same", tenantId: TENANT, isActive: true }, // uygun aday
    { id: "u-inactive-same", tenantId: TENANT, isActive: false }, // pasif, aynı tenant
    { id: "u-active-other", tenantId: "tenant-2", isActive: true }, // aktif, farklı tenant
  ];

  const buildPrismaWithUsers = (existing: any = { id: "tk", status: "PENDING" }) =>
    withTx({
      task: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn().mockResolvedValue({ id: "tk-new" }),
        update: jest.fn().mockResolvedValue({ id: "tk" }),
      },
      user: {
        findFirst: jest.fn(({ where }: any) => {
          const match = USERS.find(
            (u) => u.id === where.id && u.tenantId === where.tenantId && u.isActive === where.isActive
          );
          return Promise.resolve(match ? { id: match.id } : null);
        }),
      },
    });

  // 1) aynı-tenant + aktif → KABUL
  it("create: aynı-tenant + aktif assignee → kabul (task.create çağrılır)", async () => {
    const prisma = buildPrismaWithUsers() as any;
    const svc = serviceOf(prisma);

    await svc.create(TENANT, "creator-1", { title: "İş", assigneeId: "u-active-same" } as any);

    expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({
      id: "u-active-same",
      tenantId: TENANT,
      isActive: true,
    });
    expect(prisma.task.create).toHaveBeenCalledTimes(1);
    expect(prisma.task.create.mock.calls[0][0].data.assigneeId).toBe("u-active-same");
  });

  // 2) cross-tenant → RET
  it("create: cross-tenant assignee → ret (BadRequest, task.create çağrılmaz)", async () => {
    const prisma = buildPrismaWithUsers() as any;
    const svc = serviceOf(prisma);

    await expect(
      svc.create(TENANT, "creator-1", { title: "İş", assigneeId: "u-active-other" } as any)
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  // 3) aynı-tenant + pasif → RET
  it("create: aynı-tenant + pasif assignee → ret (BadRequest, task.create çağrılmaz)", async () => {
    const prisma = buildPrismaWithUsers() as any;
    const svc = serviceOf(prisma);

    await expect(
      svc.create(TENANT, "creator-1", { title: "İş", assigneeId: "u-inactive-same" } as any)
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  // 4) null/boş assignee → KABUL (uygunluk sorgusu hiç çalışmaz)
  it("create: assignee verilmeyen görev → kabul (user.findFirst çağrılmaz)", async () => {
    const prisma = buildPrismaWithUsers() as any;
    const svc = serviceOf(prisma);

    await svc.create(TENANT, "creator-1", { title: "Sahipsiz iş" } as any);

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.task.create).toHaveBeenCalledTimes(1);
  });

  // update yolu da aynı kapıdan geçer (ileriye-dönük enforcement create + update)
  it("update: aynı-tenant + aktif assignee → kabul (task.update çağrılır)", async () => {
    const prisma = buildPrismaWithUsers() as any;
    const svc = serviceOf(prisma);

    await svc.update(TENANT, "tk", "editor-1", { assigneeId: "u-active-same" } as any);

    expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.task.update).toHaveBeenCalledTimes(1);
  });

  it("update: cross-tenant assignee → ret (BadRequest, task.update çağrılmaz)", async () => {
    const prisma = buildPrismaWithUsers() as any;
    const svc = serviceOf(prisma);

    await expect(
      svc.update(TENANT, "tk", "editor-1", { assigneeId: "u-active-other" } as any)
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("update: assignee içermeyen güncelleme (ör. başlık) → uygunluk sorgusu çalışmaz", async () => {
    const prisma = buildPrismaWithUsers() as any;
    const svc = serviceOf(prisma);

    await svc.update(TENANT, "tk", "editor-1", { title: "Yeni başlık" } as any);

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.task.update).toHaveBeenCalledTimes(1);
  });
});

describe("TaskService — dueDate normalizasyonu (F01 K-F7: tarih-only 500 düzeltmesi)", () => {
  const TENANT = "tenant-1";
  const build = () =>
    withTx({
      task: {
        findFirst: jest.fn().mockResolvedValue({ id: "tk", status: "PENDING" }),
        create: jest.fn().mockResolvedValue({ id: "tk-new" }),
        update: jest.fn().mockResolvedValue({ id: "tk" }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: "u" }) },
    });

  it("create: tarih-only 'YYYY-MM-DD' → UTC gece yarısı Date (web modal biçimi; önceden Prisma 500)", async () => {
    const prisma = build() as any;
    await serviceOf(prisma).create(TENANT, "c", { title: "İş", dueDate: "2026-11-05" } as any);
    const data = prisma.task.create.mock.calls[0][0].data;
    expect(data.dueDate).toBeInstanceOf(Date);
    expect(data.dueDate.toISOString()).toBe("2026-11-05T00:00:00.000Z");
  });

  it("create: tam ISO-8601 (saat dilimli) → aynı an korunur", async () => {
    const prisma = build() as any;
    await serviceOf(prisma).create(TENANT, "c", { title: "İş", dueDate: "2026-11-05T10:00:00+03:00" } as any);
    expect(prisma.task.create.mock.calls[0][0].data.dueDate.toISOString()).toBe("2026-11-05T07:00:00.000Z");
  });

  it("create: dueDate verilmeyen görev → alan undefined (Prisma dokunmaz)", async () => {
    const prisma = build() as any;
    await serviceOf(prisma).create(TENANT, "c", { title: "İş" } as any);
    expect(prisma.task.create.mock.calls[0][0].data.dueDate).toBeUndefined();
  });

  it.each(["abc", "2026-02-30", "2026-13-01", ""])("create: geçersiz dueDate %p → 400 BadRequest, task.create çağrılmaz", async (bad) => {
    const prisma = build() as any;
    await expect(serviceOf(prisma).create(TENANT, "c", { title: "İş", dueDate: bad } as any)).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("update: tarih-only → Date; null → tarihi temizler (null); alan yoksa undefined", async () => {
    const p1 = build() as any;
    await serviceOf(p1).update(TENANT, "tk", "u", { dueDate: "2026-11-06" } as any);
    expect(p1.task.update.mock.calls[0][0].data.dueDate.toISOString()).toBe("2026-11-06T00:00:00.000Z");
    const p2 = build() as any;
    await serviceOf(p2).update(TENANT, "tk", "u", { dueDate: null } as any);
    expect(p2.task.update.mock.calls[0][0].data.dueDate).toBeNull();
    const p3 = build() as any;
    await serviceOf(p3).update(TENANT, "tk", "u", { title: "Başlık" } as any);
    expect(p3.task.update.mock.calls[0][0].data.dueDate).toBeUndefined();
  });
});

describe("2b / KI-048 — legacy cancellation bypasses", () => {
  it("physical DELETE is rejected without querying/deleting task or history", async () => {
    const db = { task: { findFirst: jest.fn().mockResolvedValue({ id: "task" }), delete: jest.fn().mockResolvedValue({ id: "task" }), deleteMany: jest.fn() } } as any;
    await expect(new TaskService(db).delete("tenant", "task")).rejects.toMatchObject({ status: 405 });
    expect(db.task.findFirst).not.toHaveBeenCalled();
    expect(db.task.delete).not.toHaveBeenCalled();
    expect(db.task.deleteMany).not.toHaveBeenCalled();
  });

  it("create cannot manufacture a cancelled task without a cancellation record", async () => {
    const db = { task: { create: jest.fn() } } as any;
    await expect(new TaskService(db).create("tenant", "actor", { title: "T", status: "CANCELLED" } as any)).rejects.toMatchObject({ status: 400 });
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("generic PUT cannot introduce CANCELLED even with other assignment/title changes", async () => {
    const db = buildPrisma({ id: "task", status: "PENDING" }) as any;
    db.user = { findFirst: jest.fn().mockResolvedValue({ id: "actor" }) };
    await expect(new TaskService(db).update("tenant", "task", "actor", { status: "CANCELLED", assigneeId: "actor", title: "T" } as any)).rejects.toMatchObject({ status: 400 });
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it("unchanged CANCELLED round trip never rewrites lifecycle fields", async () => {
    const db = buildPrisma({ id: "task", status: "CANCELLED" }) as any;
    await serviceOf(db).update("tenant", "task", "actor", { status: "CANCELLED", title: "Yeni" } as any);
    const data = db.task.update.mock.calls[0][0].data;
    expect(data.title).toBe("Yeni");
    for (const key of ["status", "completedAt", "completedByUserId", "resolutionType"]) expect(data).not.toHaveProperty(key);
  });

  it.each([undefined, "", { not: "" }])("missing/operator actor is rejected before transaction (%p)", async actor => {
    const db = { $transaction: jest.fn() } as any;
    await expect(new TaskService(db).cancel("tenant", "task", actor as any, { reason: "Gerekçe" })).rejects.toMatchObject({ status: 403 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each(["   ", "x".repeat(2001), "a\u0000b"])("invalid reason is rejected before any write", async reason => {
    const db = { $transaction: jest.fn() } as any;
    await expect(new TaskService(db).cancel("tenant", "task", "actor", { reason })).rejects.toMatchObject({ status: 400 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("missing audit dependency fails closed before transaction", async () => {
    const db = { $transaction: jest.fn() } as any;
    await expect(new TaskService(db).cancel("tenant", "task", "actor", { reason: "Gerekçe" })).rejects.toMatchObject({ status: 503 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

/**
 * F03-B2 (OFP-02; owner kararı K2-a) — dosya süzgeci ve görevin dosyaya bağlanma kapsamı (saf; sahte Prisma).
 * Gerçek HTTP + PostgreSQL karşılığı: task-case-bound.http.db-gated.integration.spec.ts.
 */
describe("TaskService — F03-B2 dosya süzgeci ve dosyaya bağlama kapsamı", () => {
  const FLAG = "OFFICE_CASE_VIEW_SCOPE_ENABLED";
  const original = process.env[FLAG];
  const INVALID_CASE = "Geçersiz dosya: aynı ofise ait bir dosya değil.";
  afterEach(() => {
    if (original === undefined) delete process.env[FLAG];
    else process.env[FLAG] = original;
  });

  const buildListPrisma = () => ({
    task: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
  });
  const buildWritePrisma = (existing: any = { id: "tk", status: "PENDING", caseId: null }, caseFound = true) =>
    withTx({
      task: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn().mockResolvedValue({ id: "tk-new" }),
        update: jest.fn().mockResolvedValue({ id: "tk" }),
      },
      case: { findFirst: jest.fn().mockResolvedValue(caseFound ? { id: "c1" } : null) },
    });
  const scopeOf = (visible: string[] | null) => ({ visibleCaseIds: jest.fn().mockResolvedValue(visible === null ? null : new Set(visible)) });

  it("findAll: caseId kapsam katmanına girer — data, total ve summary aynı dosyada", async () => {
    delete process.env[FLAG];
    const prisma = buildListPrisma() as any;
    await serviceOf(prisma).findAll("t1", { caseId: "c1", status: "PENDING" });
    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: "t1", caseId: "c1", status: "PENDING" });
    expect(prisma.task.count.mock.calls[0][0].where).toEqual(where);
    const summaryWhere = prisma.task.groupBy.mock.calls[0][0].where;
    expect(summaryWhere).toMatchObject({ tenantId: "t1", caseId: "c1" });
    expect(summaryWhere).not.toHaveProperty("status");
    // Kiracı sınırı korunur: dosya süzgeci `case.tenantId` koşulunun yerine geçmez.
    expect(summaryWhere.OR).toEqual([{ caseId: null }, { case: { tenantId: "t1" } }]);
  });

  it("findAll: caseId verilmezse dosya süzgeci eklenmez (bugünkü liste)", async () => {
    delete process.env[FLAG];
    const prisma = buildListPrisma() as any;
    await serviceOf(prisma).findAll("t1", {});
    expect(prisma.task.findMany.mock.calls[0][0].where).not.toHaveProperty("caseId");
  });

  it("create: bayrak kapalı → dosya kapsamı sorgulanmaz, yalnız kiracı sınırı", async () => {
    delete process.env[FLAG];
    const prisma = buildWritePrisma() as any;
    const scope = scopeOf([]);
    await serviceOf(prisma, scope).create("t1", "u1", { title: "G", caseId: "c1" } as any);
    expect(scope.visibleCaseIds).not.toHaveBeenCalled();
    expect(prisma.task.create.mock.calls[0][0].data).toMatchObject({ tenantId: "t1", createdById: "u1", caseId: "c1" });
  });

  it("create: bayrak açık + aktörün görmediği dosya → var olmayan dosyayla AYNI 400; satır yazılmaz", async () => {
    process.env[FLAG] = "true";
    const hidden = buildWritePrisma() as any;
    const scope = scopeOf([]);
    await expect(serviceOf(hidden, scope).create("t1", "u1", { title: "G", caseId: "c1" } as any)).rejects.toMatchObject({
      status: 400,
      message: INVALID_CASE,
    });
    expect(scope.visibleCaseIds).toHaveBeenCalledWith("t1", "u1", ["c1"]);
    expect(hidden.task.create).not.toHaveBeenCalled();

    const missing = buildWritePrisma(undefined, false) as any;
    await expect(serviceOf(missing, scopeOf(["c1"])).create("t1", "u1", { title: "G", caseId: "c1" } as any)).rejects.toMatchObject({
      status: 400,
      message: INVALID_CASE,
    });
    expect(missing.task.create).not.toHaveBeenCalled();
  });

  it("create: bayrak açık + görünen dosya ya da büro geneli dosya izni (null) → yazılır", async () => {
    process.env[FLAG] = "true";
    for (const visible of [["c1"], null] as Array<string[] | null>) {
      const prisma = buildWritePrisma() as any;
      await serviceOf(prisma, scopeOf(visible)).create("t1", "u1", { title: "G", caseId: "c1" } as any);
      expect(prisma.task.create).toHaveBeenCalledTimes(1);
    }
  });

  it("create: bayrak açık + kapsam servisi yok → FAIL-CLOSED 403; dosyasız görev etkilenmez", async () => {
    process.env[FLAG] = "true";
    const prisma = buildWritePrisma() as any;
    await expect(serviceOf(prisma).create("t1", "u1", { title: "G", caseId: "c1" } as any)).rejects.toMatchObject({
      status: 403,
      response: { code: "CASE_VIEW_SCOPE_UNRESOLVED" },
    });
    expect(prisma.task.create).not.toHaveBeenCalled();
    await serviceOf(prisma).create("t1", "u1", { title: "Dosyasız" } as any);
    expect(prisma.task.create).toHaveBeenCalledTimes(1);
  });

  it("update: dosya bağı DEĞİŞMİYORSA kapsam sorgulanmaz; değişiyor ve görünmüyorsa 400; kaldırma (null) kapsam istemez", async () => {
    process.env[FLAG] = "true";
    const same = buildWritePrisma({ id: "tk", status: "PENDING", caseId: "c1" }) as any;
    const sameScope = scopeOf([]);
    await serviceOf(same, sameScope).update("t1", "tk", "u1", { title: "Yeni", caseId: "c1" } as any);
    expect(sameScope.visibleCaseIds).not.toHaveBeenCalled();
    expect(same.task.update).toHaveBeenCalledTimes(1);

    const changed = buildWritePrisma({ id: "tk", status: "PENDING", caseId: null }) as any;
    await expect(serviceOf(changed, scopeOf([])).update("t1", "tk", "u1", { caseId: "c1" } as any)).rejects.toMatchObject({
      status: 400,
      message: INVALID_CASE,
    });
    expect(changed.task.update).not.toHaveBeenCalled();

    const unlink = buildWritePrisma({ id: "tk", status: "PENDING", caseId: "c1" }) as any;
    const unlinkScope = scopeOf([]);
    await serviceOf(unlink, unlinkScope).update("t1", "tk", "u1", { caseId: null } as any);
    expect(unlinkScope.visibleCaseIds).not.toHaveBeenCalled();
    expect(unlink.task.update.mock.calls[0][0].data.caseId).toBeNull();
  });
});

/**
 * F03-A2 (OFP-03a / OFF-INV-08) — görev geçmişi yazımı: görev + geçmiş satırı + denetim kaydı TEK işlemde (saf; sahte Prisma).
 * Gerçek HTTP + PostgreSQL (atomiklik dahil) karşılığı: task-history.http.db-gated.integration.spec.ts.
 */
describe("TaskService — F03-A2 görev geçmişi yazımı", () => {
  const build = (existing: any = { id: "tk", status: "PENDING", priority: "MEDIUM", assigneeId: null, dueDate: null, caseId: null, createdById: "u-creator" }, actor: { role: string } | null = { role: "USER" }) =>
    withTx(
      {
        task: {
          findFirst: jest.fn().mockResolvedValue(existing),
          create: jest.fn(async ({ data }: any) => ({ id: "tk-new", status: "PENDING", priority: "MEDIUM", assigneeId: null, dueDate: null, caseId: null, ...data })),
          update: jest.fn(async ({ data }: any) => ({ ...existing, ...data })),
        },
        user: { findFirst: jest.fn().mockResolvedValue({ id: "u-assignee" }) },
      },
      actor,
    );

  it("create: görev, CREATED geçmiş satırı ve denetim kaydı aynı işlem istemcisiyle yazılır; korelasyon ortaktır", async () => {
    const prisma = build() as any;
    const audit = auditMock();
    await serviceOf(prisma, undefined, audit).create("t1", "u-creator", { title: "İş", priority: "HIGH" } as any);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const rows = prisma.$tx.taskHistoryEvent.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenantId: "t1", taskId: "tk-new", eventType: "CREATED", actorType: "USER", actorUserId: "u-creator", actorRole: "USER", authoritySource: "CREATOR" });
    expect(audit.logInTransaction).toHaveBeenCalledTimes(1);
    const [client, entry] = audit.logInTransaction.mock.calls[0];
    expect(client).toBe(prisma.$tx);
    expect(entry).toMatchObject({ tenantId: "t1", userId: "u-creator", action: "TASK_CREATED", entityType: "TASK", entityId: "tk-new", correlationId: rows[0].correlationId });
  });

  it("update: yalnız değişen izlenen alanlar satır olur; yetki kaynağı aktörün görevle ilişkisidir", async () => {
    const prisma = build() as any;
    const audit = auditMock();
    await serviceOf(prisma, undefined, audit).update("t1", "tk", "u-creator", { status: "IN_PROGRESS", priority: "MEDIUM", title: "Yeni başlık" } as any);

    const rows = prisma.$tx.taskHistoryEvent.createMany.mock.calls[0][0].data;
    expect(rows.map((r: any) => [r.eventType, r.fromValue, r.toValue, r.authoritySource])).toEqual([["STATUS_CHANGED", "PENDING", "IN_PROGRESS", "CREATOR"]]);
    expect(audit.logInTransaction.mock.calls[0][1]).toMatchObject({ action: "TASK_UPDATED", entityId: "tk", correlationId: rows[0].correlationId });
  });

  it("update: izlenen alan değişmediyse geçmiş satırı da denetim kaydı da yazılmaz (görev yine güncellenir)", async () => {
    const prisma = build() as any;
    const audit = auditMock();
    await serviceOf(prisma, undefined, audit).update("t1", "tk", "u-x", { title: "Yalnız başlık", status: "PENDING" } as any);

    expect(prisma.task.update).toHaveBeenCalledTimes(1);
    expect(prisma.$tx.taskHistoryEvent.createMany).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it("denetim servisi yoksa yazım hiç başlamaz (503): işlem açılmaz, görev yazılmaz", async () => {
    const prisma = build() as any;
    await expect(new TaskService(prisma).create("t1", "u1", { title: "İş" } as any)).rejects.toMatchObject({ status: 503 });
    await expect(new TaskService(prisma).update("t1", "tk", "u1", { status: "IN_PROGRESS" } as any)).rejects.toMatchObject({ status: 503 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("aktör aktif büro kullanıcısı değilse (işlem içi okuma boş) 403: görev de geçmiş de yazılmaz", async () => {
    const prisma = build(undefined, null) as any;
    await expect(serviceOf(prisma).create("t1", "u-yok", { title: "İş" } as any)).rejects.toMatchObject({ status: 403 });
    await expect(serviceOf(prisma).update("t1", "tk", "u-yok", { status: "IN_PROGRESS" } as any)).rejects.toMatchObject({ status: 403 });
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(prisma.task.update).not.toHaveBeenCalled();
    expect(prisma.$tx.taskHistoryEvent.createMany).not.toHaveBeenCalled();
  });

  it("geçmiş yazımı düşerse hata yutulmaz: çağrı reddedilir ve denetim kaydı yazılmaz (işlem geri alınır)", async () => {
    const prisma = build() as any;
    prisma.$tx.taskHistoryEvent.createMany.mockRejectedValue(new Error("geçmiş yazılamadı (sentetik)"));
    const audit = auditMock();
    await expect(serviceOf(prisma, undefined, audit).update("t1", "tk", "u-creator", { status: "IN_PROGRESS" } as any)).rejects.toThrow("geçmiş yazılamadı (sentetik)");
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });
});
