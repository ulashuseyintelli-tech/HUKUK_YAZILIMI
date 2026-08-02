import * as nodemailer from "nodemailer";
import {
  ClientNotificationService,
  sanitizeNotificationHtml,
} from "../client-notification.service";

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(),
}));

describe("ClientNotificationService provider error sanitization", () => {
  const prisma: any = {
    client: { findFirst: jest.fn() },
    clientNotification: { create: jest.fn(), update: jest.fn() },
  };
  const office: any = {
    getFullSmtpSettings: jest.fn(),
    getFullSmsSettings: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.client.findFirst.mockResolvedValue({
      id: "client-1",
      email: "client@example.com",
      phone: "05551112233",
      contacts: [],
    });
    prisma.clientNotification.create.mockResolvedValue({ id: "notification-1" });
    prisma.clientNotification.update.mockResolvedValue({ id: "notification-1" });
  });

  it("SMTP provider sırrını DB, response ve logdan redakte eder", async () => {
    const rawSecret = "smtp-secret-value";
    const sendMail = jest
      .fn()
      .mockRejectedValue(new Error(`Authentication failed password=${rawSecret} apiKey=another-secret`));
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    office.getFullSmtpSettings.mockResolvedValue({
      smtpHost: "smtp.example.com",
      smtpUser: "smtp-user",
      smtpPass: rawSecret,
    });
    const service = new ClientNotificationService(prisma, office);
    const logSpy = jest.spyOn((service as any).logger, "error").mockImplementation();

    let responseMessage = "";
    try {
      await service.sendEmail("tenant-1", "user-1", {
        clientId: "client-1",
        type: "GENEL_BILGILENDIRME",
        subject: "Konu",
        body: "İçerik",
      });
    } catch (error: any) {
      responseMessage = error.message;
    }

    const persisted = prisma.clientNotification.update.mock.calls[0][0].data.errorMessage;
    const logged = logSpy.mock.calls[0][0];
    expect(persisted).toContain("password=***");
    expect(persisted).toContain("apiKey=***");
    expect(`${persisted} ${responseMessage} ${logged}`).not.toContain(rawSecret);
    expect(`${persisted} ${responseMessage} ${logged}`).not.toContain("another-secret");
  });

  it("e-posta HTML'inde yalnız güvenli temel biçimlendirmeyi gönderir ve persist eder", async () => {
    const rawBody =
      '<p onclick="steal()">Merhaba <strong>müvekkil</strong></p>' +
      '<img src=x onerror="steal()"><script>alert(1)</script>&#x3c;svg onload=steal()>';
    const safeBody =
      "<p>Merhaba <strong>müvekkil</strong></p>alert(1)&amp;#x3c;svg onload=steal()&gt;";
    const sendMail = jest.fn().mockResolvedValue({ messageId: "message-1" });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    office.getFullSmtpSettings.mockResolvedValue({
      smtpHost: "smtp.example.com",
      smtpUser: "smtp-user",
      smtpPass: "smtp-pass",
    });
    const service = new ClientNotificationService(prisma, office);

    await service.sendEmail("tenant-1", "user-1", {
      clientId: "client-1",
      type: "GENEL_BILGILENDIRME",
      subject: "Konu",
      body: rawBody,
    });

    expect(sanitizeNotificationHtml(rawBody)).toBe(safeBody);
    expect(prisma.clientNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ body: safeBody }) })
    );
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ html: safeBody }));
  });

  it("SMS provider URL query'sini DB, response ve logdan tamamen redakte eder", async () => {
    const rawSecret = "sms-secret-value";
    const rawPhone = "905551112233";
    const rawMessage = "gizli mesaj";
    const providerUrl =
      `https://api.netgsm.com.tr/sms/send/get?usercode=api-user&password=${rawSecret}` +
      `&gsmno=${rawPhone}&message=${encodeURIComponent(rawMessage)}`;
    office.getFullSmsSettings.mockResolvedValue({
      smsProvider: "NETGSM",
      smsApiKey: "api-user",
      smsApiSecret: rawSecret,
      smsSender: "BURO",
    });
    const service = new ClientNotificationService(prisma, office);
    jest.spyOn(service as any, "sendNetGsmSms").mockRejectedValue(new Error(`fetch failed: ${providerUrl}`));
    const logSpy = jest.spyOn((service as any).logger, "error").mockImplementation();

    let responseMessage = "";
    try {
      await service.sendSms("tenant-1", "user-1", {
        clientId: "client-1",
        type: "HATIRLATMA",
        body: rawMessage,
      });
    } catch (error: any) {
      responseMessage = error.message;
    }

    const persisted = prisma.clientNotification.update.mock.calls[0][0].data.errorMessage;
    const logged = logSpy.mock.calls[0][0];
    expect(persisted).toContain("https://api.netgsm.com.tr/sms/send/get?[REDACTED_QUERY]");
    expect(`${persisted} ${responseMessage} ${logged}`).not.toContain(rawSecret);
    expect(`${persisted} ${responseMessage} ${logged}`).not.toContain(rawPhone);
    expect(`${persisted} ${responseMessage} ${logged}`).not.toContain(encodeURIComponent(rawMessage));
  });
});
