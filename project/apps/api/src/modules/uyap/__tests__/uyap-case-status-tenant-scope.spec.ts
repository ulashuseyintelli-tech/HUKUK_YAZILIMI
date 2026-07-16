import { Reflector } from '@nestjs/core';
import { UyapController } from '../uyap.controller';
import { UyapService } from '../uyap.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

/**
 * CLIENT-SEC-H2B regression — uyap case-status tenant-scope.
 *
 * Kapsam:
 * - (T-01) UyapController sınıf-seviyesinde JwtAuthGuard taşır (unauthenticated davranış korunuyor).
 * - same-tenant status başarılı: case.findFirst({id,tenantId}) çağrılır.
 * - cross-tenant ve nonexistent case AYNI PII-safe sonucu verir (localStatus:'UNKNOWN'; ayırt
 *   edilemez — mevcut STUB tasarımı zaten null'ı böyle ele alıyordu, fix bunu genişletti).
 * - downloadXmlFromCase'in içindeki 2. queryCaseStatus çağrısı da artık tenantId'yi geçiriyor.
 * - CLIENT-SEC-H2A'nın kapattığı /uyap/history route'una DOKUNULMADI (ayrı regression suite'i var).
 */
describe('CLIENT-SEC-H2B — uyap case-status tenant-scope', () => {
  describe('AuthN wiring — unauthenticated behavior preserved', () => {
    it('UyapController sınıf-seviyesinde JwtAuthGuard taşır', () => {
      const guards = new Reflector().get<any[]>('__guards__', UyapController) || [];
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  describe('UyapService.queryCaseStatus — service-boundary tenant enforcement', () => {
    const buildService = (findFirstResult: any) => {
      const prisma: any = {
        case: { findFirst: jest.fn().mockResolvedValue(findFirstResult) },
        // logRequest/logResponse (queryCaseStatus'un audit-log yan-etkisi) — bu testlerin
        // kapsamı dışı ama servis metodu bunlar olmadan çağrılamıyor.
        uyapRequestLog: {
          create: jest.fn().mockResolvedValue({ id: 'log-1' }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      const errorReporter: any = { report: jest.fn() };
      const service = new UyapService(prisma, {} as any, {} as any, errorReporter, undefined);
      return { service, prisma };
    };

    it('same-tenant: case.findFirst({id,tenantId}) çağrılır, gerçek durum döner', async () => {
      const { service, prisma } = buildService({
        id: 'case-1', fileNumber: '2026/1', status: 'ACIK', uyapDosyaId: 'D-1', uyapBirimKodu: 'B-1',
      });

      const res = await service.queryCaseStatus('case-1', 'tenant-A');

      expect(prisma.case.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'case-1', tenantId: 'tenant-A' } }),
      );
      expect(prisma.case.findFirst).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'case-1' } }),
      );
      expect(res.data?.localStatus).toBe('ACIK');
    });

    it('cross-tenant (findFirst null döner): nonexistent ile AYNI PII-safe sonuç — localStatus UNKNOWN', async () => {
      const { service: crossTenantSvc } = buildService(null);
      const { service: nonexistentSvc } = buildService(null);

      const crossTenantRes = await crossTenantSvc.queryCaseStatus('case-B', 'tenant-A');
      const nonexistentRes = await nonexistentSvc.queryCaseStatus('never-existed', 'tenant-A');

      expect(crossTenantRes.data?.localStatus).toBe('UNKNOWN');
      expect(nonexistentRes.data?.localStatus).toBe('UNKNOWN');
      expect(crossTenantRes.success).toBe(nonexistentRes.success);
      // Yanıt gövdesinde kayıt varlığını ayırt edecek fark yok:
      expect(crossTenantRes.data?.uyapDosyaId).toBe(nonexistentRes.data?.uyapDosyaId);
    });
  });

  describe('UyapController — route ve internal call-site tenant threading', () => {
    it('GET /uyap/case/:caseId/status tenantId\'yi @CurrentUser\'dan service\'e geçirir', async () => {
      const uyapService: any = { queryCaseStatus: jest.fn().mockResolvedValue({ success: true, data: {} }) };
      const uyapXmlService: any = {};
      const guidedOpenObserve: any = {};
      const controller = new UyapController(uyapService, uyapXmlService, guidedOpenObserve);

      await controller.queryCaseStatus('case-1', 'tenant-A', 'DOSYA-1');

      expect(uyapService.queryCaseStatus).toHaveBeenCalledWith('case-1', 'tenant-A', 'DOSYA-1');
    });

    it('downloadXmlFromCase içindeki 2. çağrı da (dosya adı için) tenantId geçirir', async () => {
      const uyapService: any = { queryCaseStatus: jest.fn().mockResolvedValue({ data: { localStatus: 'ACIK' } }) };
      const uyapXmlService: any = { generateFromCase: jest.fn().mockResolvedValue('<xml/>') };
      const guidedOpenObserve: any = {};
      const controller = new UyapController(uyapService, uyapXmlService, guidedOpenObserve);
      const res: any = { setHeader: jest.fn(), send: jest.fn() };

      await controller.downloadXmlFromCase('case-1', 'tenant-A', res);

      expect(uyapService.queryCaseStatus).toHaveBeenCalledWith('case-1', 'tenant-A');
      expect(uyapService.queryCaseStatus).not.toHaveBeenCalledWith('case-1');
    });
  });
});
