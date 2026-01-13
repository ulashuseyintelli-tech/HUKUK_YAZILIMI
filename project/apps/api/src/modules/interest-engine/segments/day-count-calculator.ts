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

// Istanbul timezone offset (+03:00)
const ISTANBUL_OFFSET = '+03:00';

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
 * Parse date string to Istanbul timezone Date object
 * Always uses 00:00:00 (date-only)
 */
export function parseIstanbulDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00${ISTANBUL_OFFSET}`);
}


/**
 * Add days to a date string
 */
export function addDays(dateStr: string, days: number): string {
  const date = parseIstanbulDate(dateStr);
  date.setDate(date.getDate() + days);
  return formatIstanbulDate(date);
}

/**
 * Format Date object to ISO date string (YYYY-MM-DD)
 */
export function formatIstanbulDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
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
