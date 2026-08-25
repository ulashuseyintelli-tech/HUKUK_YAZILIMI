/**
 * C15-S1-MODIFIED PR-3 — `lifecycleReason` doğrulaması.
 *
 * Gerçek durum değişikliğinde zorunludur; same-state no-op'ta İSTENMEZ ve mevcut
 * reason DEĞİŞMEZ (o karar transition servisindedir, burada değil).
 *
 * DÜRÜST SINIR: Aşağıdaki desen kümesi bir credential'ın YANLIŞLIKLA yapıştırılmasını
 * yakalar. Genel bir PII/secret dedektörü DEĞİLDİR ve öyle olduğu iddia edilmez;
 * serbest metinde kişisel veri bulunmadığı garanti edilemez. Kapı yalnız bilinen ve
 * dar bir desen kümesini reddeder.
 */

import { InvalidLifecycleReasonError } from "./tenant-lifecycle-errors";

/** Trim sonrası üst sınır. */
export const LIFECYCLE_REASON_MAX_LENGTH = 200;

/**
 * Yapıştırma-kazası desenleri. Her giriş [ad, desen] çiftidir; ad, hata mesajında
 * ihlali adlandırır (reason içeriği hata mesajına ASLA kopyalanmaz — sızıntı olur).
 */
const YASAK_DESENLER: readonly (readonly [string, RegExp])[] = [
  ["JWT", /eyJ[A-Za-z0-9_-]{10,}/],
  ["BEARER", /Bearer\s+\S/i],
  ["CREDENTIAL_ATAMA", /(password|passwd|secret|token|api[-_]?key)\s*[:=]/i],
  ["UZUN_HEX", /[0-9a-fA-F]{32,}/],
  ["UZUN_BASE64", /[A-Za-z0-9+/=]{40,}/],
];

/**
 * Doğrular ve TRIM EDİLMİŞ reason'ı döndürür. Yazılacak değer budur; ham girdi değil.
 * İhlalde `InvalidLifecycleReasonError` fırlatır — ihlalin ADI mesaja girer,
 * reason'ın İÇERİĞİ girmez.
 */
export function validateLifecycleReason(reason: unknown): string {
  if (typeof reason !== "string") {
    throw new InvalidLifecycleReasonError("reason bir string değil");
  }
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new InvalidLifecycleReasonError("trim sonrası boş");
  }
  if (trimmed.length > LIFECYCLE_REASON_MAX_LENGTH) {
    throw new InvalidLifecycleReasonError(
      `trim sonrası ${trimmed.length} karakter; üst sınır ${LIFECYCLE_REASON_MAX_LENGTH}`,
    );
  }
  for (const [ad, desen] of YASAK_DESENLER) {
    if (desen.test(trimmed)) {
      throw new InvalidLifecycleReasonError(`yasak desen: ${ad}`);
    }
  }
  return trimmed;
}
