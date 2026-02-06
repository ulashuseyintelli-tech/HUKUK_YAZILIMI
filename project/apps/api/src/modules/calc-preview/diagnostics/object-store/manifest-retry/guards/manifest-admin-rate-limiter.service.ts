/**
 * Manifest Admin Rate Limiter Service
 * 
 * Phase 10.2 - Task 4.3
 * 
 * Per-actor rate limiting for admin endpoints.
 * 
 * LIMITS:
 * - Standard operations: 10 req/min (resolve, redrive, resume, pause)
 * - Bulk operations: 1 req/min (redrive-bulk)
 * 
 * RESPONSE (429):
 * - Retry-After header
 * - Body: { code, rate_limit_type, retry_after_seconds }
 * 
 * @see .kiro/specs/phase-10-2-production-hardening/design.md
 */

import { Injectable, Logger } from '@nestjs/common';

// ============================================================================
// Types
// ============================================================================

export type RateLimitType = 'standard' | 'bulk';

export interface RateLimitConfig {
  /** Standard operations limit per minute */
  standardLimitPerMinute: number;
  /** Bulk operations limit per minute */
  bulkLimitPerMinute: number;
  /** Window size in milliseconds */
  windowMs: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  standardLimitPerMinute: 10,
  bulkLimitPerMinute: 1,
  windowMs: 60_000, // 1 minute
};

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** When the window resets */
  resetAt: Date;
  /** Seconds until retry (only if not allowed) */
  retryAfterSeconds?: number;
}

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// ============================================================================
// Service Implementation
// ============================================================================

@Injectable()
export class ManifestAdminRateLimiter {
  private readonly logger = new Logger(ManifestAdminRateLimiter.name);
  private readonly config: RateLimitConfig;
  private readonly limits = new Map<string, RateLimitEntry>();

  // Metrics
  private rateLimitExceededCount = 0;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
  }

  /**
   * Check rate limit for an actor and operation type
   * 
   * @param actorId - User ID or IP address
   * @param operation - 'standard' or 'bulk'
   * @returns RateLimitResult with allowed status and metadata
   */
  checkLimit(actorId: string, operation: RateLimitType): RateLimitResult {
    const key = `${actorId}:${operation}`;
    const limit = operation === 'bulk'
      ? this.config.bulkLimitPerMinute
      : this.config.standardLimitPerMinute;

    const now = Date.now();
    const entry = this.limits.get(key);

    // New window or expired window
    if (!entry || entry.resetAt <= now) {
      const resetAt = now + this.config.windowMs;
      this.limits.set(key, { count: 1, resetAt });
      
      return {
        allowed: true,
        remaining: limit - 1,
        resetAt: new Date(resetAt),
      };
    }

    // Check if limit exceeded
    if (entry.count >= limit) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
      this.rateLimitExceededCount++;
      
      this.logger.warn('[RateLimiter] Rate limit exceeded', {
        actorId,
        operation,
        limit,
        retryAfterSeconds,
      });

      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(entry.resetAt),
        retryAfterSeconds,
      };
    }

    // Increment counter
    entry.count++;
    
    return {
      allowed: true,
      remaining: limit - entry.count,
      resetAt: new Date(entry.resetAt),
    };
  }

  /**
   * Get current limit for an actor (without incrementing)
   */
  getCurrentUsage(actorId: string, operation: RateLimitType): { used: number; limit: number; resetAt: Date | null } {
    const key = `${actorId}:${operation}`;
    const limit = operation === 'bulk'
      ? this.config.bulkLimitPerMinute
      : this.config.standardLimitPerMinute;

    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || entry.resetAt <= now) {
      return { used: 0, limit, resetAt: null };
    }

    return {
      used: entry.count,
      limit,
      resetAt: new Date(entry.resetAt),
    };
  }

  /**
   * Reset rate limit for an actor (for testing)
   */
  reset(actorId: string, operation?: RateLimitType): void {
    if (operation) {
      this.limits.delete(`${actorId}:${operation}`);
    } else {
      // Reset all operations for this actor
      this.limits.delete(`${actorId}:standard`);
      this.limits.delete(`${actorId}:bulk`);
    }
  }

  /**
   * Reset all rate limits (for testing)
   */
  resetAll(): void {
    this.limits.clear();
    this.rateLimitExceededCount = 0;
  }

  /**
   * Get metrics
   */
  getMetrics(): { rateLimitExceededCount: number; activeEntries: number } {
    return {
      rateLimitExceededCount: this.rateLimitExceededCount,
      activeEntries: this.limits.size,
    };
  }

  /**
   * Cleanup expired entries (call periodically)
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.limits.entries()) {
      if (entry.resetAt <= now) {
        this.limits.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// ============================================================================
// Rate Limit Guard (NestJS Guard)
// ============================================================================

import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { RequestWithUser } from './manifest-admin-auth.guard';

/**
 * Decorator metadata key for rate limit type
 */
export const RATE_LIMIT_TYPE_KEY = 'rateLimitType';

/**
 * Rate limit guard for admin endpoints
 */
@Injectable()
export class ManifestAdminRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(ManifestAdminRateLimitGuard.name);

  constructor(
    private readonly rateLimiter: ManifestAdminRateLimiter,
    private readonly defaultType: RateLimitType = 'standard',
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    
    // Get actor ID from user or IP
    const actorId = request.user?.id || request.ip || 'unknown';
    
    // Determine rate limit type from metadata or default
    const operation = this.getRateLimitType(context);
    
    const result = this.rateLimiter.checkLimit(actorId, operation);

    if (!result.allowed) {
      throw new HttpException(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          rate_limit_type: operation,
          retry_after_seconds: result.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Add rate limit headers to response
    const response = context.switchToHttp().getResponse();
    response.setHeader('X-RateLimit-Remaining', result.remaining.toString());
    response.setHeader('X-RateLimit-Reset', Math.floor(result.resetAt.getTime() / 1000).toString());

    return true;
  }

  /**
   * Get rate limit type from handler metadata or default
   */
  private getRateLimitType(context: ExecutionContext): RateLimitType {
    // Check if handler has @RateLimit('bulk') decorator
    const handler = context.getHandler();
    const metadata = Reflect.getMetadata(RATE_LIMIT_TYPE_KEY, handler);
    
    if (metadata === 'bulk') {
      return 'bulk';
    }

    // Check path for bulk endpoints
    const request = context.switchToHttp().getRequest<Request>();
    if (request.path.includes('redrive-bulk')) {
      return 'bulk';
    }

    return this.defaultType;
  }
}

// ============================================================================
// Decorator
// ============================================================================

import { SetMetadata } from '@nestjs/common';

/**
 * Decorator to set rate limit type for an endpoint
 * 
 * @example
 * @RateLimit('bulk')
 * @Post('/dlq/redrive-bulk')
 * async redriveBulk() { ... }
 */
export const RateLimit = (type: RateLimitType) => SetMetadata(RATE_LIMIT_TYPE_KEY, type);
