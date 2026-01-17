/**
 * Diagnostics Service - Main Business Logic
 * 
 * Phase 7A - Sprint 1 & 2
 * 
 * Defense in Depth - Last Line:
 * - ALL public methods require tenantScope parameter
 * - NO overload without tenantScope (compile-time "global read" yasağı)
 * 
 * @see .kiro/specs/self-serve-diagnostics/design.md
 */

import { Injectable, Logger, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { DiagnosticsAggregatorService } from './diagnostics-aggregator.service';
import { DiagnosticsRedactionService } from './diagnostics-redaction.service';
import { DiagnosticsAuditService } from './diagnostics-audit.service';
import {
  TenantAccessContext,
  DiagnosticsHealthResponse,
  DiagnosticsMetricsResponse,
  DiagnosticsTraceListResponse,
  DiagnosticsTraceDetailResponse,
  DiagnosticsIncidentResponse,
  IncidentSummaryStats,
  HealthStatus,
  MetricsWindow,
  IncidentCriteria,
  TraceListQuery,
  DIAGNOSTICS_SLO,
  TRACE_QUERY_LIMITS,
  TRACE_SIZE_LIMITS,
} from './diagnostics.types';
import { DiagnosticsIncidentService } from './diagnostics-incident.service';

// ============================================================================
// SERVICE CONTRACT (Defense in Depth)
// ============================================================================

/**
 * Service contract - tenantScope ZORUNLU
 * 
 * ✅ DOĞRU: tenantScope zorunlu
 * ❌ YANLIŞ: tenantScope'suz overload YASAK
 */
interface DiagnosticsServiceContract {
  getHealth(tenantScope: string): Promise<DiagnosticsHealthResponse>;
  getMetrics(tenantScope: string, window: MetricsWindow): Promise<DiagnosticsMetricsResponse>;
  getTraces(ctx: TenantAccessContext, query: TraceListQuery): Promise<DiagnosticsTraceListResponse>;
  getTraceDetail(ctx: TenantAccessContext, traceId: string): Promise<DiagnosticsTraceDetailResponse>;
  getRecentIncidents(tenantScope: string): Promise<DiagnosticsIncidentResponse>;
}

// ============================================================================
// DIAGNOSTICS SERVICE
// ============================================================================

@Injectable()
export class DiagnosticsService implements DiagnosticsServiceContract {
  private readonly logger = new Logger(DiagnosticsService.name);

  constructor(
    private readonly aggregator: DiagnosticsAggregatorService,
    private readonly redaction: DiagnosticsRedactionService,
    private readonly audit: DiagnosticsAuditService,
    private readonly incidentService: DiagnosticsIncidentService,
  ) {}

  // ============================================================================
  // HEALTH
  // ============================================================================

  /**
   * Get health status for a tenant
   * 
   * @param tenantScope - REQUIRED (Defense in Depth - Last Line)
   * 
   * Health Status Derivation:
   * - INCIDENT: success < 95% OR p95 > 2000ms OR breakers >= 2
   * - DEGRADED: breakers >= 1
   * - OK: otherwise
   */
  async getHealth(tenantScope: string): Promise<DiagnosticsHealthResponse> {
    this.logger.debug(`[Diagnostics] getHealth for tenant: ${tenantScope}`);
    
    // 1. Aggregate health data
    const healthData = this.aggregator.getHealthData(tenantScope);
    
    // 2. Get SLO status for health derivation
    const sloStatus = this.aggregator.getSLOStatus(tenantScope);
    
    // 3. Derive health status
    const incidentCriteria = this.evaluateIncidentCriteria(sloStatus);
    const status = this.deriveHealthStatus(incidentCriteria);
    
    // 4. Build response
    const response: DiagnosticsHealthResponse = {
      status,
      timestamp: new Date().toISOString(),
      tenantId: tenantScope,
      cache: healthData.cache,
      circuitBreakers: healthData.circuitBreakers,
      rateLimit: healthData.rateLimit,
      policyEngine: healthData.policyEngine,
      incidentCriteria,
    };
    
    this.logger.debug(`[Diagnostics] Health status: ${status}`, {
      tenantId: tenantScope,
      incidentCriteria,
    });
    
    return response;
  }

  // ============================================================================
  // METRICS
  // ============================================================================

  /**
   * Get metrics for a tenant and time window
   * 
   * @param tenantScope - REQUIRED (Defense in Depth - Last Line)
   * @param window - Time window (5m, 15m, 30m, 1h, 6h, 24h)
   */
  async getMetrics(
    tenantScope: string,
    window: MetricsWindow,
  ): Promise<DiagnosticsMetricsResponse> {
    this.logger.debug(`[Diagnostics] getMetrics for tenant: ${tenantScope}, window: ${window}`);
    
    // 1. Aggregate metrics data
    const metricsData = this.aggregator.getMetricsData(tenantScope, window);
    
    // 2. Build response
    const response: DiagnosticsMetricsResponse = {
      window,
      tenantId: tenantScope,
      timestamp: new Date().toISOString(),
      latency: metricsData.latency,
      rates: metricsData.rates,
      counts: metricsData.counts,
    };
    
    return response;
  }

  // ============================================================================
  // HEALTH STATUS DERIVATION
  // ============================================================================

  /**
   * Evaluate incident criteria
   */
  private evaluateIncidentCriteria(sloStatus: {
    successRate: number;
    p95Latency: number;
    openBreakerCount: number;
  }): IncidentCriteria {
    return {
      successRateBelow95: sloStatus.successRate < DIAGNOSTICS_SLO.SUCCESS_RATE_MIN,
      p95Above2000ms: sloStatus.p95Latency > DIAGNOSTICS_SLO.P95_LATENCY_MAX_MS,
      openBreakerCount: sloStatus.openBreakerCount,
      criticalTraceCount: 0, // TODO: Implement in Sprint 2
    };
  }

  /**
   * Derive health status from incident criteria
   * 
   * Property 2: Health Status Derivation
   * - INCIDENT: success < 95% OR p95 > 2000ms OR breakers >= 2 OR critical traces >= 5
   * - DEGRADED: breakers >= 1
   * - OK: otherwise
   */
  private deriveHealthStatus(criteria: IncidentCriteria): HealthStatus {
    // INCIDENT conditions
    if (
      criteria.successRateBelow95 ||
      criteria.p95Above2000ms ||
      criteria.openBreakerCount >= DIAGNOSTICS_SLO.OPEN_BREAKER_THRESHOLD ||
      criteria.criticalTraceCount >= DIAGNOSTICS_SLO.CRITICAL_TRACE_THRESHOLD
    ) {
      return 'INCIDENT';
    }
    
    // DEGRADED conditions
    if (criteria.openBreakerCount >= DIAGNOSTICS_SLO.DEGRADED_BREAKER_COUNT) {
      return 'DEGRADED';
    }
    
    // OK
    return 'OK';
  }

  // ============================================================================
  // TRACES (Sprint 2)
  // ============================================================================

  /**
   * Get traces for a tenant
   * 
   * @param ctx - Tenant access context (REQUIRED)
   * @param query - Query parameters
   * 
   * Validation:
   * - since: REQUIRED
   * - max range: 24 hours
   * - limit max: 100
   */
  async getTraces(
    ctx: TenantAccessContext,
    query: TraceListQuery,
  ): Promise<DiagnosticsTraceListResponse> {
    this.logger.debug(`[Diagnostics] getTraces for tenant: ${ctx.tenantId}`);
    
    // 1. Validate query
    this.validateTraceQuery(query);
    
    // 2. Query traces from aggregator
    const result = this.aggregator.queryTraces(ctx.tenantId, query);
    
    // 3. Audit log
    this.audit.logTraceListAccess(ctx, query, true);
    
    // 4. Build response
    const until = query.until || new Date().toISOString();
    
    const response: DiagnosticsTraceListResponse = {
      traces: result.traces,
      pagination: {
        total: result.total,
        limit: query.limit || TRACE_QUERY_LIMITS.DEFAULT_LIMIT,
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
        hasMore: result.hasMore,
      },
      query: {
        since: query.since,
        until,
        ...(query.severity ? { severity: query.severity } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
    };
    
    return response;
  }

  /**
   * Get trace detail (redacted)
   * 
   * @param ctx - Tenant access context (REQUIRED)
   * @param traceId - Trace ID
   * 
   * Security:
   * - Wrong tenant → 403 Forbidden
   * - Not found → 404 Not Found
   * - Size limit: 10MB (truncate if larger)
   * - Redaction: PII masking applied
   */
  async getTraceDetail(
    ctx: TenantAccessContext,
    traceId: string,
  ): Promise<DiagnosticsTraceDetailResponse> {
    this.logger.debug(`[Diagnostics] getTraceDetail for trace: ${traceId}`);
    
    // 1. Check trace access
    const access = this.aggregator.checkTraceAccess(ctx.tenantId, traceId);
    
    // Not found
    if (!access.exists) {
      this.audit.logTraceDetailAccess(ctx, traceId, false, 'NOT_FOUND');
      throw new NotFoundException({
        statusCode: 404,
        error: 'Not Found',
        message: `Trace not found: ${traceId}`,
      });
    }
    
    // Wrong tenant → 403
    if (!access.belongsToTenant) {
      this.audit.logTraceDetailAccess(ctx, traceId, false, 'TENANT_MISMATCH');
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Access denied to this trace',
      });
    }
    
    // 2. Get trace
    const trace = this.aggregator.getTrace(ctx.tenantId, traceId);
    
    if (!trace) {
      // Should not happen after access check, but defensive
      this.audit.logTraceDetailAccess(ctx, traceId, false, 'NOT_FOUND_AFTER_CHECK');
      throw new NotFoundException({
        statusCode: 404,
        error: 'Not Found',
        message: `Trace not found: ${traceId}`,
      });
    }
    
    // 3. Apply redaction (fail-closed)
    const redactedTrace = this.redaction.redact(trace);
    
    // 4. Check size and truncate if needed
    const traceJson = JSON.stringify(redactedTrace);
    const sizeBytes = Buffer.byteLength(traceJson, 'utf-8');
    
    let truncated = false;
    let truncationReason: string | undefined;
    let finalTrace: unknown = redactedTrace;
    
    if (sizeBytes > TRACE_SIZE_LIMITS.MAX_SIZE_BYTES) {
      truncated = true;
      truncationReason = `Trace size (${sizeBytes} bytes) exceeds limit (${TRACE_SIZE_LIMITS.MAX_SIZE_BYTES} bytes)`;
      
      // Truncate: return summary only
      finalTrace = {
        meta: redactedTrace.meta,
        result: redactedTrace.result,
        warnings: redactedTrace.warnings,
        _truncated: true,
        _originalSizeBytes: sizeBytes,
      };
      
      this.logger.warn('[Diagnostics] Trace truncated due to size', {
        traceId,
        sizeBytes,
        limit: TRACE_SIZE_LIMITS.MAX_SIZE_BYTES,
      });
    }
    
    // 5. Audit log
    this.audit.logTraceDetailAccess(ctx, traceId, true);
    
    // 6. Build response
    const response: DiagnosticsTraceDetailResponse = {
      trace: finalTrace,
      truncated,
      ...(truncationReason ? { truncationReason } : {}),
      ...(truncated ? { originalSizeBytes: sizeBytes } : {}),
    };
    
    return response;
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  /**
   * Validate trace query parameters
   * 
   * Rules:
   * - since: REQUIRED
   * - max range: 24 hours
   * - limit max: 100
   */
  private validateTraceQuery(query: TraceListQuery): void {
    // since is required
    if (!query.since) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Query parameter "since" is required',
        details: { field: 'since' },
      });
    }
    
    // Validate date format
    const sinceDate = new Date(query.since);
    if (isNaN(sinceDate.getTime())) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid date format for "since"',
        details: { field: 'since' },
      });
    }
    
    // Validate until if provided
    const untilDate = query.until ? new Date(query.until) : new Date();
    if (query.until && isNaN(untilDate.getTime())) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid date format for "until"',
        details: { field: 'until' },
      });
    }
    
    // Check max range (24 hours)
    const rangeMs = untilDate.getTime() - sinceDate.getTime();
    if (rangeMs > TRACE_QUERY_LIMITS.MAX_RANGE_MS) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: `Time range exceeds maximum of 24 hours`,
        details: {
          field: 'since/until',
          validValues: ['Max range: 24 hours'],
        },
      });
    }
    
    // Check limit
    if (query.limit && query.limit > TRACE_QUERY_LIMITS.MAX_LIMIT) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: `Limit exceeds maximum of ${TRACE_QUERY_LIMITS.MAX_LIMIT}`,
        details: {
          field: 'limit',
          validValues: [`Max: ${TRACE_QUERY_LIMITS.MAX_LIMIT}`],
        },
      });
    }
  }

  // ============================================================================
  // INCIDENTS (Sprint 3)
  // ============================================================================

  /**
   * Get recent incidents for a tenant
   * 
   * @param tenantScope - REQUIRED (Defense in Depth - Last Line)
   * @returns Last 24 hours of incidents with summary stats
   */
  async getRecentIncidents(tenantScope: string): Promise<DiagnosticsIncidentResponse> {
    this.logger.debug(`[Diagnostics] getRecentIncidents for tenant: ${tenantScope}`);
    
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    // 1. Detect current incidents
    const detectionContext = this.aggregator.buildDetectionContext(tenantScope);
    this.incidentService.detectIncidents(detectionContext);
    
    // 2. Get recent incidents
    const incidents = this.incidentService.getRecentIncidents(
      tenantScope,
      since.toISOString(),
      now.toISOString(),
    );
    
    // 3. Build summary stats
    const summary = this.buildIncidentSummary(incidents);
    
    // 4. Build response
    const response: DiagnosticsIncidentResponse = {
      incidents,
      summary,
      period: {
        since: since.toISOString(),
        until: now.toISOString(),
      },
      tenantId: tenantScope,
      timestamp: now.toISOString(),
    };
    
    return response;
  }

  /**
   * Build incident summary stats
   */
  private buildIncidentSummary(incidents: DiagnosticsIncidentResponse['incidents']): IncidentSummaryStats {
    const summary: IncidentSummaryStats = {
      total: incidents.length,
      ongoing: 0,
      resolved: 0,
      bySeverity: {
        WARNING: 0,
        CRITICAL: 0,
      },
      byType: {
        CIRCUIT_BREAKER_OPEN: 0,
        HIGH_ERROR_RATE: 0,
        RATE_LIMIT_EXHAUSTED: 0,
        DEGRADED_SERVICE: 0,
        SLO_BREACH: 0,
      },
    };
    
    for (const incident of incidents) {
      // Status
      if (incident.status === 'ONGOING') {
        summary.ongoing++;
      } else {
        summary.resolved++;
      }
      
      // Severity
      summary.bySeverity[incident.severity]++;
      
      // Type
      summary.byType[incident.type]++;
    }
    
    return summary;
  }
}
