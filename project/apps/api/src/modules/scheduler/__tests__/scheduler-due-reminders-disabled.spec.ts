/**
 * F2 (Option C) — sendDueReminders DEVRE DIŞI doğrulaması.
 *
 * Eski gövde `this.db.notification.findFirst/create` çağırıyordu; `notification` Prisma delegesi
 * RUNTIME'da `undefined` olduğundan cron HER çalıştığında ilk `due`'da TypeError fırlatıp generic
 * "Vade hatırlatma hatası" logluyor, hiç hatırlatma göndermiyordu (ölü yol). Artık metot inert:
 * ölü çağrı yok; çağrılırsa AÇIKÇA warn loglar ve sorunsuz döner (cron decorator'ı da comment-disable).
 */

import { SchedulerService } from '../scheduler.service';

describe('F2 SchedulerService.sendDueReminders — DEVRE DIŞI (ölü yol kaldırıldı)', () => {
  const stub = {} as any;

  it('çağrılınca THROW ETMEZ (eski this.db.notification ölü yolu kalktı) ve döner', async () => {
    const service = new SchedulerService(stub, stub, stub);
    await expect(service.sendDueReminders()).resolves.toBeUndefined();
  });

  it('açıkça "DEVRE DIŞI (F2)" warn loglar (sessiz no-op değil → ölü yol görünür)', async () => {
    const service = new SchedulerService(stub, stub, stub);
    const warn = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);

    await service.sendDueReminders();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('DEVRE DIŞI (F2)'));
    warn.mockRestore();
  });
});
