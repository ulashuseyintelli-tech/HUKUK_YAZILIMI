import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ClientController } from '../client.controller';
import { ClientService } from '../client.service';

const defaultClient = {
  id: 'validated-client',
  name: 'Acme Client',
  firstName: null,
  lastName: null,
  email: 'client@example.com',
  contacts: [],
  caseClients: [{ caseId: 'case-1' }],
};

const defaultCase = {
  id: 'case-1',
  fileNumber: 'F-2026-1',
  executionFileNumber: '2026/10',
  executionOffice: { name: 'Istanbul 1. Icra' },
};

function buildHarness(opts: { client?: any; relatedCase?: any; dispatch?: any; existing?: any; templateCount?: number } = {}) {
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
    clientDocumentRequest: {
      findFirst: jest.fn().mockResolvedValue(Object.prototype.hasOwnProperty.call(opts, 'existing') ? opts.existing : null),
      create: jest.fn().mockResolvedValue({ id: 'document-request-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    messageTemplate: {
      count: jest.fn().mockResolvedValue(opts.templateCount ?? 1),
    },
    clientNotification: { create: jest.fn(), update: jest.fn() },
    clientInfoRequest: { create: jest.fn(), update: jest.fn() },
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

describe('ClientService.sendDocumentRequest', () => {
  it('validates tenant/client/case, creates an artifact, dispatches with server-built tokens, and returns a safe response', async () => {
    const { svc, prisma, dispatcher } = buildHarness();

    const result = await svc.sendDocumentRequest(
      'requested-client',
      'tenant-1',
      'user-1',
      'idem-1',
      { documentCodes: ['GENEL_BELGE'], caseId: 'case-1' },
    );
    const serialized = JSON.stringify(result);

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: 'requested-client', tenantId: 'tenant-1', isActive: true },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        contacts: {
          where: { type: 'EMAIL' },
          take: 1,
          select: { id: true },
        },
        caseClients: {
          where: { case: { tenantId: 'tenant-1' } },
          orderBy: { createdAt: 'desc' },
          take: 2,
          select: { caseId: true },
        },
      },
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
    expect(prisma.clientDocumentRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        clientId: 'validated-client',
        caseId: 'case-1',
        requestedDocumentCodes: ['GENEL_BELGE'],
        templateCode: 'CLIENT_DOCUMENT_REQUEST_V1',
        idempotencyKey: 'idem-1',
        dedupeKey: 'CLIENT_WORKSPACE_DOCUMENT_REQUEST:validated-client:case-1:GENEL_BELGE:idem-1',
        channel: 'EMAIL',
        status: 'PENDING',
        createdById: 'user-1',
      }),
      select: { id: true },
    });
    expect(JSON.stringify(prisma.clientDocumentRequest.create.mock.calls[0][0].data)).not.toContain('client@example.com');
    expect(JSON.stringify(prisma.clientDocumentRequest.create.mock.calls[0][0].data)).not.toContain('body');
    expect(JSON.stringify(prisma.clientDocumentRequest.create.mock.calls[0][0].data)).not.toContain('provider');
    expect(dispatcher.dispatch).toHaveBeenCalledWith('tenant-1', 'user-1', expect.objectContaining({
      clientId: 'validated-client',
      caseId: 'case-1',
      templateCode: 'CLIENT_DOCUMENT_REQUEST_V1',
      type: 'DOCUMENT_REQUEST',
      refType: 'ClientWorkspaceDocumentRequest',
      refId: 'document-request-1',
      dedupeKey: 'CLIENT_WORKSPACE_DOCUMENT_REQUEST:validated-client:case-1:GENEL_BELGE:idem-1',
      tokens: expect.objectContaining({
        clientName: 'Acme Client',
        caseFileNumber: 'F-2026-1',
        executionFileNumber: '2026/10',
        executionOfficeName: 'Istanbul 1. Icra',
        requestedDocumentCodes: 'GENEL_BELGE',
        requestedDocumentLabels: 'Genel belge',
      }),
      persistedTokens: expect.objectContaining({ requestedDocumentLabels: 'Genel belge' }),
    }));
    expect(prisma.clientDocumentRequest.update).toHaveBeenLastCalledWith({
      where: { id: 'document-request-1' },
      data: { status: 'SENT', notificationId: 'notification-1', sentAt: expect.any(Date), lastError: null },
    });
    expect(result).toEqual({
      clientId: 'validated-client',
      caseId: 'case-1',
      documentCodes: ['GENEL_BELGE'],
      status: 'sent',
      documentRequestId: 'document-request-1',
      notificationId: 'notification-1',
    });
    expect(serialized).not.toContain('secret-dedupe');
    expect(serialized).not.toContain('client@example.com');
    expect(serialized).not.toContain('body');
    expect(serialized).not.toContain('provider');
  });

  it('uses the single tenant-bound related case when caseId is omitted', async () => {
    const { svc, prisma } = buildHarness();

    const result = await svc.sendDocumentRequest('client-1', 'tenant-1', 'user-1', 'idem-1', { documentCodes: ['DOSYA_EVRAKI'] });

    expect(prisma.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'case-1', tenantId: 'tenant-1', caseClients: { some: { clientId: 'validated-client' } } },
    }));
    expect(result.caseId).toBe('case-1');
  });

  it('requires Idempotency-Key and allowlisted document codes before dispatch or artifact creation', async () => {
    const { svc, prisma, dispatcher } = buildHarness();

    await expect(svc.sendDocumentRequest('client-1', 'tenant-1', 'user-1', '', { documentCodes: ['GENEL_BELGE'] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.sendDocumentRequest('client-1', 'tenant-1', 'user-1', 'idem-1', { documentCodes: ['UNSAFE' as any] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.sendDocumentRequest('client-1', 'tenant-1', 'user-1', 'idem-1', { documentCodes: [] as any })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.clientDocumentRequest.create).not.toHaveBeenCalled();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('returns the existing artifact idempotently when the same key and payload already exist', async () => {
    const { svc, prisma, dispatcher } = buildHarness({
      existing: {
        id: 'existing-request',
        clientId: 'validated-client',
        caseId: 'case-1',
        requestedDocumentCodes: ['GENEL_BELGE'],
        status: 'SENT',
        notificationId: 'notification-existing',
        dedupeKey: 'CLIENT_WORKSPACE_DOCUMENT_REQUEST:validated-client:case-1:GENEL_BELGE:idem-1',
      },
    });

    const result = await svc.sendDocumentRequest('client-1', 'tenant-1', 'user-1', 'idem-1', { documentCodes: ['GENEL_BELGE'], caseId: 'case-1' });

    expect(result).toEqual({
      clientId: 'validated-client',
      caseId: 'case-1',
      documentCodes: ['GENEL_BELGE'],
      status: 'sent',
      documentRequestId: 'existing-request',
      notificationId: 'notification-existing',
    });
    expect(prisma.clientDocumentRequest.create).not.toHaveBeenCalled();
    expect(prisma.clientDocumentRequest.update).not.toHaveBeenCalled();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('rejects reused Idempotency-Key with a different payload', async () => {
    const { svc, prisma, dispatcher } = buildHarness({
      existing: {
        id: 'existing-request',
        clientId: 'validated-client',
        caseId: 'case-1',
        requestedDocumentCodes: ['DOSYA_EVRAKI'],
        status: 'SENT',
        notificationId: 'notification-existing',
        dedupeKey: 'CLIENT_WORKSPACE_DOCUMENT_REQUEST:validated-client:case-1:DOSYA_EVRAKI:idem-1',
      },
    });

    await expect(svc.sendDocumentRequest('client-1', 'tenant-1', 'user-1', 'idem-1', { documentCodes: ['GENEL_BELGE'], caseId: 'case-1' })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.clientDocumentRequest.create).not.toHaveBeenCalled();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('returns 404 and does not dispatch when client or related case is outside tenant boundary', async () => {
    const missingClient = buildHarness({ client: null });
    await expect(missingClient.svc.sendDocumentRequest('cross-client', 'tenant-1', 'user-1', 'idem-1', { documentCodes: ['GENEL_BELGE'] })).rejects.toBeInstanceOf(NotFoundException);
    expect(missingClient.prisma.clientDocumentRequest.create).not.toHaveBeenCalled();
    expect(missingClient.dispatcher.dispatch).not.toHaveBeenCalled();

    const missingCase = buildHarness({ relatedCase: null });
    await expect(missingCase.svc.sendDocumentRequest('client-1', 'tenant-1', 'user-1', 'idem-1', { documentCodes: ['GENEL_BELGE'], caseId: 'cross-case' })).rejects.toBeInstanceOf(NotFoundException);
    expect(missingCase.prisma.clientDocumentRequest.create).not.toHaveBeenCalled();
    expect(missingCase.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('requires an unambiguous related case before creating the artifact', async () => {
    const noCase = buildHarness({ client: { ...defaultClient, caseClients: [] } });
    await expect(noCase.svc.sendDocumentRequest('client-1', 'tenant-1', 'user-1', 'idem-1', { documentCodes: ['GENEL_BELGE'] })).rejects.toBeInstanceOf(BadRequestException);
    expect(noCase.prisma.clientDocumentRequest.create).not.toHaveBeenCalled();

    const ambiguousCase = buildHarness({ client: { ...defaultClient, caseClients: [{ caseId: 'case-1' }, { caseId: 'case-2' }] } });
    await expect(ambiguousCase.svc.sendDocumentRequest('client-1', 'tenant-1', 'user-1', 'idem-1', { documentCodes: ['GENEL_BELGE'] })).rejects.toBeInstanceOf(BadRequestException);
    expect(ambiguousCase.prisma.clientDocumentRequest.create).not.toHaveBeenCalled();
  });

  it('does not leak provider raw error or dedupe data when dispatch fails', async () => {
    const { svc, prisma } = buildHarness({ dispatch: { status: 'failed', dedupeKey: 'secret-dedupe', error: 'SMTP token=raw-secret failed' } });

    const result = await svc.sendDocumentRequest('client-1', 'tenant-1', 'user-1', 'idem-1', { documentCodes: ['GENEL_BELGE'], caseId: 'case-1' });
    const serialized = JSON.stringify(result);

    expect(prisma.clientDocumentRequest.update).toHaveBeenLastCalledWith({
      where: { id: 'document-request-1' },
      data: { status: 'FAILED', lastError: 'Document request delivery failed.' },
    });
    expect(result).toEqual({
      clientId: 'validated-client',
      caseId: 'case-1',
      documentCodes: ['GENEL_BELGE'],
      status: 'failed',
      documentRequestId: 'document-request-1',
    });
    expect(serialized).not.toContain('secret-dedupe');
    expect(serialized).not.toContain('raw-secret');
    expect(serialized).not.toContain('SMTP');
  });

  it('does not create legacy info request, audit, timeline, queue, or generic executor side effects directly', async () => {
    const { svc, prisma, audit } = buildHarness();

    await svc.sendDocumentRequest('client-1', 'tenant-1', 'user-1', 'idem-1', { documentCodes: ['GENEL_BELGE'], caseId: 'case-1' });

    expect(prisma.clientDocumentRequest.create).toHaveBeenCalledTimes(1);
    expect(prisma.client.create).not.toHaveBeenCalled();
    expect(prisma.client.update).not.toHaveBeenCalled();
    expect(prisma.client.updateMany).not.toHaveBeenCalled();
    expect(prisma.clientNotification.create).not.toHaveBeenCalled();
    expect(prisma.clientNotification.update).not.toHaveBeenCalled();
    expect(prisma.clientInfoRequest.create).not.toHaveBeenCalled();
    expect(prisma.clientInfoRequest.update).not.toHaveBeenCalled();
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

describe('ClientController.sendDocumentRequest', () => {
  it('wraps the typed command response and forwards auth context plus Idempotency-Key', async () => {
    const service = { sendDocumentRequest: jest.fn().mockResolvedValue({ clientId: 'client-1', caseId: 'case-1', status: 'sent' }) };
    // C2-B02 R4: workspace komutları artık rol-gated — elevated USER aktörle çağrılır.
    const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(true) };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const controller = new ClientController(service as any, {} as any, {} as any, officeApproval as any, audit as any);

    const result = await controller.sendDocumentRequest(
      { user: { id: 'user-1', tenantId: 'tenant-1', role: 'USER' } } as any,
      'client-1',
      'idem-1',
      { documentCodes: ['GENEL_BELGE'], caseId: 'case-1' },
    );

    expect(service.sendDocumentRequest).toHaveBeenCalledWith('client-1', 'tenant-1', 'user-1', 'idem-1', { documentCodes: ['GENEL_BELGE'], caseId: 'case-1' });
    expect(result).toEqual({ data: { clientId: 'client-1', caseId: 'case-1', status: 'sent' } });
  });

  it('rejects raw body/tokens/recipient fields before reaching the service', async () => {
    const service = { sendDocumentRequest: jest.fn() };
    const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(true) };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const controller = new ClientController(service as any, {} as any, {} as any, officeApproval as any, audit as any);

    await expect(controller.sendDocumentRequest(
      { user: { id: 'user-1', tenantId: 'tenant-1', role: 'USER' } } as any,
      'client-1',
      'idem-1',
      { documentCodes: ['GENEL_BELGE'], body: 'raw', tokens: { unsafe: 'x' }, recipient: 'client@example.com', idempotencyKey: 'body-key' },
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(service.sendDocumentRequest).not.toHaveBeenCalled();
  });
});