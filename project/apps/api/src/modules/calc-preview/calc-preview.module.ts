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
 * @see docs/single-source-of-truth-architecture.md - Phase 4
 */

import { Module } from '@nestjs/common';
import { CalcPreviewController } from './calc-preview.controller';
import { CalcPreviewService } from './calc-preview.service';
import { CalcPreviewMetricsService } from './metrics/calc-preview-metrics.service';
import { CalcPreviewRateLimitService, CalcPreviewRateLimitGuard } from './rate-limit';
import { CalcPreviewCircuitBreakerService } from './circuit-breaker';
import { VersionedCacheService } from './cache';
import { LegacyDeprecationService, LegacyDeprecationInterceptor } from './deprecation';
import { InterestEngineModule } from '../interest-engine/interest-engine.module';
import { FeeEngineModule } from '../fee-engine/fee-engine.module';

@Module({
  imports: [
    InterestEngineModule,
    FeeEngineModule,
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
  ],
  exports: [
    CalcPreviewService,
    CalcPreviewMetricsService,
    CalcPreviewRateLimitService,
    CalcPreviewCircuitBreakerService,
    VersionedCacheService,
    LegacyDeprecationService,
  ],
})
export class CalcPreviewModule {}
