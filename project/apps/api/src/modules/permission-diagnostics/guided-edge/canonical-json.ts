// P3-1b — Guided-Open guarded-edge SUBSTRATE (backend-only kütüphane).
//
// Generic, key-order bağımsız kanonik JSON serileştirme + stabil sha256 hash.
// Confirmation-token payload'ını kanonikleştirmek ve request alanlarının "payloadHash"ini
// üretmek için kullanılır. Aksiyon-bazlı alan allowlist'leri SONRA (route wiring fazında) gelir;
// bu fazda yalnız generic, deterministik bir yardımcıdır.
//
// SAF (IO-suz, DI yok). Hiçbir route'a/CPE'ye/observe'a bağlı değildir.

import * as crypto from 'crypto';

/**
 * Bir değeri DETERMİNİSTİK biçimde JSON'a çevirir: nesne anahtarları özyinelemeli
 * olarak sıralanır → anahtar sırası farkı aynı string'i üretir. Dizilerin sırası
 * KORUNUR (anlamlı). `undefined` alanlar JSON.stringify tarafından düşürülür.
 */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

/**
 * Kanonik JSON üzerinden stabil sha256 (hex). Anahtar sırasından BAĞIMSIZ.
 * payloadHash ve token-payload bağlama için kullanılır.
 */
export function stableJsonHash(value: unknown): string {
  return crypto.createHash('sha256').update(canonicalJsonStringify(value), 'utf8').digest('hex');
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (value !== null && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    return Object.keys(input)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortDeep(input[key]);
        return acc;
      }, {});
  }
  return value;
}
