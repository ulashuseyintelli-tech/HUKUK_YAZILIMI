/**
 * Failover Handler
 * 
 * Phase 9A - Task 6.1-6.3
 * 
 * Manages Redis connection failures and fallback to in-memory store.
 * Implements circuit breaker pattern for resilience.
 * 
 * State Machine:
 * HEALTHY → DEGRADED (on failure) → CIRCUIT_OPEN (after 3 failures) → DEGRADED (after 30s) → HEALTHY (on success)
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { IClock } from '../../evidence/clock.service';
import {
  IRateLimitStore,
  IRateLimitMetrics,
  IncrementResult,
  AcquireLockResult,
} from './rate-limit-store.interface';

// ============================================================================
// Types
// ============================================================================

export type FailoverState = 'HEALTHY' | 'DEGRADED' | 'CIRCUIT_OPEN';

export interface FailoverStatus {
  state: FailoverState;
  consecutiveFailures: number;
  lastFailureAt?: number | undefined;
  circuitOpenUntil?: number | undefined;
  usingFallback: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

export interface FailoverConfig {
  /** Max consecutive failures before circuit opens (default: 3) */
  maxConsecutiveFailures: number;
  /** Circuit open duration in ms (default: 30000) */
  circuitOpenDurationMs: number;
  /** Reconnect attempt interval in ms (default: 5000) */
  reconnectIntervalMs: number;
}

export const DEFAULT_FAILOVER_CONFIG: FailoverConfig = {
  maxConsecutiveFailures: 3,
  circuitOpenDurationMs: 30_000,
  reconnectIntervalMs: 5_000,
};

// ============================================================================
// Implementation
// ============================================================================

@Injectable()
export class FailoverHandler implements IRateLimitStore, OnModuleDestroy {
  private readonly logger = new Logger(FailoverHandler.name);
  
  private state: FailoverState = 'HEALTHY';
  private consecutiveFailures = 0;
  private lastFailureAt: number | undefined = undefined;
  private circuitOpenUntil: number | undefined = undefined;
  private reconnectTimer: NodeJS.Timeout | undefined = undefined;

  constructor(
    private readonly primaryStore: IRateLimitStore,
    private readonly fallbackStore: IRateLimitStore,
    private readonly clock: IClock,
    private readonly metrics: IRateLimitMetrics,
    private readonly config: FailoverConfig = DEFAULT_FAILOVER_CONFIG,
  ) {}

  // ============================================================================
  // State Management
  // ============================================================================

  getStatus(): FailoverStatus {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureAt: this.lastFailureAt,
      circuitOpenUntil: this.circuitOpenUntil,
      usingFallback: this.state !== 'HEALTHY',
    };
  }

  private onSuccess(): void {
    if (this.state !== 'HEALTHY') {
      this.logger.log('[Failover] Primary store connection restored');
      this.metrics.recordFailover(false); // Deactivated
      this.metrics.recordCircuitBreakerState('CLOSED');
    }
    
    this.state = 'HEALTHY';
    this.consecutiveFailures = 0;
    this.lastFailureAt = undefined;
    this.circuitOpenUntil = undefined;
    
    this.stopReconnectTimer();
  }

  private onFailure(error: Error): void {
    this.consecutiveFailures++;
    this.lastFailureAt = this.clock.nowMs();
    
    this.logger.warn('[Failover] Primary store operation failed', {
      error: error.message,
      consecutiveFailures: this.consecutiveFailures,
      currentState: this.state,
    });

    if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      // Open circuit breaker
      this.state = 'CIRCUIT_OPEN';
      this.circuitOpenUntil = this.clock.nowMs() + this.config.circuitOpenDurationMs;
      
      this.logger.error('[Failover] Circuit breaker OPENED', {
        consecutiveFailures: this.consecutiveFailures,
        circuitOpenUntil: new Date(this.circuitOpenUntil).toISOString(),
      });
      
      this.metrics.recordCircuitBreakerState('OPEN');
    } else if (this.state === 'HEALTHY') {
      // First failure - enter degraded mode
      this.state = 'DEGRADED';
      this.metrics.recordFailover(true); // Activated
      this.startReconnectTimer();
    }
  }

  private shouldUsePrimary(): boolean {
    const now = this.clock.nowMs();

    if (this.state === 'HEALTHY') {
      return true;
    }

    if (this.state === 'CIRCUIT_OPEN') {
      // Check if circuit timeout expired
      if (this.circuitOpenUntil && now >= this.circuitOpenUntil) {
        this.logger.log('[Failover] Circuit breaker timeout expired, trying primary');
        this.state = 'DEGRADED';
        // Reset consecutive failures when entering half-open state
        // This prevents immediate re-opening on first failure
        this.consecutiveFailures = 0;
        // INVARIANT: circuitOpenUntil must be undefined when not in CIRCUIT_OPEN
        this.circuitOpenUntil = undefined;
        this.metrics.recordCircuitBreakerState('HALF_OPEN');
        return true; // Try primary once
      }
      return false;
    }

    // DEGRADED state - try primary
    return true;
  }

  private startReconnectTimer(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setInterval(async () => {
      if (this.state === 'HEALTHY') {
        this.stopReconnectTimer();
        return;
      }

      try {
        const healthy = await this.primaryStore.healthCheck();
        if (healthy) {
          this.onSuccess();
        }
      } catch {
        // Still failing, stay in current state
      }
    }, this.config.reconnectIntervalMs);
  }

  private stopReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  // ============================================================================
  // IRateLimitStore Implementation (Delegating with Failover)
  // ============================================================================

  async incrementIncidentCounter(
    tenantId: string,
    incidentId: string,
    ttlSec: number,
  ): Promise<IncrementResult> {
    return this.executeWithFailover(
      () => this.primaryStore.incrementIncidentCounter(tenantId, incidentId, ttlSec),
      () => this.fallbackStore.incrementIncidentCounter(tenantId, incidentId, ttlSec),
    );
  }

  async getIncidentCounter(
    tenantId: string,
    incidentId: string,
  ): Promise<IncrementResult | null> {
    return this.executeWithFailover(
      () => this.primaryStore.getIncidentCounter(tenantId, incidentId),
      () => this.fallbackStore.getIncidentCounter(tenantId, incidentId),
    );
  }

  async addToConcurrentSet(
    tenantId: string,
    runId: string,
    ttlSec: number,
  ): Promise<void> {
    return this.executeWithFailover(
      () => this.primaryStore.addToConcurrentSet(tenantId, runId, ttlSec),
      () => this.fallbackStore.addToConcurrentSet(tenantId, runId, ttlSec),
    );
  }

  async removeFromConcurrentSet(
    tenantId: string,
    runId: string,
  ): Promise<void> {
    return this.executeWithFailover(
      () => this.primaryStore.removeFromConcurrentSet(tenantId, runId),
      () => this.fallbackStore.removeFromConcurrentSet(tenantId, runId),
    );
  }

  async getConcurrentCount(tenantId: string): Promise<number> {
    return this.executeWithFailover(
      () => this.primaryStore.getConcurrentCount(tenantId),
      () => this.fallbackStore.getConcurrentCount(tenantId),
    );
  }

  async incrementDailyCounter(
    tenantId: string,
    utcDate: string,
  ): Promise<number> {
    return this.executeWithFailover(
      () => this.primaryStore.incrementDailyCounter(tenantId, utcDate),
      () => this.fallbackStore.incrementDailyCounter(tenantId, utcDate),
    );
  }

  async getDailyCounter(
    tenantId: string,
    utcDate: string,
  ): Promise<number> {
    return this.executeWithFailover(
      () => this.primaryStore.getDailyCounter(tenantId, utcDate),
      () => this.fallbackStore.getDailyCounter(tenantId, utcDate),
    );
  }

  async acquireIncidentLock(
    tenantId: string,
    incidentId: string,
    runId: string,
    ttlSec: number,
  ): Promise<AcquireLockResult> {
    return this.executeWithFailover(
      () => this.primaryStore.acquireIncidentLock(tenantId, incidentId, runId, ttlSec),
      () => this.fallbackStore.acquireIncidentLock(tenantId, incidentId, runId, ttlSec),
    );
  }

  async releaseIncidentLock(
    tenantId: string,
    incidentId: string,
    runId: string,
  ): Promise<boolean> {
    return this.executeWithFailover(
      () => this.primaryStore.releaseIncidentLock(tenantId, incidentId, runId),
      () => this.fallbackStore.releaseIncidentLock(tenantId, incidentId, runId),
    );
  }

  async healthCheck(): Promise<boolean> {
    // Health check doesn't use failover - reports primary health
    try {
      return await this.primaryStore.healthCheck();
    } catch {
      return false;
    }
  }

  async cleanup(): Promise<void> {
    // Cleanup both stores
    await Promise.all([
      this.primaryStore.cleanup().catch(() => {}),
      this.fallbackStore.cleanup(),
    ]);
  }

  async reset(): Promise<void> {
    // Reset both stores and state
    await Promise.all([
      this.primaryStore.reset().catch(() => {}),
      this.fallbackStore.reset(),
    ]);
    
    this.state = 'HEALTHY';
    this.consecutiveFailures = 0;
    this.lastFailureAt = undefined;
    this.circuitOpenUntil = undefined;
    this.stopReconnectTimer();
  }

  // ============================================================================
  // Core Failover Logic
  // ============================================================================

  private async executeWithFailover<T>(
    primaryOp: () => Promise<T>,
    fallbackOp: () => Promise<T>,
  ): Promise<T> {
    if (!this.shouldUsePrimary()) {
      // Circuit is open - use fallback directly
      this.logger.debug('[Failover] Circuit open, using fallback');
      return fallbackOp();
    }

    try {
      const result = await primaryOp();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error instanceof Error ? error : new Error(String(error)));
      
      // Use fallback
      this.logger.debug('[Failover] Primary failed, using fallback');
      return fallbackOp();
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * NestJS lifecycle hook - called on module destroy
   * Ensures clean shutdown of reconnect timer
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('[Failover] Module destroying, cleaning up resources');
    this.destroy();
  }

  /**
   * Manual destroy method for non-NestJS contexts (e.g., tests)
   */
  destroy(): void {
    this.stopReconnectTimer();
  }
}
