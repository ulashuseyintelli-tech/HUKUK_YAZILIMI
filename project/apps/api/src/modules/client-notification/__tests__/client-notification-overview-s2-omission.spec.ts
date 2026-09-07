import { ClientNotificationService } from "../client-notification.service";

/**
 * F-B01-03 / OFF-P2-CAP-07 regresyonu — Bildirim Kontrol Merkezi overview'i S2 alanlarindan
 * TURETILEN bilgi de dahil hicbir S2 verisini HTTP okuma yuzeyine cikarmaz.
 *
 * Politika: ADM01 S2 icin "exact field-level permission" ister; OD-07 "missing policy fails closed";
 * tasiyici (OFF-P2-CAP-07) henuz yoktur. ADMIN rol kapisi alan izni + purpose yerine GECMEZ.
 * Servis getter'i S2 listelerini ic tuketici icin dondurmeye DEVAM eder; kisit HTTP yuzeyindedir.
 */
describe("getNotificationOverview — S2 turevi sizinti yok", () => {
  const tenantId = "t1";
  const MANAGER_IDS = ["mgr-1", "mgr-2", "mgr-3"];
  const FOUNDER_IDS = ["fnd-1", "fnd-2"];

  function buildService() {
    const empty = { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) };
    const prisma: any = {
      clientNotification: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
      escalationEvent: { groupBy: jest.fn().mockResolvedValue([]) },
      poaExpiryNotificationDelivery: { ...empty, findFirst: jest.fn().mockResolvedValue(null) },
      notificationQueue: { groupBy: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    };
    const officeService: any = {
      getSmtpSettings: jest.fn().mockResolvedValue({ smtpHost: "smtp.x", smtpUser: "u" }),
      getSmsSettings: jest.fn().mockResolvedValue({ smsProvider: null }),
      getGreetingSettings: jest.fn().mockResolvedValue({ autoGreetingEnabled: false, autoGreetingTime: null }),
      getEscalationSettings: jest.fn().mockResolvedValue({
        opReminderDays: 3,
        opFounderDays: 6,
        opEmailEnabled: true,
        opSmsEnabled: false,
        escalationManagerLawyerIds: MANAGER_IDS,
        escalationFounderLawyerIds: FOUNDER_IDS,
        escalationTeamLeadLawyerIds: ["tl-1"],
      }),
    };
    return { service: new ClientNotificationService(prisma, officeService), officeService };
  }

  it("escalation kartinda S2 turevi alici SAYACI bulunmaz", async () => {
    const { service } = buildService();
    const out: any = await service.getNotificationOverview(tenantId);
    expect(out.engines.escalation).toBeDefined();
    expect(out.engines.escalation).not.toHaveProperty("assignees");
    // operasyonel alanlar korunur
    expect(out.engines.escalation.reminderDays).toBe(3);
    expect(out.engines.escalation.founderDays).toBe(6);
    expect(out.engines.escalation.channels).toEqual(["EMAIL"]);
  });

  it("yanitin TAMAMINDA S2 referanslari yayimlanmaz ve assignees anahtari hicbir yerde bulunmaz", async () => {
    const { service } = buildService();
    const out: any = await service.getNotificationOverview(tenantId);
    const json = JSON.stringify(out);
    // (a) S2 referans KIMLIKLERI yayimlanmaz
    for (const id of [...MANAGER_IDS, ...FOUNDER_IDS, "tl-1"]) {
      expect(json).not.toContain(id);
    }
    // (b) `assignees` ANAHTARI hicbir yuzeyde bulunmaz.
    //     NOT: yanitta 5 (veya baska bir sayi) gecmesi TEK BASINA ihlal DEGILDIR — mesru sayaclar
    //     (son 24s gonderim/basarisiz, POA durumlari) ayni degeri tasiyabilir. Ihlal olcutu ANAHTARIN
    //     varligidir, deger degil.
    expect(json).not.toContain('"assignees"');
  });

  it("servis getter'i S2 listelerini ic tuketici icin dondurmeye devam eder (kisit HTTP yuzeyinde)", async () => {
    const { service, officeService } = buildService();
    await service.getNotificationOverview(tenantId);
    expect(officeService.getEscalationSettings).toHaveBeenCalledWith(tenantId);
    const raw = await officeService.getEscalationSettings(tenantId);
    expect(raw.escalationManagerLawyerIds).toEqual(MANAGER_IDS);
    expect(raw.escalationFounderLawyerIds).toEqual(FOUNDER_IDS);
  });
});
