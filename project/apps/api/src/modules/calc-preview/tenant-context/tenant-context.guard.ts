/**
 * TenantContextGuard
 * 
 * Injects resolved TenantContext into the request.
 * Rejects requests with missing or invalid tenant context.
 * 
 * GATE 1 ENFORCEMENT:
 * - This guard uses TenantContextResolver exclusively
 * - Controllers access tenant via @TenantCtx() decorator or request.tenantContext
 * - No direct header/param access for tenant ID is permitted
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  createParamDecorator,
  Logger,
} from '@nestjs/common';
import { TenantContextResolver } from './tenant-context.resolver';
import { TenantContext, TenantContextErrorCode } from './tenant-context.types';

/**
 * Extended request with tenant context
 */
export interface RequestWithTenantContext {
  tenantContext: TenantContext;
  user?: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Map error codes to HTTP status descriptions
 */
const ERROR_MESSAGES: Record<TenantContextErrorCode, string> = {
  MISSING_AUTH: 'Authentication required',
  INVALID_JWT: 'Invalid authentication token',
  MISSING_TENANT_CLAIM: 'Tenant identification missing from token',
  INVALID_HMAC: 'Internal authentication failed',
  MISSING_HMAC: 'Internal authentication signature required',
  EXPIRED_TOKEN: 'Authentication token has expired',
  INVALID_ISSUER: 'Authentication token from untrusted source',
  INVALID_AUDIENCE: 'Authentication token not valid for this service',
};

@Injectable()
export class TenantContextGuard implements CanActivate {
  private readonly logger = new Logger(TenantContextGuard.name);

  constructor(private readonly resolver: TenantContextResolver) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithTenantContext>();
    
    const result = this.resolver.resolve(request);

    if (!result.success) {
      this.logger.warn('Tenant context resolution failed', {
        code: result.error.code,
        message: result.error.message,
        ip: request.headers['x-forwarded-for'] || request.headers['x-real-ip'],
      });

      throw new UnauthorizedException({
        error: result.error.code,
        message: ERROR_MESSAGES[result.error.code] || result.error.message,
      });
    }

    // Attach tenant context to request
    request.tenantContext = result.context;

    this.logger.debug('Tenant context resolved', {
      tenantId: result.context.tenantId,
      authType: result.context.authType,
      actorId: result.context.actor.id,
      correlationId: result.context.correlationId,
    });

    return true;
  }
}

/**
 * Parameter decorator to extract TenantContext from request
 * 
 * Usage:
 * ```typescript
 * @Get('data')
 * getData(@TenantCtx() ctx: TenantContext) {
 *   // ctx.tenantId is guaranteed to be valid
 * }
 * ```
 */
export const TenantCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest<RequestWithTenantContext>();
    
    if (!request.tenantContext) {
      throw new UnauthorizedException({
        error: 'MISSING_CONTEXT',
        message: 'TenantContextGuard must be applied before using @TenantCtx()',
      });
    }

    return request.tenantContext;
  },
);

/**
 * Parameter decorator to extract just the tenantId
 * 
 * Usage:
 * ```typescript
 * @Get('data')
 * getData(@TenantId() tenantId: string) {
 *   // tenantId is guaranteed to be valid
 * }
 * ```
 */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<RequestWithTenantContext>();
    
    if (!request.tenantContext) {
      throw new UnauthorizedException({
        error: 'MISSING_CONTEXT',
        message: 'TenantContextGuard must be applied before using @TenantId()',
      });
    }

    return request.tenantContext.tenantId;
  },
);
