/**
 * PR-3b Escalation Engine — servis orkestrasyon testleri (mock prisma + officeService).
 * Doğrular: (1) guard ÖNCE kalıcı yapılır (lastNotifiedLevel), (2) SMTP yoksa skip,
 * (3) SMTP varsa STAFF e-postası gider (nodemailer mock).
 */

jest.mock("nodemailer", () => ({
  createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({ messageId: "x" }) }),
}));

import { OperationalEscalationService } from "../operational-escalation.service";
import { addDays } from "../escalation-logic";

const D0 = new Date(2026, 5, 1, 9, 0, 0);

const buildPrisma = () => ({
  tenant: {
    findMany: jest.fn().mockResolvedValue([
      {
        id: "t1",
        office: {
          opReminderDays: 3,
          opFounderDays: 6,
          opRepeatMonths: 3,
          opStaffTypes: ["MUHASEBE"],
          opEmailEnabled: true,
          opSmsEnabled: true,
          escalationManagerLawyerIds: [],
          escalationFounderLawyerIds: [],
        },
      },
    ]),
  },
  task: {
    findMany: jest.fn().mockResolvedValue([
      {
        id: "tk1",
        title: "Müvekkil iletişim bilgilerini tamamla",
        description: "Eksik: phone, email",
        createdAt: D0,
        escalationLevel: "STAFF",
        lastNotifiedLevel: null,
        nextFollowUpAt: addDays(D0, 3),
      },
    ]),
    update: jest.fn().mockResolvedValue({}),
  },
  staffMember: { findMany: jest.fn().mockResolvedValue([{ firstName: "Muhasebe", lastName: "Personeli", email: "muhasebe@buro.com" }]) },
  lawyer: { findMany: jest.fn().mockResolvedValue([]) },
});

describe("OperationalEscalationService.processEscalations", () => {
  it("SMTP yoksa: guard yine de set edilir (STAFF), gönderim SKIPPED", async () => {
    const prisma = buildPrisma() as any;
    const officeService = {
      getFullSmtpSettings: jest.fn().mockResolvedValue({ smtpHost: null, smtpUser: null }),
      getFullSmsSettings: jest.fn().mockResolvedValue({ smsProvider: null }),
    } as any;
    const svc = new OperationalEscalationService(prisma, officeService);

    const res = await svc.processEscalations(D0); // now=D0 → süre dolmadı (next=D0+3)

    // Guard ÖNCE kalıcı: lastNotifiedLevel=STAFF (tekrar gönderimi engeller)
    expect(prisma.task.update).toHaveBeenCalledTimes(1);
    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data.escalationLevel).toBe("STAFF");
    expect(data.lastNotifiedLevel).toBe("STAFF");
    // SMTP yok → e-posta gitmedi
    expect(res).toEqual({ processed: 1, notified: 0, skipped: 1 });
  });

  it("SMTP varsa: STAFF e-postası muhasebe personeline gider, notified", async () => {
    const prisma = buildPrisma() as any;
    const officeService = {
      getFullSmtpSettings: jest.fn().mockResolvedValue({ smtpHost: "smtp.x.com", smtpUser: "u@x.com", smtpPass: "p" }),
      getFullSmsSettings: jest.fn().mockResolvedValue({ smsProvider: null }),
    } as any;
    const svc = new OperationalEscalationService(prisma, officeService);

    const res = await svc.processEscalations(D0);

    expect(prisma.staffMember.findMany).toHaveBeenCalled(); // STAFF alıcı çözüldü
    expect(res).toEqual({ processed: 1, notified: 1, skipped: 0 });
  });
});
