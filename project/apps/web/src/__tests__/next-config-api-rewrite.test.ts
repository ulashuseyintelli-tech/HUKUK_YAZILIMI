import { describe, it, expect, afterEach, vi } from "vitest";
import { createRequire } from "module";
import path from "path";

/**
 * AYNI ORIGIN /api — next.config.js fallback rewrite sözleşmesi (2026-09-21).
 * Korunan iddialar: yalnız `/api/:path*` taşınır; hedef iç adrestir (varsayılan 127.0.0.1:8080);
 * kural `fallback` sınıfındadır (sayfa/dosya eşleşmesini gölgelemez); alan adı içermez.
 */
const require = createRequire(import.meta.url);
const CONFIG_PATH = path.resolve(__dirname, "../../next.config.js");

function loadConfig() {
  delete require.cache[CONFIG_PATH];
  return require(CONFIG_PATH);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("next.config — /api fallback rewrite", () => {
  it("varsayılan: /api/:path* → http://127.0.0.1:8080/api/:path* (fallback)", async () => {
    vi.stubEnv("API_INTERNAL_URL", "");
    const r = await loadConfig().rewrites();
    expect(Array.isArray(r)).toBe(false);
    expect(r.beforeFiles ?? []).toEqual([]);
    expect(r.afterFiles ?? []).toEqual([]);
    expect(r.fallback).toEqual([{ source: "/api/:path*", destination: "http://127.0.0.1:8080/api/:path*" }]);
  });

  it("API_INTERNAL_URL verilirse o kullanılır; sondaki / temizlenir", async () => {
    vi.stubEnv("API_INTERNAL_URL", "http://127.0.0.1:9000/");
    const r = await loadConfig().rewrites();
    expect(r.fallback[0].destination).toBe("http://127.0.0.1:9000/api/:path*");
  });

  it("yalnız /api öneki taşınır — sayfa yolları (portal, intake) rewrite edilmez", async () => {
    vi.stubEnv("API_INTERNAL_URL", "");
    const r = await loadConfig().rewrites();
    expect(r.fallback).toHaveLength(1);
    expect(r.fallback[0].source.startsWith("/api/")).toBe(true);
  });
});
