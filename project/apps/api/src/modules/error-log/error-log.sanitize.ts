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
] as const;

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

/**
 * Serbest metinde PII'yi maskeler. Sıra önemli: email → IBAN → telefon → TCKN(11) → VKN(10).
 * Telefon, TCKN/VKN'den ÖNCE çalışır ki 11-haneli 05xxxxxxxxx numarası TCKN sanılmasın.
 * (?<!\d)…(?!\d) ile daha uzun rakam dizilerinin içine kısmi eşleşme engellenir.
 */
export function redactPii(text: string | null | undefined): string | undefined {
  if (text === null || text === undefined) return undefined;
  let s = String(text);
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
