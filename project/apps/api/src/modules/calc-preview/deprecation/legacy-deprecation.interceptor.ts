/**
 * Phase 4.5 - Legacy Deprecation Interceptor
 * 
 * NestJS Interceptor for:
 * - Adding deprecation headers to responses
 * - Recording traffic to deprecated endpoints
 * - Handling 410 Gone / 301 Redirect
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 4.5
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { LegacyDeprecationService, DEPRECATED_ENDPOINTS } from './legacy-deprecation.service';

@Injectable()
export class LegacyDeprecationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LegacyDeprecationInterceptor.name);

  constructor(private readonly deprecationService: LegacyDeprecationService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    
    const endpoint = request.path;
    const config = DEPRECATED_ENDPOINTS.find(e => e.path === endpoint);
    
    // Not a deprecated endpoint
    if (!config) {
      return next.handle();
    }
    
    // Extract tenant and client info
    const tenantId = this.extractTenantId(request);
    const clientId = this.extractClientId(request);
    const userAgent = request.headers['user-agent'];
    
    // Record traffic
    this.deprecationService.recordRequest({
      endpoint,
      tenantId,
      clientId,
      userAgent,
    });
    
    // Check if should return 410 Gone
    if (this.deprecationService.shouldReturn410(endpoint)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.GONE,
          error: 'Gone',
          message: `Bu endpoint kullanımdan kaldırıldı. Lütfen ${config.successor} kullanın.`,
          successor: config.successor,
        },
        HttpStatus.GONE,
      );
    }
    
    // Check if should redirect
    if (this.deprecationService.shouldRedirect(endpoint)) {
      response.redirect(HttpStatus.MOVED_PERMANENTLY, config.successor);
      return new Observable(subscriber => subscriber.complete());
    }
    
    // Add deprecation headers
    const headers = this.deprecationService.getDeprecationHeaders(endpoint);
    for (const [key, value] of Object.entries(headers)) {
      response.setHeader(key, value);
    }
    
    // Log warning
    this.logger.warn(`[Deprecation] Request to deprecated endpoint: ${endpoint}`, {
      tenant: tenantId,
      client: clientId,
      successor: config.successor,
      sunset: config.sunsetDate,
    });
    
    return next.handle().pipe(
      tap({
        next: () => {
          // Response successful - could trigger shadow compare here
        },
        error: (error) => {
          // Response failed
          this.logger.error(`[Deprecation] Error on deprecated endpoint: ${endpoint}`, {
            error: error.message,
          });
        },
      }),
    );
  }

  private extractTenantId(request: Request): string {
    return (
      (request.headers['x-tenant-id'] as string) ||
      (request.query.tenantId as string) ||
      (request.body as any)?.tenantId ||
      'default'
    );
  }

  private extractClientId(request: Request): string | undefined {
    return (
      (request.headers['x-client-id'] as string) ||
      undefined
    );
  }
}
