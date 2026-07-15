import { Reflector } from '@nestjs/core';
import { ServiceUnavailableException } from '@nestjs/common';
import { UyapController } from '../uyap.controller';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

/**
 * CLIENT-SEC-H2A regression — UyapRequestLog fail-closed containment.
 *
 * Kapsam:
 * - (T-01) UyapController sınıf-seviyesinde JwtAuthGuard taşır (unauthenticated davranış korunuyor).
 * - GET /uyap/history: authenticated istekte 503, stabil error code, service HİÇ ÇAĞRILMIYOR
 *   (UyapRequestLog'a hiç ulaşılmıyor).
 * - Yanıt gövdesinde case/request-metadata sızıntısı yok.
 * - Kardeş route (poa/validate — CLIENT-SEC-H1 S1 kapsamı) DEĞİŞMEDİ; queryCaseStatus (H2B kapsamı,
 *   bu görevde YETKİSİZ) da bilerek DOKUNULMADI — bu spec onu doğrulamaz/değiştirmez.
 */
describe('CLIENT-SEC-H2A — UyapRequestLog fail-closed containment', () => {
  const buildController = () => {
    const uyapService: any = {
      getRequestHistory: jest.fn().mockResolvedValue([{ id: 'log-1' }]),
      validatePowerOfAttorney: jest.fn().mockResolvedValue({ isValid: true, daysRemaining: 30 }),
    };
    const uyapXmlService: any = {};
    const guidedOpenObserve: any = {};
    const controller = new UyapController(uyapService, uyapXmlService, guidedOpenObserve);
    return { controller, uyapService };
  };

  describe('AuthN wiring (T-01) — unauthenticated behavior preserved', () => {
    it('UyapController sınıf-seviyesinde JwtAuthGuard taşır (guard kaldırılmadı/gevşetilmedi)', () => {
      const guards = new Reflector().get<any[]>('__guards__', UyapController) || [];
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  describe('GET /uyap/history — fail-closed', () => {
    it('503 fırlatır; stabil error code taşır; PII/metadata yok; service ÇAĞRILMAZ', async () => {
      const { controller, uyapService } = buildController();

      const call = controller.getRequestHistory('case-1', '10');
      await expect(call).rejects.toBeInstanceOf(ServiceUnavailableException);

      try {
        await controller.getRequestHistory('case-1', '10');
      } catch (e: any) {
        expect(e.getStatus()).toBe(503);
        const body = e.getResponse();
        expect(body.error).toBe('TENANT_SCOPED_HISTORY_TEMPORARILY_UNAVAILABLE');
        const serialized = JSON.stringify(body);
        expect(serialized).not.toContain('case-1');
        expect(serialized.toLowerCase()).not.toContain('caseid');
        expect(serialized.toLowerCase()).not.toContain('evkno');
        expect(serialized.toLowerCase()).not.toContain('dosyaid');
      }

      expect(uyapService.getRequestHistory).not.toHaveBeenCalled();
    });

    it('caseId/limit parametresiz çağrıda da 503 (global-list en tehlikeli senaryo)', async () => {
      const { controller, uyapService } = buildController();
      await expect(controller.getRequestHistory()).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(uyapService.getRequestHistory).not.toHaveBeenCalled();
    });
  });

  describe('Kardeş route DEĞİŞMEDİ (backward-compat)', () => {
    it('GET /uyap/poa/validate davranışı değişmedi (CLIENT-SEC-H1 S1 kapsamı, bu PR\'da DOKUNULMADI)', async () => {
      const { controller, uyapService } = buildController();
      const req: any = { user: { tenantId: 'tenant-A' } };
      const res = await controller.validatePoa('client-1', 'lawyer-1', req);

      expect(uyapService.validatePowerOfAttorney).toHaveBeenCalledWith('client-1', 'lawyer-1', 'tenant-A');
      expect(res.canProceedToUyap).toBe(true);
    });
  });
});
