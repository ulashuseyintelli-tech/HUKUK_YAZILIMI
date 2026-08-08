import { NotFoundException } from '@nestjs/common';
import { CLIENT_TEMPLATE_NOTIFICATION_CODES, ClientService, type ClientActionKey } from '../client.service';

const defaultClient = {
  id: 'client-1',
  phone: '5551112233',
  email: 'client@example.com',
  contactFollowUpStatus: null,
  caseClients: [{ caseId: 'case-1' }],
  powerOfAttorneys: [],
};

function buildHarness(opts: { client?: any; deliveries?: any[]; dispatcher?: any; templateCount?: number; documentTemplateCount?: number; latestTemplateNotification?: any | null; latestDocumentRequest?: any | null } = {}) {
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
      findFirst: jest.fn().mockResolvedValue(Object.prototype.hasOwnProperty.call(opts, 'latestTemplateNotification') ? opts.latestTemplateNotification : null),
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
      findMany: jest.fn().mockResolvedValue(opts.deliveries ?? []),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    messageTemplate: {
      count: jest.fn((args: any) => {
        if (args?.where?.code === 'CLIENT_DOCUMENT_REQUEST_V1') return Promise.resolve(opts.documentTemplateCount ?? 1);
        return Promise.resolve(opts.templateCount ?? CLIENT_TEMPLATE_NOTIFICATION_CODES.length);
      }),
    },
    clientDocumentRequest: {
      findFirst: jest.fn().mockResolvedValue(Object.prototype.hasOwnProperty.call(opts, 'latestDocumentRequest') ? opts.latestDocumentRequest : null),
      create: jest.fn(),
      update: jest.fn(),
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
  const svc = new ClientService(prisma, audit as any, {} as any, undefined, opts.dispatcher as any);
  return { svc, prisma, audit };
}

const futureWriteKeys: ClientActionKey[] = [
  'intake.link.send',
  'poa.reminder.send',
  'notification.template.send',
  'document.request.send',
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
        powerOfAttorneys: {
          where: { isActive: true },
          orderBy: [{ validUntil: 'asc' }, { createdAt: 'desc' }],
          take: 10,
          select: { id: true, status: true, isLimited: true, validUntil: true },
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
      'document.request.send',
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
      disabledReason: 'Bu müvekkile bağlı dosya henüz yok.',
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
      disabledReason: 'Intake bağlantısı oluşturmadan önce bağlı bir dosya seçin.',
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
      disabledReason: 'Bu müvekkile bağlı dosya henüz yok.',
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

  it('enables template notification when dispatcher, recipient, and V1 templates are ready', async () => {
    const { svc, prisma } = buildHarness({ dispatcher: { dispatch: jest.fn() } });

    const result = await svc.getActionCatalog('client-1', 'tenant-1');
    const action = result.data.find((item) => item.key === 'notification.template.send');

    expect(action).toMatchObject({
      enabled: true,
      visibility: 'visible',
      requiredState: 'TEMPLATE_NOTIFICATION_READY',
      target: { clientId: 'client-1' },
    });
    expect(action?.disabledReason).toBeUndefined();
    expect(action?.href).toBeUndefined();
    expect(prisma.messageTemplate.count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        code: { in: [...CLIENT_TEMPLATE_NOTIFICATION_CODES] },
        isActive: true,
        channel: 'EMAIL',
      },
    });
  });

  it('keeps template notification disabled while a fresh template notification is pending', async () => {
    const { svc, prisma } = buildHarness({
      dispatcher: { dispatch: jest.fn() },
      latestTemplateNotification: { id: 'notification-pending' },
    });

    const result = await svc.getActionCatalog('client-1', 'tenant-1');
    const action = result.data.find((item) => item.key === 'notification.template.send');

    expect(action).toMatchObject({
      enabled: false,
      requiredState: 'TEMPLATE_NOTIFICATION_DELIVERY_PENDING',
      disabledReason: 'Bu müvekkil için bekleyen bir şablon bildirimi teslimi zaten var.',
    });
    expect(prisma.clientNotification.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        clientId: 'client-1',
        channel: 'EMAIL',
        type: { in: [...CLIENT_TEMPLATE_NOTIFICATION_CODES] },
        status: 'PENDING',
        updatedAt: { gte: expect.any(Date) },
      }),
      select: { id: true },
    });
  });

  it('keeps template notification disabled when recipient or active V1 templates are missing', async () => {
    const noRecipient = buildHarness({
      dispatcher: { dispatch: jest.fn() },
      client: { ...defaultClient, email: '', contacts: [] },
    });

    const noRecipientResult = await noRecipient.svc.getActionCatalog('client-1', 'tenant-1');
    expect(noRecipientResult.data.find((item) => item.key === 'notification.template.send')).toMatchObject({
      enabled: false,
      requiredState: 'CLIENT_EMAIL_MISSING',
      disabledReason: 'Şablon bildirimi bir müvekkil e-posta alıcısı gerektirir.',
    });
    expect(noRecipient.prisma.messageTemplate.count).not.toHaveBeenCalled();

    const missingTemplate = buildHarness({ dispatcher: { dispatch: jest.fn() }, templateCount: 1 });
    const missingTemplateResult = await missingTemplate.svc.getActionCatalog('client-1', 'tenant-1');
    expect(missingTemplateResult.data.find((item) => item.key === 'notification.template.send')).toMatchObject({
      enabled: false,
      requiredState: 'TEMPLATE_NOTIFICATION_TEMPLATE_MISSING',
      disabledReason: 'Şablon bildirimi aktif V1 e-posta şablonlarını gerektirir.',
    });
  });

  it('enables document request when dispatcher, recipient, V1 template, and a single related case are ready', async () => {
    const { svc, prisma } = buildHarness({ dispatcher: { dispatch: jest.fn() } });

    const result = await svc.getActionCatalog('client-1', 'tenant-1');
    const action = result.data.find((item) => item.key === 'document.request.send');

    expect(action).toMatchObject({
      enabled: true,
      visibility: 'visible',
      requiredState: 'DOCUMENT_REQUEST_READY',
      target: { clientId: 'client-1', caseId: 'case-1' },
    });
    expect(action?.disabledReason).toBeUndefined();
    expect(action?.href).toBeUndefined();
    expect(prisma.messageTemplate.count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        code: 'CLIENT_DOCUMENT_REQUEST_V1',
        isActive: true,
        channel: 'EMAIL',
      },
    });
  });

  it('keeps document request disabled while a fresh document request delivery is pending', async () => {
    const { svc, prisma } = buildHarness({
      dispatcher: { dispatch: jest.fn() },
      latestDocumentRequest: { id: 'document-request-pending' },
    });

    const result = await svc.getActionCatalog('client-1', 'tenant-1');
    const action = result.data.find((item) => item.key === 'document.request.send');

    expect(action).toMatchObject({
      enabled: false,
      requiredState: 'DOCUMENT_REQUEST_DELIVERY_PENDING',
      disabledReason: 'Bu müvekkil ve dosya için bekleyen bir belge talebi teslimi zaten var.',
      target: { clientId: 'client-1', caseId: 'case-1' },
    });
    expect(prisma.clientDocumentRequest.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        clientId: 'client-1',
        caseId: 'case-1',
        status: { in: ['PENDING', 'SENDING'] },
        updatedAt: { gte: expect.any(Date) },
      }),
      select: { id: true },
    });
  });

  it('keeps document request disabled when recipient or active V1 template is missing', async () => {
    const noRecipient = buildHarness({
      dispatcher: { dispatch: jest.fn() },
      client: { ...defaultClient, email: '', contacts: [] },
    });

    const noRecipientResult = await noRecipient.svc.getActionCatalog('client-1', 'tenant-1');
    expect(noRecipientResult.data.find((item) => item.key === 'document.request.send')).toMatchObject({
      enabled: false,
      requiredState: 'CLIENT_EMAIL_MISSING',
      disabledReason: 'Belge talebi bir müvekkil e-posta alıcısı gerektirir.',
      target: { clientId: 'client-1', caseId: 'case-1' },
    });

    const missingTemplate = buildHarness({ dispatcher: { dispatch: jest.fn() }, documentTemplateCount: 0 });
    const missingTemplateResult = await missingTemplate.svc.getActionCatalog('client-1', 'tenant-1');
    expect(missingTemplateResult.data.find((item) => item.key === 'document.request.send')).toMatchObject({
      enabled: false,
      requiredState: 'DOCUMENT_REQUEST_TEMPLATE_MISSING',
      disabledReason: 'Belge talebi aktif V1 e-posta şablonunu gerektirir.',
      target: { clientId: 'client-1', caseId: 'case-1' },
    });
  });

  it('keeps document request disabled without leaking case ids when related case selection is unavailable or ambiguous', async () => {
    const noCase = buildHarness({ dispatcher: { dispatch: jest.fn() }, client: { ...defaultClient, caseClients: [] } });
    const noCaseResult = await noCase.svc.getActionCatalog('client-1', 'tenant-1');
    expect(noCaseResult.data.find((item) => item.key === 'document.request.send')).toMatchObject({
      enabled: false,
      requiredState: 'RELATED_CASE_EMPTY',
      disabledReason: 'Bu müvekkile bağlı dosya henüz yok.',
      target: { clientId: 'client-1' },
    });

    const ambiguous = buildHarness({
      dispatcher: { dispatch: jest.fn() },
      client: { ...defaultClient, caseClients: [{ caseId: 'case-1' }, { caseId: 'case-2' }] },
    });
    const ambiguousResult = await ambiguous.svc.getActionCatalog('client-1', 'tenant-1');
    const action = ambiguousResult.data.find((item) => item.key === 'document.request.send');
    const serialized = JSON.stringify(action);

    expect(action).toMatchObject({
      enabled: false,
      requiredState: 'DOCUMENT_REQUEST_CASE_SELECTION_REQUIRED',
      disabledReason: 'Belge talebi göndermeden önce bağlı bir dosya seçin.',
      target: { clientId: 'client-1' },
    });
    expect(serialized).not.toContain('case-1');
    expect(serialized).not.toContain('case-2');
  });
  it('enables POA reminder only when an active limited POA expires within 30 days', async () => {
    const { svc, prisma } = buildHarness({
      client: {
        ...defaultClient,
        powerOfAttorneys: [{ id: 'poa-expiring', status: 'ACTIVE', isLimited: true, validUntil: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) }],
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
    expect(prisma.poaExpiryNotificationDelivery.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        clientId: 'client-1',
        poaId: { in: ['poa-expiring'] },
        windowKey: 'D30',
      }),
      select: expect.not.objectContaining({ poaId: true, dedupeKey: true, recipientEmail: true, lastError: true }),
    }));
  });

  it('keeps POA reminder disabled after a current-window SENT artifact without leaking delivery internals', async () => {
    const { svc } = buildHarness({
      client: {
        ...defaultClient,
        powerOfAttorneys: [{ id: 'poa-expiring', status: 'ACTIVE', isLimited: true, validUntil: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) }],
      },
      deliveries: [{ status: 'SENT', attempts: 1, sentAt: new Date(), poaId: 'poa-expiring', dedupeKey: 'secret-dedupe', recipientEmail: 'recipient@example.test' }],
    });

    const result = await svc.getActionCatalog('client-1', 'tenant-1');
    const poaAction = result.data.find((item) => item.key === 'poa.reminder.send');
    const serialized = JSON.stringify(poaAction);

    expect(poaAction).toMatchObject({
      enabled: false,
      requiredState: 'POA_REMINDER_SENT_CURRENT_WINDOW',
      disabledReason: 'Mevcut bitiş penceresi için vekâlet hatırlatması zaten gönderildi; yenileme hâlâ gerekli.',
      target: { clientId: 'client-1' },
    });
    expect(serialized).not.toContain('poa-expiring');
    expect(serialized).not.toContain('secret-dedupe');
    expect(serialized).not.toContain('recipient@example.test');
  });

  it('keeps POA reminder disabled while current-window delivery is freshly pending', async () => {
    const { svc } = buildHarness({
      client: {
        ...defaultClient,
        powerOfAttorneys: [{ id: 'poa-expiring', status: 'ACTIVE', isLimited: true, validUntil: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) }],
      },
      deliveries: [{ status: 'PENDING', attempts: 1, reservedAt: new Date() }],
    });

    const result = await svc.getActionCatalog('client-1', 'tenant-1');
    const poaAction = result.data.find((item) => item.key === 'poa.reminder.send');

    expect(poaAction).toMatchObject({
      enabled: false,
      requiredState: 'POA_REMINDER_DELIVERY_PENDING',
      disabledReason: 'Mevcut bitiş penceresi için bekleyen bir vekâlet hatırlatma teslimi zaten var.',
    });
  });

  it.each([
    ['stale pending', { status: 'PENDING', attempts: 1, reservedAt: new Date(Date.now() - 20 * 60 * 1000) }],
    ['retry-due failed', { status: 'FAILED', attempts: 1, nextRetryAt: new Date(Date.now() - 60 * 1000) }],
  ])('keeps POA reminder enabled for %s delivery state', async (_label, delivery) => {
    const { svc } = buildHarness({
      client: {
        ...defaultClient,
        powerOfAttorneys: [{ id: 'poa-expiring', status: 'ACTIVE', isLimited: true, validUntil: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) }],
      },
      deliveries: [delivery],
    });

    const result = await svc.getActionCatalog('client-1', 'tenant-1');
    const poaAction = result.data.find((item) => item.key === 'poa.reminder.send');

    expect(poaAction).toMatchObject({
      enabled: true,
      requiredState: 'POA_REMINDER_RETRY_AVAILABLE',
      target: { clientId: 'client-1' },
    });
    expect(poaAction?.disabledReason).toBeUndefined();
  });

  it.each([
    ['retry waiting', { status: 'FAILED', attempts: 1, nextRetryAt: new Date(Date.now() + 60 * 60 * 1000) }, 'POA_REMINDER_RETRY_WAITING'],
    ['max attempts', { status: 'FAILED', attempts: 3, nextRetryAt: null }, 'POA_REMINDER_MAX_ATTEMPTS_REACHED'],
  ])('keeps POA reminder disabled for %s delivery state', async (_label, delivery, requiredState) => {
    const { svc } = buildHarness({
      client: {
        ...defaultClient,
        powerOfAttorneys: [{ id: 'poa-expiring', status: 'ACTIVE', isLimited: true, validUntil: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) }],
      },
      deliveries: [delivery],
    });

    const result = await svc.getActionCatalog('client-1', 'tenant-1');
    const poaAction = result.data.find((item) => item.key === 'poa.reminder.send');

    expect(poaAction).toMatchObject({ enabled: false, requiredState });
    expect(poaAction?.disabledReason).toEqual(expect.any(String));
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
      disabledReason: 'Vekâlet hatırlatması yalnız 30 gün içinde süresi dolacak aktif sınırlı vekâletler için kullanılabilir.',
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
    expect(serialized).not.toContain('Intake bağlantısı oluştur');
    expect(serialized).not.toContain('Şablon bildirimi');
    expect(serialized).not.toContain('Belge talebi');
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
    expect(prisma.clientDocumentRequest.findFirst).not.toHaveBeenCalled();
    expect(prisma.clientDocumentRequest.create).not.toHaveBeenCalled();
    expect(prisma.clientDocumentRequest.update).not.toHaveBeenCalled();
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