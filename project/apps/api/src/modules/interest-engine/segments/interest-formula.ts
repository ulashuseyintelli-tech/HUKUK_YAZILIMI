/**
 * Task 5.3 - Interest Formula (Tek Kaynak Fonksiyon)
 * 
 * Formula: principal * annualRate * days / dayCountBasis
 * 
 * Bu dosya faiz hesaplamasının TEK KAYNAĞI.
 * Başka hiçbir yerde bu formül tekrarlanmamalı.
 */

import { DayCountBasis, RoundingMode, RoundingScope } from '../types/common.types';

/**
 * Calculate interest for a single segment
 * 
 * Formula: principal * annualRate * days / dayCountBasis
 * 
 * @param principal - Anapara tutarı
 * @param annualRate - Yıllık oran (decimal, e.g., 0.425 for %42.5)
 * @param days - Gün sayısı
 * @param dayCountBasis - Gün sayımı bazı (365 veya 360)
 * @returns Segment faizi (yuvarlanmamış)
 */
export function calculateSegmentInterest(
  principal: number,
  annualRate: number,
  days: number,
  dayCountBasis: DayCountBasis = 365,
): number {
  if (days <= 0 || principal <= 0 || annualRate < 0) {
    return 0;
  }

  return (principal * annualRate * days) / dayCountBasis;
}

/**
 * Round monetary value based on rounding mode
 * 
 * @param value - Değer
 * @param mode - Yuvarlama modu
 * @param decimals - Ondalık basamak sayısı (default: 2)
 */
export function roundMoney(
  value: number,
  mode: RoundingMode = RoundingMode.HALF_UP,
  decimals: number = 2,
): number {
  const factor = Math.pow(10, decimals);

  switch (mode) {
    case RoundingMode.HALF_UP:
      return Math.round(value * factor) / factor;

    case RoundingMode.BANKERS:
      return bankersRound(value * factor) / factor;

    default:
      return Math.round(value * factor) / factor;
  }
}

/**
 * Bankers rounding (round half to even)
 * 0.5 → 0, 1.5 → 2, 2.5 → 2, 3.5 → 4
 */
function bankersRound(value: number): number {
  const rounded = Math.round(value);
  
  // Check if exactly halfway
  if (Math.abs(value - rounded + 0.5) < Number.EPSILON) {
    // Round to even
    return rounded % 2 === 0 ? rounded : rounded - 1;
  }
  
  return rounded;
}


/**
 * Calculate total interest from segments with rounding scope
 * 
 * PER_SEGMENT: Her segment ayrı yuvarlanır, sonra toplanır
 * TOTAL_ONLY: Segmentler ham toplanır, sadece toplam yuvarlanır
 */
export function calculateTotalInterest(
  segmentInterests: number[],
  roundingMode: RoundingMode,
  roundingScope: RoundingScope,
): { total: number; roundingDifference: number } {
  if (roundingScope === RoundingScope.PER_SEGMENT) {
    // Round each segment, then sum
    const roundedSegments = segmentInterests.map(i => roundMoney(i, roundingMode));
    const total = roundedSegments.reduce((sum, i) => sum + i, 0);
    const rawTotal = segmentInterests.reduce((sum, i) => sum + i, 0);
    
    return {
      total: roundMoney(total, roundingMode),
      roundingDifference: roundMoney(total - rawTotal, roundingMode, 4),
    };
  }

  // TOTAL_ONLY: Sum raw values, round only the total
  const rawTotal = segmentInterests.reduce((sum, i) => sum + i, 0);
  const roundedTotal = roundMoney(rawTotal, roundingMode);

  return {
    total: roundedTotal,
    roundingDifference: roundMoney(roundedTotal - rawTotal, roundingMode, 4),
  };
}

/**
 * Calculate effective annual rate from interest calculation
 * 
 * Useful for sanity checks and anomaly detection
 */
export function calculateEffectiveRate(
  principal: number,
  totalInterest: number,
  days: number,
  dayCountBasis: DayCountBasis = 365,
): number {
  if (days <= 0 || principal <= 0) {
    return 0;
  }

  return (totalInterest / principal) * (dayCountBasis / days);
}

/**
 * Verify segment interest formula correctness
 * 
 * Property 2: Segment Interest Formula Correctness
 * For any segment, interest = P * R * D / B (within tolerance)
 */
export function verifySegmentInterest(
  principal: number,
  annualRate: number,
  days: number,
  dayCountBasis: DayCountBasis,
  calculatedInterest: number,
  tolerance: number = 0.01,
): boolean {
  const expected = calculateSegmentInterest(principal, annualRate, days, dayCountBasis);
  return Math.abs(calculatedInterest - expected) <= tolerance;
}
