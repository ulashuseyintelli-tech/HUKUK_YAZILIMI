import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "@/lib/api";

/**
 * Staff intake-link metodları AUTHED olmalı (PR-A public intake-api'nin AYNASI:
 * orada Authorization YOK; burada Authorization VAR).
 */
describe("intake link api (staff, AUTH VAR)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    api.setToken("test-token");
  });

  function mockFetch(ok: boolean, body: any) {
    const fn = vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) });
    (global as unknown as { fetch: unknown }).fetch = fn;
    return fn;
  }

  it("createIntakeLink → POST doğru URL + Authorization Bearer + gövde scope", async () => {
    const fn = mockFetch(true, { link: { id: "l1" }, rawToken: "r", intakeUrl: "u" });
    await api.createIntakeLink("c1", { clientId: "cl1", scope: ["ADDRESS", "INCOME_SOURCE"] });
    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/client-intake-links/case/c1");
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    const body = JSON.parse(opts.body);
    expect(body.clientId).toBe("cl1");
    expect(body.scope).toEqual(["ADDRESS", "INCOME_SOURCE"]);
  });

  it("listIntakeLinks → GET + Authorization Bearer + status query", async () => {
    const fn = mockFetch(true, []);
    await api.listIntakeLinks("c1", "ACTIVE");
    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/client-intake-links/case/c1?status=ACTIVE");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("revokeIntakeLink → POST :id/revoke + Authorization Bearer", async () => {
    const fn = mockFetch(true, { id: "l1", status: "REVOKED" });
    await api.revokeIntakeLink("l1");
    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/client-intake-links/l1/revoke");
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });
});
