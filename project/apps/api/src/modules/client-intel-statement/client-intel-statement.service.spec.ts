import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ClientIntelStatementService } from './client-intel-statement.service';
import { CreateClientIntelStatementDto } from './dto/client-intel-statement.dto';

const TENANT = 'tenant-1';
const CASE = 'case-1';
const DEBTOR = 'debtor-1';
const USER = 'user-1';

const mockPrisma: any = {
  case: { findFirst: jest.fn() },
  debtor: { findFirst: jest.fn() },
  clientIntelStatement: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn((fn: any) => fn(mockPrisma)),
};

describe('ClientIntelStatementService', () => {
  let service: ClientIntelStatementService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClientIntelStatementService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(ClientIntelStatementService);
  });

  const dto: CreateClientIntelStatementDto = {
    debtorId: DEBTOR,
    category: 'INCOME_SOURCE' as any,
    label: 'Borçlu nasıl para kazanıyor?',
    value: 'Müteahhit',
  };

  describe('create', () => {
    it('ACTIVE beyan oluşturur (case+debtor aynı tenant)', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
      mockPrisma.debtor.findFirst.mockResolvedValue({ id: DEBTOR });
      mockPrisma.clientIntelStatement.create.mockResolvedValue({ id: 'cis-1', status: 'ACTIVE' });

      const res = await service.create(TENANT, CASE, USER, dto);

      expect(mockPrisma.clientIntelStatement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT, caseId: CASE, debtorId: DEBTOR,
            category: 'INCOME_SOURCE', value: 'Müteahhit', status: 'ACTIVE', createdById: USER,
          }),
        }),
      );
      expect(res.status).toBe('ACTIVE');
    });

    it('bulunamayan case reddedilir', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(null);
      await expect(service.create(TENANT, CASE, USER, dto)).rejects.toThrow(NotFoundException);
    });

    it('bulunamayan debtor reddedilir', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
      mockPrisma.debtor.findFirst.mockResolvedValue(null);
      await expect(service.create(TENANT, CASE, USER, dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('lifecycle', () => {
    const armActive = () =>
      mockPrisma.clientIntelStatement.findFirst.mockResolvedValue({ id: 'cis-1', status: 'ACTIVE', caseId: CASE, debtorId: DEBTOR, category: 'INCOME_SOURCE', label: 'L' });

    it('retract: ACTIVE → RETRACTED (+damga)', async () => {
      armActive();
      mockPrisma.clientIntelStatement.update.mockResolvedValue({ id: 'cis-1', status: 'RETRACTED' });
      const res = await service.retract(TENANT, 'cis-1', USER, 'müvekkil geri aldı');
      expect(mockPrisma.clientIntelStatement.update).toHaveBeenCalledWith({
        where: { id: 'cis-1' },
        data: expect.objectContaining({ status: 'RETRACTED', revokedById: USER, lifecycleNote: 'müvekkil geri aldı' }),
      });
      expect(res.status).toBe('RETRACTED');
    });

    it('false-positive: ACTIVE → FALSE_POSITIVE', async () => {
      armActive();
      mockPrisma.clientIntelStatement.update.mockResolvedValue({ id: 'cis-1', status: 'FALSE_POSITIVE' });
      const res = await service.falsePositive(TENANT, 'cis-1', USER);
      expect(res.status).toBe('FALSE_POSITIVE');
    });

    it('terminal sonrası geçiş reddedilir (RETRACTED → retract)', async () => {
      mockPrisma.clientIntelStatement.findFirst.mockResolvedValue({ id: 'cis-1', status: 'RETRACTED', caseId: CASE, debtorId: DEBTOR });
      await expect(service.retract(TENANT, 'cis-1', USER)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.clientIntelStatement.update).not.toHaveBeenCalled();
    });

    it('supersede: eski SUPERSEDED + yeni ACTIVE (içerik aynen, yeni value)', async () => {
      mockPrisma.clientIntelStatement.findFirst.mockResolvedValue({ id: 'old-1', status: 'ACTIVE', caseId: CASE, debtorId: DEBTOR, category: 'INCOME_SOURCE', label: 'L' });
      mockPrisma.clientIntelStatement.create.mockResolvedValue({ id: 'new-1', status: 'ACTIVE' });

      const res = await service.supersede(TENANT, 'old-1', USER, { value: 'Nakliyeci' });

      expect(mockPrisma.clientIntelStatement.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ value: 'Nakliyeci', category: 'INCOME_SOURCE', status: 'ACTIVE' }) }),
      );
      expect(mockPrisma.clientIntelStatement.update).toHaveBeenCalledWith({
        where: { id: 'old-1' },
        data: expect.objectContaining({ status: 'SUPERSEDED', supersededById: 'new-1', supersededAt: expect.any(Date) }),
      });
      expect(res.id).toBe('new-1');
    });

    it('ACTIVE olmayan supersede reddedilir', async () => {
      mockPrisma.clientIntelStatement.findFirst.mockResolvedValue({ id: 'old-1', status: 'SUPERSEDED', caseId: CASE, debtorId: DEBTOR });
      await expect(service.supersede(TENANT, 'old-1', USER, { value: 'x' })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.clientIntelStatement.create).not.toHaveBeenCalled();
    });

    it('cross-tenant kayıt görünmez (NotFound)', async () => {
      mockPrisma.clientIntelStatement.findFirst.mockResolvedValue(null);
      await expect(service.retract(TENANT, 'cis-1', USER)).rejects.toThrow(NotFoundException);
    });
  });

  describe('read & immutability', () => {
    it('listByCase default ACTIVE', async () => {
      mockPrisma.clientIntelStatement.findMany.mockResolvedValue([]);
      await service.listByCase(TENANT, CASE);
      expect(mockPrisma.clientIntelStatement.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, caseId: CASE, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('listByDebtor default ACTIVE', async () => {
      mockPrisma.clientIntelStatement.findMany.mockResolvedValue([]);
      await service.listByDebtor(TENANT, DEBTOR);
      expect(mockPrisma.clientIntelStatement.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, debtorId: DEBTOR, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('servis içerik update/delete metodu SUNMAZ', () => {
      expect((service as any).update).toBeUndefined();
      expect((service as any).delete).toBeUndefined();
      expect((service as any).patchContent).toBeUndefined();
    });
  });
});
