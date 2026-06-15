/**
 * PR-3b Escalation Engine — servis orkestrasyon testleri (mock prisma + officeService).
 * Doğrular: (1) guard ÖNCE kalıcı yapılır (lastNotifiedLevel), (2) SMTP yoksa skip,
 * (3) SMTP varsa STAFF e-postası gider (nodemailer mock).
 */

jest.mock("nodemailer", () => ({
  createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({ messageId: "x" }) }),
}));

import {
  OperationalEscalationService,
  clientDisplayName,
  humanizeMissingFields,
  formatTrDateTime,
  formatRemaining,
  priorityTr,
  taskDeepLink,
  nextEscalationLine,
} from "../operational-escalation.service";
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
        clientId: "cl1",
        client: { displayName: "ŞÜKRÜ AKDOĞAN", firstName: null, lastName: null, companyName: null },
        missingFields: ["phone", "email"],
        dueDate: addDays(D0, 3),
        priority: "MEDIUM",
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

describe("Eskalasyon şablon yardımcıları (PR-3b.1)", () => {
  it("clientDisplayName: displayName → ad+soyad → kurum → fallback", () => {
    expect(clientDisplayName({ displayName: "ŞÜKRÜ AKDOĞAN" })).toBe("ŞÜKRÜ AKDOĞAN");
    expect(clientDisplayName({ firstName: "Ali", lastName: "Veli" })).toBe("Ali Veli");
    expect(clientDisplayName({ companyName: "X A.Ş." })).toBe("X A.Ş.");
    expect(clientDisplayName(null)).toBe("Bilinmeyen Müvekkil");
  });

  it("humanizeMissingFields: kod → Türkçe etiket (missingFields öncelikli, description fallback)", () => {
    expect(humanizeMissingFields(["phone", "email"])).toEqual(["Telefon", "E-posta"]);
    expect(humanizeMissingFields(null, "Eksik: phone, email")).toEqual(["Telefon", "E-posta"]);
    expect(humanizeMissingFields(["iban"])).toEqual(["IBAN"]);
    expect(humanizeMissingFields([])).toEqual(["Eksik bilgi"]);
  });

  it("formatTrDateTime: gg.aa.yyyy ss:dd", () => {
    expect(formatTrDateTime(new Date(2026, 5, 15, 14, 7))).toBe("15.06.2026 14:07");
    expect(formatTrDateTime(null)).toBe("Belirtilmemiş");
  });

  it("formatRemaining: gün/saat ve süre geçti", () => {
    const now = new Date(2026, 5, 15, 14, 0);
    expect(formatRemaining(new Date(2026, 5, 18, 8, 0), now)).toBe("2 gün 18 saat");
    expect(formatRemaining(new Date(2026, 5, 15, 19, 0), now)).toBe("5 saat");
    expect(formatRemaining(new Date(2026, 5, 14, 14, 0), now)).toBe("SÜRESİ GEÇTİ");
  });

  it("priorityTr: enum → Türkçe", () => {
    expect(priorityTr("MEDIUM")).toBe("Orta");
    expect(priorityTr("URGENT")).toBe("Acil");
    expect(priorityTr(undefined)).toBe("Orta");
  });

  it("taskDeepLink: FRONTEND_URL default 3002, clientId yoksa boş", () => {
    delete process.env.FRONTEND_URL;
    expect(taskDeepLink("cl1")).toBe("http://localhost:3002/settings/clients?edit=cl1");
    expect(taskDeepLink(null)).toBe("");
  });

  it("nextEscalationLine: STAFF kademesi yöneticiye işaret eder", () => {
    expect(nextEscalationLine("STAFF" as any, new Date(2026, 5, 18, 14, 7))).toContain("yönetici avukatlara");
    expect(nextEscalationLine("MANAGER" as any, new Date(2026, 5, 18, 14, 7))).toContain("kurucu/ortak");
  });
});
