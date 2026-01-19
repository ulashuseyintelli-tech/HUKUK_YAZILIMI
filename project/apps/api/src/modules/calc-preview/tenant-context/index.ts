/**
 * Tenant Context Module
 * 
 * Single source of truth for tenant identity.
 * 
 * GATE 1: All tenant context must flow through TenantContextResolver.
 * No other component may extract tenant ID from requests directly.
 */

export { TenantContextModule } from './tenant-context.module';
export { TenantContextResolver, TenantContextRequest } from './tenant-context.resolver';
export { 
  TenantContextGuard, 
  TenantCtx, 
  TenantId,
  RequestWithTenantContext,
} from './tenant-context.guard';
export {
  TenantContext,
  TenantContextResult,
  TenantContextConfig,
  TenantContextError,
  TenantContextErrorCode,
  TenantAuthType,
  ActorIdentity,
  DEFAULT_TENANT_CONTEXT_CONFIG,
} from './tenant-context.types';
