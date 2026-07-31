/**
 * W3-F03-SCHEDULER-TIMEZONE-DECLARATION-R01 — runtime dogrulama (gercek NestJS bootstrap).
 *
 * DB-free birim testi (../scheduler-timezone.spec.ts) canonical sabiti + gercek `cron`
 * paketinin takvim aritmetigini mock seviyesinde/izole kanitlar. Bu dosya AYNI invariant'i
 * GERCEK AppModule bootstrap'i + GERCEK SchedulerRegistry ile, disposable bir Postgres'e
 * karsi dogrular:
 *
 *   Runtime-matrix (§ brief) altı senaryo:
 *   A. host TZ=UTC + gate on/default            → tek `it` icinde "Boot A" blogu.
 *   B. host TZ=Europe/Istanbul + gate on/default → ayni `it` icinde "Boot B" blogu.
 *   C. scheduler gate OFF (4 config-gated job varsayilan kapali) → kayit KOSULSUZDUR;
 *      hem Boot A hem Boot B bu 4 job'u da (flag'leri set ETMEDEN) 33'un icinde tasir.
 *   D. gecersiz timezone config → bu task, runtime'da env-configurable bir override
 *      SUNMADI (bilincli kapsam karari — bkz scheduler-timezone.ts basligindaki not);
 *      bu yuzden D runtime seviyesinde UYGULANAMAZ. Fail-closed kaniti zaten birim
 *      seviyesinde: ../scheduler-timezone.spec.ts → assertValidSchedulerTimezone
 *      testleri [4] (gercek olmayan IANA string'i) ve [5] (gercek ama allowlist-disi
 *      'UTC') RED durumunu kanitlar.
 *   E. duplicate kayit onleme → asagida ayrintili.
 *   F. graceful shutdown → asagida ayrintili.
 *
 * E ve F kanit yontemi:
 *   - SchedulerOrchestrator.addCron (@nestjs/schedule@6.1.0) `name` verilmemis her cron
 *     icin HER cagride YENI bir `crypto.randomUUID()` key uretir; SchedulerRegistry.addCronJob
 *     ayni key ikinci kez eklenmeye calisilirsa THROW eder (DUPLICATE_SCHEDULER). Yani
 *     `app.init()`'in hatasiz tamamlanmasinin KENDISI E'nin kanitidir — 6 ayri
 *     ScheduleModule.forRoot() cagri noktasi (app.module.ts + automation/interest-engine/
 *     policy-engine/scheduler/icrabot modulleri — icrabot DORMANT) hicbir duplicate key
 *     CATISMASINA yol acmiyor demektir. Ayrica jobs.size === 33 acik kontrolu de eklenir
 *     (bir catisma OLSAYDI Map boyutu 33'un ALTINDA kalirdi).
 *   - F: `app.close()` NestJS'in beforeApplicationShutdown yasam-dongusu kancasini tetikler;
 *     @nestjs/schedule'in SchedulerOrchestrator.beforeApplicationShutdown() TUM cron job'lari
 *     durdurur (cronJob.stop()) ve registry'den siler. Test, close()'un firlatmadan/asilmadan
 *     donmesini dogrudan bekler (jest.setTimeout ile sinirlanmis).
 *
 * ASIL IDDIA (drift): name verilmemis 31 job'un Map key'i HER boot'ta FARKLI random UUID'dir
 * (bkz yukarida) — bu yuzden Boot A/B korelasyonu KEY ile degil, POZISYONEL yapilir: discovery
 * sirasi (Nest DiscoveryService + MetadataScanner, sabit bir modul grafiginde) deterministiktir;
 * ayni index her iki boot'ta da ayni sinif/metoda karsilik gelir. Bu varsayim, her iki boot'un
 * ayni index'te ayni cron ifadesini (`cronTime.source`) tasidigi ayrica dogrulanarak desteklenir.
 *
 * KUCUK, BILINCLI kabul edilen flake riski: Boot A ve Boot B'nin `nextDates(3)` hesaplamasi
 * GERCEK "su an"i kullanir (cron paketi icinde `DateTime.utc()` — bkz ../scheduler-timezone.spec.ts
 * basligindaki arastirma notu); iki boot arasinda gecen birkac saniyelik gercek zaman farki,
 * TEORIDE bir job'un tam tetiklenme sinirina rastlarsa yanlis-pozitif "drift" gorunumu verebilir.
 * Bu, saniyenin altinda cok dusuk olasilikli bir test-zamanlama artefakti olur (gercek bir TZ
 * hatasi degil) ve mevcut cron ifadelerinin hicbiri saniye/dakika hassasiyetinde degildir
 * (en sik: EVERY_MINUTE) — pratikte gozlemlenmesi beklenmez.
 */
/**
 * `pdf-poppler`'in kendi index.js'i, sistemde poppler-utils ikili dosyalari
 * (pdftoppm/pdftocairo) bulunamazsa modul YUKLEME anindA (bare require, hicbir
 * fonksiyon cagrilmadan) dogrudan `process.exit(1)` cagirir — bu, ayni jest
 * worker'indaki TUM diger testleri de dusuren, yakalanamayan bir surec sonlanmasidir
 * (GitHub Actions ubuntu-latest runner'inda gozlemlendi; Windows'ta poppler-utils
 * kurulu oldugundan sessizce calisir, bu yuzden yerel kosumda hic gorulmez).
 * Bu dosya, SchedulerRegistry'yi incelemek icin GERCEK AppModule'u bootstrap eder;
 * AppModule -> CaseModule -> CaseController -> OcrService zinciri module-load
 * aninda `require("pdf-poppler")` calistirir. OCR islevselligi bu testte hic
 * kullanilmadigindan (yalniz scheduler registrasyonu inceleniyor), gercek paketi
 * zararsiz bir stub ile degistirmek yeterli ve dogrudur — jest.mock hoisting
 * sayesinde bu, asagidaki import'lardan ONCE etkili olur.
 */
jest.mock("pdf-poppler", () => ({
  convert: jest.fn(async () => undefined),
}));

import { NestFactory } from "@nestjs/core";
import { SchedulerRegistry } from "@nestjs/schedule";
import { resolveTestDatabaseUrl } from "../../../test/test-db-env";
import { AppModule } from "../../app.module";

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    "W3-F03 scheduler timezone runtime gate blocked: CI requires an approved TEST_DATABASE_URL.",
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

/** bkz w3-async-runtime-binding.static-guard.spec.ts → CERTIFIED_BOUND_CRON_JOB_COUNT. */
const EXPECTED_CRON_JOB_COUNT = 33;

/** officeApprovalExecutor: OFFICE_APPROVAL_EXECUTOR_ENABLED varsayilan kapali (senaryo C ankraji). */
const NAMED_JOBS = ["errorLogRetention", "officeApprovalExecutor"] as const;

type JobSnapshot = {
  source: string;
  timeZone: string | undefined;
  nextFires: number[];
};

describeWithDisposableDb(
  "W3-F03 — SCHEDULER_TIMEZONE runtime dogrulamasi (gercek AppModule bootstrap, 2x host TZ)",
  () => {
    jest.setTimeout(30_000);

    let originalTz: string | undefined;

    beforeAll(() => {
      originalTz = process.env.TZ;
      process.env.DATABASE_URL = TEST_DB_URL;
    });

    afterAll(() => {
      process.env.TZ = originalTz;
    });

    async function bootApp(hostTimeZone: string) {
      process.env.TZ = hostTimeZone;
      process.env.DATABASE_URL = TEST_DB_URL;
      // abortOnError:false — Nest'in varsayilan process.exit(1) davranisini KAPATIR;
      // boylece bootstrap hatasi gercek Error olarak firlar (test/CI surecini oldurmez).
      const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
      await app.init();
      const registry = app.get(SchedulerRegistry);
      return { app, registry };
    }

    /**
     * ARASTIRMA BULGUSU (SCHEDULER_TIMEZONE/cron ile ILGISIZ, ayri bir alt-sistem):
     * `metrics-registry.module.ts` PROM_REGISTRY'yi DOSYA-SEVIYESINDE bir modul-scope
     * singleton olarak tanimlar (`const registry = new Registry();`, Nest yasam-dongusune
     * BAGLI DEGIL — app.close() bunu RESETLEMEZ). SimulationMetricsService/SchedulerMetricsService/
     * HttpMetricsMiddleware/BalanceDisplayShadowDiffMetrics/MetricsAggregatorController gibi
     * BIRDEN FAZLA servis, constructor'larinda bu AYNI paylasilan registry'ye isimli
     * Counter/Gauge kaydeder. Bu dosya AYNI process icinde AppModule'u IKI KEZ (Boot A + Boot B)
     * ayaga kaldirdigi icin (ki bu tam olarak brief'in istedigi TZ-karsilastirma yontemidir),
     * Boot B'nin ayni servisleri YENIDEN construct etmesi ayni metrik adlarini TEKRAR kaydetmeye
     * calisir → prom-client Registry.registerMetric FIRLATIR ("already registered"). Duzeltme:
     * metrics-registry.module.ts/simulation-metrics.service.ts (veya PROM_REGISTRY'ye yazan
     * DIGER servisler) DEGISTIRILMEDI (kapsam disi) — bunun yerine Boot A kapandiktan sonra
     * PAYLASILAN registry'yi GENEL olarak temizliyoruz (yalniz simulation'a ozel bir bypass
     * DEGIL — boylece hangi servisin ilk carpistigi ONEMLI DEGIL, hepsi kapsanir).
     */
    function clearSharedPromRegistry(app: any): void {
      const registry: any = app.get("PROM_REGISTRY", { strict: false });
      registry.clear();
    }

    /** Discovery-sira pozisyonel anlik goruntu: key'e DEGIL, index'e gore karsilastirilir. */
    function snapshotJobs(registry: SchedulerRegistry): JobSnapshot[] {
      const jobs = [...registry.getCronJobs().values()] as any[];
      return jobs.map((job) => ({
        source: String(job.cronTime.source),
        timeZone: job.cronTime.timeZone,
        nextFires: (job.nextDates(3) as any[]).map((d) => d.toMillis()),
      }));
    }

    it(
      "A+B+C+E+F: iki host-TZ altinda (UTC, Europe/Istanbul) 33 cron kaydi, 0 duplicate, " +
        "config-gated 4 job da kosulsuz kayitli, 0 job drift, temiz kapanis",
      async () => {
        // ── Boot A: host TZ=UTC (deploy stack'in gercek pinlenmis degeri) — senaryo A ──
        const bootA = await bootApp("UTC");
        expect(bootA.registry.getCronJobs().size).toBe(EXPECTED_CRON_JOB_COUNT);
        for (const name of NAMED_JOBS) {
          expect(() => bootA.registry.getCronJob(name)).not.toThrow();
        }
        const snapshotA = snapshotJobs(bootA.registry);
        clearSharedPromRegistry(bootA.app); // bkz clearSharedPromRegistry basligi — Boot B icin sart
        await expect(bootA.app.close()).resolves.toBeUndefined(); // F (Boot A)

        // ── Boot B: host TZ=Europe/Istanbul — senaryo B ──
        const bootB = await bootApp("Europe/Istanbul");
        expect(bootB.registry.getCronJobs().size).toBe(EXPECTED_CRON_JOB_COUNT);
        for (const name of NAMED_JOBS) {
          expect(() => bootB.registry.getCronJob(name)).not.toThrow();
        }
        const snapshotB = snapshotJobs(bootB.registry);
        await expect(bootB.app.close()).resolves.toBeUndefined(); // F (Boot B)

        // ── Sayim + 0-duplicate (E) ──
        // NOT: app.init()'in HER iki boot'ta da hatasiz tamamlanmasinin kendisi zaten E'nin
        // kaniti (SchedulerRegistry.addCronJob duplicate key'de THROW eder — yukaridaki
        // dosya basligi notuna bkz). Asagidaki .size kontrolu bunu sayisal olarak da dogrular.
        expect(snapshotA).toHaveLength(EXPECTED_CRON_JOB_COUNT);
        expect(snapshotB).toHaveLength(EXPECTED_CRON_JOB_COUNT);

        // ── Pozisyonel korelasyon on-kosulu: ayni index'te ayni cron ifadesi + ayni TZ ──
        expect(snapshotB.map((j) => j.source)).toEqual(snapshotA.map((j) => j.source));
        for (const snapshot of [snapshotA, snapshotB]) {
          for (const job of snapshot) {
            expect(job.timeZone).toBe("Europe/Istanbul");
          }
        }

        // ── ASIL IDDIA: 0 of 33 drift ──
        const drifting: string[] = [];
        for (let i = 0; i < snapshotA.length; i++) {
          const a = snapshotA[i];
          const b = snapshotB[i];
          const identical =
            a.nextFires.length === b.nextFires.length &&
            a.nextFires.every((ms, idx) => ms === b.nextFires[idx]);
          if (!identical) {
            drifting.push(
              `[idx ${i}] '${a.source}': BootA(UTC)=${JSON.stringify(a.nextFires)} vs BootB(Europe/Istanbul)=${JSON.stringify(b.nextFires)}`,
            );
          }
        }
        expect(drifting).toEqual([]);
      },
    );
  },
);
