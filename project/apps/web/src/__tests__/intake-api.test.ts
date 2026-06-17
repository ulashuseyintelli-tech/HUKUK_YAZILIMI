import { describe, it, expect, vi, beforeEach } from "vitest";
import { getIntakeForm, submitIntake } from "@/lib/intake-api";

describe("intake-api (public, AUTH YOK)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch(ok: boolean, body: any) {
    const fn = vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) });
    (global as unknown as { fetch: unknown }).fetch = fn;
    return fn;
  }

  it("getIntakeForm doğru public URL + Authorization header YOK", async () => {
    const fn = mockFetch(true, { title: "Bilgi Formu", scope: ["INCOME_SOURCE"] });
    const res = await getIntakeForm("tok-123");
    expect(res.scope).toEqual(["INCOME_SOURCE"]);
    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/public/intake/tok-123");
    expect(opts.method).toBe("GET");
    // KRİTİK: Authorization header EKLENMEZ (token sızıntısı yok)
    expect(JSON.stringify(opts.headers)).not.toContain("Authorization");
    expect(opts.headers.Authorization).toBeUndefined();
  });

  it("submitIntake fields + hp gövdesi POST eder; Authorization YOK", async () => {
    const fn = mockFetch(true, { ok: true });
    await submitIntake("tok-9", [{ category: "ADDRESS", value: "X" }], "honeypot-bos");
    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/public/intake/tok-9");
    expect(opts.method).toBe("POST");
    const parsed = JSON.parse(opts.body);
    expect(parsed.fields[0]).toEqual({ category: "ADDRESS", value: "X" });
    expect(parsed.hp).toBe("honeypot-bos");
    expect(opts.headers.Authorization).toBeUndefined();
  });

  it("ok değilse generic hata fırlatır", async () => {
    mockFetch(false, { message: "Bağlantı geçersiz veya süresi dolmuş." });
    await expect(getIntakeForm("bad")).rejects.toThrow(/geçersiz|dolmuş/i);
  });
});
