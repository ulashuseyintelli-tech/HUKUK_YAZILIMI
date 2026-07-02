import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClientController } from '../client.controller';
import { ClientService } from '../client.service';

const defaultClient = {
  id: 'validated-client',
  name: 'Acme Client',
  firstName: null,
  lastName: null,
  email: 'client@example.com',
};

const defaultCase = {
  id: 'case-1',
  fileNumber: 'F-2026-1',
  executionFileNumber: '2026/10',
  executionOffice: { name: 'Istanbul 1. Icra' },
};

function buildHarness(opts: { client?: any; relatedCase?: any; dispatch?: any } = {}) {
  const prisma: any = {
    client: {
      findFirst: jest.fn().mockResolvedValue(Object.prototype.hasOwnProperty.call(opts, 'client') ? opts.client : defaultClient),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    case: {
      findFirst: jest.fn().mockResolvedValue(Object.prototype.hasOwnProperty.call(opts, 'relatedCase') ? opts.relatedCase : defaultCase),
    },
    clientNotification: { create: jest.fn(), update: jest.fn() },
    clientIntakeSubmission: { create: jest.fn(), update: jest.fn() },
    clientIntakeLink: { create: jest.fn(), update: jest.fn() },
    poaExpiryNotificationDelivery: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    notificationQueue: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const audit = { logInTransaction: jest.fn(), log: jest.fn() };
  const dispatcher = {
    dispatch: jest.fn().mockResolvedValue(opts.dispatch ?? { status: 'sent', notificationId: 'notification-1', dedupeKey: 'secret-dedupe' }),
  };
  const svc = new ClientService(prisma, audit as any, {} as any, undefined, dispatcher as any);
  return { svc, prisma, audit, dispatcher };
}

describe('ClientService.sendTemplateNotification', () => {
  it('validates tenant/client/case, dispatches with server-built tokens, and returns a safe response', async () => {
    const { svc, prisma, dispatcher } = buildHarness();

    const result = await svc.sendTemplateNotification(
      'requested-client',
      'tenant-1',
      'user-1',
      'idem-1',
      { templateCode: 'DOSYA_DURUMU', caseId: 'case-1' },
    );
    const serialized = JSON.stringify(result);

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: 'requested-client', tenantId: 'tenant-1', isActive: true },
      select: { id: true, name: true, firstName: true, lastName: true, email: true },
    });
    expect(prisma.case.findFirst).toHaveBeenCalledWith({
      where: { id: 'case-1', tenantId: 'tenant-1', caseClients: { some: { clientId: 'validated-client' } } },
      select: {
        id: true,
        fileNumber: true,
        executionFileNumber: true,
        executionOffice: { select: { name: true } },
      },
    });
    expect(dispatcher.dispatch).toHaveBeenCalledWith('tenant-1', 'user-1', expect.objectContaining({
      clientId: 'validated-client',
      caseId: 'case-1',
      templateCode: 'DOSYA_DURUMU',
      type: 'DOSYA_DURUMU',
      refType: 'ClientWorkspaceTemplateNotification',
      refId: 'validated-client:case-1:idem-1',
      dedupeKey: 'CLIENT_WORKSPACE_TEMPLATE_NOTIFICATION:validated-client:DOSYA_DURUMU:case-1:idem-1',
      tokens: expect.objectContaining({
        clientName: 'Acme Client',
        caseFileNumber: 'F-2026-1',
        executionFileNumber: '2026/10',
        executionOfficeName: 'Istanbul 1. Icra',
      }),
      persistedTokens: expect.objectContaining({ clientName: 'Acme Client' }),
    }));
    expect(result).toEqual({
      clientId: 'validated-client',
      caseId: 'case-1',
      templateCode: 'DOSYA_DURUMU',
      status: 'sent',
      notificationId: 'notification-1',
    });
    expect(serialized).not.toContain('secret-dedupe');
    expect(serialized).not.toContain('client@example.com');
    expect(serialized).not.toContain('body');
    expect(serialized).not.toContain('provider');
  });

  it('requires Idempotency-Key and allowlisted templateCode before dispatch', async () => {
    const { svc, dispatcher } = buildHarness();

    await expect(svc.sendTemplateNotification('client-1', 'tenant-1', 'user-1', '', { templateCode: 'GENEL_BILGILENDIRME' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.sendTemplateNotification('client-1', 'tenant-1', 'user-1', 'idem-1', { templateCode: 'UNSAFE' as any })).rejects.toBeInstanceOf(BadRequestException);
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('returns 404 and does not dispatch when client or related case is outside tenant boundary', async () => {
    const missingClient = buildHarness({ client: null });
    await expect(missingClient.svc.sendTemplateNotification('cross-client', 'tenant-1', 'user-1', 'idem-1', { templateCode: 'GENEL_BILGILENDIRME' })).rejects.toBeInstanceOf(NotFoundException);
    expect(missingClient.dispatcher.dispatch).not.toHaveBeenCalled();

    const missingCase = buildHarness({ relatedCase: null });
    await expect(missingCase.svc.sendTemplateNotification('client-1', 'tenant-1', 'user-1', 'idem-1', { templateCode: 'DOSYA_DURUMU', caseId: 'cross-case' })).rejects.toBeInstanceOf(NotFoundException);
    expect(missingCase.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('does not leak dedupeKey or provider raw error when dispatch fails', async () => {
    const { svc } = buildHarness({ dispatch: { status: 'failed', dedupeKey: 'secret-dedupe', error: 'SMTP token=raw-secret failed' } });

    const result = await svc.sendTemplateNotification('client-1', 'tenant-1', 'user-1', 'idem-1', { templateCode: 'GENEL_BILGILENDIRME' });
    const serialized = JSON.stringify(result);

    expect(result).toEqual({
      clientId: 'validated-client',
      caseId: null,
      templateCode: 'GENEL_BILGILENDIRME',
      status: 'failed',
    });
    expect(serialized).not.toContain('secret-dedupe');
    expect(serialized).not.toContain('raw-secret');
    expect(serialized).not.toContain('SMTP');
  });

  it('does not create audit, timeline, queue, or generic executor side effects directly', async () => {
    const { svc, prisma, audit } = buildHarness();

    await svc.sendTemplateNotification('client-1', 'tenant-1', 'user-1', 'idem-1', { templateCode: 'GENEL_BILGILENDIRME' });

    expect(prisma.client.create).not.toHaveBeenCalled();
    expect(prisma.client.update).not.toHaveBeenCalled();
    expect(prisma.client.updateMany).not.toHaveBeenCalled();
    expect(prisma.clientNotification.create).not.toHaveBeenCalled();
    expect(prisma.clientNotification.update).not.toHaveBeenCalled();
    expect(prisma.clientIntakeSubmission.create).not.toHaveBeenCalled();
    expect(prisma.clientIntakeSubmission.update).not.toHaveBeenCalled();
    expect(prisma.clientIntakeLink.create).not.toHaveBeenCalled();
    expect(prisma.clientIntakeLink.update).not.toHaveBeenCalled();
    expect(prisma.poaExpiryNotificationDelivery.create).not.toHaveBeenCalled();
    expect(prisma.poaExpiryNotificationDelivery.update).not.toHaveBeenCalled();
    expect(prisma.poaExpiryNotificationDelivery.updateMany).not.toHaveBeenCalled();
    expect(prisma.notificationQueue.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });
});

describe('ClientController.sendTemplateNotification', () => {
  it('wraps the typed command response and forwards auth context plus Idempotency-Key', async () => {
    const service = { sendTemplateNotification: jest.fn().mockResolvedValue({ clientId: 'client-1', status: 'skipped' }) };
    const controller = new ClientController(service as any, {} as any);

    const result = await controller.sendTemplateNotification(
      { user: { id: 'user-1', tenantId: 'tenant-1', role: 'USER' } } as any,
      'client-1',
      'idem-1',
      { templateCode: 'GENEL_BILGILENDIRME' },
    );

    expect(service.sendTemplateNotification).toHaveBeenCalledWith('client-1', 'tenant-1', 'user-1', 'idem-1', { templateCode: 'GENEL_BILGILENDIRME' });
    expect(result).toEqual({ data: { clientId: 'client-1', status: 'skipped' } });
  });

  it('rejects raw body/tokens/recipient fields before reaching the service', async () => {
    const service = { sendTemplateNotification: jest.fn() };
    const controller = new ClientController(service as any, {} as any);

    await expect(controller.sendTemplateNotification(
      { user: { id: 'user-1', tenantId: 'tenant-1', role: 'USER' } } as any,
      'client-1',
      'idem-1',
      { templateCode: 'GENEL_BILGILENDIRME', body: 'raw', tokens: { unsafe: 'x' }, recipient: 'client@example.com' },
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(service.sendTemplateNotification).not.toHaveBeenCalled();
  });
});