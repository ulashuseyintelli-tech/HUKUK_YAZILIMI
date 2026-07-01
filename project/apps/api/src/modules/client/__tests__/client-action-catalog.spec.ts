import { NotFoundException } from '@nestjs/common';
import { ClientService, type ClientActionKey } from '../client.service';

const defaultClient = {
  id: 'client-1',
  phone: '5551112233',
  email: 'client@example.com',
  contactFollowUpStatus: null,
  _count: { cases: 1 },
};

function buildHarness(opts: { client?: any } = {}) {
  const prisma: any = {
    client: {
      findFirst: jest
        .fn()
        .mockResolvedValue(Object.prototype.hasOwnProperty.call(opts, 'client') ? opts.client : defaultClient),
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

const noTouchDomainPattern = /accounting|payment|kasa|settlement|debtor|uyap|icrabot/i;

describe('ClientService.getActionCatalog', () => {
  it('returns the V1 action catalog after tenant-scoped client validation', async () => {
    const { svc, prisma } = buildHarness();

    const result = await svc.getActionCatalog('client-1', 'tenant-1');

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: 'client-1', tenantId: 'tenant-1', isActive: true },
      select: {
        id: true,
        phone: true,
        email: true,
        contactFollowUpStatus: true,
        _count: { select: { cases: true } },
      },
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

  it('uses the validated client id and does not leak tenant identifiers into action targets or reasons', async () => {
    const { svc } = buildHarness({ client: { ...defaultClient, id: 'validated-client' } });

    const result = await svc.getActionCatalog('requested-client', 'tenant-secret');
    const serialized = JSON.stringify(result);

    expect(result.data.every((item) => item.target?.clientId === 'validated-client')).toBe(true);
    expect(serialized).not.toContain('requested-client');
    expect(serialized).not.toContain('tenant-secret');
  });

  it('enables safe navigation/link actions when their state allows it', async () => {
    const { svc } = buildHarness();

    const result = await svc.getActionCatalog('client-1', 'tenant-1');
    const byKey = new Map(result.data.map((item) => [item.key, item]));

    for (const key of navigationKeys) {
      expect(byKey.get(key)).toMatchObject({ enabled: true, dangerLevel: 'low' });
      expect(byKey.get(key)?.href).toEqual(expect.stringContaining('/clients/client-1'));
      expect(byKey.get(key)?.disabledReason).toBeUndefined();
    }
    expect(byKey.get('contact.update_missing_info')?.requiredState).toBe('CONTACT_INFO_COMPLETE');
    expect(byKey.get('case.open_related')?.requiredState).toBe('RELATED_CASE_AVAILABLE');
  });

  it('returns domain-disabled actions as visible disabled items with explicit reasons', async () => {
    const { svc } = buildHarness({ client: { ...defaultClient, _count: { cases: 0 } } });

    const result = await svc.getActionCatalog('client-1', 'tenant-1');
    const caseAction = result.data.find((item) => item.key === 'case.open_related');

    expect(caseAction).toMatchObject({
      enabled: false,
      visibility: 'visible',
      requiredState: 'RELATED_CASE_EMPTY',
      disabledReason: 'No related cases are linked to this client yet.',
    });
    expect(caseAction?.href).toBeUndefined();
  });

  it('keeps future write actions disabled with standardized explicit reasons', async () => {
    const { svc } = buildHarness();

    const result = await svc.getActionCatalog('client-1', 'tenant-1');
    const byKey = new Map(result.data.map((item) => [item.key, item]));

    for (const key of futureWriteKeys) {
      expect(byKey.get(key)?.enabled).toBe(false);
      expect(byKey.get(key)?.visibility).toBe('visible');
      expect(byKey.get(key)?.disabledReason).toEqual(expect.any(String));
      expect(byKey.get(key)?.disabledReason?.trim()).not.toEqual('');
      expect(byKey.get(key)?.requiredState).toEqual(expect.any(String));
      expect(byKey.get(key)?.href).toBeUndefined();
    }
  });

  it('omits role-forbidden actions instead of returning disabled leakage', async () => {
    const { svc } = buildHarness();

    const result = await svc.getActionCatalog('client-1', 'tenant-1', 'VIEWER');
    const keys = result.data.map((item) => item.key);
    const serialized = JSON.stringify(result);

    expect(keys).toEqual(['case.open_related', 'activity.view_timeline']);
    expect(result.data.every((item) => item.visibility === 'visible')).toBe(true);
    expect(serialized).not.toContain('forbidden');
    expect(serialized).not.toContain('Intake link creation requires');
    expect(serialized).not.toContain('Template notification requires');
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
    expect(serialized).not.toMatch(noTouchDomainPattern);
    expect(keys).not.toMatch(noTouchDomainPattern);
  });
});