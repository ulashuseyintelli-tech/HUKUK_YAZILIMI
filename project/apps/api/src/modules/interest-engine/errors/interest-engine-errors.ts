/**
 * Task 17.1 - Error Taxonomy + Evidence Schema
 * 
 * Kurallar:
 * - Her error 3 şey taşır: errorCode, message, evidence
 * - Evidence olmadan error throw edilemez
 * - Appendix B'deki 12 error code
 */

// ═══════════════════════════════════════════════════════════════════════════
// ERROR CODES (Appendix B)
// ═══════════════════════════════════════════════════════════════════════════

export enum InterestEngineErrorCode {
  // Rate Errors
  E_RATE_GAP = 'E_RATE_GAP',
  E_RATE_OVERLAP = 'E_RATE_OVERLAP',
  E_INFERRED_RATE = 'E_INFERRED_RATE',
  
  // Date Errors
  E_NEGATIVE_DAYS = 'E_NEGATIVE_DAYS',
  E_ZERO_DAYS = 'E_ZERO_DAYS',
  E_INVALID_DATE_RANGE = 'E_INVALID_DATE_RANGE',
  E_INVALID_DATE_FORMAT = 'E_INVALID_DATE_FORMAT',
  
  // Validation Errors
  E_IBRAZ_BEFORE_VADE = 'E_IBRAZ_BEFORE_VADE',
  E_EXCESSIVE_RATE = 'E_EXCESSIVE_RATE',
  E_INTEREST_ANOMALY = 'E_INTEREST_ANOMALY',
  E_LONG_SEGMENT = 'E_LONG_SEGMENT',
  E_MISSING_REQUIRED = 'E_MISSING_REQUIRED',
  // E-G2a/Q3: oran ZORUNLU ama YOK (E_INVALID_RATE'ten ayrı: o "oran var ama geçersiz").
  E_FIXED_RATE_REQUIRED = 'E_FIXED_RATE_REQUIRED',
  E_INVALID_CURRENCY = 'E_INVALID_CURRENCY',
  E_ALLOCATION_OVERFLOW = 'E_ALLOCATION_OVERFLOW',
  
  // Common Errors
  E_CURRENCY_MISMATCH = 'E_CURRENCY_MISMATCH',
  E_INVALID_RATE = 'E_INVALID_RATE',
  E_INVALID_AMOUNT = 'E_INVALID_AMOUNT',
  E_DIVISION_BY_ZERO = 'E_DIVISION_BY_ZERO',
  E_INVALID_HASH = 'E_INVALID_HASH',
  
  // Version Errors
  E_VERSION_NOT_PINNED = 'E_VERSION_NOT_PINNED',
}


// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE TYPES (Appendix B - Zorunlu alanlar)
// ═══════════════════════════════════════════════════════════════════════════

export interface RateGapEvidence {
  gaps: Array<{ from: string; to: string; days: number }>;
}

export interface RateOverlapEvidence {
  overlaps: Array<{ date: string; entries: string[] }>;
}

export interface InferredRateEvidence {
  inferredPeriod: { from: string; to: string };
}

export interface NegativeDaysEvidence {
  startDate: string;
  endDate: string;
  calculatedDays: number;
}

export interface ZeroDaysEvidence {
  startDate: string;
  endDate: string;
}

export interface IbrazBeforeVadeEvidence {
  ibrazDate: string;
  vadeDate: string;
}

export interface ExcessiveRateEvidence {
  contractRate: number;
  legalRate: number;
  ratio: number;
}

export interface InterestAnomalyEvidence {
  effectiveRate: number;
  expectedMin: number;
  expectedMax: number;
}

export interface LongSegmentEvidence {
  segmentDays: number;
  rateCount: number;
}

export interface MissingRequiredEvidence {
  missingFields: string[];
}

export interface FixedRateRequiredEvidence {
  claimId: string;
  interestType: string;
}

export interface InvalidCurrencyEvidence {
  providedCurrency: string;
  allowedCurrencies: string[];
}

export interface AllocationOverflowEvidence {
  paymentAmount: number;
  totalDebt: number;
  overflow: number;
}

export interface CurrencyMismatchEvidence {
  currency1: string;
  currency2: string;
}

export interface InvalidRateEvidence {
  providedRate: number;
  validRange: { min: number; max: number };
}

export interface InvalidDateRangeEvidence {
  startDate: string;
  endDate: string;
}

export interface VersionNotPinnedEvidence {
  mode: string;
  missingVersions: string[];
}

// Union type for all evidence
export type ErrorEvidence =
  | RateGapEvidence
  | RateOverlapEvidence
  | InferredRateEvidence
  | NegativeDaysEvidence
  | ZeroDaysEvidence
  | IbrazBeforeVadeEvidence
  | ExcessiveRateEvidence
  | InterestAnomalyEvidence
  | LongSegmentEvidence
  | MissingRequiredEvidence
  | FixedRateRequiredEvidence
  | InvalidCurrencyEvidence
  | AllocationOverflowEvidence
  | CurrencyMismatchEvidence
  | InvalidRateEvidence
  | InvalidDateRangeEvidence
  | VersionNotPinnedEvidence
  | Record<string, unknown>;


// ═══════════════════════════════════════════════════════════════════════════
// INTEREST ENGINE ERROR CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class InterestEngineError extends Error {
  constructor(
    public readonly code: InterestEngineErrorCode,
    message: string,
    public readonly evidence: ErrorEvidence,
  ) {
    super(message);
    this.name = 'InterestEngineError';
    Object.freeze(this.evidence);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      evidence: this.evidence,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FACTORY METHODS (Evidence zorunlu)
  // ═══════════════════════════════════════════════════════════════════════════

  static rateGap(gaps: Array<{ from: string; to: string; days: number }>): InterestEngineError {
    const totalDays = gaps.reduce((sum, g) => sum + g.days, 0);
    return new InterestEngineError(
      InterestEngineErrorCode.E_RATE_GAP,
      `Oran tablosunda ${gaps.length} boşluk tespit edildi (toplam ${totalDays} gün)`,
      { gaps },
    );
  }

  static rateOverlap(overlaps: Array<{ date: string; entries: string[] }>): InterestEngineError {
    return new InterestEngineError(
      InterestEngineErrorCode.E_RATE_OVERLAP,
      `Oran tablosunda ${overlaps.length} çakışma tespit edildi`,
      { overlaps },
    );
  }

  static inferredRate(from: string, to: string): InterestEngineError {
    return new InterestEngineError(
      InterestEngineErrorCode.E_INFERRED_RATE,
      `Varsayılan oran kullanıldı (${from} - ${to}) - mahkeme modunda kabul edilmez`,
      { inferredPeriod: { from, to } },
    );
  }

  static negativeDays(startDate: string, endDate: string, calculatedDays: number): InterestEngineError {
    return new InterestEngineError(
      InterestEngineErrorCode.E_NEGATIVE_DAYS,
      `Negatif gün sayısı: ${calculatedDays} (${startDate} → ${endDate})`,
      { startDate, endDate, calculatedDays },
    );
  }

  static zeroDays(startDate: string, endDate: string): InterestEngineError {
    return new InterestEngineError(
      InterestEngineErrorCode.E_ZERO_DAYS,
      `Sıfır gün faiz hesabı (${startDate} → ${endDate})`,
      { startDate, endDate },
    );
  }

  static ibrazBeforeVade(ibrazDate: string, vadeDate: string): InterestEngineError {
    return new InterestEngineError(
      InterestEngineErrorCode.E_IBRAZ_BEFORE_VADE,
      `İbraz tarihi (${ibrazDate}) vade tarihinden (${vadeDate}) önce olamaz`,
      { ibrazDate, vadeDate },
    );
  }

  static excessiveRate(contractRate: number, legalRate: number): InterestEngineError {
    const ratio = contractRate / legalRate;
    return new InterestEngineError(
      InterestEngineErrorCode.E_EXCESSIVE_RATE,
      `Sözleşmesel faiz (%${(contractRate * 100).toFixed(2)}) yasal faizin ${ratio.toFixed(1)} katı`,
      { contractRate, legalRate, ratio },
    );
  }

  static interestAnomaly(effectiveRate: number, expectedMin: number, expectedMax: number): InterestEngineError {
    return new InterestEngineError(
      InterestEngineErrorCode.E_INTEREST_ANOMALY,
      `Hesaplanan faiz oranı (%${(effectiveRate * 100).toFixed(2)}) beklenen aralık dışında (%${(expectedMin * 100).toFixed(0)}-%${(expectedMax * 100).toFixed(0)})`,
      { effectiveRate, expectedMin, expectedMax },
    );
  }

  static longSegment(segmentDays: number, rateCount: number): InterestEngineError {
    return new InterestEngineError(
      InterestEngineErrorCode.E_LONG_SEGMENT,
      `${segmentDays} günlük segment tek oranla hesaplandı - oran değişikliği eksik olabilir`,
      { segmentDays, rateCount },
    );
  }

  static missingRequired(missingFields: string[]): InterestEngineError {
    return new InterestEngineError(
      InterestEngineErrorCode.E_MISSING_REQUIRED,
      `Zorunlu alanlar eksik: ${missingFields.join(', ')}`,
      { missingFields },
    );
  }

  static invalidCurrency(providedCurrency: string, allowedCurrencies: string[]): InterestEngineError {
    return new InterestEngineError(
      InterestEngineErrorCode.E_INVALID_CURRENCY,
      `Geçersiz para birimi: ${providedCurrency}. İzin verilenler: ${allowedCurrencies.join(', ')}`,
      { providedCurrency, allowedCurrencies },
    );
  }

  static allocationOverflow(paymentAmount: number, totalDebt: number): InterestEngineError {
    const overflow = paymentAmount - totalDebt;
    return new InterestEngineError(
      InterestEngineErrorCode.E_ALLOCATION_OVERFLOW,
      `Ödeme tutarı (${paymentAmount}) toplam borcu (${totalDebt}) aşıyor`,
      { paymentAmount, totalDebt, overflow },
    );
  }

  static currencyMismatch(currency1: string, currency2: string): InterestEngineError {
    return new InterestEngineError(
      InterestEngineErrorCode.E_CURRENCY_MISMATCH,
      `Para birimi uyuşmazlığı: ${currency1} vs ${currency2}`,
      { currency1, currency2 },
    );
  }

  static invalidRate(providedRate: number): InterestEngineError {
    return new InterestEngineError(
      InterestEngineErrorCode.E_INVALID_RATE,
      `Geçersiz oran: ${providedRate}. Oran 0-1 arasında olmalı`,
      { providedRate, validRange: { min: 0, max: 1 } },
    );
  }

  static invalidAmount(amount: number): InterestEngineError {
    return new InterestEngineError(
      InterestEngineErrorCode.E_INVALID_AMOUNT,
      `Geçersiz tutar: ${amount}`,
      { amount },
    );
  }

  static divisionByZero(): InterestEngineError {
    return new InterestEngineError(
      InterestEngineErrorCode.E_DIVISION_BY_ZERO,
      'Sıfıra bölme hatası',
      {},
    );
  }

  static invalidDateFormat(date: string): InterestEngineError {
    return new InterestEngineError(
      InterestEngineErrorCode.E_INVALID_DATE_FORMAT,
      `Geçersiz tarih formatı: ${date}. Beklenen: YYYY-MM-DD`,
      { date },
    );
  }

  static invalidDateRange(startDate: string, endDate: string): InterestEngineError {
    return new InterestEngineError(
      InterestEngineErrorCode.E_INVALID_DATE_RANGE,
      `Geçersiz tarih aralığı: bitiş (${endDate}) başlangıçtan (${startDate}) önce veya eşit`,
      { startDate, endDate },
    );
  }

  static invalidHash(value: string): InterestEngineError {
    return new InterestEngineError(
      InterestEngineErrorCode.E_INVALID_HASH,
      `Geçersiz hash değeri: ${value}`,
      { value },
    );
  }

  static versionNotPinned(mode: string, missingVersions: string[]): InterestEngineError {
    return new InterestEngineError(
      InterestEngineErrorCode.E_VERSION_NOT_PINNED,
      `${mode} modunda version pinlenmesi zorunlu. Eksik: ${missingVersions.join(', ')}`,
      { mode, missingVersions },
    );
  }
}
