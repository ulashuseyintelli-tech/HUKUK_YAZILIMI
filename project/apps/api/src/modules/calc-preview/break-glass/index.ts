/**
 * Break-Glass Module
 * 
 * Cross-tenant access control with:
 * - Kill switch (Gate 3)
 * - Network boundary enforcement (INV-4)
 * - Role-based access control
 * - Token validation (Gate 2)
 * - Audit trail (INV-3)
 * - Four-eyes principle (INV-2)
 * - Circuit breaker
 */

export { BreakGlassModule } from './break-glass.module';
export { BreakGlassConfigService, BreakGlassConfig, loadBreakGlassConfig } from './break-glass.config';
export {
  BreakGlassKillSwitchGuard,
  NetworkAllowlistGuard,
  InternalOpsGuard,
  BreakGlassApproverGuard,
  BreakGlassGrantGuard,
  RequestWithBreakGlass,
  APPROVER_ROLES,
} from './guards';
export {
  BreakGlassReason,
  BreakGlassReasonCategory,
  BreakGlassRequest,
  BreakGlassRequestStatus,
  BreakGlassGrant,
  BreakGlassTokenClaims,
  CrossTenantEventType,
  CrossTenantAuditEvent,
  CrossTenantScope,
  CROSS_TENANT_SCOPES,
  BREAK_GLASS_VALIDATION,
  validateBreakGlassReason,
  isValidCrossTenantScope,
} from './break-glass.types';

// Services
export * from './services';

// Controllers
export * from './controllers';
