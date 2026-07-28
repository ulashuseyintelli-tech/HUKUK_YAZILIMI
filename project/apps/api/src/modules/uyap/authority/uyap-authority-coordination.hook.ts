/**
 * UYAP-AUTHORITY-FRESHNESS-TX-I01 — deterministik test barrier'ı.
 *
 * Race testleri gerçek zamanlama rastlantısına GÜVENMEZ. Bunun yerine akışın belirli
 * noktalarında await edilebilen bir koordinasyon kancası kullanılır.
 *
 * ## Production'da no-op ve ERİŞİLEMEZ
 *
 * - Bu kanca bir Nest **token**'ıdır ve `UyapModule` içinde **KAYDEDİLMEZ**.
 *   Dolayısıyla production DI grafiğinde çözülmez → `@Optional()` ile `undefined` gelir
 *   → bütün çağrılar no-op'tur.
 * - Global mutable state, `process.env` anahtarı veya statik singleton **YOKTUR**;
 *   dışarıdan (HTTP/DTO/env) enjekte edilemez.
 * - Testler orchestrator'ı DOĞRUDAN kurarak kancayı verir.
 */

/**
 * Akıştaki deterministik duraklar (TX-1 içinde, sırayla).
 *
 * Phase 1 ile TX-1 arasındaki değişim `beforeTxRevalidation` durağında yapılabilir —
 * ayrı bir `afterPhase1Snapshot` durağı EKLENMEDİ: aynı yarışı deterministik olarak
 * üretir ve kullanılmayan bir sözleşme noktası bırakmaz.
 */
export type UyapAuthorityCoordinationPoint =
  | 'beforeTxRevalidation'
  | 'afterTxRevalidation'
  | 'beforeOperationCreate';

export interface UyapAuthorityCoordinationHook {
  /** Verilen noktada akışı beklemeye alır. Production'da hiç çağrılmaz (hook yoktur). */
  wait(point: UyapAuthorityCoordinationPoint): Promise<void>;
}

/** DI token — `UyapModule` bunu KAYDETMEZ (production'da çözülmez). */
export const UYAP_AUTHORITY_COORDINATION_HOOK = Symbol('UYAP_AUTHORITY_COORDINATION_HOOK');
