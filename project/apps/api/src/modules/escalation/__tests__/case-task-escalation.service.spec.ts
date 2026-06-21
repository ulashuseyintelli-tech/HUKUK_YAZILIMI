/**
 * CaseTaskEscalationService orkestrasyon testleri (mock prisma + mock TenantNotifier).
 * G4b: RESPONSIBLE alıcısı = case'in GERÇEK KİŞİ owner'ı (responsibleLawyer → responsibleStaff →
 * legacy sorumluPersonel fallback), task.assignee (doer) DEĞİL. `assigneeId` filtresi KALDIRILDI
 * (atanmamış geç görev de owner'a eskale olur). State-machine / audit / flag DEĞİŞMEDİ.
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

// G4b: case'in owner alanları RESPONSIBLE alıcısını belirler (lawyer→staff→legacy).
const caseWith = (over: any = {}) => ({
  id: "c1",
  fileNumber: "2026/1",
  responsibleLawyer: null,
  responsibleStaff: null,
  sorumluPersonel: null,
  ...over,
});

const task = (over: any = {}) => ({
  id: "tk1",
  title: "Tebligat İade - Ali",
  caseId: "c1",
  // Varsayılan: gerçek kişi owner = responsibleLawyer (lawyer@buro.com).
  case: caseWith({ responsibleLawyer: { name: "Av. Ulaş", surname: "Telli", email: "lawyer@buro.com" } }),
  // assignee = DOER (işi yapan); eskalasyon alıcısı DEĞİL.
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

describe("CaseTaskEscalationService — RESPONSIBLE owner-rebind (G4b)", () => {
  afterEach(() => {
    delete process.env.CASE_TASK_ESCALATION_ENABLED;
  });

  it("(1+4) real lawyer owner → RESPONSIBLE maili lawyer.email'e gider, assignee'ye DEĞİL", async () => {
    const prisma = buildPrisma() as any; // varsayılan = responsibleLawyer
    const notifier = buildNotifier("SENT") as any;
    const svc = new CaseTaskEscalationService(prisma, notifier);

    const res = await svc.processCaseTaskEscalations(D0);

    expect(notifier.sendEmail).toHaveBeenCalledTimes(1);
    expect(notifier.sendEmail.mock.calls[0][1]).toBe("lawyer@buro.com"); // owner
    expect(notifier.sendEmail.mock.calls[0][1]).not.toBe("ayse@buro.com"); // assignee (doer) DEĞİL
    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data.caseEscalationLevel).toBe("RESPONSIBLE");
    expect(data.caseLastNotifiedLevel).toBe("RESPONSIBLE");
    expect(res).toEqual({ processed: 1, notified: 1, skipped: 0, failed: 0 });
    expect(eventOfType(prisma, "NOTIFICATION_SENT")).toMatchObject({ toLevel: "RESPONSIBLE", deliveryStatus: "SENT", caseId: "c1", taskId: "tk1" });
  });

  it("(2) real staff owner (lawyer yok) → RESPONSIBLE maili staff.email'e", async () => {
    const prisma = buildPrisma({}, { case: caseWith({ responsibleStaff: { firstName: "Büşra", lastName: "Atmaca", email: "staff@buro.com" } }) }) as any;
    const notifier = buildNotifier("SENT") as any;
    const svc = new CaseTaskEscalationService(prisma, notifier);

    await svc.processCaseTaskEscalations(D0);

    expect(notifier.sendEmail.mock.calls[0][1]).toBe("staff@buro.com");
  });

  it("(3) gerçek owner yok ama legacy sorumluPersonel VAR → mail legacy User.email'e (fallback)", async () => {
    const prisma = buildPrisma({}, { case: caseWith({ sorumluPersonel: { name: "Admin", surname: "Kullanıcı", email: "legacy@buro.com" } }) }) as any;
    const notifier = buildNotifier("SENT") as any;
    const svc = new CaseTaskEscalationService(prisma, notifier);

    await svc.processCaseTaskEscalations(D0);

    expect(notifier.sendEmail.mock.calls[0][1]).toBe("legacy@buro.com");
  });

  it("öncelik: lawyer hem staff hem legacy varken lawyer.email kazanır", async () => {
    const prisma = buildPrisma({}, {
      case: caseWith({
        responsibleLawyer: { name: "A", surname: "B", email: "lawyer@buro.com" },
        responsibleStaff: { firstName: "C", lastName: "D", email: "staff@buro.com" },
        sorumluPersonel: { name: "E", surname: "F", email: "legacy@buro.com" },
      }),
    }) as any;
    const notifier = buildNotifier("SENT") as any;
    const svc = new CaseTaskEscalationService(prisma, notifier);
    await svc.processCaseTaskEscalations(D0);
    expect(notifier.sendEmail.mock.calls[0][1]).toBe("lawyer@buro.com");
  });

  it("(6) owner YOK (lawyer/staff/legacy hiçbiri) → SKIPPED, guard ilerlemez (fail-safe)", async () => {
    const prisma = buildPrisma({}, { case: caseWith() }) as any; // hiç owner yok
    const notifier = buildNotifier() as any;
    const svc = new CaseTaskEscalationService(prisma, notifier);

    const res = await svc.processCaseTaskEscalations(D0);

    expect(notifier.sendEmail).not.toHaveBeenCalled();
    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data.caseEscalationLevel).toBe("RESPONSIBLE"); // zaman çizelgesi kalıcı
    expect(data.caseLastNotifiedLevel).toBeNull(); // SKIPPED → guard ilerlemez
    expect(res).toEqual({ processed: 1, notified: 0, skipped: 1, failed: 0 });
    expect(eventOfType(prisma, "NOTIFICATION_SKIPPED")).toMatchObject({ toLevel: "RESPONSIBLE", deliveryStatus: "SKIPPED" });
  });

  it("(5) assigneeId=null görev SORGUYA GİRER + owner'a eskale olur (assignee filtresi yok)", async () => {
    const prisma = buildPrisma({}, { assigneeId: null, assignee: null }) as any; // G4a sonrası atanmamış
    const notifier = buildNotifier("SENT") as any;
    const svc = new CaseTaskEscalationService(prisma, notifier);

    const res = await svc.processCaseTaskEscalations(D0);

    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.assigneeId).toBeUndefined(); // filtre yok
    expect(notifier.sendEmail.mock.calls[0][1]).toBe("lawyer@buro.com"); // atanmamış olsa bile owner'a
    expect(res.processed).toBe(1);
  });

  it("gönderim FAILED → guard baseline (null) KALIR + failed=1, tier kalıcı", async () => {
    const prisma = buildPrisma() as any;
    const notifier = buildNotifier("FAILED") as any;
    const svc = new CaseTaskEscalationService(prisma, notifier);

    const res = await svc.processCaseTaskEscalations(D0);

    expect(res).toEqual({ processed: 1, notified: 0, skipped: 0, failed: 1 });
    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data.caseLastNotifiedLevel).toBeNull();
    expect(data.caseEscalationLevel).toBe("RESPONSIBLE");
    expect(eventOfType(prisma, "NOTIFICATION_FAILED")).toMatchObject({ toLevel: "RESPONSIBLE", deliveryStatus: "FAILED" });
  });

  it("K-D2: RESPONSIBLE süresi doldu + hasTeamLead=false → MANAGER'a; TIER_ADVANCED", async () => {
    const now = addDays(D0, 2);
    const prisma = buildPrisma(
      { escalationTeamLeadLawyerIds: [] },
      { caseEscalationLevel: "RESPONSIBLE", caseLastNotifiedLevel: "RESPONSIBLE", caseNextFollowUpAt: now }
    ) as any;
    const notifier = buildNotifier("SENT") as any;
    const svc = new CaseTaskEscalationService(prisma, notifier);

    await svc.processCaseTaskEscalations(now);

    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data.caseEscalationLevel).toBe("MANAGER");
    expect(prisma.lawyer.findMany).toHaveBeenCalled();
    expect(notifier.sendEmail.mock.calls[0][1]).toBe("mgr@buro.com");
    expect(eventOfType(prisma, "TIER_ADVANCED")).toMatchObject({ fromLevel: "RESPONSIBLE", toLevel: "MANAGER" });
  });

  it("hedef sorgu DİSJOİNT: LEGAL_WORKFLOW + caseId≠null + PENDING/IN_PROGRESS (assigneeId filtresi YOK)", async () => {
    const prisma = buildPrisma() as any;
    const svc = new CaseTaskEscalationService(prisma, buildNotifier() as any);

    await svc.processCaseTaskEscalations(D0);

    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.taskCategory).toBe("LEGAL_WORKFLOW");
    expect(where.caseId).toEqual({ not: null });
    expect(where.assigneeId).toBeUndefined(); // G4b: assigneeId artık filtrelenmez
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
