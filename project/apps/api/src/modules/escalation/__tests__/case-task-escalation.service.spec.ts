/**
 * D-G3b — CaseTaskEscalationService orkestrasyon testleri (mock prisma + mock TenantNotifier).
 * Doğrular: lazy-adopt RESPONSIBLE, owner'a (assignee) bildirim, SKIPPED/SENT/FAILED → retry-guard,
 * TEAM_LEAD-skip (hasTeamLead=false → MANAGER), audit yazımı (TIER_ADVANCED + NOTIFICATION_*),
 * disjoint hedef sorgu (LEGAL_WORKFLOW + caseId + assignee), flag (CASE_TASK_ESCALATION_ENABLED).
 */

import { CaseTaskEscalationService } from "../case-task-escalation.service";
import { addDays } from "../escalation-logic";

const D0 = new Date(2026, 5, 1, 9, 0, 0);

const office = (over: any = {}) => ({
  caseTaskOwnerDays: 2,
  caseTaskTeamLeadDays: 2,
  caseTaskManagerDays: 3,
  opRepeatMonths: 3,
  escalationTeamLeadLawyerIds: [],
  escalationManagerLawyerIds: [],
  escalationFounderLawyerIds: [],
  opEmailEnabled: true,
  opSmsEnabled: true,
  ...over,
});

const task = (over: any = {}) => ({
  id: "tk1",
  title: "Tebligat İade - Ali",
  caseId: "c1",
  case: { id: "c1", fileNumber: "2026/1" },
  assigneeId: "u1",
  assignee: { id: "u1", name: "Ayşe", surname: "Kaya", email: "ayse@buro.com" },
  createdAt: D0,
  dueDate: addDays(D0, 5),
  priority: "HIGH",
  caseEscalationLevel: null,
  caseLastNotifiedLevel: null,
  caseNextFollowUpAt: null,
  ...over,
});

const buildPrisma = (officeOver: any = {}, taskOver: any = {}) => ({
  tenant: { findMany: jest.fn().mockResolvedValue([{ id: "t1", office: office(officeOver) }]) },
  task: {
    findMany: jest.fn().mockResolvedValue([task(taskOver)]),
    update: jest.fn().mockResolvedValue({}),
  },
  lawyer: { findMany: jest.fn().mockResolvedValue([{ name: "Av", surname: "Yönetici", email: "mgr@buro.com" }]) },
  caseTaskEscalationEvent: { create: jest.fn().mockResolvedValue({}) },
});

const buildNotifier = (email: "SENT" | "FAILED" | "SKIPPED" = "SENT") => ({
  sendEmail: jest.fn().mockResolvedValue(email),
  sendSms: jest.fn().mockResolvedValue("SENT"),
});

const eventOfType = (prisma: any, type: string) =>
  prisma.caseTaskEscalationEvent.create.mock.calls.map((c: any) => c[0].data).find((d: any) => d.eventType === type);

describe("CaseTaskEscalationService.processCaseTaskEscalations", () => {
  afterEach(() => {
    delete process.env.CASE_TASK_ESCALATION_ENABLED;
  });

  it("lazy-adopt: caseEscalationLevel=null → RESPONSIBLE owner'a (assignee) bildirilir; SENT → guard ilerler", async () => {
    const prisma = buildPrisma() as any;
    const notifier = buildNotifier("SENT") as any;
    const svc = new CaseTaskEscalationService(prisma, notifier);

    const res = await svc.processCaseTaskEscalations(D0);

    // Owner-first: assignee e-postasına gitti
    expect(notifier.sendEmail).toHaveBeenCalledTimes(1);
    expect(notifier.sendEmail.mock.calls[0][1]).toBe("ayse@buro.com");
    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data.caseEscalationLevel).toBe("RESPONSIBLE");
    expect(data.caseLastNotifiedLevel).toBe("RESPONSIBLE"); // SENT → guard ilerledi
    expect(data.caseNextFollowUpAt).toEqual(addDays(D0, 2));
    expect(res).toEqual({ processed: 1, notified: 1, skipped: 0, failed: 0 });
    // Audit: lazy-adopt'ta TIER_ADVANCED yok (prevLevel=null), NOTIFICATION_SENT var
    expect(eventOfType(prisma, "TIER_ADVANCED")).toBeUndefined();
    expect(eventOfType(prisma, "NOTIFICATION_SENT")).toMatchObject({ toLevel: "RESPONSIBLE", deliveryStatus: "SENT", caseId: "c1", taskId: "tk1" });
  });

  it("assignee e-postası yok → SKIPPED, guard İLERLEMEZ (baseline null)", async () => {
    const prisma = buildPrisma({}, { assignee: { id: "u1", name: "Ayşe", surname: "Kaya", email: null } }) as any;
    const notifier = buildNotifier() as any;
    const svc = new CaseTaskEscalationService(prisma, notifier);

    const res = await svc.processCaseTaskEscalations(D0);

    expect(notifier.sendEmail).not.toHaveBeenCalled(); // alıcı yok
    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data.caseEscalationLevel).toBe("RESPONSIBLE"); // zaman çizelgesi kalıcı
    expect(data.caseLastNotifiedLevel).toBeNull(); // SKIPPED → guard ilerlemez
    expect(res).toEqual({ processed: 1, notified: 0, skipped: 1, failed: 0 });
    expect(eventOfType(prisma, "NOTIFICATION_SKIPPED")).toMatchObject({ toLevel: "RESPONSIBLE", deliveryStatus: "SKIPPED" });
  });

  it("gönderim FAILED → guard baseline (null) KALIR + failed=1, tier kalıcı", async () => {
    const prisma = buildPrisma() as any;
    const notifier = buildNotifier("FAILED") as any;
    const svc = new CaseTaskEscalationService(prisma, notifier);

    const res = await svc.processCaseTaskEscalations(D0);

    expect(res).toEqual({ processed: 1, notified: 0, skipped: 0, failed: 1 });
    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data.caseLastNotifiedLevel).toBeNull(); // FAILED → retry
    expect(data.caseEscalationLevel).toBe("RESPONSIBLE");
    expect(eventOfType(prisma, "NOTIFICATION_FAILED")).toMatchObject({ toLevel: "RESPONSIBLE", deliveryStatus: "FAILED" });
  });

  it("K-D2: RESPONSIBLE süresi doldu + hasTeamLead=false → TEAM_LEAD atlanır, MANAGER'a; TIER_ADVANCED yazılır", async () => {
    const now = addDays(D0, 2);
    const prisma = buildPrisma(
      { escalationTeamLeadLawyerIds: [] }, // hasTeamLead=false
      { caseEscalationLevel: "RESPONSIBLE", caseLastNotifiedLevel: "RESPONSIBLE", caseNextFollowUpAt: now }
    ) as any;
    const notifier = buildNotifier("SENT") as any;
    const svc = new CaseTaskEscalationService(prisma, notifier);

    await svc.processCaseTaskEscalations(now);

    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data.caseEscalationLevel).toBe("MANAGER"); // TEAM_LEAD atlandı
    expect(prisma.lawyer.findMany).toHaveBeenCalled(); // MANAGER alıcısı çözüldü
    expect(notifier.sendEmail.mock.calls[0][1]).toBe("mgr@buro.com");
    expect(eventOfType(prisma, "TIER_ADVANCED")).toMatchObject({ fromLevel: "RESPONSIBLE", toLevel: "MANAGER" });
  });

  it("hedef sorgu DİSJOİNT: LEGAL_WORKFLOW + caseId≠null + assigneeId≠null + PENDING/IN_PROGRESS", async () => {
    const prisma = buildPrisma() as any;
    const svc = new CaseTaskEscalationService(prisma, buildNotifier() as any);

    await svc.processCaseTaskEscalations(D0);

    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.taskCategory).toBe("LEGAL_WORKFLOW");
    expect(where.caseId).toEqual({ not: null });
    expect(where.assigneeId).toEqual({ not: null });
    expect(where.status).toEqual({ in: ["PENDING", "IN_PROGRESS"] });
  });
});

describe("CaseTaskEscalationService.scheduledRun (flag)", () => {
  afterEach(() => {
    delete process.env.CASE_TASK_ESCALATION_ENABLED;
  });

  it("flag KAPALI (varsayılan) → hiçbir şey yapmaz (tenant sorgusu yok)", async () => {
    const prisma = buildPrisma() as any;
    const svc = new CaseTaskEscalationService(prisma, buildNotifier() as any);

    await svc.scheduledRun();

    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
  });

  it("flag AÇIK → işler (tenant sorgusu yapılır)", async () => {
    process.env.CASE_TASK_ESCALATION_ENABLED = "true";
    const prisma = buildPrisma() as any;
    const svc = new CaseTaskEscalationService(prisma, buildNotifier() as any);

    await svc.scheduledRun();

    expect(prisma.tenant.findMany).toHaveBeenCalled();
  });
});
