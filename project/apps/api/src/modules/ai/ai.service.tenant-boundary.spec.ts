import { AiService } from './ai.service';

/**
 * P0 — Tenant boundary hardening (ai.service.ts).
 *
 * Açık: getCaseWithDetails (getSuggestions/getPrediction üzerinden) tenantId
 * almadan caseId ile sorgu yapıyordu → başka tenant'ın dosya/borçlu/varlık bilgisi
 * okunup (OpenAI aktifse) LLM'e gönderilebiliyordu. Bu suite cross-tenant caseId'nin
 * reddedildiğini ve sorgunun tenant-scoped olduğunu doğrular.
 *
 * Saf birim test (DB yok, OpenAI yok): prisma + configService mock'lanır.
 */
describe('AiService — tenant boundary', () => {
  function makePrisma() {
    return { case: { findFirst: jest.fn() } } as any;
  }

  function makeConfig() {
    // OpenAI devre dışı → kural-bazlı fallback (testte gerçek LLM çağrısı yok)
    return { get: jest.fn().mockReturnValue(undefined) } as any;
  }

  describe('getSuggestions', () => {
    it('NEGATIF: başka tenant caseId → Error + tenant-scoped sorgu', async () => {
      const prisma = makePrisma();
      prisma.case.findFirst.mockResolvedValue(null);
      const svc = new AiService(prisma, makeConfig());

      await expect(svc.getSuggestions('tenant-B', 'case-A')).rejects.toThrow('Case not found');

      expect(prisma.case.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'case-A', tenantId: 'tenant-B' } }),
      );
    });

    it('POZİTİF: aynı tenant caseId → öneri döner (kural-bazlı fallback)', async () => {
      const prisma = makePrisma();
      prisma.case.findFirst.mockResolvedValue({
        id: 'case-A',
        workflowStage: 'INITIAL',
        principalAmount: 1000,
        collections: [],
        debtors: [],
      });
      const svc = new AiService(prisma, makeConfig());

      const result = await svc.getSuggestions('tenant-A', 'case-A');

      expect(Array.isArray(result)).toBe(true);
      expect(prisma.case.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'case-A', tenantId: 'tenant-A' } }),
      );
    });
  });

  describe('getPrediction', () => {
    it('NEGATIF: başka tenant caseId → Error + tenant-scoped sorgu', async () => {
      const prisma = makePrisma();
      prisma.case.findFirst.mockResolvedValue(null);
      const svc = new AiService(prisma, makeConfig());

      await expect(svc.getPrediction('tenant-B', 'case-A')).rejects.toThrow('Case not found');

      expect(prisma.case.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'case-A', tenantId: 'tenant-B' } }),
      );
    });
  });
});
