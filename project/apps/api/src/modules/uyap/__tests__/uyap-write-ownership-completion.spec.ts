import { UyapController } from '../uyap.controller';
import { UyapService } from '../uyap.service';

/**
 * CLIENT-SEC-H2C-P02-R1 — UYAP write-ownership completion.
 *
 * P02'nin eksik bıraktığı 5 canlı yazma yolu için tamamlama:
 * beş metot artık authenticated context'ten (JWT principal) gelen AYRI, zorunlu bir trusted
 * `tenantId` parametresi taşıyor; log ownership yalnız buradan gelir (business DTO'nun POA
 * amaçlı opsiyonel `tenantId` alanından DEĞİL). Business/POA/audit davranışı değişmez.
 *
 * Kapsam:
 * - Controller: 5 production route @CurrentUser('tenantId')'i trusted param olarak service'e geçirir.
 * - Service: authenticated tenant → logRequest → yeni UyapRequestLog.tenantId non-null.
 * - DTO body'sindeki farklı tenantId trusted context'i override edemez.
 * - Retry: tenant-owned failed log re-dispatch edilince yeni log AYNI tenantId ile oluşur
 *   (requestData'dan DEĞİL, log satırının kendi tenantId'sinden); legacy NULL satır re-dispatch
 *   edilmez (sahte tenant üretilmez, yeni NULL log oluşmaz).
 */
describe('CLIENT-SEC-H2C-P02-R1 — UYAP write-ownership completion', () => {
  describe('Controller — 5 production route trusted tenant\'ı service\'e geçirir', () => {
    const buildController = () => {
      const uyapService: any = {
        sendPaymentOrder: jest.fn().mockResolvedValue({ success: true }),
        pushHacizRequest: jest.fn().mockResolvedValue({ success: true }),
        submitDocument: jest.fn().mockResolvedValue({ success: true }),
        submitCriminalComplaint: jest.fn().mockResolvedValue({ success: true }),
        submitCivilLawsuit: jest.fn().mockResolvedValue({ success: true }),
      };
      const controller = new UyapController(uyapService, {} as any, {} as any);
      return { controller, uyapService };
    };

    it('POST /uyap/test/payment-order → sendPaymentOrder(dto, trustedTenant)', async () => {
      const { controller, uyapService } = buildController();
      await controller.testPaymentOrder({ caseId: 'c1' }, 'tenant-A');
      expect(uyapService.sendPaymentOrder).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-A' }),
        'tenant-A',
      );
    });

    it('POST /uyap/haciz → pushHacizRequest(dto, trustedTenant)', async () => {
      const { controller, uyapService } = buildController();
      await controller.pushHacizRequest({ caseId: 'c1' }, 'tenant-A', { user: { id: 'u1' } });
      expect(uyapService.pushHacizRequest).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-A' }),
        'tenant-A',
      );
    });

    it('POST /uyap/document/submit → submitDocument(dto, trustedTenant)', async () => {
      const { controller, uyapService } = buildController();
      await controller.submitDocument({ caseId: 'c1' }, 'tenant-A');
      expect(uyapService.submitDocument).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-A' }),
        'tenant-A',
      );
    });

    it('POST /uyap/lawsuit/criminal → submitCriminalComplaint(dto, trustedTenant)', async () => {
      const { controller, uyapService } = buildController();
      await controller.submitCriminalComplaint({ caseId: 'c1' }, 'tenant-A');
      expect(uyapService.submitCriminalComplaint).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-A' }),
        'tenant-A',
      );
    });

    it('POST /uyap/lawsuit/civil → submitCivilLawsuit(dto, trustedTenant)', async () => {
      const { controller, uyapService } = buildController();
      await controller.submitCivilLawsuit({ caseId: 'c1' }, 'tenant-A');
      expect(uyapService.submitCivilLawsuit).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-A' }),
        'tenant-A',
      );
    });
  });

  describe('Service retry — ownership log satırının kendi tenantId\'sinden taşınır', () => {
    const buildService = (findManyRows: any[]) => {
      const prisma: any = {
        uyapRequestLog: {
          create: jest.fn().mockResolvedValue({ id: 'new-log' }),
          update: jest.fn().mockResolvedValue({}),
          findMany: jest.fn().mockResolvedValue(findManyRows),
        },
        case: { findFirst: jest.fn().mockResolvedValue(null) },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const validationGate: any = { checkPreHacizIntelligence: jest.fn().mockResolvedValue({ isValid: true, warnings: [], debtors: [] }) };
      const service = new UyapService(prisma, {} as any, validationGate, { report: jest.fn() } as any, undefined);
      return { service, prisma };
    };

    it('tenant-owned failed sendPaymentOrder retry edilince YENİ log AYNI tenantId ile oluşur (requestData\'dan DEĞİL)', async () => {
      const { service, prisma } = buildService([
        {
          id: 'failed-1',
          requestType: 'sendPaymentOrder',
          // requestData içindeki tenantId KASITLI olarak farklı — güvenilmemeli:
          requestData: { caseId: 'c1', skipPoaCheck: true, tenantId: 'STALE-BODY-TENANT' },
          tenantId: 'tenant-owner', // log satırının KENDİ ownership'i
          retryCount: 0,
        },
      ]);

      await service.retryFailedRequests();

      // Retry'in ürettiği YENİ log satırı, kaynak log satırının tenantId'sini taşır:
      expect(prisma.uyapRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-owner' }) }),
      );
      // requestData'daki stale tenant ASLA kullanılmaz:
      expect(prisma.uyapRequestLog.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'STALE-BODY-TENANT' }) }),
      );
    });

    it('legacy tenantId=NULL failed satır re-dispatch EDİLMEZ (sahte tenant yok, yeni NULL log yok)', async () => {
      const { service, prisma } = buildService([
        {
          id: 'legacy-1',
          requestType: 'sendPaymentOrder',
          requestData: { caseId: 'c1', skipPoaCheck: true },
          tenantId: null, // legacy pre-P02 satır
          retryCount: 0,
        },
      ]);

      await service.retryFailedRequests();

      // Re-dispatch atlandı → yeni log create HİÇ çağrılmadı (yeni NULL-owned log oluşmaz):
      expect(prisma.uyapRequestLog.create).not.toHaveBeenCalled();
      // Status/retryCount update'i yine de yapıldı (mevcut retry-yönetimi davranışı korunur):
      expect(prisma.uyapRequestLog.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'legacy-1' }, data: expect.objectContaining({ status: 'RETRY' }) }),
      );
    });
  });
});
