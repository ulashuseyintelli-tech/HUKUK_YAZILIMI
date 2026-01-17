/**
 * Diagnostics Golden Scenario Tests
 * 
 * Phase 7A - Sprint 3 - Task 3.8
 * 
 * Deterministic scenarios with expected outputs.
 * These tests verify that the system behaves correctly
 * for well-defined input states.
 * 
 * @see .kiro/specs/self-serve-diagnostics/design.md
 */

import { DiagnosticsService } from '../diagnostics.service';
import { DiagnosticsAggregatorService } from '../diagnostics-aggregator.service';
import { DiagnosticsRedactionService } from '../diagnostics-redaction.service';
import { DiagnosticsAuditService } from '../diagnostics-audit.service';
import { DiagnosticsIncidentService } from '../diagnostics-incident.service';
import { HealthStatus } from '../diagnostics.types';

// ============================================================================
// MOCK FACTORIES
// ============================================================================

const createMockAggregator = (overrides: Partial<{
  successRate: number;
  p95Latency: number;
  openBreakerCount: number;
  fallbackRate: number;
}> = {}) => {
  const defaults = {
    successRate: 99,
    p95Latency: 500,
    openBreakerCount: 0,
    fallbackRate: 0,
  };
  const config = { ...defaults, ...overrides };

  return {
    getHealthData: jest.fn().mockReturnValue({
      cache: { hitRate: 85, missRate: 15, staleRate: 5 },
      circuitBreakers: config.openBreakerCount > 0
        ? { policy_engine: { state: 'OPEN', openedAt: new Date().toISOString() } }
        : { policy_engine: { state: 'CLOSED' } },
      rateLimit: { remaining: 50, capacity: 60, blocked: false },
      policyEngine: { available: config.openBreakerCount === 0, lastCheck: new Date().toISOString() },
      openBreakerCount: config.openBreakerCount,
    }),
    getSLOStatus: jest.fn().mockReturnValue({
      successRate: config.successRate,
      p95Latency: config.p95Latency,
      openBreakerCount: config.openBreakerCount,
    }),
    getMetricsData: jest.fn().mockReturnValue({
      latency: { p50: 150, p95: config.p95Latency, p99: config.p95Latency * 1.5 },
      rates: { success: config.successRate, fallback: config.fallbackRate, stale: 5, error: 100 - config.successRate },
      counts: { total: 1000, success: config.successRate * 10, fallback: config.fallbackRate * 10, error: (100 - config.successRate) * 10 },
    }),
    buildDetectionContext: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      timestamp: new Date().toISOString(),
      metrics: {
        successRate: config.successRate,
        fallbackRate: config.fallbackRate,
        p95LatencyMs: config.p95Latency,
        totalRequests: 1000,
        windowMs: 15 * 60 * 1000,
      },
      circuitBreakers: config.openBreakerCount > 0
        ? [{ name: 'policy_engine', state: 'OPEN', openedAt: new Date().toISOString(), openDurationMs: 60000 }]
        : [{ name: 'policy_engine', state: 'CLOSED' }],
      rateLimit: { throttleCount: 0, windowMs: 15 * 60 * 1000 },
    }),
    queryTraces: jest.fn().mockReturnValue({ traces: [], total: 0, hasMore: false }),
    getTrace: jest.fn().mockReturnValue(undefined),
    checkTraceAccess: jest.fn().mockReturnValue({ exists: false, belongsToTenant: false }),
  } as unknown as DiagnosticsAggregatorService;
};

const createMockRedaction = () => ({
  redact: jest.fn().mockImplementation((obj) => obj),
  redactDebtorName: jest.fn().mockImplementation((name) => `${name[0]}***`),
  redactAddress: jest.fn().mockReturnValue('[ADRES GİZLİ]'),
  getStats: jest.fn().mockReturnValue({ totalRedactions: 0, unknownFieldsRedacted: 0, piiPatternsMatched: 0, errors: 0 }),
  resetStats: jest.fn(),
}) as unknown as DiagnosticsRedactionService;

const createMockAudit = () => ({
  logTraceListAccess: jest.fn(),
  logTraceDetailAccess: jest.fn(),
  logTraceDownloadAccess: jest.fn(),
  logAccessAttempt: jest.fn(),
  getRecentLogs: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({ totalLogs: 0, allowedCount: 0, deniedCount: 0, byAction: { LIST: 0, DETAIL: 0, DOWNLOAD: 0 } }),
  clear: jest.fn(),
}) as unknown as DiagnosticsAuditService;

const createMockIncidentService = () => {
  const service = new DiagnosticsIncidentService();
  return service;
};

// ============================================================================
// GOLDEN SCENARIOS
// ============================================================================

describe('Diagnostics Golden Scenarios', () => {
  describe('Health Status Derivation', () => {
    /**
     * Golden Scenario 1: Healthy System
     * 
     * Input:
     * - Success rate: 99%
     * - p95 latency: 500ms
     * - Open breakers: 0
     * 
     * Expected:
     * - Status: OK
     */
    it('GOLDEN: Healthy system → status: OK', async () => {
      const aggregator = createMockAggregator({
        successRate: 99,
        p95Latency: 500,
        openBreakerCount: 0,
      });
      const service = new DiagnosticsService(
        aggregator,
        createMockRedaction(),
        createMockAudit(),
        createMockIncidentService(),
      );

      const result = await service.getHealth('tenant-001');

      expect(result.status).toBe('OK' as HealthStatus);
      expect(result.incidentCriteria?.successRateBelow95).toBe(false);
      expect(result.incidentCriteria?.p95Above2000ms).toBe(false);
      expect(result.incidentCriteria?.openBreakerCount).toBe(0);
    });

    /**
     * Golden Scenario 2: Degraded System (1 breaker open)
     * 
     * Input:
     * - Success rate: 97%
     * - p95 latency: 800ms
     * - Open breakers: 1
     * 
     * Expected:
     * - Status: DEGRADED
     */
    it('GOLDEN: Degraded system (1 breaker open) → status: DEGRADED', async () => {
      const aggregator = createMockAggregator({
        successRate: 97,
        p95Latency: 800,
        openBreakerCount: 1,
      });
      const service = new DiagnosticsService(
        aggregator,
        createMockRedaction(),
        createMockAudit(),
        createMockIncidentService(),
      );

      const result = await service.getHealth('tenant-001');

      expect(result.status).toBe('DEGRADED' as HealthStatus);
      expect(result.incidentCriteria?.openBreakerCount).toBe(1);
    });

    /**
     * Golden Scenario 3: Incident - Low Success Rate
     * 
     * Input:
     * - Success rate: 90% (< 95%)
     * - p95 latency: 500ms
     * - Open breakers: 0
     * 
     * Expected:
     * - Status: INCIDENT
     */
    it('GOLDEN: Incident system (low success rate) → status: INCIDENT', async () => {
      const aggregator = createMockAggregator({
        successRate: 90,
        p95Latency: 500,
        openBreakerCount: 0,
      });
      const service = new DiagnosticsService(
        aggregator,
        createMockRedaction(),
        createMockAudit(),
        createMockIncidentService(),
      );

      const result = await service.getHealth('tenant-001');

      expect(result.status).toBe('INCIDENT' as HealthStatus);
      expect(result.incidentCriteria?.successRateBelow95).toBe(true);
    });

    /**
     * Golden Scenario 4: Incident - High Latency
     * 
     * Input:
     * - Success rate: 99%
     * - p95 latency: 2500ms (> 2000ms)
     * - Open breakers: 0
     * 
     * Expected:
     * - Status: INCIDENT
     */
    it('GOLDEN: Incident system (high latency) → status: INCIDENT', async () => {
      const aggregator = createMockAggregator({
        successRate: 99,
        p95Latency: 2500,
        openBreakerCount: 0,
      });
      const service = new DiagnosticsService(
        aggregator,
        createMockRedaction(),
        createMockAudit(),
        createMockIncidentService(),
      );

      const result = await service.getHealth('tenant-001');

      expect(result.status).toBe('INCIDENT' as HealthStatus);
      expect(result.incidentCriteria?.p95Above2000ms).toBe(true);
    });

    /**
     * Golden Scenario 5: Incident - Multiple Breakers Open
     * 
     * Input:
     * - Success rate: 97%
     * - p95 latency: 800ms
     * - Open breakers: 2 (>= 2)
     * 
     * Expected:
     * - Status: INCIDENT
     */
    it('GOLDEN: Incident system (2+ breakers open) → status: INCIDENT', async () => {
      const aggregator = createMockAggregator({
        successRate: 97,
        p95Latency: 800,
        openBreakerCount: 2,
      });
      const service = new DiagnosticsService(
        aggregator,
        createMockRedaction(),
        createMockAudit(),
        createMockIncidentService(),
      );

      const result = await service.getHealth('tenant-001');

      expect(result.status).toBe('INCIDENT' as HealthStatus);
      expect(result.incidentCriteria?.openBreakerCount).toBe(2);
    });
  });

  describe('Incident Detection', () => {
    /**
     * Golden Scenario 6: Circuit Breaker Incident Detection
     */
    it('GOLDEN: Open circuit breaker → CIRCUIT_BREAKER_OPEN incident', () => {
      const incidentService = new DiagnosticsIncidentService();
      
      const incidents = incidentService.detectIncidents({
        tenantId: 'tenant-001',
        timestamp: new Date().toISOString(),
        metrics: {
          successRate: 99,
          fallbackRate: 0,
          p95LatencyMs: 500,
          totalRequests: 1000,
          windowMs: 15 * 60 * 1000,
        },
        circuitBreakers: [
          { name: 'policy_engine', state: 'OPEN', openedAt: new Date(Date.now() - 60000).toISOString(), openDurationMs: 60000 },
        ],
        rateLimit: { throttleCount: 0, windowMs: 15 * 60 * 1000 },
      });

      expect(incidents.length).toBeGreaterThan(0);
      expect(incidents[0].type).toBe('CIRCUIT_BREAKER_OPEN');
      expect(incidents[0].evidence.breakerName).toBe('policy_engine');
    });

    /**
     * Golden Scenario 7: High Error Rate Incident Detection
     */
    it('GOLDEN: Low success rate → HIGH_ERROR_RATE incident', () => {
      const incidentService = new DiagnosticsIncidentService();
      
      const incidents = incidentService.detectIncidents({
        tenantId: 'tenant-001',
        timestamp: new Date().toISOString(),
        metrics: {
          successRate: 85, // Below 90% (critical) and 95% (warning)
          fallbackRate: 0,
          p95LatencyMs: 500,
          totalRequests: 1000,
          windowMs: 15 * 60 * 1000,
        },
        circuitBreakers: [{ name: 'policy_engine', state: 'CLOSED' }],
        rateLimit: { throttleCount: 0, windowMs: 15 * 60 * 1000 },
      });

      const errorRateIncident = incidents.find(i => i.type === 'HIGH_ERROR_RATE');
      expect(errorRateIncident).toBeDefined();
      expect(errorRateIncident?.severity).toBe('CRITICAL');
    });

    /**
     * Golden Scenario 8: SLO Breach Incident Detection
     */
    it('GOLDEN: High p95 latency → SLO_BREACH incident', () => {
      const incidentService = new DiagnosticsIncidentService();
      
      const incidents = incidentService.detectIncidents({
        tenantId: 'tenant-001',
        timestamp: new Date().toISOString(),
        metrics: {
          successRate: 99,
          fallbackRate: 0,
          p95LatencyMs: 3500, // Above 3000ms (critical)
          totalRequests: 1000,
          windowMs: 15 * 60 * 1000,
        },
        circuitBreakers: [{ name: 'policy_engine', state: 'CLOSED' }],
        rateLimit: { throttleCount: 0, windowMs: 15 * 60 * 1000 },
      });

      const sloIncident = incidents.find(i => i.type === 'SLO_BREACH');
      expect(sloIncident).toBeDefined();
      expect(sloIncident?.severity).toBe('CRITICAL');
    });
  });

  describe('Redaction Golden Output', () => {
    /**
     * Golden Scenario 9: PII Redaction
     */
    it('GOLDEN: TCKN redaction → 11 asterisks', () => {
      const redactionService = new DiagnosticsRedactionService();
      
      const input = { unknownField: 'TCKN: 12345678901' };
      const result = redactionService.redact(input);
      
      expect(result.unknownField).toBe('TCKN: ***********');
    });

    it('GOLDEN: Phone redaction → +90*******XX format', () => {
      const redactionService = new DiagnosticsRedactionService();
      
      const input = { unknownField: 'Tel: +905551234567' };
      const result = redactionService.redact(input);
      
      expect(result.unknownField).toBe('Tel: +90*******67');
    });

    it('GOLDEN: Email redaction → a***@***.com format', () => {
      const redactionService = new DiagnosticsRedactionService();
      
      const input = { unknownField: 'Email: test@example.com' };
      const result = redactionService.redact(input);
      
      expect(result.unknownField).toBe('Email: t***@***.com');
    });
  });

  describe('Metrics Window Validation', () => {
    /**
     * Golden Scenario 10: Valid metrics windows
     */
    it('GOLDEN: Valid window values return metrics', async () => {
      const validWindows = ['5m', '15m', '30m', '1h', '6h', '24h'] as const;
      
      for (const window of validWindows) {
        const aggregator = createMockAggregator();
        const service = new DiagnosticsService(
          aggregator,
          createMockRedaction(),
          createMockAudit(),
          createMockIncidentService(),
        );

        const result = await service.getMetrics('tenant-001', window);
        
        expect(result.window).toBe(window);
        expect(result.tenantId).toBe('tenant-001');
      }
    });
  });
});
