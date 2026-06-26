/**
 * Faz-B güvenlik (service seviyesi): GET /office secret maskeleme + ayar değişikliği audit.
 *
 * Kapatılan açıklar:
 *  1) GET /office HAM Office satırını döndürüp düz-metin smtpPass/smsApiKey/smsApiSecret
 *     sızdırıyordu → getPublicOffice secret'ları maskeler; internal getFull* HAM kalır.
 *  2) Ayar değişiklikleri AuditLog'a yazılmıyordu → update* artık audit.log çağırır.
 *     Secret'lar oldValues/newValues içinde maskeli (AuditLog ikinci sızıntı kanalı OLMASIN).
 */

import { OfficeService } from "../office.service";

const ROW = {
  id: "o1",
  tenantId: "t1",
  name: "Büro",
  smtpHost: "smtp.x",
  smtpUser: "u",
  smtpPass: "TOP-SECRET",
  smsProvider: "netgsm",
  smsApiKey: "KEY-123",
  smsApiSecret: "SECRET-XYZ",
  bankAccounts: [],
  lawyers: [],
};

function makeService(officeRow: any) {
  const prisma = {
    office: {
      findUnique: jest.fn().mockResolvedValue(officeRow),
      create: jest.fn().mockResolvedValue(officeRow),
      update: jest
        .fn()
        .mockImplementation(({ data }: any) => Promise.resolve({ ...officeRow, ...data })),
    },
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: "t1", name: "B" }) },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new OfficeService(prisma as any, audit as any);
  return { service, prisma, audit };
}

describe("OfficeService Faz-B security: GET maskeleme + audit", () => {
  it("getPublicOffice → secret alanlar maskeli, secret-olmayanlar aynen", async () => {
    const { service } = makeService(ROW);
    const out: any = await service.getPublicOffice("t1");
    expect(out.smtpPass).toBe("********");
    expect(out.smsApiKey).toBe("********");
    expect(out.smsApiSecret).toBe("********");
    expect(out.smtpHost).toBe("smtp.x"); // secret değil → aynen
    expect(out.name).toBe("Büro");
  });

  it("getPublicOffice → boş secret null kalır ('********' uydurmaz)", async () => {
    const { service } = makeService({ ...ROW, smtpPass: null, smsApiKey: "", smsApiSecret: null });
    const out: any = await service.getPublicOffice("t1");
    expect(out.smtpPass).toBeNull();
    expect(out.smsApiKey).toBeNull();
    expect(out.smsApiSecret).toBeNull();
  });

  it("getFullSmtpSettings (internal) → HAM smtpPass döner (gönderim için maskelenmez)", async () => {
    const { service } = makeService(ROW);
    const full = await service.getFullSmtpSettings("t1");
    expect(full.smtpPass).toBe("TOP-SECRET");
  });

  it("update() → audit.log OFFICE_SETTINGS + userId + sadece gönderilen alanın diff'i", async () => {
    const { service, audit } = makeService(ROW);
    await service.update("t1", { name: "Yeni Ad" }, "user-1");
    expect(audit.log).toHaveBeenCalledTimes(1);
    const arg = audit.log.mock.calls[0][0];
    expect(arg.entityType).toBe("OFFICE_SETTINGS");
    expect(arg.action).toBe("UPDATE");
    expect(arg.userId).toBe("user-1");
    expect(arg.entityId).toBe("o1");
    expect(arg.oldValues).toEqual({ name: "Büro" });
    expect(arg.newValues).toEqual({ name: "Yeni Ad" });
  });

  it("updateSmtpSettings() → audit'te smtpPass MASKELİ (düz-metin loglanmaz), secret-olmayan gerçek", async () => {
    const { service, audit } = makeService(ROW);
    await service.updateSmtpSettings("t1", { smtpPass: "BRAND-NEW-PASS", smtpHost: "smtp.y" }, "user-1");
    const arg = audit.log.mock.calls[0][0];
    expect(arg.oldValues.smtpPass).toBe("********");
    expect(arg.newValues.smtpPass).toBe("********");
    expect(arg.newValues.smtpPass).not.toBe("BRAND-NEW-PASS"); // düz-metin SIZMAZ
    expect(arg.newValues.smtpHost).toBe("smtp.y"); // secret değil → gerçek değer
    expect(arg.metadata.section).toBe("SMTP");
  });

  it("updateSmsSettings() → smsApiKey/smsApiSecret audit'te maskeli", async () => {
    const { service, audit } = makeService(ROW);
    await service.updateSmsSettings(
      "t1",
      { smsApiKey: "NEW-KEY", smsApiSecret: "NEW-SECRET", smsSender: "BARO" },
      "user-1"
    );
    const arg = audit.log.mock.calls[0][0];
    expect(arg.newValues.smsApiKey).toBe("********");
    expect(arg.newValues.smsApiSecret).toBe("********");
    expect(arg.newValues.smsSender).toBe("BARO");
    expect(arg.metadata.section).toBe("SMS");
  });

  it("update prisma.office.update'i ÇAĞIRIR ve güncel satırı döndürür (audit yan-etki, dönüş değeri değil)", async () => {
    const { service, prisma } = makeService(ROW);
    const out: any = await service.update("t1", { name: "Yeni Ad" }, "user-1");
    expect(prisma.office.update).toHaveBeenCalledTimes(1);
    expect(out.name).toBe("Yeni Ad"); // dönüş = güncellenmiş satır
  });
});
