// PR-2b: KALICI dedupe anahtarları (SAF, SHA-256 64-hex).
//  - fingerprint    = HATA KİMLİĞİ (endpoint-bağımsız: name + normalize-redact mesaj + stack-kök + status).
//  - activeDedupeKey = AKTİF OLAY kimliği (tenant + source + method + normalizedEndpoint + status + fingerprint).
// Endpoint/method YALNIZ activeDedupeKey'de → aynı hata türü analitik gruplanır ama farklı endpoint'lerde
// AYRI aktif olay tutulur. (PR-2a'daki sha1/16-hex in-memory flood-guard içindi; DB kimliği için yetersiz.)
import { createHash } from "crypto";
import { redactPii } from "../error-log.sanitize";
import { normalizeStackSignature } from "./error-fingerprint";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex"); // 64 hex
}

/** Mesajı PII'den arındırıp sayısal id'leri '#' ile normalize eder → "user 123 yok" ≡ "user 456 yok". */
export function normalizeMessage(message: string | null | undefined): string {
  const redacted = redactPii(message ?? "") ?? "";
  return redacted.replace(/\d+/g, "#").trim().slice(0, 500);
}

/** URL path id segmentlerini (sayı / cuid / uuid) ':id' ile değiştirir; query string atılır. */
export function normalizeEndpoint(url: string | null | undefined): string {
  if (!url) return "";
  const path = String(url).split("?")[0];
  return path
    .split("/")
    .map((seg) => {
      if (seg === "") return seg;
      if (/^\d+$/.test(seg)) return ":id";
      if (/^c[a-z0-9]{20,}$/i.test(seg)) return ":id"; // cuid
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ":id"; // uuid
      return seg;
    })
    .join("/");
}

/** HATA KİMLİĞİ (analitik/gruplama). endpoint/method DAHİL DEĞİL. */
export function computePersistentFingerprint(input: {
  name?: string;
  message?: string;
  stack?: string;
  statusCode?: number;
}): string {
  const sig = [
    input.name ?? "",
    normalizeMessage(input.message),
    normalizeStackSignature(input.stack),
    String(input.statusCode ?? ""),
  ].join("|");
  return sha256Hex(sig);
}

/** AKTİF OLAY kimliği. activeDedupeKey @unique kolonuna yazılır; resolve'da null'lanır. */
export function computeActiveDedupeKey(input: {
  tenantId?: string;
  source: string;
  method?: string;
  endpoint?: string;
  statusCode?: number;
  fingerprint: string;
}): string {
  const sig = [
    input.tenantId ?? "", // null tenant → "" (auth-öncesi hatalar kendi aralarında birleşir)
    input.source,
    (input.method ?? "").toUpperCase(),
    normalizeEndpoint(input.endpoint),
    String(input.statusCode ?? ""),
    input.fingerprint,
  ].join("|");
  return sha256Hex(sig);
}
