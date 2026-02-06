/**
 * Calc Preview Module
 * 
 * Unified preview endpoint modülü.
 * Interest + Fee hesaplamalarını tek endpoint'te birleştirir.
 * 
 * Phase 3.1: Gerçek engine'lere bağlı
 * - InterestEngineService.previewCalculation()
 * - FeeEngineService.previewCalculation()
 * 
 * Phase 4.1: Metrics + Alerting
 * - CalcPreviewMetricsService
 * 
 * Phase 4.2: Rate Limiting
 * - CalcPreviewRateLimitService
 * - CalcPreviewRateLimitGuard
 * 
 * Phase 4.3: Circuit Breaker
 * - CalcPreviewCircuitBreakerService
 * 
 * Phase 4.4: Versioned Cache
 * - VersionedCacheService
 * 
 * Phase 4.5: Legacy Deprecation
 * - LegacyDeprecationService
 * - LegacyDeprecationInterceptor
 * 
 * Phase 5.1: Trace Bundle
 * - TraceContext (request-scoped)
 * - TraceStorageService
 * - TraceCollectorService
 * - TraceInterceptor
 * 
 * Phase 6A: Explainable Policy Preview
 * - ExplanationService
 * - ReasonCodeRegistry
 * 
 * Phase 7A: Self-serve Diagnostics
 * - DiagnosticsModule
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 5
 * @see .kiro/specs/explainable-policy-preview - Phase 6A
 * @see .kiro/specs/self-serve-diagnostics - Phase 7A
 */

import { Module } from '@nestjs/common';
import { CalcPreviewController } from './calc-preview.controller';
import { CalcPreviewService } from './calc-preview.service';
import { CalcPreviewMetricsService } from './metrics/calc-preview-metrics.service';
import { CalcPreviewRateLimitService, CalcPreviewRateLimitGuard } from './rate-limit';
import { CalcPreviewCircuitBreakerService } from './circuit-breaker';
import { VersionedCacheService } from './cache';
import { LegacyDeprecationService, LegacyDeprecationInterceptor } from './deprecation';
import { TraceContext, TraceStorageService, TraceCollectorService, TraceInterceptor } from './trace';
import { TraceAccessService } from './trace/trace-access.service';
import { ExplanationService, ReasonCodeRegistry } from './explanation';
import { DiagnosticsModule } from './diagnostics';
import { InterestEngineModule } from '../interest-engine/interest-engine.module';
import { FeeEngineModule } from '../fee-engine/fee-engine.module';
import { ManifestAdminAuthGuard } from './diagnostics/object-store/manifest-retry/guards/manifest-admin-auth.guard';
import { ManifestAdminRateLimiter, ManifestAdminRateLimitGuard } from './diagnostics/object-store/manifest-retry/guards/manifest-admin-rate-limiter.service';

@Module({
  imports: [
    InterestEngineModule,
    FeeEngineModule,
    DiagnosticsModule,
  ],
  controllers: [CalcPreviewController],
  providers: [
    CalcPreviewService,
    CalcPreviewMetricsService,
    CalcPreviewRateLimitService,
    CalcPreviewRateLimitGuard,
    CalcPreviewCircuitBreakerService,
    VersionedCacheService,
    LegacyDeprecationService,
    LegacyDeprecationInterceptor,
    // Phase 5.1: Trace
    TraceContext,
    TraceStorageService,
    TraceCollectorService,
    TraceInterceptor,
    TraceAccessService,
    // PR-1: Ops guards for trace/metrics endpoints
    ManifestAdminAuthGuard,
    ManifestAdminRateLimiter,
    ManifestAdminRateLimitGuard,
    // Phase 6A: Explanation
    ExplanationService,
    ReasonCodeRegistry,
  ],
  exports: [
    CalcPreviewService,
    CalcPreviewMetricsService,
    CalcPreviewRateLimitService,
    CalcPreviewCircuitBreakerService,
    VersionedCacheService,
    LegacyDeprecationService,
    // Phase 5.1: Trace
    TraceStorageService,
    TraceCollectorService,
    // Phase 6A: Explanation
    ExplanationService,
    ReasonCodeRegistry,
    // Phase 7A: Diagnostics
    DiagnosticsModule,
  ],
})
export class CalcPreviewModule {}
