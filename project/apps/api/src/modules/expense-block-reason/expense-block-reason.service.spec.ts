import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ExpenseBlockReasonService } from './expense-block-reason.service';
import { CreateExpenseBlockReasonDto } from './dto/expense-block-reason.dto';

const TENANT = 'tenant-1';
const CASE = 'case-1';
const USER = 'user-1';

const baseRecord = {
  id: 'ebr-1',
  tenantId: TENANT,
  caseId: CASE,
  expenseRequestId: null as string | null,
  blockedActionCode: 'VEHICLE_SEIZURE',
  reasonCode: 'PAYMENT_NOT_RECEIVED',
  note: 'Ödeme gelmedi',
  status: 'OPEN',
  createdById: USER,
  createdAt: new Date('2026-06-17T00:00:00Z'),
  resolvedAt: null,
  resolvedById: null,
  cancelledAt: null,
  cancelledById: null,
  resolutionNote: null,
};

const mockPrisma: any = {
  case: { findFirst: jest.fn() },
  expenseRequest: { findFirst: jest.fn() },
  expenseBlockReason: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('ExpenseBlockReasonService', () => {
  let service: ExpenseBlockReasonService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseBlockReasonService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(ExpenseBlockReasonService);
  });

  const dto: CreateExpenseBlockReasonDto = {
    blockedActionCode: 'VEHICLE_SEIZURE',
    reasonCode: 'PAYMENT_NOT_RECEIVED' as any,
    note: 'Ödeme gelmedi',
  };

  describe('create', () => {
    it('OPEN kayıt oluşturur (case aynı tenant)', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
      mockPrisma.expenseBlockReason.create.mockResolvedValue({ ...baseRecord });

      const res = await service.create(TENANT, CASE, USER, dto);

      expect(mockPrisma.case.findFirst).toHaveBeenCalledWith({
        where: { id: CASE, tenantId: TENANT },
        select: { id: true },
      });
      expect(mockPrisma.expenseBlockReason.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT,
            caseId: CASE,
            status: 'OPEN',
            createdById: USER,
            blockedActionCode: 'VEHICLE_SEIZURE',
          }),
        }),
      );
      expect(res.status).toBe('OPEN');
    });

    it('cross-tenant / bulunamayan case reddedilir', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(null);
      await expect(service.create(TENANT, CASE, USER, dto)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.expenseBlockReason.create).not.toHaveBeenCalled();
    });

    it('başka case’e ait expenseRequest reddedilir', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
      mockPrisma.expenseRequest.findFirst.mockResolvedValue({ id: 'er-9', caseId: 'OTHER-CASE' });

      await expect(
        service.create(TENANT, CASE, USER, { ...dto, expenseRequestId: 'er-9' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.expenseBlockReason.create).not.toHaveBeenCalled();
    });
  });

  describe('resolve', () => {
    it('OPEN → RESOLVED (resolvedAt/By set)', async () => {
      mockPrisma.expenseBlockReason.findFirst.mockResolvedValue({ ...baseRecord, status: 'OPEN' });
      mockPrisma.expenseBlockReason.update.mockResolvedValue({ ...baseRecord, status: 'RESOLVED' });

      const res = await service.resolve(TENANT, 'ebr-1', USER, 'ödeme geldi');

      expect(mockPrisma.expenseBlockReason.update).toHaveBeenCalledWith({
        where: { id: 'ebr-1' },
        data: expect.objectContaining({
          status: 'RESOLVED',
          resolvedById: USER,
          resolutionNote: 'ödeme geldi',
        }),
      });
      expect(res.status).toBe('RESOLVED');
    });

    it('OPEN olmayan kayıt resolve reddedilir (geçersiz geçiş)', async () => {
      mockPrisma.expenseBlockReason.findFirst.mockResolvedValue({ ...baseRecord, status: 'RESOLVED' });
      await expect(service.resolve(TENANT, 'ebr-1', USER)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.expenseBlockReason.update).not.toHaveBeenCalled();
    });

    it('cross-tenant kayıt görünmez (NotFound)', async () => {
      mockPrisma.expenseBlockReason.findFirst.mockResolvedValue(null);
      await expect(service.resolve(TENANT, 'ebr-1', USER)).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancel', () => {
    it('OPEN → CANCELLED (silinmez; cancelledAt/By set)', async () => {
      mockPrisma.expenseBlockReason.findFirst.mockResolvedValue({ ...baseRecord, status: 'OPEN' });
      mockPrisma.expenseBlockReason.update.mockResolvedValue({ ...baseRecord, status: 'CANCELLED' });

      const res = await service.cancel(TENANT, 'ebr-1', USER, 'yanlış kayıt');

      expect(mockPrisma.expenseBlockReason.update).toHaveBeenCalledWith({
        where: { id: 'ebr-1' },
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancelledById: USER,
          resolutionNote: 'yanlış kayıt',
        }),
      });
      expect(res.status).toBe('CANCELLED');
    });

    it('CANCELLED kayıt tekrar cancel reddedilir', async () => {
      mockPrisma.expenseBlockReason.findFirst.mockResolvedValue({ ...baseRecord, status: 'CANCELLED' });
      await expect(service.cancel(TENANT, 'ebr-1', USER)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.expenseBlockReason.update).not.toHaveBeenCalled();
    });
  });

  describe('listByCase', () => {
    it('default OPEN filtreler', async () => {
      mockPrisma.expenseBlockReason.findMany.mockResolvedValue([baseRecord]);
      await service.listByCase(TENANT, CASE);
      expect(mockPrisma.expenseBlockReason.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, caseId: CASE, status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('verilen status ile filtreler', async () => {
      mockPrisma.expenseBlockReason.findMany.mockResolvedValue([]);
      await service.listByCase(TENANT, CASE, 'RESOLVED' as any);
      expect(mockPrisma.expenseBlockReason.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, caseId: CASE, status: 'RESOLVED' },
        orderBy: { createdAt: 'desc' },
      });
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
