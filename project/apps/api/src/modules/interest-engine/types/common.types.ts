/**
 * Task 1.1 - Ortak Tipler (Money, DateRange, PercentRate, Hash)
 * 
 * Kurallar:
 * - Primitive hell yok, her şey tek kaynaktan
 * - Immutable yapılar
 * - Validation içeride
 */

import { InterestEngineError, InterestEngineErrorCode } from '../errors/interest-engine-errors';

// ═══════════════════════════════════════════════════════════════════════════
// CURRENCY
// ═══════════════════════════════════════════════════════════════════════════

export type Currency = 'TRY' | 'USD' | 'EUR' | 'GBP' | 'CHF';

export const CURRENCY_MINOR_UNITS: Record<Currency, number> = {
  TRY: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  CHF: 2,
};

// ═══════════════════════════════════════════════════════════════════════════
// MONEY (Immutable)
// ═══════════════════════════════════════════════════════════════════════════

export class Money {
  private constructor(
    public readonly amount: number,
    public readonly currency: Currency,
  ) {
    Object.freeze(this);
  }

  static of(amount: number, currency: Currency): Money {
    if (!Number.isFinite(amount)) {
      throw InterestEngineError.invalidAmount(amount);
    }
    return new Money(amount, currency);
  }

  static zero(currency: Currency): Money {
    return new Money(0, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount - other.amount, this.currency);
  }

  multiply(factor: number): Money {
    if (!Number.isFinite(factor)) {
      throw InterestEngineError.invalidAmount(factor);
    }
    return new Money(this.amount * factor, this.currency);
  }

  divide(divisor: number): Money {
    if (divisor === 0) {
      throw InterestEngineError.divisionByZero();
    }
    if (!Number.isFinite(divisor)) {
      throw InterestEngineError.invalidAmount(divisor);
    }
    return new Money(this.amount / divisor, this.currency);
  }

  /**
   * Yuvarlama - dışarıdan parametre ile
   */
  round(mode: RoundingMode = RoundingMode.HALF_UP): Money {
    const minorUnits = CURRENCY_MINOR_UNITS[this.currency];
    const factor = Math.pow(10, minorUnits);
    let rounded: number;

    switch (mode) {
      case RoundingMode.HALF_UP:
        rounded = Math.round(this.amount * factor) / factor;
        break;
      case RoundingMode.BANKERS:
        rounded = this.bankersRound(this.amount * factor) / factor;
        break;
      default:
        rounded = Math.round(this.amount * factor) / factor;
    }

    return new Money(rounded, this.currency);
  }

  isPositive(): boolean {
    return this.amount > 0;
  }

  isNegative(): boolean {
    return this.amount < 0;
  }

  isZero(): boolean {
    return this.amount === 0;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount;
  }

  compareTo(other: Money): number {
    this.assertSameCurrency(other);
    return this.amount - other.amount;
  }

  toString(): string {
    const minorUnits = CURRENCY_MINOR_UNITS[this.currency];
    return `${this.amount.toFixed(minorUnits)} ${this.currency}`;
  }

  toJSON(): { amount: number; currency: Currency } {
    return { amount: this.amount, currency: this.currency };
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw InterestEngineError.currencyMismatch(this.currency, other.currency);
    }
  }

  private bankersRound(value: number): number {
    const rounded = Math.round(value);
    if (Math.abs(value - rounded + 0.5) < Number.EPSILON) {
      // Exactly halfway - round to even
      return rounded % 2 === 0 ? rounded : rounded - 1;
    }
    return rounded;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DATE RANGE (Canonical: [start, end))
// ═══════════════════════════════════════════════════════════════════════════

export class DateRange {
  private constructor(
    public readonly start: string, // ISO date (YYYY-MM-DD)
    public readonly end: string,   // ISO date (YYYY-MM-DD)
  ) {
    Object.freeze(this);
  }

  /**
   * Canonical: [start, end) - start dahil, end hariç
   */
  static of(start: string, end: string): DateRange {
    if (!DateRange.isValidDate(start)) {
      throw InterestEngineError.invalidDateFormat(start);
    }
    if (!DateRange.isValidDate(end)) {
      throw InterestEngineError.invalidDateFormat(end);
    }
    if (end <= start) {
      throw InterestEngineError.invalidDateRange(start, end);
    }
    return new DateRange(start, end);
  }

  /**
   * Gün sayısı: [start, end) - start dahil, end hariç
   */
  days(): number {
    const startMs = new Date(this.start + 'T00:00:00+03:00').getTime();
    const endMs = new Date(this.end + 'T00:00:00+03:00').getTime();
    const days = Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24));
    // Negatif olamaz (constructor'da kontrol edildi)
    return days;
  }

  /**
   * Tarih bu aralıkta mı? [start, end)
   */
  contains(date: string): boolean {
    return date >= this.start && date < this.end;
  }

  /**
   * İki aralık örtüşüyor mu?
   */
  overlaps(other: DateRange): boolean {
    return this.start < other.end && other.start < this.end;
  }

  /**
   * Bu aralık diğerini tamamen kapsıyor mu?
   */
  encompasses(other: DateRange): boolean {
    return this.start <= other.start && this.end >= other.end;
  }

  toString(): string {
    return `[${this.start}, ${this.end})`;
  }

  toJSON(): { start: string; end: string } {
    return { start: this.start, end: this.end };
  }

  private static isValidDate(date: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const d = new Date(date);
    return !isNaN(d.getTime());
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PERCENT RATE (0 ≤ rate ≤ 1.0)
// ═══════════════════════════════════════════════════════════════════════════

export class PercentRate {
  private constructor(
    public readonly value: number, // 0.425 = %42.5
  ) {
    Object.freeze(this);
  }

  /**
   * Oran olarak oluştur (0.425 = %42.5)
   */
  static of(rate: number): PercentRate {
    if (!Number.isFinite(rate)) {
      throw InterestEngineError.invalidRate(rate);
    }
    if (rate < 0 || rate > 1.0) {
      throw InterestEngineError.invalidRate(rate);
    }
    return new PercentRate(rate);
  }

  /**
   * Yüzde olarak oluştur (42.5 = %42.5)
   */
  static fromPercent(percent: number): PercentRate {
    return PercentRate.of(percent / 100);
  }

  /**
   * Yüzde olarak değer (42.5)
   */
  toPercent(): number {
    return this.value * 100;
  }

  /**
   * Oran olarak değer (0.425)
   */
  toDecimal(): number {
    return this.value;
  }

  equals(other: PercentRate): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return `%${this.toPercent().toFixed(2)}`;
  }

  toJSON(): number {
    return this.value;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HASH (Version tracking)
// ═══════════════════════════════════════════════════════════════════════════

export class Hash {
  private constructor(
    public readonly value: string,
  ) {
    Object.freeze(this);
  }

  static of(value: string): Hash {
    if (!value || value.length === 0) {
      throw InterestEngineError.invalidHash('empty');
    }
    return new Hash(value);
  }

  equals(other: Hash): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUNDING
// ═══════════════════════════════════════════════════════════════════════════

export enum RoundingMode {
  HALF_UP = 'HALF_UP',     // 0.005 → 0.01
  BANKERS = 'BANKERS',     // 0.015 → 0.02, 0.025 → 0.02
}

export enum RoundingScope {
  PER_SEGMENT = 'PER_SEGMENT',   // Her segment ayrı yuvarlanır
  TOTAL_ONLY = 'TOTAL_ONLY',     // Sadece toplam yuvarlanır
}

// ═══════════════════════════════════════════════════════════════════════════
// CALCULATION MODE
// ═══════════════════════════════════════════════════════════════════════════

export enum CalculationMode {
  PREVIEW = 'PREVIEW',           // What-if, gap warning only
  PRODUCTION = 'PRODUCTION',     // Gerçek hesaplama, gap blocks
  LEGAL_REPORT = 'LEGAL_REPORT', // Mahkeme raporu, strictest
}

// ═══════════════════════════════════════════════════════════════════════════
// DAY COUNT BASIS
// ═══════════════════════════════════════════════════════════════════════════

export type DayCountBasis = 365 | 360;

export enum SameDayPaymentRule {
  END_OF_DAY = 'END_OF_DAY',     // Ödeme günü faiz işler
  START_OF_DAY = 'START_OF_DAY', // Ödeme günü faiz işlemez
}


// ═══════════════════════════════════════════════════════════════════════════
// ID GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a CUID-like unique identifier
 * Simple implementation for testing - use cuid2 in production
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `c${timestamp}${randomPart}`;
}
