import { Reflector } from '@nestjs/core';
import { ServiceUnavailableException } from '@nestjs/common';
import { UyapController } from '../uyap.controller';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

/**
 * UYAP-RETRY-CONTAIN-01 — POST /uyap/retry-failed fail-closed containment.
 *
 * Kapsam:
 * - (T-01) UyapController sınıf-seviyesinde JwtAuthGuard taşır (unauthenticated davranış korunuyor).
 * - POST /uyap/retry-failed: authenticated ADMIN/USER/VIEWER'dan bağımsız olarak 503, stabil error
 *   code, `UyapService.retryFailedRequests()` HİÇ ÇAĞRILMIYOR (Prisma'ya hiç ulaşılmıyor).
 * - `retryFailed()` sıfır-parametreli olduğu için body/query/path üzerinden retry'yi
 *   tetikleyecek hiçbir kanal yoktur (yapısal olarak doğrulanır).
 * - Statik guard: `retryFailed()` kaynak kodu `retryFailedRequests` çağrısı İÇERMEZ, `retry-failed`
 *   rotası açık containment error taşır.
 * - Owner Model D (hard disable) kapsamı: tenant filtering, operator role, CPE/POA redesign,
 *   state-machine redesign, attempt lineage bu birimde EKLENMEDİ — bu spec onları doğrulamaz.
 */
describe('UYAP-RETRY-CONTAIN-01 — POST /uyap/retry-failed fail-closed containment', () => {
  const buildController = () => {
    const uyapService: any = {
      retryFailedRequests: jest.fn().mockResolvedValue(7),
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

  describe('POST /uyap/retry-failed — rol bağımsız fail-closed', () => {
    const roles = ['ADMIN', 'USER', 'VIEWER'] as const;

    it.each(roles)(
      'authenticated %s → 503, service call 0 (rol handler tarafından hiç okunmuyor)',
      async (role) => {
        const { controller, uyapService } = buildController();

        // retryFailed() sıfır parametre alır; req/user context'i handler'a hiç ulaşmaz.
        // Rol simülasyonu yalnız "bu rolle authenticated olsa dahi sonuç değişmez" göstermek içindir.
        void role;

        await expect(controller.retryFailed()).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(uyapService.retryFailedRequests).not.toHaveBeenCalled();
      },
    );

    it('yeni rol türetmez — yalnız mevcut UserRole enum değerleri (ADMIN/USER/VIEWER) kullanılır', () => {
      expect(roles).toEqual(['ADMIN', 'USER', 'VIEWER']);
    });

    it('503 fırlatır; stabil error code taşır; service HİÇ ÇAĞRILMAZ', async () => {
      const { controller, uyapService } = buildController();

      try {
        await controller.retryFailed();
        throw new Error('retryFailed() 503 fırlatmalıydı');
      } catch (e: any) {
        expect(e).toBeInstanceOf(ServiceUnavailableException);
        expect(e.getStatus()).toBe(503);
        const body = e.getResponse();
        expect(body.error).toBe('UYAP_RETRY_TEMPORARILY_UNAVAILABLE');
        expect(typeof body.message).toBe('string');
        expect(body.message.length).toBeGreaterThan(0);
      }

      expect(uyapService.retryFailedRequests).not.toHaveBeenCalled();
    });

    it('birden fazla ardışık çağrıda dahi service her seferinde 0 kez çağrılır (idempotent containment)', async () => {
      const { controller, uyapService } = buildController();

      await expect(controller.retryFailed()).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(controller.retryFailed()).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(controller.retryFailed()).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(uyapService.retryFailedRequests).not.toHaveBeenCalled();
    });
  });

  describe('Request body/query/path retry\'yi ENABLE EDEMEZ (yapısal doğrulama)', () => {
    it('retryFailed() sıfır-arity\'dir — hiçbir @Body/@Query/@Param decorator\'ı yoktur', () => {
      const { controller } = buildController();
      // Method sıfır parametre alır: NestJS route handler'a hiçbir istek verisi enjekte edilmez,
      // dolayısıyla hiçbir body/query/path payload'ı davranışı etkileyemez.
      expect(controller.retryFailed.length).toBe(0);
    });

    it('herhangi bir "context" argümanı geçilse dahi (yanlışlıkla) sonuç değişmez', async () => {
      const { controller, uyapService } = buildController();
      // TypeScript imzası 0-arity olsa da runtime'da fazladan argüman geçilmesi JS'te sessizce
      // yok sayılır; bu, "gelecekte parametre eklenirse containment kırılmaz" güvencesini test eder.
      await expect(
        (controller.retryFailed as any)({ tenantId: 'attacker-tenant' }, { skipContainment: true }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(uyapService.retryFailedRequests).not.toHaveBeenCalled();
    });
  });

  describe('Statik guard — kaynak kodu seviyesinde containment kanıtı', () => {
    it('retryFailed() kaynağı retryFailedRequests\'i ÇAĞIRMAZ', () => {
      const source = UyapController.prototype.retryFailed.toString();
      expect(source).not.toMatch(/retryFailedRequests/);
    });

    it('retryFailed() kaynağı açık containment error\'ı İÇERİR', () => {
      const source = UyapController.prototype.retryFailed.toString();
      expect(source).toMatch(/ServiceUnavailableException/);
      expect(source).toMatch(/RETRY_CONTAINMENT_ERROR|UYAP_RETRY_TEMPORARILY_UNAVAILABLE/);
    });
  });
});
