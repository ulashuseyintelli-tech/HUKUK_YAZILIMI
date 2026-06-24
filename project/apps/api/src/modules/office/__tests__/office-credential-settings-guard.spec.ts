/**
 * WP-4c-hotfix-1 — Ofis kimlik bilgisi (SMTP/SMS) GÜNCELLEME hard guard.
 * WP-4c-0 envanteri PUT /office/smtp-settings + /office/sms-settings'i TENANT_ONLY
 * (tenant içi herhangi bir authenticated user değiştirebilir) olarak işaretledi.
 * Minimal kural: yalnız role==='ADMIN' güncelleyebilir (mevcut report.controller deseni).
 * Genel RBAC / permission-tree DEĞİL. Read uçları zaten secret'ı maskeliyor (kapsam dışı).
 */

import { ForbiddenException } from "@nestjs/common";
import { OfficeController } from "../office.controller";

const SMTP = { smtpHost: "smtp.example.com", smtpUser: "u", smtpPass: "secret" };
const SMS = { smsProvider: "netgsm", smsApiKey: "k", smsApiSecret: "s" };

function makeController() {
  const service = {
    updateSmtpSettings: jest.fn().mockResolvedValue({ ok: true }),
    updateSmsSettings: jest.fn().mockResolvedValue({ ok: true }),
    getSmtpSettings: jest.fn().mockReturnValue({ smtpPass: "********" }),
    getSmsSettings: jest.fn().mockReturnValue({ smsApiSecret: "********" }),
  };
  return { service, controller: new OfficeController(service as any) };
}

describe("WP-4c-hotfix-1 OfficeController credential settings hard guard", () => {
  it("(1) yetkisiz user PUT smtp-settings → ForbiddenException, servis ÇAĞRILMAZ", () => {
    const { service, controller } = makeController();
    expect(() => controller.updateSmtpSettings("t1", "USER", SMTP)).toThrow(ForbiddenException);
    expect(service.updateSmtpSettings).not.toHaveBeenCalled();
  });

  it("(2) yetkisiz user PUT sms-settings → ForbiddenException, servis ÇAĞRILMAZ", () => {
    const { service, controller } = makeController();
    expect(() => controller.updateSmsSettings("t1", "VIEWER", SMS)).toThrow(ForbiddenException);
    expect(service.updateSmsSettings).not.toHaveBeenCalled();
  });

  it("(3) ADMIN PUT smtp-settings → servis çağrılır (tenantId + data geçer)", async () => {
    const { service, controller } = makeController();
    await controller.updateSmtpSettings("t1", "ADMIN", SMTP);
    expect(service.updateSmtpSettings).toHaveBeenCalledWith("t1", SMTP);
  });

  it("(4) ADMIN PUT sms-settings → servis çağrılır (tenantId + data geçer)", async () => {
    const { service, controller } = makeController();
    await controller.updateSmsSettings("t2", "ADMIN", SMS);
    expect(service.updateSmsSettings).toHaveBeenCalledWith("t2", SMS);
  });

  it("(5) tenant izolasyonu korunur: guard tenantId'yi değiştirmez; ADMIN yalnız geçilen tenantId ile servise gider", async () => {
    const { service, controller } = makeController();
    await controller.updateSmtpSettings("tenant-X", "ADMIN", SMTP);
    // Guard yalnız ROL kontrolü ekler; cross-tenant koruması JWT tenantId + servis scoping'inde DEĞİŞMEDEN durur.
    expect(service.updateSmtpSettings).toHaveBeenCalledWith("tenant-X", SMTP);
    expect(service.updateSmtpSettings).not.toHaveBeenCalledWith("tenant-Y", SMTP);
  });

  it("(6) read (GET) davranışı DEĞİŞMEDİ — guard yalnız write/update'e eklendi (read zaten maskeli)", () => {
    const { service, controller } = makeController();
    controller.getSmtpSettings("t1");
    controller.getSmsSettings("t1");
    expect(service.getSmtpSettings).toHaveBeenCalledWith("t1");
    expect(service.getSmsSettings).toHaveBeenCalledWith("t1");
  });

  it("(6b) existing validation/service davranışı korunur: ADMIN path servise dokunmadan iletir (data aynen)", async () => {
    const { service, controller } = makeController();
    const payload = { ...SMTP, smtpPort: 587, smtpSecure: true };
    await controller.updateSmtpSettings("t1", "ADMIN", payload);
    expect(service.updateSmtpSettings).toHaveBeenCalledWith("t1", payload);
  });
});
