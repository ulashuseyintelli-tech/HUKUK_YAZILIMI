import { ClientNotificationService } from "./client-notification.service";

/**
 * Bildirim Kontrol Merkezi overview — birim testi (PR-N2).
 * Doğrular: tenant-scope her sorguda; YALNIZ gerçek kaynaklar (ClientNotification + EscalationEvent);
 * simüle NotificationQueue'ya ASLA dokunulmaz; sır sızmaz; hata gruplaması; POA = "teslimat eksik".
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
          // 1. çağrı = son gönderimler
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
          // 2. çağrı = başarısızlar (neden gitmedi)
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
      // TUZAK: simüle e-tebligat kuyruğu overview'a ASLA karışmamalı
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

  it("gerçek ClientNotification + EscalationEvent sayaçlarını üretir ve tenant-scope uygular", async () => {
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
    for (const call of prisma.clientNotification.findMany.mock.calls) {
      expect(call[0].where).toEqual(expect.objectContaining({ tenantId }));
    }
  });

  it("simüle NotificationQueue'ya ASLA dokunmaz (yalnız dürüst kaynak)", async () => {
    const { service, prisma } = buildService();
    await service.getNotificationOverview(tenantId);
    expect(prisma.notificationQueue.groupBy).not.toHaveBeenCalled();
    expect(prisma.notificationQueue.findMany).not.toHaveBeenCalled();
    expect(prisma.notificationQueue.count).not.toHaveBeenCalled();
  });

  it("sır sızdırmaz; kanal hazır-mı bilgisini doğru verir", async () => {
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

  it("başarısızları sebebe göre gruplar (neden gitmedi?)", async () => {
    const { service } = buildService();
    const out = await service.getNotificationOverview(tenantId);

    const smtp = out.failureGroups.find((f) => f.reason === "SMTP auth failed");
    expect(smtp?.count).toBe(2);
    expect(smtp?.lastSeenAt).toBe(new Date("2026-06-26T08:00:00.000Z").toISOString());
    expect(out.failureGroups.find((f) => f.reason === "Telefon yok")?.count).toBe(1);
  });

  it("POA motorunu 'teslimat eksik' (ATTENTION), tebriği ACTIVE işaretler", async () => {
    const { service } = buildService();
    const out = await service.getNotificationOverview(tenantId);

    expect(out.engines.poa.status).toBe("ATTENTION");
    expect(out.engines.poa.reason).toBe("DELIVERY_NOT_WIRED");
    expect(out.engines.greeting.status).toBe("ACTIVE");
    expect(out.engines.escalation.status).toBe("ACTIVE");
    expect(out.stats.activeEngines).toBe(2);
    expect(out.stats.attentionEngines).toBe(1);
  });

  it("son gönderimlerde alıcı görünen adı çözer", async () => {
    const { service } = buildService();
    const out = await service.getNotificationOverview(tenantId);
    expect(out.recentDeliveries).toHaveLength(1);
    expect(out.recentDeliveries[0].recipientName).toBe("Ada Lovelace");
    expect(out.recentDeliveries[0].status).toBe("SENT");
  });
});
