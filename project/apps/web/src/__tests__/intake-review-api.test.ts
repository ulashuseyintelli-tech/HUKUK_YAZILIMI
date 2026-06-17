import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "@/lib/api";

/**
 * PR-C1 review metodları AUTHED + doğru uçlara gider. (Promote metodu YOK — C2.)
 */
describe("intake review api (staff, AUTH VAR, REVIEW-ONLY)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    api.setToken("test-token");
  });

  function mockFetch(ok: boolean, body: any) {
    const fn = vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) });
    (global as unknown as { fetch: unknown }).fetch = fn;
    return fn;
  }

  it("listIntakeSubmissions → GET kuyruk + status query + Bearer", async () => {
    const fn = mockFetch(true, []);
    await api.listIntakeSubmissions({ status: "IN_REVIEW" });
    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/client-intake-submissions?status=IN_REVIEW");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("getIntakeSubmission → GET :id + Bearer", async () => {
    const fn = mockFetch(true, { id: "s1", fields: [] });
    await api.getIntakeSubmission("s1");
    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/client-intake-submissions/s1");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("claimIntakeSubmission → POST :id/claim + Bearer", async () => {
    const fn = mockFetch(true, { id: "s1" });
    await api.claimIntakeSubmission("s1");
    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/client-intake-submissions/s1/claim");
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("reviewIntakeField → POST :fieldId/review + decision gövdesi + Bearer", async () => {
    const fn = mockFetch(true, { id: "s1", fields: [] });
    await api.reviewIntakeField("f1", "APPROVE");
    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/client-intake-fields/f1/review");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body).decision).toBe("APPROVE");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("bulkReviewIntakeFields → POST :id/fields/bulk-review + fieldIds + Bearer", async () => {
    const fn = mockFetch(true, { id: "s1", fields: [] });
    await api.bulkReviewIntakeFields("s1", ["f1", "f2"], "REJECT", "neden");
    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/client-intake-submissions/s1/fields/bulk-review");
    const body = JSON.parse(opts.body);
    expect(body.fieldIds).toEqual(["f1", "f2"]);
    expect(body.decision).toBe("REJECT");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("rejectIntakeSubmission → POST :id/reject + Bearer", async () => {
    const fn = mockFetch(true, { id: "s1", fields: [] });
    await api.rejectIntakeSubmission("s1");
    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/client-intake-submissions/s1/reject");
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });
});
