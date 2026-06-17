import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ClientIntakePromotionService } from './client-intake-promotion.service';
import { findOrCreateDebtorAddress } from '@/common/address-hash.util';

jest.mock('@/common/address-hash.util', () => ({ findOrCreateDebtorAddress: jest.fn() }));
const mockFindOrCreate = findOrCreateDebtorAddress as jest.Mock;

const TENANT = 'tenant-1';
const USER = 'user-1';
const SUB = 'sub-1';
const CASE = 'case-1';
const DEBTOR = 'debtor-1';

const mockPrisma: any = {
  clientIntakeSubmission: { findFirst: jest.fn(), update: jest.fn() },
  clientIntakeField: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), count: jest.fn() },
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
    expect(mockPrisma.clientIntakeField.update).toHaveBeenCalledWith({ where: { id: 'f-1' }, data: expect.objectContaining({ promotedRefType: 'ClientIntelStatement', promotedRefId: 'cis-1', promotedById: USER, promotedAt: expect.any(Date) }) });
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

  // ==================== Faz 4.6b — promoteAddress ====================
  describe('promoteAddress (ADDRESS → DebtorAddress)', () => {
    const addrDto = { debtorId: DEBTOR, street: 'X Sok 1', city: 'İstanbul' };
    const armAddrField = (over: any = {}) =>
      mockPrisma.clientIntakeField.findFirst.mockResolvedValue({
        id: 'af-1', category: 'ADDRESS', value: 'X Sok 1 Kadıköy', reviewStatus: 'APPROVED', promotedRefId: null,
        submission: { id: SUB, status: 'IN_REVIEW', caseId: CASE }, ...over,
      });

    it('created:true → DebtorAddress(source=CLIENT...) + promotedRef; PROMOTED', async () => {
      armAddrField();
      mockFindOrCreate.mockResolvedValue({ address: { id: 'da-1' }, created: true });
      mockPrisma.clientIntakeField.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1); // approved=1, promoted=1

      const res = await service.promoteAddress(TENANT, 'af-1', USER, addrDto);

      const data = mockFindOrCreate.mock.calls[0][1];
      expect(data).toEqual(expect.objectContaining({
        debtorId: DEBTOR, street: 'X Sok 1', city: 'İstanbul', source: 'CLIENT', type: 'DECLARED',
        addressCategory: 'DECLARED_CLIENT', verified: false, confidenceLevel: 'LOW', rawAddress: 'X Sok 1 Kadıköy',
      }));
      expect(mockPrisma.clientIntakeField.update).toHaveBeenCalledWith({ where: { id: 'af-1' }, data: expect.objectContaining({ promotedRefType: 'DebtorAddress', promotedRefId: 'da-1', promotedById: USER, promotedAt: expect.any(Date) }) });
      expect(res).toEqual({ result: 'PROMOTED', debtorAddressId: 'da-1', submissionStatus: 'COMPLETED' });
    });

    it('created:false (DUPLICATE) → promotedRef DOLDURULMAZ, DUPLICATE_ADDRESS döner', async () => {
      armAddrField();
      mockFindOrCreate.mockResolvedValue({ address: { id: 'da-existing' }, created: false });

      const res = await service.promoteAddress(TENANT, 'af-1', USER, addrDto);

      expect(mockPrisma.clientIntakeField.update).not.toHaveBeenCalled(); // promotedRef set EDİLMEDİ
      expect(res).toEqual({ result: 'DUPLICATE_ADDRESS', debtorAddressId: 'da-existing', submissionStatus: 'IN_REVIEW' });
    });

    it('ADDRESS olmayan alan reddedilir', async () => {
      armAddrField({ category: 'INCOME_SOURCE' });
      await expect(service.promoteAddress(TENANT, 'af-1', USER, addrDto)).rejects.toThrow(BadRequestException);
      expect(mockFindOrCreate).not.toHaveBeenCalled();
    });

    it('APPROVED olmayan alan reddedilir', async () => {
      armAddrField({ reviewStatus: 'PENDING' });
      await expect(service.promoteAddress(TENANT, 'af-1', USER, addrDto)).rejects.toThrow(BadRequestException);
    });

    it('zaten promote edilmiş alan reddedilir (idempotent)', async () => {
      armAddrField({ promotedRefId: 'da-old' });
      await expect(service.promoteAddress(TENANT, 'af-1', USER, addrDto)).rejects.toThrow(BadRequestException);
      expect(mockFindOrCreate).not.toHaveBeenCalled();
    });

    it('debtor casee ait değilse reddedilir', async () => {
      armAddrField();
      mockPrisma.caseDebtor.findFirst.mockResolvedValue(null);
      await expect(service.promoteAddress(TENANT, 'af-1', USER, addrDto)).rejects.toThrow(BadRequestException);
      expect(mockFindOrCreate).not.toHaveBeenCalled();
    });
  });

  // ==================== Faz 4.7 PR-C2a — promoteSoftField (FIELD-LEVEL soft) ====================
  describe('promoteSoftField (tek soft-intel alan → ClientIntelStatement)', () => {
    const armSoftField = (over: any = {}) =>
      mockPrisma.clientIntakeField.findFirst.mockResolvedValue({
        id: 'sf-1', category: 'INCOME_SOURCE', label: 'L', value: 'Müteahhit', reviewStatus: 'APPROVED', promotedRefId: null,
        submission: { id: SUB, status: 'IN_REVIEW', caseId: CASE }, ...over,
      });

    it('soft APPROVED → ClientIntelStatement.create + promotedRef; PROMOTED + COMPLETED', async () => {
      armSoftField();
      mockPrisma.clientIntakeField.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1); // approved=1, promoted=1
      const res = await service.promoteSoftField(TENANT, 'sf-1', USER, DEBTOR);
      expect(mockPrisma.clientIntelStatement.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ tenantId: TENANT, caseId: CASE, debtorId: DEBTOR, category: 'INCOME_SOURCE', value: 'Müteahhit', source: 'CLIENT_DECLARATION', confidence: 'DECLARED', status: 'ACTIVE' }),
      }));
      expect(mockPrisma.clientIntakeField.update).toHaveBeenCalledWith({ where: { id: 'sf-1' }, data: expect.objectContaining({ promotedRefType: 'ClientIntelStatement', promotedRefId: 'cis-1', promotedById: USER, promotedAt: expect.any(Date) }) });
      // C2b-pre red line: yeni promote write'ta promotedAt != null + promotedById == userId
      const stampData = (mockPrisma.clientIntakeField.update.mock.calls.find((c: any) => c[0]?.where?.id === 'sf-1') as any)[0].data;
      expect(stampData.promotedAt).toBeInstanceOf(Date);
      expect(stampData.promotedAt).not.toBeNull();
      expect(stampData.promotedById).toBe(USER);
      expect(res).toEqual({ result: 'PROMOTED', clientIntelStatementId: 'cis-1', submissionStatus: 'COMPLETED' });
    });

    it('ADDRESS → 400 (promote-soft yalnız soft-6); create YOK', async () => {
      armSoftField({ category: 'ADDRESS' });
      await expect(service.promoteSoftField(TENANT, 'sf-1', USER, DEBTOR)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.clientIntelStatement.create).not.toHaveBeenCalled();
    });

    it('ASSET → 400 ve CONTACT → 400 (4.6c yok); create YOK', async () => {
      armSoftField({ category: 'ASSET' });
      await expect(service.promoteSoftField(TENANT, 'sf-1', USER, DEBTOR)).rejects.toThrow(BadRequestException);
      armSoftField({ category: 'CONTACT' });
      await expect(service.promoteSoftField(TENANT, 'sf-1', USER, DEBTOR)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.clientIntelStatement.create).not.toHaveBeenCalled();
    });

    it('APPROVED olmayan alan → 400; create YOK', async () => {
      armSoftField({ reviewStatus: 'PENDING' });
      await expect(service.promoteSoftField(TENANT, 'sf-1', USER, DEBTOR)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.clientIntelStatement.create).not.toHaveBeenCalled();
    });

    it('zaten promote edilmiş alan → 400 (idempotent, çift-yazım yok)', async () => {
      armSoftField({ promotedRefId: 'cis-old' });
      await expect(service.promoteSoftField(TENANT, 'sf-1', USER, DEBTOR)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.clientIntelStatement.create).not.toHaveBeenCalled();
    });

    it('debtor casee ait değilse → 400 (CaseDebtor yok); create YOK', async () => {
      armSoftField();
      mockPrisma.caseDebtor.findFirst.mockResolvedValue(null);
      await expect(service.promoteSoftField(TENANT, 'sf-1', USER, DEBTOR)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.clientIntelStatement.create).not.toHaveBeenCalled();
    });

    it('alan bulunamazsa NotFound', async () => {
      mockPrisma.clientIntakeField.findFirst.mockResolvedValue(null);
      await expect(service.promoteSoftField(TENANT, 'sf-1', USER, DEBTOR)).rejects.toThrow(NotFoundException);
    });

    it('submission IN_REVIEW/PARTIALLY değilse → 400', async () => {
      armSoftField({ submission: { id: SUB, status: 'COMPLETED', caseId: CASE } });
      await expect(service.promoteSoftField(TENANT, 'sf-1', USER, DEBTOR)).rejects.toThrow(BadRequestException);
    });
  });
});
