import { NotFoundException } from '@nestjs/common';
import { ClientService, type ClientActionKey } from '../client.service';

function buildHarness(opts: { client?: any } = {}) {
  const prisma: any = {
    client: {
      findFirst: jest
        .fn()
        .mockResolvedValue(Object.prototype.hasOwnProperty.call(opts, 'client') ? opts.client : { id: 'client-1' }),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    clientNotification: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    clientIntakeSubmission: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    clientIntakeLink: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    poaExpiryNotificationDelivery: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    task: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };
  const audit = { logInTransaction: jest.fn(), log: jest.fn() };
  const svc = new ClientService(prisma, audit as any);
  return { svc, prisma, audit };
}

const futureWriteKeys: ClientActionKey[] = [
  'intake.link.create',
  'intake.link.send',
  'poa.reminder.send',
  'notification.template.send',
];

const navigationKeys: ClientActionKey[] = [
  'contact.update_missing_info',
  'case.open_related',
  'activity.view_timeline',
];

describe('ClientService.getActionCatalog', () => {
  it('returns the V1 action catalog after tenant-scoped client validation', async () => {
    const { svc, prisma } = buildHarness();

    const result = await svc.getActionCatalog('client-1', 'tenant-1');

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: 'client-1', tenantId: 'tenant-1', isActive: true },
      select: { id: true },
    });
    expect(result.data.map((item) => item.key)).toEqual([
      'contact.update_missing_info',
      'case.open_related',
      'activity.view_timeline',
      'intake.link.create',
      'intake.link.send',
      'poa.reminder.send',
      'notification.template.send',
    ]);
    expect(result.data.every((item) => item.visibility === 'visible')).toBe(true);
    expect(result.data.every((item) => item.target?.clientId === 'client-1')).toBe(true);
  });

  it('returns 404 when the client is missing, inactive, or outside the tenant boundary', async () => {
    const { svc, prisma } = buildHarness({ client: null });

    await expect(svc.getActionCatalog('cross-tenant-client', 'tenant-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.clientNotification.findMany).not.toHaveBeenCalled();
    expect(prisma.clientIntakeSubmission.findMany).not.toHaveBeenCalled();
    expect(prisma.clientIntakeLink.findMany).not.toHaveBeenCalled();
  });

  it('enables only safe navigation/link actions in V1', async () => {
    const { svc } = buildHarness();

    const result = await svc.getActionCatalog('client-1', 'tenant-1');
    const byKey = new Map(result.data.map((item) => [item.key, item]));

    for (const key of navigationKeys) {
      expect(byKey.get(key)).toMatchObject({ enabled: true, dangerLevel: 'low' });
      expect(byKey.get(key)?.href).toEqual(expect.stringContaining('/clients/client-1'));
    }
  });

  it('keeps future write actions disabled with explicit reasons', async () => {
    const { svc } = buildHarness();

    const result = await svc.getActionCatalog('client-1', 'tenant-1');
    const byKey = new Map(result.data.map((item) => [item.key, item]));

    for (const key of futureWriteKeys) {
      expect(byKey.get(key)?.enabled).toBe(false);
      expect(byKey.get(key)?.disabledReason).toEqual(expect.any(String));
      expect(byKey.get(key)?.requiredState).toEqual(expect.any(String));
      expect(byKey.get(key)?.href).toBeUndefined();
    }
  });

  it('does not perform mutation, audit, timeline, notification creation, or dispatch side effects', async () => {
    const { svc, prisma, audit } = buildHarness();

    await svc.getActionCatalog('client-1', 'tenant-1');

    expect(prisma.client.create).not.toHaveBeenCalled();
    expect(prisma.client.update).not.toHaveBeenCalled();
    expect(prisma.client.updateMany).not.toHaveBeenCalled();
    expect(prisma.clientNotification.create).not.toHaveBeenCalled();
    expect(prisma.clientNotification.update).not.toHaveBeenCalled();
    expect(prisma.clientNotification.findMany).not.toHaveBeenCalled();
    expect(prisma.clientIntakeSubmission.findMany).not.toHaveBeenCalled();
    expect(prisma.clientIntakeLink.create).not.toHaveBeenCalled();
    expect(prisma.clientIntakeLink.update).not.toHaveBeenCalled();
    expect(prisma.poaExpiryNotificationDelivery.create).not.toHaveBeenCalled();
    expect(prisma.poaExpiryNotificationDelivery.update).not.toHaveBeenCalled();
    expect(prisma.poaExpiryNotificationDelivery.updateMany).not.toHaveBeenCalled();
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(prisma.task.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('does not expose fallback/demo data or no-touch domain actions', async () => {
    const { svc } = buildHarness();

    const result = await svc.getActionCatalog('client-1', 'tenant-1');
    const serialized = JSON.stringify(result).toLowerCase();
    const keys = result.data.map((item) => item.key).join('|');

    expect(serialized).not.toContain('demo');
    expect(serialized).not.toContain('fallback');
    expect(keys).not.toMatch(/accounting|payment|kasa|settlement|debtor|uyap|icrabot/i);
  });
});
