import { NotFoundException } from '@nestjs/common';
import { ConfidenceScoreService } from './confidence-score.service';
import { AddressDiscoveryController } from './address-discovery.controller';

/**
 * GATE-1 — Tenant boundary hardening (confidence uçları).
 *
 * Açık: GET /address-discovery/confidence/:addressId, .../breakdown ve
 * POST .../confidence/debtor/:debtorId/update-all ham id'leri tenant doğrulamadan
 * servise geçiriyordu → cross-tenant okuma/yazma. Bu suite, ownership guard'ının
 * (a) sorguyu tenant-zincirli kurduğunu, (b) bulunamayınca 404 attığını,
 * (c) reddedince asıl (savunmasız) servis metoduna inilmediğini doğrular.
 *
 * Saf birim test (DB yok): prisma mock'lanır, where-clause asserte edilir.
 */
describe('ConfidenceScoreService — tenant boundary (Gate-1)', () => {
  function makePrisma() {
    return {
      debtorAddress: { findFirst: jest.fn() },
      debtor: { findFirst: jest.fn() },
    } as any;
  }

  describe('assertAddressBelongsToTenant', () => {
    it('NEGATIF: başka tenant adresi → NotFoundException + sorgu tenant-zincirli (debtor.tenantId)', async () => {
      const prisma = makePrisma();
      prisma.debtorAddress.findFirst.mockResolvedValue(null); // cross-tenant → kapsam dışı
      const svc = new ConfidenceScoreService(prisma);

      await expect(
        svc.assertAddressBelongsToTenant('tenant-B', 'addr-A'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.debtorAddress.findFirst).toHaveBeenCalledWith({
        where: { id: 'addr-A', debtor: { tenantId: 'tenant-B' } },
        select: { id: true },
      });
    });

    it('POZİTİF: aynı tenant adresi → throw yok', async () => {
      const prisma = makePrisma();
      prisma.debtorAddress.findFirst.mockResolvedValue({ id: 'addr-A' });
      const svc = new ConfidenceScoreService(prisma);

      await expect(
        svc.assertAddressBelongsToTenant('tenant-A', 'addr-A'),
      ).resolves.toBeUndefined();

      expect(prisma.debtorAddress.findFirst).toHaveBeenCalledWith({
        where: { id: 'addr-A', debtor: { tenantId: 'tenant-A' } },
        select: { id: true },
      });
    });
  });

  describe('assertDebtorBelongsToTenant', () => {
    it('NEGATIF: başka tenant borçlusu → NotFoundException + sorgu tenant-scoped', async () => {
      const prisma = makePrisma();
      prisma.debtor.findFirst.mockResolvedValue(null);
      const svc = new ConfidenceScoreService(prisma);

      await expect(
        svc.assertDebtorBelongsToTenant('tenant-B', 'debtor-A'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.debtor.findFirst).toHaveBeenCalledWith({
        where: { id: 'debtor-A', tenantId: 'tenant-B' },
        select: { id: true },
      });
    });

    it('POZİTİF: aynı tenant borçlusu → throw yok', async () => {
      const prisma = makePrisma();
      prisma.debtor.findFirst.mockResolvedValue({ id: 'debtor-A' });
      const svc = new ConfidenceScoreService(prisma);

      await expect(
        svc.assertDebtorBelongsToTenant('tenant-A', 'debtor-A'),
      ).resolves.toBeUndefined();
    });
  });

  describe('AddressDiscoveryController confidence uçları — guard ASIL metottan ÖNCE', () => {
    // Confidence uçları yalnız confidenceScoreService kullanır; diğer 5 servis bu uçlarda kullanılmaz.
    function makeController(confidence: any) {
      return new AddressDiscoveryController(
        undefined as any, // addressDiscoveryService
        undefined as any, // clientInfoRequestService
        confidence, // confidenceScoreService
        undefined as any, // crossFileService
        undefined as any, // uyapQueryService
        undefined as any, // institutionLetterService
      );
    }

    it('NEGATIF: GET /confidence/:addressId başka tenant → reddedilir, updateAddressScore ÇAĞRILMAZ', async () => {
      const confidence = {
        assertAddressBelongsToTenant: jest.fn().mockRejectedValue(new NotFoundException()),
        updateAddressScore: jest.fn(),
      };
      const ctrl = makeController(confidence);

      await expect(
        ctrl.getConfidenceScore({ user: { tenantId: 'tenant-B' } }, 'addr-A'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(confidence.assertAddressBelongsToTenant).toHaveBeenCalledWith('tenant-B', 'addr-A');
      expect(confidence.updateAddressScore).not.toHaveBeenCalled();
    });

    it('POZİTİF: GET /confidence/:addressId aynı tenant → { score } döner (contract korunur)', async () => {
      const confidence = {
        assertAddressBelongsToTenant: jest.fn().mockResolvedValue(undefined),
        updateAddressScore: jest.fn().mockResolvedValue(87),
      };
      const ctrl = makeController(confidence);

      await expect(
        ctrl.getConfidenceScore({ user: { tenantId: 'tenant-A' } }, 'addr-A'),
      ).resolves.toEqual({ score: 87 });

      expect(confidence.assertAddressBelongsToTenant).toHaveBeenCalledWith('tenant-A', 'addr-A');
      expect(confidence.updateAddressScore).toHaveBeenCalledWith('addr-A');
    });

    it('NEGATIF: GET /confidence/:addressId/breakdown başka tenant → reddedilir, prisma okunmaz', async () => {
      const confidence = {
        assertAddressBelongsToTenant: jest.fn().mockRejectedValue(new NotFoundException()),
        prisma: { debtorAddress: { findUnique: jest.fn() } },
      };
      const ctrl = makeController(confidence as any);

      await expect(
        ctrl.getConfidenceScoreBreakdown({ user: { tenantId: 'tenant-B' } }, 'addr-A'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(confidence.assertAddressBelongsToTenant).toHaveBeenCalledWith('tenant-B', 'addr-A');
      expect((confidence as any).prisma.debtorAddress.findUnique).not.toHaveBeenCalled();
    });

    it('NEGATIF: POST /confidence/debtor/:debtorId/update-all başka tenant → reddedilir, updateAll ÇAĞRILMAZ', async () => {
      const confidence = {
        assertDebtorBelongsToTenant: jest.fn().mockRejectedValue(new NotFoundException()),
        updateAllScoresForDebtor: jest.fn(),
      };
      const ctrl = makeController(confidence);

      await expect(
        ctrl.updateAllScoresForDebtor({ user: { tenantId: 'tenant-B' } }, 'debtor-A'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(confidence.assertDebtorBelongsToTenant).toHaveBeenCalledWith('tenant-B', 'debtor-A');
      expect(confidence.updateAllScoresForDebtor).not.toHaveBeenCalled();
    });

    it('POZİTİF: POST update-all aynı tenant → { success: true } (contract korunur)', async () => {
      const confidence = {
        assertDebtorBelongsToTenant: jest.fn().mockResolvedValue(undefined),
        updateAllScoresForDebtor: jest.fn().mockResolvedValue(undefined),
      };
      const ctrl = makeController(confidence);

      await expect(
        ctrl.updateAllScoresForDebtor({ user: { tenantId: 'tenant-A' } }, 'debtor-A'),
      ).resolves.toEqual({ success: true });

      expect(confidence.updateAllScoresForDebtor).toHaveBeenCalledWith('debtor-A');
    });
  });
});
