/**
 * ADR-014 shadow evidence runner'ın uygulama bağlamı kökü.
 *
 * `BalanceDisplayShadowDiffModule` tek başına kök yapılırsa, üretimde yalnız `AppModule`'ün
 * sağladığı @Global sağlayıcılar eksik kalır ve bağlam kurulamaz (DI_FAIL). Aşağıdaki dört
 * modül tam olarak `AppModule`'deki kaydı yansıtır; her biri gerçekten gereklidir:
 *   - ConfigModule.forRoot({ isGlobal: true }) → ConfigService (ClientFinancialDisclosureModule / EmailProviderService)
 *   - StorageModule                            → RuntimeStoragePaths (TariffModule / TariffService)
 *   - ErrorLogModule                           → IntegrationErrorReporter (PolicyEngineModule / DecisionLogRetentionService)
 *   - MetricsRegistryModule                    → PROM_REGISTRY (BalanceDisplayShadowDiffMetrics)
 *
 * ScheduleModule bilinçli olarak YOK: runner hiçbir @Cron işi başlatmaz.
 *
 * @remarks
 * Çağrıldığı yerler:
 * - src/scripts/adr014-local-shadow-evidence-runner.ts (NestFactory.createApplicationContext)
 * - src/scripts/__tests__/adr014-shadow-evidence-runner.module.wiring.spec.ts
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from '../common/storage/storage.module';
import { ErrorLogModule } from '../modules/error-log/error-log.module';
import { MetricsRegistryModule } from '../modules/metrics-registry/metrics-registry.module';
import { BalanceDisplayShadowDiffModule } from '../modules/balance-display-shadow-diff/balance-display-shadow-diff.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StorageModule,
    ErrorLogModule,
    MetricsRegistryModule,
    BalanceDisplayShadowDiffModule,
  ],
})
export class Adr014ShadowEvidenceRunnerModule {}
