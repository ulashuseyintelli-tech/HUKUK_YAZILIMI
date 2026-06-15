/**
 * PR-3b/3b.2 Escalation Engine — servis orkestrasyon testleri (mock prisma + officeService).
 * Doğrular: (1) SKIPPED → guard ilerlemez (baseline kalır), (2) SENT → guard ilerler,
 * (3) FAILED (SMTP exception) → guard baseline kalır + failed=1, tier/next yine kalıcı.
 */

jest.mock("nodemailer", () => {
  const sendMail = jest.fn().mockResolvedValue({ messageId: "x" });
  return { __sendMail: sendMail, createTransport: () => ({ sendMail }) };
});

import * as nodemailer from "nodemailer";
const mockSendMail = (nodemailer as any).__sendMail as jest.Mock;

import {
  OperationalEscalationService,
  clientDisplayName,
  humanizeMissingFields,
  formatTrDateTime,
  formatRemaining,
  priorityTr,
  taskDeepLink,
  debtorDeepLink,
  escalationEntity,
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
  escalationEvent: { create: jest.fn().mockResolvedValue({}) }, // K2 append-only iz
});

// K2: belirli eventType ile yazılan EscalationEvent çağrısının data'sını döndürür (yoksa undefined).
const eventOfType = (prisma: any, type: string) =>
  prisma.escalationEvent.create.mock.calls.map((c: any) => c[0].data).find((d: any) => d.eventType === type);

describe("OperationalEscalationService.processEscalations", () => {
  beforeEach(() => {
    mockSendMail.mockReset();
    mockSendMail.mockResolvedValue({ messageId: "x" }); // varsayılan: başarılı
  });

  it("SMTP yoksa: SKIPPED → guard İLERLEMEZ (baseline null kalır), tier kalıcı, retry mümkün", async () => {
    const prisma = buildPrisma() as any;
    const officeService = {
      getFullSmtpSettings: jest.fn().mockResolvedValue({ smtpHost: null, smtpUser: null }),
      getFullSmsSettings: jest.fn().mockResolvedValue({ smsProvider: null }),
    } as any;
    const svc = new OperationalEscalationService(prisma, officeService);

    const res = await svc.processEscalations(D0); // now=D0 → süre dolmadı (next=D0+3)

    expect(prisma.task.update).toHaveBeenCalledTimes(1);
    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data.escalationLevel).toBe("STAFF"); // zaman çizelgesi kalıcı
    expect(data.lastNotifiedLevel).toBeNull(); // PR-3b.2: SKIPPED → guard ilerlemez (baseline)
    expect(res).toEqual({ processed: 1, notified: 0, skipped: 1, failed: 0 });
    // K2: tier ilerlemedi → TIER_ADVANCED yok; SKIPPED bildirim izi var.
    expect(eventOfType(prisma, "TIER_ADVANCED")).toBeUndefined();
    expect(eventOfType(prisma, "NOTIFICATION_SKIPPED")).toMatchObject({ toLevel: "STAFF", deliveryStatus: "SKIPPED" });
  });

  it("SMTP varsa: SENT → guard İLERLER (STAFF), e-posta personele gider, notified", async () => {
    const prisma = buildPrisma() as any;
    const officeService = {
      getFullSmtpSettings: jest.fn().mockResolvedValue({ smtpHost: "smtp.x.com", smtpUser: "u@x.com", smtpPass: "p" }),
      getFullSmsSettings: jest.fn().mockResolvedValue({ smsProvider: null }),
    } as any;
    const svc = new OperationalEscalationService(prisma, officeService);

    const res = await svc.processEscalations(D0);

    expect(prisma.staffMember.findMany).toHaveBeenCalled(); // STAFF alıcı çözüldü
    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data.lastNotifiedLevel).toBe("STAFF"); // başarı → guard ilerledi
    expect(res).toEqual({ processed: 1, notified: 1, skipped: 0, failed: 0 });
    // K2: NOTIFICATION_SENT izi — kanal EMAIL, 1 alıcı, metadata dolu.
    const ev = eventOfType(prisma, "NOTIFICATION_SENT");
    expect(ev).toMatchObject({ toLevel: "STAFF", channel: "EMAIL", deliveryStatus: "SENT" });
    expect(ev.metadata).toMatchObject({ channels: ["EMAIL"], emailRecipients: 1, smsRecipients: 0, notifyTier: "STAFF" });
  });

  it("SMTP exception: FAILED → guard baseline (null) KALIR + failed=1, tier/next yine güncellenir", async () => {
    mockSendMail.mockRejectedValue(new Error("smtp down")); // gönderim patlar
    const prisma = buildPrisma() as any;
    const officeService = {
      getFullSmtpSettings: jest.fn().mockResolvedValue({ smtpHost: "smtp.x.com", smtpUser: "u@x.com", smtpPass: "p" }),
      getFullSmsSettings: jest.fn().mockResolvedValue({ smsProvider: null }),
    } as any;
    const svc = new OperationalEscalationService(prisma, officeService);

    const res = await svc.processEscalations(D0);

    expect(res).toEqual({ processed: 1, notified: 0, skipped: 0, failed: 1 });
    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data.lastNotifiedLevel).toBeNull(); // PR-3b.2: FAILED → guard ilerlemez → retry
    expect(data.escalationLevel).toBe("STAFF"); // tier kalıcı
    expect(data.nextFollowUpAt).toBeDefined(); // zaman çizelgesi yazıldı
    // K2: NOTIFICATION_FAILED izi (kanal denendi, teslim olmadı).
    expect(eventOfType(prisma, "NOTIFICATION_FAILED")).toMatchObject({ toLevel: "STAFF", channel: "EMAIL", deliveryStatus: "FAILED" });
  });

  it("K2: tier ilerlemesi (STAFF→MANAGER, due) → TIER_ADVANCED + NOTIFICATION event yazılır", async () => {
    const prisma = buildPrisma() as any;
    const officeService = {
      getFullSmtpSettings: jest.fn().mockResolvedValue({ smtpHost: null, smtpUser: null }),
      getFullSmsSettings: jest.fn().mockResolvedValue({ smsProvider: null }),
    } as any;
    const svc = new OperationalEscalationService(prisma, officeService);

    await svc.processEscalations(addDays(D0, 3)); // now=D0+3 → süre doldu → MANAGER'a ilerle

    const adv = eventOfType(prisma, "TIER_ADVANCED");
    expect(adv).toMatchObject({ fromLevel: "STAFF", toLevel: "MANAGER" });
    // MANAGER alıcısı yok (lawyer []) → bildirim SKIPPED ama yine de izlenir.
    expect(eventOfType(prisma, "NOTIFICATION_SKIPPED")).toMatchObject({ toLevel: "MANAGER" });
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

  // PR-D4b: muhatap çözümleme (müvekkil VEYA borçlu) — eskalasyon maili patlamasın.
  it("escalationEntity: clientId'li görev → Müvekkil + /settings/clients linki", () => {
    delete process.env.FRONTEND_URL;
    const e = escalationEntity({ clientId: "cl1", client: { displayName: "ŞÜKRÜ AKDOĞAN" }, debtorId: null });
    expect(e).toEqual({ label: "Müvekkil", name: "ŞÜKRÜ AKDOĞAN", link: "http://localhost:3002/settings/clients?edit=cl1" });
  });

  it("escalationEntity: debtorId'li (clientId yok) görev → Borçlu + /debtors linki", () => {
    delete process.env.FRONTEND_URL;
    const e = escalationEntity({ clientId: null, debtorId: "db1", debtor: { name: "Mehmet Borçlu" } });
    expect(e).toEqual({ label: "Borçlu", name: "Mehmet Borçlu", link: "http://localhost:3002/debtors?edit=db1" });
  });

  it("escalationEntity: borçlu adı yoksa fallback; debtorDeepLink boş id'de boş döner", () => {
    expect(escalationEntity({ clientId: null, debtorId: "db1", debtor: null }).name).toBe("Bilinmeyen Borçlu");
    expect(debtorDeepLink(null)).toBe("");
  });
});
