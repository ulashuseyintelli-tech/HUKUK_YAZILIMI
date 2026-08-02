import { BadRequestException, ValidationPipe } from "@nestjs/common";
import {
  BulkEmailRecipientType,
  ClientNotificationTemplateCategory,
  CreateClientNotificationTemplateDto,
  ManualClientNotificationType,
  SendClientNotificationBulkEmailDto,
  SendClientNotificationEmailDto,
  SendClientNotificationSmsDto,
  UpdateClientNotificationTemplateDto,
  clientNotificationDtoLimits,
} from "../dto/client-notification.dto";
import { ClientNotificationController } from "../client-notification.controller";

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

function validate<T>(value: unknown, metatype: new () => T): Promise<T> {
  return pipe.transform(value, { type: "body", metatype });
}

describe("ClientNotification DTO validation", () => {
  it("controller body parametrelerini decorated DTO sınıflarına bağlar", () => {
    const parameterType = (method: keyof ClientNotificationController, index: number) =>
      Reflect.getMetadata("design:paramtypes", ClientNotificationController.prototype, method)[index];

    expect(parameterType("sendEmail", 2)).toBe(SendClientNotificationEmailDto);
    expect(parameterType("sendSms", 2)).toBe(SendClientNotificationSmsDto);
    expect(parameterType("createEmailTemplate", 1)).toBe(CreateClientNotificationTemplateDto);
    expect(parameterType("updateEmailTemplate", 2)).toBe(UpdateClientNotificationTemplateDto);
    expect(parameterType("sendBulkEmail", 2)).toBe(SendClientNotificationBulkEmailDto);
  });

  it("send-email gövdesini decorated DTO'ya dönüştürür", async () => {
    const result = await validate(
      {
        clientId: "client-1",
        type: ManualClientNotificationType.GENEL_BILGILENDIRME,
        subject: "Konu",
        body: "<p>İçerik</p>",
      },
      SendClientNotificationEmailDto
    );

    expect(result).toBeInstanceOf(SendClientNotificationEmailDto);
  });

  it.each([
    ["unknown notification type", { clientId: "client-1", type: "CUSTOM", subject: "Konu", body: "İçerik" }],
    [
      "oversized subject",
      {
        clientId: "client-1",
        type: ManualClientNotificationType.RAPOR,
        subject: "x".repeat(clientNotificationDtoLimits.subject + 1),
        body: "İçerik",
      },
    ],
    [
      "non-whitelisted field",
      {
        clientId: "client-1",
        type: ManualClientNotificationType.RAPOR,
        subject: "Konu",
        body: "İçerik",
        sentById: "forged-user",
      },
    ],
  ])("send-email rejects %s", async (_label, body) => {
    await expect(validate(body, SendClientNotificationEmailDto)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("send-sms body length cap uygular", async () => {
    await expect(
      validate(
        {
          clientId: "client-1",
          type: ManualClientNotificationType.HATIRLATMA,
          body: "x".repeat(clientNotificationDtoLimits.smsBody + 1),
        },
        SendClientNotificationSmsDto
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("bulk-email recipient sayısını sınırlar ve recipient type enum'unu uygular", async () => {
    await expect(
      validate(
        {
          recipients: Array.from(
            { length: clientNotificationDtoLimits.bulkRecipientCount + 1 },
            (_, index) => `client-${index}`
          ),
          subject: "Konu",
          message: "Mesaj",
          type: BulkEmailRecipientType.CLIENTS,
        },
        SendClientNotificationBulkEmailDto
      )
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      validate(
        { recipients: ["client-1"], subject: "Konu", message: "Mesaj", type: "staff" },
        SendClientNotificationBulkEmailDto
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("template create/update gövdelerinde enum, length ve boolean doğrular", async () => {
    const created = await validate(
      {
        name: "Şablon",
        code: "CLIENT_INFO_CUSTOM",
        category: ClientNotificationTemplateCategory.CLIENT_INFO,
        subject: "Konu",
        body: "<p>İçerik</p>",
        isDefault: false,
      },
      CreateClientNotificationTemplateDto
    );
    expect(created).toBeInstanceOf(CreateClientNotificationTemplateDto);

    await expect(
      validate(
        {
          name: "Şablon",
          code: "CUSTOM",
          category: "UNKNOWN",
          subject: "Konu",
          body: "İçerik",
        },
        CreateClientNotificationTemplateDto
      )
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      validate({ isActive: "yes" }, UpdateClientNotificationTemplateDto)
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      validate(
        { body: "x".repeat(clientNotificationDtoLimits.emailBody + 1) },
        UpdateClientNotificationTemplateDto
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
