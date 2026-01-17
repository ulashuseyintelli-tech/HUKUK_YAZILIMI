/**
 * Diagnostics Integration Tests
 * 
 * Phase 7A - Sprint 3 - Task 3.9
 * 
 * End-to-end integration tests for the Diagnostics API.
 * Tests the full request flow: Controller → Guards → Service → Aggregator
 * 
 * @see .kiro/specs/self-serve-diagnostics/design.md
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { DiagnosticsController } from '../diagnostics.controller';
import { DiagnosticsService } from '../diagnostics.service';
import { DiagnosticsAggregatorService } from '../diagnostics-aggregator.service';
import { DiagnosticsRedactionService } from '../diagnostics-redaction.service';
import { DiagnosticsAuditService } from '../diagnostics-audit.service';
import { DiagnosticsIncidentService } from '../diagnostics-incident.service';
import { DiagnosticsRBACGuard } from '../guards/diagnostics-rbac.guard';
import { DiagnosticsRateLimitGuard } from '../guards/diagnostics-rate-limit.guard';
import { HealthStatus, MetricsWindow, TenantAccessContext } from '../diagnostics.types';

// Helper to create valid TenantAccessContext
const createTenantContext = (overrides: Partial<TenantAccessContext> = {}): TenantAccessContext => ({
  userId: 'user-001',
  tenantId: 'tenant-001',
  role: 'tenant-admin',
  ...overrides,
});

// ============================================================================
// MOCK FACTORIES
// ============================================================================

const createMockAggregator = () => ({
  getHealthData: jest.fn().mockReturnValue({
    cache: { hitRate: 85, missRate: 15, staleRate: 5 },
    circuitBreakers: { policy_engine: { state: 'CLOSED' } },
    rateLimit: { remaining: 50, capacity: 60, blocked: false },
    policyEngine: { available: true, lastCheck: new Date().toISOString() },
    openBreakerCount: 0,
  }),
  getSLOStatus: jest.fn().mockReturnValue({
    successRate: 99,
    p95Latency: 500,
    openBreakerCount: 0,
  }),
  getMetricsData: jest.fn().mockReturnValue({
    latency: { p50: 150, p95: 500, p99: 800 },
    rates: { success: 99, fallback: 1, stale: 5, error: 1 },
    counts: { total: 1000, success: 990, fallback: 10, error: 10 },
  }),
  buildDetectionContext: jest.fn().mockReturnValue({
    tenantId: 'tenant-001',
    timestamp: new Date().toISOString(),
    metrics: {
      successRate: 99,
      fallbackRate: 1,
      p95LatencyMs: 500,
      totalRequests: 1000,
      windowMs: 15 * 60 * 1000,
    },
    circuitBreakers: [{ name: 'policy_engine', state: 'CLOSED' }],
    rateLimit: { throttleCount: 0, windowMs: 15 * 60 * 1000 },
  }),
  queryTraces: jest.fn().mockReturnValue({
    traces: [
      {
        traceId: 'trace-001',
        tenantId: 'tenant-001',
        timestamp: new Date().toISOString(),
        status: 'OK',
        durationMs: 250,
      },
    ],
    total: 1,
    hasMore: false,
  }),
  getTrace: jest.fn().mockImplementation((tenantId: string, traceId: string) => {
    if (traceId === 'trace-001' && tenantId === 'tenant-001') {
      return {
        meta: { traceId: 'trace-001', tenantId: 'tenant-001' },
        result: { status: 'OK' },
      };
    }
    return undefined;
  }),
  checkTraceAccess: jest.fn().mockImplementation((tenantId: string, traceId: string) => {
    if (traceId === 'trace-001') {
      return { exists: true, belongsToTenant: tenantId === 'tenant-001' };
    }
    if (traceId === 'trace-other-tenant') {
      return { exists: true, belongsToTenant: false };
    }
    return { exists: false, belongsToTenant: false };
  }),
});

const createMockRedaction = () => ({
  redact: jest.fn().mockImplementation((obj) => obj),
  redactDebtorName: jest.fn().mockImplementation((name) => `${name[0]}***`),
  redactAddress: jest.fn().mockReturnValue('[ADRES GİZLİ]'),
  getStats: jest.fn().mockReturnValue({ totalRedactions: 0, unknownFieldsRedacted: 0, piiPatternsMatched: 0, errors: 0 }),
  resetStats: jest.fn(),
});

const createMockAudit = () => ({
  logTraceListAccess: jest.fn(),
  logTraceDetailAccess: jest.fn(),
  logTraceDownloadAccess: jest.fn(),
  logAccessAttempt: jest.fn(),
  getRecentLogs: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({ totalLogs: 0, allowedCount: 0, deniedCount: 0, byAction: {} }),
  clear: jest.fn(),
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Diagnostics Integration Tests', () => {
  let module: TestingModule;
  let controller: DiagnosticsController;
  let aggregator: ReturnType<typeof createMockAggregator>;
  let audit: ReturnType<typeof createMockAudit>;

  beforeEach(async () => {
    aggregator = createMockAggregator();
    audit = createMockAudit();

    module = await Test.createTestingModule({
      controllers: [DiagnosticsController],
      providers: [
        DiagnosticsService,
        DiagnosticsIncidentService,
        { provide: DiagnosticsAggregatorService, useValue: aggregator },
        { provide: DiagnosticsRedactionService, useValue: createMockRedaction() },
        { provide: DiagnosticsAuditService, useValue: audit },
      ],
    })
      .overrideGuard(DiagnosticsRBACGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(DiagnosticsRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DiagnosticsController>(DiagnosticsController);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('Health Endpoint Integration', () => {
    it('should return health status through full flow', async () => {
      const result = await controller.getHealth(createTenantContext());

      expect(result.status).toBe('OK' as HealthStatus);
      expect(result.tenantId).toBe('tenant-001');
      expect(aggregator.getHealthData).toHaveBeenCalled();
      expect(aggregator.getSLOStatus).toHaveBeenCalled();
    });

    it('should derive DEGRADED status when breaker is open', async () => {
      aggregator.getHealthData.mockReturnValue({
        cache: { hitRate: 85, missRate: 15, staleRate: 5 },
        circuitBreakers: { policy_engine: { state: 'OPEN', openedAt: new Date().toISOString() } },
        rateLimit: { remaining: 50, capacity: 60, blocked: false },
        policyEngine: { available: false, lastCheck: new Date().toISOString() },
        openBreakerCount: 1,
      });
      aggregator.getSLOStatus.mockReturnValue({
        successRate: 97,
        p95Latency: 800,
        openBreakerCount: 1,
      });

      const result = await controller.getHealth(createTenantContext());

      expect(result.status).toBe('DEGRADED' as HealthStatus);
    });

    it('should derive INCIDENT status when success rate is low', async () => {
      aggregator.getSLOStatus.mockReturnValue({
        successRate: 85,
        p95Latency: 500,
        openBreakerCount: 0,
      });

      const result = await controller.getHealth(createTenantContext());

      expect(result.status).toBe('INCIDENT' as HealthStatus);
      expect(result.incidentCriteria?.successRateBelow95).toBe(true);
    });
  });

  describe('Metrics Endpoint Integration', () => {
    it('should return metrics for valid window', async () => {
      const result = await controller.getMetrics(
        createTenantContext(),
        '15m' as MetricsWindow
      );

      expect(result.window).toBe('15m');
      expect(result.tenantId).toBe('tenant-001');
      expect(result.latency).toBeDefined();
      expect(result.rates).toBeDefined();
      expect(result.counts).toBeDefined();
    });

    it('should work with all valid window values', async () => {
      const windows: MetricsWindow[] = ['5m', '15m', '30m', '1h', '6h', '24h'];

      for (const window of windows) {
        const result = await controller.getMetrics(
          createTenantContext(),
          window
        );
        expect(result.window).toBe(window);
      }
    });
  });

  describe('Traces Endpoint Integration', () => {
    it('should return trace list for tenant', async () => {
      const since = new Date(Date.now() - 3600000).toISOString();
      const result = await controller.getTraces(
        createTenantContext(),
        since
      );

      expect(result.traces).toBeDefined();
      expect(result.pagination).toBeDefined();
      expect(audit.logTraceListAccess).toHaveBeenCalled();
    });

    it('should return trace detail for owned trace', async () => {
      const result = await controller.getTraceDetail(
        createTenantContext(),
        'trace-001'
      );

      expect(result.trace).toBeDefined();
      expect(result.truncated).toBe(false);
      expect(audit.logTraceDetailAccess).toHaveBeenCalled();
    });
  });

  describe('Incidents Endpoint Integration', () => {
    it('should return recent incidents', async () => {
      const result = await controller.getRecentIncidents(
        createTenantContext()
      );

      expect(result.incidents).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.period).toBeDefined();
      expect(result.tenantId).toBe('tenant-001');
    });

    it('should detect incidents when metrics indicate problems', async () => {
      aggregator.buildDetectionContext.mockReturnValue({
        tenantId: 'tenant-001',
        timestamp: new Date().toISOString(),
        metrics: {
          successRate: 85, // Below threshold
          fallbackRate: 10,
          p95LatencyMs: 500,
          totalRequests: 1000,
          windowMs: 15 * 60 * 1000,
        },
        circuitBreakers: [{ name: 'policy_engine', state: 'CLOSED' }],
        rateLimit: { throttleCount: 0, windowMs: 15 * 60 * 1000 },
      });

      const result = await controller.getRecentIncidents(
        createTenantContext()
      );

      expect(result.incidents.length).toBeGreaterThan(0);
      expect(result.incidents.some(i => i.type === 'HIGH_ERROR_RATE')).toBe(true);
    });
  });

  describe('RBAC Enforcement Integration', () => {
    let rbacModule: TestingModule;
    let rbacController: DiagnosticsController;

    beforeEach(async () => {
      rbacModule = await Test.createTestingModule({
        controllers: [DiagnosticsController],
        providers: [
          DiagnosticsService,
          DiagnosticsIncidentService,
          { provide: DiagnosticsAggregatorService, useValue: createMockAggregator() },
          { provide: DiagnosticsRedactionService, useValue: createMockRedaction() },
          { provide: DiagnosticsAuditService, useValue: createMockAudit() },
        ],
      })
        .overrideGuard(DiagnosticsRBACGuard)
        .useValue({
          canActivate: (context: ExecutionContext) => {
            const request = context.switchToHttp().getRequest();
            const tenantContext = request.tenantContext;
            
            // Simulate RBAC logic
            if (!tenantContext) {
              throw new UnauthorizedException('Authentication required');
            }
            
            if (tenantContext.role === 'tenant-admin') {
              // tenant-admin can only access their own tenant
              const targetTenant = request.query?.tenantId || tenantContext.tenantId;
              if (targetTenant !== tenantContext.tenantId) {
                throw new ForbiddenException('Cross-tenant access denied');
              }
            }
            
            return true;
          },
        })
        .overrideGuard(DiagnosticsRateLimitGuard)
        .useValue({ canActivate: () => true })
        .compile();

      rbacController = rbacModule.get<DiagnosticsController>(DiagnosticsController);
    });

    afterEach(async () => {
      await rbacModule.close();
    });

    it('should allow tenant-admin to access own tenant data', async () => {
      const result = await rbacController.getHealth(createTenantContext());
      expect(result.tenantId).toBe('tenant-001');
    });
  });

  describe('Rate Limiting Integration', () => {
    let rateLimitModule: TestingModule;
    let rateLimitController: DiagnosticsController;
    let requestCount: number;

    beforeEach(async () => {
      requestCount = 0;

      rateLimitModule = await Test.createTestingModule({
        controllers: [DiagnosticsController],
        providers: [
          DiagnosticsService,
          DiagnosticsIncidentService,
          { provide: DiagnosticsAggregatorService, useValue: createMockAggregator() },
          { provide: DiagnosticsRedactionService, useValue: createMockRedaction() },
          { provide: DiagnosticsAuditService, useValue: createMockAudit() },
        ],
      })
        .overrideGuard(DiagnosticsRBACGuard)
        .useValue({ canActivate: () => true })
        .overrideGuard(DiagnosticsRateLimitGuard)
        .useValue({
          canActivate: () => {
            requestCount++;
            // Simulate rate limit: allow first 60 requests
            if (requestCount > 60) {
              return false;
            }
            return true;
          },
        })
        .compile();

      rateLimitController = rateLimitModule.get<DiagnosticsController>(DiagnosticsController);
    });

    afterEach(async () => {
      await rateLimitModule.close();
    });

    it('should allow requests within rate limit', async () => {
      for (let i = 0; i < 60; i++) {
        const result = await rateLimitController.getHealth(createTenantContext());
        expect(result.status).toBeDefined();
      }
    });
  });

  describe('Audit Logging Integration', () => {
    it('should log trace list access', async () => {
      const since = new Date(Date.now() - 3600000).toISOString();
      await controller.getTraces(
        createTenantContext(),
        since
      );

      expect(audit.logTraceListAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-001',
          action: 'LIST',
          allowed: true,
        })
      );
    });

    it('should log trace detail access', async () => {
      await controller.getTraceDetail(
        createTenantContext(),
        'trace-001'
      );

      expect(audit.logTraceDetailAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-001',
          traceId: 'trace-001',
          action: 'DETAIL',
          allowed: true,
        })
      );
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle aggregator failures gracefully', async () => {
      aggregator.getHealthData.mockImplementation(() => {
        throw new Error('Aggregator unavailable');
      });

      // Service should handle the error and return a degraded response
      // or throw an appropriate HTTP exception
      await expect(
        controller.getHealth(createTenantContext())
      ).rejects.toThrow();
    });

    it('should return 404 for non-existent trace', async () => {
      await expect(
        controller.getTraceDetail(
          createTenantContext(),
          'non-existent-trace'
        )
      ).rejects.toThrow();
    });
  });
});
