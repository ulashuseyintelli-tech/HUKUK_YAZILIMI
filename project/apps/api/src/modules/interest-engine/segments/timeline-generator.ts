/**
 * Task 5.1 - Timeline Generator
 * 
 * Timeline kritik tarihleri içerir:
 * 1. startDate (faiz başlangıcı)
 * 2. endDate (hesap tarihi)
 * 3. Rate change dates (oran değişim tarihleri)
 * 4. enforcementDate (takip tarihi - varsa)
 * 5. Payment dates (ödeme tarihleri - varsa)
 */

import { RateEntry } from '../rates/rate-entry.entity';
import { SameDayPaymentRule } from '../types/common.types';
import { adjustEndDateForPayment } from './day-count-calculator';

export interface TimelineOptions {
  enforcementDate?: string;
  paymentDates?: string[];
  sameDayPaymentRule?: SameDayPaymentRule;
}

/**
 * Generate timeline of critical dates for segment building
 * 
 * Returns sorted array of unique dates that define segment boundaries
 */
export function generateTimeline(
  startDate: string,
  endDate: string,
  rates: RateEntry[],
  options: TimelineOptions = {},
): string[] {
  const dates = new Set<string>();

  // 1. Add start and end dates
  dates.add(startDate);
  dates.add(endDate);

  // 2. Add enforcement date if within range
  if (options.enforcementDate) {
    const enforcement = options.enforcementDate;
    if (enforcement > startDate && enforcement < endDate) {
      dates.add(enforcement);
    }
  }

  // 3. Add rate change dates (validFrom)
  for (const rate of rates) {
    // Rate change date creates a segment boundary
    // New rate applies FROM this date (inclusive)
    if (rate.validFrom > startDate && rate.validFrom <= endDate) {
      dates.add(rate.validFrom);
    }
  }

  // 4. Add payment dates if provided
  if (options.paymentDates) {
    const rule = options.sameDayPaymentRule || SameDayPaymentRule.END_OF_DAY;
    
    for (const paymentDate of options.paymentDates) {
      if (paymentDate > startDate && paymentDate < endDate) {
        // Adjust based on same-day payment rule
        const adjustedDate = adjustEndDateForPayment(paymentDate, rule);
        if (adjustedDate > startDate && adjustedDate <= endDate) {
          dates.add(adjustedDate);
        }
      }
    }
  }

  // Sort dates chronologically
  return Array.from(dates).sort();
}


/**
 * Get timeline segment pairs for iteration
 * 
 * Returns array of [start, end] pairs for each segment
 */
export function getTimelineSegments(timeline: string[]): Array<[string, string]> {
  const segments: Array<[string, string]> = [];

  for (let i = 0; i < timeline.length - 1; i++) {
    segments.push([timeline[i], timeline[i + 1]]);
  }

  return segments;
}

/**
 * Find rate applicable at a specific date
 * 
 * Rate is valid when: validFrom <= date AND (validTo is null OR validTo >= date)
 * Returns the most recent rate that starts on or before the date
 */
export function findRateForDate(date: string, rates: RateEntry[]): RateEntry | null {
  // Sort by validFrom descending (most recent first)
  const sortedRates = [...rates].sort((a, b) =>
    b.validFrom.localeCompare(a.validFrom)
  );

  // Find first rate where date >= validFrom
  for (const rate of sortedRates) {
    if (date >= rate.validFrom) {
      // Check if rate is still valid (validTo is null or >= date)
      if (!rate.validTo || rate.validTo >= date) {
        return rate;
      }
    }
  }

  // Fallback: return oldest rate if no exact match
  return rates.length > 0 ? rates[rates.length - 1] : null;
}

/**
 * Validate timeline integrity
 */
export function validateTimeline(timeline: string[]): {
  valid: boolean;
  error?: string;
} {
  if (timeline.length < 2) {
    return {
      valid: false,
      error: 'Timeline must have at least 2 dates (start and end)',
    };
  }

  // Check chronological order
  for (let i = 1; i < timeline.length; i++) {
    if (timeline[i] <= timeline[i - 1]) {
      return {
        valid: false,
        error: `Timeline dates not in order: ${timeline[i - 1]} >= ${timeline[i]}`,
      };
    }
  }

  return { valid: true };
}
