/**
 * Task 7.3 - Policy Gate Service V2
 * 
 * validate() metodu
 * Decision object: decisionCode, severity, message, evidence
 */

import { Injectable } from '@nestjs/common';
import { CalculationMode } from '../types/common.types';
import { 
  CalculationRequest, 
  PolicyWarning,
  GapPolicy,
} from '../types/calculation.types';
import { CoverageMap } from '../rates/coverage-map.builder';
import {
  detectRateGaps,
  detectRateOverlaps,
  detectInferredRates,
  detectNegativeDays,
  detectZeroDays,
  detectIbrazBeforeVade,
  detectExcessiveRate,
  detectLongSegment,
} from './detectors';
import {
  MODE_SEVERITY_MATRIX,
  resolveGapPolicy,
  shouldBlockCalculation,
  getSeverityForIssue,
} from './mode-matrix';

// ═══════════════════════════════════════════════════════════════════════════
// POLICY DECISION
// ═══════════════════════════════════════════════════════════════════════════

export type DecisionCode = 'ALLOW' | 'BLOCK' | 'WARN';

export interface PolicyDecision {
  decisionCode: DecisionCode;
  canProceed: boolean;
  warnings: PolicyWarning[];
  blockedBy?: string[];  // Error codes that caused block
}


// ═══════════════════════════════════════════════════════════════════════════
// POLICY GATE V2 SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class PolicyGateV2Service {
  /**
   * Validate calculation request with coverage map
   */
  validate(
    request: CalculationRequest,
    coverage: CoverageMap,
    legalRate?: number,
  ): PolicyDecision {
    const warnings: PolicyWarning[] = [];
    const blockedBy: string[] = [];
    const mode = request.mode;
    const gapPolicy = resolveGapPolicy(mode, request.options.gapPolicy);

    // 1. Rate Gap Detection
    const gapResult = detectRateGaps(coverage, mode);
    if (gapResult.detected && gapResult.warning) {
      warnings.push(gapResult.warning);
      if (gapResult.warning.severity === 'ERROR') {
        blockedBy.push(gapResult.warning.code);
      }
    }

    // 2. Rate Overlap Detection
    const overlapResult = detectRateOverlaps(coverage, mode);
    if (overlapResult.detected && overlapResult.warning) {
      warnings.push(overlapResult.warning);
      if (overlapResult.warning.severity === 'ERROR') {
        blockedBy.push(overlapResult.warning.code);
      }
    }

    // 3. Inferred Rate Detection
    const inferredResult = detectInferredRates(coverage, mode);
    if (inferredResult.detected && inferredResult.warning) {
      warnings.push(inferredResult.warning);
      if (inferredResult.warning.severity === 'ERROR') {
        blockedBy.push(inferredResult.warning.code);
      }
    }

    // 4. Validate each claim bucket
    for (const claim of request.claimBuckets) {
      // Negative days
      const negResult = detectNegativeDays(claim.startDate, request.asOfDate);
      if (negResult.detected && negResult.warning) {
        warnings.push(negResult.warning);
        if (negResult.warning.severity === 'ERROR') {
          blockedBy.push(negResult.warning.code);
        }
      }

      // Zero days
      const zeroResult = detectZeroDays(claim.startDate, request.asOfDate);
      if (zeroResult.detected && zeroResult.warning) {
        warnings.push(zeroResult.warning);
        if (zeroResult.warning.severity === 'ERROR') {
          blockedBy.push(zeroResult.warning.code);
        }
      }

      // Ibraz before vade (çek)
      const ibrazResult = detectIbrazBeforeVade(claim.ibrazTarihi, claim.vadeTarihi);
      if (ibrazResult.detected && ibrazResult.warning) {
        warnings.push(ibrazResult.warning);
        if (ibrazResult.warning.severity === 'ERROR') {
          blockedBy.push(ibrazResult.warning.code);
        }
      }

      // Excessive contractual rate
      if (claim.fixedRate && legalRate) {
        const excessiveResult = detectExcessiveRate(claim.fixedRate, legalRate);
        if (excessiveResult.detected && excessiveResult.warning) {
          warnings.push(excessiveResult.warning);
        }
      }
    }

    // Determine decision
    const hasErrors = blockedBy.length > 0;
    const hasGaps = coverage.gaps.length > 0;
    const shouldBlock = shouldBlockCalculation(mode, hasErrors, gapPolicy, hasGaps);

    let decisionCode: DecisionCode;
    if (shouldBlock) {
      decisionCode = 'BLOCK';
    } else if (warnings.length > 0) {
      decisionCode = 'WARN';
    } else {
      decisionCode = 'ALLOW';
    }

    return {
      decisionCode,
      canProceed: !shouldBlock,
      warnings,
      blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
    };
  }

  /**
   * Quick validation for rate coverage only
   */
  validateCoverage(
    coverage: CoverageMap,
    mode: CalculationMode,
    gapPolicy?: GapPolicy,
  ): PolicyDecision {
    const warnings: PolicyWarning[] = [];
    const blockedBy: string[] = [];
    const resolvedPolicy = resolveGapPolicy(mode, gapPolicy);

    // Rate gaps
    const gapResult = detectRateGaps(coverage, mode);
    if (gapResult.detected && gapResult.warning) {
      warnings.push(gapResult.warning);
      if (gapResult.warning.severity === 'ERROR') {
        blockedBy.push(gapResult.warning.code);
      }
    }

    // Rate overlaps
    const overlapResult = detectRateOverlaps(coverage, mode);
    if (overlapResult.detected && overlapResult.warning) {
      warnings.push(overlapResult.warning);
      if (overlapResult.warning.severity === 'ERROR') {
        blockedBy.push(overlapResult.warning.code);
      }
    }

    // Inferred rates
    const inferredResult = detectInferredRates(coverage, mode);
    if (inferredResult.detected && inferredResult.warning) {
      warnings.push(inferredResult.warning);
      if (inferredResult.warning.severity === 'ERROR') {
        blockedBy.push(inferredResult.warning.code);
      }
    }

    const hasErrors = blockedBy.length > 0;
    const hasGaps = coverage.gaps.length > 0;
    const shouldBlock = shouldBlockCalculation(mode, hasErrors, resolvedPolicy, hasGaps);

    let decisionCode: DecisionCode;
    if (shouldBlock) {
      decisionCode = 'BLOCK';
    } else if (warnings.length > 0) {
      decisionCode = 'WARN';
    } else {
      decisionCode = 'ALLOW';
    }

    return {
      decisionCode,
      canProceed: !shouldBlock,
      warnings,
      blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
    };
  }
}
