import {
  buildClientLogEntry,
  sanitizeMetadata,
  redactPii,
  normalizeClientLevel,
} from "../error-log.sanitize";

describe("redactPii — serbest metin PII maskeleme", () => {
  it("TCKN (11 hane) ham haliyle kalmaz", () => {
    expect(redactPii("kullanici 12345678901 hata")).not.toContain("12345678901");
  });
  it("VKN (10 hane) ham haliyle kalmaz", () => {
    expect(redactPii("vkn 1234567890 son")).not.toContain("1234567890");
  });
  it("email ham haliyle kalmaz", () => {
    expect(redactPii("posta ali@example.com gitti")).not.toContain("ali@example.com");
  });
  it("IBAN (TR+24) ham haliyle kalmaz", () => {
    const iban = "TR" + "1".repeat(24);
    expect(redactPii("iban " + iban)).not.toContain(iban);
  });
  it("telefon (05xxxxxxxxx) ham haliyle kalmaz ve TCKN sanılmaz", () => {
    expect(redactPii("ara 05321234567")).not.toContain("05321234567");
  });
  it("undefined/null → undefined", () => {
    expect(redactPii(undefined)).toBeUndefined();
    expect(redactPii(null)).toBeUndefined();
  });
  it("PII içermeyen metin korunur (regresyon)", () => {
    expect(redactPii("hello world 42")).toBe("hello world 42");
  });
});

describe("sanitizeMetadata — whitelist", () => {
  it("tehlikeli alanlar (auth/cookie/token/secret/password/ham body) düşürülür", () => {
    const m = sanitizeMetadata({
      authorization: "Bearer xyz",
      cookie: "a=b",
      password: "p",
      token: "t",
      secret: "s",
      body: { tckn: "12345678901" },
      requestId: "r1",
      statusCode: 500,
    });
    expect(m).toEqual({ requestId: "r1", statusCode: 500 });
  });
  it("whitelist string alanlarında PII maskelenir", () => {
    const m = sanitizeMetadata({ route: "/clients/12345678901" });
    expect(m?.route).not.toContain("12345678901");
  });
  it("*Keys yalnız string elemanları tutar (paramKeys=[1,2] düşer)", () => {
    const m = sanitizeMetadata({ bodyKeys: ["clientId", "caseId"], paramKeys: [1, 2] as any });
    expect(m?.bodyKeys).toEqual(["clientId", "caseId"]);
    expect(m?.paramKeys).toBeUndefined();
  });
  it("obje olmayan girdi → undefined", () => {
    expect(sanitizeMetadata("x" as any)).toBeUndefined();
    expect(sanitizeMetadata(null)).toBeUndefined();
    expect(sanitizeMetadata([1, 2] as any)).toBeUndefined();
  });
  it("hiç güvenli alan yoksa → undefined", () => {
    expect(sanitizeMetadata({ evil: 1, body: "x" })).toBeUndefined();
  });
});

describe("normalizeClientLevel", () => {
  it("ERROR/WARN korunur (case-insensitive)", () => {
    expect(normalizeClientLevel("ERROR")).toBe("ERROR");
    expect(normalizeClientLevel("error")).toBe("ERROR");
    expect(normalizeClientLevel("WARN")).toBe("WARN");
  });
  it("INFO/DEBUG/geçersiz/eksik → WARN", () => {
    expect(normalizeClientLevel("INFO")).toBe("WARN");
    expect(normalizeClientLevel("DEBUG")).toBe("WARN");
    expect(normalizeClientLevel("HACK")).toBe("WARN");
    expect(normalizeClientLevel(undefined)).toBe("WARN");
  });
});

describe("buildClientLogEntry — kaynak/seviye/tenant sertleştirme", () => {
  const ctx = { tenantId: "t1", userId: "u1" };

  it("source DAİMA FRONTEND — body API/UYAP/CRON/HACK yoksayılır", () => {
    for (const s of ["UYAP", "API", "CRON", "FRONTEND", "HACK"]) {
      expect(buildClientLogEntry({ source: s, message: "x" }, ctx).source).toBe("FRONTEND");
    }
  });
  it("level yalnız ERROR/WARN; INFO/DEBUG → WARN", () => {
    expect(buildClientLogEntry({ level: "ERROR", message: "x" }, ctx).level).toBe("ERROR");
    expect(buildClientLogEntry({ level: "INFO", message: "x" }, ctx).level).toBe("WARN");
    expect(buildClientLogEntry({ level: "DEBUG", message: "x" }, ctx).level).toBe("WARN");
    expect(buildClientLogEntry({ message: "x" }, ctx).level).toBe("WARN");
  });
  it("tenantId/userId AUTH ctx'ten; body değerleri yoksayılır", () => {
    const e = buildClientLogEntry({ tenantId: "evil", userId: "attacker", message: "x" }, ctx);
    expect(e.tenantId).toBe("t1");
    expect(e.userId).toBe("u1");
  });
  it("message/stack PII redaksiyonu", () => {
    const e = buildClientLogEntry(
      { level: "ERROR", message: "tckn 12345678901", stack: "mail a@b.com crash" },
      ctx,
    );
    expect(e.message).not.toContain("12345678901");
    expect(e.stack).not.toContain("a@b.com");
  });
  it("ham request body metadata'ya yazılmaz; yalnız whitelist kalır", () => {
    const e = buildClientLogEntry(
      { message: "x", metadata: { body: { tckn: "12345678901" }, authorization: "Bearer s", requestId: "r1" } },
      ctx,
    );
    expect(e.metadata).toEqual({ requestId: "r1" });
  });
  it("method beyaz-listeli HTTP metodu değilse düşürülür", () => {
    expect(buildClientLogEntry({ message: "x", method: "GET" }, ctx).method).toBe("GET");
    expect(buildClientLogEntry({ message: "x", method: "EVIL" }, ctx).method).toBeUndefined();
  });
  it("boş message → '(no message)' (NOT NULL koruma)", () => {
    expect(buildClientLogEntry({}, ctx).message).toBe("(no message)");
  });
});
