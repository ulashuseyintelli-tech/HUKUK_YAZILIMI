/**
 * Diagnostics Controller
 * 
 * Phase 7A - Sprint 1 & 2
 * 
 * HTTP endpoints for self-serve diagnostics.
 * All endpoints under /calc/diagnostics/ prefix.
 * 
 * Guards applied:
 * - DiagnosticsRBACGuard: Tenant isolation (first line)
 * - DiagnosticsRateLimitGuard: Rate limiting with burst protection
 * 
 * @see .kiro/specs/self-serve-diagnostics/design.md
 */

import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DiagnosticsService } from './diagnostics.service';
import { DiagnosticsRBACGuard, DiagnosticsRateLimitGuard, TenantContext } from './guards';
import {
  TenantAccessContext,
  DiagnosticsHealthResponse,
  DiagnosticsMetricsResponse,
  DiagnosticsTraceListResponse,
  DiagnosticsTraceDetailResponse,
  DiagnosticsIncidentResponse,
  MetricsWindow,
  TraceListQuery,
  TraceSeverityFilter,
  TraceStatusFilter,
  isValidMetricsWindow,
  VALID_METRICS_WINDOWS,
} from './diagnostics.types';

// ============================================================================
// CONTROLLER
// ============================================================================

@Controller('calc/diagnostics')
@UseGuards(DiagnosticsRBACGuard, DiagnosticsRateLimitGuard)
export class DiagnosticsController {
  private readonly logger = new Logger(DiagnosticsController.name);

  constructor(
    private readonly diagnosticsService: DiagnosticsService,
  ) {}

  // ============================================================================
  // HEALTH ENDPOINT
  // ============================================================================

  /**
   * GET /calc/diagnostics/health
   * 
   * Returns system health status for the tenant.
   * 
   * Response:
   * - status: OK | DEGRADED | INCIDENT
   * - cache: hit/miss/stale rates
   * - circuitBreakers: state per dependency
   * - rateLimit: remaining/capacity/blocked
   * - policyEngine: available/lastCheck
   * - incidentCriteria: SLO evaluation details
   */
  @Get('health')
  async getHealth(
    @TenantContext() ctx: TenantAccessContext,
  ): Promise<DiagnosticsHealthResponse> {
    this.logger.debug(`[Controller] GET /health`, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });
    
    return this.diagnosticsService.getHealth(ctx.tenantId);
  }

  // ============================================================================
  // METRICS ENDPOINT
  // ============================================================================

  /**
   * GET /calc/diagnostics/metrics
   * 
   * Returns metrics summary for the tenant.
   * 
   * Query params:
   * - window: 5m | 15m | 30m | 1h | 6h | 24h (default: 15m)
   * 
   * Response:
   * - latency: p50, p95, p99
   * - rates: success, fallback, stale, error (0-100)
   * - counts: total, success, fallback, error
   */
  @Get('metrics')
  async getMetrics(
    @TenantContext() ctx: TenantAccessContext,
    @Query('window') window?: string,
  ): Promise<DiagnosticsMetricsResponse> {
    // Validate window parameter
    const validatedWindow = this.validateWindow(window);
    
    this.logger.debug(`[Controller] GET /metrics`, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      window: validatedWindow,
    });
    
    return this.diagnosticsService.getMetrics(ctx.tenantId, validatedWindow);
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  /**
   * Validate metrics window parameter
   * 
   * Property 5: Valid Window Values
   * - If window is valid, return it
   * - If window is invalid, return 400 Bad Request
   * - If window is missing, default to '15m'
   */
  private validateWindow(window?: string): MetricsWindow {
    // Default
    if (!window) {
      return '15m';
    }
    
    // Validate
    if (!isValidMetricsWindow(window)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: `Invalid window value: ${window}`,
        details: {
          field: 'window',
          validValues: VALID_METRICS_WINDOWS,
        },
      });
    }
    
    return window;
  }

  // ============================================================================
  // TRACE ENDPOINTS (Sprint 2)
  // ============================================================================

  /**
   * GET /calc/diagnostics/traces
   * 
   * Returns paginated trace list for the tenant.
   * 
   * Query params:
   * - since: ISO 8601 timestamp (REQUIRED)
   * - until: ISO 8601 timestamp (default: now)
   * - severity: INFO | WARN | CRITICAL
   * - status: OK | DEGRADED | UNAVAILABLE
   * - cursor: Pagination cursor
   * - limit: Max results (default: 20, max: 100)
   * 
   * Response:
   * - traces: Array of trace summaries (PII-free)
   * - pagination: total, limit, cursor, nextCursor, hasMore
   * - query: Echoed query parameters
   */
  @Get('traces')
  async getTraces(
    @TenantContext() ctx: TenantAccessContext,
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('severity') severity?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitStr?: string,
  ): Promise<DiagnosticsTraceListResponse> {
    this.logger.debug(`[Controller] GET /traces`, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      since,
      until,
    });
    
    // Build query object
    const query: TraceListQuery = {
      since: since || '', // Service will validate
      ...(until ? { until } : {}),
      ...(severity ? { severity: severity as TraceSeverityFilter } : {}),
      ...(status ? { status: status as TraceStatusFilter } : {}),
      ...(cursor ? { cursor } : {}),
      ...(limitStr ? { limit: parseInt(limitStr, 10) } : {}),
    };
    
    return this.diagnosticsService.getTraces(ctx, query);
  }

  /**
   * GET /calc/diagnostics/traces/:traceId
   * 
   * Returns trace detail (redacted).
   * 
   * Rate limit: 30/min (separate bucket from general endpoints)
   * 
   * Response:
   * - trace: Redacted trace bundle
   * - truncated: Whether trace was truncated due to size
   * - truncationReason: Reason for truncation (if truncated)
   * - originalSizeBytes: Original size before truncation (if truncated)
   * 
   * Errors:
   * - 403: Access denied (wrong tenant)
   * - 404: Trace not found
   */
  @Get('traces/:traceId')
  async getTraceDetail(
    @TenantContext() ctx: TenantAccessContext,
    @Param('traceId') traceId: string,
  ): Promise<DiagnosticsTraceDetailResponse> {
    this.logger.debug(`[Controller] GET /traces/:traceId`, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      traceId,
    });
    
    return this.diagnosticsService.getTraceDetail(ctx, traceId);
  }

  // ============================================================================
  // INCIDENT ENDPOINTS (Sprint 3)
  // ============================================================================

  /**
   * GET /calc/diagnostics/incidents/recent
   * 
   * Returns recent incidents for the tenant (last 24 hours).
   * 
   * Response:
   * - incidents: Array of detected incidents
   * - summary: total, ongoing, resolved, bySeverity, byType
   * - period: since, until
   * 
   * Incident types:
   * - CIRCUIT_BREAKER_OPEN: Devre kesici açık
   * - HIGH_ERROR_RATE: Yüksek hata oranı
   * - RATE_LIMIT_EXHAUSTED: Rate limit aşıldı
   * - DEGRADED_SERVICE: Servis düşük performansta
   * - SLO_BREACH: SLO ihlali
   */
  @Get('incidents/recent')
  async getRecentIncidents(
    @TenantContext() ctx: TenantAccessContext,
  ): Promise<DiagnosticsIncidentResponse> {
    this.logger.debug(`[Controller] GET /incidents/recent`, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });
    
    return this.diagnosticsService.getRecentIncidents(ctx.tenantId);
  }
}
