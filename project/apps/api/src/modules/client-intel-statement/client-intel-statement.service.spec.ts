import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ClientIntelStatementService } from './client-intel-statement.service';
import { CreateClientIntelStatementDto } from './dto/client-intel-statement.dto';
import { AuditService } from '../audit/audit.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';

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

// I1A: retract/falsePositive/supersede capability-gate — mevcut testler eligible aktör varsayar.
const mockAudit = { log: jest.fn(), logInTransaction: jest.fn().mockResolvedValue(undefined) };
const mockOfficeApproval = { isApproverEligible: jest.fn().mockResolvedValue(true) };

describe('ClientIntelStatementService', () => {
  let service: ClientIntelStatementService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockOfficeApproval.isApproverEligible.mockResolvedValue(true);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientIntelStatementService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: OfficeApprovalService, useValue: mockOfficeApproval },
      ],
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

  describe('I1A — capability gate + audit (retract/falsePositive/supersede)', () => {
    const armActive = () =>
      mockPrisma.clientIntelStatement.findFirst.mockResolvedValue({ id: 'cis-1', status: 'ACTIVE', caseId: CASE, debtorId: DEBTOR, category: 'INCOME_SOURCE', label: 'L' });

    it('yetkisiz kullanıcı (isApproverEligible=false) → retract 403, update ÇAĞRILMAZ, audit YOK', async () => {
      armActive();
      mockOfficeApproval.isApproverEligible.mockResolvedValueOnce(false);
      await expect(service.retract(TENANT, 'cis-1', USER)).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.clientIntelStatement.update).not.toHaveBeenCalled();
      expect(mockAudit.logInTransaction).not.toHaveBeenCalled();
    });

    it('actor YOK (undefined) → falsePositive 403', async () => {
      armActive();
      await expect(service.falsePositive(TENANT, 'cis-1', undefined as any)).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.clientIntelStatement.update).not.toHaveBeenCalled();
    });

    it('retract: audit AYNI transaction içinde actor + oldValues/newValues ile yazılır', async () => {
      armActive();
      mockPrisma.clientIntelStatement.update.mockResolvedValue({ id: 'cis-1', status: 'RETRACTED' });
      await service.retract(TENANT, 'cis-1', USER, 'not');
      expect(mockAudit.logInTransaction).toHaveBeenCalledTimes(1);
      const [, input] = mockAudit.logInTransaction.mock.calls[0];
      expect(input).toMatchObject({
        tenantId: TENANT,
        action: 'CLIENT_INTEL_STATEMENT_RETRACT',
        entityType: 'CLIENT_INTEL_STATEMENT',
        entityId: 'cis-1',
        userId: USER,
      });
      expect(input.oldValues.status).toBe('ACTIVE');
      expect(input.newValues.status).toBe('RETRACTED');
    });

    it('falsePositive: audit action CLIENT_INTEL_STATEMENT_FALSE_POSITIVE', async () => {
      armActive();
      mockPrisma.clientIntelStatement.update.mockResolvedValue({ id: 'cis-1', status: 'FALSE_POSITIVE' });
      await service.falsePositive(TENANT, 'cis-1', USER);
      expect(mockAudit.logInTransaction.mock.calls[0][1].action).toBe('CLIENT_INTEL_STATEMENT_FALSE_POSITIVE');
    });

    it('yetkisiz kullanıcı → supersede 403, create/update ÇAĞRILMAZ', async () => {
      mockPrisma.clientIntelStatement.findFirst.mockResolvedValue({ id: 'old-1', status: 'ACTIVE', caseId: CASE, debtorId: DEBTOR, category: 'INCOME_SOURCE', label: 'L' });
      mockOfficeApproval.isApproverEligible.mockResolvedValueOnce(false);
      await expect(service.supersede(TENANT, 'old-1', USER, { value: 'x' })).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.clientIntelStatement.create).not.toHaveBeenCalled();
      expect(mockPrisma.clientIntelStatement.update).not.toHaveBeenCalled();
    });

    it('supersede: audit AYNI transaction içinde (CLIENT_INTEL_STATEMENT_SUPERSEDE)', async () => {
      mockPrisma.clientIntelStatement.findFirst.mockResolvedValue({ id: 'old-1', status: 'ACTIVE', caseId: CASE, debtorId: DEBTOR, category: 'INCOME_SOURCE', label: 'L' });
      mockPrisma.clientIntelStatement.create.mockResolvedValue({ id: 'new-1', status: 'ACTIVE' });
      await service.supersede(TENANT, 'old-1', USER, { value: 'Nakliyeci' });
      expect(mockAudit.logInTransaction).toHaveBeenCalledTimes(1);
      const [, input] = mockAudit.logInTransaction.mock.calls[0];
      expect(input).toMatchObject({ action: 'CLIENT_INTEL_STATEMENT_SUPERSEDE', entityType: 'CLIENT_INTEL_STATEMENT', entityId: 'old-1', userId: USER });
    });

    it('create() capability-gate\'e TABİ DEĞİL — isApproverEligible hiç çağrılmaz', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: CASE });
      mockPrisma.debtor.findFirst.mockResolvedValue({ id: DEBTOR });
      mockPrisma.clientIntelStatement.create.mockResolvedValue({ id: 'cis-x', status: 'ACTIVE' });
      await service.create(TENANT, CASE, USER, dto);
      expect(mockOfficeApproval.isApproverEligible).not.toHaveBeenCalled();
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
