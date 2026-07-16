import { ForbiddenException } from '@nestjs/common';
import { UyapService } from '../uyap.service';

/**
 * CLIENT-SEC-H2C-P02 — UyapRequestLog new-write tenant population.
 *
 * Kapsam:
 * - Yeni "brand-new" tenant-bound metotlar (checkTebligatStatus/checkMtsStatus/
 *   queryRelatedLawsuitStatus/queryDebtorAssets): doğru tenantId yazar, missing context'te
 *   fail closed (ForbiddenException, Prisma HİÇ çağrılmaz).
 * - Mevcut opsiyonel-tenantId alanını (POA amaçlı) yeniden kullanan metotlar
 *   (pushHacizRequest/sendPaymentOrder): tenantId varsa yazılır; YOKSA mevcut test edilmiş
 *   davranış (haciz-decision-audit.spec.ts) KORUNUR — işlem fail-closed OLMAZ, yalnız log
 *   satırı tenantId=NULL kalır (sentinel/sahte tenant ÜRETİLMEZ).
 * - System-scoped retryFailedRequests: raw update tenantId'ye HİÇ dokunmaz (ownership korunur).
 * - logResponse (tüm başarı/hata yanıt güncellemeleri): tenantId alanına dokunmaz.
 */
describe('CLIENT-SEC-H2C-P02 — UyapRequestLog tenant write population', () => {
  const buildService = (overrides: any = {}) => {
    const prisma: any = {
      uyapRequestLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      case: { findFirst: jest.fn().mockResolvedValue(null) },
      ...overrides,
    };
    const poaService: any = {};
    const validationGate: any = { checkPreHacizIntelligence: jest.fn().mockResolvedValue({ isValid: true, warnings: [], debtors: [] }) };
    const errorReporter: any = { report: jest.fn() };
    const service = new UyapService(prisma, poaService, validationGate, errorReporter, undefined);
    return { service, prisma };
  };

  describe('Brand-new tenant-bound metotlar — fail-closed + doğru yazım', () => {
    it('checkTebligatStatus: tenantId varsa create tenantId ile çağrılır', async () => {
      const { service, prisma } = buildService();
      await service.checkTebligatStatus('tebligat-1', 'tenant-A');
      expect(prisma.uyapRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-A' }) }),
      );
    });

    it('checkTebligatStatus: tenant context yoksa fail closed, Prisma HİÇ çağrılmaz', async () => {
      const { service, prisma } = buildService();
      await expect(service.checkTebligatStatus('tebligat-1', undefined as any)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.uyapRequestLog.create).not.toHaveBeenCalled();
    });

    it('checkMtsStatus: tenantId varsa create tenantId ile çağrılır', async () => {
      const { service, prisma } = buildService();
      await service.checkMtsStatus('MTS-1', 'tenant-A');
      expect(prisma.uyapRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-A' }) }),
      );
    });

    it('checkMtsStatus: tenant context yoksa fail closed', async () => {
      const { service, prisma } = buildService();
      await expect(service.checkMtsStatus('MTS-1', undefined as any)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.uyapRequestLog.create).not.toHaveBeenCalled();
    });

    it('queryRelatedLawsuitStatus: tenantId varsa create tenantId ile çağrılır', async () => {
      const { service, prisma } = buildService();
      await service.queryRelatedLawsuitStatus('EVK-1', 'tenant-A');
      expect(prisma.uyapRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-A' }) }),
      );
    });

    it('queryRelatedLawsuitStatus: tenant context yoksa fail closed', async () => {
      const { service, prisma } = buildService();
      await expect(service.queryRelatedLawsuitStatus('EVK-1', undefined as any)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.uyapRequestLog.create).not.toHaveBeenCalled();
    });

    it('queryDebtorAssets: tenantId varsa create tenantId ile çağrılır', async () => {
      const { service, prisma } = buildService();
      await service.queryDebtorAssets('12345678901', 'case-1', 'tenant-A');
      expect(prisma.uyapRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-A' }) }),
      );
    });

    it('queryDebtorAssets: tenant context yoksa fail closed', async () => {
      const { service, prisma } = buildService();
      await expect(
        service.queryDebtorAssets('12345678901', 'case-1', undefined as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.uyapRequestLog.create).not.toHaveBeenCalled();
    });
  });

  describe('Mevcut opsiyonel-tenantId alanını yeniden kullanan metotlar — mevcut davranış korunur', () => {
    it('pushHacizRequest: request.tenantId varsa create tenantId ile çağrılır', async () => {
      const { service, prisma } = buildService();
      await service.pushHacizRequest({
        caseId: 'case-1',
        targetType: 'BANK',
        targetDetails: {},
        amount: 1000,
        tenantId: 'tenant-A',
        skipPoaCheck: true,
      });
      expect(prisma.uyapRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-A' }) }),
      );
    });

    it('pushHacizRequest: tenantId YOKSA fail-closed OLMAZ (mevcut test edilmiş davranış korunur) — log satırı tenantId NULL', async () => {
      const { service, prisma } = buildService();
      const res = await service.pushHacizRequest({
        caseId: 'case-1',
        targetType: 'BANK',
        targetDetails: {},
        amount: 1000,
        skipPoaCheck: true,
      });
      expect(res.success).toBe(true);
      expect(prisma.uyapRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: null }) }),
      );
    });

    it('sendPaymentOrder: request.tenantId varsa create tenantId ile çağrılır', async () => {
      const { service, prisma } = buildService();
      await service.sendPaymentOrder({
        caseId: 'case-1',
        executionOfficeCode: 'OFF-1',
        creditor: { name: 'Alacaklı' },
        debtor: { name: 'Borçlu' },
        amount: 1000,
        currency: 'TRY',
        tenantId: 'tenant-A',
        skipPoaCheck: true,
      });
      expect(prisma.uyapRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-A' }) }),
      );
    });
  });

  describe('System-scoped retry — ownership değişmez', () => {
    it('retryFailedRequests: raw update tenantId alanına HİÇ dokunmaz', async () => {
      const { service, prisma } = buildService({
        uyapRequestLog: {
          create: jest.fn().mockResolvedValue({ id: 'log-1' }),
          update: jest.fn().mockResolvedValue({}),
          findMany: jest.fn().mockResolvedValue([
            { id: 'failed-1', requestType: 'checkMtsStatus', requestData: {}, retryCount: 0 },
          ]),
        },
      });

      await service.retryFailedRequests();

      expect(prisma.uyapRequestLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'failed-1' },
          data: expect.not.objectContaining({ tenantId: expect.anything() }),
        }),
      );
    });
  });

  describe('logResponse — tenant ownership update sırasında değişmez', () => {
    it('başarılı yanıt güncellemesi tenantId alanına dokunmaz', async () => {
      const { service, prisma } = buildService();
      await service.checkMtsStatus('MTS-1', 'tenant-A');

      const updateCalls = prisma.uyapRequestLog.update.mock.calls;
      expect(updateCalls.length).toBeGreaterThan(0);
      for (const call of updateCalls) {
        expect(call[0].data).not.toHaveProperty('tenantId');
      }
    });
  });
});
