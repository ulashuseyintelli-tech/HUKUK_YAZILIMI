/**
 * DBP-P2-UYAP-CONTRACT-A-P04A-ENC — Resmî ISO-8859-9 (Latin-5) GERÇEK BYTE ENCODING temeli.
 *
 * P02B serializer'ının ürettiği `SERIALIZED_DRAFT` XML metnini, resmî UYAP Contract A yüzeyinin
 * beklediği ISO-8859-9 byte dizisine `iconv-lite` ile çevirir. Prensip FAIL-CLOSED'dir: kayıpsızlık
 * (round-trip birebir) kanıtlanamazsa ASLA byte üretilmez.
 *
 * KESİN SINIRLAR (owner D1/D5):
 * - Girdi YALNIZ `SERIALIZED_DRAFT`'tır (rastgele XML string DEĞİL). `REJECTED` serializer sonucu bu
 *   fonksiyonun TİP YÜZEYİNE giremez (`Extract<..., { status: 'SERIALIZED_DRAFT' }>`).
 * - `iconv-lite` temsil-edilemeyen karakteri sessizce '?' (0x3F) ile İKAME EDER; bu davranış OTORİTE
 *   DEĞİLDİR. Sonuç yalnız (a) XML deklarasyonu ISO-8859-9 ile tutarlıysa VE (b) encode→decode
 *   round-trip'i KAYNAKLA BİREBİR eşitse KABUL edilir. Herhangi bir ikame/kayıp → `ENCODING_REJECTED`.
 * - Unicode normalizasyonu (NFC/NFD) YAPILMAZ; decomposed dizi kaynak neyse odur — Latin-5'te birebir
 *   temsil edilemiyorsa reddedilir.
 * - Sessiz '?'/replacement-char/karakter atma/transliterasyon/best-effort YOKTUR.
 * - `officialDtdValidated` DAİMA `false` (DTD doğrulaması P04B-VAL kapsamı; DTD repo/CI'da yer almaz).
 * - Üretilen byte'lar YALNIZ BELLEK içinde döner: persist/transmit/wire/raw-log YOK (D5). Kanıt yüzeyi
 *   yalnız encoding/byteLength/SHA-256/round-trip/declaration bayraklarıdır; ham XML/byte loglanmaz.
 *
 * Çağrıldığı yerler:
 * - (henüz runtime wiring YOK — yalnız test-reachable P04A-ENC foundation; UYAP cutover HARD HOLD)
 */
import { createHash } from 'node:crypto';

import * as iconv from 'iconv-lite';

import type { OfficialSerializationResult } from './official-exchange.types';

/** Encoder girdisi: YALNIZ başarılı P02B serializer taslağı (rastgele string/`REJECTED` değil). */
type OfficialSerializedDraft = Extract<OfficialSerializationResult, { status: 'SERIALIZED_DRAFT' }>;

/**
 * iconv-lite çağrılarında kullanılan KANONİK encoding adı. `iconv-lite`'ın `Encoding` union tipi
 * `'ISO-8859-9'` (tireli/büyük) casing'ini içermez; `'iso88599'` union üyesidir ve aynı Latin-5
 * codec'ine çözülür (üretilen byte'lar bit-özdeştir). Determinizm korunur.
 */
const ICONV_ISO_8859_9 = 'iso88599';

/** Kanıt/etiket yüzeyinde kullanılan resmî encoding ETİKETİ (Latin-5). */
const ISO_8859_9_LABEL = 'ISO-8859-9' as const;

/** Temsil-edilemeyen karakterin code-point düzeyi konum kaydı. */
export interface UnrepresentableCharacter {
  /** Ham karakter (astral karakterler için 2 UTF-16 code unit olabilir). */
  character: string;
  /** `U+XXXX` biçiminde code point. */
  codePoint: string;
  /** UTF-16 code-unit ofseti (JS string index). */
  utf16Index: number;
  /** Code-point sırası (0-tabanlı; astral karakterler tek sayılır). */
  codePointIndex: number;
}

/**
 * Byte encoding sonucu.
 *
 * Owner yasak statü adları: `UYAP_READY` / `SUBMITTABLE` / `OFFICIAL_ACCEPTED` / `COMPLIANT` /
 * `VALIDATED_BYTES`. Bu fonksiyon yalnız KAYIPSIZ byte üretimini kanıtlar; resmî kabul/uyum/DTD
 * doğrulaması İDDİA ETMEZ (`officialDtdValidated` daima `false`).
 */
export type OfficialByteEncodingResult =
  | {
      status: 'BYTE_ENCODED';
      /** Bellek içi ISO-8859-9 byte dizisi (persist/transmit YOK). */
      bytes: Buffer;
      evidence: {
        encoding: 'ISO-8859-9';
        byteEncodingPerformed: true;
        roundTripVerified: true;
        declarationConsistent: true;
        /** DTD doğrulaması YAPILMADI (P04B-VAL kapsamı). */
        officialDtdValidated: false;
        byteLength: number;
        /** Üretilen byte'ların SHA-256 özeti (determinizm/kimlik kanıtı). */
        encodedBytesSha256: string;
      };
    }
  | {
      status: 'ENCODING_REJECTED';
      reason: 'DECLARATION_MISMATCH' | 'UNREPRESENTABLE_CHARACTER' | 'ROUND_TRIP_MISMATCH';
      /** Temsil-edilemeyen karakterler (varsa); `DECLARATION_MISMATCH`'te boştur. */
      unrepresentable: UnrepresentableCharacter[];
    };

/**
 * XML deklarasyonundaki encoding'in (metin başında) ISO-8859-9 olup olmadığını doğrular.
 * `<?xml version="1.0" encoding="ISO-8859-9"?>` — tek/çift tırnak ve boşluk toleranslı; YALNIZ baştaki
 * deklarasyon dikkate alınır (gövdedeki herhangi bir `encoding=` metni yakalanmaz).
 */
function declarationEncodingIsIso88599(xml: string): boolean {
  const decl = /^\s*<\?xml\b[^>]*?\bencoding\s*=\s*("|')([^"']*)\1[^>]*?\?>/i.exec(xml);
  return decl !== null && decl[2].toUpperCase() === ISO_8859_9_LABEL;
}

/**
 * Kaynak metni code-point bazında tarayıp ISO-8859-9'da round-trip'i bozan (temsil-edilemeyen)
 * karakterleri konumlarıyla toplar. Her karakter TEK BAŞINA encode→decode edilir; geri-dönüş ≠ kaynak
 * ise temsil-edilemez sayılır (iconv'un '?' ikamesine değil, round-trip eşitliğine dayanır).
 */
function collectUnrepresentable(xml: string): UnrepresentableCharacter[] {
  const out: UnrepresentableCharacter[] = [];
  let utf16Index = 0;
  let codePointIndex = 0;
  for (const ch of xml) {
    const roundTrip = iconv.decode(iconv.encode(ch, ICONV_ISO_8859_9), ICONV_ISO_8859_9);
    if (roundTrip !== ch) {
      const cp = ch.codePointAt(0) ?? 0;
      out.push({
        character: ch,
        codePoint: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`,
        utf16Index,
        codePointIndex,
      });
    }
    utf16Index += ch.length;
    codePointIndex += 1;
  }
  return out;
}

/**
 * `SERIALIZED_DRAFT` XML metnini fail-closed biçimde ISO-8859-9 byte'a çevirir.
 *
 * Adımlar (owner algoritması): (1) girdi statüsü doğrula → (2) deklarasyon ISO-8859-9 tutarlılığı →
 * (3) iconv-lite encode → (4) decode → (5) kaynakla birebir eşitlik → (6) fark varsa code-point düzeyi
 * temsil-edilemezleri çıkar → (7) herhangi ikame/kayıp → `ENCODING_REJECTED` → (8) başarı → SHA-256 +
 * byteLength kanıtı. Unicode normalizasyonu ve sessiz ikame YOKTUR.
 *
 * Çağrıldığı yerler:
 * - (henüz runtime wiring YOK — P04A-ENC foundation; yalnız test-reachable)
 */
export function encodeOfficialExchangeToIso88599(
  draft: OfficialSerializedDraft,
): OfficialByteEncodingResult {
  // (1) Runtime savunması (force-cast'e karşı): tip tek varyant garanti etse de, union'a genişletip
  //     ANLAMLI bir statü kontrolü yapılır. SERIALIZED_DRAFT değilse deklarasyon doğrulanamaz.
  const result: OfficialSerializationResult = draft;
  if (result.status !== 'SERIALIZED_DRAFT') {
    return { status: 'ENCODING_REJECTED', reason: 'DECLARATION_MISMATCH', unrepresentable: [] };
  }

  const xml = result.xml;

  // (2) Deklarasyon tutarlılığı — XML metnindeki gerçek deklarasyon (içerik kontrolü; tipten türemez).
  if (!declarationEncodingIsIso88599(xml)) {
    return { status: 'ENCODING_REJECTED', reason: 'DECLARATION_MISMATCH', unrepresentable: [] };
  }

  // (3a) iconv-lite ISO-8859-9 desteği yoksa sessiz geçme — fail-closed.
  if (!iconv.encodingExists(ICONV_ISO_8859_9)) {
    return { status: 'ENCODING_REJECTED', reason: 'ROUND_TRIP_MISMATCH', unrepresentable: [] };
  }

  // (3b)(4) encode → decode. iconv temsil-edilemeyeni sessizce ikame edebilir; buna GÜVENİLMEZ.
  const bytes = iconv.encode(xml, ICONV_ISO_8859_9);
  const decoded = iconv.decode(bytes, ICONV_ISO_8859_9);

  // (5)(6)(7) Birebir eşit değilse kayıp/ikame olmuştur → code-point düzeyi temsil-edilemezleri çıkar, reddet.
  if (decoded !== xml) {
    const unrepresentable = collectUnrepresentable(xml);
    const reason = unrepresentable.length > 0 ? 'UNREPRESENTABLE_CHARACTER' : 'ROUND_TRIP_MISMATCH';
    return { status: 'ENCODING_REJECTED', reason, unrepresentable };
  }

  // (8) Kayıpsız: byte'lar yalnız bellekte döner; SHA-256 + byteLength kanıtı üretilir.
  return {
    status: 'BYTE_ENCODED',
    bytes,
    evidence: {
      encoding: ISO_8859_9_LABEL,
      byteEncodingPerformed: true,
      roundTripVerified: true,
      declarationConsistent: true,
      officialDtdValidated: false,
      byteLength: bytes.length,
      encodedBytesSha256: createHash('sha256').update(bytes).digest('hex'),
    },
  };
}
