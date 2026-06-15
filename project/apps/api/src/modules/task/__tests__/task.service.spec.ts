/**
 * PR-PERF-1 — Task kapanış atfı (completedByUserId + resolutionType).
 * Doğrular: (1) manuel COMPLETED → MANUAL + kapatan User, (2) yeniden açma → kapanış izi temizlenir,
 * (3) statü değişmeyen güncellemede kapanış alanlarına dokunulmaz.
 */

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
