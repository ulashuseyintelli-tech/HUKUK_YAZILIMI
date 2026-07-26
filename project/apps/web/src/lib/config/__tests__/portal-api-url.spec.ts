import { describe, it, expect, vi, afterEach } from "vitest";
import { portalApiUrl, resolvePortalApiBaseUrl } from "@/lib/config/portal-api-url";

/**
 * CLIENT-CONFIG-P01 — portal API base-URL çözümleyicisi sözleşmesi.
 *
 * Kapatılan kök neden: portal'ın bildirim/mesaj/belge çağrıları `NEXT_PUBLIC_API_URL`'i
 * HİÇ okumadan sabit `http://localhost:8080` adresine gidiyordu.
 *
 * Bu dosya config sözleşmesini kilitler:
 *  - trailing slash'lı/slash'sız base URL aynı sonucu verir (çift/eksik slash yok)
 *  - query string ve encoding korunur
 *  - development/test: açık localhost fallback'i YALNIZ bu config katmanında
 *  - production: eksik/geçersiz config'te SESSİZ localhost fallback YOK → fail-fast
 *  - yalnız http/https protokolleri kabul edilir (javascript:/data: reddedilir)
 */

afterEach(() => {
  // vi.stubEnv NODE_ENV dahil tüm env stub'larını güvenle geri alır
  // (doğrudan Object.defineProperty vitest'in process.env proxy'siyle uyumsuzdur).
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function setNodeEnv(value: "development" | "production" | "test") {
  vi.stubEnv("NODE_ENV", value);
}

describe("portalApiUrl — CLIENT-CONFIG-P01 configuration contract", () => {
  it("[1] configured base URL kullanılır (localhost DEĞİL)", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
    expect(portalApiUrl("/api/portal/documents")).toBe("https://api.example.com/api/portal/documents");
    expect(portalApiUrl("/api/portal/documents")).not.toContain("localhost");
  });

  it("[2] TRAILING SLASH'lı base URL → çift slash üretmez", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com/");
    expect(portalApiUrl("/api/portal/messages")).toBe("https://api.example.com/api/portal/messages");
  });

  it("[3] ÇOKLU trailing slash da normalize edilir", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com///");
    expect(portalApiUrl("/api/portal/messages")).toBe("https://api.example.com/api/portal/messages");
  });

  it("[4] trailing slash OLMADAN → eksik slash üretmez", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
    expect(portalApiUrl("/api/portal/messages")).toBe("https://api.example.com/api/portal/messages");
  });

  it("[5] path başında slash olmasa da tek slash ile birleşir", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
    expect(portalApiUrl("api/portal/messages")).toBe("https://api.example.com/api/portal/messages");
  });

  it("[6] base URL'de path prefix varsa korunur (subpath deployment)", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://example.com/backend/");
    expect(portalApiUrl("/api/portal/documents")).toBe("https://example.com/backend/api/portal/documents");
  });

  it("[7] QUERY STRING bozulmadan korunur", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com/");
    expect(portalApiUrl("/api/portal/documents?type=VEKALET&page=2")).toBe(
      "https://api.example.com/api/portal/documents?type=VEKALET&page=2",
    );
  });

  it("[8] path içindeki ENCODING korunur (encodeURIComponent çıktısı bozulmaz)", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
    const id = encodeURIComponent("a/b c");
    expect(portalApiUrl(`/api/portal/documents/${id}/download`)).toBe(
      "https://api.example.com/api/portal/documents/a%2Fb%20c/download",
    );
  });

  it("[9] DEVELOPMENT: env yoksa açık localhost fallback'i uygulanır (canonical config katmanı)", () => {
    setNodeEnv("development");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    expect(resolvePortalApiBaseUrl()).toBe("http://localhost:8080");
  });

  it("[10] PRODUCTION: env YOKSA sessiz localhost fallback ÜRETİLMEZ — fail-fast throw", () => {
    setNodeEnv("production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => resolvePortalApiBaseUrl()).toThrow(/NEXT_PUBLIC_API_URL/);
    // Kritik negatif kanıt: hata mesajı bile localhost'u bir çözüm olarak sunmaz,
    // ve hiçbir koşulda localhost DÖNMEZ.
    try {
      resolvePortalApiBaseUrl();
    } catch (e) {
      expect(String((e as Error).message)).not.toContain("http://localhost:8080");
    }
    expect(errSpy).toHaveBeenCalled();
  });

  it("[11] PRODUCTION: env tanımlıysa normal çalışır", () => {
    setNodeEnv("production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.production.example");
    expect(portalApiUrl("/api/portal/messages")).toBe("https://api.production.example/api/portal/messages");
  });

  it("[12] PRODUCTION: whitespace-only env değeri de geçersiz sayılır (throw)", () => {
    setNodeEnv("production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "   ");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => resolvePortalApiBaseUrl()).toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it("[13] GÜVENLİK: `javascript:` şeması REDDEDİLİR (production'da throw)", () => {
    setNodeEnv("production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "javascript:alert(1)");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => resolvePortalApiBaseUrl()).toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it("[14] GÜVENLİK: `data:` şeması REDDEDİLİR; development'ta güvenli fallback'e düşer", () => {
    setNodeEnv("development");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "data:text/html,<script>1</script>");
    expect(resolvePortalApiBaseUrl()).toBe("http://localhost:8080");
  });

  it("[15] GÜVENLİK: parse edilemeyen değer REDDEDİLİR (protokolsüz host)", () => {
    setNodeEnv("production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "api.example.com");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => resolvePortalApiBaseUrl()).toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it("[16] http (TLS'siz) development/staging için kabul edilir — TLS zorlaması bu katmanda YAPILMAZ", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.internal:8080");
    expect(portalApiUrl("/api/portal/messages")).toBe("http://api.internal:8080/api/portal/messages");
  });
});
