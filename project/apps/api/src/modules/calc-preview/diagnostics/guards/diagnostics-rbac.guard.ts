/**
 * Diagnostics RBAC Guard - First Line of Defense
 * 
 * Phase 7A - Sprint 1 - Task 1.2
 * 
 * Defense in Depth:
 * - Guard = First line (Controller seviyesi)
 * - Service = Last line (tenantScope parametresi zorunlu)
 * 
 * Tenant Resolution Kuralı:
 * | Rol           | tenantScope Kaynağı                    | Başka Tenant Seçimi |
 * |---------------|----------------------------------------|---------------------|
 * | tenant-admin  | Sadece auth context (token/header)     | ❌ YASAK            |
 * | internal-ops  | Auth context VEYA ?tenantId query      | ✅ İZİNLİ           |
 * | system        | Auth context VEYA ?tenantId query      | ✅ İZİNLİ           |
 * 
 * @see .kiro/specs/self-serve-diagnostics/design.md - RBAC Defense in Depth
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { TenantAccessContext, isValidRole } from '../diagnostics.types';

// ============================================================================
// REQUEST EXTENSION
// ============================================================================

/**
 * Extended request with tenant context
 */
export interface DiagnosticsRequest extends Request {
  tenantContext?: TenantAccessContext;
}

// ============================================================================
// RBAC GUARD
// ============================================================================

@Injectable()
export class DiagnosticsRBACGuard implements CanActivate {
  private readonly logger = new Logger(DiagnosticsRBACGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<DiagnosticsRequest>();
    
    // 1. Extract tenant context from request (auth token/headers)
    const ctx = this.extractTenantContext(request);
    
    // 2. Reject anonymous access
    if (!ctx || !ctx.userId) {
      this.logger.warn('[RBAC] Anonymous access rejected', {
        path: request.path,
        ip: request.ip,
      });
      throw new UnauthorizedException('Authentication required for diagnostics');
    }
    
    // 3. Validate role
    if (!isValidRole(ctx.role)) {
      this.logger.warn('[RBAC] Invalid role', {
        role: ctx.role,
        userId: ctx.userId,
      });
      throw new ForbiddenException('Invalid role for diagnostics access');
    }
    
    // 4. Resolve effective tenantScope based on role
    const effectiveTenantScope = this.resolveEffectiveTenantScope(ctx, request);
    
    // 5. tenant-admin: CANNOT select different tenant
    if (ctx.role === 'tenant-admin') {
      if (effectiveTenantScope !== ctx.tenantId) {
        this.logger.warn('[RBAC] Cross-tenant access denied for tenant-admin', {
          userId: ctx.userId,
          ownTenant: ctx.tenantId,
          requestedTenant: effectiveTenantScope,
          path: request.path,
        });
        throw new ForbiddenException('Access denied: tenant-admin cannot access other tenant data');
      }
    }
    
    // 6. Update context with effective tenant scope
    ctx.tenantId = effectiveTenantScope;
    
    // 7. Attach context to request for downstream use
    request.tenantContext = ctx;
    
    this.logger.debug('[RBAC] Access granted', {
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      role: ctx.role,
      path: request.path,
    });
    
    return true;
  }

  /**
   * Resolve effective tenant scope based on role
   * 
   * - tenant-admin: ONLY from auth context (no override allowed)
   * - internal-ops/system: Can use ?tenantId or x-target-tenant-id to select tenant
   */
  private resolveEffectiveTenantScope(ctx: TenantAccessContext, request: DiagnosticsRequest): string {
    // tenant-admin: ALWAYS use auth context tenant
    if (ctx.role === 'tenant-admin') {
      return ctx.tenantId;
    }
    
    // internal-ops/system: Can override via query param or header
    const requestedTenantId = this.extractRequestedTenantId(request);
    
    if (requestedTenantId) {
      this.logger.debug('[RBAC] Tenant override by internal-ops/system', {
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
   * - x-user-role: User role (tenant-admin, internal-ops, system)
   * 
   * In production, these would come from JWT/session validation
   */
  private extractTenantContext(request: DiagnosticsRequest): TenantAccessContext | null {
    // Check if already extracted (e.g., by auth middleware)
    if (request.tenantContext) {
      return request.tenantContext;
    }
    
    // Extract from headers (simplified for MVP)
    const tenantId = request.headers['x-tenant-id'] as string;
    const userId = request.headers['x-user-id'] as string;
    const role = request.headers['x-user-role'] as string;
    
    if (!tenantId || !userId || !role) {
      return null;
    }
    
    return {
      tenantId,
      userId,
      role: role as TenantAccessContext['role'],
      clientIp: request.ip || request.socket?.remoteAddress || undefined,
      userAgent: request.headers['user-agent'] || undefined,
    };
  }

  /**
   * Extract requested tenant ID from request (for internal-ops/system override)
   * 
   * Sources (in order):
   * 1. Query parameter: ?tenantId=xxx
   * 2. Header: x-target-tenant-id
   */
  private extractRequestedTenantId(request: DiagnosticsRequest): string | undefined {
    // Query parameter
    if (request.query.tenantId) {
      return request.query.tenantId as string;
    }
    
    // Header (for internal-ops cross-tenant access)
    const targetTenant = request.headers['x-target-tenant-id'] as string;
    if (targetTenant) {
      return targetTenant;
    }
    
    return undefined;
  }
}

// ============================================================================
// TENANT CONTEXT DECORATOR
// ============================================================================

import { createParamDecorator } from '@nestjs/common';

/**
 * Parameter decorator to extract TenantAccessContext from request
 * 
 * Usage:
 * ```typescript
 * @Get('health')
 * getHealth(@TenantContext() ctx: TenantAccessContext) { ... }
 * ```
 */
export const TenantContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantAccessContext => {
    const request = context.switchToHttp().getRequest<DiagnosticsRequest>();
    
    if (!request.tenantContext) {
      throw new UnauthorizedException('Tenant context not available');
    }
    
    return request.tenantContext;
  },
);
