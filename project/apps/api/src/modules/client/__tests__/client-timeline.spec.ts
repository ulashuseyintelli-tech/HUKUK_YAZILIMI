import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClientService } from '../client.service';

const d = (value: string) => new Date(value);

function buildHarness(
  opts: {
    client?: any;
    notifications?: any[];
    submissions?: any[];
    intakeDeliveries?: any[];
    documentRequests?: any[];
    poaDeliveries?: any[];
  } = {},
) {
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
    clientIntakeLinkDelivery: {
      findMany: jest.fn().mockResolvedValue(opts.intakeDeliveries ?? []),
    },
    clientDocumentRequest: {
      findMany: jest.fn().mockResolvedValue(opts.documentRequests ?? []),
    },
    poaExpiryNotificationDelivery: {
      findMany: jest.fn().mockResolvedValue(opts.poaDeliveries ?? []),
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

const intakeDelivery = (overrides: Record<string, any> = {}) => ({
  id: 'ild-1',
  channel: 'EMAIL',
  status: 'FAILED',
  caseId: 'case-1',
  notificationId: 'n-delivery',
  attemptCount: 2,
  createdAt: d('2026-01-04T09:00:00.000Z'),
  updatedAt: d('2026-01-04T09:10:00.000Z'),
  idempotencyKey: 'unsafe-idempotency-key',
  dedupeKey: 'unsafe-delivery-dedupe',
  lastError: 'unsafe provider delivery error',
  rawToken: 'unsafe-raw-token',
  intakeUrl: 'https://unsafe.example.test/intake',
  ...overrides,
});

const documentRequest = (overrides: Record<string, any> = {}) => ({
  id: 'doc-1',
  requestedDocumentCodes: ['KIMLIK', 'VEKALETNAME'],
  templateCode: 'CLIENT_DOCUMENT_REQUEST_V1',
  channel: 'EMAIL',
  status: 'SENT',
  caseId: 'case-1',
  notificationId: 'n-doc',
  attemptCount: 1,
  sentAt: d('2026-01-05T10:00:00.000Z'),
  createdAt: d('2026-01-05T09:55:00.000Z'),
  updatedAt: d('2026-01-05T10:00:00.000Z'),
  idempotencyKey: 'unsafe-doc-idempotency-key',
  dedupeKey: 'unsafe-doc-dedupe',
  lastError: 'unsafe provider document error',
  recipientEmail: 'client@example.test',
  body: 'unsafe rendered document body',
  providerPayload: { messageId: 'unsafe-provider-message' },
  ...overrides,
});

const poaDelivery = (overrides: Record<string, any> = {}) => ({
  id: 'poa-del-1',
  status: 'FAILED',
  windowKey: 'D30',
  attempts: 3,
  sentAt: null,
  lastAttemptAt: d('2026-01-06T10:00:00.000Z'),
  createdAt: d('2026-01-06T09:50:00.000Z'),
  updatedAt: d('2026-01-06T10:00:00.000Z'),
  poaId: 'poa-1',
  recipientEmail: 'lawyer@example.test',
  dedupeKey: 'unsafe-poa-dedupe',
  lastError: 'unsafe provider poa error',
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
    expect(prisma.clientIntakeLinkDelivery.findMany).not.toHaveBeenCalled();
    expect(prisma.clientDocumentRequest.findMany).not.toHaveBeenCalled();
    expect(prisma.poaExpiryNotificationDelivery.findMany).not.toHaveBeenCalled();
  });

  it('returns 404 when client is not owned by tenant or inactive', async () => {
    const { svc, prisma } = buildHarness({ client: null });

    await expect(svc.getTimeline('missing', 'tenant-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.clientNotification.findMany).not.toHaveBeenCalled();
    expect(prisma.clientIntakeSubmission.findMany).not.toHaveBeenCalled();
    expect(prisma.clientIntakeLinkDelivery.findMany).not.toHaveBeenCalled();
    expect(prisma.clientDocumentRequest.findMany).not.toHaveBeenCalled();
    expect(prisma.poaExpiryNotificationDelivery.findMany).not.toHaveBeenCalled();
  });

  it('filters requested sources', async () => {
    const { svc, prisma } = buildHarness({ notifications: [notification()] });

    const result = await svc.getTimeline('client-1', 'tenant-1', { sources: 'client_notification' });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].source).toBe('client_notification');
    expect(prisma.clientNotification.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.clientIntakeSubmission.findMany).not.toHaveBeenCalled();
    expect(prisma.clientIntakeLinkDelivery.findMany).not.toHaveBeenCalled();
    expect(prisma.clientDocumentRequest.findMany).not.toHaveBeenCalled();
    expect(prisma.poaExpiryNotificationDelivery.findMany).not.toHaveBeenCalled();
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

  it('returns safe V2 source items only when requested', async () => {
    const { svc, prisma } = buildHarness({
      intakeDeliveries: [intakeDelivery()],
      documentRequests: [documentRequest()],
      poaDeliveries: [poaDelivery()],
    });

    const result = await svc.getTimeline('client-1', 'tenant-1', {
      sources: 'client_intake_link_delivery,client_document_request,poa_expiry_notification_delivery',
    });

    expect(result.data.map((item) => item.source)).toEqual([
      'poa_expiry_notification_delivery',
      'client_document_request',
      'client_intake_link_delivery',
    ]);
    expect(prisma.clientNotification.findMany).not.toHaveBeenCalled();
    expect(prisma.clientIntakeSubmission.findMany).not.toHaveBeenCalled();
    expect(prisma.clientIntakeLinkDelivery.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 'tenant-1',
      clientId: 'client-1',
    });
    expect(prisma.clientDocumentRequest.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 'tenant-1',
      clientId: 'client-1',
    });
    expect(prisma.poaExpiryNotificationDelivery.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 'tenant-1',
      clientId: 'client-1',
    });
    expect(result.data[0]).toMatchObject({
      id: 'poa-del-1',
      eventType: 'POA_EXPIRY_NOTIFICATION_FAILED',
      status: 'FAILED',
      caseId: null,
      metadataSafe: { clientId: 'client-1', windowKey: 'D30', attempts: '3' },
    });
    expect(result.data[1]).toMatchObject({
      id: 'doc-1',
      eventType: 'DOCUMENT_REQUEST_SENT',
      status: 'SENT',
      caseId: 'case-1',
      metadataSafe: {
        channel: 'EMAIL',
        templateCode: 'CLIENT_DOCUMENT_REQUEST_V1',
        documentCodes: 'KIMLIK,VEKALETNAME',
        notificationId: 'n-doc',
        attemptCount: '1',
      },
    });
    expect(result.data[2]).toMatchObject({
      id: 'ild-1',
      eventType: 'INTAKE_LINK_DELIVERY_FAILED',
      status: 'FAILED',
      caseId: 'case-1',
      metadataSafe: { channel: 'EMAIL', notificationId: 'n-delivery', attemptCount: '2' },
    });
  });

  it('paginates V2 sources with the existing opaque cursor contract', async () => {
    const { svc } = buildHarness({
      documentRequests: [
        documentRequest({ id: 'doc-new', sentAt: d('2026-01-06T10:00:00.000Z') }),
        documentRequest({ id: 'doc-old', sentAt: d('2026-01-05T10:00:00.000Z') }),
      ],
    });

    const first = await svc.getTimeline('client-1', 'tenant-1', {
      limit: '1',
      sources: 'client_document_request',
    });
    expect(first.data.map((item) => item.id)).toEqual(['doc-new']);
    expect(first.pageInfo.hasNextPage).toBe(true);

    const second = await svc.getTimeline('client-1', 'tenant-1', {
      limit: '1',
      sources: 'client_document_request',
      cursor: first.pageInfo.nextCursor!,
    });
    expect(second.data.map((item) => item.id)).toEqual(['doc-old']);
    expect(second.pageInfo.hasNextPage).toBe(false);
  });

  it('rejects unknown source and invalid cursor with 400', async () => {
    const { svc } = buildHarness();

    await expect(svc.getTimeline('client-1', 'tenant-1', { sources: 'raw_audit' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.getTimeline('client-1', 'tenant-1', { cursor: 'not-a-cursor' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not leak unsafe V2 raw body, token, URL, recipient, provider payload, or dedupe fields', async () => {
    const { svc } = buildHarness({
      intakeDeliveries: [intakeDelivery()],
      documentRequests: [documentRequest()],
      poaDeliveries: [poaDelivery()],
    });

    const result = await svc.getTimeline('client-1', 'tenant-1', {
      sources: 'client_intake_link_delivery,client_document_request,poa_expiry_notification_delivery',
    });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('unsafe-idempotency-key');
    expect(serialized).not.toContain('unsafe-delivery-dedupe');
    expect(serialized).not.toContain('unsafe provider delivery error');
    expect(serialized).not.toContain('unsafe-raw-token');
    expect(serialized).not.toContain('https://unsafe.example.test/intake');
    expect(serialized).not.toContain('unsafe-doc-idempotency-key');
    expect(serialized).not.toContain('unsafe-doc-dedupe');
    expect(serialized).not.toContain('unsafe provider document error');
    expect(serialized).not.toContain('client@example.test');
    expect(serialized).not.toContain('unsafe rendered document body');
    expect(serialized).not.toContain('unsafe-provider-message');
    expect(serialized).not.toContain('lawyer@example.test');
    expect(serialized).not.toContain('unsafe-poa-dedupe');
    expect(serialized).not.toContain('unsafe provider poa error');
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