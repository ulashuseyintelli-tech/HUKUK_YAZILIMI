/**
 * PR-D4e-2 — Saha istihbaratı (LOCATION_VERIFICATION) görev tetikleri.
 * best-effort · mükerrer aktif görev açma · 90g VERIFIED_PRESENT skip · kapalı→reopen.
 * SONUÇ YAZMA YOK (D4e-3).
 */

import { DebtorService, intelligenceLocationDedupeKey } from "../debtor.service";

const buildPrisma = (over: { recent?: any; existingTask?: any } = {}) => ({
  debtorIntelligence: { findFirst: jest.fn().mockResolvedValue(over.recent ?? null) },
  task: {
    findUnique: jest.fn().mockResolvedValue(over.existingTask ?? null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  },
});

const callIntel = (svc: any, ...args: any[]) => (svc as any).syncIntelligenceTaskSafe(...args);

describe("DebtorService.syncIntelligenceTaskSafe (PR-D4e-2)", () => {
  it("dedupe anahtarı borçlu+adres anchored (caseId yok)", () => {
    expect(intelligenceLocationDedupeKey("d1", "a1")).toBe("INTEL:LOCATION:d1:a1");
    expect(intelligenceLocationDedupeKey("d1", null)).toBe("INTEL:LOCATION:d1:");
  });

  it("görev yok → DEBTOR_INTELLIGENCE/LOCATION görevi create (debtorId+addressId+dedupe)", async () => {
    const prisma = buildPrisma() as any;
    const svc = new DebtorService(prisma);

    await callIntel(svc, "t1", "d1", "a1");

    const data = prisma.task.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: "t1",
      debtorId: "d1",
      addressId: "a1",
      taskCategory: "OPERATIONAL_COMPLETENESS",
      taskSubType: "DEBTOR_INTELLIGENCE",
      dedupeKey: "INTEL:LOCATION:d1:a1",
      status: "PENDING",
      escalationLevel: "STAFF",
    });
  });

  it("aktif görev (PENDING) → mükerrer AÇMAZ (create/update yok)", async () => {
    const prisma = buildPrisma({ existingTask: { id: "tk", status: "PENDING" } }) as any;
    const svc = new DebtorService(prisma);

    await callIntel(svc, "t1", "d1", "a1");

    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("kapalı görev (COMPLETED) + yeni tetik → yeniden açar (PENDING+STAFF, kapanış izi temizlenir)", async () => {
    const prisma = buildPrisma({ existingTask: { id: "tk", status: "COMPLETED" } }) as any;
    const svc = new DebtorService(prisma);

    await callIntel(svc, "t1", "d1", "a1");

    expect(prisma.task.create).not.toHaveBeenCalled();
    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data.status).toBe("PENDING");
    expect(data.escalationLevel).toBe("STAFF");
    expect(data.completedAt).toBeNull();
    expect(data.resolutionType).toBeNull();
  });

  it("[B] checkRecentVerified + son 90g VERIFIED_PRESENT → görev AÇMAZ", async () => {
    const prisma = buildPrisma({ recent: { id: "intel1" } }) as any;
    const svc = new DebtorService(prisma);

    await callIntel(svc, "t1", "d1", "a1", true);

    expect(prisma.task.findUnique).not.toHaveBeenCalled(); // erken return
    expect(prisma.task.create).not.toHaveBeenCalled();
  });
});
