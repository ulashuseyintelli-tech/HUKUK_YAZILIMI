/**
 * Diagnostics Service - Unit Tests
 * 
 * Phase 7A - Sprint 1
 * 
 * Tests:
 * - Health status derivation (OK, DEGRADED, INCIDENT)
 * - Metrics aggregation
 * - tenantScope requirement (Defense in Depth)
 */

import { DiagnosticsService } from '../diagnostics.service';
import { DiagnosticsAggregatorService } from '../diagnostics-aggregator.service';
import { DiagnosticsRedactionService } from '../diagnostics-redaction.service';
import { DiagnosticsAuditService } from '../diagnostics-audit.service';
import { DiagnosticsIncidentService } from '../diagnostics-incident.service';

describe('DiagnosticsService', () => {
  let service: DiagnosticsService;
  let mockAggregator: jest.Mocked<DiagnosticsAggregatorService>;
  let mockRedaction: jest.Mocked<DiagnosticsRedactionService>;
  let mockAudit: jest.Mocked<DiagnosticsAuditService>;
  let mockIncidentService: jest.Mocked<DiagnosticsIncidentService>;

  beforeEach(() => {
    mockAggregator = {
      getHealthData: jest.fn(),
      getSLOStatus: jest.fn(),
      getMetricsData: jest.fn(),
      queryTraces: jest.fn(),
      checkTraceAccess: jest.fn(),
      getTrace: jest.fn(),
      buildDetectionContext: jest.fn(),
    } as any;

    mockRedaction = {
      redact: jest.fn((trace) => trace),
    } as any;

    mockAudit = {
      logTraceListAccess: jest.fn(),
      logTraceDetailAccess: jest.fn(),
    } as any;

    mockIncidentService = {
      detectIncidents: jest.fn(),
      getRecentIncidents: jest.fn().mockReturnValue([]),
    } as any;

    service = new DiagnosticsService(
      mockAggregator,
      mockRedaction,
      mockAudit,
      mockIncidentService,
    );
  });

  describe('getHealth', () => {
    const defaultHealthData = {
      cache: { hitRate: 80, missRate: 20, staleRate: 5 },
      circuitBreakers: {
        rate_provider: { state: 'CLOSED' as const },
        policy_engine: { state: 'CLOSED' as const },
      },
      rateLimit: { remaining: 50, capacity: 60, blocked: false },
      policyEngine: { available: true, lastCheck: new Date().toISOString() },
      openBreakerCount: 0,
    };

    it('should return OK status when all SLOs are met', async () => {
      mockAggregator.getHealthData.mockReturnValue(defaultHealthData);
      mockAggregator.getSLOStatus.mockReturnValue({
        successRate: 99,
        p95Latency: 100,
        openBreakerCount: 0,
      });

      const result = await service.getHealth('tenant-123');

      expect(result.status).toBe('OK');
      expect(result.tenantId).toBe('tenant-123');
      expect(result.incidentCriteria?.successRateBelow95).toBe(false);
      expect(result.incidentCriteria?.p95Above2000ms).toBe(false);
    });

    it('should return DEGRADED status when 1 breaker is open', async () => {
      mockAggregator.getHealthData.mockReturnValue({
        ...defaultHealthData,
        circuitBreakers: {
          rate_provider: { state: 'OPEN' as const, openedAt: new Date().toISOString() },
          policy_engine: { state: 'CLOSED' as const },
        },
        openBreakerCount: 1,
      });
      mockAggregator.getSLOStatus.mockReturnValue({
        successRate: 99,
        p95Latency: 100,
        openBreakerCount: 1,
      });

      const result = await service.getHealth('tenant-123');

      expect(result.status).toBe('DEGRADED');
      expect(result.incidentCriteria?.openBreakerCount).toBe(1);
    });

    it('should return INCIDENT status when success rate < 95%', async () => {
      mockAggregator.getHealthData.mockReturnValue(defaultHealthData);
      mockAggregator.getSLOStatus.mockReturnValue({
        successRate: 90, // Below 95%
        p95Latency: 100,
        openBreakerCount: 0,
      });

      const result = await service.getHealth('tenant-123');

      expect(result.status).toBe('INCIDENT');
      expect(result.incidentCriteria?.successRateBelow95).toBe(true);
    });

    it('should return INCIDENT status when p95 > 2000ms', async () => {
      mockAggregator.getHealthData.mockReturnValue(defaultHealthData);
      mockAggregator.getSLOStatus.mockReturnValue({
        successRate: 99,
        p95Latency: 2500, // Above 2000ms
        openBreakerCount: 0,
      });

      const result = await service.getHealth('tenant-123');

      expect(result.status).toBe('INCIDENT');
      expect(result.incidentCriteria?.p95Above2000ms).toBe(true);
    });

    it('should return INCIDENT status when >= 2 breakers are open', async () => {
      mockAggregator.getHealthData.mockReturnValue({
        ...defaultHealthData,
        openBreakerCount: 2,
      });
      mockAggregator.getSLOStatus.mockReturnValue({
        successRate: 99,
        p95Latency: 100,
        openBreakerCount: 2,
      });

      const result = await service.getHealth('tenant-123');

      expect(result.status).toBe('INCIDENT');
      expect(result.incidentCriteria?.openBreakerCount).toBe(2);
    });

    it('should include all health data in response', async () => {
      mockAggregator.getHealthData.mockReturnValue(defaultHealthData);
      mockAggregator.getSLOStatus.mockReturnValue({
        successRate: 99,
        p95Latency: 100,
        openBreakerCount: 0,
      });

      const result = await service.getHealth('tenant-123');

      expect(result.cache).toEqual(defaultHealthData.cache);
      expect(result.circuitBreakers).toEqual(defaultHealthData.circuitBreakers);
      expect(result.rateLimit).toEqual(defaultHealthData.rateLimit);
      expect(result.policyEngine).toEqual(defaultHealthData.policyEngine);
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('getMetrics', () => {
    const defaultMetricsData = {
      latency: { p50: 50, p95: 150, p99: 300 },
      rates: { success: 98, fallback: 1, stale: 2, error: 2 },
      counts: { total: 1000, success: 980, fallback: 10, error: 20 },
    };

    it('should return metrics for specified window', async () => {
      mockAggregator.getMetricsData.mockReturnValue(defaultMetricsData);

      const result = await service.getMetrics('tenant-123', '15m');

      expect(result.window).toBe('15m');
      expect(result.tenantId).toBe('tenant-123');
      expect(result.latency).toEqual(defaultMetricsData.latency);
      expect(result.rates).toEqual(defaultMetricsData.rates);
      expect(result.counts).toEqual(defaultMetricsData.counts);
    });

    it('should call aggregator with correct tenant and window', async () => {
      mockAggregator.getMetricsData.mockReturnValue(defaultMetricsData);

      await service.getMetrics('tenant-456', '1h');

      expect(mockAggregator.getMetricsData).toHaveBeenCalledWith('tenant-456', '1h');
    });

    it('should include timestamp in response', async () => {
      mockAggregator.getMetricsData.mockReturnValue(defaultMetricsData);

      const result = await service.getMetrics('tenant-123', '5m');

      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('Defense in Depth - tenantScope Requirement', () => {
    it('getHealth requires tenantScope parameter', async () => {
      mockAggregator.getHealthData.mockReturnValue({
        cache: { hitRate: 0, missRate: 0, staleRate: 0 },
        circuitBreakers: {},
        rateLimit: { remaining: 0, capacity: 0, blocked: false },
        policyEngine: { available: true, lastCheck: '' },
        openBreakerCount: 0,
      });
      mockAggregator.getSLOStatus.mockReturnValue({
        successRate: 100,
        p95Latency: 0,
        openBreakerCount: 0,
      });

      // TypeScript enforces this at compile time
      // This test documents the contract
      const result = await service.getHealth('required-tenant-scope');
      expect(result.tenantId).toBe('required-tenant-scope');
    });

    it('getMetrics requires tenantScope parameter', async () => {
      mockAggregator.getMetricsData.mockReturnValue({
        latency: { p50: 0, p95: 0, p99: 0 },
        rates: { success: 0, fallback: 0, stale: 0, error: 0 },
        counts: { total: 0, success: 0, fallback: 0, error: 0 },
      });

      // TypeScript enforces this at compile time
      // This test documents the contract
      const result = await service.getMetrics('required-tenant-scope', '15m');
      expect(result.tenantId).toBe('required-tenant-scope');
    });
  });
});
