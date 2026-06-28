import { buildServerLogEntry } from "../internal/server-log.builder";

describe("buildServerLogEntry — backend internal log (PR-2b)", () => {
  const base = { status: 500, requestId: "req-1", route: "/api/cases", method: "post" };

  it("source default API, level ERROR", () => {
    const e = buildServerLogEntry({ ...base, message: "boom" });
    expect(e.source).toBe("API");
    expect(e.level).toBe("ERROR");
    expect(e.statusCode).toBe(500);
  });
  it("source override edilebilir (CRON/UYAP internal)", () => {
    expect(buildServerLogEntry({ ...base, source: "CRON", message: "x" }).source).toBe("CRON");
  });
  it("errorName entry'ye taşınır (serviste fingerprint hesabı için)", () => {
    expect(buildServerLogEntry({ ...base, message: "x", errorName: "TypeError" }).errorName).toBe("TypeError");
  });
  it("message/stack PII redaksiyonu", () => {
    const e = buildServerLogEntry({ ...base, message: "fail tckn 12345678901", stack: "at x mail a@b.com" });
    expect(e.message).not.toContain("12345678901");
    expect(e.stack).not.toContain("a@b.com");
  });
  it("metadata yalnız requestId (fingerprint ARTIK kolon, metadata'da DEĞİL)", () => {
    const e = buildServerLogEntry({ ...base, message: "x" });
    expect(e.metadata).toEqual({ requestId: "req-1" });
  });
  it("isPrisma → metadata.prisma=true", () => {
    const e = buildServerLogEntry({ ...base, message: "x", isPrisma: true });
    expect(e.metadata).toEqual({ requestId: "req-1", prisma: true });
  });
  it("message yoksa errorName'e düşer, o da yoksa '(no message)'", () => {
    expect(buildServerLogEntry({ ...base, errorName: "TypeError" }).message).toBe("TypeError");
    expect(buildServerLogEntry({ ...base }).message).toBe("(no message)");
  });
  it("method normalize (uppercase)", () => {
    expect(buildServerLogEntry({ ...base, message: "x", method: "post" }).method).toBe("POST");
  });
});
