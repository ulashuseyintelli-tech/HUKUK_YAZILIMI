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
  latestTemplateNotification?: any | null;
  latestDocumentRequest?: any | null;
  latestDeliveryIssue?: any | null;
  poaDeliveries?: any[];
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
      findFirst: jest.fn((args: any) => {
        if (args?.where?.type) {
          return Promise.resolve(Object.prototype.hasOwnProperty.call(opts, 'latestTemplateNotification') ? opts.latestTemplateNotification : null);
        }
        return Promise.resolve(Object.prototype.hasOwnProperty.call(opts, 'latestNotification') ? opts.latestNotification : null);
      }),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    clientIntakeLinkDelivery: {
      findFirst: jest.fn().mockResolvedValue(Object.prototype.hasOwnProperty.call(opts, 'latestDeliveryIssue') ? opts.latestDeliveryIssue : null),
      create: jest.fn(),
      update: jest.fn(),
    },
    clientDocumentRequest: {
      findFirst: jest.fn().mockResolvedValue(Object.prototype.hasOwnProperty.call(opts, 'latestDocumentRequest') ? opts.latestDocumentRequest : null),
      create: jest.fn(),
      update: jest.fn(),
    },
    poaExpiryNotificationDelivery: {
      findMany: jest.fn().mockResolvedValue(opts.poaDeliveries ?? []),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
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
    expect(prisma.clientPowerOfAttorney.findMany.mock.calls[0][0].select).toEqual({ id: true, status: true, isLimited: true, validUntil: true });
    expect(prisma.clientIntakeSubmission.findFirst.mock.calls[0][0].where).toEqual({ tenantId: 'tenant-1', clientId: 'client-1' });
    expect(prisma.clientIntakeLink.findFirst.mock.calls[0][0].where).toEqual({ tenantId: 'tenant-1', clientId: 'client-1' });
    expect(prisma.clientNotification.findFirst.mock.calls[0][0].where).toEqual({ tenantId: 'tenant-1', clientId: 'client-1' });
    expect(prisma.clientNotification.findFirst.mock.calls[1][0].where).toMatchObject({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      channel: 'EMAIL',
      type: { in: ['GENEL_BILGILENDIRME', 'DOSYA_DURUMU'] },
    });
    expect(prisma.clientDocumentRequest.findFirst.mock.calls[0][0].where).toEqual({ tenantId: 'tenant-1', clientId: 'client-1' });
    expect(prisma.clientDocumentRequest.findFirst.mock.calls[0][0].select).not.toEqual(expect.objectContaining({ dedupeKey: true, lastError: true }));
    const deliveryWhere = prisma.clientIntakeLinkDelivery.findFirst.mock.calls[0][0].where;
    expect(deliveryWhere).toMatchObject({ tenantId: 'tenant-1', clientId: 'client-1' });
    expect(deliveryWhere.OR).toEqual(expect.arrayContaining([
      { status: 'FAILED' },
      { status: 'PENDING', updatedAt: { lt: expect.any(Date) } },
      { status: 'SENDING', updatedAt: { lt: expect.any(Date) } },
    ]));
    expect(JSON.stringify(deliveryWhere.OR)).not.toContain('SENT');
    expect(prisma.task.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 'tenant-1', clientId: 'client-1', taskCategory: 'OPERATIONAL_COMPLETENESS' });
    expect(prisma.poaExpiryNotificationDelivery.findMany).not.toHaveBeenCalled();
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
    expect(prisma.clientDocumentRequest.findFirst).not.toHaveBeenCalled();
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
      poas: [{ id: 'poa-expiring', status: 'ACTIVE', isLimited: true, validUntil: daysFromNow(5) }],
    });

    const result = await svc.getOperatingSnapshot('client-1', 'tenant-1');

    expect(result.data.health).toBe('attention');
    expect(result.data.riskLevel).toBe('medium');
    expect(result.data.poa.status).toBe('expiring');
    expect(result.data.signals.map((signal) => signal.key)).toContain('poa.expiring');
  });

  it('keeps POA expiring risk while surfacing a safe current-window sent reminder signal', async () => {
    const { svc, prisma } = buildHarness({
      poas: [{ id: 'poa-expiring', status: 'ACTIVE', isLimited: true, validUntil: daysFromNow(5) }],
      poaDeliveries: [{
        status: 'SENT',
        attempts: 1,
        sentAt: new Date(),
        poaId: 'poa-expiring',
        dedupeKey: 'secret-dedupe',
        recipientEmail: 'recipient@example.test',
        lastError: 'provider secret',
      }],
    });

    const result = await svc.getOperatingSnapshot('client-1', 'tenant-1');
    const serialized = JSON.stringify(result);

    expect(result.data.health).toBe('attention');
    expect(result.data.riskLevel).toBe('medium');
    expect(result.data.poa.status).toBe('expiring');
    expect(result.data.signals).toContainEqual(expect.objectContaining({
      key: 'poa.expiring',
      severity: 'warning',
      actionKey: 'poa.reminder.send',
      target: { clientId: 'client-1' },
    }));
    expect(result.data.signals).toContainEqual(expect.objectContaining({
      key: 'poa.reminder_sent',
      severity: 'info',
      actionKey: 'poa.reminder.send',
      target: { clientId: 'client-1' },
    }));
    expect(prisma.poaExpiryNotificationDelivery.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-1', clientId: 'client-1', poaId: { in: ['poa-expiring'] }, windowKey: 'D30' }),
      select: expect.not.objectContaining({ poaId: true, dedupeKey: true, recipientEmail: true, lastError: true }),
    }));
    expect(serialized).not.toContain('poa-expiring');
    expect(serialized).not.toContain('secret-dedupe');
    expect(serialized).not.toContain('recipient@example.test');
    expect(serialized).not.toContain('provider secret');
  });

  it.each([
    ['retry waiting', { status: 'FAILED', attempts: 1, nextRetryAt: new Date(Date.now() + 60 * 60 * 1000) }],
    ['max attempts', { status: 'FAILED', attempts: 3, nextRetryAt: null }],
  ])('surfaces %s POA reminder delivery as a safe warning signal', async (_label, delivery) => {
    const { svc } = buildHarness({
      poas: [{ id: 'poa-expiring', status: 'ACTIVE', isLimited: true, validUntil: daysFromNow(5) }],
      poaDeliveries: [delivery],
    });

    const result = await svc.getOperatingSnapshot('client-1', 'tenant-1');

    expect(result.data.health).toBe('attention');
    expect(result.data.riskLevel).toBe('medium');
    expect(result.data.signals).toContainEqual(expect.objectContaining({
      key: 'poa.reminder_delivery_failed',
      severity: 'warning',
      actionKey: 'poa.reminder.send',
      target: { clientId: 'client-1' },
    }));
  });

  it.each([
    ['sent template notification', { latestTemplateNotification: { id: 'notif-template-sent', status: 'SENT', caseId: 'case-1', createdAt: new Date(), updatedAt: new Date(), dedupeKey: 'secret-dedupe', body: 'unsafe body' } }, 'notification.template_sent', 'info'],
    ['failed template notification', { latestTemplateNotification: { id: 'notif-template-failed', status: 'FAILED', caseId: 'case-1', createdAt: new Date(), updatedAt: new Date(), errorMessage: 'provider raw error', dedupeKey: 'secret-dedupe' } }, 'notification.template_failed', 'warning'],
    ['sent document request', { latestDocumentRequest: { id: 'doc-request-sent', status: 'SENT', caseId: 'case-1', sentAt: new Date(), createdAt: new Date(), updatedAt: new Date(), dedupeKey: 'secret-dedupe', lastError: 'provider raw error' } }, 'document.request_sent', 'info'],
    ['failed document request', { latestDocumentRequest: { id: 'doc-request-failed', status: 'FAILED', caseId: 'case-1', createdAt: new Date(), updatedAt: new Date(), dedupeKey: 'secret-dedupe', lastError: 'provider raw error' } }, 'document.request_failed', 'warning'],
  ])('surfaces safe follow-up signal for %s without leaking raw delivery details', async (_label, opts, expectedKey, expectedSeverity) => {
    const { svc } = buildHarness(opts as any);

    const result = await svc.getOperatingSnapshot('client-1', 'tenant-1');
    const serialized = JSON.stringify(result);

    expect(result.data.signals).toContainEqual(expect.objectContaining({
      key: expectedKey,
      severity: expectedSeverity,
      target: { clientId: 'client-1', caseId: 'case-1' },
    }));
    expect(serialized).not.toContain('secret-dedupe');
    expect(serialized).not.toContain('provider raw error');
    expect(serialized).not.toContain('unsafe body');
  });

  it.each([
    ['fresh pending document request', { status: 'PENDING', updatedAt: new Date() }, 'document.request_pending', 'info'],
    ['stale sending document request', { status: 'SENDING', updatedAt: daysFromNow(-1) }, 'document.request_stuck', 'warning'],
    ['fresh pending template notification', { status: 'PENDING', updatedAt: new Date() }, 'notification.template_pending', 'info'],
    ['stale pending template notification', { status: 'PENDING', updatedAt: daysFromNow(-1) }, 'notification.template_pending', 'warning'],
  ])('classifies %s follow-up without exposing raw status payloads', async (_label, row, expectedKey, expectedSeverity) => {
    const opts = String(expectedKey).startsWith('document')
      ? { latestDocumentRequest: { id: 'doc-follow-up', caseId: 'case-1', createdAt: daysFromNow(-1), ...row } }
      : { latestTemplateNotification: { id: 'template-follow-up', caseId: 'case-1', createdAt: daysFromNow(-1), ...row } };
    const { svc } = buildHarness(opts);

    const result = await svc.getOperatingSnapshot('client-1', 'tenant-1');

    expect(result.data.signals).toContainEqual(expect.objectContaining({
      key: expectedKey,
      severity: expectedSeverity,
      target: { clientId: 'client-1', caseId: 'case-1' },
    }));
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
    expect(prisma.clientDocumentRequest.create).not.toHaveBeenCalled();
    expect(prisma.clientDocumentRequest.update).not.toHaveBeenCalled();
    expect(prisma.clientIntakeSubmission.findMany).not.toHaveBeenCalled();
    expect(prisma.clientIntakeSubmission.create).not.toHaveBeenCalled();
    expect(prisma.clientIntakeSubmission.update).not.toHaveBeenCalled();
    expect(prisma.clientIntakeLink.create).not.toHaveBeenCalled();
    expect(prisma.clientIntakeLink.update).not.toHaveBeenCalled();
    expect(prisma.clientIntakeLinkDelivery.create).not.toHaveBeenCalled();
    expect(prisma.clientIntakeLinkDelivery.update).not.toHaveBeenCalled();
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

    const result = await svc.getOperatingSnapshot('client-1', 'tenant-1');
    const serialized = JSON.stringify(result).toLowerCase();

    expect(serialized).not.toContain('demo');
    expect(serialized).not.toContain('fallback');
    expect(serialized).not.toMatch(/accounting|payment|kasa|settlement|debtor|uyap|icrabot/);
  });
});