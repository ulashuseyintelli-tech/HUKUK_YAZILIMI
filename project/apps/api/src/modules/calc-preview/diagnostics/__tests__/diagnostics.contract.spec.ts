/**
 * Diagnostics Contract Tests
 * 
 * Phase 7A - Sprint 3 - Task 3.7
 * 
 * API response schema validation using Zod.
 * Ensures backward compatibility and contract stability.
 * 
 * @see .kiro/specs/self-serve-diagnostics/design.md
 */

import { z } from 'zod';

// ============================================================================
// RESPONSE SCHEMAS
// ============================================================================

/**
 * Health Response Schema
 */
const HealthStatusSchema = z.enum(['OK', 'DEGRADED', 'INCIDENT']);

const CircuitBreakerHealthInfoSchema = z.object({
  state: z.enum(['CLOSED', 'OPEN', 'HALF_OPEN']),
  openedAt: z.string().optional(),
  nextRetryAt: z.string().optional(),
});

const CacheHealthInfoSchema = z.object({
  hitRate: z.number().min(0).max(100),
  missRate: z.number().min(0).max(100),
  staleRate: z.number().min(0).max(100),
});

const RateLimitHealthInfoSchema = z.object({
  remaining: z.number().min(0),
  capacity: z.number().min(0),
  blocked: z.boolean(),
});

const PolicyEngineHealthInfoSchema = z.object({
  available: z.boolean(),
  lastCheck: z.string(),
});

const IncidentCriteriaSchema = z.object({
  successRateBelow95: z.boolean(),
  p95Above2000ms: z.boolean(),
  openBreakerCount: z.number().min(0),
  criticalTraceCount: z.number().min(0),
});

const DiagnosticsHealthResponseSchema = z.object({
  status: HealthStatusSchema,
  timestamp: z.string(),
  tenantId: z.string(),
  cache: CacheHealthInfoSchema,
  circuitBreakers: z.record(CircuitBreakerHealthInfoSchema),
  rateLimit: RateLimitHealthInfoSchema,
  policyEngine: PolicyEngineHealthInfoSchema,
  incidentCriteria: IncidentCriteriaSchema.optional(),
});

/**
 * Metrics Response Schema
 */
const MetricsWindowSchema = z.enum(['5m', '15m', '30m', '1h', '6h', '24h']);

const LatencyMetricsSchema = z.object({
  p50: z.number().min(0),
  p95: z.number().min(0),
  p99: z.number().min(0),
});

const RateMetricsSchema = z.object({
  success: z.number().min(0).max(100),
  fallback: z.number().min(0).max(100),
  stale: z.number().min(0).max(100),
  error: z.number().min(0).max(100),
});

const CountMetricsSchema = z.object({
  total: z.number().min(0),
  success: z.number().min(0),
  fallback: z.number().min(0),
  error: z.number().min(0),
});

const DiagnosticsMetricsResponseSchema = z.object({
  window: MetricsWindowSchema,
  tenantId: z.string(),
  timestamp: z.string(),
  latency: LatencyMetricsSchema,
  rates: RateMetricsSchema,
  counts: CountMetricsSchema,
});

/**
 * Trace List Response Schema
 */
const DiagnosticsTraceSummarySchema = z.object({
  traceId: z.string(),
  timestamp: z.string(),
  status: z.enum(['OK', 'DEGRADED', 'UNAVAILABLE']),
  durationMs: z.number().min(0),
  hasWarnings: z.boolean(),
  hasFallback: z.boolean(),
});

const DiagnosticsTraceListResponseSchema = z.object({
  traces: z.array(DiagnosticsTraceSummarySchema),
  pagination: z.object({
    total: z.number().min(0),
    limit: z.number().min(1).max(100),
    cursor: z.string().optional(),
    nextCursor: z.string().optional(),
    hasMore: z.boolean(),
  }),
  query: z.object({
    since: z.string(),
    until: z.string(),
    severity: z.string().optional(),
    status: z.string().optional(),
  }),
});

/**
 * Trace Detail Response Schema
 */
const DiagnosticsTraceDetailResponseSchema = z.object({
  trace: z.unknown(), // Redacted trace bundle
  truncated: z.boolean(),
  truncationReason: z.string().optional(),
  originalSizeBytes: z.number().optional(),
});

/**
 * Incident Response Schema
 */
const IncidentTypeSchema = z.enum([
  'CIRCUIT_BREAKER_OPEN',
  'HIGH_ERROR_RATE',
  'RATE_LIMIT_EXHAUSTED',
  'DEGRADED_SERVICE',
  'SLO_BREACH',
]);

const IncidentSeveritySchema = z.enum(['WARNING', 'CRITICAL']);
const IncidentStatusSchema = z.enum(['ONGOING', 'RESOLVED']);

const IncidentEvidenceSchema = z.object({
  source: z.enum(['metrics', 'circuit_breaker', 'rate_limit', 'trace']),
  metric: z.string().optional(),
  value: z.union([z.number(), z.string()]),
  threshold: z.union([z.number(), z.string()]),
  timestamp: z.string(),
  traceIds: z.array(z.string()).optional(),
  breakerName: z.string().optional(),
});

const DiagnosticsIncidentSchema = z.object({
  id: z.string(),
  type: IncidentTypeSchema,
  severity: IncidentSeveritySchema,
  status: IncidentStatusSchema,
  title: z.string(),
  description: z.string(),
  recommendation: z.string(),
  startedAt: z.string(),
  resolvedAt: z.string().optional(),
  durationMs: z.number().optional(),
  evidence: IncidentEvidenceSchema,
  tenantId: z.string(),
  affectedDependencies: z.array(z.string()).optional(),
});

const IncidentSummaryStatsSchema = z.object({
  total: z.number().min(0),
  ongoing: z.number().min(0),
  resolved: z.number().min(0),
  bySeverity: z.object({
    WARNING: z.number().min(0),
    CRITICAL: z.number().min(0),
  }),
  byType: z.object({
    CIRCUIT_BREAKER_OPEN: z.number().min(0),
    HIGH_ERROR_RATE: z.number().min(0),
    RATE_LIMIT_EXHAUSTED: z.number().min(0),
    DEGRADED_SERVICE: z.number().min(0),
    SLO_BREACH: z.number().min(0),
  }),
});

const DiagnosticsIncidentResponseSchema = z.object({
  incidents: z.array(DiagnosticsIncidentSchema),
  summary: IncidentSummaryStatsSchema,
  period: z.object({
    since: z.string(),
    until: z.string(),
  }),
  tenantId: z.string(),
  timestamp: z.string(),
});

/**
 * Error Response Schema
 */
const DiagnosticsErrorResponseSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
  details: z.object({
    field: z.string().optional(),
    validValues: z.array(z.string()).optional(),
    retryAfter: z.number().optional(),
  }).optional(),
});

// ============================================================================
// CONTRACT TESTS
// ============================================================================

describe('Diagnostics API Contract Tests', () => {
  describe('Health Response Contract', () => {
    it('should validate a healthy system response', () => {
      const response = {
        status: 'OK',
        timestamp: '2026-01-17T10:00:00Z',
        tenantId: 'tenant-001',
        cache: { hitRate: 85, missRate: 15, staleRate: 5 },
        circuitBreakers: {
          policy_engine: { state: 'CLOSED' },
          rate_provider: { state: 'CLOSED' },
        },
        rateLimit: { remaining: 50, capacity: 60, blocked: false },
        policyEngine: { available: true, lastCheck: '2026-01-17T10:00:00Z' },
        incidentCriteria: {
          successRateBelow95: false,
          p95Above2000ms: false,
          openBreakerCount: 0,
          criticalTraceCount: 0,
        },
      };

      const result = DiagnosticsHealthResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate a degraded system response', () => {
      const response = {
        status: 'DEGRADED',
        timestamp: '2026-01-17T10:00:00Z',
        tenantId: 'tenant-001',
        cache: { hitRate: 70, missRate: 30, staleRate: 10 },
        circuitBreakers: {
          policy_engine: { state: 'OPEN', openedAt: '2026-01-17T09:55:00Z' },
          rate_provider: { state: 'CLOSED' },
        },
        rateLimit: { remaining: 10, capacity: 60, blocked: false },
        policyEngine: { available: false, lastCheck: '2026-01-17T09:55:00Z' },
        incidentCriteria: {
          successRateBelow95: false,
          p95Above2000ms: false,
          openBreakerCount: 1,
          criticalTraceCount: 0,
        },
      };

      const result = DiagnosticsHealthResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject invalid health status', () => {
      const response = {
        status: 'INVALID',
        timestamp: '2026-01-17T10:00:00Z',
        tenantId: 'tenant-001',
        cache: { hitRate: 85, missRate: 15, staleRate: 5 },
        circuitBreakers: {},
        rateLimit: { remaining: 50, capacity: 60, blocked: false },
        policyEngine: { available: true, lastCheck: '2026-01-17T10:00:00Z' },
      };

      const result = DiagnosticsHealthResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });

  describe('Metrics Response Contract', () => {
    it('should validate a valid metrics response', () => {
      const response = {
        window: '15m',
        tenantId: 'tenant-001',
        timestamp: '2026-01-17T10:00:00Z',
        latency: { p50: 150, p95: 450, p99: 800 },
        rates: { success: 98, fallback: 2, stale: 5, error: 2 },
        counts: { total: 1000, success: 980, fallback: 20, error: 20 },
      };

      const result = DiagnosticsMetricsResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject invalid window value', () => {
      const response = {
        window: '10m', // Invalid
        tenantId: 'tenant-001',
        timestamp: '2026-01-17T10:00:00Z',
        latency: { p50: 150, p95: 450, p99: 800 },
        rates: { success: 98, fallback: 2, stale: 5, error: 2 },
        counts: { total: 1000, success: 980, fallback: 20, error: 20 },
      };

      const result = DiagnosticsMetricsResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });

    it('should reject rates outside 0-100 range', () => {
      const response = {
        window: '15m',
        tenantId: 'tenant-001',
        timestamp: '2026-01-17T10:00:00Z',
        latency: { p50: 150, p95: 450, p99: 800 },
        rates: { success: 150, fallback: 2, stale: 5, error: 2 }, // Invalid
        counts: { total: 1000, success: 980, fallback: 20, error: 20 },
      };

      const result = DiagnosticsMetricsResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });

  describe('Trace List Response Contract', () => {
    it('should validate a valid trace list response', () => {
      const response = {
        traces: [
          {
            traceId: 'trace-001',
            timestamp: '2026-01-17T10:00:00Z',
            status: 'OK',
            durationMs: 250,
            hasWarnings: false,
            hasFallback: false,
          },
          {
            traceId: 'trace-002',
            timestamp: '2026-01-17T09:59:00Z',
            status: 'DEGRADED',
            durationMs: 1500,
            hasWarnings: true,
            hasFallback: true,
          },
        ],
        pagination: {
          total: 100,
          limit: 20,
          hasMore: true,
          nextCursor: 'abc123',
        },
        query: {
          since: '2026-01-16T10:00:00Z',
          until: '2026-01-17T10:00:00Z',
        },
      };

      const result = DiagnosticsTraceListResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject invalid trace status', () => {
      const response = {
        traces: [
          {
            traceId: 'trace-001',
            timestamp: '2026-01-17T10:00:00Z',
            status: 'INVALID', // Invalid
            durationMs: 250,
            hasWarnings: false,
            hasFallback: false,
          },
        ],
        pagination: { total: 1, limit: 20, hasMore: false },
        query: { since: '2026-01-16T10:00:00Z', until: '2026-01-17T10:00:00Z' },
      };

      const result = DiagnosticsTraceListResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });

  describe('Trace Detail Response Contract', () => {
    it('should validate a non-truncated trace detail', () => {
      const response = {
        trace: { meta: { traceId: 'trace-001' }, result: { status: 'OK' } },
        truncated: false,
      };

      const result = DiagnosticsTraceDetailResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate a truncated trace detail', () => {
      const response = {
        trace: { meta: { traceId: 'trace-001' }, _truncated: true },
        truncated: true,
        truncationReason: 'Trace size exceeds 10MB limit',
        originalSizeBytes: 15000000,
      };

      const result = DiagnosticsTraceDetailResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('Incident Response Contract', () => {
    it('should validate a valid incident response', () => {
      const response = {
        incidents: [
          {
            id: 'incident-001',
            type: 'CIRCUIT_BREAKER_OPEN',
            severity: 'WARNING',
            status: 'ONGOING',
            title: 'Devre Kesici Açık',
            description: 'policy_engine bağımlılığı için devre kesici açık durumda.',
            recommendation: 'Bağımlılık servisinin durumunu kontrol edin.',
            startedAt: '2026-01-17T09:55:00Z',
            evidence: {
              source: 'circuit_breaker',
              breakerName: 'policy_engine',
              value: 'OPEN',
              threshold: 'CLOSED',
              timestamp: '2026-01-17T09:55:00Z',
            },
            tenantId: 'tenant-001',
            affectedDependencies: ['policy_engine'],
          },
        ],
        summary: {
          total: 1,
          ongoing: 1,
          resolved: 0,
          bySeverity: { WARNING: 1, CRITICAL: 0 },
          byType: {
            CIRCUIT_BREAKER_OPEN: 1,
            HIGH_ERROR_RATE: 0,
            RATE_LIMIT_EXHAUSTED: 0,
            DEGRADED_SERVICE: 0,
            SLO_BREACH: 0,
          },
        },
        period: {
          since: '2026-01-16T10:00:00Z',
          until: '2026-01-17T10:00:00Z',
        },
        tenantId: 'tenant-001',
        timestamp: '2026-01-17T10:00:00Z',
      };

      const result = DiagnosticsIncidentResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject invalid incident type', () => {
      const response = {
        incidents: [
          {
            id: 'incident-001',
            type: 'INVALID_TYPE', // Invalid
            severity: 'WARNING',
            status: 'ONGOING',
            title: 'Test',
            description: 'Test',
            recommendation: 'Test',
            startedAt: '2026-01-17T09:55:00Z',
            evidence: {
              source: 'metrics',
              value: 90,
              threshold: 95,
              timestamp: '2026-01-17T09:55:00Z',
            },
            tenantId: 'tenant-001',
          },
        ],
        summary: {
          total: 1,
          ongoing: 1,
          resolved: 0,
          bySeverity: { WARNING: 1, CRITICAL: 0 },
          byType: {
            CIRCUIT_BREAKER_OPEN: 0,
            HIGH_ERROR_RATE: 0,
            RATE_LIMIT_EXHAUSTED: 0,
            DEGRADED_SERVICE: 0,
            SLO_BREACH: 0,
          },
        },
        period: { since: '2026-01-16T10:00:00Z', until: '2026-01-17T10:00:00Z' },
        tenantId: 'tenant-001',
        timestamp: '2026-01-17T10:00:00Z',
      };

      const result = DiagnosticsIncidentResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });

  describe('Error Response Contract', () => {
    it('should validate a valid error response', () => {
      const response = {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid window value: 10m',
        details: {
          field: 'window',
          validValues: ['5m', '15m', '30m', '1h', '6h', '24h'],
        },
      };

      const result = DiagnosticsErrorResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate error response without details', () => {
      const response = {
        statusCode: 403,
        error: 'Forbidden',
        message: 'Access denied to this trace',
      };

      const result = DiagnosticsErrorResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });
});

// Export schemas for reuse
export {
  DiagnosticsHealthResponseSchema,
  DiagnosticsMetricsResponseSchema,
  DiagnosticsTraceListResponseSchema,
  DiagnosticsTraceDetailResponseSchema,
  DiagnosticsIncidentResponseSchema,
  DiagnosticsErrorResponseSchema,
};
