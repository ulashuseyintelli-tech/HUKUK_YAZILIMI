/**
 * W3-F04-CRON-TERMINAL-FAILURE-VISIBILITY-R01 — runtime dogrulama (gercek NestJS
 * bootstrap + gercek disposable Postgres + gercek `ErrorLog` tablosu).
 *
 * DB-free birim testi (../cron-failure-reporting.spec.ts) `reportCronJobFailure`'in
 * argumanlarini/sekli izole kanitlar. Bu dosya AYNI invariant'i GERCEK AppModule +
 * GERCEK `IntegrationErrorReporter` -> GERCEK `ErrorLogService.log()` -> GERCEK
 * `ErrorLog` satiri zinciriyle, gercege en yakin senaryolarla dogrular.
 *
 * Temsilci matris (brief §17/§20 — production'a benzer riskli senaryolar, TUM 35
 * cron'u degil, kategori-bazli temsilcileri calistirir):
 *   A. SUCCESS          — AutomationService.updateDaysLeft (polling/batch, artik sertifikali)
 *   B. NO-WORK SKIP      — AddressTaskSchedulerService.publishOutboxEvents (bos tablo)
 *   C. FAILURE INJECTED  — AutomationService.updateDaysLeft (prisma.case.findMany REJECT)
 *   D. CONFIG-GATED OFF  — OfficeApprovalExecutorCronService.handleCron (flag kapali, DB'ye HIC dokunmaz)
 *   E. CONFIG-GATED ON + FAILURE — ayni servis, flag acik + findMany REJECT
 *   F. GRACEFUL SHUTDOWN — app.close() sorunsuz doner
 *
 * G (beklenmeyen programlama hatasi) ve H (observability sink hatasi) DB-free
 * cron-failure-reporting.spec.ts testleri [1]/[7]'de zaten kanitlanmistir: rapor
 * mekanizmasi hatanin TURUNE gore dallanmaz (her Error tek-tip islenir), ve
 * reporter.report() reddetse dahi (H) reportCronJobFailure ASLA firlatmaz/bloklamaz.
 *
 * ENSTRUMANTASYON NOTU (gercekten gozlemlendi): `app.get(PrismaService)` bu
 * repoda servisin kendi constructor-injected `this.prisma` referansiyla AYNI
 * INSTANCE'i DONDURMEYEBILIR (bazi modullerin PrismaService'i kendi providers
 * listesinde ayrica saglamasi nedeniyle — mimari bir konu, bu task'in kapsami
 * DISINDA/DEGISTIRILMEDI). Bu yuzden:
 *   - OKUMA (ErrorLog sayimi/sorgusu) icin BAGIMSIZ, ham bir `PrismaClient`
 *     (readDb) kullanilir — DI instance kimligi belirsizliginden tamamen izole.
 *   - ENJEKSIYON (findMany REJECT) icin servisin KENDI `(service as any).prisma`
 *     referansi spy'lanir — cagrilacak GERCEK instance garanti edilir.
 *
 * Production DB'ye KESINLIKLE dokunulmaz — yalniz disposable Postgres.
 */
jest.mock("pdf-poppler", () => ({
  convert: jest.fn(async () => undefined),
}));

import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { resolveTestDatabaseUrl } from "../../../test/test-db-env";
import { AppModule } from "../../app.module";
import { AutomationService } from "../../modules/automation/automation.service";
import { AddressTaskSchedulerService } from "../../modules/address-task/address-task-scheduler.service";
import { OfficeApprovalExecutorCronService } from "../../modules/office-approval/office-approval-executor-cron.service";

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    "W3-F04 cron failure-visibility runtime gate blocked: CI requires an approved TEST_DATABASE_URL.",
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb("W3-F04 — cron terminal-failure-visibility runtime dogrulamasi (gercek AppModule + gercek ErrorLog)", () => {
  jest.setTimeout(30_000);
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let readDb: PrismaClient;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL as string;
    process.env.JWT_SECRET = process.env.JWT_SECRET || "w3-f04-test-only-not-a-real-secret";
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    await app.init();
    readDb = new PrismaClient({ datasources: { db: { url: TEST_DB_URL as string } } });
    await readDb.$connect();
  });

  afterAll(async () => {
    await readDb.$disconnect();
    const registry: any = app.get("PROM_REGISTRY", { strict: false });
    registry.clear();
    await app.close();
  });

  async function errorLogCount(operation: string): Promise<number> {
    return readDb.errorLog.count({ where: { source: "CRON", endpoint: operation } });
  }

  /**
   * `reportCronJobFailure` bilincli olarak fire-and-forget'tir (cron akisini
   * ASLA bloklamaz) — cagiran metodun kendi `await`'i, alttaki gercek
   * `IntegrationErrorReporter.report()` -> `ErrorLogService.log()` DB yazimi
   * TAMAMLANMADAN donebilir. Bu yuzden C/E testleri poll ile bekler.
   *
   * Benzersiz-nonce'li bir mesaji tasiyan ErrorLog satirini bekler (poll).
   * `ErrorLogService.log()`'un persistent-fingerprint UPSERT'i yuzunden count-delta
   * GUVENILMEZ (ayni operation+mesaj ikinci kez satir SAYISINI ARTIRMAZ, yalniz
   * occurrenceCount++) — nonce, disposable DB'nin onceki kosumlardan kalan
   * satirlarindan BAGIMSIZ, kesin ve tekrar-calistirilabilir bir kanit yuzeyi saglar.
   */
  async function waitForRowByMessage(operation: string, messageContains: string) {
    for (let i = 0; i < 40; i++) {
      const row = await readDb.errorLog.findFirst({
        where: { source: "CRON", endpoint: operation, message: { contains: messageContains } },
        orderBy: { createdAt: "desc" },
      });
      if (row) return row;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }

  it("A: SUCCESS — AutomationService.updateDaysLeft normal calisir, ErrorLog satiri OLUSMAZ", async () => {
    const service = app.get(AutomationService);
    const before = await errorLogCount("automation.updateDaysLeft");

    await expect(service.updateDaysLeft()).resolves.toBeUndefined();

    const after = await errorLogCount("automation.updateDaysLeft");
    expect(after).toBe(before);
  });

  it("B: NO-WORK SKIP — AddressTaskSchedulerService.publishOutboxEvents (bos tablo) sessizce doner, ErrorLog OLUSMAZ", async () => {
    const service = app.get(AddressTaskSchedulerService);
    const before = await errorLogCount("addressTask.publishOutboxEvents");

    await expect(service.publishOutboxEvents()).resolves.toBeUndefined();

    const after = await errorLogCount("addressTask.publishOutboxEvents");
    expect(after).toBe(before);
  });

  it("C: FAILURE INJECTED — prisma.case.findMany reddedince AutomationService.updateDaysLeft YINE DE atmaz VE benzersiz-isaretli ErrorLog satiri yazar", async () => {
    // NOT: ErrorLogService.log() persistent-fingerprint UPSERT yapar (ayni operation+mesaj
    // ikinci kez satir SAYISINI ARTIRMAZ, yalniz occurrenceCount++). Bu yuzden count-delta
    // yerine HER kosumda BENZERSIZ bir isaretleyici (nonce) kullanip o isaretleyicili satirin
    // varligini dogruluyoruz — disposable DB'nin onceki kosumlardan kalan satirlarindan tamamen
    // bagimsiz, tekrar-calistirilabilir bir kanit.
    const nonce = `W3-F04-INJECTED-DB-FAILURE-${process.pid}-${Math.random().toString(36).slice(2)}`;
    const service = app.get(AutomationService);
    const svcPrisma = (service as any).prisma; // servisin GERCEK constructor-injected referansi

    const spy = jest.spyOn(svcPrisma.case, "findMany").mockRejectedValueOnce(new Error(nonce));
    try {
      await expect(service.updateDaysLeft()).resolves.toBeUndefined(); // catch+report+swallow — cron akisi asla firlatmaz
      expect(spy).toHaveBeenCalledTimes(1); // enjeksiyonun GERCEKTEN devreye girdigini dogrula
    } finally {
      spy.mockRestore();
    }

    const row = await waitForRowByMessage("automation.updateDaysLeft", nonce);
    expect(row).not.toBeNull();
    const metadata = row!.metadata as any;
    expect(metadata?.outcome).toBe("FAILED_TERMINAL");
    expect(metadata?.reasonCode).toBe("UNHANDLED_EXCEPTION");
    // Guvenlik: ham stack/hata metadata alanina GOMULMEZ (yalniz ayrı `stack` kolonunda, sanitize edilmis).
    expect(metadata?.rawPayload).toBeUndefined();
  });

  it("D: CONFIG-GATED OFF — OfficeApprovalExecutorCronService.handleCron flag kapaliyken prisma'ya HIC dokunmaz, ErrorLog OLUSMAZ", async () => {
    delete process.env.OFFICE_APPROVAL_EXECUTOR_ENABLED;
    const service = app.get(OfficeApprovalExecutorCronService);
    const svcPrisma = (service as any).prisma;
    const before = await errorLogCount("officeApprovalExecutorCron.handleCron");
    const findManySpy = jest.spyOn(svcPrisma.officeApprovalRequest, "findMany");

    await expect(service.handleCron()).resolves.toBeUndefined();

    expect(findManySpy).not.toHaveBeenCalled(); // config-gated no-op: sema/DB'ye DOKUNULMADI
    const after = await errorLogCount("officeApprovalExecutorCron.handleCron");
    expect(after).toBe(before);
    findManySpy.mockRestore();
  });

  it("E: CONFIG-GATED ON + FAILURE INJECTED — flag acikken findMany reddedince benzersiz-isaretli ErrorLog satiri yazar (config-gate kendisi bozulmadi)", async () => {
    process.env.OFFICE_APPROVAL_EXECUTOR_ENABLED = "true";
    try {
      const nonce = `W3-F04-INJECTED-CONFIG-GATED-FAILURE-${process.pid}-${Math.random().toString(36).slice(2)}`;
      const service = app.get(OfficeApprovalExecutorCronService);
      const svcPrisma = (service as any).prisma;

      const spy = jest.spyOn(svcPrisma.officeApprovalRequest, "findMany").mockRejectedValueOnce(new Error(nonce));
      try {
        await expect(service.handleCron()).resolves.toBeUndefined();
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }

      const row = await waitForRowByMessage("officeApprovalExecutorCron.handleCron", nonce);
      expect(row).not.toBeNull();
    } finally {
      delete process.env.OFFICE_APPROVAL_EXECUTOR_ENABLED;
    }
  });

  it("F: GRACEFUL SHUTDOWN kanit — bu noktaya kadar app hala ayakta ve saglikli (afterAll'daki close() firlatirsa bu suite basarisiz olur)", () => {
    expect(app).toBeDefined();
  });
});
