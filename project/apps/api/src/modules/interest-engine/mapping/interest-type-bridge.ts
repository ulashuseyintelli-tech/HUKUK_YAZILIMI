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
 * E-G2. PR-A3 ile persisted rich-code köprüsü canonical CaseBalance projection'ında canlıdır.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - ClaimBucket assembler legacy-only compatibility fallback'i.
 * - CaseBalanceService persisted rich code → engine enum projection'ı.
 * </remarks>
 */

import {
  InterestType as PrismaInterestType,
  InterestTypeCode as PrismaInterestTypeCode,
} from '@prisma/client';
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

function assertNeverPersistedInterestTypeCode(x: never): never {
  throw new UnsupportedInterestTypeError(String(x), 'UNKNOWN');
}

/**
 * PR-A3 persistence → engine enum köprüsü. Prisma, shared-types ve engine enum'ları aynı
 * string değerlerini taşısa da farklı TypeScript enum'larıdır; cast ile authority bypass
 * etmek yerine her persisted değer exhaustive olarak çevrilir.
 */
export function mapPersistedInterestTypeCode(t: PrismaInterestTypeCode): InterestTypeCode {
  switch (t) {
    case PrismaInterestTypeCode.LEGAL_3095:
      return InterestTypeCode.LEGAL_3095;
    case PrismaInterestTypeCode.COMMERCIAL_AVANS_3095_2_2:
      return InterestTypeCode.COMMERCIAL_AVANS_3095_2_2;
    case PrismaInterestTypeCode.COMMERCIAL_FIXED:
      return InterestTypeCode.COMMERCIAL_FIXED;
    case PrismaInterestTypeCode.TTK_1530:
      return InterestTypeCode.TTK_1530;
    case PrismaInterestTypeCode.CONTRACTUAL:
      return InterestTypeCode.CONTRACTUAL;
    case PrismaInterestTypeCode.MEVDUAT_TL_BANKALARCA:
      return InterestTypeCode.MEVDUAT_TL_BANKALARCA;
    case PrismaInterestTypeCode.MEVDUAT_USD_BANKALARCA:
      return InterestTypeCode.MEVDUAT_USD_BANKALARCA;
    case PrismaInterestTypeCode.MEVDUAT_EUR_BANKALARCA:
      return InterestTypeCode.MEVDUAT_EUR_BANKALARCA;
    case PrismaInterestTypeCode.MEVDUAT_TL_KAMU:
      return InterestTypeCode.MEVDUAT_TL_KAMU;
    case PrismaInterestTypeCode.MEVDUAT_USD_KAMU:
      return InterestTypeCode.MEVDUAT_USD_KAMU;
    case PrismaInterestTypeCode.MEVDUAT_EUR_KAMU:
      return InterestTypeCode.MEVDUAT_EUR_KAMU;
    default:
      return assertNeverPersistedInterestTypeCode(t);
  }
}

/**
 * PR-A3 legacy-only compatibility adapter. Yalnız owner-frozen, kayıpsız üç mirror kabul edilir.
 * AVANS/TEMERRUT/OZEL gibi daha geniş tarihsel köprü değerleri canonical ClaimItem read fallback'i
 * değildir; rich code yoksa fail-closed diagnostic üretmelidir.
 */
export function mapLegacyClaimItemCompatibilityType(s: string): InterestTypeCode {
  const key = (s ?? '').trim().toUpperCase();
  switch (key) {
    case 'YASAL':
      return InterestTypeCode.LEGAL_3095;
    case 'TICARI':
      return InterestTypeCode.COMMERCIAL_AVANS_3095_2_2;
    case 'SABIT':
      return InterestTypeCode.COMMERCIAL_FIXED;
    case 'YOKSUN':
      throw new UnsupportedInterestTypeError(s, 'UNSUPPORTED');
    default:
      throw new UnsupportedInterestTypeError(s, 'UNKNOWN');
  }
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
