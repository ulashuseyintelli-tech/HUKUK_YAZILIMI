import { Reflector } from '@nestjs/core';
import { PdfController } from '../pdf.controller';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

// PR-1 / STF-PRD-BOLA-001 regression net.
// Kapsam: (a) GET /pdf/takip-talebi/:caseId artik JwtAuthGuard arkasinda (anon -> 401 wiring kaniti),
//         (b) downloadTakipTalebi caseId'yi tenant-scoped yuklemek icin tenantId'yi
//             generateTakipTalebiFromCase'e GECIRIYOR (cross-tenant sizinti onlemenin cekirdegi).
// NOT: Uctan-uca cross-tenant enforcement (getCaseData where{id,tenantId} -> eslesmezse case yok)
//      DB-gated integration testinde (disposable Postgres, release gate) dogrulanir; bu birim testi
//      controller katmaninda guard-wiring + tenant-threading'i dogrular.

describe('PdfController — BOLA-001 authorization (PR-1)', () => {
  describe('T-02: controller AuthN wiring', () => {
    it('PdfController JwtAuthGuard ile korunur (anon istek guard tarafindan reddedilir)', () => {
      // @UseGuards(JwtAuthGuard) sinif-seviyesi metadata'si 3 endpoint'i de kapsar.
      const guards = new Reflector().get<any[]>('__guards__', PdfController) || [];
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  describe('T-01/T-03: downloadTakipTalebi tenant-scoped case load', () => {
    // Gercek PdfController + sahte bagimliliklar; runtime davranisini (tenantId'nin service'e
    // gecirilmesi) dogrular. getCaseData'nin kendisi MUST-NOT-CHANGE (degistirilmedi).
    const buildRes = () => {
      const res: any = {};
      res.set = jest.fn().mockReturnValue(res);
      res.status = jest.fn().mockReturnValue(res);
      res.send = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);
      return res;
    };

    it('T-01: yetkili istekte tenantId generateTakipTalebiFromCase(caseId, tenantId) olarak gecirilir', async () => {
      const templateEngine: any = {
        generateTakipTalebiFromCase: jest
          .fn()
          .mockResolvedValue({ title: 't', content: 'c' }),
      };
      const pdfService: any = {
        generateTakipTalebiPdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
      };
      const controller = new PdfController(pdfService, templateEngine);
      const res = buildRes();

      await controller.downloadTakipTalebi('case-1', 'tenant-A', res);

      // Cekirdek invariant: caseId TEK BASINA degil, tenantId ile birlikte yuklenir.
      expect(templateEngine.generateTakipTalebiFromCase).toHaveBeenCalledWith('case-1', 'tenant-A');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalled();
    });

    it('T-03: farkli tenant caseId istese bile yalniz caller tenant\'i ile yuklenir (caseId tek-basina sorgulanmaz)', async () => {
      // Caller tenant-A; TenantB'ye ait case-B istense de service'e (case-B, tenant-A) gider.
      // getCaseData where{id:case-B, tenantId:tenant-A} eslesmez -> case bulunamaz (uctan-uca:
      // DB-gated integration). Burada tenant-A disinda bir tenantId ile CAGRILMADIGI dogrulanir.
      const templateEngine: any = {
        generateTakipTalebiFromCase: jest.fn().mockResolvedValue({ title: 't', content: 'c' }),
      };
      const pdfService: any = {
        generateTakipTalebiPdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
      };
      const controller = new PdfController(pdfService, templateEngine);
      const res = buildRes();

      await controller.downloadTakipTalebi('case-B', 'tenant-A', res);

      expect(templateEngine.generateTakipTalebiFromCase).toHaveBeenCalledWith('case-B', 'tenant-A');
      expect(templateEngine.generateTakipTalebiFromCase).not.toHaveBeenCalledWith('case-B', undefined);
      expect(templateEngine.generateTakipTalebiFromCase).not.toHaveBeenCalledWith('case-B');
    });
  });
});
