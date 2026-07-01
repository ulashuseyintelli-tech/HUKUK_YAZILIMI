import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationDispatcherService } from '@/modules/client-notification/notification-dispatcher.service';
import { OfficeService } from '@/modules/office/office.service';
import { ClientIntakeLinkService } from './client-intake-link.service';
import { CreateClientIntakeLinkDto } from './dto/client-intake-link.dto';

const TENANT = 'tenant-1';
const CASE = 'case-1';
const CLIENT = 'client-1';
const USER = 'user-1';

const mockPrisma: any = {
  case: { findFirst: jest.fn() },
  client: { findFirst: jest.fn() },
  caseClient: { findFirst: jest.fn() },
  clientIntakeLink: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  clientIntakeLinkDelivery: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
};
const mockDispatcher: any = { dispatch: jest.fn().mockResolvedValue({ status: 'sent' }) };
const mockOffice: any = { getOrCreate: jest.fn().mockResolvedValue({ name: 'Test Buro' }) };

const createdAt = new Date('2026-07-01T10:00:00.000Z');

function makeLink(overrides: Record<string, any> = {}) {
  return {
    id: 'lnk-1',
    tenantId: TENANT,
    caseId: CASE,
    clientId: CLIENT,
    status: 'ACTIVE',
    scope: ['ADDRESS'],
    expiresAt: null,
    maxUses: 1,
    useCount: 0,
    createdById: USER,
    createdAt,
    ...overrides,
  };
}

function makeDelivery(overrides: Record<string, any> = {}) {
  return {
    id: 'delivery-1',
    tenantId: TENANT,
    clientId: CLIENT,
    caseId: CASE,
    intakeLinkId: 'lnk-1',
    idempotencyKey: 'idem-1',
    dedupeKey: 'INTAKE_LINK_DELIVERY:client-1:case-1:hash',
    channel: 'EMAIL',
    status: 'PENDING',
    notificationId: null,
    attemptCount: 0,
    lastError: null,
    createdById: USER,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

describe('ClientIntakeLinkService', () => {
  let service: ClientIntakeLinkService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDispatcher.dispatch.mockResolvedValue({ status: 'sent', notificationId: 'notification-1', dedupeKey: 'dedupe-1' });
    mockOffice.getOrCreate.mockResolvedValue({ name: 'Test Buro' });
    mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
    mockPrisma.client.findFirst.mockResolvedValue({ id: CLIENT });
    mockPrisma.caseClient.findFirst.mockResolvedValue({ id: 'case-client-1' });
    mockPrisma.clientIntakeLinkDelivery.findUnique.mockResolvedValue(null);
    mockPrisma.clientIntakeLinkDelivery.create.mockImplementation(async (arg: any) => makeDelivery({ ...arg.data, id: 'delivery-1' }));
    mockPrisma.clientIntakeLinkDelivery.update.mockImplementation(async (arg: any) => {
      if (arg.data.status === 'SENDING') {
        return makeDelivery({ status: 'SENDING', attemptCount: 1, lastError: null });
      }
      return makeDelivery({
        status: arg.data.status,
        notificationId: arg.data.notificationId ?? null,
        attemptCount: 1,
        lastError: arg.data.lastError ?? null,
      });
    });
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma));
    process.env.PUBLIC_INTAKE_BASE_URL = 'https://form.example.com';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientIntakeLinkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationDispatcherService, useValue: mockDispatcher },
        { provide: OfficeService, useValue: mockOffice },
      ],
    }).compile();
    service = module.get(ClientIntakeLinkService);
  });

  const dto: CreateClientIntakeLinkDto = { clientId: CLIENT, scope: ['INCOME_SOURCE', 'ADDRESS'] as any };

  describe('create', () => {
    beforeEach(() => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
      mockPrisma.client.findFirst.mockResolvedValue({ id: CLIENT });
      mockPrisma.clientIntakeLink.create.mockResolvedValue(makeLink());
    });

    it('token uretir; DBye YALNIZ sha256 tokenHash yazar; ham token DBde YOK', async () => {
      const res = await service.create(TENANT, CASE, USER, dto);

      const createArg = mockPrisma.clientIntakeLink.create.mock.calls[0][0];
      const storedHash = createArg.data.tokenHash;

      // rawToken yalniz yanitta; DB data'sinda ham token yok
      expect(res.rawToken).toBeDefined();
      expect(JSON.stringify(createArg.data)).not.toContain(res.rawToken);
      // tokenHash = sha256(rawToken), 64 hex
      expect(storedHash).toMatch(/^[a-f0-9]{64}$/);
      expect(createHash('sha256').update(res.rawToken).digest('hex')).toBe(storedHash);
      // create select tokenHash DONDURMUYOR
      expect(createArg.select.tokenHash).toBeUndefined();
    });

    it('intakeUrl = base + rawToken (envden)', async () => {
      const res = await service.create(TENANT, CASE, USER, dto);
      expect(res.intakeUrl).toBe(`https://form.example.com/intake/${res.rawToken}`);
    });

    it('INTAKE_LINK maili dispatcher ile tetiklenir (best-effort)', async () => {
      await service.create(TENANT, CASE, USER, dto);
      expect(mockDispatcher.dispatch).toHaveBeenCalledWith(
        TENANT,
        USER,
        expect.objectContaining({ templateCode: 'INTAKE_LINK', type: 'CLIENT_INFO', refType: 'ClientIntakeLink', refId: 'lnk-1' }),
      );
    });

    it('mail dispatch reddedilse de link doner (state bozulmaz)', async () => {
      mockDispatcher.dispatch.mockRejectedValue(new Error('mail patladi'));
      const res = await service.create(TENANT, CASE, USER, dto);
      expect(res.link).toBeDefined();
      expect(res.rawToken).toBeDefined();
    });

    it('bulunamayan case/client reddedilir', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(null);
      await expect(service.create(TENANT, CASE, USER, dto)).rejects.toThrow(NotFoundException);
    });

    it('gecmis expiresAt reddedilir', async () => {
      await expect(service.create(TENANT, CASE, USER, { ...dto, expiresAt: '2000-01-01T00:00:00Z' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('createForClientWorkspace', () => {
    beforeEach(() => {
      mockPrisma.clientIntakeLink.create.mockResolvedValue(makeLink());
    });

    it('client workspace create command link uretir ama notification dispatch yapmaz', async () => {
      const res = await service.createForClientWorkspace(TENANT, CLIENT, CASE, USER, { scope: ['ADDRESS'] as any });

      expect(mockPrisma.case.findFirst).toHaveBeenCalledWith({ where: { id: CASE, tenantId: TENANT }, select: { id: true } });
      expect(mockPrisma.client.findFirst).toHaveBeenCalledWith({ where: { id: CLIENT, tenantId: TENANT, isActive: true }, select: { id: true } });
      expect(mockPrisma.caseClient.findFirst).toHaveBeenCalledWith({ where: { caseId: CASE, clientId: CLIENT }, select: { id: true } });

      const createArg = mockPrisma.clientIntakeLink.create.mock.calls[0][0];
      expect(createArg.data).toMatchObject({ tenantId: TENANT, caseId: CASE, clientId: CLIENT, status: 'ACTIVE', scope: ['ADDRESS'], createdById: USER });
      expect(createArg.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(createArg.data)).not.toContain(res.rawToken);
      expect(createHash('sha256').update(res.rawToken).digest('hex')).toBe(createArg.data.tokenHash);
      expect(createArg.select.tokenHash).toBeUndefined();
      expect(res.intakeUrl).toBe(`https://form.example.com/intake/${res.rawToken}`);
      expect(mockDispatcher.dispatch).not.toHaveBeenCalled();
      expect(mockOffice.getOrCreate).not.toHaveBeenCalled();
    });

    it('client workspace create command case/client relation yoksa reddeder', async () => {
      mockPrisma.caseClient.findFirst.mockResolvedValue(null);

      await expect(service.createForClientWorkspace(TENANT, CLIENT, CASE, USER, { scope: ['ADDRESS'] as any })).rejects.toThrow(NotFoundException);
      expect(mockPrisma.clientIntakeLink.create).not.toHaveBeenCalled();
      expect(mockDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('client workspace create command cross-tenant veya inactive client icin reddeder', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(null);

      await expect(service.createForClientWorkspace(TENANT, CLIENT, CASE, USER, { scope: ['ADDRESS'] as any })).rejects.toThrow(NotFoundException);
      expect(mockPrisma.caseClient.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.clientIntakeLink.create).not.toHaveBeenCalled();
    });

    it('client workspace create command gecmis expiresAt reddeder', async () => {
      await expect(
        service.createForClientWorkspace(TENANT, CLIENT, CASE, USER, { scope: ['ADDRESS'] as any, expiresAt: '2000-01-01T00:00:00Z' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.clientIntakeLink.create).not.toHaveBeenCalled();
      expect(mockDispatcher.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('createAndDeliverForClientWorkspace', () => {
    beforeEach(() => {
      mockPrisma.clientIntakeLink.create.mockResolvedValue(makeLink());
    });

    it('link ve delivery artifact olusturur, maili gercek URL ile yollar ama response/DB artifact icine secret koymaz', async () => {
      const res = await service.createAndDeliverForClientWorkspace(TENANT, CLIENT, CASE, USER, 'idem-1', { scope: ['ADDRESS'] as any });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.clientIntakeLinkDelivery.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          clientId: CLIENT,
          caseId: CASE,
          intakeLinkId: 'lnk-1',
          idempotencyKey: 'idem-1',
          channel: 'EMAIL',
          status: 'PENDING',
          attemptCount: 0,
          createdById: USER,
        }),
      }));
      const deliveryCreateArg = mockPrisma.clientIntakeLinkDelivery.create.mock.calls[0][0];
      expect(deliveryCreateArg.data.dedupeKey).toMatch(/^INTAKE_LINK_DELIVERY:client-1:case-1:[a-f0-9]{64}$/);
      expect(JSON.stringify(deliveryCreateArg.data)).not.toContain('/intake/');
      expect(JSON.stringify(deliveryCreateArg.data)).not.toContain('rawToken');

      expect(mockPrisma.clientIntakeLinkDelivery.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
        data: expect.objectContaining({ status: 'SENDING', attemptCount: { increment: 1 }, lastError: null }),
      }));
      expect(mockPrisma.clientIntakeLinkDelivery.update).toHaveBeenNthCalledWith(2, expect.objectContaining({
        data: expect.objectContaining({ status: 'SENT', notificationId: 'notification-1', lastError: null }),
      }));

      const dispatchInput = mockDispatcher.dispatch.mock.calls[0][2];
      expect(dispatchInput).toEqual(expect.objectContaining({
        templateCode: 'INTAKE_LINK',
        type: 'CLIENT_INFO',
        refType: 'ClientIntakeLinkDelivery',
        refId: 'delivery-1',
        dedupeKey: deliveryCreateArg.data.dedupeKey,
      }));
      expect(dispatchInput.tokens.intakeUrl).toMatch(/^https:\/\/form\.example\.com\/intake\//);
      expect(dispatchInput.persistedTokens.intakeUrl).toBe('[REDACTED_INTAKE_LINK]');
      expect(JSON.stringify(res)).not.toContain('/intake/');
      expect(JSON.stringify(res)).not.toContain('rawToken');
      expect(JSON.stringify(res)).not.toContain('INTAKE_LINK_DELIVERY');
      expect(JSON.stringify(res)).not.toContain('idem-1');
      expect(res.delivery).toMatchObject({ id: 'delivery-1', status: 'sent', channel: 'EMAIL', notificationId: 'notification-1', attemptCount: 1 });
    });

    it('ayni Idempotency-Key replay olursa yeni link veya dispatch olusturmaz', async () => {
      mockPrisma.clientIntakeLinkDelivery.findUnique.mockResolvedValueOnce(makeDelivery({
        status: 'SENT',
        notificationId: 'notification-existing',
        attemptCount: 1,
        intakeLink: makeLink({ id: 'lnk-existing' }),
      }));

      const res = await service.createAndDeliverForClientWorkspace(TENANT, CLIENT, CASE, USER, 'idem-1', { scope: ['ADDRESS'] as any });

      expect(mockPrisma.clientIntakeLink.create).not.toHaveBeenCalled();
      expect(mockPrisma.clientIntakeLinkDelivery.create).not.toHaveBeenCalled();
      expect(mockDispatcher.dispatch).not.toHaveBeenCalled();
      expect(res.link.id).toBe('lnk-existing');
      expect(res.delivery).toMatchObject({ status: 'sent', notificationId: 'notification-existing', attemptCount: 1 });
    });

    it('Idempotency-Key header yoksa reddeder ve write yapmaz', async () => {
      await expect(
        service.createAndDeliverForClientWorkspace(TENANT, CLIENT, CASE, USER, undefined, { scope: ['ADDRESS'] as any }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.case.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.clientIntakeLink.create).not.toHaveBeenCalled();
      expect(mockPrisma.clientIntakeLinkDelivery.create).not.toHaveBeenCalled();
      expect(mockDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('dispatch failed olursa artifact FAILED olur ve hata icindeki URL redacted saklanir', async () => {
      mockDispatcher.dispatch.mockResolvedValue({
        status: 'failed',
        dedupeKey: 'dedupe-1',
        error: 'SMTP hata https://form.example.com/intake/raw-secret-token',
      });

      const res = await service.createAndDeliverForClientWorkspace(TENANT, CLIENT, CASE, USER, 'idem-1', { scope: ['ADDRESS'] as any });

      const finalUpdateArg = mockPrisma.clientIntakeLinkDelivery.update.mock.calls[1][0];
      expect(finalUpdateArg.data.status).toBe('FAILED');
      expect(finalUpdateArg.data.lastError).toBe('SMTP hata [REDACTED_INTAKE_LINK]');
      expect(res.delivery).toMatchObject({ status: 'failed', error: 'SMTP hata [REDACTED_INTAKE_LINK]' });
      expect(JSON.stringify(res)).not.toContain('raw-secret-token');
    });
  });

  describe('revoke', () => {
    it('ACTIVE -> REVOKED', async () => {
      mockPrisma.clientIntakeLink.findFirst.mockResolvedValue({ id: 'lnk-1', status: 'ACTIVE' });
      mockPrisma.clientIntakeLink.update.mockResolvedValue({ id: 'lnk-1', status: 'REVOKED' });
      const res = await service.revoke(TENANT, 'lnk-1', USER);
      expect(res.status).toBe('REVOKED');
    });

    it('ACTIVE olmayan revoke reddedilir', async () => {
      mockPrisma.clientIntakeLink.findFirst.mockResolvedValue({ id: 'lnk-1', status: 'REVOKED' });
      await expect(service.revoke(TENANT, 'lnk-1', USER)).rejects.toThrow(BadRequestException);
    });
  });

  describe('read - tokenHash DONDURMEZ', () => {
    it('listByCase selectinde tokenHash yok', async () => {
      mockPrisma.clientIntakeLink.findMany.mockResolvedValue([]);
      await service.listByCase(TENANT, CASE);
      const arg = mockPrisma.clientIntakeLink.findMany.mock.calls[0][0];
      expect(arg.select.tokenHash).toBeUndefined();
      expect(arg.select.id).toBe(true);
    });

    it('findOne selectinde tokenHash yok', async () => {
      mockPrisma.clientIntakeLink.findFirst.mockResolvedValue({ id: 'lnk-1' });
      await service.findOne(TENANT, 'lnk-1');
      const arg = mockPrisma.clientIntakeLink.findFirst.mock.calls[0][0];
      expect(arg.select.tokenHash).toBeUndefined();
    });

    it('cross-tenant findOne reddedilir', async () => {
      mockPrisma.clientIntakeLink.findFirst.mockResolvedValue(null);
      await expect(service.findOne(TENANT, 'lnk-1')).rejects.toThrow(NotFoundException);
    });
  });
});