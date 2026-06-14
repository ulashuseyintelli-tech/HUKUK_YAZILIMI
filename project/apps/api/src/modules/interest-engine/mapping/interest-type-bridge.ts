/**
 * E-G1: FAİZ TÜRÜ KANONİK KÖPRÜ
 *
 * Prisma `InterestType` (legacy/hukuki etiket: YASAL/SABIT/AVANS/TEMERRUT/YOKSUN/TICARI)
 * → kanonik hesap enum'u `InterestTypeCode` (LEGAL_3095, COMMERCIAL_*, TTK_1530, CONTRACTUAL, ...).
 *
 * Hukuki kararlar (ulas, 2026-06-14 — E1/E2/E5 KİLİTLİ, ledger: tbk100-legal-decisions-ledger):
 *  - E1: InterestTypeCode kanoniktir; Prisma InterestType yalnız etiket. Hesaba InterestType
 *        DEĞİL, InterestTypeCode girer.
 *  - E2: Eşleme EXHAUSTIVE; SILENT DEFAULT KESİN YASAK (doc-24 deseni). Eşlenmeyen değer
 *        throw (strict) veya diagnostic (tryMap) üretir.
 *  - E5: Prisma InterestTypeCode enum'u TS ile eşitlendi (COMMERCIAL_FIXED eklendi).
 *
 * Eşleme tablosu (TEK OTORİTE — başka yerde yeniden tanımlanmaz):
 *  YASAL    → LEGAL_3095
 *  TICARI   → COMMERCIAL_AVANS_3095_2_2
 *  AVANS    → COMMERCIAL_AVANS_3095_2_2
 *  TEMERRUT → TTK_1530
 *  SABIT    → COMMERCIAL_FIXED          (sabit ORANI temsil eder; sabit TUTAR değil — E4 ayrı)
 *  YOKSUN   → THROW (UNSUPPORTED)        (yoksun kalınan kâr/faiz ≠ faiz; sessizce bağlama YOK)
 *  OZEL     → CONTRACTUAL                (YALNIZ string yüzeyi; Prisma InterestType enum'da OZEL yok)
 *
 * Kapsam: SAF tür-çevirisi. fixedRate sourcing + interestRate(%)↔fixedRate(0-1) dönüşümü =
 * E-G2. Canlı hesap yoluna WIRING YOK (bu gate yalnız aracıyı üretir).
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - (E-G1'de CANLI ÇAĞIRAN YOK — saf-additive.) Köprü ileride D-E assembler/computeBalance
 *   gate'inde ClaimItem.interestType / Due.interestType → ClaimBucket.interestType için tüketilecek.
 * </remarks>
 */

import { InterestType as PrismaInterestType } from '@prisma/client';
import { InterestTypeCode } from '../types/domain.types';

/** Eşleme başarısızlık sebebi: desteklenmeyen (bilinen ama yasak) veya bilinmeyen değer. */
export type InterestTypeMapReason = 'UNSUPPORTED' | 'UNKNOWN';

/**
 * Faiz türü kanonik koda çevrilemediğinde fırlatılır. Silent default YASAK olduğundan
 * eşlenemeyen her değer bu hatayı (strict yol) veya diagnostic'i (tryMap yol) üretir.
 */
export class UnsupportedInterestTypeError extends Error {
  constructor(
    public readonly input: string,
    public readonly reason: InterestTypeMapReason,
  ) {
    super(
      `InterestType '${input}' kanonik InterestTypeCode'a eşlenemedi (${reason}). ` +
        `Silent default YASAK (E2); bu değer bilinçli ele alınmalı.`,
    );
    this.name = 'UnsupportedInterestTypeError';
  }
}

/** tryMap* dönüş tipi: discriminated union (batch/assembler diagnostic toplayabilsin). */
export type InterestTypeMapResult =
  | { ok: true; code: InterestTypeCode }
  | { ok: false; reason: InterestTypeMapReason; input: string };

/** Yalnız string yüzeyinde geçerli alias'lar (Prisma InterestType enum'unda OLMAYAN değerler). */
const STRING_ONLY_ALIASES: Readonly<Record<string, InterestTypeCode>> = {
  OZEL: InterestTypeCode.CONTRACTUAL,
};

/**
 * Derleme-zamanı exhaustiveness koruması (doc-24). Prisma InterestType enum'una ileride değer
 * eklenirse bu satır DERLENMEZ → sessiz default imkânsız, karar zorlanır.
 */
function assertNeverInterestType(x: never): never {
  throw new UnsupportedInterestTypeError(String(x), 'UNKNOWN');
}

/**
 * STRICT yol: Prisma InterestType enum'unu kanonik InterestTypeCode'a çevirir.
 * Eşlenmeyen (YOKSUN) → throw. Exhaustive switch (silent default yok).
 *
 * <remarks>Çağrıldığı yerler: tryMapInterestType() (yumuşak sarıcı) + ileride D-E assembler.</remarks>
 */
export function mapInterestType(t: PrismaInterestType): InterestTypeCode {
  switch (t) {
    case PrismaInterestType.YASAL:
      return InterestTypeCode.LEGAL_3095;
    case PrismaInterestType.TICARI:
      return InterestTypeCode.COMMERCIAL_AVANS_3095_2_2;
    case PrismaInterestType.AVANS:
      return InterestTypeCode.COMMERCIAL_AVANS_3095_2_2;
    case PrismaInterestType.TEMERRUT:
      return InterestTypeCode.TTK_1530;
    case PrismaInterestType.SABIT:
      return InterestTypeCode.COMMERCIAL_FIXED;
    case PrismaInterestType.YOKSUN:
      // Yoksun kalınan kâr/faiz ≠ temerrüt/yasal faiz → sessizce LEGAL_3095'e BAĞLANMAZ.
      throw new UnsupportedInterestTypeError(PrismaInterestType.YOKSUN, 'UNSUPPORTED');
    default:
      return assertNeverInterestType(t);
  }
}

/**
 * STRICT yol (string yüzeyi): Due.interestType (serbest string) + 'OZEL' içeren DTO yolları için.
 * 6 Prisma enum değeri + 'OZEL' tanınır; başka her şey → throw (UNKNOWN).
 *
 * <remarks>Çağrıldığı yerler: tryMapInterestTypeString() + ileride D-E assembler (Due yolu).</remarks>
 */
export function mapInterestTypeString(s: string): InterestTypeCode {
  const key = (s ?? '').trim().toUpperCase();

  if (Object.prototype.hasOwnProperty.call(PrismaInterestType, key)) {
    return mapInterestType(PrismaInterestType[key as keyof typeof PrismaInterestType]);
  }
  if (Object.prototype.hasOwnProperty.call(STRING_ONLY_ALIASES, key)) {
    return STRING_ONLY_ALIASES[key];
  }
  throw new UnsupportedInterestTypeError(s, 'UNKNOWN');
}

/**
 * YUMUŞAK yol: throw yerine diagnostic döndürür (batch assembler hata toplaması için).
 *
 * <remarks>Çağrıldığı yerler: ileride D-E assembler (toplu kalem işleme).</remarks>
 */
export function tryMapInterestType(t: PrismaInterestType): InterestTypeMapResult {
  try {
    return { ok: true, code: mapInterestType(t) };
  } catch (e) {
    if (e instanceof UnsupportedInterestTypeError) {
      return { ok: false, reason: e.reason, input: e.input };
    }
    throw e;
  }
}

/**
 * YUMUŞAK yol (string yüzeyi).
 *
 * <remarks>Çağrıldığı yerler: ileride D-E assembler (Due yolu, toplu işleme).</remarks>
 */
export function tryMapInterestTypeString(s: string): InterestTypeMapResult {
  try {
    return { ok: true, code: mapInterestTypeString(s) };
  } catch (e) {
    if (e instanceof UnsupportedInterestTypeError) {
      return { ok: false, reason: e.reason, input: e.input };
    }
    throw e;
  }
}
