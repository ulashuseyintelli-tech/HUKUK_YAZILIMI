/**
 * UYAP-OFFICIAL-SERIALIZER-ARCHITECTURE-I01A — TEK CANONICAL SERIALIZER ENTRYPOINT.
 *
 * ## Neden var
 *
 * I01A öncesi resmî serileştirme **iki yarım parça** hâlindeydi ve **bağlı değildi**:
 *
 * ```text
 * official-exchange-builder.ts    →  XML METNİ üretir
 *                                    deklarasyon: encoding="ISO-8859-9"
 *                                    byteEncodingPerformed: false      ← byte dönüşümü YOK
 *
 * official-iso8859-9-encoder.ts   →  GERÇEK ISO-8859-9 byte üretir
 *                                    fail-closed round-trip doğrulaması
 *                                    (hiçbir üretim yolundan ÇAĞRILMIYORDU)
 * ```
 *
 * Yani "deklarasyon ISO-8859-9 diyor ama elde JS string var" durumu yapısal olarak
 * mümkündü. Bu modül iki yarıyı **tek sahiplik altında** birleştirir ve
 * *deklarasyon ↔ gerçek byte encoding* eşleşmesini **zorunlu** kılar.
 *
 * ## Sorumluluk sınırı
 *
 * ```text
 * DOMAIN DATA / OFFICIAL MODEL
 *   → STRUCTURED XML MODEL      (çağıranın sorumluluğu; bu modül İCAT ETMEZ)
 *   → CANONICAL XML SERIALIZER  (official-exchange-builder — şekil)
 *   → ENCODING BOUNDARY         (official-iso8859-9-encoder — byte)
 *   → BYTES                     (bu modülün çıktısı)
 * ```
 *
 * ## Bu modülün YAPMADIKLARI
 *
 * - Resmî DTD doğrulaması **yapmaz** ve "DTD-conformant" **iddia etmez**
 *   (strict validation owner kararı **D1** ile bloklu: resmî DTD'nin 6 element
 *   bildirimi nondeterministic content model taşıyor).
 * - Resmî `rolTur`/`mahiyetKodu`/`takipTuru` **eşlemesi yapmaz** — çözülmemiş roller
 *   builder tarafından zaten `REJECTED` edilir. Codelist emisyonu **I01B-1** kapsamıdır.
 * - Ağ çağrısı **yapmaz**, transport **açmaz**, hiçbir şey persist **etmez**.
 */

import {
  OfficialByteEncodingResult,
  encodeOfficialExchangeToIso88599,
} from './official-iso8859-9-encoder';
import { serializeOfficialExchange } from './official-exchange-builder';
import type {
  OfficialExchangeInput,
  OfficialSerializationResult,
} from './official-exchange.types';

/** Canonical serializer sözleşmesinin sürümü (evidence kayıtlarında taşınır). */
export const UYAP_CANONICAL_SERIALIZER_VERSION = 'UYAP-CANONICAL-SERIALIZER/v1' as const;

/**
 * Canonical serileştirme sonucu.
 *
 * Owner yasak statü adları (`UYAP_READY` / `SUBMITTABLE` / `OFFICIAL_ACCEPTED` /
 * `COMPLIANT` / `VALIDATED_BYTES`) **KULLANILMAZ**. Başarı statüsü yalnız
 * `CANONICAL_BYTES`'tır: "şekil üretildi ve kayıpsız ISO-8859-9 byte'a çevrildi" —
 * resmî kabul veya DTD uyumu **iddia etmez**.
 */
export type UyapCanonicalSerializationResult =
  | {
      readonly status: 'CANONICAL_BYTES';
      readonly serializerVersion: typeof UYAP_CANONICAL_SERIALIZER_VERSION;
      /** Bellek içi ISO-8859-9 byte dizisi. Persist/transmit YOK. */
      readonly bytes: Buffer;
      /** Üretilen XML metni (byte'ların kaynağı) — hata ayıklama/evidence için. */
      readonly xml: string;
      readonly evidence: {
        readonly encoding: 'ISO-8859-9';
        /** Deklarasyon etiketi ile GERÇEK byte encoding'i EŞLEŞTİ. */
        readonly declarationMatchesBytes: true;
        readonly byteEncodingPerformed: true;
        readonly roundTripVerified: true;
        readonly byteLength: number;
        readonly encodedBytesSha256: string;
        /** DTD doğrulaması YAPILMADI — D1 ile bloklu. */
        readonly officialDtdValidated: false;
        /** Resmî codelist emisyonu bu aşamada KAPALI (I01B-1). */
        readonly officialCodelistConformance: 'NOT_CLOSED';
      };
    }
  | {
      /** Şekil üretilemedi (çözülemeyen rol, id ihlali, yetkisiz alacakKalemi ebeveyni, ...). */
      readonly status: 'SHAPE_REJECTED';
      readonly serializerVersion: typeof UYAP_CANONICAL_SERIALIZER_VERSION;
      readonly shape: Extract<OfficialSerializationResult, { status: 'REJECTED' }>;
    }
  | {
      /** Şekil üretildi ama kayıpsız byte'a çevrilemedi (fail-closed). */
      readonly status: 'ENCODING_REJECTED';
      readonly serializerVersion: typeof UYAP_CANONICAL_SERIALIZER_VERSION;
      readonly xml: string;
      readonly encoding: Extract<OfficialByteEncodingResult, { status: 'ENCODING_REJECTED' }>;
    };

/**
 * **TEK CANONICAL ENTRYPOINT.** Resmî-şekilli UYAP exchange byte'ları burada üretilir.
 *
 * Deterministiktir: aynı girdi → aynı XML → aynı byte dizisi. `Date.now()`,
 * `Math.random()`, locale-duyarlı biçimleme veya platform-bağımlı satır sonu
 * KULLANILMAZ (builder ve encoder bu sınırları kendi içinde kilitler).
 *
 * Fail-closed: şekil reddedilirse byte üretilmez; byte kayıpsız değilse sonuç
 * reddedilir. Hiçbir durumda sessiz `?` ikamesi veya kayıp karakter kabul edilmez.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - `official-dormant-dispatch.ts` → dormant/local dispatch (ağ çağrısı YOK)
 * - Üretimde başka çağıran YOKTUR; runtime wiring I01B/cutover kapsamındadır.
 * </remarks>
 */
export function serializeUyapExchangeCanonical(
  input: OfficialExchangeInput,
): UyapCanonicalSerializationResult {
  // 1) ŞEKİL — canonical XML modeli. Çözülemeyen rol/id/claim ihlali burada reddedilir.
  const shape = serializeOfficialExchange(input);
  if (shape.status === 'REJECTED') {
    return {
      status: 'SHAPE_REJECTED',
      serializerVersion: UYAP_CANONICAL_SERIALIZER_VERSION,
      shape,
    };
  }

  // 2) ENCODING SINIRI — gerçek ISO-8859-9 byte'ları. Encoder deklarasyon tutarlılığını
  //    ve encode→decode round-trip'ini KENDİ İÇİNDE doğrular; ikame/kayıp → reddeder.
  //    Bu, "deklarasyon ISO-8859-9 ama byte UTF-8" durumunu yapısal olarak imkânsız kılar.
  //    Encoder `SERIALIZED_DRAFT` sonucunun TAMAMINI alır (yalnız `xml` string'ini değil):
  //    statü + deklarasyon + metin birlikte doğrulanır.
  const encoded = encodeOfficialExchangeToIso88599(shape);
  if (encoded.status === 'ENCODING_REJECTED') {
    return {
      status: 'ENCODING_REJECTED',
      serializerVersion: UYAP_CANONICAL_SERIALIZER_VERSION,
      xml: shape.xml,
      encoding: encoded,
    };
  }

  return {
    status: 'CANONICAL_BYTES',
    serializerVersion: UYAP_CANONICAL_SERIALIZER_VERSION,
    bytes: encoded.bytes,
    xml: shape.xml,
    evidence: {
      encoding: 'ISO-8859-9',
      declarationMatchesBytes: true,
      byteEncodingPerformed: true,
      roundTripVerified: true,
      byteLength: encoded.evidence.byteLength,
      encodedBytesSha256: encoded.evidence.encodedBytesSha256,
      officialDtdValidated: false,
      officialCodelistConformance: 'NOT_CLOSED',
    },
  };
}
