import { NotFoundException } from '@nestjs/common';
import { ClientService } from '../client.service';

const d = (value: string) => new Date(value);
const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

function buildHarness(opts: {
  client?: any;
  poas?: any[];
  latestSubmission?: any | null;
  latestLink?: any | null;
  latestNotification?: any | null;
  latestDeliveryIssue?: any | null;
  openTasks?: any[];
} = {}) {
  const prisma: any = {
    client: {
      findFirst: jest
        .fn()
        .mockResolvedValue(Object.prototype.hasOwnProperty.call(opts, 'client') ? opts.client : { id: 'client-1', phone: '555', email: 'a@b.test', contactFollowUpStatus: null }),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    clientPowerOfAttorney: {
      findMany: jest.fn().mockResolvedValue(opts.poas ?? [{ id: 'poa-1', status: 'ACTIVE', validUntil: daysFromNow(90) }]),
      create: jest.fn(),
      update: jest.fn(),
    },
    clientIntakeSubmission: {
      findFirst: jest.fn().mockResolvedValue(Object.prototype.hasOwnProperty.call(opts, 'latestSubmission') ? opts.latestSubmission : null),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    clientIntakeLink: {
      findFirst: jest.fn().mockResolvedValue(Object.prototype.hasOwnProperty.call(opts, 'latestLink') ? opts.latestLink : null),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    clientNotification: {
      findFirst: jest.fn().mockResolvedValue(Object.prototype.hasOwnProperty.call(opts, 'latestNotification') ? opts.latestNotification : null),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    clientIntakeLinkDelivery: {
      findFirst: jest.fn().mockResolvedValue(Object.prototype.hasOwnProperty.call(opts, 'latestDeliveryIssue') ? opts.latestDeliveryIssue : null),
      create: jest.fn(),
      update: jest.fn(),
    },
    task: {
      findMany: jest.fn().mockResolvedValue(opts.openTasks ?? []),
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

describe('ClientService.getOperatingSnapshot', () => {
  it('returns a healthy snapshot after tenant-scoped client validation', async () => {
    const { svc, prisma } = buildHarness();

    const result = await svc.getOperatingSnapshot('client-1', 'tenant-1');

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: 'client-1', tenantId: 'tenant-1', isActive: true },
      select: { id: true, phone: true, email: true, contactFollowUpStatus: true },
    });
    expect(prisma.clientPowerOfAttorney.findMany.mock.calls[0][0].where).toEqual({ clientId: 'client-1', isActive: true });
    expect(prisma.clientIntakeSubmission.findFirst.mock.calls[0][0].where).toEqual({ tenantId: 'tenant-1', clientId: 'client-1' });
    expect(prisma.clientIntakeLink.findFirst.mock.calls[0][0].where).toEqual({ tenantId: 'tenant-1', clientId: 'client-1' });
    expect(prisma.clientNotification.findFirst.mock.calls[0][0].where).toEqual({ tenantId: 'tenant-1', clientId: 'client-1' });
    const deliveryWhere = prisma.clientIntakeLinkDelivery.findFirst.mock.calls[0][0].where;
    expect(deliveryWhere).toMatchObject({ tenantId: 'tenant-1', clientId: 'client-1' });
    expect(deliveryWhere.OR).toEqual(expect.arrayContaining([
      { status: 'FAILED' },
      { status: 'PENDING', updatedAt: { lt: expect.any(Date) } },
      { status: 'SENDING', updatedAt: { lt: expect.any(Date) } },
    ]));
    expect(JSON.stringify(deliveryWhere.OR)).not.toContain('SENT');
    expect(prisma.task.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 'tenant-1', clientId: 'client-1', taskCategory: 'OPERATIONAL_COMPLETENESS' });
    expect(result.data).toMatchObject({
      clientId: 'client-1',
      health: 'healthy',
      riskLevel: 'low',
      contact: { status: 'complete', openTaskCount: 0, overdueTaskCount: 0 },
      poa: { status: 'active', activeCount: 1 },
      intake: { status: 'none' },
      notification: { status: 'none' },
      signals: [],
    });
  });

  it('returns 404 when the client is missing, inactive, or outside the tenant boundary', async () => {
    const { svc, prisma } = buildHarness({ client: null });

    await expect(svc.getOperatingSnapshot('cross-tenant-client', 'tenant-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.clientPowerOfAttorney.findMany).not.toHaveBeenCalled();
    expect(prisma.clientIntakeSubmission.findFirst).not.toHaveBeenCalled();
    expect(prisma.clientIntakeLink.findFirst).not.toHaveBeenCalled();
    expect(prisma.clientNotification.findFirst).not.toHaveBeenCalled();
    expect(prisma.clientIntakeLinkDelivery.findFirst).not.toHaveBeenCalled();
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });

  it('surfaces contact, POA, intake, notification, and overdue task risk without raw details', async () => {
    const { svc } = buildHarness({
      client: { id: 'client-1', phone: '', email: null, contactFollowUpStatus: 'ACTIVE' },
      poas: [{ id: 'poa-old', status: 'EXPIRED', validUntil: d('2024-01-01T00:00:00.000Z') }],
      latestSubmission: {
        id: 'sub-1',
        status: 'CLIENT_SUBMITTED',
        submittedAt: d('2026-01-01T10:00:00.000Z'),
        claimedAt: null,
        reviewedAt: null,
        createdAt: d('2026-01-01T10:00:00.000Z'),
        caseId: 'case-1',
        sourceMeta: { rawIp: '127.0.0.1' },
      },
      latestLink: {
        id: 'link-1',
        status: 'ACTIVE',
        expiresAt: d('2026-02-01T00:00:00.000Z'),
        caseId: 'case-1',
        tokenHash: 'secret-token-hash',
      },
      latestNotification: {
        id: 'notif-1',
        status: 'FAILED',
        type: 'INTAKE_LINK',
        channel: 'EMAIL',
        sentAt: d('2026-01-02T10:00:00.000Z'),
        deliveredAt: null,
        createdAt: d('2026-01-02T09:00:00.000Z'),
        caseId: 'case-1',
        body: 'unsafe body',
        errorMessage: 'provider secret',
      },
      latestDeliveryIssue: {
        id: 'delivery-1',
        status: 'FAILED',
        channel: 'EMAIL',
        caseId: 'case-1',
        updatedAt: d('2026-01-02T10:05:00.000Z'),
        lastError: 'SMTP secret https://app.test/intake/raw-token',
        dedupeKey: 'secret-dedupe-key',
      },
      openTasks: [{ id: 'task-1', dueDate: daysFromNow(-1), escalationLevel: 'MANAGER', nextFollowUpAt: daysFromNow(-1), missingFields: ['phone'] }],
    });

    const result = await svc.getOperatingSnapshot('client-1', 'tenant-1');
    const signalKeys = result.data.signals.map((signal) => signal.key);
    const serialized = JSON.stringify(result);

    expect(result.data.health).toBe('blocked');
    expect(result.data.riskLevel).toBe('high');
    expect(result.data.contact).toMatchObject({ status: 'missing', missingFields: ['phone', 'email'], openTaskCount: 1, overdueTaskCount: 1, escalationLevel: 'MANAGER' });
    expect(result.data.poa).toMatchObject({ status: 'expired_or_inactive', activeCount: 0 });
    expect(result.data.intake).toMatchObject({ status: 'submitted', latestSubmission: { id: 'sub-1', caseId: 'case-1' } });
    expect(result.data.notification).toMatchObject({ status: 'failed', latest: { id: 'notif-1', type: 'INTAKE_LINK', channel: 'EMAIL' } });
    expect(signalKeys).toEqual(expect.arrayContaining([
      'contact.missing_info',
      'contact.follow_up_overdue',
      'poa.missing_or_inactive',
      'intake.pending_review',
      'intake.delivery_failed',
      'notification.failed',
    ]));
    expect(serialized).not.toContain('unsafe body');
    expect(serialized).not.toContain('provider secret');
    expect(serialized).not.toContain('SMTP secret');
    expect(serialized).not.toContain('raw-token');
    expect(serialized).not.toContain('secret-dedupe-key');
    expect(serialized).not.toContain('secret-token-hash');
    expect(serialized).not.toContain('rawIp');
  });

  it.each(['PENDING', 'SENDING'])('surfaces stale %s delivery as an attention signal without leaking delivery secrets', async (status) => {
    const { svc } = buildHarness({
      latestDeliveryIssue: {
        id: 'delivery-stuck',
        status,
        channel: 'EMAIL',
        caseId: 'case-1',
        updatedAt: daysFromNow(-1),
        lastError: 'provider secret https://app.test/intake/raw-token',
      },
    });

    const result = await svc.getOperatingSnapshot('client-1', 'tenant-1');
    const serialized = JSON.stringify(result);

    expect(result.data.health).toBe('attention');
    expect(result.data.riskLevel).toBe('medium');
    expect(result.data.signals).toContainEqual(expect.objectContaining({
      key: 'intake.delivery_stuck',
      severity: 'warning',
      actionKey: 'intake.link.create',
      target: { clientId: 'client-1', caseId: 'case-1' },
    }));
    expect(serialized).not.toContain('provider secret');
    expect(serialized).not.toContain('raw-token');
  });

  it('marks active POA as expiring when the nearest validUntil is within 30 days', async () => {
    const { svc } = buildHarness({
      poas: [{ id: 'poa-expiring', status: 'ACTIVE', validUntil: daysFromNow(5) }],
    });

    const result = await svc.getOperatingSnapshot('client-1', 'tenant-1');

    expect(result.data.health).toBe('attention');
    expect(result.data.riskLevel).toBe('medium');
    expect(result.data.poa.status).toBe('expiring');
    expect(result.data.signals.map((signal) => signal.key)).toContain('poa.expiring');
  });

  it('does not perform mutation, audit, timeline, notification creation, or dispatch side effects', async () => {
    const { svc, prisma, audit } = buildHarness();

    await svc.getOperatingSnapshot('client-1', 'tenant-1');

    expect(prisma.client.create).not.toHaveBeenCalled();
    expect(prisma.client.update).not.toHaveBeenCalled();
    expect(prisma.client.updateMany).not.toHaveBeenCalled();
    expect(prisma.clientPowerOfAttorney.create).not.toHaveBeenCalled();
    expect(prisma.clientPowerOfAttorney.update).not.toHaveBeenCalled();
    expect(prisma.clientNotification.create).not.toHaveBeenCalled();
    expect(prisma.clientNotification.update).not.toHaveBeenCalled();
    expect(prisma.clientNotification.findMany).not.toHaveBeenCalled();
    expect(prisma.clientIntakeSubmission.findMany).not.toHaveBeenCalled();
    expect(prisma.clientIntakeSubmission.create).not.toHaveBeenCalled();
    expect(prisma.clientIntakeSubmission.update).not.toHaveBeenCalled();
    expect(prisma.clientIntakeLink.create).not.toHaveBeenCalled();
    expect(prisma.clientIntakeLink.update).not.toHaveBeenCalled();
    expect(prisma.clientIntakeLinkDelivery.create).not.toHaveBeenCalled();
    expect(prisma.clientIntakeLinkDelivery.update).not.toHaveBeenCalled();
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(prisma.task.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('does not expose fallback/demo data or no-touch domain actions', async () => {
    const { svc } = buildHarness();

    const result = await svc.getOperatingSnapshot('client-1', 'tenant-1');
    const serialized = JSON.stringify(result).toLowerCase();

    expect(serialized).not.toContain('demo');
    expect(serialized).not.toContain('fallback');
    expect(serialized).not.toMatch(/accounting|payment|kasa|settlement|debtor|uyap|icrabot/);
  });
});