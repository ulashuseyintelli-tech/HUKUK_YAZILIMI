import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClientIntakeReviewService } from './client-intake-review.service';
import { ClientIntakeReviewModule } from './client-intake-review.module';

const TENANT = 'tenant-1';
const USER = 'user-1';

// Kanonik modeller mock'ta VAR — review sonrası HİÇ çağrılmamalı (davranışsal sınır).
const mockPrisma: any = {
  clientIntakeSubmission: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  clientIntakeField: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  clientIntelStatement: { create: jest.fn() },
  asset: { create: jest.fn() },
  debtorAddress: { create: jest.fn() },
  debtorCommunication: { create: jest.fn() },
  $transaction: jest.fn(async (arr: any[]) => arr),
};

describe('ClientIntakeReviewService', () => {
  let service: ClientIntakeReviewService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.clientIntakeSubmission.update.mockResolvedValue({ id: 'sub-1', status: 'IN_REVIEW' });
    mockPrisma.clientIntakeField.update.mockResolvedValue({ id: 'f-1' });
    mockPrisma.clientIntakeField.updateMany.mockResolvedValue({ count: 1 });
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClientIntakeReviewService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(ClientIntakeReviewService);
  });

  const assertNoCanonicalWrite = () => {
    expect(mockPrisma.clientIntelStatement.create).not.toHaveBeenCalled();
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
    expect(mockPrisma.debtorAddress.create).not.toHaveBeenCalled();
    expect(mockPrisma.debtorCommunication.create).not.toHaveBeenCalled();
  };

  describe('claim', () => {
    it('CLIENT_SUBMITTED → IN_REVIEW (+claimedById/At)', async () => {
      mockPrisma.clientIntakeSubmission.findFirst.mockResolvedValue({ id: 'sub-1', status: 'CLIENT_SUBMITTED' });
      await service.claim(TENANT, 'sub-1', USER);
      expect(mockPrisma.clientIntakeSubmission.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: expect.objectContaining({ status: 'IN_REVIEW', claimedById: USER, claimedAt: expect.any(Date) }),
      });
      assertNoCanonicalWrite();
    });

    it('CLIENT_SUBMITTED olmayan claim reddedilir (ikinci personel)', async () => {
      mockPrisma.clientIntakeSubmission.findFirst.mockResolvedValue({ id: 'sub-1', status: 'IN_REVIEW' });
      await expect(service.claim(TENANT, 'sub-1', USER)).rejects.toThrow(BadRequestException);
    });
  });

  describe('reviewField', () => {
    it('IN_REVIEW + promote edilmemiş → APPROVED', async () => {
      mockPrisma.clientIntakeField.findFirst.mockResolvedValue({ id: 'f-1', promotedRefId: null, submission: { id: 'sub-1', status: 'IN_REVIEW' } });
      mockPrisma.clientIntakeSubmission.findFirst.mockResolvedValue({ id: 'sub-1', fields: [] }); // getOne
      await service.reviewField(TENANT, 'f-1', USER, 'APPROVE', 'uygun');
      expect(mockPrisma.clientIntakeField.update).toHaveBeenCalledWith({ where: { id: 'f-1' }, data: { reviewStatus: 'APPROVED', reviewNote: 'uygun' } });
      assertNoCanonicalWrite();
    });

    it('submission IN_REVIEW değilse reddedilir (claim şart)', async () => {
      mockPrisma.clientIntakeField.findFirst.mockResolvedValue({ id: 'f-1', promotedRefId: null, submission: { id: 'sub-1', status: 'CLIENT_SUBMITTED' } });
      await expect(service.reviewField(TENANT, 'f-1', USER, 'APPROVE')).rejects.toThrow(BadRequestException);
    });

    it('PROMOTE edilmiş alan değiştirilemez', async () => {
      mockPrisma.clientIntakeField.findFirst.mockResolvedValue({ id: 'f-1', promotedRefId: 'cis-9', submission: { id: 'sub-1', status: 'IN_REVIEW' } });
      await expect(service.reviewField(TENANT, 'f-1', USER, 'REJECT')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.clientIntakeField.update).not.toHaveBeenCalled();
    });

    it('alan bulunamazsa NotFound', async () => {
      mockPrisma.clientIntakeField.findFirst.mockResolvedValue(null);
      await expect(service.reviewField(TENANT, 'f-1', USER, 'APPROVE')).rejects.toThrow(NotFoundException);
    });
  });

  describe('bulkReviewFields', () => {
    it('IN_REVIEW → yalniz bu submissionin promote edilmemis alanlari', async () => {
      mockPrisma.clientIntakeSubmission.findFirst
        .mockResolvedValueOnce({ id: 'sub-1', status: 'IN_REVIEW' }) // findOwned
        .mockResolvedValue({ id: 'sub-1', fields: [] }); // getOne
      await service.bulkReviewFields(TENANT, 'sub-1', USER, ['f-1', 'f-2'], 'APPROVE');
      expect(mockPrisma.clientIntakeField.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['f-1', 'f-2'] }, submissionId: 'sub-1', promotedRefId: null },
        data: { reviewStatus: 'APPROVED', reviewNote: null },
      });
      assertNoCanonicalWrite();
    });

    it('IN_REVIEW değilse reddedilir', async () => {
      mockPrisma.clientIntakeSubmission.findFirst.mockResolvedValue({ id: 'sub-1', status: 'CLIENT_SUBMITTED' });
      await expect(service.bulkReviewFields(TENANT, 'sub-1', USER, ['f-1'], 'APPROVE')).rejects.toThrow(BadRequestException);
    });
  });

  describe('rejectSubmission', () => {
    it('→ REJECTED + PENDING alanlar REJECTED (APPROVEDa dokunmaz)', async () => {
      mockPrisma.clientIntakeSubmission.findFirst
        .mockResolvedValueOnce({ id: 'sub-1', status: 'IN_REVIEW' }) // findOwned
        .mockResolvedValue({ id: 'sub-1', fields: [] }); // getOne
      await service.rejectSubmission(TENANT, 'sub-1', USER, 'eksik');
      expect(mockPrisma.clientIntakeSubmission.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sub-1' }, data: expect.objectContaining({ status: 'REJECTED' }) }));
      // YALNIZ PENDING → REJECTED
      expect(mockPrisma.clientIntakeField.updateMany).toHaveBeenCalledWith({
        where: { submissionId: 'sub-1', reviewStatus: 'PENDING' },
        data: { reviewStatus: 'REJECTED' },
      });
      assertNoCanonicalWrite();
    });

    it('terminal submission reddedilemez', async () => {
      mockPrisma.clientIntakeSubmission.findFirst.mockResolvedValue({ id: 'sub-1', status: 'REJECTED' });
      await expect(service.rejectSubmission(TENANT, 'sub-1', USER)).rejects.toThrow(BadRequestException);
    });
  });

  describe('listQueue', () => {
    it('default CLIENT_SUBMITTED + IN_REVIEW', async () => {
      mockPrisma.clientIntakeSubmission.findMany.mockResolvedValue([]);
      await service.listQueue(TENANT, {});
      expect(mockPrisma.clientIntakeSubmission.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { tenantId: TENANT, status: { in: ['CLIENT_SUBMITTED', 'IN_REVIEW'] } },
      }));
    });
  });

  describe('⛔ MİMARİ SINIR (yapısal)', () => {
    it('ReviewQueueModule YALNIZ PrismaModule import eder (promote/kanonik YOK)', () => {
      const imports = Reflect.getMetadata('imports', ClientIntakeReviewModule) || [];
      expect(imports).toEqual([PrismaModule]);
      const names = imports.map((m: any) => m?.name || '');
      expect(names.some((n: string) => /Promotion|IntelStatement|Debtor|Asset/.test(n))).toBe(false);
    });

    it('servis kanonik create metodu ÇAĞIRMAZ (davranışsal)', () => {
      // service yalnız PrismaService'e bağlı — provider grafiğinde kanonik/promote yok.
      expect((service as any).intelStatement).toBeUndefined();
      expect((service as any).promotion).toBeUndefined();
    });
  });
});
