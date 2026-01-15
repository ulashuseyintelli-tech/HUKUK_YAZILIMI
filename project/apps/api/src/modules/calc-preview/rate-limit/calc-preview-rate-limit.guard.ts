/**
 * Phase 4.2 - Calc Preview Rate Limit Guard
 * 
 * NestJS Guard for rate limiting preview requests.
 * Returns 429 Too Many Requests with Retry-After header.
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 4.2
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CalcPreviewRateLimitService, RateLimitResult } from './calc-preview-rate-limit.service';
import { CalcPreviewMetricsService } from '../metrics/calc-preview-metrics.service';

// ============================================================================
// RATE LIMIT HEADERS
// ============================================================================

const RATE_LIMIT_HEADERS = {
  LIMIT: 'X-RateLimit-Limit',
  REMAINING: 'X-RateLimit-Remaining',
  RESET: 'X-RateLimit-Reset',
  RETRY_AFTER: 'Retry-After',
};

// ============================================================================
// RATE LIMIT GUARD
// ============================================================================

@Injectable()
export class CalcPreviewRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(CalcPreviewRateLimitGuard.name);

  constructor(
    private readonly rateLimitService: CalcPreviewRateLimitService,
    private readonly metricsService: CalcPreviewMetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    
    // Extract tenant ID from request
    const tenantId = this.extractTenantId(request);
    
    // Extract client ID (for trusted bypass)
    const clientId = this.extractClientId(request);
    
    // Check rate limit
    const result = this.rateLimitService.checkLimit(tenantId, clientId);
    
    // Set rate limit headers
    this.setRateLimitHeaders(response, result, tenantId);
    
    if (!result.allowed) {
      // Record rate limit hit in metrics
      this.metricsService.recordError({
        tenantId,
        domain: 'network',
        code: 'RATE_LIMITED',
        message: `Rate limit exceeded: ${result.reason}`,
      });
      
      this.logger.warn(`[RateLimit] Request blocked: ${tenantId}`, {
        reason: result.reason,
        retryAfterMs: result.retryAfterMs,
        clientId,
        path: request.path,
      });
      
      // Throw 429 with Retry-After
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: this.getErrorMessage(result.reason),
          retryAfterMs: result.retryAfterMs,
          retryAfter: result.retryAfterMs ? Math.ceil(result.retryAfterMs / 1000) : undefined,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    
    // Consume token
    this.rateLimitService.consume(tenantId);
    
    return true;
  }

  /**
   * Extract tenant ID from request
   * Priority: header > query > body > default
   */
  private extractTenantId(request: Request): string {
    // 1. Check header
    const headerTenant = request.headers['x-tenant-id'] as string;
    if (headerTenant) return headerTenant;
    
    // 2. Check query param
    const queryTenant = request.query.tenantId as string;
    if (queryTenant) return queryTenant;
    
    // 3. Check body
    const bodyTenant = (request.body as any)?.tenantId;
    if (bodyTenant) return bodyTenant;
    
    // 4. Default
    return 'default';
  }

  /**
   * Extract client ID for trusted bypass
   */
  private extractClientId(request: Request): string | undefined {
    // Check header
    const clientId = request.headers['x-client-id'] as string;
    if (clientId) return clientId;
    
    // Check API key (internal services)
    const apiKey = request.headers['x-api-key'] as string;
    if (apiKey === process.env.INTERNAL_API_KEY) {
      return 'internal-ops';
    }
    
    return undefined;
  }

  /**
   * Set rate limit headers on response
   */
  private setRateLimitHeaders(
    response: Response,
    result: RateLimitResult,
    tenantId: string,
  ): void {
    const status = this.rateLimitService.getStatus(tenantId);
    
    response.setHeader(RATE_LIMIT_HEADERS.LIMIT, status.capacity);
    response.setHeader(RATE_LIMIT_HEADERS.REMAINING, Math.max(0, result.remaining));
    
    if (result.resetAfterMs > 0) {
      const resetTime = Math.ceil((Date.now() + result.resetAfterMs) / 1000);
      response.setHeader(RATE_LIMIT_HEADERS.RESET, resetTime);
    }
    
    if (result.retryAfterMs) {
      const retryAfterSeconds = Math.ceil(result.retryAfterMs / 1000);
      response.setHeader(RATE_LIMIT_HEADERS.RETRY_AFTER, retryAfterSeconds);
    }
  }

  /**
   * Get user-friendly error message
   */
  private getErrorMessage(reason?: string): string {
    switch (reason) {
      case 'BUCKET_EMPTY':
        return 'İstek limiti aşıldı. Lütfen biraz bekleyip tekrar deneyin.';
      case 'GLOBAL_LIMIT':
        return 'Sistem yoğunluğu nedeniyle geçici olarak erişim kısıtlandı.';
      case 'TENANT_BLOCKED':
        return 'Hesabınız geçici olarak kısıtlandı. Destek ile iletişime geçin.';
      default:
        return 'Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin.';
    }
  }
}
