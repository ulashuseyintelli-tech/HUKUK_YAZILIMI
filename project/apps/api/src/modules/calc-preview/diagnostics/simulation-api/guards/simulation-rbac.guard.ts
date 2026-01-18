/**
 * Simulation RBAC Guard
 * 
 * Sprint 2F - Tenant boundary enforcement for simulation API
 * 
 * RED LINE #4: RBAC tenant-boundary override hole will not return
 * - tenant-admin: query/header tenant override attempt always forbidden
 * - internal-ops: override allowed
 * 
 * Tenant Resolution Rules:
 * | Role          | tenantScope Source                     | Cross-Tenant |
 * |---------------|----------------------------------------|--------------|
 * | tenant-admin  | Only auth context (token/header)       | ❌ FORBIDDEN |
 * | internal-ops  | Auth context OR ?tenantId query        | ✅ ALLOWED   |
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ForbiddenTenantScopeException } from '../simulation-error.types';

// ============================================================================
// Types
// ============================================================================

export type SimulationRole = 'tenant-admin' | 'internal-ops';

export interface SimulationTenantContext {
  tenantId: string;
  userId: string;
  role: SimulationRole;
  clientIp?: string | undefined;
  userAgent?: string | undefined;
}

export interface SimulationRequest extends Request {
  simulationTenantContext?: SimulationTenantContext;
}

// ============================================================================
// Role Validation
// ============================================================================

const VALID_ROLES: SimulationRole[] = ['tenant-admin', 'internal-ops'];

export function isValidSimulationRole(role: string): role is SimulationRole {
  return VALID_ROLES.includes(role as SimulationRole);
}

// ============================================================================
// Guard Implementation
// ============================================================================

@Injectable()
export class SimulationRBACGuard implements CanActivate {
  private readonly logger = new Logger(SimulationRBACGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SimulationRequest>();
    
    // 1. Extract tenant context from request (auth token/headers)
    const ctx = this.extractTenantContext(request);
    
    // 2. Reject anonymous access
    if (!ctx || !ctx.userId) {
      this.logger.warn('[SimulationRBAC] Anonymous access rejected', {
        path: request.path,
        ip: request.ip,
      });
      throw new UnauthorizedException('Authentication required for simulation API');
    }
    
    // 3. Validate role
    if (!isValidSimulationRole(ctx.role)) {
      this.logger.warn('[SimulationRBAC] Invalid role', {
        role: ctx.role,
        userId: ctx.userId,
      });
      throw new ForbiddenTenantScopeException();
    }
    
    // 4. RED LINE: tenant-admin override attempt = FORBIDDEN
    if (ctx.role === 'tenant-admin') {
      const requestedTenantId = this.extractRequestedTenantId(request);
      if (requestedTenantId && requestedTenantId !== ctx.tenantId) {
        this.logger.warn('[SimulationRBAC] Cross-tenant access denied for tenant-admin', {
          userId: ctx.userId,
          ownTenant: ctx.tenantId,
          requestedTenant: requestedTenantId,
          path: request.path,
        });
        throw new ForbiddenTenantScopeException();
      }
    }
    
    // 5. Resolve effective tenantScope based on role
    const effectiveTenantScope = this.resolveEffectiveTenantScope(ctx, request);
    
    // 6. Update context with effective tenant scope
    ctx.tenantId = effectiveTenantScope;
    
    // 7. Attach context to request for downstream use
    request.simulationTenantContext = ctx;
    
    this.logger.debug('[SimulationRBAC] Access granted', {
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      role: ctx.role,
      path: request.path,
    });
    
    return true;
  }

  /**
   * Validate tenant access (for use in service layer)
   * 
   * @returns true if access allowed, false otherwise
   */
  validateTenantAccess(
    requestTenantId: string,
    resourceTenantId: string,
    role: SimulationRole,
  ): boolean {
    if (role === 'internal-ops') {
      return true; // internal-ops can access any tenant
    }
    
    if (role === 'tenant-admin') {
      return requestTenantId === resourceTenantId;
    }
    
    return false;
  }

  /**
   * Resolve effective tenant scope based on role
   * 
   * - tenant-admin: ONLY from auth context (no override allowed)
   * - internal-ops: Can use ?tenantId or x-target-tenant-id to select tenant
   */
  private resolveEffectiveTenantScope(
    ctx: SimulationTenantContext,
    request: SimulationRequest,
  ): string {
    // tenant-admin: ALWAYS use auth context tenant
    if (ctx.role === 'tenant-admin') {
      return ctx.tenantId;
    }
    
    // internal-ops: Can override via query param or header
    const requestedTenantId = this.extractRequestedTenantId(request);
    
    if (requestedTenantId) {
      this.logger.debug('[SimulationRBAC] Tenant override by internal-ops', {
        userId: ctx.userId,
        authTenant: ctx.tenantId,
        requestedTenant: requestedTenantId,
      });
      return requestedTenantId;
    }
    
    // Default: use auth context tenant
    return ctx.tenantId;
  }

  /**
   * Extract tenant context from request headers/auth
   * 
   * Expected headers:
   * - x-tenant-id: Tenant identifier (from auth)
   * - x-user-id: User identifier (from auth)
   * - x-user-role: User role (tenant-admin, internal-ops)
   */
  private extractTenantContext(request: SimulationRequest): SimulationTenantContext | null {
    // Check if already extracted
    if (request.simulationTenantContext) {
      return request.simulationTenantContext;
    }
    
    // Extract from headers
    const tenantId = request.headers['x-tenant-id'] as string;
    const userId = request.headers['x-user-id'] as string;
    const role = request.headers['x-user-role'] as string;
    
    if (!tenantId || !userId || !role) {
      return null;
    }
    
    return {
      tenantId,
      userId,
      role: role as SimulationRole,
      clientIp: request.ip || request.socket?.remoteAddress || undefined,
      userAgent: request.headers['user-agent'] || undefined,
    };
  }

  /**
   * Extract requested tenant ID from request (for internal-ops override)
   * 
   * Sources (in order):
   * 1. Query parameter: ?tenantId=xxx
   * 2. Header: x-target-tenant-id
   */
  private extractRequestedTenantId(request: SimulationRequest): string | undefined {
    // Query parameter
    if (request.query.tenantId) {
      return request.query.tenantId as string;
    }
    
    // Header
    const targetTenant = request.headers['x-target-tenant-id'] as string;
    if (targetTenant) {
      return targetTenant;
    }
    
    return undefined;
  }
}

// ============================================================================
// Parameter Decorator
// ============================================================================

import { createParamDecorator } from '@nestjs/common';

/**
 * Parameter decorator to extract SimulationTenantContext from request
 * 
 * Usage:
 * ```typescript
 * @Post('simulate')
 * simulate(@SimulationTenant() ctx: SimulationTenantContext) { ... }
 * ```
 */
export const SimulationTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SimulationTenantContext => {
    const request = context.switchToHttp().getRequest<SimulationRequest>();
    
    if (!request.simulationTenantContext) {
      throw new UnauthorizedException('Simulation tenant context not available');
    }
    
    return request.simulationTenantContext;
  },
);
