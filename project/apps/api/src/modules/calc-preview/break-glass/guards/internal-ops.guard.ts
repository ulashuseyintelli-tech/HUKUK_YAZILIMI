/**
 * InternalOpsGuard
 * 
 * Verifies that the requester has the internal_ops role.
 * This is required for all break-glass management endpoints.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { RequestWithTenantContext } from '../../tenant-context';

/**
 * Required role for internal ops access
 */
const INTERNAL_OPS_ROLE = 'internal_ops';

/**
 * Roles that can approve break-glass requests (4-eyes principle)
 */
export const APPROVER_ROLES = ['ops_lead', 'security', 'admin'] as const;

@Injectable()
export class InternalOpsGuard implements CanActivate {
  private readonly logger = new Logger(InternalOpsGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithTenantContext & { user?: any }>();
    
    // Check if user has internal_ops role
    const userRoles = this.extractRoles(request);
    
    if (!userRoles.includes(INTERNAL_OPS_ROLE)) {
      this.logger.warn('Access denied: missing internal_ops role', {
        actorId: request.tenantContext?.actor?.id,
        roles: userRoles,
      });
      
      throw new ForbiddenException({
        error: 'INSUFFICIENT_ROLE',
        message: 'Access denied: internal_ops role required',
      });
    }

    return true;
  }

  /**
   * Extract roles from request
   */
  private extractRoles(request: RequestWithTenantContext & { user?: any }): string[] {
    // Try tenant context scopes first
    if (request.tenantContext?.scopes) {
      const roleScopes = request.tenantContext.scopes
        .filter(s => s.startsWith('role:'))
        .map(s => s.substring(5));
      if (roleScopes.length > 0) {
        return roleScopes;
      }
    }

    // Fall back to user.roles
    if (request.user?.roles) {
      return Array.isArray(request.user.roles) ? request.user.roles : [request.user.roles];
    }

    // Fall back to user.role
    if (request.user?.role) {
      return [request.user.role];
    }

    return [];
  }
}

/**
 * Guard that checks for approver role (ops_lead, security, admin)
 * Used for the approve endpoint
 */
@Injectable()
export class BreakGlassApproverGuard implements CanActivate {
  private readonly logger = new Logger(BreakGlassApproverGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithTenantContext & { user?: any }>();
    
    const userRoles = this.extractRoles(request);
    const hasApproverRole = userRoles.some(role => 
      (APPROVER_ROLES as readonly string[]).includes(role)
    );
    
    if (!hasApproverRole) {
      this.logger.warn('Access denied: missing approver role', {
        actorId: request.tenantContext?.actor?.id,
        roles: userRoles,
        requiredRoles: APPROVER_ROLES,
      });
      
      throw new ForbiddenException({
        error: 'INSUFFICIENT_ROLE',
        message: 'Access denied: approver role required (ops_lead, security, or admin)',
      });
    }

    return true;
  }

  private extractRoles(request: RequestWithTenantContext & { user?: any }): string[] {
    if (request.tenantContext?.scopes) {
      const roleScopes = request.tenantContext.scopes
        .filter(s => s.startsWith('role:'))
        .map(s => s.substring(5));
      if (roleScopes.length > 0) {
        return roleScopes;
      }
    }

    if (request.user?.roles) {
      return Array.isArray(request.user.roles) ? request.user.roles : [request.user.roles];
    }

    if (request.user?.role) {
      return [request.user.role];
    }

    return [];
  }
}
