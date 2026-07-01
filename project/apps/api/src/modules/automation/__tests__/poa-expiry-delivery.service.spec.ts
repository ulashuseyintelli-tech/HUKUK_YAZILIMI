import { AutomationService } from "../automation.service";
import { PoaExpiryDeliveryService } from "../poa-expiry-delivery.service";

const NOW = new Date("2026-06-27T09:00:00.000Z");
const EXPIRY = new Date("2026-07-20T00:00:00.000Z");

function p2002() {
  return Object.assign(new Error("unique violation"), { code: "P2002" });
}

function lawyer(overrides: any = {}) {
  return {
    id: overrides.id || "law-1",
    tenantId: overrides.tenantId || "t1",
    name: overrides.name || "Ada",
    surname: overrides.surname || "Lovelace",
    email: overrides.email ?? "ada@law.test",
    isActive: overrides.isActive ?? true,
    userId: overrides.userId ?? null,
    user: overrides.user,
  };
}

function poa(overrides: any = {}) {
  return {
    id: overrides.id || "poa-1",
    validUntil: overrides.validUntil || EXPIRY,
    client: overrides.client || { id: "client-1", tenantId: "t1", displayName: "Client A" },
    lawyers: overrides.lawyers || [],
  };
}

function link(lawyerRow: any, overrides: any = {}) {
  return {
    id: overrides.id || `link-${lawyerRow.id}`,
    isPrimary: overrides.isPrimary ?? false,
    createdAt: overrides.createdAt || new Date("2026-01-01T00:00:00.000Z"),
    lawyer: lawyerRow,
  };
}

function build(overrides: any = {}) {
  const delivery = {
    create: jest.fn(async ({ data }) => ({ id: "delivery-1", ...data })),
    findUnique: jest.fn(),
    updateMany: jest.fn(async () => ({ count: 0 })),
    update: jest.fn(async ({ data }) => ({ id: "delivery-1", ...data })),
    groupBy: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  };
  const prisma: any = {
    clientPowerOfAttorney: { findMany: jest.fn().mockResolvedValue(overrides.poas || []) },
    office: { findUnique: jest.fn().mockResolvedValue(overrides.office || { escalationManagerLawyerIds: [] }) },
    lawyer: { findMany: jest.fn().mockResolvedValue(overrides.managers || []) },
    user: { findMany: jest.fn().mockResolvedValue(overrides.admins || []) },
    notificationQueue: { create: jest.fn() },
    poaExpiryNotificationDelivery: delivery,
  };
  prisma.$transaction = jest.fn((fn: any) => fn({ poaExpiryNotificationDelivery: delivery }));
  const notifier: any = { sendEmail: jest.fn().mockResolvedValue(overrides.dispatch || "SENT") };
  const service = new PoaExpiryDeliveryService(prisma, notifier);
  return { service, prisma, notifier, delivery };
}

describe("PoaExpiryDeliveryService", () => {
  it("primary attorney varsa yalniz onu recipient yapar ve dedupe expiry tarihini kullanir", async () => {
    const primary = lawyer({ id: "law-primary", email: " PRIMARY@LAW.TEST ", userId: "user-primary" });
    const secondary = lawyer({ id: "law-secondary", email: "secondary@law.test" });
    const { service, notifier, delivery } = build({
      poas: [poa({ lawyers: [link(secondary), link(primary, { isPrimary: true })] })],
    });

    const result = await service.sendExpiringPoaNotifications(NOW);

    expect(result.sent).toBe(1);
    expect(notifier.sendEmail).toHaveBeenCalledTimes(1);
    expect(notifier.sendEmail.mock.calls[0][1]).toBe("primary@law.test");
    const data = delivery.create.mock.calls[0][0].data;
    expect(data.recipientSource).toBe("PRIMARY_ATTORNEY");
    expect(data.recipientUserId).toBe("user-primary");
    expect(data.dedupeKey).toContain("2026-07-20");
    expect(data.dedupeKey).not.toContain("2026-06-27");
  });

  it("primary yoksa aktif POA attorney'lerini tenant ve email guard ile kullanir", async () => {
    const a = lawyer({ id: "law-a", email: "a@law.test" });
    const b = lawyer({ id: "law-b", email: "b@law.test" });
    const cross = lawyer({ id: "law-x", tenantId: "t2", email: "x@law.test" });
    const inactive = lawyer({ id: "law-i", email: "i@law.test", isActive: false });
    const { service, notifier, delivery } = build({
      poas: [poa({ lawyers: [link(a), link(cross), link(inactive), link(b)] })],
    });

    await service.sendExpiringPoaNotifications(NOW);

    expect(notifier.sendEmail.mock.calls.map((c: any[]) => c[1])).toEqual(["a@law.test", "b@law.test"]);
    expect(delivery.create.mock.calls.map((c: any[]) => c[0].data.recipientSource)).toEqual([
      "POA_ATTORNEY",
      "POA_ATTORNEY",
    ]);
  });

  it("avukat yoksa ayni tenant escalation manager'a duser ve cross-tenant manager'i kullanmaz", async () => {
    const manager = lawyer({ id: "mgr-good", email: "mgr@law.test" });
    const cross = lawyer({ id: "mgr-cross", tenantId: "t2", email: "cross@law.test" });
    const { service, prisma, notifier } = build({
      poas: [poa()],
      office: { escalationManagerLawyerIds: ["mgr-cross", "mgr-good"] },
      managers: [cross, manager],
    });

    await service.sendExpiringPoaNotifications(NOW);

    expect(prisma.lawyer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: "t1", id: { in: ["mgr-cross", "mgr-good"] }, isActive: true }),
    }));
    expect(notifier.sendEmail).toHaveBeenCalledTimes(1);
    expect(notifier.sendEmail.mock.calls[0][1]).toBe("mgr@law.test");
  });

  it("manager yoksa ayni tenant aktif admin fallback kullanir", async () => {
    const { service, prisma, notifier, delivery } = build({
      poas: [poa()],
      admins: [{ id: "admin-1", tenantId: "t1", email: "admin@law.test", name: "Admin", surname: "A", isActive: true }],
    });

    await service.sendExpiringPoaNotifications(NOW);

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "t1", role: "ADMIN", isActive: true, email: { not: "" } },
    }));
    expect(notifier.sendEmail.mock.calls[0][1]).toBe("admin@law.test");
    expect(delivery.create.mock.calls[0][0].data.recipientSource).toBe("ADMIN_FALLBACK");
  });

  it("SENT dedupe kaydi varsa ikinci cron mail gondermez", async () => {
    const { service, notifier, delivery } = build({ poas: [poa({ lawyers: [link(lawyer())] })] });
    delivery.create.mockRejectedValueOnce(p2002());
    delivery.findUnique.mockResolvedValueOnce({ id: "d-sent", status: "SENT", attempts: 1 });

    const result = await service.sendExpiringPoaNotifications(NOW);

    expect(result.skipped).toBe(1);
    expect(notifier.sendEmail).not.toHaveBeenCalled();
    expect(delivery.updateMany).not.toHaveBeenCalled();
  });

  it("P2002 + fresh PENDING race durumunda mail tekrari yapmaz", async () => {
    const { service, notifier, delivery } = build({ poas: [poa({ lawyers: [link(lawyer())] })] });
    delivery.create.mockRejectedValueOnce(p2002());
    delivery.findUnique.mockResolvedValueOnce({ id: "d-pending", status: "PENDING", attempts: 1, reservedAt: NOW });

    await service.sendExpiringPoaNotifications(NOW);

    expect(notifier.sendEmail).not.toHaveBeenCalled();
    expect(delivery.updateMany).not.toHaveBeenCalled();
  });

  it("stale PENDING atomik claim ile retry edilir", async () => {
    const stale = new Date("2026-06-27T08:00:00.000Z");
    const { service, notifier, delivery } = build({ poas: [poa({ lawyers: [link(lawyer())] })] });
    delivery.create.mockRejectedValueOnce(p2002());
    delivery.findUnique
      .mockResolvedValueOnce({ id: "d-stale", dedupeKey: "k", status: "PENDING", attempts: 1, reservedAt: stale })
      .mockResolvedValueOnce({ id: "d-stale", dedupeKey: "k", status: "PENDING", attempts: 2, reservedAt: NOW });
    delivery.updateMany.mockResolvedValueOnce({ count: 1 });

    await service.sendExpiringPoaNotifications(NOW);

    expect(delivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "PENDING", attempts: { lt: 3 } }),
      data: expect.objectContaining({ attempts: { increment: 1 }, reservedAt: NOW }),
    }));
    expect(notifier.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("FAILED retry zamani geldiyse yeniden denenir", async () => {
    const { service, notifier, delivery } = build({ poas: [poa({ lawyers: [link(lawyer())] })] });
    delivery.create.mockRejectedValueOnce(p2002());
    delivery.findUnique
      .mockResolvedValueOnce({ id: "d-failed", dedupeKey: "k", status: "FAILED", attempts: 1, nextRetryAt: new Date("2026-06-27T08:00:00.000Z") })
      .mockResolvedValueOnce({ id: "d-failed", dedupeKey: "k", status: "PENDING", attempts: 2 });
    delivery.updateMany.mockResolvedValueOnce({ count: 1 });

    await service.sendExpiringPoaNotifications(NOW);

    expect(delivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "FAILED", attempts: { lt: 3 } }),
      data: expect.objectContaining({ status: "PENDING", attempts: { increment: 1 } }),
    }));
    expect(notifier.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("max attempts asildiysa tekrar denenmez", async () => {
    const { service, notifier, delivery } = build({ poas: [poa({ lawyers: [link(lawyer())] })] });
    delivery.create.mockRejectedValueOnce(p2002());
    delivery.findUnique.mockResolvedValueOnce({ id: "d-max", status: "FAILED", attempts: 3, nextRetryAt: new Date("2026-06-27T08:00:00.000Z") });

    await service.sendExpiringPoaNotifications(NOW);

    expect(notifier.sendEmail).not.toHaveBeenCalled();
    expect(delivery.updateMany).not.toHaveBeenCalled();
  });

  it("TenantNotifier FAILED donerse ayni row FAILED olur ve lastError kisa kalir", async () => {
    const { service, delivery } = build({ poas: [poa({ lawyers: [link(lawyer())] })], dispatch: "FAILED" });

    await service.sendExpiringPoaNotifications(NOW);

    expect(delivery.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "delivery-1" },
      data: expect.objectContaining({ status: "FAILED", lastError: expect.any(String) }),
    }));
    expect(delivery.update.mock.calls[0][0].data.lastError.length).toBeLessThanOrEqual(500);
  });
});

describe("AutomationService POA queue bypass", () => {
  const originalFlag = process.env.POA_EXPIRY_NOTIFICATION_ENABLED;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.POA_EXPIRY_NOTIFICATION_ENABLED;
    else process.env.POA_EXPIRY_NOTIFICATION_ENABLED = originalFlag;
  });

  it("sendExpiringPoaNotifications NotificationQueue yazmaz, PoaExpiryDeliveryService'e delege eder (flag ON)", async () => {
    process.env.POA_EXPIRY_NOTIFICATION_ENABLED = "true";
    const prisma: any = { notificationQueue: { create: jest.fn() } };
    const poaDelivery: any = {
      sendExpiringPoaNotifications: jest.fn().mockResolvedValue({ scanned: 1, recipients: 1, sent: 1, failed: 0, skipped: 0 }),
    };
    const service = new AutomationService(prisma, {} as any, poaDelivery);

    await service.sendExpiringPoaNotifications();

    expect(poaDelivery.sendExpiringPoaNotifications).toHaveBeenCalledTimes(1);
    expect(prisma.notificationQueue.create).not.toHaveBeenCalled();
  });
});