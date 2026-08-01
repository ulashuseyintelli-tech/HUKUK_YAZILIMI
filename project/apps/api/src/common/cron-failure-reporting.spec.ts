/**
 * W3-F04-CRON-TERMINAL-FAILURE-VISIBILITY-R01 — `reportCronJobFailure` DB-free
 * birim testi. Nest bootstrap, DB, ağ YOK — saf fonksiyon çağrısı ve
 * `IntegrationErrorReporter.report()`'a geçen argümanların şekli doğrulanır.
 */
import { reportCronJobFailure } from "./cron-failure-reporting";

describe("W3-F04 — reportCronJobFailure", () => {
  it("[1] source='CRON', operation=jobId, error=ham hata nesnesi ile report() çağırır", () => {
    const report = jest.fn().mockResolvedValue(undefined);
    const reporter: any = { report };
    const err = new Error("boom");

    reportCronJobFailure(reporter, "automation.updateDaysLeft", err);

    expect(report).toHaveBeenCalledTimes(1);
    const arg = report.mock.calls[0][0];
    expect(arg.source).toBe("CRON");
    expect(arg.operation).toBe("automation.updateDaysLeft");
    expect(arg.error).toBe(err);
  });

  it("[2] tenantId verilmezse arg.tenantId undefined kalır (platform-scope, yanlış tenant'a atfetmez)", () => {
    const report = jest.fn().mockResolvedValue(undefined);
    reportCronJobFailure({ report } as any, "scheduler.x", new Error("e"));
    expect(report.mock.calls[0][0].tenantId).toBeUndefined();
  });

  it("[3] tenantId verilirse aynen iletilir (per-tenant loop hatası doğru tenant'a atfedilir)", () => {
    const report = jest.fn().mockResolvedValue(undefined);
    reportCronJobFailure({ report } as any, "greeting.greetingSchedulerTick", new Error("e"), { tenantId: "t-1" });
    expect(report.mock.calls[0][0].tenantId).toBe("t-1");
  });

  it("[4] metadata YALNIZ outcome/reasonCode (+ opsiyonel çağıran-sağlanan alanlar) taşır — HAM error/payload metadata'ya SIZDIRILMAZ", () => {
    const report = jest.fn().mockResolvedValue(undefined);
    const err = new Error("hassas-detay-icerebilir");
    reportCronJobFailure({ report } as any, "x.y", err);
    const meta = report.mock.calls[0][0].metadata;
    expect(meta.outcome).toBe("FAILED_TERMINAL");
    expect(meta.reasonCode).toBe("UNHANDLED_EXCEPTION");
    // MUTATION-PROOF (canlı olarak da doğrulandı — bkz. final rapor §Negatif Testler):
    // meta ASLA `error`/`err`/`stack`/`rawPayload` gibi ham-hata anahtarları taşımaz.
    expect(meta.error).toBeUndefined();
    expect(meta.stack).toBeUndefined();
    expect(meta.rawPayload).toBeUndefined();
    expect(JSON.stringify(meta)).not.toContain("hassas-detay-icerebilir");
  });

  it("[5] reasonCode verilirse varsayılanın yerine geçer", () => {
    const report = jest.fn().mockResolvedValue(undefined);
    reportCronJobFailure({ report } as any, "x.y", new Error("e"), { reasonCode: "NO_WORK_QUERY_FAILED" });
    expect(report.mock.calls[0][0].metadata.reasonCode).toBe("NO_WORK_QUERY_FAILED");
  });

  it("[6] ek metadata alanları (whitelist'e IntegrationErrorReporter kendi katmaninda karar verir) outcome/reasonCode'u EZMEZ", () => {
    const report = jest.fn().mockResolvedValue(undefined);
    reportCronJobFailure({ report } as any, "x.y", new Error("e"), { metadata: { attemptedRows: 3 } });
    const meta = report.mock.calls[0][0].metadata;
    expect(meta.attemptedRows).toBe(3);
    expect(meta.outcome).toBe("FAILED_TERMINAL");
  });

  it("[7] reporter.report() reddederse (asla olmamalı, ama savunma) reportCronJobFailure ASLA reject/throw etmez (fire-and-forget)", () => {
    const report = jest.fn().mockRejectedValue(new Error("reporter-kendi-ici-hatasi"));
    expect(() => reportCronJobFailure({ report } as any, "x.y", new Error("e"))).not.toThrow();
  });

  it("[8] dönüş değeri yoktur (void) — çağıran cron akışını asla bloklamaz/bekletmez", () => {
    const report = jest.fn().mockResolvedValue(undefined);
    const ret = reportCronJobFailure({ report } as any, "x.y", new Error("e"));
    expect(ret).toBeUndefined();
  });
});
