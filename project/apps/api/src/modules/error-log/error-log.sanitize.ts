// PR-1 (error-logs güvenlik): DIŞ İSTEMCİ girdisini (POST /error-logs/log) güvenli
// ErrorLog kaydına çeviren SAF fonksiyonlar. Nest/DI gerektirmez → izole unit-test edilir.
//
// Sertleştirme kuralları (owner kararı):
//  - source DAİMA 'FRONTEND'. API/UYAP/CRON yalnız backend internal logging'den üretilir;
//    istemci source SEÇEMEZ (sahte teknik olay basma engeli).
//  - level yalnız ERROR/WARN. INFO/DEBUG ve geçersiz değerler güvenli default 'WARN'a normalize.
//  - tenantId/userId yalnız AUTH bağlamından. body'deki tenantId/userId YOK SAYILIR.
//  - metadata WHITELIST. Authorization/Cookie/token/secret/password ve ham request body YAZILMAZ.
//  - message/stack ve whitelist string alanları PII redaksiyonundan geçer (TCKN/VKN/IBAN/telefon/email).
import { maskEmail, maskIban, maskPhone, maskTckn, maskIdentity } from "../../common/pii-mask.util";
import type { LogErrorParams } from "./error-log.service";

/** metadata'da yazılmasına izin verilen ANAHTARLAR (değerler tip-katı + PII-redacted). */
export const ERROR_LOG_METADATA_WHITELIST = [
  "requestId",
  "route",
  "method",
  "statusCode",
  "queryKeys",
  "paramKeys",
  "bodyKeys",
  "safeErrorCode",
  "safeIntegrationName",
  "durationMs",
  "retryCount",
  "externalStatusCode",
  /** W3-F04: cron terminal-failure siniflandirmasi — sabit/enum-benzeri, PII tasimaz. */
  "outcome",
  "reasonCode",
] as const;

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

/**
 * SIR TAŞIYAN YOL PARÇALARI — URL'in kendisi kimlik doğrulayan uçlar.
 *
 * NEDEN: `AllExceptionsFilter` hata kaydına `endpoint = req.url` yazar. Public intake yolunda
 * kimlik BİLGİSİ URL'in içindedir (`/public/intake/<ham token>`) ve o token, hedef tenant'ta
 * ANONİM YAZMA yetkisi verir (`ClientIntakePublicService.validateActiveLink` yalnız
 * `status/expiresAt/useCount` bakar). Uç 5xx verdiğinde — örneğin hız sınırı Redis'e
 * ulaşamadığında fail-closed 503 döndüğünde — ham token `ErrorLog` satırına DÜZ METİN
 * yazılıyordu. Kaydı okuyabilen herkes müvekkil formunu açıp doldurabilirdi.
 *
 * TANILAMA KORUNUR: yalnız DEĞER maskelenir, rota ŞEKLİ (`/public/intake/:token`) kalır —
 * hangi ucun hata verdiği kaydın kendisinden okunabilir.
 *
 * YAN FAYDA: `computeActiveDedupeKey` endpoint'i kullanır. Ham token'la her istek AYRI bir
 * dedupe anahtarı üretiyor, yani her token için YENİ bir ErrorLog satırı açılıyordu; maskeleme
 * bu satır patlamasını da kapatır.
 */
const SECRET_PATH_RULES: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /(\/public\/intake\/)[^/?#\s"']+/gi, replacement: "$1:token" },
];

/**
 * URL benzeri metinlerde sır taşıyan yol parçalarını maskeler. Saf fonksiyon; metinde böyle bir
 * yol yoksa girdiyi AYNEN döndürür.
 */
export function redactSecretPathSegments(text: string | null | undefined): string | undefined {
  if (text === null || text === undefined) return undefined;
  let s = String(text);
  for (const rule of SECRET_PATH_RULES) s = s.replace(rule.pattern, rule.replacement);
  return s;
}

/**
 * Serbest metinde PII'yi maskeler. Sıra önemli: ÖNCE sır taşıyan yol parçaları (token URL'de
 * olabilir), sonra email → IBAN → telefon → TCKN(11) → VKN(10).
 * Telefon, TCKN/VKN'den ÖNCE çalışır ki 11-haneli 05xxxxxxxxx numarası TCKN sanılmasın.
 * (?<!\d)…(?!\d) ile daha uzun rakam dizilerinin içine kısmi eşleşme engellenir.
 *
 * Bu fonksiyon hata kayıt hattındaki TÜM serbest metin alanlarından geçer (message · stack ·
 * endpoint · metadata string'leri · konsol satırı), dolayısıyla yol maskesi de hepsini kapsar.
 */
export function redactPii(text: string | null | undefined): string | undefined {
  if (text === null || text === undefined) return undefined;
  let s = redactSecretPathSegments(text) as string;
  s = s.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, (m) => maskEmail(m));
  s = s.replace(/\bTR\d{24}\b/gi, (m) => maskIban(m));
  s = s.replace(/(?<!\d)(?:\+90|0)?5\d{9}(?!\d)/g, (m) => maskPhone(m));
  s = s.replace(/(?<!\d)\d{11}(?!\d)/g, (m) => maskTckn(m));
  s = s.replace(/(?<!\d)\d{10}(?!\d)/g, (m) => maskIdentity(m));
  return s;
}

/**
 * metadata'yı whitelist'e indirger. Bilinmeyen TÜM anahtarlar (Authorization, Cookie, token,
 * secret, password, ham body...) düşürülür. Hiç güvenli alan yoksa undefined döner.
 */
export function sanitizeMetadata(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ERROR_LOG_METADATA_WHITELIST) {
    if (!(key in src)) continue;
    const val = src[key];
    if (key.endsWith("Keys")) {
      // *Keys = alan ADLARI listesi (değer DEĞİL). Yalnız string elemanlar, redacted.
      if (Array.isArray(val)) {
        const arr = val
          .filter((v) => typeof v === "string")
          .slice(0, 50)
          .map((v) => redactPii(v as string) as string);
        if (arr.length) out[key] = arr;
      }
    } else if (typeof val === "string") {
      out[key] = (redactPii(val) ?? "").slice(0, 500);
    } else if (typeof val === "number" || typeof val === "boolean") {
      out[key] = val;
    }
    // diğer tipler (object/array/null) → düşürülür
  }
  return Object.keys(out).length ? out : undefined;
}

/** body.level'i ERROR/WARN'a normalize eder; geçersiz/eksik/INFO/DEBUG → 'WARN'. */
export function normalizeClientLevel(raw: unknown): "ERROR" | "WARN" {
  const lvl = typeof raw === "string" ? raw.toUpperCase() : "";
  return lvl === "ERROR" ? "ERROR" : "WARN";
}

/**
 * DIŞ İSTEMCİ body'sini güvenli LogErrorParams'a çevirir.
 * source/tenantId/userId istemciden ALINMAZ; AUTH ctx + sabit FRONTEND otoritedir.
 */
export function buildClientLogEntry(
  body: unknown,
  ctx: { tenantId?: string; userId?: string },
): LogErrorParams {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const method = typeof b.method === "string" ? b.method.toUpperCase() : undefined;
  return {
    tenantId: ctx.tenantId, // AUTH'tan — body.tenantId YOK SAYILIR
    userId: ctx.userId, // AUTH'tan — body.userId YOK SAYILIR
    source: "FRONTEND", // SABİT — istemci source seçemez
    level: normalizeClientLevel(b.level),
    message: redactPii(typeof b.message === "string" ? b.message : "") || "(no message)",
    stack: redactPii(typeof b.stack === "string" ? b.stack : undefined),
    endpoint: redactPii(typeof b.endpoint === "string" ? b.endpoint.slice(0, 300) : undefined),
    method: method && HTTP_METHODS.has(method) ? method : undefined,
    statusCode: typeof b.statusCode === "number" ? b.statusCode : undefined,
    metadata: sanitizeMetadata(b.metadata),
  };
}
