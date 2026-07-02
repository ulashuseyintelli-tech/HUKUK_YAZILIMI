import { NotFoundException } from '@nestjs/common';
import { ClientService, type ClientActionKey } from '../client.service';

const defaultClient = {
  id: 'client-1',
  phone: '5551112233',
  email: 'client@example.com',
  contactFollowUpStatus: null,
  caseClients: [{ caseId: 'case-1' }],
  powerOfAttorneys: [],
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
  const svc = new ClientService(prisma, audit as any, {} as any);
  return { svc, prisma, audit };
}

const futureWriteKeys: ClientActionKey[] = [
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
        caseClients: {
          where: { case: { tenantId: 'tenant-1' } },
          orderBy: { createdAt: 'desc' },
          take: 2,
          select: { caseId: true },
        },
        powerOfAttorneys: {
          where: { isActive: true },
          orderBy: [{ validUntil: 'asc' }, { createdAt: 'desc' }],
          take: 10,
          select: { status: true, isLimited: true, validUntil: true },
        },
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

  it('enables intake link create when exactly one tenant-bound related case is available', async () => {
    const { svc } = buildHarness();

    const result = await svc.getActionCatalog('client-1', 'tenant-1');
    const createAction = result.data.find((item) => item.key === 'intake.link.create');

    expect(createAction).toMatchObject({
      enabled: true,
      visibility: 'visible',
      requiredRole: 'USER',
      requiredState: 'INTAKE_CREATE_AVAILABLE',
      target: { clientId: 'client-1', caseId: 'case-1' },
    });
    expect(createAction?.disabledReason).toBeUndefined();
    expect(createAction?.href).toBeUndefined();
  });

  it('keeps intake link create domain-disabled when no related case is available', async () => {
    const { svc } = buildHarness({ client: { ...defaultClient, caseClients: [] } });

    const result = await svc.getActionCatalog('client-1', 'tenant-1');
    const createAction = result.data.find((item) => item.key === 'intake.link.create');

    expect(createAction).toMatchObject({
      enabled: false,
      visibility: 'visible',
      requiredState: 'RELATED_CASE_EMPTY',
      target: { clientId: 'client-1' },
      disabledReason: 'No related cases are linked to this client yet.',
    });
    expect(createAction?.target?.caseId).toBeUndefined();
  });

  it('keeps intake link create domain-disabled when case selection is ambiguous', async () => {
    const { svc } = buildHarness({
      client: { ...defaultClient, caseClients: [{ caseId: 'case-1' }, { caseId: 'case-2' }] },
    });

    const result = await svc.getActionCatalog('client-1', 'tenant-1');
    const createAction = result.data.find((item) => item.key === 'intake.link.create');

    expect(createAction).toMatchObject({
      enabled: false,
      visibility: 'visible',
      requiredState: 'INTAKE_CASE_SELECTION_REQUIRED',
      target: { clientId: 'client-1' },
      disabledReason: 'Select a related case before creating an intake link.',
    });
    expect(JSON.stringify(createAction)).not.toContain('case-1');
    expect(JSON.stringify(createAction)).not.toContain('case-2');
  });

  it('returns domain-disabled actions as visible disabled items with explicit reasons', async () => {
    const { svc } = buildHarness({ client: { ...defaultClient, caseClients: [] } });

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

  it('keeps remaining future write actions disabled with standardized explicit reasons', async () => {
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

  it('enables POA reminder only when an active limited POA expires within 30 days', async () => {
    const { svc } = buildHarness({
      client: {
        ...defaultClient,
        powerOfAttorneys: [{ status: 'ACTIVE', isLimited: true, validUntil: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) }],
      },
    });

    const result = await svc.getActionCatalog('client-1', 'tenant-1');
    const poaAction = result.data.find((item) => item.key === 'poa.reminder.send');

    expect(poaAction).toMatchObject({
      enabled: true,
      visibility: 'visible',
      requiredState: 'POA_EXPIRING_ACTIVE',
      target: { clientId: 'client-1' },
    });
    expect(poaAction?.disabledReason).toBeUndefined();
    expect(poaAction?.href).toBeUndefined();
  });

  it('keeps POA reminder disabled for missing, inactive, unlimited, or non-expiring POA state', async () => {
    const { svc } = buildHarness({
      client: {
        ...defaultClient,
        powerOfAttorneys: [
          { status: 'EXPIRED', isLimited: true, validUntil: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          { status: 'ACTIVE', isLimited: false, validUntil: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) },
          { status: 'ACTIVE', isLimited: true, validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) },
        ],
      },
    });

    const result = await svc.getActionCatalog('client-1', 'tenant-1');
    const poaAction = result.data.find((item) => item.key === 'poa.reminder.send');

    expect(poaAction).toMatchObject({
      enabled: false,
      visibility: 'visible',
      requiredState: 'POA_REMINDER_NOT_ELIGIBLE',
      disabledReason: 'POA reminder is available only for active limited powers of attorney expiring within 30 days.',
      target: { clientId: 'client-1' },
    });
  });
  it('omits role-forbidden actions instead of returning disabled leakage', async () => {
    const { svc } = buildHarness();

    const result = await svc.getActionCatalog('client-1', 'tenant-1', 'VIEWER');
    const keys = result.data.map((item) => item.key);
    const serialized = JSON.stringify(result);

    expect(keys).toEqual(['case.open_related', 'activity.view_timeline']);
    expect(result.data.every((item) => item.visibility === 'visible')).toBe(true);
    expect(serialized).not.toContain('forbidden');
    expect(serialized).not.toContain('Create intake link');
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