/**
 * Task 4.3 - Coverage Map Builder
 * 
 * Rate Provider'ın çıktısı sadece "oran listesi" değil;
 * yanında "coverage map" verir:
 * - coveragePercent
 * - totalDays
 * - coveredDays
 * - gaps[]
 * - overlaps[]
 * - hasInferredRates
 */

import { RateEntry } from './rate-entry.entity';
import { DateRange } from '../types/common.types';

// ═══════════════════════════════════════════════════════════════════════════
// COVERAGE MAP TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface RateGap {
  from: string;
  to: string;
  days: number;
}

export interface RateOverlap {
  date: string;
  entries: string[]; // Rate entry IDs
}

export interface CoverageMap {
  coveragePercent: number;      // 0-100
  totalDays: number;
  coveredDays: number;
  gaps: RateGap[];
  overlaps: RateOverlap[];
  hasInferredRates: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE QUERY RESULT (Enhanced)
// ═══════════════════════════════════════════════════════════════════════════

export interface RateQueryResult {
  rates: RateEntry[];
  hasGaps: boolean;
  gaps: RateGap[];
  rateTableVersion: string;
  coverage: CoverageMap;
}


// ═══════════════════════════════════════════════════════════════════════════
// COVERAGE MAP BUILDER
// ═══════════════════════════════════════════════════════════════════════════

export class CoverageMapBuilder {
  /**
   * Build coverage map for a period
   * 
   * @param rates - Rate entries for the period
   * @param startDate - Period start (inclusive)
   * @param endDate - Period end (exclusive)
   */
  static build(
    rates: RateEntry[],
    startDate: string,
    endDate: string,
  ): CoverageMap {
    const totalDays = this.calculateDays(startDate, endDate);
    
    if (totalDays <= 0) {
      return {
        coveragePercent: 0,
        totalDays: 0,
        coveredDays: 0,
        gaps: [],
        overlaps: [],
        hasInferredRates: false,
      };
    }

    if (rates.length === 0) {
      return {
        coveragePercent: 0,
        totalDays,
        coveredDays: 0,
        gaps: [{ from: startDate, to: endDate, days: totalDays }],
        overlaps: [],
        hasInferredRates: false,
      };
    }

    // Sort rates by validFrom
    const sortedRates = [...rates].sort((a, b) => 
      a.validFrom.localeCompare(b.validFrom)
    );

    const gaps: RateGap[] = [];
    const overlaps: RateOverlap[] = [];
    let coveredDays = 0;
    let currentDate = startDate;

    // Detect gaps and calculate coverage
    for (const rate of sortedRates) {
      const rateStart = rate.validFrom > startDate ? rate.validFrom : startDate;
      const rateEnd = rate.validTo 
        ? (rate.validTo < endDate ? rate.validTo : endDate)
        : endDate;

      // Check for gap before this rate
      if (rateStart > currentDate) {
        const gapDays = this.calculateDays(currentDate, rateStart);
        if (gapDays > 0) {
          gaps.push({
            from: currentDate,
            to: rateStart,
            days: gapDays,
          });
        }
      }

      // Calculate covered days for this rate
      if (rateEnd > currentDate) {
        const effectiveStart = rateStart > currentDate ? rateStart : currentDate;
        const segmentDays = this.calculateDays(effectiveStart, rateEnd);
        coveredDays += Math.max(0, segmentDays);
        currentDate = rateEnd;
      }
    }

    // Check for gap after last rate
    if (currentDate < endDate) {
      const gapDays = this.calculateDays(currentDate, endDate);
      if (gapDays > 0) {
        gaps.push({
          from: currentDate,
          to: endDate,
          days: gapDays,
        });
      }
    }

    // Detect overlaps
    for (let i = 0; i < sortedRates.length - 1; i++) {
      const current = sortedRates[i];
      const next = sortedRates[i + 1];
      
      const currentEnd = current.validTo || endDate;
      
      // If current rate ends after next rate starts, there's an overlap
      if (currentEnd > next.validFrom) {
        overlaps.push({
          date: next.validFrom,
          entries: [current.id, next.id],
        });
      }
    }

    // Ensure coveredDays doesn't exceed totalDays
    coveredDays = Math.min(coveredDays, totalDays);

    const coveragePercent = totalDays > 0 
      ? Math.round((coveredDays / totalDays) * 100) 
      : 0;

    return {
      coveragePercent,
      totalDays,
      coveredDays,
      gaps,
      overlaps,
      hasInferredRates: false, // Will be set by caller if inferred rates used
    };
  }

  /**
   * Calculate days between two dates [start, end)
   */
  private static calculateDays(startDate: string, endDate: string): number {
    const start = new Date(startDate + 'T00:00:00+03:00');
    const end = new Date(endDate + 'T00:00:00+03:00');
    return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if coverage is complete (no gaps)
   */
  static isComplete(coverage: CoverageMap): boolean {
    return coverage.gaps.length === 0 && coverage.coveragePercent === 100;
  }

  /**
   * Check if coverage has critical issues
   */
  static hasCriticalIssues(coverage: CoverageMap): boolean {
    return coverage.gaps.length > 0 || coverage.hasInferredRates;
  }
}
