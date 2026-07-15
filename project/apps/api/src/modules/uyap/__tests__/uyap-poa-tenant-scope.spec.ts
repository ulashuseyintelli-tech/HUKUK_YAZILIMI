import { UyapService } from '../uyap.service';

/**
 * CLIENT-SEC-H1 (S1) regression — UYAP POA/case validation cross-tenant containment.
 *
 * Kapsam:
 * - validatePowerOfAttorney: PII-safe error (displayName/ad/soyad enrichment lookup'ları KALDIRILDI;
 *   her geçersiz durumda AYNI generic mesaj → kayıt-varlığı/kimlik ifşası yok).
 * - validateCasePoaForUyap: case load fail-closed tenant-scoped (findFirst {id, tenantId}, findUnique DEĞİL).
 * - same-tenant başarı davranışı geriye uyumlu korunur.
 *
 * NOT: Uçtan-uca HTTP 401/403 enforcement JwtAuthGuard (controller) + DB-gated integration ile;
 * bu birim testi service katmanında tenant-threading + PII-safe error + no-leak-lookup invariant'ını doğrular.
 */
describe('UyapService — CLIENT-SEC-H1 (S1) cross-tenant containment', () => {
  const buildService = (over: any = {}) => {
    const prisma: any = {
      client: { findUnique: jest.fn(), findFirst: jest.fn() },
      lawyer: { findUnique: jest.fn(), findFirst: jest.fn() },
      case: { findUnique: jest.fn(), findFirst: jest.fn() },
      ...(over.prisma || {}),
    };
    const poaService: any = { checkValidPoa: jest.fn(), ...(over.poaService || {}) };
    const svc = new UyapService(prisma, poaService, {} as any, {} as any);
    return { svc, prisma, poaService };
  };

  describe('validatePowerOfAttorney — PII-safe error (T-04/T-05)', () => {
    it('geçersiz POA → generic mesaj; PII yankılanmaz; leak-lookup yapılmaz', async () => {
      const { svc, prisma, poaService } = buildService();
      poaService.checkValidPoa.mockResolvedValue({ isValid: false });

      const res = await svc.validatePowerOfAttorney('client-X', 'lawyer-Y', 'tenant-A');

      expect(res.isValid).toBe(false);
      expect(res.message).toBe('Geçerli vekalet bulunamadı');
      // Sızıntı kaynağı olan tenant-scope'suz enrichment lookup'ları KALDIRILDI:
      expect(prisma.client.findUnique).not.toHaveBeenCalled();
      expect(prisma.lawyer.findUnique).not.toHaveBeenCalled();
      expect(prisma.client.findFirst).not.toHaveBeenCalled();
      expect(prisma.lawyer.findFirst).not.toHaveBeenCalled();
      // Mesajda müvekkil/ad/soyad ifşası yok:
      expect(res.message).not.toMatch(/müvekkil|undefined/i);
    });

    it('POA kontrolü tenantId ile çağrılır (T-06 threading)', async () => {
      const { svc, poaService } = buildService();
      poaService.checkValidPoa.mockResolvedValue({ isValid: true, daysRemaining: 30, poa: { id: 'poa-1' } });
      await svc.validatePowerOfAttorney('c1', 'l1', 'tenant-A');
      expect(poaService.checkValidPoa).toHaveBeenCalledWith('c1', 'l1', 'tenant-A');
    });

    it('geçerli POA → başarı davranışı korunur (T-07 backward-compat)', async () => {
      const { svc, poaService } = buildService();
      poaService.checkValidPoa.mockResolvedValue({ isValid: true, daysRemaining: 30, poa: { id: 'poa-1' } });
      const res = await svc.validatePowerOfAttorney('c1', 'l1', 'tenant-A');
      expect(res.isValid).toBe(true);
      expect(res.poaId).toBe('poa-1');
      expect(res.daysRemaining).toBe(30);
    });
  });

  describe('validateCasePoaForUyap — tenant-scoped case load (T-03/T-06)', () => {
    it('case load fail-closed: findFirst {id, tenantId}; findUnique KULLANILMAZ; cross-tenant güvenli', async () => {
      const { svc, prisma } = buildService();
      prisma.case.findFirst.mockResolvedValue(null); // cross-tenant caseId eşleşmez

      const res = await svc.validateCasePoaForUyap('case-B', 'tenant-A');

      expect(prisma.case.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'case-B', tenantId: 'tenant-A' } }),
      );
      expect(prisma.case.findUnique).not.toHaveBeenCalled();
      // Cross-tenant/eksik case → güvenli generic hata (varlık ifşası yok):
      expect(res).toEqual({ isValid: false, errors: ['Takip bulunamadı'] });
    });
  });
});
