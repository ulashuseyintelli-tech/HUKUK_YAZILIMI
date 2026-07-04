import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  reportClientError,
  isNetworkError,
  shouldReportNetworkError,
  __resetReporterStateForTest,
} from "@/lib/error-reporter";

function fetchMock() {
  const fn = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  (global as any).fetch = fn;
  return fn;
}

beforeEach(() => {
  __resetReporterStateForTest();
  window.localStorage.clear();
  fetchMock();
});
afterEach(() => vi.restoreAllMocks());

describe("reportClientError", () => {
  it("token yoksa fetch ÇAĞIRMAZ (401 loop önle)", () => {
    reportClientError({ message: "x" });
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it("token varsa POST /api/error-logs/log (method/auth/level/message)", () => {
    window.localStorage.setItem("token", "tok");
    reportClientError({ level: "ERROR", message: "boom", endpoint: "web:render /x" });
    const fn = (global as any).fetch;
    expect(fn).toHaveBeenCalledTimes(1);
    const [url, opts] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/error-logs/log");
    expect(opts.method).toBe("POST");
    expect(opts.headers.Authorization).toBe("Bearer tok");
    const body = JSON.parse(opts.body);
    expect(body.level).toBe("ERROR");
    expect(body.message).toBe("boom");
  });

  it("fetch reddederse SWALLOW (throw etmez, loop yok)", () => {
    window.localStorage.setItem("token", "tok");
    (global as any).fetch = vi.fn(async () => {
      throw new Error("network down");
    });
    expect(() => reportClientError({ message: "x" })).not.toThrow();
  });

  it("payload cap: message 500 · stack 8000 · endpoint 300", () => {
    window.localStorage.setItem("token", "tok");
    reportClientError({ message: "m".repeat(1000), stack: "s".repeat(9000), endpoint: "e".repeat(400) });
    const body = JSON.parse((global as any).fetch.mock.calls[0][1].body);
    expect(body.message.length).toBe(500);
    expect(body.stack.length).toBe(8000);
    expect(body.endpoint.length).toBe(300);
  });

  it("metadata yalnız whitelist (componentStack/password DROP)", () => {
    window.localStorage.setItem("token", "tok");
    reportClientError({
      message: "x",
      metadata: { safeErrorCode: "X", retryCount: 2, componentStack: "<...>", password: "p" } as any,
    });
    const body = JSON.parse((global as any).fetch.mock.calls[0][1].body);
    expect(body.metadata).toEqual({ safeErrorCode: "X", retryCount: 2 });
  });

  it("session dedupe: aynı hata pencere içinde TEK kez gönderilir", () => {
    window.localStorage.setItem("token", "tok");
    reportClientError({ message: "same", stack: "at a" });
    reportClientError({ message: "same", stack: "at a" });
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
  });

  it("level WARN korunur; geçersiz → ERROR", () => {
    window.localStorage.setItem("token", "tok");
    reportClientError({ level: "WARN", message: "w" });
    expect(JSON.parse((global as any).fetch.mock.calls[0][1].body).level).toBe("WARN");
  });
});

describe("isNetworkError / shouldReportNetworkError", () => {
  it("Failed to fetch / ECONNREFUSED / NetworkError → true", () => {
    expect(isNetworkError({ name: "TypeError", message: "Failed to fetch" })).toBe(true);
    expect(isNetworkError({ message: "ECONNREFUSED" })).toBe(true);
    expect(isNetworkError({ message: "NetworkError when attempting to fetch resource" })).toBe(true);
  });
  it("HTTP response hatası (status set) → false", () => {
    expect(isNetworkError({ status: 500, message: "Internal" })).toBe(false);
    expect(isNetworkError({ status: 401 })).toBe(false);
  });
  it("AbortError → false (raporlama)", () => {
    expect(isNetworkError({ name: "AbortError", message: "aborted" })).toBe(false);
  });
  it("shouldReportNetworkError: /error-logs/log self-skip + status-skip", () => {
    expect(shouldReportNetworkError({ name: "TypeError", message: "Failed to fetch" }, "/cases")).toBe(true);
    expect(shouldReportNetworkError({ name: "TypeError", message: "Failed to fetch" }, "/error-logs/log")).toBe(false);
    expect(shouldReportNetworkError({ status: 500 }, "/cases")).toBe(false);
  });
});
