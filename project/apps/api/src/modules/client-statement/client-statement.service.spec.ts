import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ClientStatementService } from './client-statement.service';
import { CreateClientStatementDto } from './dto/client-statement.dto';

const D = (n: number) => new Prisma.Decimal(n);
const TENANT = 'tenant-1';
const CASE = 'case-1';
const CLIENT = 'client-1';
const USER = 'user-1';

const mockPrisma: any = {
  case: { findFirst: jest.fn() },
  client: { findFirst: jest.fn() },
  caseBalance: { findFirst: jest.fn() },
  balanceLedger: { aggregate: jest.fn(), findMany: jest.fn() },
  expenseRequest: { findMany: jest.fn() },
  clientStatement: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  clientStatementLine: { createMany: jest.fn() },
  $transaction: jest.fn((fn: any) => fn(mockPrisma)),
};

describe('ClientStatementService', () => {
  let service: ClientStatementService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClientStatementService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(ClientStatementService);
  });

  const dto: CreateClientStatementDto = {
    clientId: CLIENT,
    periodStart: '2026-06-01T00:00:00Z',
    periodEnd: '2026-06-30T23:59:59Z',
  };

  describe('create / türetim', () => {
    beforeEach(() => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
      mockPrisma.client.findFirst.mockResolvedValue({ id: CLIENT });
      mockPrisma.caseBalance.findFirst.mockResolvedValue({ id: 'cb-1' });
      mockPrisma.balanceLedger.aggregate.mockResolvedValue({ _sum: { amount: D(100) } }); // opening=100
      mockPrisma.balanceLedger.findMany.mockResolvedValue([
        { id: 'l1', amount: D(50), type: 'CREDIT', description: 'avans', createdAt: new Date(1000) },
        { id: 'l2', amount: D(-30), type: 'DEBIT', description: 'masraf', createdAt: new Date(2000) },
      ]);
      mockPrisma.expenseRequest.findMany.mockResolvedValue([
        { id: 'er1', totalAmount: D(75), currency: 'TRY', status: 'PENDING', createdAt: new Date(1500) },
      ]);
      mockPrisma.clientStatement.create.mockResolvedValue({ id: 'st-1' });
      mockPrisma.clientStatement.findFirst.mockResolvedValue({ id: 'st-1', lines: [] });
    });

    it('opening/running/closing doğru; EXPENSE_REQUESTED bakiyeyi oynatmaz', async () => {
      await service.create(TENANT, CASE, USER, dto);

      // başlık: opening=100, closing=120 (100 +50 -30)
      const stArgs = mockPrisma.clientStatement.create.mock.calls[0][0].data;
      expect(stArgs.openingBalance.toString()).toBe('100');
      expect(stArgs.closingBalance.toString()).toBe('120');

      // satırlar: l1(credit50, run150), er1(info 0/0, run150), l2(debit30, run120)
      const lines = mockPrisma.clientStatementLine.createMany.mock.calls[0][0].data;
      expect(lines).toHaveLength(3);

      const credit = lines.find((l: any) => l.refId === 'l1');
      expect(credit.credit.toString()).toBe('50');
      expect(credit.debit.toString()).toBe('0');
      expect(credit.runningBalance.toString()).toBe('150');
      expect(credit.lineType).toBe('ADVANCE_CREDIT');

      const info = lines.find((l: any) => l.refId === 'er1');
      expect(info.lineType).toBe('EXPENSE_REQUESTED');
      expect(info.debit.toString()).toBe('0');
      expect(info.credit.toString()).toBe('0');
      expect(info.runningBalance.toString()).toBe('150'); // değişmedi

      const debit = lines.find((l: any) => l.refId === 'l2');
      expect(debit.debit.toString()).toBe('30');
      expect(debit.credit.toString()).toBe('0');
      expect(debit.runningBalance.toString()).toBe('120');
      expect(debit.lineType).toBe('EXPENSE_ACTUAL');
    });

    it('includeRequests=false → ExpenseRequest okunmaz, bilgi satırı yok', async () => {
      await service.create(TENANT, CASE, USER, { ...dto, includeRequests: false });
      expect(mockPrisma.expenseRequest.findMany).not.toHaveBeenCalled();
      const lines = mockPrisma.clientStatementLine.createMany.mock.calls[0][0].data;
      expect(lines.every((l: any) => l.lineType !== 'EXPENSE_REQUESTED')).toBe(true);
      expect(lines).toHaveLength(2);
    });

    it('CaseBalance yoksa opening=0, yalnız bilgi satırları', async () => {
      mockPrisma.caseBalance.findFirst.mockResolvedValue(null);
      await service.create(TENANT, CASE, USER, dto);
      const stArgs = mockPrisma.clientStatement.create.mock.calls[0][0].data;
      expect(stArgs.openingBalance.toString()).toBe('0');
      expect(mockPrisma.balanceLedger.findMany).not.toHaveBeenCalled();
    });
  });

  describe('create / guard', () => {
    it('periodStart > periodEnd reddedilir', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
      mockPrisma.client.findFirst.mockResolvedValue({ id: CLIENT });
      await expect(
        service.create(TENANT, CASE, USER, { ...dto, periodStart: '2026-07-01T00:00:00Z', periodEnd: '2026-06-01T00:00:00Z' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('bulunamayan case reddedilir', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(null);
      await expect(service.create(TENANT, CASE, USER, dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('supersede', () => {
    it('ACTIVE → yeni üret + eskisini SUPERSEDED + supersededById', async () => {
      mockPrisma.clientStatement.findFirst
        .mockResolvedValueOnce({ id: 'old-1', status: 'ACTIVE', caseId: CASE, clientId: CLIENT }) // findOwned
        .mockResolvedValue({ id: 'new-1', lines: [] }); // findOne (dönüş)
      mockPrisma.caseBalance.findFirst.mockResolvedValue(null);
      mockPrisma.expenseRequest.findMany.mockResolvedValue([]);
      mockPrisma.clientStatement.create.mockResolvedValue({ id: 'new-1' });

      await service.supersede(TENANT, 'old-1', USER, { periodStart: dto.periodStart, periodEnd: dto.periodEnd });

      expect(mockPrisma.clientStatement.update).toHaveBeenCalledWith({
        where: { id: 'old-1' },
        data: expect.objectContaining({ status: 'SUPERSEDED', supersededById: 'new-1', supersededAt: expect.any(Date) }),
      });
    });

    it('ACTIVE olmayan supersede reddedilir', async () => {
      mockPrisma.clientStatement.findFirst.mockResolvedValue({ id: 'old-1', status: 'SUPERSEDED', caseId: CASE, clientId: CLIENT });
      await expect(
        service.supersede(TENANT, 'old-1', USER, { periodStart: dto.periodStart, periodEnd: dto.periodEnd }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.clientStatement.create).not.toHaveBeenCalled();
    });
  });

  describe('void', () => {
    it('ACTIVE → VOID (voidedAt/By/voidNote)', async () => {
      mockPrisma.clientStatement.findFirst
        .mockResolvedValueOnce({ id: 'st-1', status: 'ACTIVE', caseId: CASE, clientId: CLIENT })
        .mockResolvedValue({ id: 'st-1', lines: [] });
      await service.void(TENANT, 'st-1', USER, 'yanlış dönem');
      expect(mockPrisma.clientStatement.update).toHaveBeenCalledWith({
        where: { id: 'st-1' },
        data: expect.objectContaining({ status: 'VOID', voidedById: USER, voidNote: 'yanlış dönem', voidedAt: expect.any(Date) }),
      });
    });

    it('ACTIVE olmayan void reddedilir', async () => {
      mockPrisma.clientStatement.findFirst.mockResolvedValue({ id: 'st-1', status: 'VOID', caseId: CASE, clientId: CLIENT });
      await expect(service.void(TENANT, 'st-1', USER)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.clientStatement.update).not.toHaveBeenCalled();
    });
  });

  describe('read & immutability', () => {
    it('listByCase default ACTIVE', async () => {
      mockPrisma.clientStatement.findMany.mockResolvedValue([]);
      await service.listByCase(TENANT, CASE);
      expect(mockPrisma.clientStatement.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, caseId: CASE, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('cross-tenant findOne reddedilir', async () => {
      mockPrisma.clientStatement.findFirst.mockResolvedValue(null);
      await expect(service.findOne(TENANT, 'st-1')).rejects.toThrow(NotFoundException);
    });

    it('servis içerik update/delete metodu SUNMAZ', () => {
      expect((service as any).update).toBeUndefined();
      expect((service as any).delete).toBeUndefined();
      expect((service as any).patchContent).toBeUndefined();
    });
  });
});
