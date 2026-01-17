/**
 * Calc Preview Controller
 * 
 * POST /calc/preview/light - Unified preview endpoint
 * GET /calc/metrics - Dashboard metrics (Phase 4.1)
 * GET /calc/rate-limit/status - Rate limit status (Phase 4.2)
 * 
 * Eski endpoint'ler (interest-engine/preview, fee-engine/preview) 
 * backward compatibility için korunuyor.
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 4
 */

import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { CalcPreviewService } from './calc-preview.service';
import { CalcPreviewMetricsService } from './metrics/calc-preview-metrics.service';
import { CalcPreviewRateLimitService, CalcPreviewRateLimitGuard } from './rate-limit';
import { CalcPreviewCircuitBreakerService, DependencyName, CircuitStatus } from './circuit-breaker';
import { VersionedCacheService, CacheNamespace, CacheStats } from './cache';
import { LegacyDeprecationService, DeprecationStats } from './deprecation';
import { TraceStorageService, TraceStorageStats, TraceBundle } from './trace';
import { CalcPreviewRequest, CalcPreviewResponse } from './types';

@Controller('calc')
export class CalcPreviewController {
  constructor(
    private readonly calcPreviewService: CalcPreviewService,
    private readonly metricsService: CalcPreviewMetricsService,
    private readonly rateLimitService: CalcPreviewRateLimitService,
    private readonly circuitBreakerService: CalcPreviewCircuitBreakerService,
    private readonly cacheService: VersionedCacheService,
    private readonly deprecationService: LegacyDeprecationService,
    private readonly traceStorage: TraceStorageService,
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
  getMetrics(@Query('tenantId') tenantId?: string): {
    latency: { p50: number; p95: number; p99: number };
    successRate: number;
    fallbackRate: number;
    errorCount: number;
    requestCount: number;
    sloViolations: string[];
  } {
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
    blockedUntil?: string;
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
  // TRACE ENDPOINTS (Phase 5.1)
  // ============================================================================

  /**
   * GET /calc/trace/:traceId
   * 
   * Get a specific trace by ID (Phase 5.1)
   * For trusted/internal-ops only
   * 
   * @param traceId - Trace identifier
   */
  @Get('trace/:traceId')
  getTrace(@Param('traceId') traceId: string): TraceBundle {
    const trace = this.traceStorage.get(traceId);
    if (!trace) {
      throw new NotFoundException(`Trace not found: ${traceId}`);
    }
    return trace;
  }

  /**
   * GET /calc/trace/:traceId/download
   * 
   * Download trace as JSON file (Phase 5.1)
   * 
   * @param traceId - Trace identifier
   */
  @Get('trace/:traceId/download')
  downloadTrace(
    @Param('traceId') traceId: string,
    @Res() res: Response,
  ): void {
    const trace = this.traceStorage.get(traceId);
    if (!trace) {
      throw new NotFoundException(`Trace not found: ${traceId}`);
    }
    
    const filename = `trace-${traceId}-${trace.meta.startedAt.replace(/[:.]/g, '-')}.json`;
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(trace, null, 2));
  }

  /**
   * GET /calc/trace/recent
   * 
   * Get recent traces with optional filters (Phase 5.1)
   * 
   * @param tenantId - Optional tenant filter
   * @param severity - Optional shadow compare severity filter
   * @param status - Optional result status filter
   * @param limit - Max results (default 50)
   */
  @Get('trace/recent')
  getRecentTraces(
    @Query('tenantId') tenantId?: string,
    @Query('severity') severity?: 'NOISE' | 'MINOR' | 'MAJOR' | 'CRITICAL',
    @Query('status') status?: 'OK' | 'DEGRADED' | 'UNAVAILABLE',
    @Query('limit') limit?: string,
  ): TraceBundle[] {
    return this.traceStorage.query({
      tenantId,
      severity,
      status,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  /**
   * GET /calc/trace/stats
   * 
   * Get trace storage stats (Phase 5.1)
   */
  @Get('trace/stats')
  getTraceStats(): TraceStorageStats {
    return this.traceStorage.getStats();
  }
}
