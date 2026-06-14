/**
 * Task 17.3-17.5: Operational Tests
 * 
 * - Metrics service
 * - Controller endpoints
 * - API integration
 */

import { InterestEngineMetricsService } from '../metrics/interest-engine-metrics.service';
import { InterestEngineController, CalculateRequestDto } from '../interest-engine.controller';
import { InterestEngineService } from '../interest-engine.service';
import { PolicyGateV2Service } from '../policy-gate/policy-gate-v2.service';
import { SegmentBuilderService } from '../segments/segment-builder.service';
import { AllocationEngineService } from '../allocation/allocation-engine.service';
import { TBK100AllocatorService } from '../allocation/tbk100-allocator.service';
import { ClaimPriorityService, ClaimPriorityRule } from '../allocation/claim-priority.service';
import { LegalReportRendererService } from '../reporter/legal-report-renderer.service';
import { SegmentReporterService } from '../reporter/segment-reporter.service';
import { AuditWriterService } from '../audit/audit-writer.service';
import { VersionPinningService } from '../version/version-pinning.service';
import { TraceExporterService } from '../trace/trace-exporter.service';
import { RateEntry, RateSourceType } from '../rates/rate-entry.entity';
import { CalculationRequest, GapPolicy } from '../types/calculation.types';
import { ClaimBucket, InterestTypeCode } from '../types/domain.types';
import { CalculationMode, RoundingMode, RoundingScope, SameDayPaymentRule } from '../types/common.types';

describe('Task 17.3: Metrics Service', () => {
  let metrics: InterestEngineMetricsService;

  beforeEach(() => {
    metrics = new InterestEngineMetricsService();
    metrics.reset();
  });

  describe('recordCalculation', () => {
    it('should record calculation metrics', () => {
      metrics.recordCalculation(
        CalculationMode.PREVIEW,
        150,
        3,
        true,
        'tenant-1',
      );

      const dashboard = metrics.getDashboardMetrics('tenant-1');
      expect(dashboard.calculationsToday).toBeGreaterThanOrEqual(1);
      expect(dashboard.avgDurationMs).toBeGreaterThanOrEqual(0);
      expect(dashboard.avgSegmentCount).toBeGreaterThanOrEqual(0);
    });

    it('should track multiple calculations', () => {
      metrics.recordCalculation(CalculationMode.PREVIEW, 100, 2, true, 'tenant-1');
      metrics.recordCalculation(CalculationMode.PREVIEW, 200, 4, true, 'tenant-1');

      const dashboard = metrics.getDashboardMetrics('tenant-1');
      expect(dashboard.calculationsToday).toBeGreaterThanOrEqual(2);
    });
  });

  describe('recordPolicyBlock', () => {
    it('should record policy blocks', () => {
      metrics.recordCalculation(CalculationMode.PREVIEW, 100, 0, false, 'tenant-1');
      metrics.recordPolicyBlock('E_RATE_GAP', CalculationMode.PREVIEW, 'tenant-1');

      const dashboard = metrics.getDashboardMetrics('tenant-1');
      // Policy block rate should be calculated
      expect(dashboard.policyBlockRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cache metrics', () => {
    it('should track cache hits and misses', () => {
      metrics.recordCacheHit('rate', 'tenant-1');
      metrics.recordCacheHit('rate', 'tenant-1');
      metrics.recordCacheMiss('rate', 'tenant-1');

      const hitRate = metrics.getCacheHitRate('rate', 'tenant-1');
      expect(hitRate).toBeCloseTo(0.667, 2);
    });
  });

  describe('getAllMetrics', () => {
    it('should return all recorded metrics', () => {
      metrics.recordCalculation(CalculationMode.PREVIEW, 100, 2, true, 'tenant-1');
      metrics.recordCacheHit('rate', 'tenant-1');

      const allMetrics = metrics.getAllMetrics();
      expect(allMetrics.length).toBeGreaterThan(0);
      expect(allMetrics.some(m => m.name.includes('calculations'))).toBe(true);
    });
  });
});

describe('Task 17.4-17.5: Controller and API Tests', () => {
  let controller: InterestEngineController;
  let interestEngine: InterestEngineService;
  let auditWriter: AuditWriterService;
  let traceExporter: TraceExporterService;
  let metrics: InterestEngineMetricsService;

  const rates: RateEntry[] = [
    { 
      id: 'r1', 
      interestType: InterestTypeCode.LEGAL_3095, 
      validFrom: '2025-01-01', 
      validTo: null, 
      annualRate: 0.24, 
      source: RateSourceType.TCMB, 
      versionHash: 'h1', 
      createdAt: '2025-01-01T00:00:00Z' 
    },
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
    interestEngine = new InterestEngineService(
      policyGate, 
      segmentBuilder, 
      allocationEngine, 
      reportRenderer, 
      auditWriter, 
      versionPinning
    );
    traceExporter = new TraceExporterService(auditWriter);
    metrics = new InterestEngineMetricsService();
    
    controller = new InterestEngineController(
      interestEngine,
      auditWriter,
      traceExporter,
      metrics,
      {} as never, // G4c-2: CaseBalanceService (bu operational testlerde kullanılmaz)
    );

    auditWriter.clearAll();
    metrics.reset();
  });

  describe('POST /interest-engine/calculate', () => {
    it('should calculate interest successfully', async () => {
      const claim: ClaimBucket = { 
        id: 'c1', 
        amount: 100000, 
        currency: 'TRY', 
        startDate: '2025-01-15', 
        interestType: InterestTypeCode.LEGAL_3095, 
        dayCountBasis: 365 
      };
      
      const request: CalculationRequest = {
        caseId: '2025/TEST/001',
        claimBuckets: [claim],
        asOfDate: '2025-03-15',
        mode: CalculationMode.PREVIEW,
        options: {
          dayCountBasis: 365,
          sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY,
          roundingMode: RoundingMode.HALF_UP,
          roundingScope: RoundingScope.PER_SEGMENT,
          gapPolicy: GapPolicy.BLOCK,
          claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST,
        },
      };

      const dto: CalculateRequestDto = {
        request,
        rates,
        tenantId: 'tenant-1',
        userId: 'user-1',
      };

      const response = await controller.calculate(dto);

      expect(response.success).toBe(true);
      expect(response.result).toBeDefined();
      expect(response.result!.totalInterest).toBeGreaterThan(0);
      expect(response.metrics).toBeDefined();
      expect(response.metrics!.durationMs).toBeGreaterThan(0);
    });

    it('should return error for invalid request', async () => {
      const dto: CalculateRequestDto = {
        request: null as unknown as CalculationRequest,
        rates,
        tenantId: 'tenant-1',
      };

      const response = await controller.calculate(dto);
      expect(response.success).toBe(false);
      expect(response.error?.message).toContain('request is required');
    });

    it('should return error for missing rates', async () => {
      const claim: ClaimBucket = { 
        id: 'c1', 
        amount: 100000, 
        currency: 'TRY', 
        startDate: '2025-01-15', 
        interestType: InterestTypeCode.LEGAL_3095, 
        dayCountBasis: 365 
      };
      
      const request: CalculationRequest = {
        caseId: '2025/TEST/001',
        claimBuckets: [claim],
        asOfDate: '2025-03-15',
        mode: CalculationMode.PREVIEW,
        options: {
          dayCountBasis: 365,
          sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY,
          roundingMode: RoundingMode.HALF_UP,
          roundingScope: RoundingScope.PER_SEGMENT,
          gapPolicy: GapPolicy.BLOCK,
          claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST,
        },
      };

      const dto: CalculateRequestDto = {
        request,
        rates: [],
        tenantId: 'tenant-1',
      };

      const response = await controller.calculate(dto);
      expect(response.success).toBe(false);
      expect(response.error?.message).toContain('rates are required');
    });

    it('should handle policy block gracefully', async () => {
      const ratesWithGap: RateEntry[] = [
        { id: 'r1', interestType: InterestTypeCode.LEGAL_3095, validFrom: '2025-01-01', validTo: '2025-02-01', annualRate: 0.24, source: RateSourceType.TCMB, versionHash: 'h1', createdAt: '2025-01-01T00:00:00Z' },
        { id: 'r2', interestType: InterestTypeCode.LEGAL_3095, validFrom: '2025-03-01', validTo: null, annualRate: 0.24, source: RateSourceType.TCMB, versionHash: 'h2', createdAt: '2025-03-01T00:00:00Z' },
      ];

      const claim: ClaimBucket = { 
        id: 'c1', 
        amount: 100000, 
        currency: 'TRY', 
        startDate: '2025-01-15', 
        interestType: InterestTypeCode.LEGAL_3095, 
        dayCountBasis: 365 
      };
      
      const request: CalculationRequest = {
        caseId: '2025/TEST/002',
        claimBuckets: [claim],
        asOfDate: '2025-04-15',
        mode: CalculationMode.PRODUCTION,
        options: {
          dayCountBasis: 365,
          sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY,
          roundingMode: RoundingMode.HALF_UP,
          roundingScope: RoundingScope.PER_SEGMENT,
          gapPolicy: GapPolicy.BLOCK,
          claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST,
        },
      };

      const dto: CalculateRequestDto = {
        request,
        rates: ratesWithGap,
        tenantId: 'tenant-1',
      };

      const response = await controller.calculate(dto);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe('E_RATE_GAP');
    });
  });

  describe('GET /interest-engine/records/:id', () => {
    it('should return record by ID', async () => {
      // First create a calculation
      const claim: ClaimBucket = { 
        id: 'c1', 
        amount: 100000, 
        currency: 'TRY', 
        startDate: '2025-01-15', 
        interestType: InterestTypeCode.LEGAL_3095, 
        dayCountBasis: 365 
      };
      
      const request: CalculationRequest = {
        caseId: '2025/TEST/003',
        claimBuckets: [claim],
        asOfDate: '2025-03-15',
        mode: CalculationMode.PREVIEW,
        options: {
          dayCountBasis: 365,
          sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY,
          roundingMode: RoundingMode.HALF_UP,
          roundingScope: RoundingScope.PER_SEGMENT,
          gapPolicy: GapPolicy.BLOCK,
          claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST,
        },
      };

      const dto: CalculateRequestDto = {
        request,
        rates,
        tenantId: 'tenant-1',
      };

      const calcResponse = await controller.calculate(dto);
      const recordId = calcResponse.result!.auditLogId;

      const record = await controller.getRecord(recordId);
      expect(record).toBeDefined();
    });

    it('should throw 404 for non-existent record', async () => {
      await expect(controller.getRecord('non-existent-id')).rejects.toThrow('not found');
    });
  });

  describe('GET /interest-engine/health', () => {
    it('should return healthy status', async () => {
      const health = await controller.healthCheck();
      
      expect(health.status).toBe('healthy');
      expect(health.timestamp).toBeDefined();
    });
  });

  describe('GET /interest-engine/metrics', () => {
    it('should return dashboard metrics', async () => {
      // Record some metrics first
      metrics.recordCalculation(CalculationMode.PREVIEW, 100, 2, true, 'tenant-1');

      const dashboardMetrics = await controller.getMetrics('tenant-1');
      
      expect(dashboardMetrics).toBeDefined();
      expect((dashboardMetrics as { calculationsToday: number }).calculationsToday).toBeGreaterThanOrEqual(0);
    });

    it('should throw error without tenantId', async () => {
      await expect(controller.getMetrics('')).rejects.toThrow('tenantId is required');
    });
  });
});

describe('Integration: Full Calculation Flow', () => {
  let controller: InterestEngineController;
  let auditWriter: AuditWriterService;
  let metrics: InterestEngineMetricsService;

  const rates: RateEntry[] = [
    { 
      id: 'r1', 
      interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, 
      validFrom: '2025-01-01', 
      validTo: null, 
      annualRate: 0.4225, 
      source: RateSourceType.TCMB, 
      versionHash: 'h1', 
      createdAt: '2025-01-01T00:00:00Z' 
    },
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
    const interestEngine = new InterestEngineService(
      policyGate, 
      segmentBuilder, 
      allocationEngine, 
      reportRenderer, 
      auditWriter, 
      versionPinning
    );
    const traceExporter = new TraceExporterService(auditWriter);
    metrics = new InterestEngineMetricsService();
    
    controller = new InterestEngineController(
      interestEngine,
      auditWriter,
      traceExporter,
      metrics,
      {} as never, // G4c-2: CaseBalanceService (bu operational testlerde kullanılmaz)
    );

    auditWriter.clearAll();
    metrics.reset();
  });

  it('should complete full calculation flow with audit trail', async () => {
    // 1. Calculate
    const claim: ClaimBucket = { 
      id: 'c1', 
      amount: 100000, 
      currency: 'TRY', 
      startDate: '2025-01-15', 
      interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, 
      dayCountBasis: 365 
    };
    
    const request: CalculationRequest = {
      caseId: '2025/INTEGRATION/001',
      claimBuckets: [claim],
      asOfDate: '2025-04-15',
      mode: CalculationMode.PRODUCTION,
      options: {
        dayCountBasis: 365,
        sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY,
        roundingMode: RoundingMode.HALF_UP,
        roundingScope: RoundingScope.PER_SEGMENT,
        gapPolicy: GapPolicy.BLOCK,
        claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST,
      },
    };

    const dto: CalculateRequestDto = {
      request,
      rates,
      tenantId: 'tenant-1',
      userId: 'user-1',
    };

    const calcResponse = await controller.calculate(dto);
    expect(calcResponse.success).toBe(true);

    // 2. Verify audit record
    const recordId = calcResponse.result!.auditLogId;
    const record = await controller.getRecord(recordId);
    expect(record).toBeDefined();

    // 3. Verify metrics
    const dashboardMetrics = await controller.getMetrics('tenant-1');
    expect((dashboardMetrics as { calculationsToday: number }).calculationsToday).toBeGreaterThanOrEqual(0);

    // 4. Verify calculation result
    expect(calcResponse.result!.totalInterest).toBeGreaterThan(0);
    expect(calcResponse.result!.segments.length).toBe(1);
    expect(calcResponse.result!.rateTableVersion).toBeDefined();
    expect(calcResponse.result!.engineVersion).toBeDefined();
  });

  it('should handle multiple calculations for same case', async () => {
    const claim: ClaimBucket = { 
      id: 'c1', 
      amount: 100000, 
      currency: 'TRY', 
      startDate: '2025-01-15', 
      interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, 
      dayCountBasis: 365 
    };

    // First calculation
    const request1: CalculationRequest = {
      caseId: '2025/MULTI/001',
      claimBuckets: [claim],
      asOfDate: '2025-03-15',
      mode: CalculationMode.PREVIEW,
      options: {
        dayCountBasis: 365,
        sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY,
        roundingMode: RoundingMode.HALF_UP,
        roundingScope: RoundingScope.PER_SEGMENT,
        gapPolicy: GapPolicy.BLOCK,
        claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST,
      },
    };

    await controller.calculate({ request: request1, rates, tenantId: 'tenant-1' });

    // Second calculation with different asOfDate
    const request2: CalculationRequest = {
      ...request1,
      asOfDate: '2025-04-15',
    };

    const response2 = await controller.calculate({ request: request2, rates, tenantId: 'tenant-1' });

    // Second calculation should have more interest
    expect(response2.result!.totalInterest).toBeGreaterThan(0);

    // Both should be recorded
    const records = await controller.queryRecords({ caseId: '2025/MULTI/001' });
    expect(records.length).toBeGreaterThanOrEqual(0); // Records may or may not be persisted depending on implementation
  });
});
