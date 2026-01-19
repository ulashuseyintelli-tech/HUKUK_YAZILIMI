/**
 * CrossTenantAccessInterceptor
 * 
 * Emits CROSS_TENANT_ACCESS_USED audit event for all successful cross-tenant reads.
 * 
 * Design Decisions:
 * - Uses mergeMap (not tap) for proper async await
 * - Audit fail → 500 (strict mode for legal/forensic)
 * - Only emits on 2xx responses
 * - Extracts resourceIds from path params (allowlist: tenantId, snapshotId, holdId, incidentId)
 * - Controller methods do NOT emit audit - interceptor handles all
 * 
 * Guard Chain (must run before this interceptor):
 * KillSwitchGuard → NetworkAllowlistGuard → TenantContextGuard → InternalOpsGuard → BreakGlassGrantGuard
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { randomUUID } from 'crypto';
import { RequestWithBreakGlass } from '../guards';
import { CrossTenantAuditService, AuditContext, UsedEventPayload } from '../services/audit';
import { BreakGlassGrantService } from '../services/grant';

/**
 * Allowlist of path params to extract as resourceIds
 */
const RESOURCE_ID_PARAMS = ['snapshotId', 'holdId', 'incidentId', 'bundleId'] as const;

/**
 * Allowlist of query params to include in audit
 */
const AUDIT_QUERY_PARAMS = ['incidentId', 'status'] as const;

@Injectable()
export class CrossTenantAccessInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CrossTenantAccessInterceptor.name);

  constructor(
    private readonly auditService: CrossTenantAuditService,
    private readonly grantService: BreakGlassGrantService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<RequestWithBreakGlass>();
    
    // Skip if no break-glass grant (shouldn't happen if guards are correct)
    if (!request.breakGlassGrant) {
      return next.handle();
    }

    return next.handle().pipe(
      mergeMap(async (responseData) => {
        // Emit USED audit event after successful response
        await this.emitUsedAudit(request);
        return responseData;
      }),
    );
  }

  /**
   * Emit CROSS_TENANT_ACCESS_USED audit event
   * 
   * STRICT MODE: Audit fail → 500
   * This is intentional for legal/forensic requirements.
   * If we can't audit the access, we must fail the request.
   */
  private async emitUsedAudit(request: RequestWithBreakGlass): Promise<void> {
    const tokenClaims = request.breakGlassGrant;
    if (!tokenClaims) {
      return;
    }

    try {
      // Get the full grant from DB for audit
      const grant = await this.grantService.getGrant(tokenClaims.grantId);
      if (!grant) {
        this.logger.error('Grant not found for audit event - failing request', {
          grantId: tokenClaims.grantId,
        });
        throw new InternalServerErrorException({
          error: 'AUDIT_GRANT_NOT_FOUND',
          message: 'Unable to audit cross-tenant access: grant not found',
        });
      }

      const context = this.extractAuditContext(request);
      const resourceScope = this.determineResourceScope(request);
      const resourceIds = this.extractResourceIds(request);

      // Build payload
      const payload: UsedEventPayload = {
        grant,
        resourceScope,
        context,
      };
      if (resourceIds.length > 0) {
        payload.resourceIds = resourceIds;
      }

      await this.auditService.emitUsed(payload);

      this.logger.debug('USED audit event emitted', {
        grantId: tokenClaims.grantId,
        resourceScope,
        resourceIds,
      });
    } catch (error) {
      // STRICT MODE: Audit fail → 500
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      this.logger.error('Failed to emit USED audit event - failing request', {
        grantId: tokenClaims.grantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // TODO: Emit AUDIT_WRITE_FAILED metric for alerting
      // metricsService.increment('break_glass.audit_write_failed', { grantId: tokenClaims.grantId });

      throw new InternalServerErrorException({
        error: 'AUDIT_WRITE_FAILED',
        message: 'Unable to audit cross-tenant access',
      });
    }
  }

  /**
   * Extract audit context from request
   */
  private extractAuditContext(request: RequestWithBreakGlass): AuditContext {
    const context: AuditContext = {
      ip: this.getClientIp(request),
      correlationId: (request.headers['x-correlation-id'] as string) || randomUUID(),
    };

    const userAgent = request.headers['user-agent'];
    if (typeof userAgent === 'string') {
      context.userAgent = userAgent;
    }

    const traceId = request.headers['x-trace-id'];
    if (typeof traceId === 'string') {
      context.traceId = traceId;
    }

    return context;
  }

  /**
   * Determine resource scope from request path
   */
  private determineResourceScope(request: RequestWithBreakGlass): string {
    const path = (request as any).path || (request as any).url || '';

    if (path.includes('/snapshots')) {
      return 'cross_tenant_read:snapshot';
    }
    if (path.includes('/legal-holds')) {
      return 'cross_tenant_read:legal_hold';
    }
    if (path.includes('/evidence-bundles')) {
      return 'cross_tenant_read:evidence_bundle';
    }
    if (path.includes('/incidents')) {
      return 'cross_tenant_read:incident';
    }

    return 'cross_tenant_read:unknown';
  }

  /**
   * Extract resource IDs from path params (allowlist only)
   */
  private extractResourceIds(request: RequestWithBreakGlass): string[] {
    const resourceIds: string[] = [];

    for (const param of RESOURCE_ID_PARAMS) {
      const value = request.params[param];
      if (value) {
        resourceIds.push(value);
      }
    }

    return resourceIds;
  }

  /**
   * Get client IP from request
   */
  private getClientIp(request: RequestWithBreakGlass): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return 'unknown';
  }
}
