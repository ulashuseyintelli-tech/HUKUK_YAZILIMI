import { IntegrationErrorReporter } from "../integration-error-reporter";

function make() {
  const log = jest.fn().mockResolvedValue({});
  const reporter = new IntegrationErrorReporter({ log } as any);
  return { reporter, log };
}

describe("IntegrationErrorReporter (PR-3)", () => {
  it("source backend-internal'dan set edilir (UYAP/CRON)", async () => {
    const { reporter, log } = make();
    await reporter.report({ source: "UYAP", operation: "uyap.queryCaseStatus", error: new Error("x") });
    expect(log.mock.calls[0][0].source).toBe("UYAP");
    await reporter.report({ source: "CRON", operation: "outbox.process", error: new Error("y") });
    expect(log.mock.calls[1][0].source).toBe("CRON");
  });

  it("level default ERROR, override WARN", async () => {
    const { reporter, log } = make();
    await reporter.report({ source: "CRON", operation: "op", error: new Error("x") });
    expect(log.mock.calls[0][0].level).toBe("ERROR");
    await reporter.report({ source: "CRON", operation: "op", error: new Error("x"), level: "WARN" });
    expect(log.mock.calls[1][0].level).toBe("WARN");
  });

  it("operation → endpoint, errorName → errorName", async () => {
    const { reporter, log } = make();
    const e = new TypeError("boom");
    await reporter.report({ source: "UYAP", operation: "uyap.pushHaciz", error: e });
    const entry = log.mock.calls[0][0];
    expect(entry.endpoint).toBe("uyap.pushHaciz");
    expect(entry.errorName).toBe("TypeError");
  });

  it("message/stack PII redaksiyonu", async () => {
    const { reporter, log } = make();
    const e = new Error("UYAP fail tckn 12345678901");
    e.stack = "at uyap mail a@b.com crash";
    await reporter.report({ source: "UYAP", operation: "op", error: e });
    const entry = log.mock.calls[0][0];
    expect(entry.message).not.toContain("12345678901");
    expect(entry.stack).not.toContain("a@b.com");
  });

  it("metadata whitelist: tehlikeli alanlar düşer, güvenli alanlar + safeIntegrationName kalır", async () => {
    const { reporter, log } = make();
    await reporter.report({
      source: "UYAP",
      operation: "op",
      error: new Error("x"),
      metadata: { authorization: "Bearer s", rawHtml: "<...>", retryCount: 3, externalStatusCode: 503 },
    });
    const md = log.mock.calls[0][0].metadata;
    expect(md.retryCount).toBe(3);
    expect(md.externalStatusCode).toBe(503);
    expect(md.safeIntegrationName).toBe("UYAP");
    expect(md.authorization).toBeUndefined();
    expect(md.rawHtml).toBeUndefined();
  });

  it("Error olmayan girdi (string) → message metne düşer", async () => {
    const { reporter, log } = make();
    await reporter.report({ source: "CRON", operation: "op", error: "düz metin hata" });
    expect(log.mock.calls[0][0].message).toContain("düz metin hata");
  });

  it("SWALLOW: errorLogService.log throw ederse report() ATMAZ", async () => {
    const log = jest.fn().mockRejectedValue(new Error("db down"));
    const reporter = new IntegrationErrorReporter({ log } as any);
    await expect(reporter.report({ source: "CRON", operation: "op", error: new Error("x") })).resolves.toBeUndefined();
  });

  it("tenantId taşınır (varsa)", async () => {
    const { reporter, log } = make();
    await reporter.report({ source: "UYAP", operation: "op", error: new Error("x"), tenantId: "t1" });
    expect(log.mock.calls[0][0].tenantId).toBe("t1");
  });
});
