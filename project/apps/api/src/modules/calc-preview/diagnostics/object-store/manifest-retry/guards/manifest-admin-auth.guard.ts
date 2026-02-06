/**
 * Manifest Admin Auth Guard
 * 
 * Phase 10.2 - Task 4.1
 * 
 * Authorization guard for manifest retry admin endpoints.
 * 
 * GATES:
 * 1. Break-glass check: Feature flag must be enabled
 * 2. Role check: User must have ops_admin role
 * 
 * RESPONSES:
 * - 403 Forbidden: Break-glass closed (BREAK_GLASS_CLOSED)
 * - 401 Unauthorized: Missing or invalid auth
 * - 403 Forbidden: Missing ops_admin role
 * 
 * @see .kiro/specs/phase-10-2-production-hardening/design.md
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';

// ============================================================================
// Types
// ============================================================================

export interface ManifestAdminAuthConfig {
  /** Feature flag name for break-glass */
  breakGlassFeatureFlag: string;
  /** Required role for admin access */
  requiredRole: string;
}

export const DEFAULT_MANIFEST_ADMIN_AUTH_CONFIG: ManifestAdminAuthConfig = {
  breakGlassFeatureFlag: 'MANIFEST_RETRY_ADMIN_ENABLED',
  requiredRole: 'ops_admin',
};

/**
 * User context from JWT (simplified)
 */
export interface AuthUser {
  id: string;
  email?: string;
  roles?: string[];
}

/**
 * Request with user context
 */
export interface RequestWithUser extends Request {
  user?: AuthUser;
}

// ============================================================================
// Feature Flag Service Interface
// ============================================================================

export interface IManifestAdminFeatureFlagService {
  isBreakGlassOpen(): boolean;
}

/**
 * Default implementation using environment variable
 */
export class ManifestAdminFeatureFlagService implements IManifestAdminFeatureFlagService {
  private readonly flagName: string;

  constructor(flagName: string = DEFAULT_MANIFEST_ADMIN_AUTH_CONFIG.breakGlassFeatureFlag) {
    this.flagName = flagName;
  }

  /**
   * Check if break-glass is open (admin access enabled)
   * Default: CLOSED (false) - must explicitly enable
   */
  isBreakGlassOpen(): boolean {
    const value = process.env[this.flagName];
    return value === 'true';
  }
}

// ============================================================================
// Guard Implementation
// ============================================================================

@Injectable()
export class ManifestAdminAuthGuard implements CanActivate {
  private readonly logger = new Logger(ManifestAdminAuthGuard.name);
  private featureFlagService: IManifestAdminFeatureFlagService;
  private readonly config: ManifestAdminAuthConfig;

  constructor(
    featureFlagService?: IManifestAdminFeatureFlagService,
    config?: Partial<ManifestAdminAuthConfig>,
  ) {
    this.config = { ...DEFAULT_MANIFEST_ADMIN_AUTH_CONFIG, ...config };
    this.featureFlagService = featureFlagService || new ManifestAdminFeatureFlagService(this.config.breakGlassFeatureFlag);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    // GATE 1: Check break-glass state
    if (!this.featureFlagService.isBreakGlassOpen()) {
      this.logger.warn('[ManifestAdminAuth] Access denied - break-glass closed', {
        path: request.path,
        method: request.method,
      });
      throw new ForbiddenException({
        code: 'BREAK_GLASS_CLOSED',
        message: 'Admin access is currently disabled',
      });
    }

    // GATE 2: Check authentication
    const user = request.user;
    if (!user) {
      this.logger.warn('[ManifestAdminAuth] Access denied - no user context', {
        path: request.path,
        method: request.method,
      });
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    // GATE 3: Check role
    if (!user.roles?.includes(this.config.requiredRole)) {
      this.logger.warn('[ManifestAdminAuth] Access denied - missing role', {
        path: request.path,
        method: request.method,
        userId: user.id,
        userRoles: user.roles,
        requiredRole: this.config.requiredRole,
      });
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: `Role '${this.config.requiredRole}' required`,
      });
    }

    this.logger.debug('[ManifestAdminAuth] Access granted', {
      path: request.path,
      method: request.method,
      userId: user.id,
    });

    return true;
  }

  /**
   * Set feature flag service (for testing)
   */
  setFeatureFlagService(service: IManifestAdminFeatureFlagService): void {
    this.featureFlagService = service;
  }
}

// ============================================================================
// Mock for Testing
// ============================================================================

export class MockManifestAdminFeatureFlagService implements IManifestAdminFeatureFlagService {
  private open = false;

  isBreakGlassOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    this.open = open;
  }
}
