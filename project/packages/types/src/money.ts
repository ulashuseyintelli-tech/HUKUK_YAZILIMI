/**
 * Para Tipi - Tek Kaynak
 * 
 * KURAL: float TL YASAK. Tüm para değerleri kuruş cinsinden.
 * 
 * @example
 * // ✅ DOĞRU
 * const amount: Money = Money.fromTL(1000, 'TRY');
 * 
 * // ❌ YANLIŞ
 * const amount = 1000.50; // float yasak
 * const amount = { amount: 1000 }; // Money tipi kullan
 */

// ============================================
// CURRENCY
// ============================================

export type Currency = 'TRY' | 'USD' | 'EUR';

export const CurrencyLabels: Record<Currency, string> = {
  TRY: 'Türk Lirası',
  USD: 'Amerikan Doları',
  EUR: 'Euro',
};

export const CurrencySymbols: Record<Currency, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
};

// ============================================
// MONEY INTERFACE
// ============================================

/**
 * Para tipi - kuruş cinsinden bigint
 * 
 * amountMinor: 100 = 1 TL
 * amountMinor: 1050 = 10.50 TL
 */
export interface Money {
  /** Kuruş cinsinden tutar (100 = 1 TL) */
  readonly amountMinor: bigint;
  /** Para birimi */
  readonly currency: Currency;
}

// ============================================
// MONEY HELPERS
// ============================================

/**
 * Money oluşturma ve işlem helper'ları
 */
export const MoneyUtils = {
  /**
   * TL değerinden Money oluştur
   * @example Money.fromTL(1000.50, 'TRY') → { amountMinor: 100050n, currency: 'TRY' }
   */
  fromTL: (tl: number, currency: Currency = 'TRY'): Money => ({
    amountMinor: BigInt(Math.round(tl * 100)),
    currency,
  }),

  /**
   * Kuruş değerinden Money oluştur
   * @example Money.fromMinor(100050n, 'TRY') → 1000.50 TL
   */
  fromMinor: (minor: bigint | number, currency: Currency = 'TRY'): Money => ({
    amountMinor: BigInt(minor),
    currency,
  }),

  /**
   * Money'yi TL değerine çevir
   * @example Money.toTL({ amountMinor: 100050n, currency: 'TRY' }) → 1000.50
   */
  toTL: (m: Money): number => Number(m.amountMinor) / 100,

  /**
   * Sıfır para
   */
  zero: (currency: Currency = 'TRY'): Money => ({
    amountMinor: BigInt(0),
    currency,
  }),

  /**
   * İki para değerini topla
   * @throws Currency mismatch hatası
   */
  add: (a: Money, b: Money): Money => {
    if (a.currency !== b.currency) {
      throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
    }
    return {
      amountMinor: a.amountMinor + b.amountMinor,
      currency: a.currency,
    };
  },

  /**
   * Para değerinden çıkar
   * @throws Currency mismatch hatası
   */
  subtract: (a: Money, b: Money): Money => {
    if (a.currency !== b.currency) {
      throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
    }
    return {
      amountMinor: a.amountMinor - b.amountMinor,
      currency: a.currency,
    };
  },

  /**
   * Para değerini çarp (oran ile)
   * @example multiply(1000 TL, 0.18) → 180 TL (faiz gibi)
   */
  multiply: (m: Money, factor: number): Money => ({
    amountMinor: BigInt(Math.round(Number(m.amountMinor) * factor)),
    currency: m.currency,
  }),

  /**
   * Para değerini böl
   */
  divide: (m: Money, divisor: number): Money => ({
    amountMinor: BigInt(Math.round(Number(m.amountMinor) / divisor)),
    currency: m.currency,
  }),

  /**
   * Karşılaştırma: a > b
   */
  isGreaterThan: (a: Money, b: Money): boolean => {
    if (a.currency !== b.currency) {
      throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
    }
    return a.amountMinor > b.amountMinor;
  },

  /**
   * Karşılaştırma: a < b
   */
  isLessThan: (a: Money, b: Money): boolean => {
    if (a.currency !== b.currency) {
      throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
    }
    return a.amountMinor < b.amountMinor;
  },

  /**
   * Karşılaştırma: a === b
   */
  isEqual: (a: Money, b: Money): boolean => {
    return a.currency === b.currency && a.amountMinor === b.amountMinor;
  },

  /**
   * Sıfır mı?
   */
  isZero: (m: Money): boolean => m.amountMinor === BigInt(0),

  /**
   * Negatif mi?
   */
  isNegative: (m: Money): boolean => m.amountMinor < BigInt(0),

  /**
   * Pozitif mi?
   */
  isPositive: (m: Money): boolean => m.amountMinor > BigInt(0),

  /**
   * Mutlak değer
   */
  abs: (m: Money): Money => ({
    amountMinor: m.amountMinor < BigInt(0) ? -m.amountMinor : m.amountMinor,
    currency: m.currency,
  }),

  /**
   * Formatla (display için)
   * @example format({ amountMinor: 100050n, currency: 'TRY' }) → "1.000,50 ₺"
   */
  format: (m: Money, locale: string = 'tr-TR'): string => {
    const value = Number(m.amountMinor) / 100;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: m.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  },

  /**
   * JSON serialization için (bigint → string)
   */
  toJSON: (m: Money): { amountMinor: string; currency: Currency } => ({
    amountMinor: m.amountMinor.toString(),
    currency: m.currency,
  }),

  /**
   * JSON'dan parse et
   */
  fromJSON: (json: { amountMinor: string; currency: Currency }): Money => ({
    amountMinor: BigInt(json.amountMinor),
    currency: json.currency,
  }),

  /**
   * Birden fazla Money topla
   */
  sum: (items: Money[]): Money => {
    if (items.length === 0) {
      return MoneyUtils.zero();
    }
    const currency = items[0].currency;
    const total = items.reduce((acc, item) => {
      if (item.currency !== currency) {
        throw new Error(`Currency mismatch in sum: ${currency} vs ${item.currency}`);
      }
      return acc + item.amountMinor;
    }, BigInt(0));
    return { amountMinor: total, currency };
  },

  /**
   * Minimum değer
   */
  min: (a: Money, b: Money): Money => {
    if (a.currency !== b.currency) {
      throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
    }
    return a.amountMinor <= b.amountMinor ? a : b;
  },

  /**
   * Maximum değer
   */
  max: (a: Money, b: Money): Money => {
    if (a.currency !== b.currency) {
      throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
    }
    return a.amountMinor >= b.amountMinor ? a : b;
  },
};

// ============================================
// LEGACY UYUMLULUK (GEÇİCİ)
// ============================================

/**
 * @deprecated Legacy number → Money dönüşümü
 * Yeni kod Money tipi kullanmalı
 */
export function legacyNumberToMoney(amount: number | null | undefined, currency: Currency = 'TRY'): Money {
  if (amount === null || amount === undefined) {
    return MoneyUtils.zero(currency);
  }
  return MoneyUtils.fromTL(amount, currency);
}

/**
 * @deprecated Legacy Money → number dönüşümü
 * Yeni kod Money tipi kullanmalı
 */
export function legacyMoneyToNumber(m: Money): number {
  return MoneyUtils.toTL(m);
}
