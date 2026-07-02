import { NotFoundException } from '@nestjs/common';
import { ClientController } from '../client.controller';
import { ClientService } from '../client.service';

const deliveryResult = {
  scanned: 1,
  recipients: 1,
  sent: 1,
  failed: 0,
  skipped: 0,
};

function buildHarness(opts: { client?: any; delivery?: any } = {}) {
  const prisma: any = {
    client: {
      findFirst: jest.fn().mockResolvedValue(Object.prototype.hasOwnProperty.call(opts, 'client') ? opts.client : { id: 'validated-client' }),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    clientNotification: { create: jest.fn(), update: jest.fn() },
    clientIntakeSubmission: { create: jest.fn(), update: jest.fn() },
    clientIntakeLink: { create: jest.fn(), update: jest.fn() },
    poaExpiryNotificationDelivery: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    notificationQueue: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const audit = { logInTransaction: jest.fn(), log: jest.fn() };
  const poaDelivery = {
    sendExpiringPoaNotificationsForClient: jest.fn().mockResolvedValue(opts.delivery ?? deliveryResult),
  };
  const svc = new ClientService(prisma, audit as any, {} as any, poaDelivery as any);
  return { svc, prisma, audit, poaDelivery };
}

describe('ClientService.sendPoaReminder', () => {
  const originalFlag = process.env.POA_EXPIRY_NOTIFICATION_ENABLED;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.POA_EXPIRY_NOTIFICATION_ENABLED;
    else process.env.POA_EXPIRY_NOTIFICATION_ENABLED = originalFlag;
  });

  it('validates the tenant-scoped client and delegates to scoped POA delivery without leaking secrets', async () => {
    const { svc, prisma, poaDelivery } = buildHarness();

    const result = await svc.sendPoaReminder('requested-client', 'tenant-1');
    const serialized = JSON.stringify(result);

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: 'requested-client', tenantId: 'tenant-1', isActive: true },
      select: { id: true },
    });
    expect(poaDelivery.sendExpiringPoaNotificationsForClient).toHaveBeenCalledWith('tenant-1', 'validated-client');
    expect(result).toEqual({ clientId: 'validated-client', status: 'sent', ...deliveryResult });
    expect(serialized).not.toContain('recipientEmail');
    expect(serialized).not.toContain('dedupeKey');
    expect(serialized).not.toContain('body');
    expect(serialized).not.toContain('provider');
  });

  it('returns 404 and does not dispatch when the client is missing, inactive, or cross-tenant', async () => {
    const { svc, poaDelivery } = buildHarness({ client: null });

    await expect(svc.sendPoaReminder('cross-tenant', 'tenant-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(poaDelivery.sendExpiringPoaNotificationsForClient).not.toHaveBeenCalled();
  });

  it('does not let the cron feature flag block the manual command', async () => {
    process.env.POA_EXPIRY_NOTIFICATION_ENABLED = 'false';
    const { svc, poaDelivery } = buildHarness();

    await svc.sendPoaReminder('client-1', 'tenant-1');

    expect(poaDelivery.sendExpiringPoaNotificationsForClient).toHaveBeenCalledTimes(1);
  });

  it('does not create ClientNotification, NotificationQueue, timeline, audit, or generic write side effects', async () => {
    const { svc, prisma, audit } = buildHarness();

    await svc.sendPoaReminder('client-1', 'tenant-1');

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

describe('ClientController.sendPoaReminder', () => {
  it('wraps the typed command response in data', async () => {
    const service = { sendPoaReminder: jest.fn().mockResolvedValue({ clientId: 'client-1', status: 'skipped' }) };
    const controller = new ClientController(service as any, {} as any);

    const result = await controller.sendPoaReminder({ user: { id: 'user-1', tenantId: 'tenant-1', role: 'USER' } } as any, 'client-1');

    expect(service.sendPoaReminder).toHaveBeenCalledWith('client-1', 'tenant-1');
    expect(result).toEqual({ data: { clientId: 'client-1', status: 'skipped' } });
  });
});