/**
 * Diagnostics Incident Service
 * 
 * Phase 7A - Sprint 3 - Task 3.2
 * 
 * Incident detection logic - kanıta dayalı olay tespiti.
 * 
 * Kaynaklar:
 * - Metrics (success rate, p95 latency)
 * - Circuit breaker state changes / open duration
 * - Rate-limit exhaustion (429 count)
 * - Degraded service (fallback evidence)
 * 
 * Kural: Incident'lar "tahmin" değil, kanıta dayalı olmalı.
 * 
 * @see .kiro/specs/self-serve-diagnostics/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  IncidentSeverity,
  DiagnosticsIncident,
  IncidentDetectionConfig,
  DEFAULT_INCIDENT_CONFIG,
  INCIDENT_TYPE_META,
} from './diagnostics.types';

// ============================================================================
// DETECTION INPUT TYPES
// ============================================================================

export interface MetricsSnapshot {
  successRate: number;      // 0-100
  fallbackRate: number;     // 0-100
  p95LatencyMs: number;
  totalRequests: number;
  windowMs: number;
}

export interface CircuitBreakerSnapshot {
  name: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  openedAt?: string | undefined;
  openDurationMs?: number | undefined;
}

export interface RateLimitSnapshot {
  throttleCount: number;    // 429 count in window
  windowMs: number;
}

export interface DetectionContext {
  tenantId: string;
  timestamp: string;
  metrics: MetricsSnapshot;
  circuitBreakers: CircuitBreakerSnapshot[];
  rateLimit: RateLimitSnapshot;
}

// ============================================================================
// INCIDENT DETECTION SERVICE
// ============================================================================

@Injectable()
export class DiagnosticsIncidentService {
  private readonly logger = new Logger(DiagnosticsIncidentService.name);
  
  // In-memory incident storage (ring buffer)
  private readonly incidents: Map<string, DiagnosticsIncident> = new Map();
  private readonly MAX_INCIDENTS = 10000;
  
  // Configuration
  private config: IncidentDetectionConfig = DEFAULT_INCIDENT_CONFIG;

  /**
   * Detect incidents from current system state
   * 
   * @param ctx - Detection context with metrics, breakers, rate limit
   * @returns Array of detected incidents
   */
  detectIncidents(ctx: DetectionContext): DiagnosticsIncident[] {
    const detected: DiagnosticsIncident[] = [];
    
    // 1. Circuit breaker incidents
    const breakerIncidents = this.detectCircuitBreakerIncidents(ctx);
    detected.push(...breakerIncidents);
    
    // 2. High error rate incident
    const errorRateIncident = this.detectHighErrorRate(ctx);
    if (errorRateIncident) {
      detected.push(errorRateIncident);
    }
    
    // 3. Rate limit exhausted incident
    const rateLimitIncident = this.detectRateLimitExhausted(ctx);
    if (rateLimitIncident) {
      detected.push(rateLimitIncident);
    }
    
    // 4. Degraded service incident
    const degradedIncident = this.detectDegradedService(ctx);
    if (degradedIncident) {
      detected.push(degradedIncident);
    }
    
    // 5. SLO breach incident
    const sloIncident = this.detectSLOBreach(ctx);
    if (sloIncident) {
      detected.push(sloIncident);
    }
    
    // Store detected incidents
    for (const incident of detected) {
      this.storeIncident(incident);
    }
    
    this.logger.debug(`[Incident] Detected ${detected.length} incidents`, {
      tenantId: ctx.tenantId,
      types: detected.map(i => i.type),
    });
    
    return detected;
  }

  /**
   * Get recent incidents for a tenant
   * 
   * @param tenantId - REQUIRED
   * @param since - Start time (ISO 8601)
   * @param until - End time (ISO 8601), defaults to now
   */
  getRecentIncidents(
    tenantId: string,
    since: string,
    until?: string,
  ): DiagnosticsIncident[] {
    const sinceTime = new Date(since).getTime();
    const untilTime = until ? new Date(until).getTime() : Date.now();
    
    const incidents = Array.from(this.incidents.values())
      .filter(i => {
        if (i.tenantId !== tenantId) return false;
        const startedAt = new Date(i.startedAt).getTime();
        return startedAt >= sinceTime && startedAt <= untilTime;
      })
      .sort((a, b) => 
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      );
    
    return incidents;
  }

  /**
   * Resolve an incident
   */
  resolveIncident(incidentId: string): boolean {
    const incident = this.incidents.get(incidentId);
    if (!incident || incident.status === 'RESOLVED') {
      return false;
    }
    
    incident.status = 'RESOLVED';
    incident.resolvedAt = new Date().toISOString();
    incident.durationMs = new Date(incident.resolvedAt).getTime() - 
      new Date(incident.startedAt).getTime();
    
    this.logger.log(`[Incident] Resolved: ${incident.type}`, {
      incidentId,
      durationMs: incident.durationMs,
    });
    
    return true;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<IncidentDetectionConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.log('[Incident] Config updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): IncidentDetectionConfig {
    return { ...this.config };
  }

  /**
   * Clear incidents (for testing)
   */
  clear(): void {
    this.incidents.clear();
  }

  // ============================================================================
  // DETECTION METHODS
  // ============================================================================

  private detectCircuitBreakerIncidents(ctx: DetectionContext): DiagnosticsIncident[] {
    const incidents: DiagnosticsIncident[] = [];
    const cfg = this.config.circuitBreaker;
    
    const openBreakers = ctx.circuitBreakers.filter(cb => cb.state === 'OPEN');
    
    for (const breaker of openBreakers) {
      // Check minimum open duration
      if (breaker.openDurationMs && breaker.openDurationMs < cfg.minOpenDurationMs) {
        continue;
      }
      
      // Determine severity based on total open count
      const severity: IncidentSeverity = openBreakers.length >= cfg.criticalThreshold
        ? 'CRITICAL'
        : 'WARNING';
      
      const meta = INCIDENT_TYPE_META.CIRCUIT_BREAKER_OPEN;
      
      incidents.push({
        id: randomUUID(),
        type: 'CIRCUIT_BREAKER_OPEN',
        severity,
        status: 'ONGOING',
        title: meta.title,
        description: meta.descriptionTemplate
          .replace('{breakerName}', breaker.name),
        recommendation: meta.recommendationTemplate,
        startedAt: breaker.openedAt || ctx.timestamp,
        evidence: {
          source: 'circuit_breaker',
          breakerName: breaker.name,
          value: breaker.state,
          threshold: 'CLOSED',
          timestamp: ctx.timestamp,
        },
        tenantId: ctx.tenantId,
        affectedDependencies: [breaker.name],
      });
    }
    
    return incidents;
  }

  private detectHighErrorRate(ctx: DetectionContext): DiagnosticsIncident | null {
    const cfg = this.config.errorRate;
    const { successRate, totalRequests } = ctx.metrics;
    
    // Need minimum requests for statistical significance
    if (totalRequests < cfg.minRequestCount) {
      return null;
    }
    
    // Check thresholds
    let severity: IncidentSeverity | null = null;
    if (successRate < cfg.criticalSuccessRate) {
      severity = 'CRITICAL';
    } else if (successRate < cfg.warningSuccessRate) {
      severity = 'WARNING';
    }
    
    if (!severity) {
      return null;
    }
    
    const meta = INCIDENT_TYPE_META.HIGH_ERROR_RATE;
    const windowMinutes = Math.round(ctx.metrics.windowMs / 60000);
    
    return {
      id: randomUUID(),
      type: 'HIGH_ERROR_RATE',
      severity,
      status: 'ONGOING',
      title: meta.title,
      description: meta.descriptionTemplate
        .replace('{window}', `${windowMinutes} dakika`)
        .replace('{successRate}', successRate.toFixed(1))
        .replace('{threshold}', cfg.warningSuccessRate.toString()),
      recommendation: meta.recommendationTemplate,
      startedAt: ctx.timestamp,
      evidence: {
        source: 'metrics',
        metric: 'success_rate',
        value: successRate,
        threshold: severity === 'CRITICAL' ? cfg.criticalSuccessRate : cfg.warningSuccessRate,
        timestamp: ctx.timestamp,
      },
      tenantId: ctx.tenantId,
    };
  }

  private detectRateLimitExhausted(ctx: DetectionContext): DiagnosticsIncident | null {
    const cfg = this.config.rateLimit;
    const { throttleCount } = ctx.rateLimit;
    
    // Check thresholds
    let severity: IncidentSeverity | null = null;
    if (throttleCount >= cfg.criticalThrottleCount) {
      severity = 'CRITICAL';
    } else if (throttleCount >= cfg.warningThrottleCount) {
      severity = 'WARNING';
    }
    
    if (!severity) {
      return null;
    }
    
    const meta = INCIDENT_TYPE_META.RATE_LIMIT_EXHAUSTED;
    const windowMinutes = Math.round(ctx.rateLimit.windowMs / 60000);
    
    return {
      id: randomUUID(),
      type: 'RATE_LIMIT_EXHAUSTED',
      severity,
      status: 'ONGOING',
      title: meta.title,
      description: meta.descriptionTemplate
        .replace('{window}', `${windowMinutes} dakika`)
        .replace('{throttleCount}', throttleCount.toString()),
      recommendation: meta.recommendationTemplate,
      startedAt: ctx.timestamp,
      evidence: {
        source: 'rate_limit',
        metric: 'throttle_count',
        value: throttleCount,
        threshold: severity === 'CRITICAL' ? cfg.criticalThrottleCount : cfg.warningThrottleCount,
        timestamp: ctx.timestamp,
      },
      tenantId: ctx.tenantId,
    };
  }

  private detectDegradedService(ctx: DetectionContext): DiagnosticsIncident | null {
    const cfg = this.config.degradedService;
    const { fallbackRate } = ctx.metrics;
    
    // Check thresholds
    let severity: IncidentSeverity | null = null;
    if (fallbackRate >= cfg.criticalFallbackRate) {
      severity = 'CRITICAL';
    } else if (fallbackRate >= cfg.warningFallbackRate) {
      severity = 'WARNING';
    }
    
    if (!severity) {
      return null;
    }
    
    const meta = INCIDENT_TYPE_META.DEGRADED_SERVICE;
    const windowMinutes = Math.round(ctx.metrics.windowMs / 60000);
    
    return {
      id: randomUUID(),
      type: 'DEGRADED_SERVICE',
      severity,
      status: 'ONGOING',
      title: meta.title,
      description: meta.descriptionTemplate
        .replace('{window}', `${windowMinutes} dakika`)
        .replace('{fallbackRate}', fallbackRate.toFixed(1)),
      recommendation: meta.recommendationTemplate,
      startedAt: ctx.timestamp,
      evidence: {
        source: 'metrics',
        metric: 'fallback_rate',
        value: fallbackRate,
        threshold: severity === 'CRITICAL' ? cfg.criticalFallbackRate : cfg.warningFallbackRate,
        timestamp: ctx.timestamp,
      },
      tenantId: ctx.tenantId,
    };
  }

  private detectSLOBreach(ctx: DetectionContext): DiagnosticsIncident | null {
    const cfg = this.config.sloBreach;
    const { p95LatencyMs } = ctx.metrics;
    
    // Check thresholds
    let severity: IncidentSeverity | null = null;
    if (p95LatencyMs >= cfg.criticalP95Ms) {
      severity = 'CRITICAL';
    } else if (p95LatencyMs >= cfg.warningP95Ms) {
      severity = 'WARNING';
    }
    
    if (!severity) {
      return null;
    }
    
    const meta = INCIDENT_TYPE_META.SLO_BREACH;
    
    return {
      id: randomUUID(),
      type: 'SLO_BREACH',
      severity,
      status: 'ONGOING',
      title: meta.title,
      description: meta.descriptionTemplate
        .replace('{p95Ms}', p95LatencyMs.toFixed(0))
        .replace('{threshold}', (severity === 'CRITICAL' ? cfg.criticalP95Ms : cfg.warningP95Ms).toString()),
      recommendation: meta.recommendationTemplate,
      startedAt: ctx.timestamp,
      evidence: {
        source: 'metrics',
        metric: 'p95_latency_ms',
        value: p95LatencyMs,
        threshold: severity === 'CRITICAL' ? cfg.criticalP95Ms : cfg.warningP95Ms,
        timestamp: ctx.timestamp,
      },
      tenantId: ctx.tenantId,
    };
  }

  // ============================================================================
  // STORAGE
  // ============================================================================

  private storeIncident(incident: DiagnosticsIncident): void {
    // Check for duplicate (same type + tenant + ongoing)
    const existing = Array.from(this.incidents.values()).find(i =>
      i.tenantId === incident.tenantId &&
      i.type === incident.type &&
      i.status === 'ONGOING'
    );
    
    if (existing) {
      // Update existing instead of creating new
      this.logger.debug(`[Incident] Duplicate detected, skipping`, {
        type: incident.type,
        existingId: existing.id,
      });
      return;
    }
    
    // Evict oldest if at capacity
    if (this.incidents.size >= this.MAX_INCIDENTS) {
      const oldest = Array.from(this.incidents.entries())
        .sort((a, b) => 
          new Date(a[1].startedAt).getTime() - new Date(b[1].startedAt).getTime()
        )[0];
      if (oldest) {
        this.incidents.delete(oldest[0]);
      }
    }
    
    this.incidents.set(incident.id, incident);
    
    this.logger.warn(`[Incident] New incident detected: ${incident.type}`, {
      id: incident.id,
      severity: incident.severity,
      tenantId: incident.tenantId,
    });
  }
}
