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

    // P05C-P04 UYARLAMASI: imza (dto, trustedTenant, actorUserId?, idempotencyKey?) oldu.
    // Güvenlik değişmezi KORUNUR: 1. arg dto (trusted tenant), 2. arg trusted tenant.
    // actorUserId = req.user.id (server-authoritative); ek arg'lar sızıntı değil.
    it('POST /uyap/test/payment-order → sendPaymentOrder(dto, trustedTenant, req.user.id, ...)', async () => {
      const { controller, uyapService } = buildController();
      await controller.testPaymentOrder({ caseId: 'c1' }, 'tenant-A', { user: { id: 'u1' } });
      const call = uyapService.sendPaymentOrder.mock.calls[0];
      expect(call[0]).toEqual(expect.objectContaining({ tenantId: 'tenant-A' }));
      expect(call[1]).toBe('tenant-A'); // trusted tenant (güvenlik değişmezi)
      expect(call[2]).toBe('u1'); // actorUserId = req.user.id (body'den DEĞİL)
    });

    it('POST /uyap/haciz → pushHacizRequest(dto, trustedTenant, req.user.id, ...)', async () => {
      const { controller, uyapService } = buildController();
      await controller.pushHacizRequest({ caseId: 'c1' }, 'tenant-A', { user: { id: 'u1' } });
      const call = uyapService.pushHacizRequest.mock.calls[0];
      expect(call[0]).toEqual(expect.objectContaining({ tenantId: 'tenant-A' }));
      expect(call[1]).toBe('tenant-A'); // trusted tenant (güvenlik değişmezi)
      expect(call[2]).toBe('u1'); // actorUserId = req.user.id (client lawyerId DEĞİL)
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

  /**
   * UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02 UYARLAMASI (owner §7 "retry owner: SINGLE").
   *
   * Bu blok önceden retry RE-DISPATCH'inin tenant-ownership propagation'ını test
   * ediyordu: "retry sırasında üretilen YENİ log satırı, kaynak satırın kendi
   * tenantId'sini taşır; requestData'daki stale tenant kullanılmaz".
   *
   * O yol ARTIK YOK. `UyapRequestLog.status`/`retryCount`, `UyapAttempt` lineage'ından
   * bağımsız İKİNCİ bir retry state machine'iydi (duplicate retry ownership) ve
   * dispatcher'ı UYAP-RETRY-CONTAIN-01 ile zaten kapalıydı; ölü ama tehlikeli gövde
   * kaldırıldı.
   *
   * CLIENT-SEC-H2C-P02-R1'in koruduğu güvenlik güvencesi ("retry asla sahte/stale
   * tenant ile log üretmez") KAYBOLMADI — daha güçlü biçimde sağlanıyor: retry hiç
   * log üretmiyor. Testler bu daha güçlü invariant'ı doğrulayacak şekilde yeniden
   * yazıldı.
   */
  describe('Service retry — KALDIRILDI (retry ownership: UyapAttempt)', () => {
    const buildService = () => {
      const prisma: any = {
        uyapRequestLog: {
          create: jest.fn().mockResolvedValue({ id: 'new-log' }),
          update: jest.fn().mockResolvedValue({}),
          findMany: jest.fn().mockResolvedValue([]),
        },
        case: { findFirst: jest.fn().mockResolvedValue(null) },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const validationGate: any = { checkPreHacizIntelligence: jest.fn().mockResolvedValue({ isValid: true, warnings: [], debtors: [] }) };
      const casePolicyEngine: any = {
        canPerformAction: jest.fn().mockResolvedValue({ allowed: true, traceId: 'trace-allow' }),
      };
      const service = new UyapService(prisma, {} as any, validationGate, { report: jest.fn() } as any, casePolicyEngine);
      return { service, prisma };
    };

    it('retryFailedRequests fail-closed atar — sessiz no-op DEĞİL', async () => {
      const { service } = buildService();

      await expect(service.retryFailedRequests()).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'UYAP_RETRY_CONTRACT_MISSING' }),
      });
    });

    it('retry yolu HİÇBİR log satırı okumaz/yazmaz (stale tenant riski yapısal olarak yok)', async () => {
      const { service, prisma } = buildService();

      await expect(service.retryFailedRequests()).rejects.toThrow();

      // Kaynak satır bile okunmaz → sahte/stale tenant ile YENİ log üretimi İMKANSIZ.
      expect(prisma.uyapRequestLog.findMany).not.toHaveBeenCalled();
      expect(prisma.uyapRequestLog.create).not.toHaveBeenCalled();
      // Bağımsız retry state (status/retryCount) da yazılmaz.
      expect(prisma.uyapRequestLog.update).not.toHaveBeenCalled();
    });
  });
});
