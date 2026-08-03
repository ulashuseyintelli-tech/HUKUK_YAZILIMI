import { ForbiddenException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ClientNotificationController } from "../client-notification.controller";
import { NotificationDispatchController } from "../notification-dispatch.controller";
import {
  BulkEmailRecipientType,
  ManualClientNotificationType,
} from "../dto/client-notification.dto";
import { CLIENT_WORKSPACE_COMMAND } from "../../client/client-workspace-command-authority";

describe("CN-1 notification authorization characterization", () => {
  const notificationService: any = {
    sendEmail: jest.fn(),
    sendSms: jest.fn(),
    sendBulkEmail: jest.fn(),
    getNotificationOverview: jest.fn(),
    testSend: jest.fn(),
  };
  const dispatcher: any = { resend: jest.fn() };
  const authority: any = {
    createBulkTargetScopeId: jest.fn().mockReturnValue("client-notification-bulk:scope"),
    run: jest.fn(
      async (_actor: unknown, _scope: string, _command: string, execute: () => Promise<unknown>) =>
        execute()
    ),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    notificationService.sendEmail.mockResolvedValue({ success: true });
    notificationService.sendSms.mockResolvedValue({ success: true });
    notificationService.sendBulkEmail.mockResolvedValue({ success: true });
    notificationService.getNotificationOverview.mockResolvedValue({});
    notificationService.testSend.mockResolvedValue({ success: true });
    dispatcher.resend.mockResolvedValue({ status: "sent" });
  });

  it("send-email/send-sms/bulk-email JWT guard taşır ve canonical command wiring'ini tüketir", async () => {
    const controller = new ClientNotificationController(notificationService, authority);
    const guards = Reflect.getMetadata(GUARDS_METADATA, ClientNotificationController);
    expect(guards).toContain(JwtAuthGuard);

    await controller.sendEmail("tenant-1", "actor-1", {
      clientId: "client-1",
      type: ManualClientNotificationType.GENEL_BILGILENDIRME,
      subject: "Konu",
      body: "İçerik",
    }, "ADMIN");
    await controller.sendSms("tenant-1", "actor-1", {
      clientId: "client-1",
      type: ManualClientNotificationType.HATIRLATMA,
      body: "Mesaj",
    }, "ADMIN");
    await controller.sendBulkEmail("tenant-1", "actor-1", {
      recipients: ["client-1"],
      subject: "Konu",
      message: "Mesaj",
      type: BulkEmailRecipientType.CLIENTS,
    }, "ADMIN");

    expect(notificationService.sendEmail).toHaveBeenCalledWith(
      "tenant-1",
      "actor-1",
      expect.any(Object)
    );
    expect(notificationService.sendSms).toHaveBeenCalledWith(
      "tenant-1",
      "actor-1",
      expect.any(Object)
    );
    expect(notificationService.sendBulkEmail).toHaveBeenCalledWith(
      "tenant-1",
      "actor-1",
      expect.any(Object)
    );
    expect(authority.run.mock.calls.map((call: any[]) => call[2])).toEqual([
      CLIENT_WORKSPACE_COMMAND.NOTIFICATION_SEND_EMAIL,
      CLIENT_WORKSPACE_COMMAND.NOTIFICATION_SEND_SMS,
      CLIENT_WORKSPACE_COMMAND.NOTIFICATION_BULK_EMAIL,
    ]);
  });

  it("resend JWT guard taşır ve canonical NOTIFICATION_RESEND wiring'ini tüketir", async () => {
    const controller = new NotificationDispatchController(dispatcher, authority);
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
    expect(authority.run).toHaveBeenCalledWith(
      { userId: "viewer-1", tenantId: "tenant-1", role: "VIEWER" },
      "client-1",
      CLIENT_WORKSPACE_COMMAND.NOTIFICATION_RESEND,
      expect.any(Function),
      expect.any(Function)
    );
  });

  it("overview ve test-send ADMIN olmayan rolü controller sınırında reddeder", async () => {
    const controller = new ClientNotificationController(notificationService, authority);

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
