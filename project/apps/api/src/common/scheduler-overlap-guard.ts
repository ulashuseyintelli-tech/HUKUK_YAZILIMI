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

export type OverlapGuardResult = 'RAN' | 'RAN_AFTER_WAIT' | 'SKIPPED_ALREADY_RUNNING';

/**
 * F02 (manuel/global cron cakismasi): ayni jobId MESGULKEN ne yapilacagi.
 *  - 'SKIP' (VARSAYILAN; mevcut 33 job'un davranisi DEGISMEZ): ikinci cagri sessizce atlanir.
 *  - 'WAIT': ikinci cagri FIFO sirayla bekler, oncul bitince (HATA ile bitse bile) calisir ve
 *    'RAN_AFTER_WAIT' doner. Paralellik YINE YOK — ayni jobId altinda hala tek calisan var;
 *    fark "atla" yerine "sirala"dir. Manuel-tetiklenebilir job'larda atlanan bir global tick
 *    bir sonraki tick'e kadar (nafaka: bir AY) is kaybi oldugundan bu mod secilir.
 *    Bekleyen sayisi cagri hiziyla sinirlidir (ustune binen her cagri kuyruga girer).
 */
export interface OverlapGuardOptions {
  readonly onBusy?: 'SKIP' | 'WAIT';
}

/**
 * jobId -> o job icin EN SON planlanan calismanin (calisan VEYA kuyrukta bekleyen)
 * tamamlanma sozu. Kayit varken job "mesgul"dur: SKIP cagrilari atlanir, WAIT cagrilari bu
 * sozun ARKASINA eklenir. Kuyruga giren caller sirasini SENKRON alir; boylece oncul biterken
 * araya bir SKIP cagrisinin sizip WAIT bekleyeniyle PARALEL calismasi imkansizdir.
 */
const ACTIVE_RUNS = new Map<string, Promise<void>>();

/**
 * Canonical overlap guard. `jobId` MUTLAKA `SCHEDULER_JOB_REGISTRY`'deki
 * kanonik kimlikle (`${ClassName}.${methodName}` veya 2 miras-birakilmis
 * onceki-sabit-ad — bkz registry) birebir eslesmelidir; guard bunu statik
 * olarak dogrular.
 */
export async function runWithOverlapGuard(
  jobId: string,
  fn: () => Promise<void>,
  options?: OverlapGuardOptions,
): Promise<OverlapGuardResult> {
  const predecessor = ACTIVE_RUNS.get(jobId);
  if (predecessor && (options?.onBusy ?? 'SKIP') === 'SKIP') {
    return 'SKIPPED_ALREADY_RUNNING';
  }
  let release: () => void = () => undefined;
  const mine = new Promise<void>((resolve) => { release = resolve; });
  ACTIVE_RUNS.set(jobId, mine); // sira SENKRON alinir (FIFO kuyruk sonu)
  try {
    if (predecessor) await predecessor; // asla reject etmez (bkz finally: release her yolda)
    await fn();
    return predecessor ? 'RAN_AFTER_WAIT' : 'RAN';
  } finally {
    release(); // fn hata firlatsa da bekleyen serbest kalir; hata yalniz KENDI caller'ina gider
    if (ACTIVE_RUNS.get(jobId) === mine) ACTIVE_RUNS.delete(jobId); // yalniz kuyruk sonuysam sil
  }
}

/** Yalniz test/gozlemlenebilirlik amacli — production call site'lari kullanmaz. */
export function isJobCurrentlyRunning(jobId: string): boolean {
  return ACTIVE_RUNS.has(jobId); // calisan VEYA kuyrukta bekleyen varsa 'mesgul'
}

/** Yalniz test amacli — testler arasi sizintiyi engellemek icin. */
export function resetOverlapGuardStateForTests(): void {
  ACTIVE_RUNS.clear();
}
