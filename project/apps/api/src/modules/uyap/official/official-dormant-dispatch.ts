/**
 * UYAP-OFFICIAL-SERIALIZER-ARCHITECTURE-I01A — DORMANT / LOCAL dispatch bağlantısı.
 *
 * Canonical serializer'ı bir dispatch hattına bağlar; ancak bu hat **DORMANT**'tır:
 *
 * ```text
 * NETWORK CALL      : 0
 * REAL TRANSPORT    : DISABLED
 * PRODUCTION ADAPTER: NOT REGISTERED / NOT ACTIVATED
 * FEATURE FLAG      : FINAL OFF
 * ```
 *
 * Amaç, byte üretiminin gerçek bir dispatch şekliyle **test edilebilir** olmasıdır —
 * gerçek gönderim değil. Hiçbir HTTP/SOAP/UYAP endpoint'i çağrılmaz; hiçbir şey
 * persist edilmez; retry/idempotency sahipliği (UyapOperation/UyapAttempt) DEĞİŞMEZ.
 *
 * `UyapModule` bu modülü provider olarak **KAYDETMEZ**; hiçbir controller/servis
 * çağırmaz. Yalnız test-reachable saf fonksiyondur.
 */

import {
  UyapCanonicalSerializationResult,
  serializeUyapExchangeCanonical,
} from './official-canonical-serializer';
import type { OfficialExchangeInput } from './official-exchange.types';

/**
 * Dormant dispatch feature flag'i. **FINAL OFF** — env ile açılamaz, argümanla
 * geçersiz kılınamaz. Gerçek transport ayrı bir owner kararı ve ayrı bir görevdir
 * (cutover HARD HOLD).
 */
export const UYAP_DORMANT_DISPATCH_ENABLED = false as const;

export type UyapDormantDispatchResult =
  | {
      readonly status: 'DORMANT_PREPARED';
      /** Üretilen byte'lar — bellek içi; GÖNDERİLMEDİ. */
      readonly bytes: Buffer;
      readonly evidence: {
        readonly transportPerformed: false;
        readonly networkCallCount: 0;
        readonly featureFlagEnabled: false;
        readonly byteLength: number;
        readonly encodedBytesSha256: string;
      };
    }
  | {
      readonly status: 'NOT_PREPARED';
      /** Serializer neden byte üretemedi. */
      readonly serialization: Exclude<
        UyapCanonicalSerializationResult,
        { status: 'CANONICAL_BYTES' }
      >;
    };

/**
 * Canonical byte'ları dormant dispatch şekliyle hazırlar. **HİÇBİR ŞEY GÖNDERMEZ.**
 *
 * Fonksiyon adı bilinçli olarak `prepare*`'dır: `send`/`submit`/`dispatch` gibi bir ad
 * gerçek gönderim izlenimi üretirdi. Dönen `transportPerformed: false` ve
 * `networkCallCount: 0` alanları bu gerçeği makine-okunur biçimde taşır.
 */
export function prepareUyapDormantDispatch(
  input: OfficialExchangeInput,
): UyapDormantDispatchResult {
  const serialization = serializeUyapExchangeCanonical(input);

  if (serialization.status !== 'CANONICAL_BYTES') {
    return { status: 'NOT_PREPARED', serialization };
  }

  // Gerçek transport BURADA OLMAZ. Flag final-OFF olduğu için hiçbir koşulda
  // gönderim koluna geçilmez; bu satır o niyeti kod seviyesinde sabitler.
  if (UYAP_DORMANT_DISPATCH_ENABLED !== false) {
    throw new Error('UYAP_DORMANT_DISPATCH_MUST_REMAIN_DISABLED');
  }

  return {
    status: 'DORMANT_PREPARED',
    bytes: serialization.bytes,
    evidence: {
      transportPerformed: false,
      networkCallCount: 0,
      featureFlagEnabled: false,
      byteLength: serialization.evidence.byteLength,
      encodedBytesSha256: serialization.evidence.encodedBytesSha256,
    },
  };
}
