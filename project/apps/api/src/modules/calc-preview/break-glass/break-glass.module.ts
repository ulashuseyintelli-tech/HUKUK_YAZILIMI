/**
 * BreakGlassModule
 * 
 * Provides break-glass access control for cross-tenant operations.
 * 
 * This module implements:
 * - Gate 1: TenantContext source authority (via TenantContextModule)
 * - Gate 2: Break-glass token distinction
 * - Gate 3: Kill switch functionality
 * - INV-1 through INV-5: Security invariants
 * 
 * Service build order (dependency order):
 * 1. Audit → 2. CircuitBreaker → 3. Grant → 4. Request → 5. Approval
 */

import { Module } from '@nestjs/common';
import { BreakGlassConfigService } from './break-glass.config';
import {
  BreakGlassKillSwitchGuard,
  NetworkAllowlistGuard,
  InternalOpsGuard,
  BreakGlassApproverGuard,
  BreakGlassGrantGuard,
} from './guards';
import { TenantContextModule } from '../tenant-context';

// Services
import {
  CrossTenantAuditService,
  InMemoryCrossTenantAuditRepository,
  CROSS_TENANT_AUDIT_REPOSITORY,
} from './services/audit';
import {
  BreakGlassCircuitBreakerService,
  InMemoryCircuitBreakerStore,
} from './services/circuit-breaker';
import {
  BreakGlassGrantService,
  InMemoryBreakGlassGrantRepository,
  InMemoryPostMortemRepository,
  BREAK_GLASS_GRANT_REPOSITORY,
  POST_MORTEM_REPOSITORY,
} from './services/grant';
import {
  BreakGlassRequestService,
  InMemoryBreakGlassRequestRepository,
  BREAK_GLASS_REQUEST_REPOSITORY,
} from './services/request';
import { BreakGlassApprovalService } from './services/approval';

// Controllers
import {
  BreakGlassController,
  CrossTenantAccessController,
} from './controllers';

// Interceptors
import { CrossTenantAccessInterceptor } from './interceptors';

@Module({
  imports: [TenantContextModule],
  controllers: [BreakGlassController, CrossTenantAccessController],
  providers: [
    // Config
    BreakGlassConfigService,
    
    // Guards
    BreakGlassKillSwitchGuard,
    NetworkAllowlistGuard,
    InternalOpsGuard,
    BreakGlassApproverGuard,
    BreakGlassGrantGuard,
    
    // Repositories (in-memory for now, will be replaced with Prisma)
    {
      provide: CROSS_TENANT_AUDIT_REPOSITORY,
      useClass: InMemoryCrossTenantAuditRepository,
    },
    {
      provide: BREAK_GLASS_GRANT_REPOSITORY,
      useClass: InMemoryBreakGlassGrantRepository,
    },
    {
      provide: POST_MORTEM_REPOSITORY,
      useClass: InMemoryPostMortemRepository,
    },
    {
      provide: BREAK_GLASS_REQUEST_REPOSITORY,
      useClass: InMemoryBreakGlassRequestRepository,
    },
    InMemoryCircuitBreakerStore,
    
    // Services (in dependency order)
    CrossTenantAuditService,
    BreakGlassCircuitBreakerService,
    BreakGlassGrantService,
    BreakGlassRequestService,
    BreakGlassApprovalService,
    
    // Grant service alias for guard injection
    {
      provide: 'BREAK_GLASS_GRANT_SERVICE',
      useExisting: BreakGlassGrantService,
    },
    
    // Interceptors
    CrossTenantAccessInterceptor,
  ],
  exports: [
    // Config
    BreakGlassConfigService,
    
    // Guards
    BreakGlassKillSwitchGuard,
    NetworkAllowlistGuard,
    InternalOpsGuard,
    BreakGlassApproverGuard,
    BreakGlassGrantGuard,
    
    // Services
    CrossTenantAuditService,
    BreakGlassCircuitBreakerService,
    BreakGlassGrantService,
    BreakGlassRequestService,
    BreakGlassApprovalService,
  ],
})
export class BreakGlassModule {}
