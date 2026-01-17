/**
 * Phase 5.6 - Rate Provider Semantic Contract (v1)
 * 
 * Domain invariants - "shape aynı ama anlam bozuldu" durumunu yakalar.
 * 
 * Kurallar:
 * 1. Segment tarihleri: start < end, canonical [start, end)
 * 2. Overlap yok: next.start >= current.end
 * 3. Rate: 0-100 arası, null/NaN yok
 * 4. Coverage: gap varsa explicit hasGaps=true
 * 
 * @see contracts/README.md
 */

import { RateEntry, CoverageInfo } from './schema';

// ============================================================================
// SEMANTIC VALIDATION RESULT
// ============================================================================

export interface SemanticViolation {
  rule: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
  context?: Record<string, unknown>;
}

export interface SemanticValidationResult {
  valid: boolean;
  violations: SemanticViolation[];
}

// ============================================================================
// RATE ENTRY SEMANTIC RULES
// ============================================================================

/**
 * Rule 1: start < end (tarih sırası)
 */
export function validateDateOrder(rate: RateEntry): SemanticViolation | null {
  if (rate.validTo === null) {
    // Open-ended is valid
    return null;
  }
  
  if (rate.validFrom >= rate.validTo) {
    return {
      rule: 'DATE_ORDER',
      message: `validFrom (${rate.validFrom}) must be before validTo (${rate.validTo})`,
      severity: 'ERROR',
      context: { rateId: rate.id, validFrom: rate.validFrom, validTo: rate.validTo },
    };
  }
  
  return null;
}

/**
 * Rule 2: Rate bounds (0-100)
 */
export function validateRateBounds(rate: RateEntry): SemanticViolation | null {
  if (rate.annualRate < 0) {
    return {
      rule: 'RATE_NEGATIVE',
      message: `annualRate (${rate.annualRate}) cannot be negative`,
      severity: 'ERROR',
      context: { rateId: rate.id, annualRate: rate.annualRate },
    };
  }
  
  if (rate.annualRate > 100) {
    return {
      rule: 'RATE_EXCEEDS_MAX',
      message: `annualRate (${rate.annualRate}) exceeds maximum (100)`,
      severity: 'WARNING', // Warning because some edge cases might exceed
      context: { rateId: rate.id, annualRate: rate.annualRate },
    };
  }
  
  if (Number.isNaN(rate.annualRate)) {
    return {
      rule: 'RATE_NAN',
      message: 'annualRate is NaN',
      severity: 'ERROR',
      context: { rateId: rate.id },
    };
  }
  
  return null;
}

/**
 * Rule 3: Currency is valid ISO 4217
 */
const ALLOWED_CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'CHF'];

export function validateCurrency(rate: RateEntry): SemanticViolation | null {
  if (!ALLOWED_CURRENCIES.includes(rate.currency)) {
    return {
      rule: 'INVALID_CURRENCY',
      message: `currency (${rate.currency}) not in allowed set: ${ALLOWED_CURRENCIES.join(', ')}`,
      severity: 'ERROR',
      context: { rateId: rate.id, currency: rate.currency },
    };
  }
  
  return null;
}

/**
 * Validate single rate entry
 */
export function validateRateEntry(rate: RateEntry): SemanticValidationResult {
  const violations: SemanticViolation[] = [];
  
  const dateOrderViolation = validateDateOrder(rate);
  if (dateOrderViolation) violations.push(dateOrderViolation);
  
  const rateBoundsViolation = validateRateBounds(rate);
  if (rateBoundsViolation) violations.push(rateBoundsViolation);
  
  const currencyViolation = validateCurrency(rate);
  if (currencyViolation) violations.push(currencyViolation);
  
  return {
    valid: violations.filter(v => v.severity === 'ERROR').length === 0,
    violations,
  };
}

// ============================================================================
// RATE COLLECTION SEMANTIC RULES
// ============================================================================

/**
 * Rule 4: No overlaps in rate collection
 */
export function validateNoOverlaps(rates: RateEntry[]): SemanticViolation[] {
  const violations: SemanticViolation[] = [];
  
  // Group by interestType + currency
  const groups = new Map<string, RateEntry[]>();
  for (const rate of rates) {
    const key = `${rate.interestType}:${rate.currency}`;
    const group = groups.get(key) || [];
    group.push(rate);
    groups.set(key, group);
  }
  
  // Check each group for overlaps
  for (const [key, group] of groups) {
    // Sort by validFrom
    const sorted = [...group].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      
      const currentEnd = current.validTo || '9999-12-31';
      
      if (next.validFrom < currentEnd) {
        violations.push({
          rule: 'OVERLAP_DETECTED',
          message: `Overlap between rate ${current.id} (ends ${currentEnd}) and ${next.id} (starts ${next.validFrom})`,
          severity: 'ERROR',
          context: {
            group: key,
            rate1: { id: current.id, validFrom: current.validFrom, validTo: current.validTo },
            rate2: { id: next.id, validFrom: next.validFrom, validTo: next.validTo },
          },
        });
      }
    }
  }
  
  return violations;
}

/**
 * Rule 5: Gaps must be explicit (if coverage info provided)
 */
export function validateGapsExplicit(
  rates: RateEntry[],
  coverage: CoverageInfo | null,
  queryStart: string,
  queryEnd: string,
): SemanticViolation[] {
  const violations: SemanticViolation[] = [];
  
  if (rates.length === 0) {
    // No rates = full gap, coverage should reflect this
    if (coverage && !coverage.hasGaps && coverage.coveredDays > 0) {
      violations.push({
        rule: 'SILENT_GAP',
        message: 'No rates but coverage.hasGaps is false',
        severity: 'ERROR',
        context: { coverage },
      });
    }
    return violations;
  }
  
  // Check for gaps in the rate collection
  const sorted = [...rates].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  
  // Check gap at start
  if (sorted[0].validFrom > queryStart) {
    const gapDays = daysBetween(queryStart, sorted[0].validFrom);
    if (coverage && !coverage.hasGaps && gapDays > 0) {
      violations.push({
        rule: 'SILENT_GAP_START',
        message: `Gap at start (${queryStart} to ${sorted[0].validFrom}) but hasGaps=false`,
        severity: 'ERROR',
        context: { gapStart: queryStart, gapEnd: sorted[0].validFrom, gapDays },
      });
    }
  }
  
  // Check gaps between rates
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    
    const currentEnd = current.validTo || '9999-12-31';
    
    if (next.validFrom > currentEnd) {
      const gapDays = daysBetween(currentEnd, next.validFrom);
      if (coverage && !coverage.hasGaps && gapDays > 0) {
        violations.push({
          rule: 'SILENT_GAP_MIDDLE',
          message: `Gap between rates (${currentEnd} to ${next.validFrom}) but hasGaps=false`,
          severity: 'ERROR',
          context: { gapStart: currentEnd, gapEnd: next.validFrom, gapDays },
        });
      }
    }
  }
  
  // Check gap at end
  const lastRate = sorted[sorted.length - 1];
  const lastEnd = lastRate.validTo || '9999-12-31';
  if (lastEnd < queryEnd) {
    const gapDays = daysBetween(lastEnd, queryEnd);
    if (coverage && !coverage.hasGaps && gapDays > 0) {
      violations.push({
        rule: 'SILENT_GAP_END',
        message: `Gap at end (${lastEnd} to ${queryEnd}) but hasGaps=false`,
        severity: 'ERROR',
        context: { gapStart: lastEnd, gapEnd: queryEnd, gapDays },
      });
    }
  }
  
  return violations;
}

/**
 * Rule 6: Coverage consistency
 */
export function validateCoverageConsistency(coverage: CoverageInfo): SemanticViolation[] {
  const violations: SemanticViolation[] = [];
  
  // coveredDays <= totalDays
  if (coverage.coveredDays > coverage.totalDays) {
    violations.push({
      rule: 'COVERAGE_EXCEEDS_TOTAL',
      message: `coveredDays (${coverage.coveredDays}) exceeds totalDays (${coverage.totalDays})`,
      severity: 'ERROR',
      context: { coveredDays: coverage.coveredDays, totalDays: coverage.totalDays },
    });
  }
  
  // percent consistency
  const expectedPercent = coverage.totalDays > 0 
    ? (coverage.coveredDays / coverage.totalDays) * 100 
    : 0;
  const tolerance = 0.1; // 0.1% tolerance
  
  if (Math.abs(coverage.percent - expectedPercent) > tolerance) {
    violations.push({
      rule: 'COVERAGE_PERCENT_MISMATCH',
      message: `percent (${coverage.percent}) doesn't match calculated (${expectedPercent.toFixed(2)})`,
      severity: 'WARNING',
      context: { reported: coverage.percent, calculated: expectedPercent },
    });
  }
  
  // hasGaps consistency
  if (coverage.hasGaps && (!coverage.gaps || coverage.gaps.length === 0)) {
    violations.push({
      rule: 'GAPS_FLAG_WITHOUT_DETAILS',
      message: 'hasGaps=true but gaps array is empty or missing',
      severity: 'WARNING',
      context: { hasGaps: coverage.hasGaps, gaps: coverage.gaps },
    });
  }
  
  // hasOverlaps consistency
  if (coverage.hasOverlaps && (!coverage.overlaps || coverage.overlaps.length === 0)) {
    violations.push({
      rule: 'OVERLAPS_FLAG_WITHOUT_DETAILS',
      message: 'hasOverlaps=true but overlaps array is empty or missing',
      severity: 'WARNING',
      context: { hasOverlaps: coverage.hasOverlaps, overlaps: coverage.overlaps },
    });
  }
  
  return violations;
}

/**
 * Validate full rate collection
 */
export function validateRateCollection(
  rates: RateEntry[],
  coverage: CoverageInfo | null,
  queryStart?: string,
  queryEnd?: string,
): SemanticValidationResult {
  const violations: SemanticViolation[] = [];
  
  // Validate each rate
  for (const rate of rates) {
    const result = validateRateEntry(rate);
    violations.push(...result.violations);
  }
  
  // Validate collection rules
  violations.push(...validateNoOverlaps(rates));
  
  if (coverage && queryStart && queryEnd) {
    violations.push(...validateGapsExplicit(rates, coverage, queryStart, queryEnd));
    violations.push(...validateCoverageConsistency(coverage));
  }
  
  return {
    valid: violations.filter(v => v.severity === 'ERROR').length === 0,
    violations,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function daysBetween(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffTime = endDate.getTime() - startDate.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
