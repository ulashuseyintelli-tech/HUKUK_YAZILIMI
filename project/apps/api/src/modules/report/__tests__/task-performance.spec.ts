/**
 * PR-K3 — Kategori bazlı görev performansı raporu (ham metrik).
 * Doğrular: (1) people YALNIZ MANUAL+completedByUserId, (2) AUTO_SYSTEM → system bloğu (kişiye değil),
 * (3) resolutionType=null → unattributed, (4) K1 köprüsü ile personType resolve, (5) avgCompletionHours.
 */

import { ReportService } from "../report.service";

const H = 3_600_000; // 1 saat (ms)
const base = new Date(2026, 5, 1, 9, 0, 0);
const plus = (h: number) => new Date(base.getTime() + h * H);

// user-A: 3 MANUAL (2 LEGAL + 1 OPERATIONAL), süreler 2h/4h/6h → avg 4.0
// user-B: 1 MANUAL LEGAL (USER_ONLY), süre 10h
// 1 AUTO_SYSTEM (LEGAL), 1 legacy (resolutionType=null)
const COMPLETED_TASKS = [
  { completedByUserId: "uA", resolutionType: "MANUAL", taskCategory: "LEGAL_WORKFLOW", createdAt: base, completedAt: plus(2) },
  { completedByUserId: "uA", resolutionType: "MANUAL", taskCategory: "LEGAL_WORKFLOW", createdAt: base, completedAt: plus(4) },
  { completedByUserId: "uA", resolutionType: "MANUAL", taskCategory: "OPERATIONAL_COMPLETENESS", createdAt: base, completedAt: plus(6) },
  { completedByUserId: "uB", resolutionType: "MANUAL", taskCategory: "LEGAL_WORKFLOW", createdAt: base, completedAt: plus(10) },
  { completedByUserId: null, resolutionType: "AUTO_SYSTEM", taskCategory: "LEGAL_WORKFLOW", createdAt: base, completedAt: plus(1) },
  { completedByUserId: null, resolutionType: null, taskCategory: "OPERATIONAL_COMPLETENESS", createdAt: base, completedAt: plus(1) },
];

const buildPrisma = () => ({
  task: { findMany: jest.fn().mockResolvedValue(COMPLETED_TASKS) },
  user: { findMany: jest.fn().mockResolvedValue([{ id: "uB", name: "Beta", surname: "User" }]) },
  // uA → StaffMember; uB → eşleşme yok (USER_ONLY)
  staffMember: { findMany: jest.fn().mockResolvedValue([{ userId: "uA", firstName: "Ayşe", lastName: "Muhasebe" }]) },
  lawyer: { findMany: jest.fn().mockResolvedValue([]) },
});

describe("ReportService.getTaskPerformanceReport", () => {
  it("MANUAL→people, AUTO_SYSTEM→system, null→unattributed; personType ve avg doğru", async () => {
    const prisma = buildPrisma() as any;
    const svc = new ReportService(prisma, {} as any);

    const res = await svc.getTaskPerformanceReport("t1", {});

    // people: uA (3) önce, uB (1) sonra (count'a göre sıralı)
    expect(res.people).toHaveLength(2);
    const a = res.people[0];
    expect(a).toMatchObject({
      personId: "uA",
      personType: "STAFF_MEMBER",
      displayName: "Ayşe Muhasebe",
      completedManualCount: 3,
      avgCompletionHours: 4, // (2+4+6)/3
    });
    expect(a.byCategory).toEqual({ LEGAL_WORKFLOW: 2, OPERATIONAL_COMPLETENESS: 1 });

    const b = res.people[1];
    expect(b).toMatchObject({ personId: "uB", personType: "USER_ONLY", displayName: "Beta User", completedManualCount: 1, avgCompletionHours: 10 });

    // AUTO_SYSTEM kişiye DEĞİL, system bloğunda
    expect(res.system).toEqual({ autoSystemCount: 1, byCategory: { LEGAL_WORKFLOW: 1, OPERATIONAL_COMPLETENESS: 0 } });
    // legacy null → unattributed
    expect(res.unattributed).toEqual({ count: 1 });
  });

  it("tarih + kategori filtreleri completedAt/taskCategory where'ine yansır", async () => {
    const prisma = buildPrisma() as any;
    const svc = new ReportService(prisma, {} as any);

    await svc.getTaskPerformanceReport("t1", { from: "2026-06-01", to: "2026-06-30", taskCategory: "OPERATIONAL_COMPLETENESS", resolutionType: "MANUAL" });

    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t1");
    expect(where.status).toBe("COMPLETED");
    expect(where.taskCategory).toBe("OPERATIONAL_COMPLETENESS");
    expect(where.resolutionType).toBe("MANUAL");
    expect(where.completedAt.gte).toBeInstanceOf(Date);
    expect(where.completedAt.lte).toBeInstanceOf(Date);
  });

  it("LAWYER eşleşmesi STAFF_MEMBER'dan önceliklidir", async () => {
    const prisma = buildPrisma() as any;
    prisma.lawyer.findMany = jest.fn().mockResolvedValue([{ userId: "uA", name: "Av. Cem", surname: "Ortak" }]);
    const svc = new ReportService(prisma, {} as any);

    const res = await svc.getTaskPerformanceReport("t1", {});
    expect(res.people[0]).toMatchObject({ personId: "uA", personType: "LAWYER", displayName: "Av. Cem Ortak" });
  });
});
