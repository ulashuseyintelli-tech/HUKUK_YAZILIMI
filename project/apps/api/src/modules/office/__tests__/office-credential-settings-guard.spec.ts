/**
 * Ofis kimlik bilgisi (SMTP/SMS) GÜNCELLEME hard guard + Faz-B güvenlik (controller seviyesi).
 *
 * WP-4c-hotfix-1: PUT /office/smtp-settings + /office/sms-settings yalnız role==='ADMIN'.
 * Faz-B güvenlik eklemeleri:
 *   - GET /office artık secret-maskeli getPublicOffice çağırır (ham getOrCreate DEĞİL).
 *   - Tüm update uçları AuditLog için userId'yi servise threader.
 *
 * NOT: updateSmtpSettings P2b-1 ile async (guidedOpenObserve hook) → yetkisiz testi
 * `rejects` ile beklenir; controller guidedOpenObserve mock'u ile kurulur (eski spec
 * tek-arg constructor + senkron toThrow ile bu async dönüşümden sonra KIRILMIŞTI; düzeltildi).
 */

import { ForbiddenException } from "@nestjs/common";
import { OfficeController } from "../office.controller";

const SMTP = { smtpHost: "smtp.example.com", smtpUser: "u", smtpPass: "secret" };
const SMS = { smsProvider: "netgsm", smsApiKey: "k", smsApiSecret: "s" };
const UID = "user-1";

function makeController() {
  const service = {
    getOrCreate: jest.fn().mockResolvedValue({ id: "o1", name: "B" }),
    getPublicOffice: jest.fn().mockResolvedValue({ id: "o1", smtpPass: "********" }),
    update: jest.fn().mockResolvedValue({ ok: true }),
    updateSmtpSettings: jest.fn().mockResolvedValue({ ok: true }),
    updateSmsSettings: jest.fn().mockResolvedValue({ ok: true }),
    updateGreetingSettings: jest.fn().mockResolvedValue({ ok: true }),
    updateIik78Settings: jest.fn().mockResolvedValue({ ok: true }),
    updateEscalationSettings: jest.fn().mockResolvedValue({ ok: true }),
    getSmtpSettings: jest.fn().mockReturnValue({ smtpPass: "********" }),
    getSmsSettings: jest.fn().mockReturnValue({ smsApiSecret: "********" }),
  };
  const guidedOpenObserve = { observe: jest.fn().mockResolvedValue(undefined) };
  return {
    service,
    guidedOpenObserve,
    controller: new OfficeController(service as any, guidedOpenObserve as any),
  };
}

describe("OfficeController credential guard + secret maskeleme + audit userId", () => {
  it("(1) yetkisiz user PUT smtp-settings → ForbiddenException, servis ÇAĞRILMAZ", async () => {
    const { service, controller } = makeController();
    await expect(controller.updateSmtpSettings("t1", "USER", UID, SMTP)).rejects.toThrow(
      ForbiddenException
    );
    expect(service.updateSmtpSettings).not.toHaveBeenCalled();
  });

  it("(2) yetkisiz user PUT sms-settings → ForbiddenException, servis ÇAĞRILMAZ", () => {
    const { service, controller } = makeController();
    expect(() => controller.updateSmsSettings("t1", "VIEWER", UID, SMS)).toThrow(ForbiddenException);
    expect(service.updateSmsSettings).not.toHaveBeenCalled();
  });

  it("(3) ADMIN PUT smtp-settings → servis çağrılır (tenantId + data + userId geçer)", async () => {
    const { service, controller } = makeController();
    await controller.updateSmtpSettings("t1", "ADMIN", UID, SMTP);
    expect(service.updateSmtpSettings).toHaveBeenCalledWith("t1", SMTP, UID);
  });

  it("(4) ADMIN PUT sms-settings → servis çağrılır (tenantId + data + userId geçer)", async () => {
    const { service, controller } = makeController();
    await controller.updateSmsSettings("t2", "ADMIN", UID, SMS);
    expect(service.updateSmsSettings).toHaveBeenCalledWith("t2", SMS, UID);
  });

  it("(5) tenant izolasyonu: guard tenantId'yi değiştirmez; ADMIN yalnız geçilen tenantId ile gider", async () => {
    const { service, controller } = makeController();
    await controller.updateSmtpSettings("tenant-X", "ADMIN", UID, SMTP);
    expect(service.updateSmtpSettings).toHaveBeenCalledWith("tenant-X", SMTP, UID);
    expect(service.updateSmtpSettings).not.toHaveBeenCalledWith("tenant-Y", SMTP, UID);
  });

  it("(6) GET smtp/sms read davranışı korunur (zaten maskeli)", () => {
    const { service, controller } = makeController();
    controller.getSmtpSettings("t1");
    controller.getSmsSettings("t1");
    expect(service.getSmtpSettings).toHaveBeenCalledWith("t1");
    expect(service.getSmsSettings).toHaveBeenCalledWith("t1");
  });

  // Faz-B güvenlik: GET /office artık secret-maskeli getPublicOffice çağırır (ham getOrCreate DEĞİL)
  it("(7) GET /office → getPublicOffice (secret maskeli) çağrılır, getOrCreate doğrudan dönmez", () => {
    const { service, controller } = makeController();
    controller.getOffice("t1");
    expect(service.getPublicOffice).toHaveBeenCalledWith("t1");
    expect(service.getOrCreate).not.toHaveBeenCalled();
  });

  // Faz-B audit: tüm update uçları userId'yi servise threader
  it("(8) PUT /office userId'yi servise geçirir (audit için)", () => {
    const { service, controller } = makeController();
    const data = { name: "Yeni Büro" };
    controller.updateOffice("t1", UID, data);
    expect(service.update).toHaveBeenCalledWith("t1", data, UID);
  });

  it("(9) PUT greeting/iik78/escalation userId'yi servise geçirir (audit için)", () => {
    const { service, controller } = makeController();
    controller.updateGreetingSettings("t1", UID, { autoGreetingEnabled: false });
    controller.updateIik78Settings("t1", UID, { inactivityThresholdDays: 100 });
    controller.updateEscalationSettings("t1", UID, { opReminderDays: 3 });
    expect(service.updateGreetingSettings).toHaveBeenCalledWith("t1", { autoGreetingEnabled: false }, UID);
    expect(service.updateIik78Settings).toHaveBeenCalledWith("t1", { inactivityThresholdDays: 100 }, UID);
    expect(service.updateEscalationSettings).toHaveBeenCalledWith("t1", { opReminderDays: 3 }, UID);
  });
});
