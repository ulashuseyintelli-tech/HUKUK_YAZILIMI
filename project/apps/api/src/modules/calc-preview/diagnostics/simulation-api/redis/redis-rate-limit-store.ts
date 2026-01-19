/**
 * Redis Rate Limit Store
 * 
 * Phase 9A - Task 3.1-3.7
 * 
 * Redis implementation of IRateLimitStore interface.
 * Uses atomic operations for consistency across multiple API instances.
 * 
 * Key Design:
 * - Per-incident: INCR + EXPIRE (atomic via MULTI/EXEC)
 * - Concurrent: ZADD with expiry score, ZREMRANGEBYSCORE for cleanup
 * - Daily: INCR with 25h TTL
 * - Incident lock: SET NX EX + Lua script for release
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { IClock } from '../../evidence/clock.service';
import {
  IRateLimitStore,
  IncrementResult,
  AcquireLockResult,
  IRateLimitMetrics,
} from './rate-limit-store.interface';
import { SIMULATION_RATE_LIMIT_KEYS } from '../simulation-rate-limit.constants';
import { RedisConfig } from './redis-config';

// ============================================================================
// Lua Scripts
// ============================================================================

/**
 * Lua script for atomic check-and-delete (release lock only if runId matches)
 */
const RELEASE_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

// ============================================================================
// Implementation
// ============================================================================

@Injectable()
export class RedisRateLimitStore implements IRateLimitStore, OnModuleDestroy {
  private readonly logger = new Logger(RedisRateLimitStore.name);
  private readonly keyPrefix: string;

  constructor(
    private readonly redis: Redis,
    private readonly clock: IClock,
    private readonly metrics: IRateLimitMetrics,
    config: RedisConfig,
  ) {
    this.keyPrefix = config.keyPrefix;
  }

  // ============================================================================
  // Per-Incident Rate Limiting
  // ============================================================================

  async incrementIncidentCounter(
    tenantId: string,
    incidentId: string,
    ttlSec: number,
  ): Promise<IncrementResult> {
    const key = this.prefixKey(SIMULATION_RATE_LIMIT_KEYS.perIncident(tenantId, incidentId));
    const start = this.clock.nowMs();

    try {
      // Atomic INCR + EXPIRE + TTL using MULTI/EXEC
      const pipeline = this.redis.multi();
      pipeline.incr(key);
      pipeline.expire(key, ttlSec);
      pipeline.ttl(key);

      const results = await pipeline.exec();
      
      if (!results) {
        throw new Error('Redis MULTI/EXEC returned null');
      }

      const [incrResult, , ttlResult] = results;
      const count = incrResult[1] as number;
      const ttlRemaining = ttlResult[1] as number;

      this.recordSuccess('incrementIncidentCounter', start);
      return { count, ttlRemaining };
    } catch (error) {
      this.recordError('incrementIncidentCounter', error, start);
      throw error;
    }
  }

  async getIncidentCounter(
    tenantId: string,
    incidentId: string,
  ): Promise<IncrementResult | null> {
    const key = this.prefixKey(SIMULATION_RATE_LIMIT_KEYS.perIncident(tenantId, incidentId));
    const start = this.clock.nowMs();

    try {
      const pipeline = this.redis.multi();
      pipeline.get(key);
      pipeline.ttl(key);

      const results = await pipeline.exec();
      
      if (!results) {
        throw new Error('Redis MULTI/EXEC returned null');
      }

      const [getResult, ttlResult] = results;
      const countStr = getResult[1] as string | null;
      const ttlRemaining = ttlResult[1] as number;

      if (countStr === null || ttlRemaining < 0) {
        this.recordSuccess('getIncidentCounter', start);
        return null;
      }

      this.recordSuccess('getIncidentCounter', start);
      return { count: parseInt(countStr, 10), ttlRemaining };
    } catch (error) {
      this.recordError('getIncidentCounter', error, start);
      throw error;
    }
  }

  // ============================================================================
  // Concurrent Tracking (Sorted Set with expiry score)
  // ============================================================================

  async addToConcurrentSet(
    tenantId: string,
    runId: string,
    ttlSec: number,
  ): Promise<void> {
    const key = this.prefixKey(SIMULATION_RATE_LIMIT_KEYS.perTenantConcurrent(tenantId));
    const start = this.clock.nowMs();
    const expiresAt = start + ttlSec * 1000;

    try {
      // ZADD with score = expiry timestamp
      await this.redis.zadd(key, expiresAt, runId);
      this.recordSuccess('addToConcurrentSet', start);
    } catch (error) {
      this.recordError('addToConcurrentSet', error, start);
      throw error;
    }
  }

  async removeFromConcurrentSet(
    tenantId: string,
    runId: string,
  ): Promise<void> {
    const key = this.prefixKey(SIMULATION_RATE_LIMIT_KEYS.perTenantConcurrent(tenantId));
    const start = this.clock.nowMs();

    try {
      await this.redis.zrem(key, runId);
      this.recordSuccess('removeFromConcurrentSet', start);
    } catch (error) {
      this.recordError('removeFromConcurrentSet', error, start);
      throw error;
    }
  }

  async getConcurrentCount(tenantId: string): Promise<number> {
    const key = this.prefixKey(SIMULATION_RATE_LIMIT_KEYS.perTenantConcurrent(tenantId));
    const start = this.clock.nowMs();
    const now = this.clock.nowMs();

    try {
      // First cleanup expired entries (score < now)
      await this.redis.zremrangebyscore(key, '-inf', now);
      
      // Then count remaining
      const count = await this.redis.zcard(key);
      
      this.recordSuccess('getConcurrentCount', start);
      return count;
    } catch (error) {
      this.recordError('getConcurrentCount', error, start);
      throw error;
    }
  }

  // ============================================================================
  // Daily Counters
  // ============================================================================

  async incrementDailyCounter(
    tenantId: string,
    utcDate: string,
  ): Promise<number> {
    const key = this.prefixKey(SIMULATION_RATE_LIMIT_KEYS.daily(tenantId, utcDate));
    const start = this.clock.nowMs();
    const ttlSec = 25 * 60 * 60; // 25 hours

    try {
      const pipeline = this.redis.multi();
      pipeline.incr(key);
      pipeline.expire(key, ttlSec);

      const results = await pipeline.exec();
      
      if (!results) {
        throw new Error('Redis MULTI/EXEC returned null');
      }

      const count = results[0][1] as number;
      
      this.recordSuccess('incrementDailyCounter', start);
      return count;
    } catch (error) {
      this.recordError('incrementDailyCounter', error, start);
      throw error;
    }
  }

  async getDailyCounter(
    tenantId: string,
    utcDate: string,
  ): Promise<number> {
    const key = this.prefixKey(SIMULATION_RATE_LIMIT_KEYS.daily(tenantId, utcDate));
    const start = this.clock.nowMs();

    try {
      const result = await this.redis.get(key);
      
      this.recordSuccess('getDailyCounter', start);
      return result ? parseInt(result, 10) : 0;
    } catch (error) {
      this.recordError('getDailyCounter', error, start);
      throw error;
    }
  }

  // ============================================================================
  // Incident Locks
  // ============================================================================

  async acquireIncidentLock(
    tenantId: string,
    incidentId: string,
    runId: string,
    ttlSec: number,
  ): Promise<AcquireLockResult> {
    const key = this.prefixKey(SIMULATION_RATE_LIMIT_KEYS.incidentLock(tenantId, incidentId));
    const start = this.clock.nowMs();

    try {
      // SET NX EX - atomic acquire
      const result = await this.redis.set(key, runId, 'EX', ttlSec, 'NX');

      if (result === 'OK') {
        this.recordSuccess('acquireIncidentLock', start);
        return { acquired: true };
      }

      // Lock exists - get existing runId
      const existingRunId = await this.redis.get(key);
      
      this.recordSuccess('acquireIncidentLock', start);
      return {
        acquired: false,
        existingRunId: existingRunId || undefined,
      };
    } catch (error) {
      this.recordError('acquireIncidentLock', error, start);
      throw error;
    }
  }

  async releaseIncidentLock(
    tenantId: string,
    incidentId: string,
    runId: string,
  ): Promise<boolean> {
    const key = this.prefixKey(SIMULATION_RATE_LIMIT_KEYS.incidentLock(tenantId, incidentId));
    const start = this.clock.nowMs();

    try {
      // Lua script for atomic check-and-delete
      const result = await this.redis.eval(
        RELEASE_LOCK_SCRIPT,
        1,
        key,
        runId,
      );

      this.recordSuccess('releaseIncidentLock', start);
      return result === 1;
    } catch (error) {
      this.recordError('releaseIncidentLock', error, start);
      throw error;
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * NestJS lifecycle hook - called on module destroy
   * Gracefully closes Redis connection to prevent connection leaks
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('[Redis] Module destroying, closing connection');
    try {
      await this.redis.quit();
      this.logger.log('[Redis] Connection closed gracefully');
    } catch (error) {
      this.logger.warn('[Redis] Error closing connection', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async healthCheck(): Promise<boolean> {
    const start = this.clock.nowMs();

    try {
      const result = await this.redis.ping();
      this.recordSuccess('healthCheck', start);
      return result === 'PONG';
    } catch (error) {
      this.recordError('healthCheck', error, start);
      return false;
    }
  }

  async cleanup(): Promise<void> {
    // Redis handles TTL automatically, but we can cleanup concurrent sets
    // This is called periodically to ensure expired entries are removed
    this.logger.debug('[Redis] Cleanup triggered (TTL handles most cleanup)');
  }

  async reset(): Promise<void> {
    // WARNING: Only for testing - clears all keys with prefix
    const start = this.clock.nowMs();

    try {
      const pattern = `${this.keyPrefix}*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      
      this.logger.warn('[Redis] Reset - cleared all keys', { count: keys.length });
      this.recordSuccess('reset', start);
    } catch (error) {
      this.recordError('reset', error, start);
      throw error;
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private prefixKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private recordSuccess(operation: string, startMs: number): void {
    const duration = this.clock.nowMs() - startMs;
    this.metrics.recordLatency(operation, duration, true);
  }

  private recordError(operation: string, error: unknown, startMs: number): void {
    const duration = this.clock.nowMs() - startMs;
    this.metrics.recordLatency(operation, duration, false);
    
    const errorType = error instanceof Error ? error.name : 'UnknownError';
    this.metrics.recordError(operation, errorType);
    
    this.logger.error(`[Redis] ${operation} failed`, {
      error: error instanceof Error ? error.message : String(error),
      durationMs: duration,
    });
  }
}
