/**
 * Manifest Admin Auth Guard
 * 
 * Phase 10.2 - Task 4.1
 * PR-1: Refactored to delegate to shared internal_ops_policy.
 * 
 * Authorization guard for manifest retry admin endpoints.
 * 
 * GATES (delegated to evaluateInternalOpsPolicy):
 * 1. Break-glass check: Feature flag must be enabled
 * 2. Auth check: User must be present
 * 3. Role check: User must hold an INTERNAL_OPS_ROLES entry
 * 
 * RESPONSES:
 * - 403 Forbidden: Break-glass closed (BREAK_GLASS_CLOSED)
 * - 401 Unauthorized: Missing or invalid auth
 * - 403 Forbidden: Missing required role (INSUFFICIENT_ROLE)
 * 
 * @see guards/internal-ops-policy.ts — single source of truth for role list
 * @see .kiro/specs/phase-10-2-production-hardening/design.md
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  evaluateInternalOpsPolicy,
  IBreakGlassFlag,
  EnvBreakGlassFlag,
  BREAK_GLASS_FLAG_ENV,
} from '../../../../guards/internal-ops-policy';

// ============================================================================
// Types (kept for backward compat — consumers import from here)
// ============================================================================

export interface ManifestAdminAuthConfig {
  /** Feature flag name for break-glass */
  breakGlassFeatureFlag: string;
}

export const DEFAULT_MANIFEST_ADMIN_AUTH_CONFIG: ManifestAdminAuthConfig = {
  breakGlassFeatureFlag: BREAK_GLASS_FLAG_ENV,
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
// Feature Flag Service Interface (kept for backward compat)
// ============================================================================

export interface IManifestAdminFeatureFlagService extends IBreakGlassFlag {}

/**
 * Default implementation using environment variable
 */
export class ManifestAdminFeatureFlagService extends EnvBreakGlassFlag implements IManifestAdminFeatureFlagService {
  constructor(flagName: string = DEFAULT_MANIFEST_ADMIN_AUTH_CONFIG.breakGlassFeatureFlag) {
    super(flagName);
  }
}

// ============================================================================
// Guard Implementation
// ============================================================================

@Injectable()
export class ManifestAdminAuthGuard implements CanActivate {
  private featureFlagService: IManifestAdminFeatureFlagService;

  constructor(
    featureFlagService?: IManifestAdminFeatureFlagService,
    config?: Partial<ManifestAdminAuthConfig>,
  ) {
    const cfg = { ...DEFAULT_MANIFEST_ADMIN_AUTH_CONFIG, ...config };
    this.featureFlagService = featureFlagService || new ManifestAdminFeatureFlagService(cfg.breakGlassFeatureFlag);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    const result = evaluateInternalOpsPolicy(
      request.user ?? undefined,
      this.featureFlagService,
      { path: request.path, method: request.method },
    );

    if (result.allowed) return true;

    switch (result.code) {
      case 'BREAK_GLASS_CLOSED':
        throw new ForbiddenException({ code: result.code, message: result.message });
      case 'UNAUTHORIZED':
        throw new UnauthorizedException({ code: result.code, message: result.message });
      case 'INSUFFICIENT_ROLE':
        throw new ForbiddenException({ code: result.code, message: result.message });
      default:
        throw new ForbiddenException({ code: 'DENIED', message: result.message });
    }
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
