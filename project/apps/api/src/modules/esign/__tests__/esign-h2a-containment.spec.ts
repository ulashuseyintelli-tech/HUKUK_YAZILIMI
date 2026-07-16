import { Reflector } from '@nestjs/core';
import { ServiceUnavailableException } from '@nestjs/common';
import { ESignController } from '../esign.controller';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

/**
 * CLIENT-SEC-H2A regression — EsignLog fail-closed containment.
 *
 * Kapsam:
 * - (T-01) ESignController JwtAuthGuard arkasında (anon istek guard tarafından reddedilir — wiring
 *   kanıtı; unauthenticated davranış korunuyor, guard gevşetilmedi/kaldırılmadı).
 * - GET /esign/history ve GET /esign/stats: authenticated istekte 503, stabil error code, service
 *   metotları HİÇ ÇAĞRILMIYOR (Prisma'ya hiç ulaşılmıyor).
 * - Yanıt gövdesinde TCKN/ad/belge/kayıt-metadata'sı YOK.
 * - Kardeş route'lar (status, sign, sign/bulk, status/:id, verify) DEĞİŞMEDİ — özellikle GET
 *   /esign/status kendi getStats() çağrısını KORUYOR (yalnız /esign/stats route'u containment'ta).
 */
describe('CLIENT-SEC-H2A — EsignLog fail-closed containment', () => {
  const buildController = () => {
    const esignService: any = {
      checkProviderStatus: jest.fn().mockResolvedValue({ provider: 'mock', configured: false }),
      getStats: jest.fn().mockResolvedValue({ total: 1, pending: 0, success: 1, failed: 0 }),
      getSignatureHistory: jest.fn().mockResolvedValue([{ id: 'x' }]),
      requestSignature: jest.fn().mockResolvedValue({ success: true }),
      requestBulkSignature: jest.fn().mockResolvedValue([]),
      checkStatus: jest.fn().mockResolvedValue({ status: 'SIGNED' }),
      verifySignature: jest.fn().mockResolvedValue({ isValid: true }),
    };
    const controller = new ESignController(esignService);
    return { controller, esignService };
  };

  describe('AuthN wiring (T-01) — unauthenticated behavior preserved', () => {
    it('ESignController sınıf-seviyesinde JwtAuthGuard taşır (guard kaldırılmadı/gevşetilmedi)', () => {
      const guards = new Reflector().get<any[]>('__guards__', ESignController) || [];
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  describe('GET /esign/history — fail-closed', () => {
    it('503 fırlatır; stabil error code taşır; PII yok; service ÇAĞRILMAZ', async () => {
      const { controller, esignService } = buildController();

      const call = controller.getHistory('doc-1', 'signer-1', 'SUCCESS', '20');
      await expect(call).rejects.toBeInstanceOf(ServiceUnavailableException);

      try {
        await controller.getHistory('doc-1', 'signer-1', 'SUCCESS', '20');
      } catch (e: any) {
        expect(e.getStatus()).toBe(503);
        const body = e.getResponse();
        expect(body.error).toBe('TENANT_SCOPED_HISTORY_TEMPORARILY_UNAVAILABLE');
        const serialized = JSON.stringify(body);
        // PII/kayıt-varlığı sızıntısı yok: TCKN deseni, belge/imzacı adı, id yankısı yok.
        expect(serialized).not.toMatch(/\d{11}/); // TCKN deseni (11 hane)
        expect(serialized.toLowerCase()).not.toContain('tcno');
        expect(serialized.toLowerCase()).not.toContain('signer');
        expect(serialized.toLowerCase()).not.toContain('document');
        expect(serialized).not.toContain('doc-1');
        expect(serialized).not.toContain('signer-1');
      }

      expect(esignService.getSignatureHistory).not.toHaveBeenCalled();
    });
  });

  describe('GET /esign/stats — fail-closed', () => {
    it('503 fırlatır; stabil error code taşır; service ÇAĞRILMAZ', async () => {
      const { controller, esignService } = buildController();

      const call = controller.getStats();
      await expect(call).rejects.toBeInstanceOf(ServiceUnavailableException);

      try {
        await controller.getStats();
      } catch (e: any) {
        expect(e.getStatus()).toBe(503);
        expect(e.getResponse().error).toBe('TENANT_SCOPED_HISTORY_TEMPORARILY_UNAVAILABLE');
      }

      expect(esignService.getStats).not.toHaveBeenCalled();
    });
  });

  describe('Kardeş route\'lar DEĞİŞMEDİ (backward-compat)', () => {
    it('GET /esign/status kendi getStats() çağrısını KORUR (yalnız /esign/stats route\'u containment\'ta)', async () => {
      const { controller, esignService } = buildController();
      const res = await controller.getStatus();

      expect(esignService.checkProviderStatus).toHaveBeenCalled();
      expect(esignService.getStats).toHaveBeenCalled();
      expect(res.stats).toEqual({ total: 1, pending: 0, success: 1, failed: 0 });
    });

    it('POST /esign/sign davranışı değişmedi (CLIENT-SEC-H2C-P02: tenantId artık authenticated context\'ten geçiyor)', async () => {
      const { controller, esignService } = buildController();
      const body: any = { documentId: 'd1', documentName: 'n', documentContent: 'c', signerId: 's1', signerName: 'x', signerTcNo: '1', signatureType: 'SIMPLE' };
      await controller.requestSignature(body, 'tenant-A');
      expect(esignService.requestSignature).toHaveBeenCalledWith(body, 'tenant-A');
    });

    it('POST /esign/sign/bulk davranışı değişmedi (CLIENT-SEC-H2C-P02: tenantId artık authenticated context\'ten geçiyor)', async () => {
      const { controller, esignService } = buildController();
      await controller.requestBulkSignature({ requests: [] }, 'tenant-A');
      expect(esignService.requestBulkSignature).toHaveBeenCalledWith([], 'tenant-A');
    });

    it('GET /esign/status/:transactionId davranışı değişmedi', async () => {
      const { controller, esignService } = buildController();
      await controller.checkSignatureStatus('tx-1');
      expect(esignService.checkStatus).toHaveBeenCalledWith('tx-1');
    });

    it('POST /esign/verify davranışı değişmedi', async () => {
      const { controller, esignService } = buildController();
      await controller.verifySignature({ signedDocument: 'abc' });
      expect(esignService.verifySignature).toHaveBeenCalledWith('abc');
    });
  });
});
