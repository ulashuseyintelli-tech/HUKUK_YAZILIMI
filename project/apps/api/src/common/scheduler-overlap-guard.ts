/**
 * RUNTIME-OPERABILITY-CERTIFICATION-R01 / W3-F07-CRON-OVERLAP-AND-JOB-IDENTITY-R01.
 *
 * KOK NEDEN (kaynak-seviyesinde dogrulandi, `@nestjs/schedule@6.1.0` +
 * `cron@4.3.5` node_modules kaynagi okunarak):
 *
 * 1. `SchedulerOrchestrator.addCron()` (`@nestjs/schedule/dist/scheduler.orchestrator.js`):
 *    `const name = options.name || crypto.randomUUID();` — `@Cron()` cagrisina
 *    explicit `name` VERILMEDIGINDE, job'un `SchedulerRegistry` anahtari HER
 *    process baslangicinda YENI bir rastgele UUID'dir. Bu, brief'in acikca
 *    yasakladigi "UUID kimlik" anti-desenidir — kutuphanenin KENDI varsayilan
 *    davranisi.
 * 2. Alttaki `cron` paketi (`CronJob`) `waitForCompletion` secenegini destekler
 *    (bkz `cron/dist/types/cron.types.d.ts`) ama VARSAYILAN `false`'tur ve bu
 *    repodaki HICBIR `@Cron()` cagrisi onu hic gecmiyordu (bagimsiz dogrulandi,
 *    tek eslesme alakasiz `load-test-runner.ts` idi) — yani "iki tik ust uste
 *    binebilir mi" sorusu her zaman uygulama-katmani (ad-hoc, TUTARSIZ) bir
 *    boolean flag'e birakilmisti (bazi metodlarda vardi — `isProcessing`,
 *    `isRunning`, `isRunning_X` — bazilarinda HIC yoktu).
 *
 * COZUM: Bu dosya iki BAGIMSIZ, kucuk, mevcut mimariye ek/inject GEREKTIRMEYEN
 * (duz fonksiyon, NestJS DI YOK — `resolveSchedulerTimezone`/`reportCronJobFailure`
 * ile ayni idiom) canonical mekanizma sunar:
 *
 *  - `runWithOverlapGuard(jobId, fn)`: process-genelinde paylasilan (module-cache
 *    singleton) bir `Set<string>` uzerinden, AYNI jobId icin ikinci bir eszamanli
 *    cagriyi SESSIZCE calistirmadan atlar ('SKIPPED_ALREADY_RUNNING' doner).
 *    Cagiran taraf bu sonucu KENDI Logger'iyla loglar (bkz her call site) —
 *    boylece mevcut per-sinif Logger baglami (class adi context) korunur.
 *  - Cron-tick VE manuel/controller tetikli cagrilar AYNI jobId'yi paylastigi
 *    surece HER İKİ yoldan gelen ust-uste binme de bu mekanizma ile engellenir
 *    (yalniz cron-tick'e ozel `cron` kutuphanesi seviyesindeki `waitForCompletion`'dan
 *    FARKLI olarak — DENY_PARALLEL policy'si icin bu daha genis/dogru korumadir).
 *
 * `SCHEDULER_JOB_REGISTRY` (bkz `scheduler-job-registry.ts`) her 33 runtime-bound
 * job icin TAM OLARAK bir `SchedulerOverlapPolicy` kaydeder; guard testleri
 * (`w3-async-runtime-binding.static-guard.spec.ts` → "W3-F07" describe blogu)
 * DENY_PARALLEL/SKIP_IF_RUNNING policy'sine sahip HER bagli job'un govdesinin
 * gercekten `runWithOverlapGuard(` cagirdigini statik olarak dogrular.
 */

export type SchedulerOverlapPolicy =
  | 'ALLOW_PARALLEL'
  | 'DENY_PARALLEL'
  | 'QUEUE_NEXT'
  | 'SKIP_IF_RUNNING';

export type OverlapGuardResult = 'RAN' | 'SKIPPED_ALREADY_RUNNING';

const RUNNING_JOB_IDS = new Set<string>();

/**
 * Canonical overlap guard. `jobId` MUTLAKA `SCHEDULER_JOB_REGISTRY`'deki
 * kanonik kimlikle (`${ClassName}.${methodName}` veya 2 miras-birakilmis
 * onceki-sabit-ad — bkz registry) birebir eslesmelidir; guard bunu statik
 * olarak dogrular.
 */
export async function runWithOverlapGuard(
  jobId: string,
  fn: () => Promise<void>,
): Promise<OverlapGuardResult> {
  if (RUNNING_JOB_IDS.has(jobId)) {
    return 'SKIPPED_ALREADY_RUNNING';
  }
  RUNNING_JOB_IDS.add(jobId);
  try {
    await fn();
    return 'RAN';
  } finally {
    RUNNING_JOB_IDS.delete(jobId);
  }
}

/** Yalniz test/gozlemlenebilirlik amacli — production call site'lari kullanmaz. */
export function isJobCurrentlyRunning(jobId: string): boolean {
  return RUNNING_JOB_IDS.has(jobId);
}

/** Yalniz test amacli — testler arasi sizintiyi engellemek icin. */
export function resetOverlapGuardStateForTests(): void {
  RUNNING_JOB_IDS.clear();
}
