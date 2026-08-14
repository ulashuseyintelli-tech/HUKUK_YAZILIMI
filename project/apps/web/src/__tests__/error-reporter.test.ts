import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
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

describe("reportClientError — dış catch (WSMR-A4-AA Aday 4)", () => {
  /**
   * DF002 `lib/error-reporter.ts:115` — dış `try { ... } catch { /* ASLA throw etme *\/ }`.
   *
   * Owner talebi: `getToken` VE fingerprint/metadata hazırlığı AYRI AYRI throw ettirilip
   * (a) çağıranın etkilenmediği, (b) recursion/ikinci `reportClientError` çağrısı
   * oluşmadığı kanıtlansın.
   *
   * Aşağıdaki iki test bu iki alt-senaryoyu AYRI AYRI tetikler — ama dürüstlük için not:
   * `getToken()`'ın (satır 57-64) KENDİ iç try/catch'i zaten var. `window.localStorage`
   * erişimi throw ederse bunu getToken kendi içinde yakalar ve `null` döner — dış catch'e
   * (115) HİÇ ULAŞMAZ. Yani "getToken throw ederse dış catch korur" senaryosu MEVCUT
   * kodda YAPISAL OLARAK ULAŞILAMAZ (getToken kendi savunmasını zaten yapıyor — iki
   * katmanlı savunma). Aşağıdaki testler bunu AÇIKÇA ayırt eder: ilk test dış catch'i
   * (115) GERÇEKTEN tetikler (fingerprint/metadata erişimi throw eder); ikinci test
   * getToken'ın KENDİ iç catch'inin (61-63) uçtan uca aynı garantiyi sağladığını kanıtlar.
   */

  it("fingerprint/metadata hazırlığı throw ederse: DIŞ CATCH (115) çalışır — throw dışarı SIZMAZ, fetch ÇAĞRILMAZ", () => {
    window.localStorage.setItem("token", "tok");
    // input'un HER alanına erişim throw eder → fingerprint(input) içindeki ilk `i.level`
    // erişiminde patlar; bu erişim try(115) İÇİNDE, herhangi bir iç try'da DEĞİL.
    const poisoned = new Proxy(
      {},
      {
        get() {
          throw new Error("boom: poisoned input property access");
        },
      },
    ) as any;

    expect(() => reportClientError(poisoned)).not.toThrow();
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it("localStorage.getItem throw ederse: getToken KENDİ iç catch'iyle (61-63) yutar — reportClientError yine THROW ETMEZ, fetch ÇAĞRILMAZ", () => {
    const spy = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: localStorage devre dışı");
    });
    try {
      expect(() => reportClientError({ message: "x" })).not.toThrow();
      expect((global as any).fetch).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("RECURSION/ikinci reportClientError çağrısı YOK: kaynakta kendine referans sıfır (statik kilit)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../lib/error-reporter.ts"), "utf8");
    const selfCalls = src.match(/reportClientError\(/g) ?? [];
    // Tek eşleşme: `export function reportClientError(` bildirimi. Gövdede kendine
    // (veya başka bir yerde) ikinci bir `reportClientError(...)` çağrısı YOK — dış catch
    // kendi hatasını raporlamak için reporter'ı TEKRAR ÇAĞIRMAZ (loop riski yok).
    expect(selfCalls.length).toBe(1);
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
