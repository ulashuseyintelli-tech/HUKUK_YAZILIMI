import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationDispatcherService } from '@/modules/client-notification/notification-dispatcher.service';
import { OfficeService } from '@/modules/office/office.service';
import { ClientApprovalService } from './client-approval.service';
import { CreateClientApprovalRequestDto } from './dto/client-approval.dto';

const TENANT = 'tenant-1';
const CASE = 'case-1';
const CLIENT = 'client-1';
const USER = 'user-1';

const mockPrisma: any = {
  case: { findFirst: jest.fn() },
  client: { findFirst: jest.fn() },
  expenseRequest: { findFirst: jest.fn() },
  clientApprovalRequest: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  clientApprovalEvent: { create: jest.fn() },
  $transaction: jest.fn((fn: any) => fn(mockPrisma)),
};
const mockDispatcher: any = { dispatch: jest.fn().mockResolvedValue({ status: 'sent' }) };
const mockOffice: any = { getOrCreate: jest.fn().mockResolvedValue({ name: 'Test Büro' }) };

describe('ClientApprovalService', () => {
  let service: ClientApprovalService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDispatcher.dispatch.mockResolvedValue({ status: 'sent' });
    mockOffice.getOrCreate.mockResolvedValue({ name: 'Test Büro' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientApprovalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationDispatcherService, useValue: mockDispatcher },
        { provide: OfficeService, useValue: mockOffice },
      ],
    }).compile();
    service = module.get(ClientApprovalService);
  });

  const dto: CreateClientApprovalRequestDto = {
    clientId: CLIENT,
    subjectType: 'EXPENSE_REQUEST' as any,
    subjectId: 'er-1',
  };

  describe('create', () => {
    it('DRAFT oluşturur + CREATED event yazar + ER soft-validate', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
      mockPrisma.client.findFirst.mockResolvedValue({ id: CLIENT });
      mockPrisma.expenseRequest.findFirst.mockResolvedValue({ id: 'er-1', totalAmount: 1500 });
      mockPrisma.clientApprovalRequest.create.mockResolvedValue({ id: 'car-1', status: 'DRAFT' });

      const res = await service.create(TENANT, CASE, USER, dto);

      expect(mockPrisma.clientApprovalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT,
            caseId: CASE,
            clientId: CLIENT,
            status: 'DRAFT',
            requestedById: USER,
            subjectLabel: expect.stringContaining('Masraf talebi'),
          }),
        }),
      );
      expect(mockPrisma.clientApprovalEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'CREATED', toStatus: 'DRAFT' }),
        }),
      );
      expect(res.status).toBe('DRAFT');
    });

    it('ER bulunamazsa REDDETMEZ (gevşek bağ) — kayıt yine oluşur', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
      mockPrisma.client.findFirst.mockResolvedValue({ id: CLIENT });
      mockPrisma.expenseRequest.findFirst.mockResolvedValue(null); // bulunamadı
      mockPrisma.clientApprovalRequest.create.mockResolvedValue({ id: 'car-1', status: 'DRAFT' });

      await expect(service.create(TENANT, CASE, USER, dto)).resolves.toBeDefined();
      expect(mockPrisma.clientApprovalRequest.create).toHaveBeenCalled();
    });

    it('bulunamayan case reddedilir', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(null);
      await expect(service.create(TENANT, CASE, USER, dto)).rejects.toThrow(NotFoundException);
    });

    it('bulunamayan client reddedilir', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
      mockPrisma.client.findFirst.mockResolvedValue(null);
      await expect(service.create(TENANT, CASE, USER, dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('geçişler', () => {
    const arm = (status: string) =>
      mockPrisma.clientApprovalRequest.findFirst.mockResolvedValue({ id: 'car-1', status });

    it('send: DRAFT → SENT (+SENT event, sentAt)', async () => {
      arm('DRAFT');
      mockPrisma.clientApprovalRequest.update.mockResolvedValue({ id: 'car-1', status: 'SENT' });
      const res = await service.send(TENANT, 'car-1', USER);
      expect(mockPrisma.clientApprovalRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SENT', sentAt: expect.any(Date) }) }),
      );
      expect(mockPrisma.clientApprovalEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'SENT', fromStatus: 'DRAFT', toStatus: 'SENT' }) }),
      );
      expect(res.status).toBe('SENT');
    });

    it('decision APPROVE: SENT → APPROVED', async () => {
      arm('SENT');
      mockPrisma.clientApprovalRequest.update.mockResolvedValue({ id: 'car-1', status: 'APPROVED' });
      const res = await service.decision(TENANT, 'car-1', USER, { decision: 'APPROVE' as any, note: 'olur' });
      expect(mockPrisma.clientApprovalRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED', decision: 'APPROVE' }) }),
      );
      expect(res.status).toBe('APPROVED');
    });

    it('decision REJECT: SENT → REJECTED', async () => {
      arm('SENT');
      mockPrisma.clientApprovalRequest.update.mockResolvedValue({ id: 'car-1', status: 'REJECTED' });
      const res = await service.decision(TENANT, 'car-1', USER, { decision: 'REJECT' as any });
      expect(res.status).toBe('REJECTED');
    });

    it('cancel: SENT → CANCELLED', async () => {
      arm('SENT');
      mockPrisma.clientApprovalRequest.update.mockResolvedValue({ id: 'car-1', status: 'CANCELLED' });
      const res = await service.cancel(TENANT, 'car-1', USER, 'vazgeçildi');
      expect(res.status).toBe('CANCELLED');
    });

    it('expire: SENT → EXPIRED', async () => {
      arm('SENT');
      mockPrisma.clientApprovalRequest.update.mockResolvedValue({ id: 'car-1', status: 'EXPIRED' });
      const res = await service.expire(TENANT, 'car-1', USER);
      expect(res.status).toBe('EXPIRED');
    });

    it('terminal sonrası geçiş reddedilir (APPROVED → send)', async () => {
      arm('APPROVED');
      await expect(service.send(TENANT, 'car-1', USER)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.clientApprovalRequest.update).not.toHaveBeenCalled();
    });

    it('geçersiz geçiş reddedilir (DRAFT → decision)', async () => {
      arm('DRAFT');
      await expect(service.decision(TENANT, 'car-1', USER, { decision: 'APPROVE' as any })).rejects.toThrow(BadRequestException);
    });

    it('cross-tenant kayıt görünmez (NotFound)', async () => {
      mockPrisma.clientApprovalRequest.findFirst.mockResolvedValue(null);
      await expect(service.send(TENANT, 'car-1', USER)).rejects.toThrow(NotFoundException);
    });
  });

  describe('read', () => {
    it('listByCase default tüm statüler (filtre yok)', async () => {
      mockPrisma.clientApprovalRequest.findMany.mockResolvedValue([]);
      await service.listByCase(TENANT, CASE);
      expect(mockPrisma.clientApprovalRequest.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, caseId: CASE },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('findOne event geçmişini içerir', async () => {
      mockPrisma.clientApprovalRequest.findFirst.mockResolvedValue({ id: 'car-1', events: [] });
      await service.findOne(TENANT, 'car-1');
      expect(mockPrisma.clientApprovalRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ include: { events: { orderBy: { createdAt: 'asc' } } } }),
      );
    });
  });

  describe('mail tetiği (3.4) — best-effort, state değiştirmez', () => {
    it('send → dispatcher APPROVAL_REQUEST ile çağrılır', async () => {
      mockPrisma.clientApprovalRequest.findFirst.mockResolvedValue({ id: 'car-1', status: 'DRAFT' });
      mockPrisma.clientApprovalRequest.update.mockResolvedValue({ id: 'car-1', status: 'SENT', clientId: CLIENT, caseId: CASE, subjectLabel: 'Haciz onayı', decision: null });
      const res = await service.send(TENANT, 'car-1', USER);
      expect(res.status).toBe('SENT');
      expect(mockDispatcher.dispatch).toHaveBeenCalledWith(
        TENANT, USER,
        expect.objectContaining({ templateCode: 'APPROVAL_REQUEST', type: 'CLIENT_APPROVAL', refType: 'ClientApprovalRequest', refId: 'car-1' }),
      );
    });

    it('decision → dispatcher APPROVAL_RESULT ile çağrılır', async () => {
      mockPrisma.clientApprovalRequest.findFirst.mockResolvedValue({ id: 'car-1', status: 'SENT' });
      mockPrisma.clientApprovalRequest.update.mockResolvedValue({ id: 'car-1', status: 'APPROVED', clientId: CLIENT, caseId: CASE, subjectLabel: 'Haciz', decision: 'APPROVE' });
      await service.decision(TENANT, 'car-1', USER, { decision: 'APPROVE' as any });
      expect(mockDispatcher.dispatch).toHaveBeenCalledWith(
        TENANT, USER,
        expect.objectContaining({ templateCode: 'APPROVAL_RESULT' }),
      );
    });

    it('mail dispatch reddedilse bile send state SAĞLAM döner (throw yok)', async () => {
      mockPrisma.clientApprovalRequest.findFirst.mockResolvedValue({ id: 'car-1', status: 'DRAFT' });
      mockPrisma.clientApprovalRequest.update.mockResolvedValue({ id: 'car-1', status: 'SENT', clientId: CLIENT, caseId: CASE, subjectLabel: null, decision: null });
      mockDispatcher.dispatch.mockRejectedValue(new Error('mail patladı'));
      const res = await service.send(TENANT, 'car-1', USER);
      expect(res.status).toBe('SENT');
    });
  });

  describe('immutability', () => {
    it('servis içerik update/delete metodu SUNMAZ', () => {
      expect((service as any).update).toBeUndefined();
      expect((service as any).delete).toBeUndefined();
      expect((service as any).patchContent).toBeUndefined();
    });
  });
});
