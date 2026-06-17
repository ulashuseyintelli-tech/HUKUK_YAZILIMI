import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ClientIntakePromotionService } from './client-intake-promotion.service';

const TENANT = 'tenant-1';
const USER = 'user-1';
const SUB = 'sub-1';
const CASE = 'case-1';
const DEBTOR = 'debtor-1';

const mockPrisma: any = {
  clientIntakeSubmission: { findFirst: jest.fn(), update: jest.fn() },
  clientIntakeField: { findMany: jest.fn(), update: jest.fn(), count: jest.fn() },
  clientIntelStatement: { create: jest.fn() },
  debtor: { findFirst: jest.fn() },
  caseDebtor: { findFirst: jest.fn() },
  $transaction: jest.fn(async (fn: any) => fn(mockPrisma)),
};

describe('ClientIntakePromotionService', () => {
  let service: ClientIntakePromotionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.clientIntakeSubmission.findFirst.mockResolvedValue({ id: SUB, status: 'IN_REVIEW', caseId: CASE });
    mockPrisma.debtor.findFirst.mockResolvedValue({ id: DEBTOR });
    mockPrisma.caseDebtor.findFirst.mockResolvedValue({ id: 'cd-1' });
    mockPrisma.clientIntelStatement.create.mockResolvedValue({ id: 'cis-1' });
    mockPrisma.clientIntakeSubmission.update.mockResolvedValue({});
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClientIntakePromotionService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(ClientIntakePromotionService);
  });

  it('soft-intel APPROVED → ClientIntelStatement.create + promotedRef; COMPLETED', async () => {
    mockPrisma.clientIntakeField.findMany.mockResolvedValue([{ id: 'f-1', category: 'INCOME_SOURCE', label: 'L', value: 'Müteahhit' }]);
    mockPrisma.clientIntakeField.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1); // approved=1, promoted=1

    const res = await service.promote(TENANT, SUB, USER, DEBTOR);

    expect(mockPrisma.clientIntelStatement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: TENANT, caseId: CASE, debtorId: DEBTOR, category: 'INCOME_SOURCE', value: 'Müteahhit', source: 'CLIENT_DECLARATION', confidence: 'DECLARED' }),
    }));
    expect(mockPrisma.clientIntakeField.update).toHaveBeenCalledWith({ where: { id: 'f-1' }, data: { promotedRefType: 'ClientIntelStatement', promotedRefId: 'cis-1' } });
    expect(res.promoted).toEqual([{ fieldId: 'f-1', clientIntelStatementId: 'cis-1' }]);
    expect(res.skipped).toEqual([]);
    expect(res.submissionStatus).toBe('COMPLETED');
  });

  it('ADDRESS/ASSET/CONTACT SKIP (4.6b) → PARTIALLY_PROMOTED, skipped raporlanır', async () => {
    mockPrisma.clientIntakeField.findMany.mockResolvedValue([
      { id: 'f-1', category: 'INCOME_SOURCE', label: null, value: 'X' },
      { id: 'f-2', category: 'ADDRESS', label: null, value: 'Y' },
    ]);
    mockPrisma.clientIntakeField.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1); // approved=2, promoted=1

    const res = await service.promote(TENANT, SUB, USER, DEBTOR);

    expect(mockPrisma.clientIntelStatement.create).toHaveBeenCalledTimes(1); // yalnız soft
    expect(res.promoted).toHaveLength(1);
    expect(res.skipped).toEqual([{ fieldId: 'f-2', category: 'ADDRESS', reason: 'NON_SOFT_INTEL_4_6B' }]);
    expect(res.submissionStatus).toBe('PARTIALLY_PROMOTED');
  });

  it('IDEMPOTENT: promote edilecek alan yoksa create YOK', async () => {
    mockPrisma.clientIntakeField.findMany.mockResolvedValue([]); // hepsi zaten promoted/yok
    mockPrisma.clientIntakeField.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    const res = await service.promote(TENANT, SUB, USER, DEBTOR);
    expect(mockPrisma.clientIntelStatement.create).not.toHaveBeenCalled();
    expect(res.promoted).toEqual([]);
  });

  it('submission IN_REVIEW/PARTIALLY_PROMOTED değilse reddedilir', async () => {
    mockPrisma.clientIntakeSubmission.findFirst.mockResolvedValue({ id: SUB, status: 'CLIENT_SUBMITTED', caseId: CASE });
    await expect(service.promote(TENANT, SUB, USER, DEBTOR)).rejects.toThrow(BadRequestException);
  });

  it('debtor tenantta yoksa reddedilir', async () => {
    mockPrisma.debtor.findFirst.mockResolvedValue(null);
    await expect(service.promote(TENANT, SUB, USER, DEBTOR)).rejects.toThrow(BadRequestException);
    expect(mockPrisma.clientIntelStatement.create).not.toHaveBeenCalled();
  });

  it('debtor casee ait değilse reddedilir (CaseDebtor yok)', async () => {
    mockPrisma.caseDebtor.findFirst.mockResolvedValue(null);
    await expect(service.promote(TENANT, SUB, USER, DEBTOR)).rejects.toThrow(BadRequestException);
    expect(mockPrisma.clientIntelStatement.create).not.toHaveBeenCalled();
  });

  it('submission bulunamazsa NotFound', async () => {
    mockPrisma.clientIntakeSubmission.findFirst.mockResolvedValue(null);
    await expect(service.promote(TENANT, SUB, USER, DEBTOR)).rejects.toThrow(NotFoundException);
  });
});
