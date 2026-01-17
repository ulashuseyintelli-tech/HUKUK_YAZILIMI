/**
 * Phase 5.3 - Chaos Module
 * 
 * ⚠️ PRODUCTION'DA BU MODÜL COMPILE EDİLMEMELİ
 * 
 * Build-time exclusion:
 * - tsconfig.prod.json'da exclude edilmeli
 * - Webpack/esbuild'de tree-shake edilmeli
 * - Dynamic import ile lazy load (sadece test ortamında)
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 5.3
 */

import { Module, DynamicModule, Logger } from '@nestjs/common';
import { FaultInjectorService } from './fault-injector.service';
import { ChaosController } from './chaos.controller';

// ============================================================================
// PRODUCTION GUARD
// ============================================================================

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const CHAOS_ENABLED = process.env.ENABLE_CHAOS_ENDPOINTS === 'true';

// ============================================================================
// CHAOS MODULE
// ============================================================================

@Module({})
export class ChaosModule {
  private static readonly logger = new Logger(ChaosModule.name);

  /**
   * Production'da boş modül döner
   * Test ortamında full modül döner
   */
  static forRoot(): DynamicModule {
    // PRODUCTION'DA SIFIR SALDIRI YÜZEYİ
    if (IS_PRODUCTION) {
      this.logger.warn('[ChaosModule] DISABLED in production - zero attack surface');
      return {
        module: ChaosModule,
        controllers: [],
        providers: [],
        exports: [],
      };
    }

    // CHAOS_ENABLED flag kontrolü
    if (!CHAOS_ENABLED) {
      this.logger.log('[ChaosModule] Disabled - set ENABLE_CHAOS_ENDPOINTS=true to enable');
      return {
        module: ChaosModule,
        controllers: [],
        providers: [],
        exports: [],
      };
    }

    this.logger.warn('[ChaosModule] ENABLED - chaos endpoints active (non-production)');
    
    return {
      module: ChaosModule,
      controllers: [ChaosController],
      providers: [FaultInjectorService],
      exports: [FaultInjectorService],
    };
  }

  /**
   * Test ortamı için - her zaman aktif
   */
  static forTesting(): DynamicModule {
    return {
      module: ChaosModule,
      controllers: [ChaosController],
      providers: [FaultInjectorService],
      exports: [FaultInjectorService],
    };
  }
}
