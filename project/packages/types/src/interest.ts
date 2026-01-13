/**
 * Interest Engine Shared Types
 * 
 * TEK KAYNAK: Tüm faiz türü tanımları buradan import edilmeli
 */

// ═══════════════════════════════════════════════════════════════════════════
// INTEREST TYPE CODE - Faiz Türü Kodu
// ═══════════════════════════════════════════════════════════════════════════

export enum InterestTypeCode {
  // ─────────────────────────────────────────────────────────────────────────
  // YASAL FAİZ (3095 sayılı Kanun m.1)
  // Not: Nadiren değişir - 2006-2024: %9, 2024+: %24
  // ─────────────────────────────────────────────────────────────────────────
  LEGAL_3095 = 'LEGAL_3095',

  // ─────────────────────────────────────────────────────────────────────────
  // TİCARİ TEMERRÜT FAİZİ (3095 sayılı Kanun m.2/2)
  // Not: TCMB avans oranına bağlı, sık değişir
  // ─────────────────────────────────────────────────────────────────────────
  COMMERCIAL_AVANS_3095_2_2 = 'COMMERCIAL_AVANS_3095_2_2',
  COMMERCIAL_FIXED = 'COMMERCIAL_FIXED',

  // ─────────────────────────────────────────────────────────────────────────
  // DİĞER FAİZ TÜRLERİ
  // ─────────────────────────────────────────────────────────────────────────
  TTK_1530 = 'TTK_1530',
  CONTRACTUAL = 'CONTRACTUAL',

  // ─────────────────────────────────────────────────────────────────────────
  // MEVDUAT FAİZLERİ (3095 m.2/3 - Döviz alacakları için)
  // ─────────────────────────────────────────────────────────────────────────
  MEVDUAT_TL_BANKALARCA = 'MEVDUAT_TL_BANKALARCA',
  MEVDUAT_USD_BANKALARCA = 'MEVDUAT_USD_BANKALARCA',
  MEVDUAT_EUR_BANKALARCA = 'MEVDUAT_EUR_BANKALARCA',
  MEVDUAT_TL_KAMU = 'MEVDUAT_TL_KAMU',
  MEVDUAT_USD_KAMU = 'MEVDUAT_USD_KAMU',
  MEVDUAT_EUR_KAMU = 'MEVDUAT_EUR_KAMU',
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEREST TYPE LABELS - Türkçe Etiketler
// ═══════════════════════════════════════════════════════════════════════════

export const InterestTypeLabels: Record<InterestTypeCode, string> = {
  [InterestTypeCode.LEGAL_3095]: 'Yasal Faiz (%9 / %24)',
  [InterestTypeCode.COMMERCIAL_AVANS_3095_2_2]: 'Ticari Temerrüt (TCMB Avans)',
  [InterestTypeCode.COMMERCIAL_FIXED]: 'Ticari Sabit Oran',
  [InterestTypeCode.TTK_1530]: 'TTK 1530 Geç Ödeme Faizi',
  [InterestTypeCode.CONTRACTUAL]: 'Sözleşmesel (Akdi) Faiz',
  [InterestTypeCode.MEVDUAT_TL_BANKALARCA]: 'Mevduat TL (Bankalar)',
  [InterestTypeCode.MEVDUAT_USD_BANKALARCA]: 'Mevduat USD (Bankalar)',
  [InterestTypeCode.MEVDUAT_EUR_BANKALARCA]: 'Mevduat EUR (Bankalar)',
  [InterestTypeCode.MEVDUAT_TL_KAMU]: 'Mevduat TL (Kamu)',
  [InterestTypeCode.MEVDUAT_USD_KAMU]: 'Mevduat USD (Kamu)',
  [InterestTypeCode.MEVDUAT_EUR_KAMU]: 'Mevduat EUR (Kamu)',
};

// ═══════════════════════════════════════════════════════════════════════════
// INTEREST TYPE SHORT LABELS - Kısa Etiketler (UI Badge için)
// ═══════════════════════════════════════════════════════════════════════════

export const InterestTypeShortLabels: Record<InterestTypeCode, string> = {
  [InterestTypeCode.LEGAL_3095]: 'Yasal',
  [InterestTypeCode.COMMERCIAL_AVANS_3095_2_2]: 'Ticari',
  [InterestTypeCode.COMMERCIAL_FIXED]: 'Sabit',
  [InterestTypeCode.TTK_1530]: 'TTK 1530',
  [InterestTypeCode.CONTRACTUAL]: 'Akdi',
  [InterestTypeCode.MEVDUAT_TL_BANKALARCA]: 'Mevduat TL',
  [InterestTypeCode.MEVDUAT_USD_BANKALARCA]: 'Mevduat USD',
  [InterestTypeCode.MEVDUAT_EUR_BANKALARCA]: 'Mevduat EUR',
  [InterestTypeCode.MEVDUAT_TL_KAMU]: 'Kamu TL',
  [InterestTypeCode.MEVDUAT_USD_KAMU]: 'Kamu USD',
  [InterestTypeCode.MEVDUAT_EUR_KAMU]: 'Kamu EUR',
};

// ═══════════════════════════════════════════════════════════════════════════
// RATE SOURCE TYPE - Oran Kaynağı
// ═══════════════════════════════════════════════════════════════════════════

export enum RateSourceType {
  TCMB = 'TCMB',
  RESMI_GAZETE = 'RESMI_GAZETE',
  CONTRACT = 'CONTRACT',
  INFERRED = 'INFERRED',
}

// ═══════════════════════════════════════════════════════════════════════════
// CURRENCY - Para Birimi
// ═══════════════════════════════════════════════════════════════════════════

export type Currency = 'TRY' | 'USD' | 'EUR' | 'GBP' | 'CHF';

export const CurrencyLabels: Record<Currency, string> = {
  TRY: 'Türk Lirası',
  USD: 'Amerikan Doları',
  EUR: 'Euro',
  GBP: 'İngiliz Sterlini',
  CHF: 'İsviçre Frangı',
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Değişken oranlı faiz türü mü?
 */
export function isVariableRateType(type: InterestTypeCode): boolean {
  return [
    InterestTypeCode.LEGAL_3095,
    InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
    InterestTypeCode.TTK_1530,
    InterestTypeCode.MEVDUAT_TL_BANKALARCA,
    InterestTypeCode.MEVDUAT_USD_BANKALARCA,
    InterestTypeCode.MEVDUAT_EUR_BANKALARCA,
    InterestTypeCode.MEVDUAT_TL_KAMU,
    InterestTypeCode.MEVDUAT_USD_KAMU,
    InterestTypeCode.MEVDUAT_EUR_KAMU,
  ].includes(type);
}

/**
 * Sabit oran girişi gerektiren faiz türü mü?
 */
export function requiresFixedRate(type: InterestTypeCode): boolean {
  return [
    InterestTypeCode.COMMERCIAL_FIXED,
    InterestTypeCode.CONTRACTUAL,
  ].includes(type);
}

/**
 * Ticari faiz türü mü?
 */
export function isCommercialType(type: InterestTypeCode): boolean {
  return [
    InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
    InterestTypeCode.COMMERCIAL_FIXED,
    InterestTypeCode.TTK_1530,
  ].includes(type);
}

/**
 * Döviz mevduat faizi mi?
 */
export function isForeignCurrencyDepositType(type: InterestTypeCode): boolean {
  return [
    InterestTypeCode.MEVDUAT_USD_BANKALARCA,
    InterestTypeCode.MEVDUAT_EUR_BANKALARCA,
    InterestTypeCode.MEVDUAT_USD_KAMU,
    InterestTypeCode.MEVDUAT_EUR_KAMU,
  ].includes(type);
}
