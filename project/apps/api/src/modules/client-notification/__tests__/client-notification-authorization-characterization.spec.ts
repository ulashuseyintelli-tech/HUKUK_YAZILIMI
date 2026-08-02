import { ForbiddenException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ClientNotificationController } from "../client-notification.controller";
import { NotificationDispatchController } from "../notification-dispatch.controller";
import {
  BulkEmailRecipientType,
  ManualClientNotificationType,
} from "../dto/client-notification.dto";

describe("CN-1 notification authorization characterization", () => {
  const notificationService: any = {
    sendEmail: jest.fn(),
    sendSms: jest.fn(),
    sendBulkEmail: jest.fn(),
    getNotificationOverview: jest.fn(),
    testSend: jest.fn(),
  };
  const dispatcher: any = { resend: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    notificationService.sendEmail.mockResolvedValue({ success: true });
    notificationService.sendSms.mockResolvedValue({ success: true });
    notificationService.sendBulkEmail.mockResolvedValue({ success: true });
    notificationService.getNotificationOverview.mockResolvedValue({});
    notificationService.testSend.mockResolvedValue({ success: true });
    dispatcher.resend.mockResolvedValue({ status: "sent" });
  });

  it("send-email/send-sms/bulk-email class-level JWT guard taşır fakat role tüketmez", async () => {
    const controller = new ClientNotificationController(notificationService);
    const guards = Reflect.getMetadata(GUARDS_METADATA, ClientNotificationController);
    expect(guards).toContain(JwtAuthGuard);

    await controller.sendEmail("tenant-1", "viewer-1", {
      clientId: "client-1",
      type: ManualClientNotificationType.GENEL_BILGILENDIRME,
      subject: "Konu",
      body: "İçerik",
    });
    await controller.sendSms("tenant-1", "viewer-1", {
      clientId: "client-1",
      type: ManualClientNotificationType.HATIRLATMA,
      body: "Mesaj",
    });
    await controller.sendBulkEmail("tenant-1", "viewer-1", {
      recipients: ["client-1"],
      subject: "Konu",
      message: "Mesaj",
      type: BulkEmailRecipientType.CLIENTS,
    });

    expect(notificationService.sendEmail).toHaveBeenCalledWith(
      "tenant-1",
      "viewer-1",
      expect.any(Object)
    );
    expect(notificationService.sendSms).toHaveBeenCalledWith(
      "tenant-1",
      "viewer-1",
      expect.any(Object)
    );
    expect(notificationService.sendBulkEmail).toHaveBeenCalledWith(
      "tenant-1",
      "viewer-1",
      expect.any(Object)
    );
  });

  it("resend class-level JWT guard taşır fakat role tüketmeden dispatcher'a iletir", async () => {
    const controller = new NotificationDispatchController(dispatcher);
    const guards = Reflect.getMetadata(GUARDS_METADATA, NotificationDispatchController);
    expect(guards).toHaveLength(1);

    await controller.resend(
      { user: { id: "viewer-1", tenantId: "tenant-1", role: "VIEWER" } } as any,
      {
        clientId: "client-1",
        templateCode: "CLIENT_INFO",
        type: "CLIENT_INFO",
        refType: "Client",
        refId: "client-1",
      } as any
    );

    expect(dispatcher.resend).toHaveBeenCalledWith(
      "tenant-1",
      "viewer-1",
      expect.objectContaining({ clientId: "client-1", force: undefined })
    );
  });

  it("overview ve test-send ADMIN olmayan rolü controller sınırında reddeder", async () => {
    const controller = new ClientNotificationController(notificationService);

    await expect(controller.getOverview("tenant-1", "USER")).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await expect(
      controller.testSend("tenant-1", "user-1", "VIEWER", {
        clientId: "client-1",
        channel: "EMAIL",
        confirm: true,
      })
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(notificationService.getNotificationOverview).not.toHaveBeenCalled();
    expect(notificationService.testSend).not.toHaveBeenCalled();
  });
});
