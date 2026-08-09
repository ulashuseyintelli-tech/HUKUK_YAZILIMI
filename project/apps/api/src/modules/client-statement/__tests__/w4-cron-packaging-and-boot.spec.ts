/**
 * WAVE4 — CRON PACKAGING + BOOT/SCHEDULE REGRESYONU (owner hard-gate düzeltmesi).
 *
 * Packaging bug'ı: `cron` yalnız @nestjs/schedule'in transitive bağımlılığıydı; strict-pnpm
 * temiz production layout'ta `require('cron')` MODULE_NOT_FOUND veriyordu (kanıtlandı).
 * Düzeltme: `cron` API'nin DOĞRUDAN runtime dependency'si (lockfile'ın zaten çözdüğü 4.3.5'e
 * exact pin — sürüm uydurulmadı, upgrade/downgrade yok).
 *
 * Boot/schedule kuralları (owner):
 *  - Flag OFF boot: cron KAYDI yok, teslim yok, provider çağrısı 0.
 *  - Flag ON boot: YALNIZ schedule registration; process başlangıcında geçmiş dönem teslimi
 *    TETİKLENMEZ; provider çağrısı 0.
 */
import { ClientStatementMonthlyDeliveryService } from '../client-statement-monthly-delivery.service';

const FLAG = 'CLIENT_STATEMENT_MONTHLY_DELIVERY';

function makeService() {
  const prisma: any = { client: { findMany: jest.fn().mockResolvedValue([]) } };
  const statements: any = {};
  const pdf: any = {};
  const office: any = {};
  const scheduler: any = { addCronJob: jest.fn() };
  const deliveryPort: any = { deliver: jest.fn(), send: jest.fn() };
  const svc = new ClientStatementMonthlyDeliveryService(
    prisma, statements, pdf, office, scheduler, deliveryPort, undefined, undefined,
  );
  return { svc, prisma, scheduler, deliveryPort };
}

describe('W4 cron packaging (direct runtime dependency)', () => {
  it("require('cron') API bağlamından çözülür ve sürüm lockfile pin'i 4.3.5 ile aynıdır", () => {
    const resolved = require.resolve('cron');
    expect(resolved).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cronPkg = require('cron/package.json');
    expect(cronPkg.version).toBe('4.3.5');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { CronJob } = require('cron');
    expect(typeof CronJob).toBe('function');
  });

  it('cron API package.json içinde DOĞRUDAN dependency (devDependency DEĞİL) ve exact 4.3.5', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../../../package.json');
    expect(pkg.dependencies?.cron).toBe('4.3.5');
    expect(pkg.devDependencies?.cron).toBeUndefined();
  });
});

describe('W4 boot/schedule regresyonu (flag semantiği)', () => {
  const previous = process.env[FLAG];
  afterEach(() => {
    if (previous === undefined) delete process.env[FLAG];
    else process.env[FLAG] = previous;
  });

  it('flag OFF boot: cron kaydı YOK, teslim YOK, provider çağrısı 0', () => {
    delete process.env[FLAG];
    const { svc, prisma, scheduler, deliveryPort } = makeService();
    const runSpy = jest.spyOn(svc, 'runMonthlyDelivery');

    svc.onModuleInit();

    expect(scheduler.addCronJob).not.toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();
    expect(prisma.client.findMany).not.toHaveBeenCalled(); // tek sorgu bile yok
    expect(deliveryPort.deliver).not.toHaveBeenCalled();
    expect(deliveryPort.send).not.toHaveBeenCalled();
  });

  it('flag ON boot: YALNIZ schedule registration; geçmiş dönem teslimi TETİKLENMEZ; provider 0', () => {
    process.env[FLAG] = 'true';
    const { svc, prisma, scheduler, deliveryPort } = makeService();
    const cronSpy = jest.spyOn(svc, 'handleMonthlyCron');
    const runSpy = jest.spyOn(svc, 'runMonthlyDelivery');

    svc.onModuleInit();

    // Tam 1 kayıt; job START edilmiş ama callback BOOT ANINDA çalışmamış.
    expect(scheduler.addCronJob).toHaveBeenCalledTimes(1);
    const [jobName, job] = scheduler.addCronJob.mock.calls[0];
    expect(typeof jobName).toBe('string');
    expect(cronSpy).not.toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();
    expect(prisma.client.findMany).not.toHaveBeenCalled(); // geçmiş dönem taraması yok
    expect(deliveryPort.deliver).not.toHaveBeenCalled();
    expect(deliveryPort.send).not.toHaveBeenCalled();
    // Gerçek CronJob timer'ını bırakma (open-handle önleme)
    job.stop();
  });

  it('flag OFF iken runMonthlyDelivery doğrudan çağrılsa bile TEK sorgu çalıştırmaz (çifte emniyet)', async () => {
    delete process.env[FLAG];
    const { svc, prisma } = makeService();
    const result = await svc.runMonthlyDelivery(new Date('2026-08-09T12:00:00Z'));
    expect(result.delivered).toBe(0);
    expect(result.generated).toBe(0);
    expect(prisma.client.findMany).not.toHaveBeenCalled();
  });
});
