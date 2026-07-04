import { NotFoundException } from "@nestjs/common";
import { DebtorCrossCaseNotificationTaskLinkService } from "../debtor-cross-case-notification-task-link.service";

// DBND-D6-TASK-LINK (owner-locked, bkz `docs/design/d6-legal-semantics-triage.md` Q6)
describe("DebtorCrossCaseNotificationTaskLinkService.createTaskForNotification", () => {
  let service: DebtorCrossCaseNotificationTaskLinkService;

  const mockPrisma = {
    debtorCrossCaseNotification: { findFirst: jest.fn() },
    task: { findUnique: jest.fn(), create: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DebtorCrossCaseNotificationTaskLinkService(mockPrisma as any);
  });

  it("throws NotFoundException when the notification does not belong to the tenant/recipient", async () => {
    mockPrisma.debtorCrossCaseNotification.findFirst.mockResolvedValue(null);

    await expect(
      service.createTaskForNotification("tenant-1", "notif-1", "user-1")
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.task.create).not.toHaveBeenCalled();
  });

  it("scopes the notification lookup to tenant + recipient (cannot create a task from someone else's notification)", async () => {
    mockPrisma.debtorCrossCaseNotification.findFirst.mockResolvedValue({
      id: "notif-1",
      debtorId: "debtor-1",
      changeSummary: "Paylaşılan borçlunun adresi güncellendi",
      severity: "CRITICAL",
    });
    mockPrisma.task.findUnique.mockResolvedValue(null);
    mockPrisma.task.create.mockResolvedValue({ id: "task-1" });

    await service.createTaskForNotification("tenant-1", "notif-1", "user-1");

    expect(mockPrisma.debtorCrossCaseNotification.findFirst).toHaveBeenCalledWith({
      where: { id: "notif-1", tenantId: "tenant-1", recipientUserId: "user-1" },
      select: { id: true, debtorId: true, changeSummary: true, severity: true },
    });
  });

  it("creates a new Task with dedupeKey, LEGAL_WORKFLOW category, no dueDate, and the recipient as assignee/creator", async () => {
    mockPrisma.debtorCrossCaseNotification.findFirst.mockResolvedValue({
      id: "notif-1",
      debtorId: "debtor-1",
      changeSummary: "Paylaşılan borçlunun adresi güncellendi",
      severity: "CRITICAL",
    });
    mockPrisma.task.findUnique.mockResolvedValue(null);
    mockPrisma.task.create.mockResolvedValue({ id: "task-1" });

    const result = await service.createTaskForNotification("tenant-1", "notif-1", "user-1");

    expect(mockPrisma.task.create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        debtorId: "debtor-1",
        title: "D6 bildirimi takibi: Paylaşılan borçlunun adresi güncellendi",
        taskCategory: "LEGAL_WORKFLOW",
        status: "PENDING",
        priority: "HIGH",
        assigneeId: "user-1",
        createdById: "user-1",
        dedupeKey: "D6-TASK-LINK:notif-1",
        dueDate: null,
      },
    });
    expect(result).toEqual({ id: "task-1" });
  });

  it("maps non-CRITICAL severity to MEDIUM priority", async () => {
    mockPrisma.debtorCrossCaseNotification.findFirst.mockResolvedValue({
      id: "notif-2",
      debtorId: "debtor-1",
      changeSummary: "Paylaşılan borçlunun adı/unvanı güncellendi",
      severity: "WARNING",
    });
    mockPrisma.task.findUnique.mockResolvedValue(null);
    mockPrisma.task.create.mockResolvedValue({ id: "task-2" });

    await service.createTaskForNotification("tenant-1", "notif-2", "user-1");

    const calledWith = mockPrisma.task.create.mock.calls[0][0];
    expect(calledWith.data.priority).toBe("MEDIUM");
  });

  it("is idempotent: returns the existing Task without creating a new one on a second call for the same notification", async () => {
    mockPrisma.debtorCrossCaseNotification.findFirst.mockResolvedValue({
      id: "notif-1",
      debtorId: "debtor-1",
      changeSummary: "x",
      severity: "CRITICAL",
    });
    mockPrisma.task.findUnique.mockResolvedValue({ id: "existing-task-1", dedupeKey: "D6-TASK-LINK:notif-1" });

    const result = await service.createTaskForNotification("tenant-1", "notif-1", "user-1");

    expect(mockPrisma.task.create).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "existing-task-1", dedupeKey: "D6-TASK-LINK:notif-1" });
  });

  it("recovers from a concurrent double-create (P2002 unique violation) by returning the task the other request created", async () => {
    mockPrisma.debtorCrossCaseNotification.findFirst.mockResolvedValue({
      id: "notif-1",
      debtorId: "debtor-1",
      changeSummary: "x",
      severity: "CRITICAL",
    });
    mockPrisma.task.findUnique
      .mockResolvedValueOnce(null) // ilk "zaten var mı" kontrolü
      .mockResolvedValueOnce({ id: "race-winner-task" }); // P2002 sonrası tekrar bak
    mockPrisma.task.create.mockRejectedValue({ code: "P2002" });

    const result = await service.createTaskForNotification("tenant-1", "notif-1", "user-1");

    expect(result).toEqual({ id: "race-winner-task" });
  });

  it("re-throws non-P2002 errors from Task creation", async () => {
    mockPrisma.debtorCrossCaseNotification.findFirst.mockResolvedValue({
      id: "notif-1",
      debtorId: "debtor-1",
      changeSummary: "x",
      severity: "CRITICAL",
    });
    mockPrisma.task.findUnique.mockResolvedValue(null);
    mockPrisma.task.create.mockRejectedValue(new Error("connection lost"));

    await expect(service.createTaskForNotification("tenant-1", "notif-1", "user-1")).rejects.toThrow(
      "connection lost"
    );
  });
});
