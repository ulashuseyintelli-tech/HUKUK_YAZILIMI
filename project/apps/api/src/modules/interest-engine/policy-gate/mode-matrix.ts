/**
 * Task 7.2 - Mode Matrix
 * 
 * PREVIEW: warn + PreviewRecord bayrakları
 * PRODUCTION: gap=BLOCK
 * LEGAL_REPORT: gap/overlap/anomaly/inferred=ERROR
 */

import { CalculationMode } from '../types/common.types';
import { GapPolicy } from '../types/calculation.types';

// ═══════════════════════════════════════════════════════════════════════════
// MODE SEVERITY MATRIX
// ═══════════════════════════════════════════════════════════════════════════

export type Severity = 'ERROR' | 'WARNING' | 'INFO';

export interface ModeSeverityConfig {
  rateGap: Severity;
  rateOverlap: Severity;
  inferredRate: Severity;
  negativeDays: Severity;
  zeroDays: Severity;
  ibrazBeforeVade: Severity;
  excessiveRate: Severity;
  longSegment: Severity;
  interestAnomaly: Severity;
}

export const MODE_SEVERITY_MATRIX: Record<CalculationMode, ModeSeverityConfig> = {
  [CalculationMode.PREVIEW]: {
    rateGap: 'WARNING',
    rateOverlap: 'WARNING',
    inferredRate: 'WARNING',
    negativeDays: 'ERROR',      // Always error
    zeroDays: 'WARNING',
    ibrazBeforeVade: 'ERROR',   // Always error
    excessiveRate: 'WARNING',
    longSegment: 'INFO',
    interestAnomaly: 'INFO',
  },
  [CalculationMode.PRODUCTION]: {
    rateGap: 'ERROR',           // Blocks calculation
    rateOverlap: 'WARNING',
    inferredRate: 'WARNING',
    negativeDays: 'ERROR',
    zeroDays: 'WARNING',
    ibrazBeforeVade: 'ERROR',
    excessiveRate: 'WARNING',
    longSegment: 'WARNING',
    interestAnomaly: 'WARNING',
  },
  [CalculationMode.LEGAL_REPORT]: {
    rateGap: 'ERROR',           // Strictest
    rateOverlap: 'ERROR',       // Strictest
    inferredRate: 'ERROR',      // "varsaydık" is toxic in court
    negativeDays: 'ERROR',
    zeroDays: 'ERROR',          // Strictest
    ibrazBeforeVade: 'ERROR',
    excessiveRate: 'WARNING',
    longSegment: 'WARNING',
    interestAnomaly: 'WARNING',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// GAP POLICY RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

export function resolveGapPolicy(
  mode: CalculationMode,
  explicitPolicy?: GapPolicy,
): GapPolicy {
  if (explicitPolicy) {
    return explicitPolicy;
  }

  switch (mode) {
    case CalculationMode.PREVIEW:
      return GapPolicy.WARN_ONLY_FOR_PREVIEW;
    case CalculationMode.PRODUCTION:
      return GapPolicy.BLOCK;
    case CalculationMode.LEGAL_REPORT:
      return GapPolicy.BLOCK;
    default:
      return GapPolicy.BLOCK;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SHOULD BLOCK CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

export function shouldBlockCalculation(
  mode: CalculationMode,
  hasErrors: boolean,
  gapPolicy: GapPolicy,
  hasGaps: boolean,
): boolean {
  // Always block on errors
  if (hasErrors) {
    return true;
  }

  // Check gap policy
  if (hasGaps) {
    switch (gapPolicy) {
      case GapPolicy.BLOCK:
        return true;
      case GapPolicy.WARN_AND_BLOCK_FOR_HIGH_RISK:
        return mode === CalculationMode.LEGAL_REPORT || mode === CalculationMode.PRODUCTION;
      case GapPolicy.WARN_ONLY_FOR_PREVIEW:
        return mode !== CalculationMode.PREVIEW;
    }
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// GET SEVERITY FOR ISSUE
// ═══════════════════════════════════════════════════════════════════════════

export function getSeverityForIssue(
  mode: CalculationMode,
  issue: keyof ModeSeverityConfig,
): Severity {
  return MODE_SEVERITY_MATRIX[mode][issue];
}
