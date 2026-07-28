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
import {
  OfficialCodeResolution,
  OfficialCodelistFailureCode,
  checkOfficialRolePair,
  validateOfficialMahiyetKodu,
  validateOfficialTakipTuru,
} from './official-codelist-registry';
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
        /**
         * I01B-1: emit edilen bütün kodlu alanlar canonical registry'ye karşı
         * doğrulandı (rolTur / mahiyetKodu / takipTuru). Bu, DTD uyumu İDDİA ETMEZ.
         */
        readonly officialCodelistConformance: 'REGISTRY_VALIDATED';
        /**
         * P02B-R2: `takipTuru` attribute'u emit EDİLMEDİ ve resmî DTD onu
         * `(0 | 1) "1"` ile varsayılanlı bildiriyor → ayrıştırıcı `1` (İlamsız)
         * uygulayacaktır. Bu örtük hukuki iddia sessiz bırakılmaz.
         */
        readonly takipTuruDtdDefaultApplies: boolean;
        /**
         * P02B-R2: domain → resmî kod ANLAM eşlemesi hâlâ owner kararı bekliyor.
         * `REGISTRY_VALIDATED` yalnız sözdizimini kapsar; bu bayrak, çıktının bir
         * Canary corpus'u için hukuken hazır OLMADIĞINI taşır.
         */
        readonly officialCodeSemanticMapping: 'AUTHORITY_REQUIRED';
      };
    }
  | {
      /**
       * I01B-1: kodlu alan resmî sözlüğe uymuyor veya etiketi owner-ratified değil.
       * Şekil kurulmaz, byte üretilmez (fail-closed).
       */
      readonly status: 'CODELIST_REJECTED';
      readonly serializerVersion: typeof UYAP_CANONICAL_SERIALIZER_VERSION;
      readonly failureCode: OfficialCodelistFailureCode;
      readonly detail: string;
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
  // 0) CODELIST KAPISI (I01B-1) — ŞEKİLDEN ÖNCE. Kodlu alanlar canonical registry'ye
  //    karşı doğrulanır; sessiz varsayılan/fallback YOKTUR. Reddedilirse XML hiç
  //    kurulmaz, kısmi byte üretilmez.
  const codelist = checkCodelist(input);
  if (codelist) return codelist;

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
      officialCodelistConformance: 'REGISTRY_VALIDATED',
      takipTuruDtdDefaultApplies: input.dosya.takipTuruResolution.kind !== 'RESOLVED',
      officialCodeSemanticMapping: 'AUTHORITY_REQUIRED',
    },
  };
}

/**
 * I01B-1 codelist kapısı. İhlal varsa `CODELIST_REJECTED` döner, yoksa `undefined`.
 *
 * Etiket ÇAĞIRANDAN kabul edilmez: `RESOLVED` resolution'ın taşıdığı `rol` etiketi
 * registry'nin canonical etiketiyle karşılaştırılır; çelişki veya owner-ratified
 * olmayan etiket fail-closed'dır.
 */
/**
 * Bir kodlu-anlam çözümünü değerlendirir. İhlal varsa `{failureCode, detail}`, yoksa
 * `undefined` döner.
 *
 * İki bağımsız eksen ayrı ayrı kontrol edilir:
 * 1. **ANLAM YETKİSİ** — `AUTHORITY_REQUIRED` ise emisyon yasaktır (owner kararı yok).
 * 2. **SÖZDİZİM** — `RESOLVED` değer her iki resmî artefaktta da tanınıyor mu.
 *
 * `NOT_ASSERTED` geçerlidir: attribute emit edilmez. Bu ihmal DTD varsayılanını
 * devreye sokabilir, o yüzden evidence'ta açıkça taşınır.
 */
function checkCodeResolution(
  resolution: OfficialCodeResolution | undefined,
  authorityFailureCode: OfficialCodelistFailureCode,
  validateValue: (value: string | undefined) => { ok: boolean } & Partial<{
    failureCode: OfficialCodelistFailureCode;
    detail: string;
  }>,
): { failureCode: OfficialCodelistFailureCode; detail: string } | undefined {
  if (resolution === undefined || resolution.kind === 'NOT_ASSERTED') return undefined;

  if (resolution.kind === 'AUTHORITY_REQUIRED') {
    return {
      failureCode: authorityFailureCode,
      detail: `${resolution.domainType}: ${resolution.reason}`,
    };
  }

  const syntax = validateValue(resolution.code);
  if (!syntax.ok) {
    return {
      failureCode: syntax.failureCode as OfficialCodelistFailureCode,
      detail: syntax.detail as string,
    };
  }
  return undefined;
}

function checkCodelist(
  input: OfficialExchangeInput,
): Extract<UyapCanonicalSerializationResult, { status: 'CODELIST_REJECTED' }> | undefined {
  const reject = (
    failureCode: OfficialCodelistFailureCode,
    detail: string,
  ): Extract<UyapCanonicalSerializationResult, { status: 'CODELIST_REJECTED' }> => ({
    status: 'CODELIST_REJECTED',
    serializerVersion: UYAP_CANONICAL_SERIALIZER_VERSION,
    failureCode,
    detail,
  });

  // P02B-R2: kodlu-anlam alanları ÇÖZÜLMÜŞ gelir. Önce ANLAM yetkisi (resolution kind),
  // sonra SÖZDİZİM (değer her iki resmî artefaktta var mı) doğrulanır. Ham kod kabul edilmez.
  const mahiyet = checkCodeResolution(
    input?.dosya?.mahiyetResolution,
    'OFFICIAL_MAHIYET_MAPPING_AUTHORITY_REQUIRED',
    validateOfficialMahiyetKodu,
  );
  if (mahiyet) return reject(mahiyet.failureCode, mahiyet.detail);

  const takip = checkCodeResolution(
    input?.dosya?.takipTuruResolution,
    'OFFICIAL_TAKIP_MAPPING_AUTHORITY_REQUIRED',
    validateOfficialTakipTuru,
  );
  if (takip) return reject(takip.failureCode, takip.detail);

  for (const taraf of input?.taraflar ?? []) {
    const r = taraf?.roleResolution;
    // Yalnız RESOLVED emit edilebilir; diğerleri builder tarafından zaten reddedilir.
    // Burada RESOLVED'ın kodlu içeriği registry'ye karşı doğrulanır.
    if (!r || r.kind !== 'RESOLVED') continue;
    const check = checkOfficialRolePair(r.rolID, r.rol);
    if (!check.ok) return reject(check.failureCode, check.detail);
  }

  return undefined;
}
