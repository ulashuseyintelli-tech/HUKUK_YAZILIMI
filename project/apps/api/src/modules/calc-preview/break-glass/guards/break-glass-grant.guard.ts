/**
 * BreakGlassGrantGuard
 * 
 * GATE 2: Verifies break-glass grant tokens.
 * 
 * This guard ensures:
 * - Token has bg=true claim
 * - Token issuer is 'break-glass-authority' (not user JWT issuer)
 * - Token is not expired (via jwt.verify)
 * - Token scope matches requested resource
 * - Target tenant matches request
 * - Grant is still active in DB (10s TTL cache, fail-closed)
 * - Actor binding: ctx.actorId must be in authorizedActors
 * 
 * NOTE: renewalsLeft is NOT checked here - enforcement is in renew API only.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  ServiceUnavailableException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { BreakGlassConfigService } from '../break-glass.config';
import { BreakGlassTokenClaims } from '../break-glass.types';
import { BreakGlassGrantService } from '../services/grant/grant.service';
import { CrossTenantAuditService } from '../services/audit/cross-tenant-audit.service';
import { RequestWithTenantContext } from '../../tenant-context';

/**
 * Extended request with break-glass context
 */
export interface RequestWithBreakGlass extends Partial<RequestWithTenantContext> {
  headers: Record<string, string | string[] | undefined>;
  params: Record<string, string>;
  breakGlassGrant?: BreakGlassTokenClaims;
}

@Injectable()
export class BreakGlassGrantGuard implements CanActivate {
  private readonly logger = new Logger(BreakGlassGrantGuard.name);

  constructor(
    private readonly config: BreakGlassConfigService,
    @Optional() @Inject('BREAK_GLASS_GRANT_SERVICE')
    private readonly grantService?: BreakGlassGrantService,
    @Optional() @Inject('CROSS_TENANT_AUDIT_SERVICE')
    private readonly auditService?: CrossTenantAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithBreakGlass>();
    
    // FAIL-SAFE: Check audit system health first
    // If audit is DEGRADED, break-glass is unavailable (controlled shutdown)
    this.verifyAuditSystemHealth();
    
    // Extract token from Authorization header
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException({
        error: 'MISSING_BREAK_GLASS_TOKEN',
        message: 'Break-glass grant token required',
      });
    }

    // Verify and decode token
    const claims = this.verifyToken(token);
    
    // GATE 2: Verify this is a break-glass token, not a user JWT
    this.verifyBreakGlassToken(claims);
    
    // Verify target tenant matches request
    this.verifyTargetTenant(claims, request);
    
    // Verify scope matches requested resource
    this.verifyScope(claims, request);
    
    // Actor binding check (Option A): ctx.actorId must be in authorizedActors
    this.verifyActorBinding(claims, request);
    
    // DB status check with 10s TTL cache (fail-closed)
    await this.verifyGrantActiveInDb(claims.grantId);
    
    // Attach claims to request for downstream use
    request.breakGlassGrant = claims;
    
    this.logger.debug('Break-glass grant verified', {
      grantId: claims.grantId,
      targetTenantId: claims.targetTenantId,
      scopes: claims.scopes,
      renewalsLeft: claims.renewalsLeft,
      authorizedActors: claims.authorizedActors,
    });

    return true;
  }

  /**
   * FAIL-SAFE: Verify audit system is healthy
   * 
   * If audit system is DEGRADED (consecutive write failures), break-glass
   * operations are unavailable. This is controlled shutdown - the system
   * fails safely rather than allowing unaudited access.
   */
  private verifyAuditSystemHealth(): void {
    if (!this.auditService) {
      // Audit service not injected (e.g., in tests) - skip check
      return;
    }

    if (!this.auditService.isHealthy()) {
      const metrics = this.auditService.getMetrics();
      this.logger.error('Break-glass unavailable: audit system DEGRADED', {
        consecutiveFailures: metrics.consecutiveFailures,
        lastFailureAt: metrics.lastFailureAt,
        status: metrics.status,
      });
      throw new ServiceUnavailableException({
        error: 'BREAK_GLASS_UNAVAILABLE',
        message: 'Break-glass access temporarily unavailable due to audit system issues',
        retryAfter: 60, // Suggest retry after 1 minute
      });
    }
  }

  /**
   * Extract token from Authorization header
   */
  private extractToken(request: RequestWithBreakGlass): string | null {
    const authHeader = request.headers['authorization'];
    if (!authHeader) return null;

    const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    
    // Support both "Bearer <token>" and "BreakGlass <token>"
    if (headerValue.startsWith('Bearer ')) {
      return headerValue.substring(7);
    }
    if (headerValue.startsWith('BreakGlass ')) {
      return headerValue.substring(11);
    }

    return null;
  }

  /**
   * Verify and decode JWT token
   */
  private verifyToken(token: string): BreakGlassTokenClaims {
    const tokenConfig = this.config.getTokenConfig();

    try {
      const decoded = jwt.verify(token, tokenConfig.secret, {
        issuer: tokenConfig.issuer,
        audience: tokenConfig.audience,
      }) as BreakGlassTokenClaims;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException({
          error: 'BREAK_GLASS_TOKEN_EXPIRED',
          message: 'Break-glass grant has expired',
        });
      }
      if (error instanceof jwt.JsonWebTokenError) {
        this.logger.warn('Invalid break-glass token', { error: error.message });
        throw new UnauthorizedException({
          error: 'INVALID_BREAK_GLASS_TOKEN',
          message: 'Invalid break-glass grant token',
        });
      }
      throw error;
    }
  }

  /**
   * GATE 2: Verify this is a break-glass token, not a user JWT
   */
  private verifyBreakGlassToken(claims: BreakGlassTokenClaims): void {
    // Must have bg=true claim
    if (claims.bg !== true) {
      this.logger.warn('Token missing bg=true claim - possible user JWT misuse');
      throw new ForbiddenException({
        error: 'NOT_BREAK_GLASS_TOKEN',
        message: 'Token is not a valid break-glass grant',
      });
    }

    // Must have correct issuer (already verified by jwt.verify, but double-check)
    const tokenConfig = this.config.getTokenConfig();
    if (claims.iss !== tokenConfig.issuer) {
      this.logger.warn('Token has wrong issuer', {
        expected: tokenConfig.issuer,
        actual: claims.iss,
      });
      throw new ForbiddenException({
        error: 'INVALID_TOKEN_ISSUER',
        message: 'Token issuer mismatch',
      });
    }

    // Must have grantId
    if (!claims.grantId) {
      throw new ForbiddenException({
        error: 'MISSING_GRANT_ID',
        message: 'Token missing grantId claim',
      });
    }
  }

  /**
   * Verify target tenant matches request
   */
  private verifyTargetTenant(claims: BreakGlassTokenClaims, request: RequestWithBreakGlass): void {
    const requestedTenantId = request.params.tenantId;
    
    if (!requestedTenantId) {
      // No tenant in path - this might be a management endpoint
      return;
    }

    if (claims.targetTenantId !== requestedTenantId) {
      this.logger.warn('Tenant mismatch in break-glass access', {
        grantTenant: claims.targetTenantId,
        requestedTenant: requestedTenantId,
      });
      throw new ForbiddenException({
        error: 'TENANT_MISMATCH',
        message: 'Break-glass grant is for a different tenant',
      });
    }
  }

  /**
   * Verify scope matches requested resource
   */
  private verifyScope(claims: BreakGlassTokenClaims, request: RequestWithBreakGlass): void {
    // Determine required scope from request path
    const requiredScope = this.determineRequiredScope(request);
    
    if (!requiredScope) {
      // No specific scope required for this endpoint
      return;
    }

    if (!claims.scopes.includes(requiredScope)) {
      this.logger.warn('Scope mismatch in break-glass access', {
        grantScopes: claims.scopes,
        requiredScope,
      });
      throw new ForbiddenException({
        error: 'INSUFFICIENT_SCOPE',
        message: `Break-glass grant missing required scope: ${requiredScope}`,
      });
    }
  }

  /**
   * Determine required scope from request path
   */
  private determineRequiredScope(request: RequestWithBreakGlass): string | null {
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

    return null;
  }

  /**
   * Verify actor binding (Option A)
   * 
   * The current actor (from TenantContext) must be in the token's authorizedActors list.
   * This prevents token sharing/delegation outside the authorized set.
   */
  private verifyActorBinding(claims: BreakGlassTokenClaims, request: RequestWithBreakGlass): void {
    // Get actor ID from TenantContext (set by TenantContextGuard)
    const actorId = request.tenantContext?.actor?.id;
    
    if (!actorId) {
      this.logger.warn('Actor binding check failed: no actor ID in context', {
        grantId: claims.grantId,
      });
      throw new ForbiddenException({
        error: 'MISSING_ACTOR_CONTEXT',
        message: 'Actor identity required for break-glass access',
      });
    }

    // Check if actor is in authorizedActors list
    if (!claims.authorizedActors || !claims.authorizedActors.includes(actorId)) {
      this.logger.warn('Actor binding check failed: actor not authorized', {
        grantId: claims.grantId,
        actorId,
        authorizedActors: claims.authorizedActors,
      });
      throw new ForbiddenException({
        error: 'TOKEN_NOT_AUTHORIZED_FOR_ACTOR',
        message: 'This break-glass token is not authorized for your identity',
      });
    }

    this.logger.debug('Actor binding verified', {
      grantId: claims.grantId,
      actorId,
    });
  }

  /**
   * Verify grant is still active in DB (10s TTL cache, fail-closed)
   */
  private async verifyGrantActiveInDb(grantId: string): Promise<void> {
    // If grant service is not available (e.g., in tests), skip DB check
    if (!this.grantService) {
      this.logger.debug('Grant service not available - skipping DB status check');
      return;
    }

    try {
      const isActive = await this.grantService.isGrantActive(grantId);
      
      if (!isActive) {
        this.logger.warn('Break-glass grant is not active in DB', { grantId });
        throw new ForbiddenException({
          error: 'GRANT_NOT_ACTIVE',
          message: 'Break-glass grant has been revoked or expired',
        });
      }
    } catch (error) {
      // If it's already a ForbiddenException, re-throw
      if (error instanceof ForbiddenException) {
        throw error;
      }
      
      // Fail-closed: any other error means deny access
      this.logger.error('Failed to verify grant status - failing closed', {
        grantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new ForbiddenException({
        error: 'GRANT_STATUS_CHECK_FAILED',
        message: 'Unable to verify grant status',
      });
    }
  }
}
