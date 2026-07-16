/**
 * PR-PERF-1 — Task kapanış atfı (completedByUserId + resolutionType).
 * Doğrular: (1) manuel COMPLETED → MANUAL + kapatan User, (2) yeniden açma → kapanış izi temizlenir,
 * (3) statü değişmeyen güncellemede kapanış alanlarına dokunulmaz.
 *
 * CANDIDATE-J1 (STF-PRD-BOLA-002 baseline) — Task assignee uygunluk kapısı.
 * Doğrular: dolu assignee için aynı-tenant + aktif kontrolü (kabul/ret), null assignee kabulü,
 * yalnız ileriye-dönük write-time enforcement (create + update).
 */

import { BadRequestException } from "@nestjs/common";
import { TaskService } from "../task.service";

const buildPrisma = (existing: any = { id: "tk", status: "PENDING" }) => ({
  task: {
    findFirst: jest.fn().mockResolvedValue(existing),
    update: jest.fn().mockResolvedValue({}),
  },
});

describe("TaskService.update — kapanış atfı", () => {
  it("status=COMPLETED → completedByUserId=userId + resolutionType=MANUAL + completedAt set", async () => {
    const prisma = buildPrisma() as any;
    const svc = new TaskService(prisma);

    await svc.update("t1", "tk", "user-9", { status: "COMPLETED" } as any);

    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data.resolutionType).toBe("MANUAL");
    expect(data.completedByUserId).toBe("user-9");
    expect(data.completedAt).toBeInstanceOf(Date);
  });

  it("COMPLETED→PENDING (yeniden açma) → kapanış izi temizlenir (null)", async () => {
    const prisma = buildPrisma({ id: "tk", status: "COMPLETED" }) as any;
    const svc = new TaskService(prisma);

    await svc.update("t1", "tk", "user-9", { status: "PENDING" } as any);

    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data.completedAt).toBeNull();
    expect(data.completedByUserId).toBeNull();
    expect(data.resolutionType).toBeNull();
  });

  it("status verilmeyen güncelleme (ör. başlık) → kapanış alanlarına DOKUNMAZ", async () => {
    const prisma = buildPrisma() as any;
    const svc = new TaskService(prisma);

    await svc.update("t1", "tk", "user-9", { title: "Yeni başlık" } as any);

    const data = prisma.task.update.mock.calls[0][0].data;
    expect("completedAt" in data).toBe(false);
    expect("completedByUserId" in data).toBe(false);
    expect("resolutionType" in data).toBe(false);
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

  const buildPrismaWithUsers = (existing: any = { id: "tk", status: "PENDING" }) => ({
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
    const svc = new TaskService(prisma);

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
    const svc = new TaskService(prisma);

    await expect(
      svc.create(TENANT, "creator-1", { title: "İş", assigneeId: "u-active-other" } as any)
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  // 3) aynı-tenant + pasif → RET
  it("create: aynı-tenant + pasif assignee → ret (BadRequest, task.create çağrılmaz)", async () => {
    const prisma = buildPrismaWithUsers() as any;
    const svc = new TaskService(prisma);

    await expect(
      svc.create(TENANT, "creator-1", { title: "İş", assigneeId: "u-inactive-same" } as any)
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  // 4) null/boş assignee → KABUL (uygunluk sorgusu hiç çalışmaz)
  it("create: assignee verilmeyen görev → kabul (user.findFirst çağrılmaz)", async () => {
    const prisma = buildPrismaWithUsers() as any;
    const svc = new TaskService(prisma);

    await svc.create(TENANT, "creator-1", { title: "Sahipsiz iş" } as any);

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.task.create).toHaveBeenCalledTimes(1);
  });

  // update yolu da aynı kapıdan geçer (ileriye-dönük enforcement create + update)
  it("update: aynı-tenant + aktif assignee → kabul (task.update çağrılır)", async () => {
    const prisma = buildPrismaWithUsers() as any;
    const svc = new TaskService(prisma);

    await svc.update(TENANT, "tk", "editor-1", { assigneeId: "u-active-same" } as any);

    expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.task.update).toHaveBeenCalledTimes(1);
  });

  it("update: cross-tenant assignee → ret (BadRequest, task.update çağrılmaz)", async () => {
    const prisma = buildPrismaWithUsers() as any;
    const svc = new TaskService(prisma);

    await expect(
      svc.update(TENANT, "tk", "editor-1", { assigneeId: "u-active-other" } as any)
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("update: assignee içermeyen güncelleme (ör. başlık) → uygunluk sorgusu çalışmaz", async () => {
    const prisma = buildPrismaWithUsers() as any;
    const svc = new TaskService(prisma);

    await svc.update(TENANT, "tk", "editor-1", { title: "Yeni başlık" } as any);

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.task.update).toHaveBeenCalledTimes(1);
  });
});
