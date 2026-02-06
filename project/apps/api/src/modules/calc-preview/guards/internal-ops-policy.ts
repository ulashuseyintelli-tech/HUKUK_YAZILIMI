/**
 * Internal Ops Policy — Single Source of Truth
 *
 * PR-1: Shared policy function consumed by ManifestAdminAuthGuard
 * and any future ops guard. Role list, break-glass check, and
 * header parsing live HERE and nowhere else.
 *
 * @see ManifestAdminAuthGuard (consumer)
 * @see calc-preview.controller.ts (method-level usage)
 */

import { Logger } from '@nestjs/common';

// ============================================================================
// Types
// ============================================================================

export interface InternalOpsUser {
  id: string;
  email?: string;
  roles?: string[];
}

export interface InternalOpsPolicyResult {
  allowed: boolean;
  code: 'ALLOWED' | 'BREAK_GLASS_CLOSED' | 'UNAUTHORIZED' | 'INSUFFICIENT_ROLE';
  message: string;
  /** For audit: actor id when allowed */
  actorId?: string;
}

export interface IBreakGlassFlag {
  isBreakGlassOpen(): boolean;
}

// ============================================================================
// Constants — THE canonical role list
// ============================================================================

/** Roles that grant internal-ops access. Add here, nowhere else. */
export const INTERNAL_OPS_ROLES: readonly string[] = Object.freeze(['ops_admin']);

/** Default env var for break-glass feature flag */
export const BREAK_GLASS_FLAG_ENV = 'MANIFEST_RETRY_ADMIN_ENABLED';

// ============================================================================
// Policy Function
// ============================================================================

const logger = new Logger('InternalOpsPolicy');

/**
 * Evaluate internal-ops access policy.
 *
 * Gates (in order):
 *  1. Break-glass must be open
 *  2. User must be present (authenticated)
 *  3. User must hold at least one INTERNAL_OPS_ROLES entry
 */
export function evaluateInternalOpsPolicy(
  user: InternalOpsUser | undefined | null,
  breakGlass: IBreakGlassFlag,
  meta?: { path?: string; method?: string },
): InternalOpsPolicyResult {
  // GATE 1: break-glass
  if (!breakGlass.isBreakGlassOpen()) {
    logger.warn('[InternalOpsPolicy] Denied — break-glass closed', meta);
    return {
      allowed: false,
      code: 'BREAK_GLASS_CLOSED',
      message: 'Admin access is currently disabled',
    };
  }

  // GATE 2: authentication
  if (!user) {
    logger.warn('[InternalOpsPolicy] Denied — no user context', meta);
    return {
      allowed: false,
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    };
  }

  // GATE 3: role check
  const hasRole = INTERNAL_OPS_ROLES.some((r) => user.roles?.includes(r));
  if (!hasRole) {
    logger.warn('[InternalOpsPolicy] Denied — missing role', {
      ...meta,
      userId: user.id,
      userRoles: user.roles,
      requiredOneOf: INTERNAL_OPS_ROLES,
    });
    return {
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
      message: `One of roles [${INTERNAL_OPS_ROLES.join(', ')}] required`,
    };
  }

  logger.debug('[InternalOpsPolicy] Allowed', { ...meta, userId: user.id });
  return { allowed: true, code: 'ALLOWED', message: 'OK', actorId: user.id };
}

// ============================================================================
// Default Break-Glass Flag (env-based)
// ============================================================================

export class EnvBreakGlassFlag implements IBreakGlassFlag {
  constructor(private readonly envVar: string = BREAK_GLASS_FLAG_ENV) {}

  isBreakGlassOpen(): boolean {
    return process.env[this.envVar] === 'true';
  }
}
