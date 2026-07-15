import { Reflector } from '@nestjs/core';
import { ForbiddenException, HttpStatus } from '@nestjs/common';
import { PdfController } from '../pdf.controller';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TemplateEngineService } from '../../template-engine/template-engine.service';

/**
 * CLIENT-SEC-H1 (S2) regression — PDF takip-talebi authentication + tenant scoping.
 *
 * Kapsam:
 * - (T-01) PdfController JwtAuthGuard arkasında (anon istek guard tarafından reddedilir — wiring kanıtı).
 * - (T-06) downloadTakipTalebi tenantId'yi authenticated principal'dan alıp service'e GEÇİRİR;
 *   caseId TEK BAŞINA yüklenmez → cross-tenant sızıntı önlenir.
 * - Fail-open kaldırma: TemplateEngineService.getCaseData tenantId yoksa ForbiddenException atar
 *   (opsiyonel-tenantId `{id: caseId}` fallback'i tamamen kaldırıldı; tüm generate*FromCase yollarını korur).
 */
describe('CLIENT-SEC-H1 (S2) — PDF takip-talebi auth + tenant', () => {
  describe('PdfController AuthN wiring (T-01)', () => {
    it('PdfController JwtAuthGuard ile korunur (sınıf-seviyesi → 3 endpoint)', () => {
      const guards = new Reflector().get<any[]>('__guards__', PdfController) || [];
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  describe('downloadTakipTalebi tenant threading (T-06)', () => {
    const buildRes = () => {
      const res: any = {};
      res.set = jest.fn().mockReturnValue(res);
      res.status = jest.fn().mockReturnValue(res);
      res.send = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);
      return res;
    };

    it('tenantId generateTakipTalebiFromCase(caseId, tenantId) ile geçirilir; caseId tek-başına DEĞİL', async () => {
      const templateEngine: any = {
        generateTakipTalebiFromCase: jest.fn().mockResolvedValue({ title: 't', content: 'c' }),
      };
      const pdfService: any = {
        generateTakipTalebiPdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
      };
      const controller = new PdfController(pdfService, templateEngine);
      const res = buildRes();

      // Caller tenant-A; TenantB'ye ait case-B istense de service'e (case-B, tenant-A) gider.
      await controller.downloadTakipTalebi('case-B', 'tenant-A', res);

      expect(templateEngine.generateTakipTalebiFromCase).toHaveBeenCalledWith('case-B', 'tenant-A');
      expect(templateEngine.generateTakipTalebiFromCase).not.toHaveBeenCalledWith('case-B');
      expect(templateEngine.generateTakipTalebiFromCase).not.toHaveBeenCalledWith('case-B', undefined);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.send).toHaveBeenCalled();
    });
  });

  describe('TemplateEngineService.getCaseData fail-closed (fail-open kaldırıldı)', () => {
    it('tenantId yoksa ForbiddenException; hiçbir tenantsız sorgu yapılmaz', async () => {
      const prisma: any = { case: { findFirst: jest.fn(), findUnique: jest.fn() } };
      const svc = new TemplateEngineService(prisma, {} as any);

      await expect((svc as any).getCaseData('case-1', undefined)).rejects.toBeInstanceOf(ForbiddenException);
      // Guard prisma'ya ulaşmadan çalışır (fallback `{id: caseId}` YOK):
      expect(prisma.case.findFirst).not.toHaveBeenCalled();
      expect(prisma.case.findUnique).not.toHaveBeenCalled();
    });
  });
});
