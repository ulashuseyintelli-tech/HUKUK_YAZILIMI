/**
 * Diagnostics Rate Limit Guard
 * 
 * Phase 7A - Sprint 1 - Task 1.3
 * 
 * İki Bucket Modeli:
 * ```
 * Request → [Burst Check (10/sec)] → [Minute Check (60/min)] → Allow
 *               ↓ fail                    ↓ fail
 *             429 (retry: 1s)          429 (retry: Xms)
 * ```
 * 
 * | Bucket              | Limit   | Window   | Amaç                          |
 * |---------------------|---------|----------|-------------------------------|
 * | Burst               | 10 req  | 1 saniye | Admin panel refresh spam      |
 * | Minute (general)    | 60 req  | 1 dakika | Normal kullanım               |
 * | Minute (trace-detail)| 30 req | 1 dakika | Expensive endpoint            |
 * 
 * Kural: İKİSİ DE geçmeli. Biri fail ederse 429.
 * 
 * @see .kiro/specs/self-serve-diagnostics/design.md - Rate Limit Burst Protection
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  Logger,
  Optional,
  Inject,
} from '@nestjs/common';
import { Request } from 'express';
import { DIAGNOSTICS_RATE_LIMITS } from '../diagnostics.types';
import { buildScopedKey } from '../../region/scoped-key';
import { DEFAULT_REGION } from '../../region/region.constants';
import { IClock } from '../evidence/clock.service';

// ============================================================================
// BUCKET TYPES
// ============================================================================

/**
 * Minute bucket - token bucket for per-minute rate limiting
 */
interface MinuteBucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Burst bucket - sliding window for per-second burst limiting
 */
interface BurstBucket {
  requests: number[];  // timestamps
}

/**
 * Combined bucket state per tenant/endpoint
 */
interface CombinedBucket {
  minute: MinuteBucket;
  burst: BurstBucket;
}

// ============================================================================
// RATE LIMIT GUARD
// ============================================================================

/**
 * Default clock implementation using Date.now()
 */
const defaultClock: IClock = {
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

@Injectable()
export class DiagnosticsRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(DiagnosticsRateLimitGuard.name);
  
  // Combined buckets per tenant per endpoint type
  private readonly buckets = new Map<string, CombinedBucket>();
  
  // Constants
  private readonly GENERAL_LIMIT = DIAGNOSTICS_RATE_LIMITS.GENERAL_LIMIT;       // 60/min
  private readonly TRACE_DETAIL_LIMIT = DIAGNOSTICS_RATE_LIMITS.TRACE_DETAIL_LIMIT; // 30/min
  private readonly BURST_LIMIT = DIAGNOSTICS_RATE_LIMITS.BURST_LIMIT;           // 10/sec
  private readonly BURST_WINDOW_MS = DIAGNOSTICS_RATE_LIMITS.BURST_WINDOW_MS;   // 1000ms
  private readonly REFILL_INTERVAL_MS = 60 * 1000; // 1 minute
  
  // Injected clock for testability
  private clock: IClock;

  constructor(@Optional() @Inject('IClock') clock?: IClock) {
    this.clock = clock || defaultClock;
    // Cleanup interval (only in production, not in tests)
    if (!clock) {
      setInterval(() => this.cleanup(), 60 * 1000);
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const tenantId = this.extractTenantId(request);
    const endpointType = this.getEndpointType(request.path);
    
    // Build scoped bucket key
    const bucketKey = buildScopedKey({
      regionId: DEFAULT_REGION,
      tenantId,
      namespace: 'rl',
      key: `diag:${endpointType}`,
    });
    
    const bucket = this.getOrCreateBucket(bucketKey, endpointType);
    const now = this.clock.nowMs();
    
    // =========================================================================
    // CHECK 1: Burst limit (10 req/sec) - MUST PASS
    // =========================================================================
    if (!this.checkBurstLimit(bucket.burst, now)) {
      this.logger.warn('[RateLimit] Burst limit exceeded (10/sec)', {
        tenantId,
        endpoint: endpointType,
      });
      
      throw new HttpException({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Burst limit exceeded for diagnostics (max 10 req/sec)',
        details: {
          retryAfter: 1, // 1 second
          limitType: 'burst',
        },
      }, 429);
    }
    
    // =========================================================================
    // CHECK 2: Minute limit (60/min or 30/min) - MUST PASS
    // =========================================================================
    this.refillMinuteBucket(bucket.minute, now, endpointType);
    
    const minuteLimit = endpointType === 'trace-detail' 
      ? this.TRACE_DETAIL_LIMIT 
      : this.GENERAL_LIMIT;
    
    if (bucket.minute.tokens < 1) {
      const retryAfterMs = this.calculateMinuteRetryAfter(bucket.minute, minuteLimit);
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);
      
      this.logger.warn('[RateLimit] Minute limit exceeded', {
        tenantId,
        endpoint: endpointType,
        limit: minuteLimit,
        retryAfterSec,
      });
      
      throw new HttpException({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded for diagnostics (max ${minuteLimit} req/min)`,
        details: {
          retryAfter: retryAfterSec,
          limitType: 'minute',
        },
      }, 429);
    }
    
    // =========================================================================
    // BOTH PASSED: Consume tokens and track request
    // =========================================================================
    bucket.minute.tokens -= 1;
    bucket.burst.requests.push(now);
    
    // Set rate limit headers (will be picked up by response interceptor)
    (request as any).rateLimitInfo = {
      limit: minuteLimit,
      remaining: Math.floor(bucket.minute.tokens),
      reset: Math.ceil((bucket.minute.lastRefill + this.REFILL_INTERVAL_MS) / 1000),
      burstRemaining: this.BURST_LIMIT - this.countRecentBurstRequests(bucket.burst, now),
    };
    
    return true;
  }

  /**
   * Check burst limit (10 req/sec sliding window)
   */
  private checkBurstLimit(burst: BurstBucket, now: number): boolean {
    const windowStart = now - this.BURST_WINDOW_MS;
    const recentCount = burst.requests.filter(t => t > windowStart).length;
    return recentCount < this.BURST_LIMIT;
  }

  /**
   * Count recent burst requests
   */
  private countRecentBurstRequests(burst: BurstBucket, now: number): number {
    const windowStart = now - this.BURST_WINDOW_MS;
    return burst.requests.filter(t => t > windowStart).length;
  }

  /**
   * Refill minute bucket tokens
   */
  private refillMinuteBucket(minute: MinuteBucket, now: number, endpointType: string): void {
    const elapsed = now - minute.lastRefill;
    const intervals = Math.floor(elapsed / this.REFILL_INTERVAL_MS);
    
    if (intervals > 0) {
      const limit = endpointType === 'trace-detail' 
        ? this.TRACE_DETAIL_LIMIT 
        : this.GENERAL_LIMIT;
      
      // Full refill per interval
      minute.tokens = Math.min(limit, minute.tokens + (intervals * limit));
      minute.lastRefill = now;
    }
  }

  /**
   * Calculate retry-after for minute bucket
   */
  private calculateMinuteRetryAfter(minute: MinuteBucket, limit: number): number {
    const tokensNeeded = 1 - minute.tokens;
    const msPerToken = this.REFILL_INTERVAL_MS / limit;
    return Math.ceil(tokensNeeded * msPerToken);
  }

  /**
   * Get or create combined bucket for tenant/endpoint
   */
  private getOrCreateBucket(key: string, endpointType: string): CombinedBucket {
    let bucket = this.buckets.get(key);
    
    if (!bucket) {
      const limit = endpointType === 'trace-detail' 
        ? this.TRACE_DETAIL_LIMIT 
        : this.GENERAL_LIMIT;
      
      bucket = {
        minute: {
          tokens: limit,
          lastRefill: this.clock.nowMs(),
        },
        burst: {
          requests: [],
        },
      };
      this.buckets.set(key, bucket);
    }
    
    return bucket;
  }

  /**
   * Extract tenant ID from request
   */
  private extractTenantId(request: Request): string {
    // From tenant context (set by RBAC guard)
    const tenantContext = (request as any).tenantContext;
    if (tenantContext?.tenantId) {
      return tenantContext.tenantId;
    }
    
    // From header
    const tenantId = request.headers['x-tenant-id'] as string;
    if (tenantId) {
      return tenantId;
    }
    
    // Default for anonymous (shouldn't happen after RBAC guard)
    return 'anonymous';
  }

  /**
   * Get endpoint type from path
   */
  private getEndpointType(path: string): string {
    // /calc/diagnostics/traces/:traceId → trace-detail
    if (/\/traces\/[^/]+$/.test(path)) {
      return 'trace-detail';
    }
    
    // /calc/diagnostics/traces → trace-list
    if (path.includes('/traces')) {
      return 'trace-list';
    }
    
    // /calc/diagnostics/health → health
    if (path.includes('/health')) {
      return 'health';
    }
    
    // /calc/diagnostics/metrics → metrics
    if (path.includes('/metrics')) {
      return 'metrics';
    }
    
    // /calc/diagnostics/incidents → incidents
    if (path.includes('/incidents')) {
      return 'incidents';
    }
    
    return 'general';
  }

  /**
   * Cleanup old buckets and burst timestamps
   */
  private cleanup(): void {
    const now = this.clock.nowMs();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    
    for (const [key, bucket] of this.buckets.entries()) {
      // Remove old burst timestamps
      const windowStart = now - this.BURST_WINDOW_MS;
      bucket.burst.requests = bucket.burst.requests.filter(t => t > windowStart);
      
      // Remove inactive buckets
      if (now - bucket.minute.lastRefill > maxAge && bucket.burst.requests.length === 0) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Reset all buckets (for testing)
   */
  reset(): void {
    this.buckets.clear();
  }

  /**
   * Get bucket status (for testing/debugging)
   */
  getBucketStatus(tenantId: string, endpointType: string): {
    tokens: number;
    limit: number;
    burstRemaining: number;
  } | null {
    const bucketKey = buildScopedKey({
      regionId: DEFAULT_REGION,
      tenantId,
      namespace: 'rl',
      key: `diag:${endpointType}`,
    });
    
    const bucket = this.buckets.get(bucketKey);
    if (!bucket) return null;
    
    const limit = endpointType === 'trace-detail' 
      ? this.TRACE_DETAIL_LIMIT 
      : this.GENERAL_LIMIT;
    
    const now = this.clock.nowMs();
    const burstRemaining = this.BURST_LIMIT - this.countRecentBurstRequests(bucket.burst, now);
    
    return {
      tokens: Math.floor(bucket.minute.tokens),
      limit,
      burstRemaining,
    };
  }
  
  /**
   * Set clock (for testing)
   */
  setClock(clock: IClock): void {
    this.clock = clock;
  }
}
