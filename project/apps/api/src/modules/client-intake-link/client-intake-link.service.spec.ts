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
};
const mockDispatcher: any = { dispatch: jest.fn().mockResolvedValue({ status: 'sent' }) };
const mockOffice: any = { getOrCreate: jest.fn().mockResolvedValue({ name: 'Test Büro' }) };

describe('ClientIntakeLinkService', () => {
  let service: ClientIntakeLinkService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDispatcher.dispatch.mockResolvedValue({ status: 'sent' });
    mockOffice.getOrCreate.mockResolvedValue({ name: 'Test Büro' });
    mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
    mockPrisma.client.findFirst.mockResolvedValue({ id: CLIENT });
    mockPrisma.caseClient.findFirst.mockResolvedValue({ id: 'case-client-1' });
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
      mockPrisma.clientIntakeLink.create.mockResolvedValue({ id: 'lnk-1', status: 'ACTIVE', expiresAt: null });
    });

    it('token uretir; DBye YALNIZ sha256 tokenHash yazar; ham token DBde YOK', async () => {
      const res = await service.create(TENANT, CASE, USER, dto);

      const createArg = mockPrisma.clientIntakeLink.create.mock.calls[0][0];
      const storedHash = createArg.data.tokenHash;

      // rawToken yalnız yanıtta; DB data'sında ham token yok
      expect(res.rawToken).toBeDefined();
      expect(JSON.stringify(createArg.data)).not.toContain(res.rawToken);
      // tokenHash = sha256(rawToken), 64 hex
      expect(storedHash).toMatch(/^[a-f0-9]{64}$/);
      expect(createHash('sha256').update(res.rawToken).digest('hex')).toBe(storedHash);
      // create select tokenHash DÖNDÜRMÜYOR
      expect(createArg.select.tokenHash).toBeUndefined();
    });

    it('intakeUrl = base + rawToken (envden)', async () => {
      const res = await service.create(TENANT, CASE, USER, dto);
      expect(res.intakeUrl).toBe(`https://form.example.com/intake/${res.rawToken}`);
    });

    it('INTAKE_LINK maili dispatcher ile tetiklenir (best-effort)', async () => {
      await service.create(TENANT, CASE, USER, dto);
      expect(mockDispatcher.dispatch).toHaveBeenCalledWith(
        TENANT, USER,
        expect.objectContaining({ templateCode: 'INTAKE_LINK', type: 'CLIENT_INFO', refType: 'ClientIntakeLink', refId: 'lnk-1' }),
      );
    });

    it('mail dispatch reddedilse de link döner (state bozulmaz)', async () => {
      mockDispatcher.dispatch.mockRejectedValue(new Error('mail patladı'));
      const res = await service.create(TENANT, CASE, USER, dto);
      expect(res.link).toBeDefined();
      expect(res.rawToken).toBeDefined();
    });

    it('bulunamayan case/client reddedilir', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(null);
      await expect(service.create(TENANT, CASE, USER, dto)).rejects.toThrow(NotFoundException);
    });

    it('geçmiş expiresAt reddedilir', async () => {
      await expect(service.create(TENANT, CASE, USER, { ...dto, expiresAt: '2000-01-01T00:00:00Z' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('createForClientWorkspace', () => {
    beforeEach(() => {
      mockPrisma.clientIntakeLink.create.mockResolvedValue({ id: 'lnk-1', status: 'ACTIVE', expiresAt: null });
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
  describe('revoke', () => {
    it('ACTIVE → REVOKED', async () => {
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

  describe('read — tokenHash DÖNDÜRMEZ', () => {
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
