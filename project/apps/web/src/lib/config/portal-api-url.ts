/**
 * CLIENT-CONFIG-P01 — Müvekkil Portal API base-URL çözümleyicisi.
 *
 * NEDEN: Portal'ın bildirim/mesaj/belge çağrıları `fetch("http://localhost:8080/...")`
 * biçiminde SABİT yazılmıştı — `NEXT_PUBLIC_API_URL` hiç okunmuyordu. Bu yüzden web ile
 * API'nin farklı origin'de çalıştığı HER dağıtımda (staging/production) bu üç yüzey
 * sessizce çalışmıyordu: istek kullanıcının kendi localhost'una gidiyor, `catch` blokları
 * hatayı yutuyordu.
 *
 * KAPSAM: Yalnız portal'ın bu görevde düzeltilen çağrı yerleri bu helper'ı kullanır.
 * Repo genelindeki diğer `NEXT_PUBLIC_API_URL || "http://localhost:8080"` kullanımları
 * (staff dashboard, lib/api.ts vb.) bu görevin kapsamı DIŞINDADIR ve DEĞİŞTİRİLMEMİŞTİR —
 * onlar env değişkenini zaten okuduğu için işlevsel olarak bozuk değildir.
 *
 * RUNTIME: Yalnız browser (client component) çağrıları için. Auth `Authorization: Bearer`
 * header'ı ile taşınır; cookie/`credentials: include` KULLANILMAZ (mevcut davranış korundu).
 * `NEXT_PUBLIC_*` sınıfı build-time inline edilir ve public'tir — bu değişkene ASLA secret
 * konulmamalıdır (bkz. `resolvePortalApiBaseUrl` içindeki doğrulama).
 *
 * FALLBACK SÖZLEŞMESİ (canonical emsal: lib/config/feature-flags.ts assertNoMockInProduction):
 *   development / test : `NEXT_PUBLIC_API_URL` yoksa açık `http://localhost:8080` fallback'i
 *                        YALNIZ BU CONFIG KATMANINDA uygulanır.
 *   production         : `NEXT_PUBLIC_API_URL` yok/boş ise SESSİZ localhost fallback YOKTUR —
 *                        `console.error` + `throw` ile fail-fast edilir.
 */

const DEV_FALLBACK_BASE_URL = "http://localhost:8080";

/** Yalnız http/https kabul edilir — `javascript:`/`data:` gibi şemalar reddedilir. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Ham env değerini doğrular ve sondaki `/` karakterlerini temizler.
 * Geçersizse (boş, parse edilemez, izin verilmeyen protokol) `null` döner.
 */
function normalizeBaseUrl(raw: string | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;

  // Trailing slash normalizasyonu: "https://api.x/" ve "https://api.x" aynı sonucu verir.
  return trimmed.replace(/\/+$/, "");
}

/**
 * Portal API base URL'ini çözer.
 *
 * @throws Error production'da `NEXT_PUBLIC_API_URL` eksik/geçersizse (fail-fast — sessiz
 *         localhost fallback'i production'da YASAKTIR).
 */
export function resolvePortalApiBaseUrl(): string {
  const normalized = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL);
  if (normalized) return normalized;

  if (isProduction()) {
    const error = new Error(
      "[CONFIG] NEXT_PUBLIC_API_URL production'da tanımlı ve geçerli bir http(s) URL olmalıdır. " +
        "localhost fallback'i production'da uygulanmaz.",
    );
    console.error(error);
    throw error;
  }

  return DEV_FALLBACK_BASE_URL;
}

/**
 * Portal API endpoint'i için tam URL üretir.
 *
 * Base URL'de sondaki `/` olsa da olmasa da, path başında `/` olsa da olmasa da tek bir
 * `/` ile birleştirir (çift slash veya eksik slash üretmez). Path'teki query string ve
 * encoding olduğu gibi korunur.
 *
 * @example portalApiUrl("/api/portal/documents") -> "https://api.example.com/api/portal/documents"
 */
export function portalApiUrl(path: string): string {
  const base = resolvePortalApiBaseUrl();
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}
