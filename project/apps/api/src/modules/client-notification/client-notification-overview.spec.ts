import { ClientNotificationService } from "./client-notification.service";

/**
 * Bildirim Kontrol Merkezi overview — birim testi (PR-N2/P2 POA delivery).
 * Dogrular: tenant-scope her sorguda; yalniz gercek kaynaklar; simule NotificationQueue yok;
 * POA karti yeni PoaExpiryNotificationDelivery logundan beslenir.
 */
describe("ClientNotificationService.getNotificationOverview", () => {
  const tenantId = "t1";

  function buildService(overrides?: { prisma?: any; office?: any }) {
    const prisma: any = {
      clientNotification: {
        groupBy: jest.fn().mockResolvedValue([
          { status: "SENT", _count: { _all: 5 } },
          { status: "FAILED", _count: { _all: 2 } },
          { status: "PENDING", _count: { _all: 1 } },
        ]),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: "n1",
              createdAt: new Date("2026-06-26T09:00:00.000Z"),
              channel: "EMAIL",
              type: "HATIRLATMA",
              status: "SENT",
              subject: "Konu",
              errorMessage: null,
              client: { displayName: "Ada Lovelace", firstName: null, lastName: null, companyName: null },
            },
          ])
          .mockResolvedValueOnce([
            { errorMessage: "SMTP auth failed", channel: "EMAIL", createdAt: new Date("2026-06-25T10:00:00.000Z") },
            { errorMessage: "SMTP auth failed", channel: "EMAIL", createdAt: new Date("2026-06-26T08:00:00.000Z") },
            { errorMessage: "Telefon yok", channel: "SMS", createdAt: new Date("2026-06-24T10:00:00.000Z") },
          ]),
      },
      escalationEvent: {
        groupBy: jest.fn().mockResolvedValue([
          { deliveryStatus: "SENT", _count: { _all: 3 } },
          { deliveryStatus: "FAILED", _count: { _all: 1 } },
        ]),
      },
      poaExpiryNotificationDelivery: {
        groupBy: jest.fn().mockResolvedValue([
          { status: "PENDING", _count: { _all: 1 } },
          { status: "SENT", _count: { _all: 2 } },
          { status: "FAILED", _count: { _all: 1 } },
        ]),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: "poa-delivery-1",
              createdAt: new Date("2026-06-24T09:00:00.000Z"),
              status: "SENT",
              recipientEmail: "lawyer@example.com",
              recipientSource: "PRIMARY_ATTORNEY",
              lastError: null,
              client: { displayName: "POA Client", firstName: null, lastName: null, companyName: null },
            },
          ])
          .mockResolvedValueOnce([
            { lastError: "SMTP POA failed", updatedAt: new Date("2026-06-26T07:00:00.000Z") },
          ]),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ sentAt: new Date("2026-06-24T09:00:00.000Z"), updatedAt: new Date("2026-06-24T09:00:00.000Z") })
          .mockResolvedValueOnce({ updatedAt: new Date("2026-06-26T07:00:00.000Z") }),
      },
      notificationQueue: { groupBy: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      ...overrides?.prisma,
    };

    const officeService: any = {
      getSmtpSettings: jest
        .fn()
        .mockResolvedValue({ smtpHost: "smtp.x", smtpUser: "u", smtpPass: "********", smtpFromEmail: "a@b.com" }),
      getSmsSettings: jest
        .fn()
        .mockResolvedValue({ smsProvider: "NETGSM", smsApiKey: "********", smsApiSecret: "********", smsSender: "BURO" }),
      getGreetingSettings: jest.fn().mockResolvedValue({ autoGreetingEnabled: true, autoGreetingTime: "09:00" }),
      getEscalationSettings: jest.fn().mockResolvedValue({
        opReminderDays: 3,
        opFounderDays: 6,
        opEmailEnabled: true,
        opSmsEnabled: true,
        escalationManagerLawyerIds: ["a", "b"],
        escalationFounderLawyerIds: ["c"],
      }),
      ...overrides?.office,
    };

    const service = new ClientNotificationService(prisma, officeService);
    return { service, prisma, officeService };
  }

  it("gercek ClientNotification + EscalationEvent sayaclarini uretir ve tenant-scope uygular", async () => {
    const { service, prisma } = buildService();
    const out = await service.getNotificationOverview(tenantId);

    expect(out.stats.last24hSent).toBe(5);
    expect(out.stats.last24hFailed).toBe(2);
    expect(out.stats.last24hPending).toBe(1);
    expect(out.stats.last24hEscalationSent).toBe(3);
    expect(out.stats.last24hEscalationFailed).toBe(1);

    expect(prisma.clientNotification.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId }) })
    );
    expect(prisma.escalationEvent.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId }) })
    );
    expect(prisma.poaExpiryNotificationDelivery.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId }) })
    );
    for (const call of prisma.clientNotification.findMany.mock.calls) {
      expect(call[0].where).toEqual(expect.objectContaining({ tenantId }));
    }
    for (const call of prisma.poaExpiryNotificationDelivery.findMany.mock.calls) {
      expect(call[0].where).toEqual(expect.objectContaining({ tenantId }));
    }
  });

  it("simule NotificationQueue'ya ASLA dokunmaz", async () => {
    const { service, prisma } = buildService();
    await service.getNotificationOverview(tenantId);
    expect(prisma.notificationQueue.groupBy).not.toHaveBeenCalled();
    expect(prisma.notificationQueue.findMany).not.toHaveBeenCalled();
    expect(prisma.notificationQueue.count).not.toHaveBeenCalled();
  });

  it("sir sizdirmaz; kanal hazir-mi bilgisini dogru verir", async () => {
    const { service } = buildService();
    const out = await service.getNotificationOverview(tenantId);
    const json = JSON.stringify(out);

    expect(json).not.toContain("********");
    expect(json.toLowerCase()).not.toContain("smtppass");
    expect(json.toLowerCase()).not.toContain("apisecret");

    expect(out.channels.email.configured).toBe(true);
    expect(out.channels.email.sender).toBe("a@b.com");
    expect(out.channels.sms.configured).toBe(true);
    expect(out.channels.sms.provider).toBe("NETGSM");
    expect(out.channels.sms.title).toBe("BURO");
  });

  it("basarisizlari sebebe gore gruplar", async () => {
    const { service } = buildService();
    const out = await service.getNotificationOverview(tenantId);

    expect(out.failureGroups.find((f) => f.reason === "SMTP auth failed")?.count).toBe(2);
    expect(out.failureGroups.find((f) => f.reason === "Telefon yok")?.count).toBe(1);
    expect(out.failureGroups.find((f) => f.reason === "SMTP POA failed")?.count).toBe(1);
  });

  it("POA motorunu yeni delivery logdan ACTIVE ve sayili besler", async () => {
    const { service } = buildService();
    const out = await service.getNotificationOverview(tenantId);

    expect(out.engines.poa.status).toBe("ACTIVE");
    expect(out.engines.poa.reason).toBe("DELIVERY_WIRED");
    expect(out.engines.poa.poaExpiry).toMatchObject({ pending: 1, sent: 2, failed: 1 });
    expect(out.engines.poa.poaExpiry.lastSentAt).toBe(new Date("2026-06-24T09:00:00.000Z").toISOString());
    expect(out.engines.poa.poaExpiry.lastFailureAt).toBe(new Date("2026-06-26T07:00:00.000Z").toISOString());
    expect(out.stats.activeEngines).toBe(3);
    expect(out.stats.attentionEngines).toBe(0);
  });

  it("son gonderimlerde client ve POA delivery satirlarini birlikte gosterir", async () => {
    const { service } = buildService();
    const out = await service.getNotificationOverview(tenantId);

    expect(out.recentDeliveries).toHaveLength(2);
    const clientDelivery = out.recentDeliveries.find((d) => d.id === "n1");
    const poaDelivery = out.recentDeliveries.find((d) => d.id === "poa-delivery-1");
    expect(clientDelivery?.recipientName).toBe("Ada Lovelace");
    expect(clientDelivery?.status).toBe("SENT");
    expect(poaDelivery).toMatchObject({ type: "POA_EXPIRY", channel: "EMAIL", status: "SENT" });
  });
});