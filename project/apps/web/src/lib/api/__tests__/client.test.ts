import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiClient } from "../client";
import { isConfirmRequiredEnvelope } from "../../guarded-edge";

function mockFetch(resp: { ok: boolean; status: number; body: unknown }) {
  (global as any).fetch = vi.fn(async () => ({
    ok: resp.ok,
    status: resp.status,
    json: async () => resp.body,
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ApiClient.request — P3-2B error-body preservation", () => {
  it("4xx → throw; .message + .body (structured) + .status KORUNUR", async () => {
    mockFetch({ ok: false, status: 400, body: { message: "Geçersiz", code: "BAD", detail: "x" } });
    const client = new ApiClient();
    try {
      await client.request("/cases/c1");
      throw new Error("BEKLENMEDİK: throw etmedi");
    } catch (e: any) {
      expect(e.message).toBe("Geçersiz");
      expect(e.status).toBe(400);
      expect(e.body).toEqual({ message: "Geçersiz", code: "BAD", detail: "x" });
    }
  });

  it("200 + Guarded-Edge zarfı → ERROR'A ÇEVRİLMEZ; ham döner, detektör yakalar", async () => {
    const env = {
      axis: "GUIDED_OPEN_PERMISSION",
      outcome: "CONFIRM_REQUIRED",
      actionCode: "CHANGE_STATUS",
      target: { resourceType: "CASE", caseId: "c1" },
      confirmation: { token: "t", expiresAt: "2026-01-01T00:00:00Z", bindingHash: "h" },
    };
    mockFetch({ ok: true, status: 200, body: env });
    const client = new ApiClient();
    const res = await client.request("/case-status/c1/change");
    expect(res).toEqual(env);
    expect(isConfirmRequiredEnvelope(res)).toBe(true);
  });

  it("200 + normal {success,data} → değişmeden döner", async () => {
    const body = { success: true, data: { id: "c1" }, message: "ok" };
    mockFetch({ ok: true, status: 200, body });
    const client = new ApiClient();
    const res = await client.request("/cases/c1");
    expect(res).toEqual(body);
  });
});
