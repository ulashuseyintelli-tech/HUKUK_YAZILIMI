import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "@/lib/api";

function mockFetch(body: unknown, ok = true, status = 200) {
  (global as any).fetch = vi.fn(async () => ({ ok, status, json: async () => body }));
}

beforeEach(() => {
  window.localStorage.setItem("token", "tok");
});
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("api ErrorLog methods (PR-5)", () => {
  it("getErrorLogs: query paramları + /error-logs yolu", async () => {
    mockFetch({ logs: [], total: 0, page: 2, limit: 50, totalPages: 0 });
    const res = await api.getErrorLogs({ level: "ERROR", source: "API", page: 2, limit: 50 });
    const url = String((global as any).fetch.mock.calls[0][0]);
    expect(url).toContain("/api/error-logs?");
    expect(url).toContain("level=ERROR");
    expect(url).toContain("source=API");
    expect(url).toContain("page=2");
    expect(res.page).toBe(2);
  });

  it("getErrorLogStats: /error-logs/stats", async () => {
    mockFetch({ total: 3, errors: 1, warnings: 1, unresolved: 2 });
    const res = await api.getErrorLogStats();
    expect(String((global as any).fetch.mock.calls[0][0])).toContain("/api/error-logs/stats");
    expect(res.total).toBe(3);
  });

  it("resolveErrorLog: POST + body {resolution}", async () => {
    mockFetch({ id: "l1", isResolved: true });
    await api.resolveErrorLog("l1", "açıklama yeterince uzun");
    const [url, opts] = (global as any).fetch.mock.calls[0];
    expect(String(url)).toContain("/api/error-logs/l1/resolve");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ resolution: "açıklama yeterince uzun" });
  });

  it("403 → .status=403 fırlatır (page bunu yakalar)", async () => {
    mockFetch({ message: "Forbidden" }, false, 403);
    await expect(api.getErrorLogs()).rejects.toMatchObject({ status: 403 });
  });
});
