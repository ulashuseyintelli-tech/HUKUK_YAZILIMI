import { ForbiddenException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ErrorLogModule } from '../../error-log/error-log.module';
import {
  CLIENT_WORKSPACE_COMMAND,
  ClientWorkspaceCommandType,
} from '../../client/client-workspace-command-authority';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { ClientNotificationAuthorityAdapter } from '../client-notification-authority.adapter';
import { ClientNotificationController } from '../client-notification.controller';
import { ClientNotificationModule } from '../client-notification.module';
import { ClientNotificationService } from '../client-notification.service';
import { NotificationDispatchController } from '../notification-dispatch.controller';
import { NotificationDispatcherService } from '../notification-dispatcher.service';
import {
  BulkEmailRecipientType,
  ManualClientNotificationType,
} from '../dto/client-notification.dto';

describe('CN-1 canonical notification authority wiring', () => {
  const officeApproval = { isApproverEligible: jest.fn() };
  const audit = { log: jest.fn() };
  const notificationService = {
    sendEmail: jest.fn(),
    sendSms: jest.fn(),
    sendBulkEmail: jest.fn(),
  };
  const dispatcher = { resend: jest.fn() };

  const emailBody = {
    clientId: 'client-secret-a',
    type: ManualClientNotificationType.GENEL_BILGILENDIRME,
    subject: 'Hassas konu',
    body: 'Hassas e-posta gövdesi',
  };
  const smsBody = {
    clientId: 'client-secret-a',
    type: ManualClientNotificationType.HATIRLATMA,
    body: '+905551112233 hassas SMS gövdesi',
  };
  const bulkBody = {
    recipients: ['client-secret-a', 'client-secret-b'],
    subject: 'Hassas toplu konu',
    message: 'Hassas toplu içerik',
    type: BulkEmailRecipientType.CLIENTS,
  };
  const resendBody = {
    clientId: 'client-secret-a',
    templateCode: 'CLIENT_INFO',
    type: 'CLIENT_INFO',
    refType: 'Client',
    refId: 'client-secret-a',
    tokens: { clientName: 'Hassas Ad' },
  };

  let adapter: ClientNotificationAuthorityAdapter;
  let notificationController: ClientNotificationController;
  let dispatchController: NotificationDispatchController;

  beforeEach(() => {
    jest.clearAllMocks();
    officeApproval.isApproverEligible.mockResolvedValue(false);
    audit.log.mockResolvedValue(undefined);
    notificationService.sendEmail.mockResolvedValue({
      success: true,
      notificationId: 'notification-email',
      recipient: 'masked@example.test',
    });
    notificationService.sendSms.mockResolvedValue({
      success: true,
      notificationId: 'notification-sms',
      recipient: '+90******23',
    });
    notificationService.sendBulkEmail.mockResolvedValue({
      success: true,
      message: '1 e-posta gönderildi, 1 başarısız',
      details: {
        sent: 1,
        failed: 1,
        errors: ['secret@example.test: provider credential rejected'],
      },
    });
    dispatcher.resend.mockResolvedValue({
      status: 'sent',
      notificationId: 'notification-resend',
      dedupeKey: 'CLIENT_INFO:Client:client-secret-a:1',
    });

    adapter = new ClientNotificationAuthorityAdapter(
      officeApproval as unknown as OfficeApprovalService,
      audit as unknown as AuditService,
    );
    notificationController = new ClientNotificationController(
      notificationService as unknown as ClientNotificationService,
      adapter,
    );
    dispatchController = new NotificationDispatchController(
      dispatcher as unknown as NotificationDispatcherService,
      adapter,
    );
  });

  const endpointCases: Array<{
    name: string;
    commandType: ClientWorkspaceCommandType;
    sideEffect: jest.Mock;
    invoke: (role: string | undefined) => Promise<unknown>;
  }> = [
    {
      name: 'send-email',
      commandType: CLIENT_WORKSPACE_COMMAND.NOTIFICATION_SEND_EMAIL,
      sideEffect: notificationService.sendEmail,
      invoke: (role) =>
        notificationController.sendEmail('tenant-1', 'actor-1', emailBody, role as string),
    },
    {
      name: 'send-sms',
      commandType: CLIENT_WORKSPACE_COMMAND.NOTIFICATION_SEND_SMS,
      sideEffect: notificationService.sendSms,
      invoke: (role) =>
        notificationController.sendSms('tenant-1', 'actor-1', smsBody, role as string),
    },
    {
      name: 'bulk-email',
      commandType: CLIENT_WORKSPACE_COMMAND.NOTIFICATION_BULK_EMAIL,
      sideEffect: notificationService.sendBulkEmail,
      invoke: (role) =>
        notificationController.sendBulkEmail('tenant-1', 'actor-1', bulkBody, role as string),
    },
    {
      name: 'resend',
      commandType: CLIENT_WORKSPACE_COMMAND.NOTIFICATION_RESEND,
      sideEffect: dispatcher.resend,
      invoke: (role) =>
        dispatchController.resend(
          { user: { id: 'actor-1', tenantId: 'tenant-1', role } } as any,
          resendBody as any,
        ),
    },
  ];

  describe.each(endpointCases)('$name', ({ commandType, sideEffect, invoke }) => {
    it('VIEWER rolünü 403 ile ve yan etkisiz reddeder', async () => {
      await expect(invoke('VIEWER')).rejects.toBeInstanceOf(ForbiddenException);
      expect(sideEffect).not.toHaveBeenCalled();
      expect(officeApproval.isApproverEligible).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('tanımsız rolü fail-closed reddeder', async () => {
      await expect(invoke(undefined)).rejects.toBeInstanceOf(ForbiddenException);
      expect(sideEffect).not.toHaveBeenCalled();
      expect(officeApproval.isApproverEligible).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('eligible olmayan USER rolünü 403 ile reddeder', async () => {
      await expect(invoke('USER')).rejects.toBeInstanceOf(ForbiddenException);
      expect(officeApproval.isApproverEligible).toHaveBeenCalledWith('actor-1', 'tenant-1');
      expect(sideEffect).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('ADMIN için eligibility sorgulamadan execute ve audit yapar', async () => {
      await invoke('ADMIN');
      expect(officeApproval.isApproverEligible).not.toHaveBeenCalled();
      expect(sideEffect).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          userId: 'actor-1',
          metadata: expect.objectContaining({ commandType, actorRole: 'ADMIN' }),
        }),
      );
    });

    it('canonical elevated USER için execute ve audit yapar', async () => {
      officeApproval.isApproverEligible.mockResolvedValue(true);
      await invoke('USER');
      expect(officeApproval.isApproverEligible).toHaveBeenCalledWith('actor-1', 'tenant-1');
      expect(sideEffect).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ commandType, actorRole: 'USER' }),
        }),
      );
    });
  });

  it('bulk audit hedefi ve metadata alanları stabil ve PII-free kalır', async () => {
    const expectedTarget = adapter.createBulkTargetScopeId(
      bulkBody.type,
      [...bulkBody.recipients].reverse(),
    );

    await notificationController.sendBulkEmail('tenant-1', 'actor-1', bulkBody, 'ADMIN');

    const auditInput = audit.log.mock.calls[0][0];
    expect(auditInput.entityId).toBe(expectedTarget);
    expect(auditInput.entityId).toMatch(/^client-notification-bulk:[a-f0-9]{64}$/);
    expect(auditInput.metadata).toEqual({
      commandType: CLIENT_WORKSPACE_COMMAND.NOTIFICATION_BULK_EMAIL,
      actorRole: 'ADMIN',
      status: 'failed',
      recipientCount: 2,
      sentCount: 1,
      failedCount: 1,
    });

    const serializedAudit = JSON.stringify(auditInput);
    for (const forbidden of [
      ...bulkBody.recipients,
      bulkBody.subject,
      bulkBody.message,
      'secret@example.test',
      'provider credential rejected',
    ]) {
      expect(serializedAudit).not.toContain(forbidden);
    }
  });

  it('resend failed-status sonucunun public DispatchResult shape’ını değiştirmeden audit eder', async () => {
    const dispatchResult = {
      status: 'failed' as const,
      dedupeKey: 'CLIENT_INFO:Client:client-secret-a:1',
      error: 'provider failure',
    };
    dispatcher.resend.mockResolvedValue(dispatchResult);

    const result = await dispatchController.resend(
      { user: { id: 'actor-1', tenantId: 'tenant-1', role: 'ADMIN' } } as any,
      resendBody as any,
    );

    expect(result).toBe(dispatchResult);
    expect(result).toEqual(dispatchResult);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          commandType: CLIENT_WORKSPACE_COMMAND.NOTIFICATION_RESEND,
          actorRole: 'ADMIN',
          status: 'failed',
        },
      }),
    );
  });

  it('execute throw ederse primitive sözleşmesine uygun olarak audit üretmez', async () => {
    notificationService.sendEmail.mockRejectedValue(new Error('smtp failed'));

    await expect(
      notificationController.sendEmail('tenant-1', 'actor-1', emailBody, 'ADMIN'),
    ).rejects.toThrow('smtp failed');
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('production ClientNotificationModule gerçek controller-adapter DI grafiğini boot eder', async () => {
    // Production AppModule ErrorLogModule'ü global olarak yükler; aynı boot bağımlılığı
    // burada açıkça kurulup DB provider'ı SAF stub ile değiştirilir.
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), ErrorLogModule, ClientNotificationModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(ClientNotificationService)
      .useValue(notificationService)
      .overrideProvider(NotificationDispatcherService)
      .useValue(dispatcher)
      .overrideProvider(OfficeApprovalService)
      .useValue(officeApproval)
      .overrideProvider(AuditService)
      .useValue(audit)
      .compile();

    const resolvedAdapter = moduleRef.get(ClientNotificationAuthorityAdapter);
    const resolvedNotificationController = moduleRef.get(ClientNotificationController);
    const resolvedDispatchController = moduleRef.get(NotificationDispatchController);
    expect(resolvedAdapter).toBeInstanceOf(ClientNotificationAuthorityAdapter);
    expect((resolvedNotificationController as any).authority).toBe(resolvedAdapter);
    expect((resolvedDispatchController as any).authority).toBe(resolvedAdapter);
    await moduleRef.close();
  });
});
