/**
 * TenantContextModule
 * 
 * Provides tenant context resolution and guards.
 * Import this module to enable tenant-aware endpoints.
 */

import { Module, Global } from '@nestjs/common';
import { TenantContextResolver } from './tenant-context.resolver';
import { TenantContextGuard } from './tenant-context.guard';

@Global()
@Module({
  providers: [
    TenantContextResolver,
    TenantContextGuard,
  ],
  exports: [
    TenantContextResolver,
    TenantContextGuard,
  ],
})
export class TenantContextModule {}
