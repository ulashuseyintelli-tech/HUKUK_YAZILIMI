import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ClientIntakePromotionService } from './client-intake-promotion.service';
import { findOrCreateDebtorAddress } from '@/common/address-hash.util';
import { AuditService } from '../audit/audit.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';

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

// I1A: promote/promoteAddress/promoteSoft capability-gate — mevcut testler eligible aktör varsayar.
const mockAudit = { log: jest.fn().mockResolvedValue(undefined), logInTransaction: jest.fn().mockResolvedValue(undefined) };
const mockOfficeApproval = { isApproverEligible: jest.fn().mockResolvedValue(true) };

describe('ClientIntakePromotionService', () => {
  let service: ClientIntakePromotionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.clientIntakeSubmission.findFirst.mockResolvedValue({ id: SUB, status: 'IN_REVIEW', caseId: CASE });
    mockPrisma.debtor.findFirst.mockResolvedValue({ id: DEBTOR });
    mockPrisma.caseDebtor.findFirst.mockResolvedValue({ id: 'cd-1' });
    mockPrisma.clientIntelStatement.create.mockResolvedValue({ id: 'cis-1' });
    mockPrisma.clientIntakeSubmission.update.mockResolvedValue({});
    mockOfficeApproval.isApproverEligible.mockResolvedValue(true);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientIntakePromotionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: OfficeApprovalService, useValue: mockOfficeApproval },
      ],
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

  it('ADDRESS SKIP (yalnız ADDRESS artık atlanır — CLIENT-INTEL-4.6C ile ASSET/CONTACT da promote olur) → PARTIALLY_PROMOTED', async () => {
    mockPrisma.clientIntakeField.findMany.mockResolvedValue([
      { id: 'f-1', category: 'INCOME_SOURCE', label: null, value: 'X' },
      { id: 'f-2', category: 'ADDRESS', label: null, value: 'Y' },
    ]);
    mockPrisma.clientIntakeField.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1); // approved=2, promoted=1

    const res = await service.promote(TENANT, SUB, USER, DEBTOR);

    expect(mockPrisma.clientIntelStatement.create).toHaveBeenCalledTimes(1); // yalnız soft (ADDRESS hariç)
    expect(res.promoted).toHaveLength(1);
    expect(res.skipped).toEqual([{ fieldId: 'f-2', category: 'ADDRESS', reason: 'NON_SOFT_INTEL_4_6B' }]);
    expect(res.submissionStatus).toBe('PARTIALLY_PROMOTED');
  });

  it('CLIENT-INTEL-4.6C: ASSET + CONTACT alanları da promote() ile ClientIntelStatement üretir (submission-level)', async () => {
    mockPrisma.clientIntakeField.findMany.mockResolvedValue([
      { id: 'f-asset', category: 'ASSET', label: null, value: 'Gri bir aracı var, plakasını bilmiyorum' },
      { id: 'f-contact', category: 'CONTACT', label: null, value: 'Kız kardeşinin telefonu: 05551234567' },
    ]);
    mockPrisma.clientIntakeField.count.mockResolvedValueOnce(2).mockResolvedValueOnce(2); // approved=2, promoted=2

    const res = await service.promote(TENANT, SUB, USER, DEBTOR);

    expect(mockPrisma.clientIntelStatement.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.clientIntelStatement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ category: 'ASSET_DECLARATION', value: 'Gri bir aracı var, plakasını bilmiyorum' }),
    }));
    expect(mockPrisma.clientIntelStatement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ category: 'CONTACT_DECLARATION', value: 'Kız kardeşinin telefonu: 05551234567' }),
    }));
    expect(res.skipped).toEqual([]);
    expect(res.submissionStatus).toBe('COMPLETED');
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

  describe('I1A — capability gate + audit (promote, bulk)', () => {
    it('yetkisiz kullanıcı (isApproverEligible=false) → 403, create/update ÇAĞRILMAZ, audit YOK', async () => {
      mockPrisma.clientIntakeField.findMany.mockResolvedValue([{ id: 'f-1', category: 'INCOME_SOURCE', label: 'L', value: 'X' }]);
      mockOfficeApproval.isApproverEligible.mockResolvedValueOnce(false);
      await expect(service.promote(TENANT, SUB, USER, DEBTOR)).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.clientIntelStatement.create).not.toHaveBeenCalled();
      expect(mockPrisma.clientIntakeField.update).not.toHaveBeenCalled();
      expect(mockAudit.log).not.toHaveBeenCalled();
    });

    it('actor YOK (undefined) → 403', async () => {
      await expect(service.promote(TENANT, SUB, undefined as any, DEBTOR)).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.clientIntelStatement.create).not.toHaveBeenCalled();
    });

    it('en az bir alan promote edilirse audit.log ile özet yazılır (CLIENT_INTAKE_PROMOTE)', async () => {
      mockPrisma.clientIntakeField.findMany.mockResolvedValue([{ id: 'f-1', category: 'INCOME_SOURCE', label: 'L', value: 'Müteahhit' }]);
      mockPrisma.clientIntakeField.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
      await service.promote(TENANT, SUB, USER, DEBTOR);
      expect(mockAudit.log).toHaveBeenCalledTimes(1);
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: TENANT,
        action: 'CLIENT_INTAKE_PROMOTE',
        entityType: 'CLIENT_INTAKE_SUBMISSION',
        entityId: SUB,
        userId: USER,
      }));
    });

    it('hiçbir alan promote edilmezse (promoted boş) audit YAZILMAZ', async () => {
      mockPrisma.clientIntakeField.findMany.mockResolvedValue([]); // idempotent no-op senaryosu
      mockPrisma.clientIntakeField.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
      await service.promote(TENANT, SUB, USER, DEBTOR);
      expect(mockAudit.log).not.toHaveBeenCalled();
    });
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

    it('I1A: yetkisiz kullanıcı → 403, findOrCreate ÇAĞRILMAZ, audit YOK', async () => {
      armAddrField();
      mockOfficeApproval.isApproverEligible.mockResolvedValueOnce(false);
      await expect(service.promoteAddress(TENANT, 'af-1', USER, addrDto)).rejects.toThrow(ForbiddenException);
      expect(mockFindOrCreate).not.toHaveBeenCalled();
      expect(mockAudit.logInTransaction).not.toHaveBeenCalled();
    });

    it('I1A: audit AYNI transaction içinde yazılır (CLIENT_INTAKE_PROMOTE_ADDRESS, created:true)', async () => {
      armAddrField();
      mockFindOrCreate.mockResolvedValue({ address: { id: 'da-1' }, created: true });
      mockPrisma.clientIntakeField.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
      await service.promoteAddress(TENANT, 'af-1', USER, addrDto);
      expect(mockAudit.logInTransaction).toHaveBeenCalledTimes(1);
      const [, input] = mockAudit.logInTransaction.mock.calls[0];
      expect(input).toMatchObject({
        tenantId: TENANT, action: 'CLIENT_INTAKE_PROMOTE_ADDRESS', entityType: 'CLIENT_INTAKE_FIELD',
        entityId: 'af-1', userId: USER, newValues: { promotedRefId: 'da-1' },
      });
    });

    it('I1A: DUPLICATE (created:false) → audit YAZILMAZ', async () => {
      armAddrField();
      mockFindOrCreate.mockResolvedValue({ address: { id: 'da-existing' }, created: false });
      await service.promoteAddress(TENANT, 'af-1', USER, addrDto);
      expect(mockAudit.logInTransaction).not.toHaveBeenCalled();
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

    it('ADDRESS → 400 (promote-soft artık soft-8 kapsıyor — ADDRESS hâlâ ayrı promote-address ister); create YOK', async () => {
      armSoftField({ category: 'ADDRESS' });
      await expect(service.promoteSoftField(TENANT, 'sf-1', USER, DEBTOR)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.clientIntelStatement.create).not.toHaveBeenCalled();
    });

    it('CLIENT-INTEL-4.6C: ASSET APPROVED → ClientIntelStatement(category=ASSET_DECLARATION) + promotedRef; PROMOTED', async () => {
      armSoftField({ category: 'ASSET', value: 'Bir aracı ve İstanbul’da bir dairesi olduğunu söyledi' });
      mockPrisma.clientIntakeField.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
      const res = await service.promoteSoftField(TENANT, 'sf-1', USER, DEBTOR);
      expect(mockPrisma.clientIntelStatement.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ category: 'ASSET_DECLARATION', value: 'Bir aracı ve İstanbul’da bir dairesi olduğunu söyledi' }),
      }));
      expect(res).toEqual({ result: 'PROMOTED', clientIntelStatementId: 'cis-1', submissionStatus: 'COMPLETED' });
    });

    it('CLIENT-INTEL-4.6C: CONTACT APPROVED → ClientIntelStatement(category=CONTACT_DECLARATION) + promotedRef; PROMOTED', async () => {
      armSoftField({ category: 'CONTACT', value: 'İş yeri telefonu: 0212 555 00 00' });
      mockPrisma.clientIntakeField.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
      const res = await service.promoteSoftField(TENANT, 'sf-1', USER, DEBTOR);
      expect(mockPrisma.clientIntelStatement.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ category: 'CONTACT_DECLARATION', value: 'İş yeri telefonu: 0212 555 00 00' }),
      }));
      expect(res).toEqual({ result: 'PROMOTED', clientIntelStatementId: 'cis-1', submissionStatus: 'COMPLETED' });
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

    it('I1A: yetkisiz kullanıcı → 403, create ÇAĞRILMAZ, audit YOK', async () => {
      armSoftField();
      mockOfficeApproval.isApproverEligible.mockResolvedValueOnce(false);
      await expect(service.promoteSoftField(TENANT, 'sf-1', USER, DEBTOR)).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.clientIntelStatement.create).not.toHaveBeenCalled();
      expect(mockAudit.logInTransaction).not.toHaveBeenCalled();
    });

    it('I1A: actor YOK (undefined) → 403', async () => {
      armSoftField();
      await expect(service.promoteSoftField(TENANT, 'sf-1', undefined as any, DEBTOR)).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.clientIntelStatement.create).not.toHaveBeenCalled();
    });

    it('I1A: audit AYNI transaction içinde actor ile yazılır (CLIENT_INTAKE_PROMOTE_SOFT)', async () => {
      armSoftField();
      mockPrisma.clientIntakeField.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
      await service.promoteSoftField(TENANT, 'sf-1', USER, DEBTOR);
      expect(mockAudit.logInTransaction).toHaveBeenCalledTimes(1);
      const [, input] = mockAudit.logInTransaction.mock.calls[0];
      expect(input).toMatchObject({
        tenantId: TENANT, action: 'CLIENT_INTAKE_PROMOTE_SOFT', entityType: 'CLIENT_INTAKE_FIELD',
        entityId: 'sf-1', userId: USER, newValues: { promotedRefId: 'cis-1' },
      });
    });
  });
});
