import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClientService } from '../client.service';

const d = (value: string) => new Date(value);

function buildHarness(opts: { client?: any; notifications?: any[]; submissions?: any[] } = {}) {
  const prisma: any = {
    client: {
      findFirst: jest.fn().mockResolvedValue(Object.prototype.hasOwnProperty.call(opts, 'client') ? opts.client : { id: 'client-1' }),
    },
    clientNotification: {
      findMany: jest.fn().mockResolvedValue(opts.notifications ?? []),
    },
    clientIntakeSubmission: {
      findMany: jest.fn().mockResolvedValue(opts.submissions ?? []),
    },
  };
  const audit = { logInTransaction: jest.fn(), log: jest.fn() };
  const svc = new ClientService(prisma, audit as any, {} as any);
  return { svc, prisma };
}

const notification = (overrides: Record<string, any> = {}) => ({
  id: 'n1',
  type: 'GENEL_BILGILENDIRME',
  channel: 'EMAIL',
  subject: 'Status update',
  status: 'SENT',
  sentAt: d('2026-01-02T10:00:00.000Z'),
  deliveredAt: null,
  createdAt: d('2026-01-02T09:59:00.000Z'),
  caseId: 'case-1',
  body: 'unsafe body must not leak',
  errorMessage: 'unsafe provider detail must not leak',
  metadata: { token: 'secret' },
  ...overrides,
});

const submission = (overrides: Record<string, any> = {}) => ({
  id: 's1',
  status: 'CLIENT_SUBMITTED',
  submittedAt: d('2026-01-01T10:00:00.000Z'),
  claimedAt: null,
  reviewedAt: null,
  createdAt: d('2026-01-01T10:00:00.000Z'),
  caseId: 'case-1',
  sourceMeta: { rawIp: '127.0.0.1' },
  ...overrides,
});

describe('ClientService.getTimeline', () => {
  it('validates client inside tenant before reading source rows', async () => {
    const { svc, prisma } = buildHarness();

    await svc.getTimeline('client-1', 'tenant-1');

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: 'client-1', tenantId: 'tenant-1', isActive: true },
      select: { id: true },
    });
    expect(prisma.clientNotification.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 'tenant-1',
      clientId: 'client-1',
    });
    expect(prisma.clientIntakeSubmission.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 'tenant-1',
      clientId: 'client-1',
    });
  });

  it('returns 404 when client is not owned by tenant or inactive', async () => {
    const { svc, prisma } = buildHarness({ client: null });

    await expect(svc.getTimeline('missing', 'tenant-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.clientNotification.findMany).not.toHaveBeenCalled();
    expect(prisma.clientIntakeSubmission.findMany).not.toHaveBeenCalled();
  });

  it('filters requested sources', async () => {
    const { svc, prisma } = buildHarness({ notifications: [notification()] });

    const result = await svc.getTimeline('client-1', 'tenant-1', { sources: 'client_notification' });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].source).toBe('client_notification');
    expect(prisma.clientNotification.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.clientIntakeSubmission.findMany).not.toHaveBeenCalled();
  });

  it('sorts by occurredAt desc with deterministic tie-breakers', async () => {
    const { svc } = buildHarness({
      notifications: [
        notification({ id: 'n-a', sentAt: d('2026-01-02T10:00:00.000Z') }),
        notification({ id: 'n-z', sentAt: d('2026-01-02T10:00:00.000Z') }),
      ],
      submissions: [submission({ id: 's-new', submittedAt: d('2026-01-03T10:00:00.000Z') })],
    });

    const result = await svc.getTimeline('client-1', 'tenant-1');

    expect(result.data.map((item) => item.id)).toEqual(['s-new', 'n-z', 'n-a']);
  });

  it('paginates with opaque cursor and validates max limit', async () => {
    const { svc } = buildHarness({
      notifications: [
        notification({ id: 'n3', sentAt: d('2026-01-03T00:00:00.000Z') }),
        notification({ id: 'n2', sentAt: d('2026-01-02T00:00:00.000Z') }),
        notification({ id: 'n1', sentAt: d('2026-01-01T00:00:00.000Z') }),
      ],
    });

    const first = await svc.getTimeline('client-1', 'tenant-1', { limit: '2', sources: 'client_notification' });
    expect(first.data.map((item) => item.id)).toEqual(['n3', 'n2']);
    expect(first.pageInfo).toMatchObject({ hasNextPage: true, limit: 2 });
    expect(first.pageInfo.nextCursor).toEqual(expect.any(String));

    const second = await svc.getTimeline('client-1', 'tenant-1', {
      limit: '2',
      sources: 'client_notification',
      cursor: first.pageInfo.nextCursor!,
    });
    expect(second.data.map((item) => item.id)).toEqual(['n1']);
    expect(second.pageInfo.hasNextPage).toBe(false);

    await expect(svc.getTimeline('client-1', 'tenant-1', { limit: '101' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.getTimeline('client-1', 'tenant-1', { limit: '0' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown source and invalid cursor with 400', async () => {
    const { svc } = buildHarness();

    await expect(svc.getTimeline('client-1', 'tenant-1', { sources: 'raw_audit' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.getTimeline('client-1', 'tenant-1', { cursor: 'not-a-cursor' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not leak unsafe notification body, raw metadata, token fields, or intake sourceMeta', async () => {
    const { svc } = buildHarness({
      notifications: [notification()],
      submissions: [submission()],
    });

    const result = await svc.getTimeline('client-1', 'tenant-1');
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('unsafe body must not leak');
    expect(serialized).not.toContain('unsafe provider detail must not leak');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('rawIp');
    expect(serialized).not.toContain('tokenHash');
    expect(result.data.every((item) => Object.prototype.hasOwnProperty.call(item, 'metadataSafe') ? item.metadataSafe !== null : true)).toBe(true);
  });

  it('characterizes intake link mail as ClientNotification only; no extra intake lifecycle duplicate is synthesized', async () => {
    const { svc } = buildHarness({
      notifications: [notification({ id: 'mail-1', type: 'INTAKE_LINK', subject: 'Intake link' })],
      submissions: [],
    });

    const result = await svc.getTimeline('client-1', 'tenant-1');

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'mail-1',
      source: 'client_notification',
      eventType: 'NOTIFICATION_SENT',
    });
  });
});