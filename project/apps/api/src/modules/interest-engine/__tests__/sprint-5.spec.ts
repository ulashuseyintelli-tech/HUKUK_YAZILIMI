/**
 * Sprint-5: Main Engine + Integration Tests
 */
import * as fc from 'fast-check';
import { InterestEngineService } from '../interest-engine.service';
import { TraceExporterService } from '../trace/trace-exporter.service';
import { PolicyGateV2Service } from '../policy-gate/policy-gate-v2.service';
import { SegmentBuilderService } from '../segments/segment-builder.service';
import { AllocationEngineService } from '../allocation/allocation-engine.service';
import { TBK100AllocatorService } from '../allocation/tbk100-allocator.service';
import { ClaimPriorityService, ClaimPriorityRule } from '../allocation/claim-priority.service';
import { LegalReportRendererService } from '../reporter/legal-report-renderer.service';
import { SegmentReporterService } from '../reporter/segment-reporter.service';
import { AuditWriterService } from '../audit/audit-writer.service';
import { VersionPinningService } from '../version/version-pinning.service';
import { RateEntry, RateSourceType } from '../rates/rate-entry.entity';
import { CalculationRequest, generateInputHash, GapPolicy } from '../types/calculation.types';
import { ClaimBucket, InterestTypeCode } from '../types/domain.types';
import { CalculationMode, RoundingMode, RoundingScope, SameDayPaymentRule } from '../types/common.types';

describe('Sprint-5: Main Engine + Integration', () => {
  let interestEngine: InterestEngineService;
  let traceExporter: TraceExporterService;
  let auditWriter: AuditWriterService;

  // Mock rates covering 2025-01-01 to 2025-12-31 (no gaps)
  const mockRates: RateEntry[] = [
    { id: 'rate-1', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-01-01', validTo: null, annualRate: 0.4225, source: RateSourceType.TCMB, sourceReference: 'TCMB 01.01.2025', versionHash: 'hash1', createdAt: '2025-01-01T00:00:00Z' },
  ];

  beforeEach(() => {
    const policyGate = new PolicyGateV2Service();
    const segmentBuilder = new SegmentBuilderService();
    const tbk100Allocator = new TBK100AllocatorService();
    const claimPriority = new ClaimPriorityService();
    const allocationEngine = new AllocationEngineService(tbk100Allocator, claimPriority);
    const segmentReporter = new SegmentReporterService();
    const reportRenderer = new LegalReportRendererService(segmentReporter);
    auditWriter = new AuditWriterService();
    const versionPinning = new VersionPinningService();
    interestEngine = new InterestEngineService(policyGate, segmentBuilder, allocationEngine, reportRenderer, auditWriter, versionPinning);
    traceExporter = new TraceExporterService(auditWriter);
    auditWriter.clearAll();
  });

  function createClaim(id: string, amount: number, startDate: string): ClaimBucket {
    return { id, amount, currency: 'TRY', startDate, interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, dayCountBasis: 365 };
  }

  function createRequest(mode: CalculationMode, claims: ClaimBucket[], asOfDate: string): CalculationRequest {
    return { caseId: '2025/12345', claimBuckets: claims, asOfDate, mode, options: { dayCountBasis: 365, sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY, roundingMode: RoundingMode.HALF_UP, roundingScope: RoundingScope.PER_SEGMENT, gapPolicy: GapPolicy.BLOCK, claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST } };
  }

  describe('Task 13.6: Property - Determinism', () => {
    it('Property 1: identical inputs produce identical outputs', async () => {
      const claims = [createClaim('c1', 100000, '2025-01-15')];
      const request = createRequest(CalculationMode.PREVIEW, claims, '2025-03-15');
      const result1 = await interestEngine.calculate(request, mockRates, 'tenant-1');
      const result2 = await interestEngine.calculate(request, mockRates, 'tenant-1');
      expect(result1.totalInterest).toBe(result2.totalInterest);
      expect(result1.inputHash).toBe(result2.inputHash);
    });

    it('Property 1: input hash is deterministic', () => {
      fc.assert(fc.property(fc.record({ amount: fc.integer({ min: 1000, max: 1000000 }), days: fc.integer({ min: 1, max: 180 }) }), ({ amount, days }) => {
        const endDate = new Date('2025-01-01'); endDate.setDate(endDate.getDate() + days);
        const claims = [createClaim('c1', amount, '2025-01-01')];
        const request1 = createRequest(CalculationMode.PREVIEW, claims, endDate.toISOString().split('T')[0]);
        const request2 = createRequest(CalculationMode.PREVIEW, claims, endDate.toISOString().split('T')[0]);
        return generateInputHash(request1) === generateInputHash(request2);
      }), { numRuns: 50 });
    });
  });

  describe('Task 13.7: Property - Segment Sum Equals Total', () => {
    it('Property 10: segment sum equals total interest', async () => {
      const claims = [createClaim('c1', 100000, '2025-01-15')];
      const request = createRequest(CalculationMode.PREVIEW, claims, '2025-03-15');
      const result = await interestEngine.calculate(request, mockRates, 'tenant-1');
      const segmentSum = result.segments.reduce((sum, s) => sum + s.segmentInterest, 0);
      expect(Math.abs(segmentSum - result.totalInterest)).toBeLessThan(0.01);
    });
  });

  describe('Task 13.8: Property - Rounding Consistency', () => {
    it('Property 7: totalInterest is rounded to 2 decimals', async () => {
      const claims = [createClaim('c1', 100000, '2025-01-15')];
      const request = createRequest(CalculationMode.PREVIEW, claims, '2025-03-15');
      const result = await interestEngine.calculate(request, mockRates, 'tenant-1');
      expect(result.totalInterest).toBe(Math.round(result.totalInterest * 100) / 100);
    });
  });

  describe('Task 13.9: Property - Version Reproducibility', () => {
    it('Property 9: version info is always present', async () => {
      const claims = [createClaim('c1', 100000, '2025-01-15')];
      const request = createRequest(CalculationMode.PREVIEW, claims, '2025-03-15');
      const result = await interestEngine.calculate(request, mockRates, 'tenant-1');
      expect(result.rateTableVersion).toBeDefined();
      expect(result.engineVersion).toBeDefined();
      expect(result.ruleVersion).toBeDefined();
    });
  });

  describe('Task 14.1: Integration - PREVIEW Mode', () => {
    it('PREVIEW mode allows calculation', async () => {
      const claims = [createClaim('c1', 100000, '2025-01-15')];
      const request = createRequest(CalculationMode.PREVIEW, claims, '2025-03-15');
      const result = await interestEngine.calculate(request, mockRates, 'tenant-1');
      expect(result).toBeDefined();
      expect(result.totalInterest).toBeGreaterThan(0);
    });

    it('PREVIEW mode creates audit record', async () => {
      const claims = [createClaim('c1', 100000, '2025-01-15')];
      const request = createRequest(CalculationMode.PREVIEW, claims, '2025-03-15');
      const result = await interestEngine.calculate(request, mockRates, 'tenant-1');
      expect(result.auditLogId).toBeDefined();
    });
  });

  describe('Task 14.2: Integration - PRODUCTION Mode', () => {
    it('PRODUCTION mode creates CalculationRecord', async () => {
      const claims = [createClaim('c1', 100000, '2025-01-15')];
      const request = createRequest(CalculationMode.PRODUCTION, claims, '2025-03-15');
      const result = await interestEngine.calculate(request, mockRates, 'tenant-1');
      expect(result.auditLogId).toBeDefined();
      expect(result.rateTableVersion).toBeDefined();
    });
  });

  describe('Task 14.3: Integration - LEGAL_REPORT Mode', () => {
    it('LEGAL_REPORT mode creates CalculationRecord and Trace', async () => {
      const claims = [createClaim('c1', 100000, '2025-01-15')];
      const request = createRequest(CalculationMode.LEGAL_REPORT, claims, '2025-03-15');
      const result = await interestEngine.calculate(request, mockRates, 'tenant-1');
      expect(result.auditLogId).toBeDefined();
      const trace = await traceExporter.exportTrace(result.auditLogId);
      expect(trace).toBeDefined();
    });
  });

  describe('Trace Exporter', () => {
    it('exports trace for LEGAL_REPORT calculations', async () => {
      const claims = [createClaim('c1', 100000, '2025-01-15')];
      const request = createRequest(CalculationMode.LEGAL_REPORT, claims, '2025-03-15');
      const result = await interestEngine.calculate(request, mockRates, 'tenant-1');
      const trace = await traceExporter.exportTrace(result.auditLogId);
      expect(trace).not.toBeNull();
      expect(trace!.version).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('handles single day calculation', async () => {
      const claims = [createClaim('c1', 100000, '2025-01-15')];
      const request = createRequest(CalculationMode.PREVIEW, claims, '2025-01-16');
      const result = await interestEngine.calculate(request, mockRates, 'tenant-1');
      expect(result.totalInterest).toBeGreaterThan(0);
    });

    it('handles large amounts', async () => {
      const claims = [createClaim('c1', 10000000, '2025-01-15')];
      const request = createRequest(CalculationMode.PREVIEW, claims, '2025-03-15');
      const result = await interestEngine.calculate(request, mockRates, 'tenant-1');
      expect(result.totalDue).toBeGreaterThan(10000000);
    });
  });

  describe('Input Validation', () => {
    it('throws error for missing caseId', async () => {
      const claims = [createClaim('c1', 100000, '2025-01-15')];
      const request = createRequest(CalculationMode.PREVIEW, claims, '2025-03-15');
      request.caseId = '';
      await expect(interestEngine.calculate(request, mockRates, 'tenant-1')).rejects.toThrow();
    });

    it('throws error for empty claims', async () => {
      const request = createRequest(CalculationMode.PREVIEW, [], '2025-03-15');
      await expect(interestEngine.calculate(request, mockRates, 'tenant-1')).rejects.toThrow();
    });
  });
});
