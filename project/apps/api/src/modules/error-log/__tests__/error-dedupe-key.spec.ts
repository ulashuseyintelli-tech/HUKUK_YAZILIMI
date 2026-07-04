import {
  computePersistentFingerprint,
  computeActiveDedupeKey,
  normalizeEndpoint,
  normalizeMessage,
} from "../internal/error-dedupe-key";

describe("normalizeEndpoint", () => {
  it("sayısal id → :id ; /cases/123 ≡ /cases/456", () => {
    expect(normalizeEndpoint("/api/cases/123")).toBe("/api/cases/:id");
    expect(normalizeEndpoint("/api/cases/123")).toBe(normalizeEndpoint("/api/cases/456"));
  });
  it("cuid ve uuid segmentleri → :id", () => {
    expect(normalizeEndpoint("/api/cases/clx1234567890abcdefghij/x")).toBe("/api/cases/:id/x");
    expect(normalizeEndpoint("/api/u/123e4567-e89b-12d3-a456-426614174000")).toBe("/api/u/:id");
  });
  it("query string atılır", () => {
    expect(normalizeEndpoint("/api/cases/12?page=2")).toBe("/api/cases/:id");
  });
  it("boş/null → ''", () => {
    expect(normalizeEndpoint(undefined)).toBe("");
  });
});

describe("normalizeMessage", () => {
  it("rakamlar # olur (aynı hata farklı id)", () => {
    expect(normalizeMessage("user 123 not found")).toBe(normalizeMessage("user 999 not found"));
  });
  it("PII redaksiyonu uygulanır", () => {
    expect(normalizeMessage("mail ali@example.com")).not.toContain("ali@example.com");
  });
});

describe("computePersistentFingerprint", () => {
  const base = { name: "Error", message: "boom", stack: "at f (/a.ts:1:2)", statusCode: 500 };
  it("deterministik + 64-hex SHA-256", () => {
    const a = computePersistentFingerprint(base);
    expect(a).toBe(computePersistentFingerprint({ ...base }));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it("farklı mesaj → farklı fingerprint", () => {
    expect(computePersistentFingerprint(base)).not.toBe(
      computePersistentFingerprint({ ...base, message: "completely different" }),
    );
  });
  it("yalnız id/satır farkı → AYNI fingerprint (gruplama)", () => {
    const a = computePersistentFingerprint({ ...base, message: "user 1 yok", stack: "at f (/a.ts:1:2)" });
    const b = computePersistentFingerprint({ ...base, message: "user 2 yok", stack: "at f (/a.ts:9:9)" });
    expect(a).toBe(b);
  });
});

describe("computeActiveDedupeKey", () => {
  const fp = "deadbeef";
  const base = { tenantId: "t1", source: "API", method: "POST", endpoint: "/api/cases/1", statusCode: 500, fingerprint: fp };

  it("64-hex SHA-256", () => {
    expect(computeActiveDedupeKey(base)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("farklı tenant → farklı key (kabul #5)", () => {
    expect(computeActiveDedupeKey(base)).not.toBe(computeActiveDedupeKey({ ...base, tenantId: "t2" }));
  });
  it("farklı (normalized) endpoint → farklı key (kabul #6)", () => {
    expect(computeActiveDedupeKey({ ...base, endpoint: "/api/cases/1" })).not.toBe(
      computeActiveDedupeKey({ ...base, endpoint: "/api/clients/1" }),
    );
  });
  it("/cases/123 ve /cases/456 → AYNI key (kabul #7, endpoint normalize)", () => {
    expect(computeActiveDedupeKey({ ...base, endpoint: "/api/cases/123" })).toBe(
      computeActiveDedupeKey({ ...base, endpoint: "/api/cases/456" }),
    );
  });
  it("farklı source → farklı key", () => {
    expect(computeActiveDedupeKey(base)).not.toBe(computeActiveDedupeKey({ ...base, source: "FRONTEND" }));
  });
  it("method case-insensitive (post≡POST)", () => {
    expect(computeActiveDedupeKey({ ...base, method: "post" })).toBe(
      computeActiveDedupeKey({ ...base, method: "POST" }),
    );
  });
  it("null tenant → deterministik (auth-öncesi hatalar birleşir)", () => {
    expect(computeActiveDedupeKey({ ...base, tenantId: undefined })).toBe(
      computeActiveDedupeKey({ ...base, tenantId: undefined }),
    );
  });
});
