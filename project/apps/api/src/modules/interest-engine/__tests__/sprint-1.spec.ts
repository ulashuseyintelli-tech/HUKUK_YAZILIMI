/**
 * Sprint-1 Tests: RateProvider + CoverageMap + PolicyGate
 */

import { CalculationMode } from '../types/common.types';
import { InterestTypeCode } from '../types/domain.types';
import { GapPolicy } from '../types/calculation.types';
import { InterestEngineErrorCode } from '../errors/interest-engine-errors';
import { RateEntry, RateSourceType } from '../rates/rate-entry.entity';
import { 
  CoverageMapBuilder, 
  CoverageMap,
  RateQueryResult,
} from '../rates/coverage-map.builder';
import { 
  generateRateTableVersion, 
  generateRateEntryHash,
  verifyRateTableMatch,
} from '../rates/rate-version-hash';
import {
  detectRateGaps,
  detectRateOverlaps,
  detectInferredRates,
  detectNegativeDays,
  detectZeroDays,
  detectIbrazBeforeVade,
  detectExcessiveRate,
  detectLongSegment,
} from '../policy-gate/detectors';
import {
  MODE_SEVERITY_MATRIX,
  resolveGapPolicy,
  shouldBlockCalculation,
  getSeverityForIssue,
} from '../policy-gate/mode-matrix';
import { PolicyGateV2Service } from '../policy-gate/policy-gate-v2.service';

// ═══════════════════════════════════════════════════════════════════════════
// TEST FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

const createMockRate = (
  id: string,
  validFrom: string,
  validTo: string | null,
  annualRate: number,
): RateEntry => ({
  id,
  interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
  validFrom,
  validTo,
  annualRate,
  source: RateSourceType.TCMB,
  sourceReference: `TCMB ${validFrom}`,
  versionHash: generateRateEntryHash({
    interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
    validFrom,
    annualRate,
    source: RateSourceType.TCMB,
  }),
  createdAt: new Date().toISOString(),
});


describe('Sprint-1: RateProvider + CoverageMap + PolicyGate', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 4.3: Coverage Map Builder
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 4.3: Coverage Map Builder', () => {
    it('should calculate 100% coverage for continuous rates', () => {
      const rates: RateEntry[] = [
        createMockRate('r1', '2025-01-01', '2025-01-15', 0.50),
        createMockRate('r2', '2025-01-15', '2025-01-31', 0.55),
      ];

      const coverage = CoverageMapBuilder.build(rates, '2025-01-01', '2025-01-31');

      expect(coverage.coveragePercent).toBe(100);
      expect(coverage.gaps).toHaveLength(0);
      expect(coverage.totalDays).toBe(30);
      expect(coverage.coveredDays).toBe(30);
    });

    it('should detect gap in rate coverage', () => {
      const rates: RateEntry[] = [
        createMockRate('r1', '2025-01-01', '2025-01-10', 0.50),
        createMockRate('r2', '2025-01-20', '2025-01-31', 0.55),
      ];

      const coverage = CoverageMapBuilder.build(rates, '2025-01-01', '2025-01-31');

      expect(coverage.coveragePercent).toBeLessThan(100);
      expect(coverage.gaps).toHaveLength(1);
      expect(coverage.gaps[0].from).toBe('2025-01-10');
      expect(coverage.gaps[0].to).toBe('2025-01-20');
      expect(coverage.gaps[0].days).toBe(10);
    });

    it('should detect overlap in rates', () => {
      const rates: RateEntry[] = [
        createMockRate('r1', '2025-01-01', '2025-01-20', 0.50),
        createMockRate('r2', '2025-01-15', '2025-01-31', 0.55),
      ];

      const coverage = CoverageMapBuilder.build(rates, '2025-01-01', '2025-01-31');

      expect(coverage.overlaps).toHaveLength(1);
      expect(coverage.overlaps[0].date).toBe('2025-01-15');
      expect(coverage.overlaps[0].entries).toContain('r1');
      expect(coverage.overlaps[0].entries).toContain('r2');
    });

    it('should return empty coverage for no rates', () => {
      const coverage = CoverageMapBuilder.build([], '2025-01-01', '2025-01-31');

      expect(coverage.coveragePercent).toBe(0);
      expect(coverage.gaps).toHaveLength(1);
      expect(coverage.gaps[0].days).toBe(30);
    });

    it('should handle single rate covering entire period', () => {
      const rates: RateEntry[] = [
        createMockRate('r1', '2025-01-01', null, 0.50),
      ];

      const coverage = CoverageMapBuilder.build(rates, '2025-01-01', '2025-01-31');

      expect(coverage.coveragePercent).toBe(100);
      expect(coverage.gaps).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 4.4: Rate Version Hash Determinism
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 4.4: Rate Version Hash Determinism', () => {
    it('should generate same hash for same rates (order-independent)', () => {
      const rates1: RateEntry[] = [
        createMockRate('r1', '2025-01-01', '2025-01-15', 0.50),
        createMockRate('r2', '2025-01-15', '2025-01-31', 0.55),
      ];

      const rates2: RateEntry[] = [
        createMockRate('r2', '2025-01-15', '2025-01-31', 0.55),
        createMockRate('r1', '2025-01-01', '2025-01-15', 0.50),
      ];

      const hash1 = generateRateTableVersion(rates1);
      const hash2 = generateRateTableVersion(rates2);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different rates', () => {
      const rates1: RateEntry[] = [
        createMockRate('r1', '2025-01-01', '2025-01-15', 0.50),
      ];

      const rates2: RateEntry[] = [
        createMockRate('r1', '2025-01-01', '2025-01-15', 0.55), // Different rate
      ];

      const hash1 = generateRateTableVersion(rates1);
      const hash2 = generateRateTableVersion(rates2);

      expect(hash1).not.toBe(hash2);
    });

    it('should verify rate table match', () => {
      const rates1: RateEntry[] = [
        createMockRate('r1', '2025-01-01', '2025-01-15', 0.50),
      ];

      const rates2: RateEntry[] = [
        createMockRate('r1', '2025-01-01', '2025-01-15', 0.50),
      ];

      expect(verifyRateTableMatch(rates1, rates2)).toBe(true);
    });

    it('should return consistent hash for empty rates', () => {
      const hash1 = generateRateTableVersion([]);
      const hash2 = generateRateTableVersion([]);

      expect(hash1).toBe(hash2);
      expect(hash1).toBe('empty-rate-table');
    });
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 7.1: Anomaly Detectors
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 7.1: Anomaly Detectors', () => {
    describe('detectRateGaps', () => {
      it('should detect gaps and return WARNING in PREVIEW mode', () => {
        const coverage: CoverageMap = {
          coveragePercent: 80,
          totalDays: 30,
          coveredDays: 24,
          gaps: [{ from: '2025-01-10', to: '2025-01-16', days: 6 }],
          overlaps: [],
          hasInferredRates: false,
        };

        const result = detectRateGaps(coverage, CalculationMode.PREVIEW);

        expect(result.detected).toBe(true);
        expect(result.warning?.severity).toBe('WARNING');
        expect(result.warning?.code).toBe(InterestEngineErrorCode.E_RATE_GAP);
        expect(result.warning?.evidence).toHaveProperty('gaps');
      });

      it('should detect gaps and return ERROR in PRODUCTION mode', () => {
        const coverage: CoverageMap = {
          coveragePercent: 80,
          totalDays: 30,
          coveredDays: 24,
          gaps: [{ from: '2025-01-10', to: '2025-01-16', days: 6 }],
          overlaps: [],
          hasInferredRates: false,
        };

        const result = detectRateGaps(coverage, CalculationMode.PRODUCTION);

        expect(result.detected).toBe(true);
        expect(result.warning?.severity).toBe('ERROR');
      });

      it('should not detect when no gaps', () => {
        const coverage: CoverageMap = {
          coveragePercent: 100,
          totalDays: 30,
          coveredDays: 30,
          gaps: [],
          overlaps: [],
          hasInferredRates: false,
        };

        const result = detectRateGaps(coverage, CalculationMode.PRODUCTION);

        expect(result.detected).toBe(false);
      });
    });

    describe('detectInferredRates', () => {
      it('should return ERROR in LEGAL_REPORT mode', () => {
        const coverage: CoverageMap = {
          coveragePercent: 100,
          totalDays: 30,
          coveredDays: 30,
          gaps: [],
          overlaps: [],
          hasInferredRates: true,
        };

        const result = detectInferredRates(coverage, CalculationMode.LEGAL_REPORT);

        expect(result.detected).toBe(true);
        expect(result.warning?.severity).toBe('ERROR');
        expect(result.warning?.code).toBe(InterestEngineErrorCode.E_INFERRED_RATE);
      });

      it('should return WARNING in PREVIEW mode', () => {
        const coverage: CoverageMap = {
          coveragePercent: 100,
          totalDays: 30,
          coveredDays: 30,
          gaps: [],
          overlaps: [],
          hasInferredRates: true,
        };

        const result = detectInferredRates(coverage, CalculationMode.PREVIEW);

        expect(result.detected).toBe(true);
        expect(result.warning?.severity).toBe('WARNING');
      });
    });

    describe('detectNegativeDays', () => {
      it('should detect negative days', () => {
        const result = detectNegativeDays('2025-01-31', '2025-01-01');

        expect(result.detected).toBe(true);
        expect(result.warning?.severity).toBe('ERROR');
        expect(result.warning?.code).toBe(InterestEngineErrorCode.E_NEGATIVE_DAYS);
        expect(result.warning?.evidence).toHaveProperty('calculatedDays');
      });

      it('should not detect for valid range', () => {
        const result = detectNegativeDays('2025-01-01', '2025-01-31');

        expect(result.detected).toBe(false);
      });
    });

    describe('detectIbrazBeforeVade', () => {
      it('should detect ibraz before vade', () => {
        const result = detectIbrazBeforeVade('2025-01-01', '2025-01-15');

        expect(result.detected).toBe(true);
        expect(result.warning?.severity).toBe('ERROR');
        expect(result.warning?.code).toBe(InterestEngineErrorCode.E_IBRAZ_BEFORE_VADE);
      });

      it('should not detect when ibraz >= vade', () => {
        const result = detectIbrazBeforeVade('2025-01-15', '2025-01-15');

        expect(result.detected).toBe(false);
      });
    });

    describe('detectExcessiveRate', () => {
      it('should detect excessive contractual rate', () => {
        const result = detectExcessiveRate(0.90, 0.24, 3); // 90% vs 24% legal

        expect(result.detected).toBe(true);
        expect(result.warning?.severity).toBe('WARNING');
        expect(result.warning?.evidence).toHaveProperty('ratio');
      });

      it('should not detect when within limits', () => {
        const result = detectExcessiveRate(0.50, 0.24, 3); // 50% vs 24% legal (< 3x)

        expect(result.detected).toBe(false);
      });
    });

    describe('detectLongSegment', () => {
      it('should detect long segment with single rate', () => {
        const result = detectLongSegment(200, 1, 180);

        expect(result.detected).toBe(true);
        expect(result.warning?.code).toBe(InterestEngineErrorCode.E_LONG_SEGMENT);
      });

      it('should not detect when multiple rates', () => {
        const result = detectLongSegment(200, 3, 180);

        expect(result.detected).toBe(false);
      });
    });
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 7.2: Mode Matrix
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 7.2: Mode Matrix', () => {
    it('should have correct severity for PREVIEW mode', () => {
      expect(getSeverityForIssue(CalculationMode.PREVIEW, 'rateGap')).toBe('WARNING');
      expect(getSeverityForIssue(CalculationMode.PREVIEW, 'negativeDays')).toBe('ERROR');
    });

    it('should have correct severity for PRODUCTION mode', () => {
      expect(getSeverityForIssue(CalculationMode.PRODUCTION, 'rateGap')).toBe('ERROR');
      expect(getSeverityForIssue(CalculationMode.PRODUCTION, 'rateOverlap')).toBe('WARNING');
    });

    it('should have strictest severity for LEGAL_REPORT mode', () => {
      expect(getSeverityForIssue(CalculationMode.LEGAL_REPORT, 'rateGap')).toBe('ERROR');
      expect(getSeverityForIssue(CalculationMode.LEGAL_REPORT, 'rateOverlap')).toBe('ERROR');
      expect(getSeverityForIssue(CalculationMode.LEGAL_REPORT, 'inferredRate')).toBe('ERROR');
    });

    it('should resolve gap policy based on mode', () => {
      expect(resolveGapPolicy(CalculationMode.PREVIEW)).toBe(GapPolicy.WARN_ONLY_FOR_PREVIEW);
      expect(resolveGapPolicy(CalculationMode.PRODUCTION)).toBe(GapPolicy.BLOCK);
      expect(resolveGapPolicy(CalculationMode.LEGAL_REPORT)).toBe(GapPolicy.BLOCK);
    });

    it('should use explicit gap policy when provided', () => {
      expect(resolveGapPolicy(CalculationMode.PREVIEW, GapPolicy.BLOCK)).toBe(GapPolicy.BLOCK);
    });

    it('should block calculation on errors', () => {
      expect(shouldBlockCalculation(CalculationMode.PREVIEW, true, GapPolicy.WARN_ONLY_FOR_PREVIEW, false)).toBe(true);
    });

    it('should not block PREVIEW with gaps when policy allows', () => {
      expect(shouldBlockCalculation(CalculationMode.PREVIEW, false, GapPolicy.WARN_ONLY_FOR_PREVIEW, true)).toBe(false);
    });

    it('should block PRODUCTION with gaps', () => {
      expect(shouldBlockCalculation(CalculationMode.PRODUCTION, false, GapPolicy.BLOCK, true)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 7.3: Policy Gate V2 Service
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 7.3: Policy Gate V2 Service', () => {
    const policyGate = new PolicyGateV2Service();

    it('should ALLOW when no issues', () => {
      const coverage: CoverageMap = {
        coveragePercent: 100,
        totalDays: 30,
        coveredDays: 30,
        gaps: [],
        overlaps: [],
        hasInferredRates: false,
      };

      const decision = policyGate.validateCoverage(coverage, CalculationMode.PRODUCTION);

      expect(decision.decisionCode).toBe('ALLOW');
      expect(decision.canProceed).toBe(true);
      expect(decision.warnings).toHaveLength(0);
    });

    it('should WARN in PREVIEW mode with gaps', () => {
      const coverage: CoverageMap = {
        coveragePercent: 80,
        totalDays: 30,
        coveredDays: 24,
        gaps: [{ from: '2025-01-10', to: '2025-01-16', days: 6 }],
        overlaps: [],
        hasInferredRates: false,
      };

      const decision = policyGate.validateCoverage(coverage, CalculationMode.PREVIEW);

      expect(decision.decisionCode).toBe('WARN');
      expect(decision.canProceed).toBe(true);
      expect(decision.warnings.length).toBeGreaterThan(0);
    });

    it('should BLOCK in PRODUCTION mode with gaps', () => {
      const coverage: CoverageMap = {
        coveragePercent: 80,
        totalDays: 30,
        coveredDays: 24,
        gaps: [{ from: '2025-01-10', to: '2025-01-16', days: 6 }],
        overlaps: [],
        hasInferredRates: false,
      };

      const decision = policyGate.validateCoverage(coverage, CalculationMode.PRODUCTION);

      expect(decision.decisionCode).toBe('BLOCK');
      expect(decision.canProceed).toBe(false);
      expect(decision.blockedBy).toContain(InterestEngineErrorCode.E_RATE_GAP);
    });

    it('should BLOCK in LEGAL_REPORT mode with inferred rates', () => {
      const coverage: CoverageMap = {
        coveragePercent: 100,
        totalDays: 30,
        coveredDays: 30,
        gaps: [],
        overlaps: [],
        hasInferredRates: true,
      };

      const decision = policyGate.validateCoverage(coverage, CalculationMode.LEGAL_REPORT);

      expect(decision.decisionCode).toBe('BLOCK');
      expect(decision.canProceed).toBe(false);
      expect(decision.blockedBy).toContain(InterestEngineErrorCode.E_INFERRED_RATE);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SPRINT-1 HEALTH CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Sprint-1 Health Check', () => {
    it('should have all mode severity configs defined', () => {
      expect(MODE_SEVERITY_MATRIX[CalculationMode.PREVIEW]).toBeDefined();
      expect(MODE_SEVERITY_MATRIX[CalculationMode.PRODUCTION]).toBeDefined();
      expect(MODE_SEVERITY_MATRIX[CalculationMode.LEGAL_REPORT]).toBeDefined();
    });

    it('should have CoverageMapBuilder.isComplete helper', () => {
      const complete: CoverageMap = {
        coveragePercent: 100,
        totalDays: 30,
        coveredDays: 30,
        gaps: [],
        overlaps: [],
        hasInferredRates: false,
      };

      expect(CoverageMapBuilder.isComplete(complete)).toBe(true);
    });

    it('should have CoverageMapBuilder.hasCriticalIssues helper', () => {
      const withGaps: CoverageMap = {
        coveragePercent: 80,
        totalDays: 30,
        coveredDays: 24,
        gaps: [{ from: '2025-01-10', to: '2025-01-16', days: 6 }],
        overlaps: [],
        hasInferredRates: false,
      };

      expect(CoverageMapBuilder.hasCriticalIssues(withGaps)).toBe(true);
    });
  });
});
