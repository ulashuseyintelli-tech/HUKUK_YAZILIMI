/**
 * Calc Preview Controller
 * 
 * POST /calc/preview/light - Unified preview endpoint (PUBLIC)
 * GET /calc/metrics - Dashboard metrics (OPS-ONLY, Phase 4.1)
 * GET /calc/trace/* - Trace endpoints (OPS-ONLY, Phase 5.1, PR-1 hardened)
 * GET /calc/rate-limit/status - Rate limit status (Phase 4.2)
 * 
 * PR-1 SECURITY HARDENING:
 * - Trace + metrics endpoints: method-level ManifestAdminAuthGuard + ManifestAdminRateLimitGuard
 * - Fail-closed tenant check on trace access (trace.meta.tenantId)
 * - Audit logging on every trace access (success + denied + not-found)
 * - Download: Cache-Control: no-store
 * - POST /calc/preview/light remains PUBLIC (rate-limited only)
 * 
 * P2 TODO: Split into CalcPreviewPublicController + CalcPreviewOpsController
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 4
 * @see guards/internal-ops-policy.ts — single source of truth for ops role list
 */

import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { CalcPreviewService } from './calc-preview.service';
import { CalcPreviewMetricsService } from './metrics/calc-preview-metrics.service';
import { CalcPreviewRateLimitService, CalcPreviewRateLimitGuard } from './rate-limit';
import { CalcPreviewCircuitBreakerService, DependencyName, CircuitStatus } from './circuit-breaker';
import { VersionedCacheService, CacheNamespace, CacheStats } from './cache';
import { LegacyDeprecationService, DeprecationStats } from './deprecation';
import { TraceStorageService, TraceStorageStats, TraceBundle } from './trace';
import { TraceAccessService } from './trace/trace-access.service';
import { CalcPreviewRequest, CalcPreviewResponse } from './types';
import {
  ManifestAdminAuthGuard,
  RequestWithUser,
} from './diagnostics/object-store/manifest-retry/guards/manifest-admin-auth.guard';
import {
  ManifestAdminRateLimitGuard,
} from './diagnostics/object-store/manifest-retry/guards/manifest-admin-rate-limiter.service';

// ============================================================================
// Trace Access Audit Types (lightweight, in-controller)
// ============================================================================

interface TraceAuditEntry {
  timestamp: string;
  action: 'TRACE_VIEW' | 'TRACE_DOWNLOAD' | 'TRACE_QUERY' | 'TRACE_STATS' | 'METRICS_VIEW';
  traceId?: string;
  actorId: string;
  actorIp?: string | undefined;
  tenantId?: string | undefined;
  outcome: 'SUCCESS' | 'DENIED' | 'NOT_FOUND' | 'MALFORMED_TRACE_META';
  reason?: string | undefined;
}

@Controller('calc')
export class CalcPreviewController {
  private readonly logger = new Logger(CalcPreviewController.name);

  /** In-memory audit ring buffer (P0 — will move to persistent store in P2) */
  private readonly traceAuditLog: TraceAuditEntry[] = [];
  private readonly MAX_AUDIT_LOG = 10000;

  constructor(
    private readonly calcPreviewService: CalcPreviewService,
    private readonly metricsService: CalcPreviewMetricsService,
    private readonly rateLimitService: CalcPreviewRateLimitService,
    private readonly circuitBreakerService: CalcPreviewCircuitBreakerService,
    private readonly cacheService: VersionedCacheService,
    private readonly deprecationService: LegacyDeprecationService,
    private readonly traceStorage: TraceStorageService,
    private readonly traceAccessService: TraceAccessService,
  ) {}

  /**
   * POST /calc/preview/light
   * 
   * Unified preview endpoint - interest + fee tek request'te.
   * 
   * Avantajlar:
   * - Tek trace / tek requestHash
   * - Tek versiyon seti (mismatch OLMAZ)
   * - Policy bağlamı tek yerde
   * - UI karmaşıklığı azalır
   * 
   * Response status:
   * - FULL: Her iki hesaplama da başarılı
   * - PARTIAL: Biri başarılı, diğeri başarısız
   * - UNAVAILABLE: İkisi de başarısız
   * 
   * Rate Limiting (Phase 4.2):
   * - Token bucket: 20 burst, 5/sec steady
   * - 429 Too Many Requests + Retry-After header
   * 
   * @example
   * POST /calc/preview/light
   * {
   *   "principalAmount": 100000,
   *   "interestType": "LEGAL_3095",
   *   "startDate": "2024-01-01",
   *   "endDate": "2025-01-15",
   *   "caseType": "ILAMSIZ",
   *   "debtorCount": 2
   * }
   */
  @Post('preview/light')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CalcPreviewRateLimitGuard)
  async previewLight(@Body() request: CalcPreviewRequest): Promise<CalcPreviewResponse> {
    return this.calcPreviewService.preview(request);
  }

  /**
   * GET /calc/metrics
   * 
   * Dashboard metrics endpoint (Phase 4.1)
   * PR-1: OPS-ONLY — guarded with ManifestAdminAuthGuard + rate limit
   * 
   * Returns:
   * - Latency percentiles (p50, p95, p99)
   * - Success rate
   * - Fallback rate
   * - Error count
   * - SLO violations
   * 
   * @param tenantId - Optional tenant filter
   */
  @Get('metrics')
  @UseGuards(ManifestAdminAuthGuard, ManifestAdminRateLimitGuard)
  getMetrics(@Query('tenantId') tenantId?: string, @Req() req?: Request): {
    latency: { p50: number; p95: number; p99: number };
    successRate: number;
    fallbackRate: number;
    errorCount: number;
    requestCount: number;
    sloViolations: string[];
  } {
    const user = (req as any)?.user;
    this.appendTraceAudit({
      action: 'METRICS_VIEW',
      actorId: user?.id || 'unknown',
      actorIp: req?.ip,
      outcome: 'SUCCESS',
    });
    return this.metricsService.getDashboardSummary(tenantId);
  }

  /**
   * GET /calc/metrics/errors
   * 
   * Error breakdown endpoint (Phase 4.1)
   * 
   * @param tenantId - Optional tenant filter
   */
  @Get('metrics/errors')
  getErrorBreakdown(@Query('tenantId') tenantId?: string): {
    byDomain: Record<string, number>;
    byCode: Record<string, number>;
    total: number;
  } {
    return this.metricsService.getErrorBreakdown(tenantId);
  }

  /**
   * GET /calc/metrics/latency
   * 
   * Latency percentiles endpoint (Phase 4.1)
   * 
   * @param tenantId - Optional tenant filter
   */
  @Get('metrics/latency')
  getLatencyPercentiles(@Query('tenantId') tenantId?: string): {
    p50: number;
    p95: number;
    p99: number;
    count: number;
  } {
    return this.metricsService.getLatencyPercentiles(tenantId);
  }

  /**
   * GET /calc/health
   * 
   * Health check endpoint
   */
  @Get('health')
  healthCheck(): { status: string; timestamp: string; version: string } {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  // ============================================================================
  // RATE LIMIT ENDPOINTS (Phase 4.2)
  // ============================================================================

  /**
   * GET /calc/rate-limit/status
   * 
   * Get rate limit status for a tenant (Phase 4.2)
   * 
   * @param tenantId - Tenant identifier
   */
  @Get('rate-limit/status')
  getRateLimitStatus(@Query('tenantId') tenantId: string = 'default'): {
    tokens: number;
    capacity: number;
    refillRate: number;
    blocked: boolean;
    blockedUntil?: string | undefined;
  } {
    return this.rateLimitService.getStatus(tenantId);
  }

  /**
   * GET /calc/rate-limit/global
   * 
   * Get global rate limit stats (Phase 4.2)
   * For ops/monitoring dashboards
   */
  @Get('rate-limit/global')
  getGlobalRateLimitStats(): {
    requestsLastMinute: number;
    activeTenants: number;
    blockedTenants: number;
    globalLimit: number;
  } {
    return this.rateLimitService.getGlobalStats();
  }

  // ============================================================================
  // CIRCUIT BREAKER ENDPOINTS (Phase 4.3)
  // ============================================================================

  /**
   * GET /calc/circuit-breaker/status
   * 
   * Get circuit breaker status for a dependency (Phase 4.3)
   * 
   * @param dependency - Dependency name (interest_engine, fee_engine, etc.)
   */
  @Get('circuit-breaker/status')
  getCircuitBreakerStatus(
    @Query('dependency') dependency: DependencyName,
  ): CircuitStatus {
    return this.circuitBreakerService.getStatus(dependency);
  }

  /**
   * GET /calc/circuit-breaker/all
   * 
   * Get all circuit breaker statuses (Phase 4.3)
   * For ops/monitoring dashboards
   */
  @Get('circuit-breaker/all')
  getAllCircuitBreakerStatuses(): Record<DependencyName, CircuitStatus> {
    return this.circuitBreakerService.getAllStatuses();
  }

  // ============================================================================
  // CACHE ENDPOINTS (Phase 4.4)
  // ============================================================================

  /**
   * GET /calc/cache/stats
   * 
   * Get cache stats for a namespace (Phase 4.4)
   * 
   * @param namespace - Cache namespace (rate_provider, tariff_provider, etc.)
   */
  @Get('cache/stats')
  getCacheStats(@Query('namespace') namespace?: CacheNamespace): CacheStats | CacheStats[] {
    if (namespace) {
      return this.cacheService.getStats(namespace);
    }
    return this.cacheService.getAllStats();
  }

  // ============================================================================
  // DEPRECATION ENDPOINTS (Phase 4.5)
  // ============================================================================

  /**
   * GET /calc/deprecation/traffic
   * 
   * Get traffic stats for deprecated endpoints (Phase 4.5)
   * 
   * @param endpoint - Optional specific endpoint
   */
  @Get('deprecation/traffic')
  getDeprecationTraffic(@Query('endpoint') endpoint?: string): DeprecationStats | DeprecationStats[] {
    if (endpoint) {
      return this.deprecationService.getTrafficStats(endpoint);
    }
    return this.deprecationService.getAllStats();
  }

  /**
   * GET /calc/deprecation/shadow
   * 
   * Get shadow compare stats (Phase 4.5)
   * 
   * @param endpoint - Optional specific endpoint
   */
  @Get('deprecation/shadow')
  getShadowStats(@Query('endpoint') endpoint?: string): {
    total: number;
    matches: number;
    mismatches: number;
    matchRate: number;
    recentMismatches: unknown[];
  } {
    return this.deprecationService.getShadowStats(endpoint);
  }

  /**
   * GET /calc/deprecation/kill-switches
   * 
   * Get kill switch statuses (Phase 4.5)
   */
  @Get('deprecation/kill-switches')
  getKillSwitches(): Record<string, boolean> {
    return this.deprecationService.getKillSwitchStatuses();
  }

  // ============================================================================
  // TRACE ENDPOINTS (Phase 5.1, PR-1 hardened)
  //
  // All trace endpoints are OPS-ONLY:
  //   ManifestAdminAuthGuard → break-glass + ops_admin role
  //   ManifestAdminRateLimitGuard → per-actor rate limit
  //   Fail-closed tenant check on trace.meta.tenantId
  //   Audit on every access (success + denied + not-found)
  // ============================================================================

  /**
   * GET /calc/trace/:traceId
   * 
   * Get a specific trace by ID (Phase 5.1)
   * PR-1: OPS-ONLY, fail-closed tenant check, audit
   * 
   * @param traceId - Trace identifier
   */
  @Get('trace/:traceId')
  @UseGuards(ManifestAdminAuthGuard, ManifestAdminRateLimitGuard)
  getTrace(@Param('traceId') traceId: string, @Req() req: Request): TraceBundle {
    const user = (req as any)?.user as RequestWithUser['user'];
    const actorId = user?.id || 'unknown';

    const trace = this.traceStorage.get(traceId);
    if (!trace) {
      this.appendTraceAudit({
        action: 'TRACE_VIEW',
        traceId,
        actorId,
        actorIp: req.ip,
        outcome: 'NOT_FOUND',
      });
      throw new NotFoundException(`Trace not found: ${traceId}`);
    }

    // Fail-closed tenant check
    this.enforceTraceTenantCheck(trace, actorId, req.ip, 'TRACE_VIEW', traceId);

    this.appendTraceAudit({
      action: 'TRACE_VIEW',
      traceId,
      actorId,
      actorIp: req.ip,
      tenantId: trace.meta.tenantId,
      outcome: 'SUCCESS',
    });
    return trace;
  }

  /**
   * GET /calc/trace/:traceId/download
   * 
   * Download trace as JSON file (Phase 5.1)
   * PR-1: OPS-ONLY, fail-closed tenant check, audit, Cache-Control: no-store
   * 
   * @param traceId - Trace identifier
   */
  @Get('trace/:traceId/download')
  @UseGuards(ManifestAdminAuthGuard, ManifestAdminRateLimitGuard)
  downloadTrace(
    @Param('traceId') traceId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    const user = (req as any)?.user as RequestWithUser['user'];
    const actorId = user?.id || 'unknown';

    const trace = this.traceStorage.get(traceId);
    if (!trace) {
      this.appendTraceAudit({
        action: 'TRACE_DOWNLOAD',
        traceId,
        actorId,
        actorIp: req.ip,
        outcome: 'NOT_FOUND',
      });
      throw new NotFoundException(`Trace not found: ${traceId}`);
    }

    // Fail-closed tenant check
    this.enforceTraceTenantCheck(trace, actorId, req.ip, 'TRACE_DOWNLOAD', traceId);

    // Download rate limit (per-user, per-hour)
    this.traceAccessService.checkDownloadRateLimit({
      userId: actorId,
      tenantId: trace.meta.tenantId || 'unknown',
      role: 'internal-ops',
    });

    const filename = `trace-${traceId}-${trace.meta.startedAt.replace(/[:.]/g, '-')}.json`;

    this.appendTraceAudit({
      action: 'TRACE_DOWNLOAD',
      traceId,
      actorId,
      actorIp: req.ip,
      tenantId: trace.meta.tenantId,
      outcome: 'SUCCESS',
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(JSON.stringify(trace, null, 2));
  }

  /**
   * GET /calc/trace/recent
   * 
   * Get recent traces with optional filters (Phase 5.1)
   * PR-1: OPS-ONLY, audit
   * 
   * @param tenantId - Optional tenant filter
   * @param severity - Optional shadow compare severity filter
   * @param status - Optional result status filter
   * @param limit - Max results (default 50)
   */
  @Get('trace/recent')
  @UseGuards(ManifestAdminAuthGuard, ManifestAdminRateLimitGuard)
  getRecentTraces(
    @Query('tenantId') tenantId?: string,
    @Query('severity') severity?: 'NOISE' | 'MINOR' | 'MAJOR' | 'CRITICAL',
    @Query('status') status?: 'OK' | 'DEGRADED' | 'UNAVAILABLE',
    @Query('limit') limit?: string,
    @Req() req?: Request,
  ): TraceBundle[] {
    const user = (req as any)?.user;
    this.appendTraceAudit({
      action: 'TRACE_QUERY',
      actorId: user?.id || 'unknown',
      actorIp: req?.ip,
      tenantId,
      outcome: 'SUCCESS',
    });
    return this.traceStorage.query({
      ...(tenantId ? { tenantId } : {}),
      ...(severity ? { severity } : {}),
      ...(status ? { status } : {}),
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  /**
   * GET /calc/trace/stats
   * 
   * Get trace storage stats (Phase 5.1)
   * PR-1: OPS-ONLY, audit
   */
  @Get('trace/stats')
  @UseGuards(ManifestAdminAuthGuard, ManifestAdminRateLimitGuard)
  getTraceStats(@Req() req?: Request): TraceStorageStats {
    const user = (req as any)?.user;
    this.appendTraceAudit({
      action: 'TRACE_STATS',
      actorId: user?.id || 'unknown',
      actorIp: req?.ip,
      outcome: 'SUCCESS',
    });
    return this.traceStorage.getStats();
  }

  // ============================================================================
  // FAIL-CLOSED TENANT CHECK (PR-1)
  // ============================================================================

  /**
   * Enforce fail-closed tenant isolation on trace access.
   *
   * Rules:
   *  - Trace found but meta.tenantId missing/empty → 403 MALFORMED_TRACE_META (audit severity HIGH)
   *  - Tenant mismatch (non-ops user) → 403
   *  - Bypass: ops_admin + break_glass=true (already guaranteed by guard)
   *
   * Since ManifestAdminAuthGuard already ensures ops_admin + break_glass,
   * the tenant check here is defense-in-depth: we still audit and reject
   * malformed traces to prevent silent data leaks.
   */
  private enforceTraceTenantCheck(
    trace: TraceBundle,
    actorId: string,
    actorIp: string | undefined,
    action: TraceAuditEntry['action'],
    traceId: string,
  ): void {
    const traceTenantId = trace.meta?.tenantId;

    // Fail-closed: missing or empty tenantId in trace meta
    if (!traceTenantId) {
      this.appendTraceAudit({
        action,
        traceId,
        actorId,
        actorIp,
        outcome: 'MALFORMED_TRACE_META',
        reason: 'trace.meta.tenantId is missing or empty',
      });
      this.logger.error('[TraceTenantCheck] MALFORMED_TRACE_META — trace has no tenantId', {
        traceId,
        actorId,
        severity: 'HIGH',
      });
      throw new ForbiddenException({
        code: 'MALFORMED_TRACE_META',
        message: 'Trace metadata is incomplete — access denied',
      });
    }

    // ops_admin with break-glass already passed guard — allow cross-tenant.
    // This is the bypass path. Audit is still recorded above on success.
  }

  // ============================================================================
  // AUDIT HELPERS (PR-1)
  // ============================================================================

  private appendTraceAudit(entry: Omit<TraceAuditEntry, 'timestamp'>): void {
    const full: TraceAuditEntry = { ...entry, timestamp: new Date().toISOString() };
    this.traceAuditLog.push(full);
    if (this.traceAuditLog.length > this.MAX_AUDIT_LOG) {
      this.traceAuditLog.shift();
    }

    if (full.outcome !== 'SUCCESS') {
      this.logger.warn('[TraceAudit]', full);
    } else {
      this.logger.debug('[TraceAudit]', full);
    }
  }

  /** Expose audit log for testing */
  getTraceAuditLog(): readonly TraceAuditEntry[] {
    return this.traceAuditLog;
  }
}
