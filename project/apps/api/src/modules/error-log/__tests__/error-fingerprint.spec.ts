import { computeFingerprint, normalizeStackSignature } from "../internal/error-fingerprint";

describe("computeFingerprint", () => {
  const base = { tenantId: "t1", source: "API", statusCode: 500, name: "Error", stack: "at foo (/srv/a.ts:1:2)" };

  it("aynı girdi → aynı parmak izi (deterministik, 16 hex)", () => {
    const a = computeFingerprint(base);
    const b = computeFingerprint({ ...base });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });
  it("farklı statusCode → farklı parmak izi", () => {
    expect(computeFingerprint(base)).not.toBe(computeFingerprint({ ...base, statusCode: 503 }));
  });
  it("farklı hata adı → farklı parmak izi", () => {
    expect(computeFingerprint(base)).not.toBe(computeFingerprint({ ...base, name: "TypeError" }));
  });
  it("yalnız satır:kolon farkı olan aynı site → AYNI parmak izi (grup)", () => {
    const a = computeFingerprint({ ...base, stack: "at foo (/srv/a.ts:1:2)" });
    const b = computeFingerprint({ ...base, stack: "at foo (/srv/a.ts:99:7)" });
    expect(a).toBe(b);
  });
  it("stack yoksa da deterministik", () => {
    expect(computeFingerprint({ ...base, stack: undefined })).toBe(
      computeFingerprint({ ...base, stack: undefined }),
    );
  });
});

describe("normalizeStackSignature", () => {
  it("satır/kolon ve id rakamlarını normalize eder", () => {
    const sig = normalizeStackSignature("Error: x\n    at h (/a/b/file.ts:12:34)");
    expect(sig).not.toMatch(/:\d+:\d+/);
    expect(sig).toContain("file.ts");
  });
  it("boş/null → ''", () => {
    expect(normalizeStackSignature(undefined)).toBe("");
    expect(normalizeStackSignature(null)).toBe("");
  });
});
