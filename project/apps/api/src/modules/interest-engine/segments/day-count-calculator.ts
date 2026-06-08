/**
 * Task 5.2 - Day Count Calculator
 * 
 * CANONICAL RULE: [start, end) - Start inclusive, end exclusive
 * Timezone: Europe/Istanbul (date-only, 00:00:00)
 * 
 * Segment Boundary Rules (Hukuki Mayın Tarlası Çözümü):
 * 
 * 1. Day Count: [start, end) - Başlangıç dahil, bitiş hariç
 *    Örnek: 01.01.2025 → 05.01.2025 = 4 gün
 * 
 * 2. Rate Change Boundary: Oran değişim günü YENİ orana dahil
 *    Örnek: 20.12.2025'te oran değişti → 20.12.2025 yeni oranla hesaplanır
 *    Segment 1: [start, 20.12.2025) eski oran
 *    Segment 2: [20.12.2025, end) yeni oran
 * 
 * 3. Payment Boundary (sameDayPaymentRule):
 *    - END_OF_DAY: Ödeme günü faiz işler, ödeme gün sonunda uygulanır
 *    - START_OF_DAY: Ödeme günü faiz işlemez, ödeme gün başında uygulanır
 * 
 * 4. Enforcement Date Boundary: Takip tarihi POST_ENFORCEMENT'a dahil
 *    PRE_ENFORCEMENT: [start, enforcement_date)
 *    POST_ENFORCEMENT: [enforcement_date, end)
 */

import { SameDayPaymentRule, DayCountBasis } from '../types/common.types';

/**
 * Calculate days between two dates using canonical [start, end) rule
 * Start inclusive, end exclusive
 */
export function calculateDays(startDate: string, endDate: string): number {
  const start = parseIstanbulDate(startDate);
  const end = parseIstanbulDate(endDate);
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Parse a YYYY-MM-DD string to a Date anchored at UTC midnight.
 *
 * TZ-INVARIANT (PR-3): The calendar date (Y-M-D) is pinned at UTC midnight so that
 * UTC getters/setters and formatIstanbulDate yield identical results on any
 * server timezone (Istanbul, UTC, ...). The legal "Istanbul date" semantics are
 * preserved — only the internal anchor moved from +03:00 to UTC for determinism.
 * (calculateDays is unaffected: both endpoints share the anchor, so the day diff is identical.)
 */
export function parseIstanbulDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}


/**
 * Add days to a date string
 */
export function addDays(dateStr: string, days: number): string {
  const date = parseIstanbulDate(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIstanbulDate(date);
}

/**
 * Format Date object to ISO date string (YYYY-MM-DD)
 */
export function formatIstanbulDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if date is within range [start, end)
 */
export function isDateInRange(date: string, start: string, end: string): boolean {
  return date >= start && date < end;
}

/**
 * Get day count rule string for reporting
 */
export function getDayCountRuleString(basis: DayCountBasis): string {
  return `Actual/${basis}`;
}

/**
 * Adjust end date based on same-day payment rule
 * 
 * END_OF_DAY: Payment day accrues interest (segment ends after payment day)
 * START_OF_DAY: Payment day does not accrue interest (segment ends on payment day)
 */
export function adjustEndDateForPayment(
  paymentDate: string,
  rule: SameDayPaymentRule,
): string {
  if (rule === SameDayPaymentRule.END_OF_DAY) {
    // Include payment day in interest calculation
    return addDays(paymentDate, 1);
  }
  // START_OF_DAY: Exclude payment day
  return paymentDate;
}

/**
 * Determine segment phase based on enforcement date
 * 
 * PRE_ENFORCEMENT: [start, enforcement_date)
 * POST_ENFORCEMENT: [enforcement_date, end)
 */
export function determinePhase(
  segmentStart: string,
  segmentEnd: string,
  enforcementDate?: string,
): 'PRE_ENFORCEMENT' | 'POST_ENFORCEMENT' | undefined {
  if (!enforcementDate) {
    return undefined;
  }

  // Segment tamamen takip tarihinden önce
  if (segmentEnd <= enforcementDate) {
    return 'PRE_ENFORCEMENT';
  }

  // Segment tamamen takip tarihinden sonra veya takip tarihinde başlıyor
  if (segmentStart >= enforcementDate) {
    return 'POST_ENFORCEMENT';
  }

  // Segment takip tarihini kapsıyor - bu durumda POST olarak işaretle
  // (timeline zaten enforcementDate'te bölünmüş olmalı)
  return 'POST_ENFORCEMENT';
}

/**
 * Validate date range
 */
export function validateDateRange(startDate: string, endDate: string): {
  valid: boolean;
  days: number;
  error?: string;
} {
  const days = calculateDays(startDate, endDate);

  if (days < 0) {
    return {
      valid: false,
      days,
      error: `Negatif gün sayısı: ${days} (${startDate} → ${endDate})`,
    };
  }

  return { valid: true, days };
}
