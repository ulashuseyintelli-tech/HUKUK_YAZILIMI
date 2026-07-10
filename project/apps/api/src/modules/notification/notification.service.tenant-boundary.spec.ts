import { NotFoundException } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationStatus } from '@prisma/client';

/**
 * P0 — Tenant boundary + IDOR hardening (notification.service.ts).
 *
 * Açık: updateStatus/checkETebligatStatus (:id bazlı) hiçbir tenant/ownership
 * kontrolü yapmadan çalışıyordu → başka tenant'ın tebligatı DELIVERED yapılıp
 * Case.workflowStage'i değiştirilebiliyordu (yazma-yönlü IDOR). findByCaseId,
 * pending/expired/stats, sendSMS/sendEmail, getPaymentDeadline de tenant
 * filtresizdi. Bu suite reddedilen erişimlerde (a) NotFoundException fırlatıldığını,
 * (b) hiçbir yazma yan etkisinin tetiklenmediğini, (c) izinli erişimde sorguların
 * tenant-scoped kaldığını, (d) checkETebligatStatus'un artık sahte teslim
 * üretmediğini doğrular.
 *
 * Saf birim test (DB yok): prisma mock'lanır.
 */
describe('NotificationService — tenant boundary', () => {
  function makePrisma() {
    return {
      case: { findFirst: jest.fn(), update: jest.fn() },
      caseLifecycle: { create: jest.fn() },
      notificationQueue: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
    } as any;
  }

  describe('updateStatus (IDOR)', () => {
    it('NEGATIF: başka tenant notification → NotFoundException + update HİÇ çağrılmaz', async () => {
      const prisma = makePrisma();
      prisma.notificationQueue.findFirst.mockResolvedValue(null);
      const svc = new NotificationService(prisma);

      await expect(
        svc.updateStatus('tenant-B', 'notif-A', NotificationStatus.DELIVERED, { deliveredAt: new Date() }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.notificationQueue.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'notif-A', OR: [{ tenantId: 'tenant-B' }, { case: { tenantId: 'tenant-B' } }] },
        }),
      );
      expect(prisma.notificationQueue.update).not.toHaveBeenCalled();
    });

    it('POZİTİF: aynı tenant notification → update çağrılır', async () => {
      const prisma = makePrisma();
      prisma.notificationQueue.findFirst.mockResolvedValue({ id: 'notif-A' });
      prisma.notificationQueue.update.mockResolvedValue({
        id: 'notif-A',
        caseId: 'case-A',
        status: NotificationStatus.DELIVERED,
      });
      const svc = new NotificationService(prisma);

      await svc.updateStatus('tenant-A', 'notif-A', NotificationStatus.DELIVERED, { deliveredAt: new Date() });

      expect(prisma.notificationQueue.update).toHaveBeenCalled();
    });
  });

  describe('checkETebligatStatus (mock write-path kapatıldı)', () => {
    it('NEGATIF: başka tenant notification → NotFoundException', async () => {
      const prisma = makePrisma();
      prisma.notificationQueue.findFirst.mockResolvedValue(null);
      const svc = new NotificationService(prisma);

      await expect(svc.checkETebligatStatus('tenant-B', 'notif-A')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('POZİTİF: sahte teslim üretmez, mevcut durumu değiştirmeden döner', async () => {
      const prisma = makePrisma();
      prisma.notificationQueue.findFirst.mockResolvedValue({ id: 'notif-A' });
      prisma.notificationQueue.findUnique.mockResolvedValue({ id: 'notif-A', status: NotificationStatus.PENDING });
      const svc = new NotificationService(prisma);

      const result = await svc.checkETebligatStatus('tenant-A', 'notif-A');

      expect(result.status).toBe(NotificationStatus.PENDING);
      expect(prisma.notificationQueue.update).not.toHaveBeenCalled();
    });
  });

  describe('findPending / findExpired / getStats', () => {
    it('findPending: tenantId OR-filtresi (doğrudan + case üzerinden) uygulanır', async () => {
      const prisma = makePrisma();
      prisma.notificationQueue.findMany.mockResolvedValue([]);
      const svc = new NotificationService(prisma);

      await svc.findPending('tenant-A');

      expect(prisma.notificationQueue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: [{ tenantId: 'tenant-A' }, { case: { tenantId: 'tenant-A' } }] }),
        }),
      );
    });

    it('findExpired: tenantId OR-filtresi uygulanır', async () => {
      const prisma = makePrisma();
      prisma.notificationQueue.findMany.mockResolvedValue([]);
      const svc = new NotificationService(prisma);

      await svc.findExpired('tenant-A');

      expect(prisma.notificationQueue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: [{ tenantId: 'tenant-A' }, { case: { tenantId: 'tenant-A' } }] }),
        }),
      );
    });

    it('getStats: artık spoofable query yerine zorunlu tenantId ile OR-filtresi kurar', async () => {
      const prisma = makePrisma();
      prisma.notificationQueue.count.mockResolvedValue(0);
      const svc = new NotificationService(prisma);

      await svc.getStats('tenant-A');

      expect(prisma.notificationQueue.count).toHaveBeenCalledWith({
        where: { OR: [{ tenantId: 'tenant-A' }, { case: { tenantId: 'tenant-A' } }] },
      });
    });
  });

  describe('sendSMS / sendEmail (case ownership)', () => {
    it('sendSMS NEGATIF: başka tenant caseId → NotFoundException + create çağrılmaz', async () => {
      const prisma = makePrisma();
      prisma.case.findFirst.mockResolvedValue(null);
      const svc = new NotificationService(prisma);

      await expect(svc.sendSMS('tenant-B', 'case-A', '5551112233', 'mesaj')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.notificationQueue.create).not.toHaveBeenCalled();
    });

    it('sendEmail NEGATIF: başka tenant caseId → NotFoundException + create çağrılmaz', async () => {
      const prisma = makePrisma();
      prisma.case.findFirst.mockResolvedValue(null);
      const svc = new NotificationService(prisma);

      await expect(
        svc.sendEmail('tenant-B', 'case-A', 'a@b.com', 'konu', 'icerik'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.notificationQueue.create).not.toHaveBeenCalled();
    });
  });

  describe('findByCaseId / getPaymentDeadline', () => {
    it('findByCaseId: case ilişkisi üzerinden tenant filtresi uygulanır', async () => {
      const prisma = makePrisma();
      prisma.notificationQueue.findMany.mockResolvedValue([]);
      const svc = new NotificationService(prisma);

      await svc.findByCaseId('tenant-A', 'case-A');

      expect(prisma.notificationQueue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { caseId: 'case-A', case: { tenantId: 'tenant-A' } } }),
      );
    });

    it('getPaymentDeadline: case ilişkisi üzerinden tenant filtresi uygulanır', async () => {
      const prisma = makePrisma();
      prisma.notificationQueue.findFirst.mockResolvedValue(null);
      const svc = new NotificationService(prisma);

      await svc.getPaymentDeadline('tenant-A', 'case-A');

      expect(prisma.notificationQueue.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ caseId: 'case-A', case: { tenantId: 'tenant-A' } }),
        }),
      );
    });
  });
});
