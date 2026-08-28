/**
 * W3-F07-CRON-OVERLAP-AND-JOB-IDENTITY-R01 — runtime dogrulama (gercek NestJS bootstrap).
 *
 * DB-free birim testleri (../scheduler-overlap-guard.spec.ts) canonical primitive'i
 * (`runWithOverlapGuard`) izole kanitlar; static guard (`w3-async-runtime-binding.static-guard.spec.ts`
 * → "W3-F07" describe blogu) kaynak-metni seviyesinde identity/overlap kablolamasini kanitlar.
 * Bu dosya AYNI iddiayi GERCEK AppModule bootstrap'i + GERCEK SchedulerRegistry ile,
 * disposable bir Postgres'e karsi dogrular:
 *
 *   Runtime-matrix (brief §11) senaryolari:
 *   A. normal run            → Boot A/B'nin ikisi de basariyla init olur (asagida).
 *   B. duplicate start       → GERCEK DI-resolved ErrorLogRetentionService instance'i
 *                              uzerinde handleCron()'u ESZAMANLI iki kez cagirip
 *                              runRetentionCleanup()'in yalniz BIR KEZ calistigini kanitlar.
 *   C. restart               → Boot A -> close -> Boot B, ikisinde de 33 job + 0 duplicate.
 *   D. config gate off       → W3-F03'un runtime testi zaten kanitliyor (DOKUNULMADI, tekrar
 *                              edilmiyor); burada yalniz officeApprovalExecutor/errorLogRetention
 *                              gibi 2 "miras ad"in HALA calisir registry anahtari oldugu dogrulanir.
 *   E. parallel execution    → DB-free birim testi [C] zaten mekanizma seviyesinde kanitladi;
 *                              burada FARKLI iki job'un (ayni jobId DEGIL) GERCEK DI instance'lari
 *                              uzerinden birbirini engellemedigi dogrulanir.
 *   F. graceful shutdown     → app.close() firlatmadan doner (W3-F03 ile ayni yontem).
 *   G. re-registration       → ASIL IDDIA: 33 registry jobId'sinin TAMAMI icin
 *                              `registry.getCronJob(jobId)` BASARILI olur — artik "name
 *                              verilmemis 31 job = rastgele UUID" DEGIL, GERCEKTEN
 *                              deterministik/aranabilir bir anahtar. app.init()'in
 *                              hatasiz tamamlanmasi (33 ayri isim CATISMADAN kayit oldu)
 *                              zaten E/G'nin (0 duplicate) kaniti.
 */
/**
 * `pdf-poppler`'in kendi index.js'i, sistemde poppler-utils ikili dosyalari bulunamazsa
 * modul YUKLEME aninda dogrudan `process.exit(1)` cagirir — W3-F03'un ayni dosyasindaki
 * ayni notla BIREBIR ayni neden/cozum (bkz o dosya basligi).
 */
jest.mock("pdf-poppler", () => ({
  convert: jest.fn(async () => undefined),
}));

import { NestFactory } from "@nestjs/core";
import { SchedulerRegistry } from "@nestjs/schedule";
import { resolveTestDatabaseUrl } from "../../../test/test-db-env";
import { AppModule } from "../../app.module";
import { SCHEDULER_JOB_REGISTRY, SCHEDULER_JOB_REGISTRY_COUNT } from "../scheduler-job-registry";
import { ErrorLogRetentionService } from "../../modules/error-log/retention/error-log-retention.service";
import { RateSyncService } from "../../modules/interest-engine/rate-sync.service";
import * as overlapGuardModule from "../scheduler-overlap-guard";

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    "W3-F07 cron overlap+identity runtime gate blocked: CI requires an approved TEST_DATABASE_URL.",
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

/** bkz w3-async-runtime-binding.static-guard.spec.ts → CERTIFIED_BOUND_CRON_JOB_COUNT (ayni sayi). */
const EXPECTED_CRON_JOB_COUNT = 33;

describeWithDisposableDb(
  "W3-F07 — cron overlap + job identity runtime dogrulamasi (gercek AppModule bootstrap)",
  () => {
    jest.setTimeout(30_000);

    beforeAll(() => {
      process.env.DATABASE_URL = TEST_DB_URL;
    });

    async function bootApp() {
      process.env.DATABASE_URL = TEST_DB_URL;
      process.env.JWT_SECRET = process.env.JWT_SECRET || "w3-f07-test-only-not-a-real-secret";
      const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
      await app.init();
      const registry = app.get(SchedulerRegistry);
      return { app, registry };
    }

    /** bkz w3-f03-scheduler-timezone-runtime.db-gated.integration.spec.ts basligindaki ayni not. */
    function clearSharedPromRegistry(app: any): void {
      const registry: any = app.get("PROM_REGISTRY", { strict: false });
      registry.clear();
    }

    it(
      "A+C+F+G: iki ardisik boot (restart simulasyonu), her ikisinde de 33 job kaydi, " +
        "registry'deki 33 jobId'nin TAMAMI GERCEK SchedulerRegistry'de aranabilir, temiz kapanis",
      async () => {
        expect(SCHEDULER_JOB_REGISTRY.length).toBe(SCHEDULER_JOB_REGISTRY_COUNT);

        // ── Boot A ──
        const bootA = await bootApp();
        expect(bootA.registry.getCronJobs().size).toBe(EXPECTED_CRON_JOB_COUNT);
        const missingInBootA: string[] = [];
        for (const r of SCHEDULER_JOB_REGISTRY) {
          try {
            bootA.registry.getCronJob(r.jobId);
          } catch {
            missingInBootA.push(r.jobId);
          }
        }
        expect(missingInBootA).toEqual([]);
        clearSharedPromRegistry(bootA.app);
        await expect(bootA.app.close()).resolves.toBeUndefined(); // F (Boot A)

        // ── Boot B (restart simulasyonu — senaryo C) ──
        const bootB = await bootApp();
        expect(bootB.registry.getCronJobs().size).toBe(EXPECTED_CRON_JOB_COUNT);
        const missingInBootB: string[] = [];
        for (const r of SCHEDULER_JOB_REGISTRY) {
          try {
            bootB.registry.getCronJob(r.jobId);
          } catch {
            missingInBootB.push(r.jobId);
          }
        }
        expect(missingInBootB).toEqual([]);

        // ── ASIL IDDIA (G): app.init()'in HER IKI boot'ta da hatasiz tamamlanmasinin
        // kendisi zaten 0-duplicate kaniti (SchedulerRegistry.addCronJob duplicate
        // key'de THROW eder) — ama artik bu, W3-F03'teki gibi "UUID hic CARPISMADI"
        // sansina DEGIL, 33 GERCEK deterministik isme dayanir. Sayisal olarak da dogrula.
        expect(bootB.registry.getCronJobs().size).toBe(SCHEDULER_JOB_REGISTRY_COUNT);

        clearSharedPromRegistry(bootB.app); // sonraki it()'lerin boot'lari icin sart (W3-F03 ile ayni desen)
        await expect(bootB.app.close()).resolves.toBeUndefined(); // F (Boot B)
      },
    );

    it(
      "B: duplicate start — GERCEK DI-resolved ErrorLogRetentionService.handleCron() " +
        "ESZAMANLI iki kez cagrilinca runRetentionCleanup() YALNIZ BIR KEZ calisir",
      async () => {
        const { app } = await bootApp();
        try {
          const svc = app.get(ErrorLogRetentionService);
          const spy = jest.spyOn(svc, "runRetentionCleanup");

          // Ayni jobId'yi paylasan iki cagriyi GERCEKTEN eszamanli baslat.
          await Promise.all([svc.handleCron(), svc.handleCron()]);

          expect(spy).toHaveBeenCalledTimes(1); // ikinci cagri overlap-guard tarafindan SKIP edildi
          spy.mockRestore();
        } finally {
          clearSharedPromRegistry(app); // her close oncesi sart (W3-F03 ile ayni desen)
          await app.close();
        }
      },
    );

    it(
      "E: parallel execution (farkli job) — GERCEK DI-resolved iki FARKLI servis " +
        "(farkli jobId) ESZAMANLI calisirken BIRBIRINI ENGELLEMEZ: her iki guard " +
        "cagrisi da RAN doner (SKIPPED_ALREADY_RUNNING YOK) ve errorLog govdesi calisir",
      async () => {
        const { app } = await bootApp();
        try {
          const errorLogSvc = app.get(ErrorLogRetentionService);
          const rateSyncSvc = app.get(RateSyncService);
          // "Birbirini engellemedi" kaniti guard-MODUL spy'i ile alinir: ts-jest CJS
          // derlemesinde servislerin named-import cagrilari her seferinde modul-exports
          // uzerinden okunur, dolayisiyla spy GERCEK cagriyi gorur ve donus degerine
          // ('RAN' | 'SKIPPED_ALREADY_RUNNING') dogrudan erisir. NOT: Prisma 5 model
          // delegate'inin METOD property'si her erisimde yeniden uretilir
          // (client.office.findMany !== client.office.findMany) — bu yuzden
          // jest.spyOn(prisma.office, 'findMany') servis-ici cagriyi YAKALAYAMAZ ve
          // Prisma-level kanit burada yapisal olarak kullanilamaz. errorLog tarafinda
          // ayrica govde-metodu kaniti korunur (runRetentionCleanup K3 config-gate'i
          // nedeniyle Prisma'ya inmeyebilir ama guard SKIP etseydi HIC cagrilmazdi).
          const guardSpy = jest.spyOn(overlapGuardModule, "runWithOverlapGuard");
          const errorLogBodySpy = jest.spyOn(errorLogSvc, "runRetentionCleanup");

          await Promise.all([errorLogSvc.handleCron(), rateSyncSvc.syncMonthlyMevduatRates()]);

          const calledJobIds = guardSpy.mock.calls.map((c) => c[0]);
          expect(calledJobIds).toContain("errorLogRetention");
          expect(calledJobIds).toContain("RateSyncService.syncMonthlyMevduatRates");
          const guardResults = await Promise.all(guardSpy.mock.results.map((r) => r.value));
          expect(guardResults).toEqual(guardResults.map(() => "RAN")); // hicbiri SKIP edilmedi — birbirini ENGELLEMEDI
          expect(errorLogBodySpy).toHaveBeenCalledTimes(1); // errorLogRetention govdesi GERCEKTEN cagrildi
          errorLogBodySpy.mockRestore();
          guardSpy.mockRestore();
        } finally {
          clearSharedPromRegistry(app); // her close oncesi sart (W3-F03 ile ayni desen)
          await app.close();
        }
      },
    );
  },
);
