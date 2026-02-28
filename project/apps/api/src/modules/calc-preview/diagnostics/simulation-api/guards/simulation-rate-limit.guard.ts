/**
 * Simulation Rate Limit Guard
 * 
 * Sprint 2F - Task 3.1
 * Phase 9A - Task 9.1 (IRateLimitStore integration)
 * 
 * RED LINE #2: Rate-limit determinism + singular behavior
 * - per-incident: INCR + TTL=60s; >1 => 429
 * - concurrent: set membership (runId) + SCARD > 5 => 429
 * - daily: UTC day key; >100 => 429
 * - All use IClock for deterministic testing
 * 
 * Check Order (reject fast before expensive checks):
 * 1. Concurrent limit (SCARD) - immediate reject
 * 2. Per-incident minute limit (GET counter)
 * 3. Daily limit (GET counter)
 * 
 * RED LINE #3: "already running" 409 must work correctly
 * - Same incident concurrent simulate calls use lock/flag
 * - Single winner, others get 409
 * 
 * Phase 9A: Now supports IRateLimitStore for Redis backend
 * - Inject store via constructor for Redis/failover support
 * - Falls back to internal in-memory store if not provided
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { Request } from 'express';
import { IClock } from '../../evidence/clock.service';
import {
  SIMULATION_RATE_LIMITS,
  getUtcDateString,
  RateLimitType,
} from '../simulation-rate-limit.constants';
import {
  TooManySimulationsException,
} from '../simulation-error.types';
import { ISimulationClock } from '../../simulation/simulation.types';
import { IRateLimitStore } from '../redis/rate-limit-store.interface';
import { InMemoryRateLimitStore } from '../redis/in-memory-rate-limit-store';

// ============================================================================
// Types
// ============================================================================

export interface AcquireResult {
  acquired: boolean;
  reason?: RateLimitType | 'ALREADY_RUNNING' | undefined;
  retryAfterSec?: number | undefined;
  runId?: string | undefined;
}

export interface SimulationRateLimitRequest extends Request {
  simulationTenantContext?: {
    tenantId: string;
    userId: string;
    role: string;
  };
  rateLimitInfo?: {
    runId: string;
    tenantId: string;
    incidentId: string;
  };
}

// ============================================================================
// Injection Token
// ============================================================================

export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');

// ============================================================================
// Guard Implementation
// ============================================================================

@Injectable()
export class SimulationRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(SimulationRateLimitGuard.name);
  private readonly store: IRateLimitStore;
  private clock: IClock;

  constructor(
    @Optional() @Inject(RATE_LIMIT_STORE) injectedStore?: IRateLimitStore,
    @Optional() @Inject('IClock') clock?: IClock,
  ) {
    this.clock = clock || this.createDefaultClock();
    // Use injected store (Redis/Failover) or create internal in-memory store
    this.store = injectedStore || new InMemoryRateLimitStore(this.clock);
  }

  private createDefaultClock(): IClock {
    return {
      now: () => new Date(),
      nowMs: () => Date.now(),
      nowIso: () => new Date().toISOString(),
      ageInSeconds: (timestamp: string | Date) => {
        const then = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
        return Math.floor((Date.now() - then.getTime()) / 1000);
      },
      isOlderThan: (timestamp: string | Date, thresholdSec: number) => {
        const then = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
        return Math.floor((Date.now() - then.getTime()) / 1000) > thresholdSec;
      },
    };
  }

  /**
   * Guard entry point - checks rate limits before allowing request
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SimulationRateLimitRequest>();
    
    // Only apply to POST /simulate endpoints
    if (request.method !== 'POST' || !request.path.includes('/simulate')) {
      return true;
    }

    const tenantId = this.extractTenantId(request);
    const incidentId = this.extractIncidentId(request);

    if (!tenantId || !incidentId) {
      return true; // Let controller handle missing params
    }

    // Check order: concurrent → incident → daily
    // 1. Concurrent limit
    const concurrentCount = await this.store.getConcurrentCount(tenantId);
    if (concurrentCount >= SIMULATION_RATE_LIMITS.perTenantConcurrent) {
      this.logger.warn('[SimulationRateLimit] Concurrent limit exceeded', {
        tenantId,
        current: concurrentCount,
        limit: SIMULATION_RATE_LIMITS.perTenantConcurrent,
      });
      throw new TooManySimulationsException('concurrent');
    }

    // 2. Per-incident minute limit
    const incidentResult = await this.store.getIncidentCounter(tenantId, incidentId);
    const incidentCount = incidentResult?.count ?? 0;
    if (incidentCount >= SIMULATION_RATE_LIMITS.perIncident) {
      const retryAfter = incidentResult?.ttlRemaining ?? SIMULATION_RATE_LIMITS.perIncidentTtlSec;
      this.logger.warn('[SimulationRateLimit] Per-incident limit exceeded', {
        tenantId,
        incidentId,
        retryAfterSec: retryAfter,
      });
      throw new TooManySimulationsException('incident', retryAfter);
    }

    // 3. Daily limit
    const utcDate = this.getUtcDateString();
    const dailyCount = await this.store.getDailyCounter(tenantId, utcDate);
    if (dailyCount >= SIMULATION_RATE_LIMITS.daily) {
      this.logger.warn('[SimulationRateLimit] Daily limit exceeded', {
        tenantId,
        current: dailyCount,
        limit: SIMULATION_RATE_LIMITS.daily,
      });
      throw new TooManySimulationsException('daily');
    }

    return true;
  }

  /**
   * Acquire token for simulation run
   * Called by controller before starting simulation
   * 
   * @returns AcquireResult with acquired=true and runId if successful
   */
  async acquireToken(
    tenantId: string,
    incidentId: string,
    runId: string,
  ): Promise<AcquireResult> {
    // 1. Check concurrent limit (SCARD)
    const concurrentCount = await this.store.getConcurrentCount(tenantId);
    if (concurrentCount >= SIMULATION_RATE_LIMITS.perTenantConcurrent) {
      return {
        acquired: false,
        reason: 'concurrent',
      };
    }

    // 2. Check incident lock (409 ALREADY_RUNNING)
    const lockResult = await this.store.acquireIncidentLock(
      tenantId,
      incidentId,
      runId,
      Math.ceil(SIMULATION_RATE_LIMITS.leaseTtlMs / 1000),
    );
    
    if (!lockResult.acquired) {
      return {
        acquired: false,
        reason: 'ALREADY_RUNNING',
        runId: lockResult.existingRunId,
      };
    }

    // 3. Check per-incident minute limit
    const incidentResult = await this.store.getIncidentCounter(tenantId, incidentId);
    const incidentCount = incidentResult?.count ?? 0;
    if (incidentCount >= SIMULATION_RATE_LIMITS.perIncident) {
      // Release the lock we just acquired
      await this.store.releaseIncidentLock(tenantId, incidentId, runId);
      const retryAfter = incidentResult?.ttlRemaining ?? SIMULATION_RATE_LIMITS.perIncidentTtlSec;
      return {
        acquired: false,
        reason: 'incident',
        retryAfterSec: retryAfter,
      };
    }

    // 4. Check daily limit
    const utcDate = this.getUtcDateString();
    const dailyCount = await this.store.getDailyCounter(tenantId, utcDate);
    if (dailyCount >= SIMULATION_RATE_LIMITS.daily) {
      // Release the lock we just acquired
      await this.store.releaseIncidentLock(tenantId, incidentId, runId);
      return {
        acquired: false,
        reason: 'daily',
      };
    }

    // All checks passed - acquire tokens atomically
    // a. Add to concurrent set
    await this.store.addToConcurrentSet(
      tenantId,
      runId,
      Math.ceil(SIMULATION_RATE_LIMITS.leaseTtlMs / 1000),
    );

    // b. Increment incident counter with TTL
    await this.store.incrementIncidentCounter(
      tenantId,
      incidentId,
      SIMULATION_RATE_LIMITS.perIncidentTtlSec,
    );

    // c. Increment daily counter
    await this.store.incrementDailyCounter(tenantId, utcDate);

    this.logger.debug('[SimulationRateLimit] Token acquired', {
      tenantId,
      incidentId,
      runId,
      concurrentCount: concurrentCount + 1,
      dailyCount: dailyCount + 1,
    });

    return {
      acquired: true,
      runId,
    };
  }

  /**
   * Release token after simulation completes (success or failure)
   * MUST be called in finally block
   */
  async releaseToken(tenantId: string, incidentId: string, runId: string): Promise<void> {
    // Remove from concurrent set
    await this.store.removeFromConcurrentSet(tenantId, runId);

    // Remove incident lock
    await this.store.releaseIncidentLock(tenantId, incidentId, runId);

    this.logger.debug('[SimulationRateLimit] Token released', {
      tenantId,
      incidentId,
      runId,
    });
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private getUtcDateString(): string {
    // Create ISimulationClock adapter from IClock
    const simulationClock: ISimulationClock = {
      now: () => this.clock.now(),
      advanceSeconds: () => {}, // Not used for key generation
      reset: () => {}, // Not used for key generation
    };
    return getUtcDateString(simulationClock);
  }

  private extractTenantId(request: SimulationRateLimitRequest): string | undefined {
    return request.simulationTenantContext?.tenantId ||
           (request.headers['x-tenant-id'] as string);
  }

  private extractIncidentId(request: SimulationRateLimitRequest): string | undefined {
    // Extract from path: /incidents/:id/simulate
    const match = request.path.match(/\/incidents\/([^/]+)\/simulate/);
    return match ? match[1] : undefined;
  }

  // ============================================================================
  // Testing Helpers
  // ============================================================================

  /**
   * Reset all state (for testing)
   */
  async reset(): Promise<void> {
    await this.store.reset();
  }

  /**
   * Set clock (for testing)
   */
  setClock(clock: IClock): void {
    this.clock = clock;
  }

  /**
   * Get the underlying store (for testing/debugging)
   */
  getStore(): IRateLimitStore {
    return this.store;
  }

  /**
   * Get current state (for testing/debugging)
   */
  async getState(tenantId: string): Promise<{
    concurrent: number;
    daily: number;
  }> {
    const concurrent = await this.store.getConcurrentCount(tenantId);
    const utcDate = this.getUtcDateString();
    const daily = await this.store.getDailyCounter(tenantId, utcDate);

    return { concurrent, daily };
  }
}
