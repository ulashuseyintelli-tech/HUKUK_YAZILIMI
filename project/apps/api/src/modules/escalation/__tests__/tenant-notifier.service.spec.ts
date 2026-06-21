/**
 * D-G1 — TenantNotifier characterization.
 * OperationalEscalationService'ten DAVRANIŞ-KORUYAN extraction sonrası dispatch primitive'lerinin
 * BİREBİR aynı davrandığını kilitler: SKIPPED / FAILED / SENT dönüşleri, SMTP/SMS-provider ayrımı
 * (NETGSM vs İLETİ MERKEZİ vs desteklenmeyen), config yoksa SESSİZ skip, geçersiz numara → skip.
 * Bu davranış değişirse hem operasyonel hem dosya-görevi (D-G3) eskalasyonu etkilenir.
 */

jest.mock("nodemailer", () => {
  const sendMail = jest.fn().mockResolvedValue({ messageId: "x" });
  return { __sendMail: sendMail, createTransport: () => ({ sendMail }) };
});

jest.mock("../../../common/fetch-with-timeout.util", () => ({
  fetchWithTimeout: jest.fn(),
}));

import * as nodemailer from "nodemailer";
import { fetchWithTimeout } from "../../../common/fetch-with-timeout.util";
import { TenantNotifier } from "../tenant-notifier.service";

const mockSendMail = (nodemailer as any).__sendMail as jest.Mock;
const mockFetch = fetchWithTimeout as jest.Mock;

const SMTP_OK = { smtpHost: "smtp.x.com", smtpUser: "u@x.com", smtpPass: "p" };
const SMS_OK = (provider: string) => ({ smsProvider: provider, smsApiKey: "k", smsApiSecret: "s", smsSender: "HUKUKBURO" });

// officeService mock'u ile TenantNotifier kurar. office.smtp/office.sms verilmezse null (yapılandırılmamış).
const build = (office: { smtp?: any; sms?: any }) =>
  new TenantNotifier({
    getFullSmtpSettings: jest.fn().mockResolvedValue(office.smtp ?? null),
    getFullSmsSettings: jest.fn().mockResolvedValue(office.sms ?? null),
  } as any);

beforeEach(() => {
  mockSendMail.mockReset().mockResolvedValue({ messageId: "x" });
  mockFetch.mockReset();
});

describe("TenantNotifier.sendEmail", () => {
  it("SMTP host/user yok → SKIPPED, sendMail çağrılmaz", async () => {
    const tn = build({ smtp: { smtpHost: null, smtpUser: null } });
    expect(await tn.sendEmail("t1", "to@x.com", "konu", "<b>h</b>")).toBe("SKIPPED");
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("SMTP ayarı null → SKIPPED (sessiz)", async () => {
    expect(await build({ smtp: null }).sendEmail("t1", "to@x.com", "k", "h")).toBe("SKIPPED");
  });

  it("SMTP var + gönderim başarılı → SENT", async () => {
    const tn = build({ smtp: SMTP_OK });
    expect(await tn.sendEmail("t1", "to@x.com", "k", "h")).toBe("SENT");
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it("SMTP var + sendMail exception → FAILED (retry)", async () => {
    mockSendMail.mockRejectedValue(new Error("smtp down"));
    expect(await build({ smtp: SMTP_OK }).sendEmail("t1", "to@x.com", "k", "h")).toBe("FAILED");
  });
});

describe("TenantNotifier.sendSms", () => {
  it("sağlayıcı yok → SKIPPED, fetch çağrılmaz", async () => {
    const tn = build({ sms: { smsProvider: null } });
    expect(await tn.sendSms("t1", "05551112233", "msg")).toBe("SKIPPED");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("geçersiz cep numarası → SKIPPED, fetch çağrılmaz", async () => {
    const tn = build({ sms: SMS_OK("NETGSM") });
    expect(await tn.sendSms("t1", "123", "msg")).toBe("SKIPPED");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("NETGSM başarılı (00...) → SENT, doğru endpoint", async () => {
    mockFetch.mockResolvedValue({ text: async () => "00 1234567" });
    const tn = build({ sms: SMS_OK("NETGSM") });
    expect(await tn.sendSms("t1", "05551112233", "msg")).toBe("SENT");
    expect(mockFetch.mock.calls[0][0]).toContain("api.netgsm.com.tr");
  });

  it("NETGSM hata kodu (00 değil) → FAILED", async () => {
    mockFetch.mockResolvedValue({ text: async () => "30" });
    expect(await build({ sms: SMS_OK("NETGSM") }).sendSms("t1", "05551112233", "msg")).toBe("FAILED");
  });

  it("İLETİ MERKEZİ başarılı → SENT, doğru endpoint", async () => {
    mockFetch.mockResolvedValue({ text: async () => "<response>ok</response>" });
    const tn = build({ sms: SMS_OK("ILETI_MERKEZI") });
    expect(await tn.sendSms("t1", "05551112233", "msg")).toBe("SENT");
    expect(mockFetch.mock.calls[0][0]).toContain("api.iletimerkezi.com");
  });

  it("İLETİ MERKEZİ hata (error metni) → FAILED", async () => {
    mockFetch.mockResolvedValue({ text: async () => "<error>bad</error>" });
    expect(await build({ sms: SMS_OK("ILETI_MERKEZI") }).sendSms("t1", "05551112233", "msg")).toBe("FAILED");
  });

  it("desteklenmeyen sağlayıcı → SKIPPED", async () => {
    const tn = build({ sms: SMS_OK("FOO_SMS") });
    expect(await tn.sendSms("t1", "05551112233", "msg")).toBe("SKIPPED");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sağlayıcı exception (fetch throw) → FAILED", async () => {
    mockFetch.mockRejectedValue(new Error("network"));
    expect(await build({ sms: SMS_OK("NETGSM") }).sendSms("t1", "05551112233", "msg")).toBe("FAILED");
  });
});
