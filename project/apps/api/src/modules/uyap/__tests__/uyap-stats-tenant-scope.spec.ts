import { UyapController } from '../uyap.controller';
import { UyapService } from '../uyap.service';

/**
 * SEC-XTEN-UYAP-STATS-01 — GET /uyap/status ve GET /uyap/stats cross-tenant aggregate leak
 * containment. TRANSPORT-RISK-02: getStats() tenant filtresizdi, herhangi bir authenticated
 * tenant tüm tenantların UYAP istek hacim/başarı/hata sayılarını görebiliyordu.
 *
 * Kapsam:
 * - Controller: her iki route @CurrentUser('tenantId')'i aynen service'e geçirir.
 * - Service: tenantId zorunlu; eksik/boş/whitespace → fail-closed sıfır sonuç, Prisma HİÇ çağrılmaz.
 * - Dört count sorgusunun tamamı tenantId ile scoped'tır.
 * - Response contract (connected/mode/message/stats, total/pending/success/failed) DEĞİŞMEDİ.
 * - checkConnection() bu birimle DEĞİŞMEDİ (ayrı residual, TRANSPORT-RISK-01).
 */
describe('SEC-XTEN-UYAP-STATS-01 — uyap stats/status tenant-scope', () => {
  const buildService = () => {
    const prisma: any = {
      uyapRequestLog: {
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const errorReporter: any = { report: jest.fn() };
    const service = new UyapService(prisma, {} as any, {} as any, errorReporter, undefined);
    return { service, prisma };
  };

  describe('UyapService.getStats — fail-closed tenant enforcement', () => {
    it('tenantId undefined → sıfır sonuç, Prisma HİÇ çağrılmaz', async () => {
      const { service, prisma } = buildService();

      const res = await service.getStats(undefined as any);

      expect(res).toEqual({ total: 0, pending: 0, success: 0, failed: 0 });
      expect(prisma.uyapRequestLog.count).not.toHaveBeenCalled();
    });

    it('tenantId boş string → sıfır sonuç, Prisma HİÇ çağrılmaz', async () => {
      const { service, prisma } = buildService();

      const res = await service.getStats('');

      expect(res).toEqual({ total: 0, pending: 0, success: 0, failed: 0 });
      expect(prisma.uyapRequestLog.count).not.toHaveBeenCalled();
    });

    it('tenantId yalnızca whitespace → sıfır sonuç, Prisma HİÇ çağrılmaz', async () => {
      const { service, prisma } = buildService();

      const res = await service.getStats('   ');

      expect(res).toEqual({ total: 0, pending: 0, success: 0, failed: 0 });
      expect(prisma.uyapRequestLog.count).not.toHaveBeenCalled();
    });

    it('geçerli tenantId → dört count sorgusunun tamamı tenantId ile scoped', async () => {
      const { service, prisma } = buildService();

      await service.getStats('tenant-A');

      expect(prisma.uyapRequestLog.count).toHaveBeenCalledTimes(4);
      expect(prisma.uyapRequestLog.count).toHaveBeenCalledWith({ where: { tenantId: 'tenant-A' } });
      expect(prisma.uyapRequestLog.count).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-A', status: 'PENDING' },
      });
      expect(prisma.uyapRequestLog.count).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-A', status: 'SUCCESS' },
      });
      expect(prisma.uyapRequestLog.count).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-A', status: 'FAILED' },
      });
      // Eski unscoped çağrı biçimleri artık HİÇ üretilmez:
      expect(prisma.uyapRequestLog.count).not.toHaveBeenCalledWith();
      expect(prisma.uyapRequestLog.count).not.toHaveBeenCalledWith({ where: { status: 'PENDING' } });
    });

    it('response şekli DEĞİŞMEDİ: {total, pending, success, failed}', async () => {
      const prisma: any = {
        uyapRequestLog: {
          count: jest
            .fn()
            .mockResolvedValueOnce(10) // total
            .mockResolvedValueOnce(2) // pending
            .mockResolvedValueOnce(6) // success
            .mockResolvedValueOnce(2), // failed
        },
      };
      const service = new UyapService(prisma, {} as any, {} as any, { report: jest.fn() } as any, undefined);

      const res = await service.getStats('tenant-A');

      expect(res).toEqual({ total: 10, pending: 2, success: 6, failed: 2 });
    });
  });

  describe('UyapController — route tenant threading', () => {
    const buildController = () => {
      const uyapService: any = {
        checkConnection: jest.fn().mockResolvedValue(true),
        getStats: jest.fn().mockResolvedValue({ total: 0, pending: 0, success: 0, failed: 0 }),
      };
      const uyapXmlService: any = {};
      const guidedOpenObserve: any = {};
      const controller = new UyapController(uyapService, uyapXmlService, guidedOpenObserve);
      return { controller, uyapService };
    };

    it('GET /uyap/stats → authenticated tenantId aynen service.getStats\'e geçirilir', async () => {
      const { controller, uyapService } = buildController();

      await controller.getStats('tenant-A');

      expect(uyapService.getStats).toHaveBeenCalledWith('tenant-A');
      expect(uyapService.getStats).not.toHaveBeenCalledWith();
    });

    it('GET /uyap/status → authenticated tenantId getStats\'e geçirilir, response şekli DEĞİŞMEDİ', async () => {
      const { controller, uyapService } = buildController();

      const res = await controller.getStatus('tenant-A');

      expect(uyapService.getStats).toHaveBeenCalledWith('tenant-A');
      expect(uyapService.checkConnection).toHaveBeenCalled();
      expect(res).toEqual({
        connected: true,
        mode: 'STUB',
        message: 'UYAP entegrasyonu henüz aktif değil. Stub modunda çalışıyor.',
        stats: { total: 0, pending: 0, success: 0, failed: 0 },
      });
    });

    it('farklı tenantId için çağrı ayrı sonuç üretir (cross-tenant karışma yok, mock-seviyesi)', async () => {
      const { controller, uyapService } = buildController();
      uyapService.getStats.mockImplementation((tenantId: string) =>
        Promise.resolve(
          tenantId === 'tenant-A'
            ? { total: 5, pending: 1, success: 3, failed: 1 }
            : { total: 9, pending: 2, success: 5, failed: 2 },
        ),
      );

      const resA = await controller.getStats('tenant-A');
      const resB = await controller.getStats('tenant-B');

      expect(resA).toEqual({ total: 5, pending: 1, success: 3, failed: 1 });
      expect(resB).toEqual({ total: 9, pending: 2, success: 5, failed: 2 });
    });
  });
});
