import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../prisma/prisma.module';
import { InterestEngineService } from './interest-engine.service';
import { RateScheduleService } from './rate-schedule.service';
// payment-allocation.service: @deprecated/ölü → DI provider'ından ÇIKARILDI (de-fang). Import yok.
import { PolicyGateService } from './policy-gate.service';
import { InterestAuditLogService } from './audit-log.service';
import { RateSyncService } from './rate-sync.service';
import { CekTazminatService } from './cek-tazminat.service';
import { InterestEngineController } from './interest-engine.controller';

// New services from refactored architecture
import { RateProviderService } from './rates/rate-provider.service';
import { PolicyGateV2Service } from './policy-gate/policy-gate-v2.service';
import { SegmentBuilderService } from './segments/segment-builder.service';
import { AllocationEngineService } from './allocation/allocation-engine.service';
import { TBK100AllocatorService } from './allocation/tbk100-allocator.service';
import { ClaimPriorityService } from './allocation/claim-priority.service';
import { LegalReportRendererService } from './reporter/legal-report-renderer.service';
import { SegmentReporterService } from './reporter/segment-reporter.service';
import { AuditWriterService } from './audit/audit-writer.service';
import { PrismaAuditService } from './audit/prisma-audit.service';
import { RetentionService } from './audit/retention.service';
import { MaskingService } from './audit/masking.service';
import { AccessControlService } from './audit/access-control.service';
import { AccessLogService } from './audit/access-log.service';
import { VersionPinningService } from './version/version-pinning.service';
import { TraceExporterService } from './trace/trace-exporter.service';
import { CaseTypeStrategyRegistry } from './strategy/case-type-strategy.registry';
import { StrategySelectorService } from './strategy/strategy-selector.service';
import { InterestEngineMetricsService } from './metrics/interest-engine-metrics.service';
// G4c-1: compute-on-demand bakiye orkestrasyonu (additive, read-only)
import { CaseBalanceService } from './orchestration/case-balance.service';

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT SERVICE PROVIDER (Environment-based selection)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Audit service provider factory
 * 
 * Production: PrismaAuditService (DB persistence)
 * Test: AuditWriterService (in-memory)
 * 
 * CRITICAL: Production'da Prisma audit zorunlu!
 */
const AuditServiceProvider = {
  provide: 'AUDIT_SERVICE',
  useFactory: (prismaAudit: PrismaAuditService, inMemoryAudit: AuditWriterService) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const forceInMemory = process.env.AUDIT_WRITER === 'memory';
    
    if (isProduction && forceInMemory) {
      console.warn(
        '⚠️ WARNING: In-memory audit in production! Set AUDIT_WRITER=prisma for compliance.',
      );
    }
    
    if (isProduction && !forceInMemory) {
      return prismaAudit;
    }
    
    return inMemoryAudit;
  },
  inject: [PrismaAuditService, AuditWriterService],
};

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  controllers: [InterestEngineController],
  providers: [
    // Legacy services (deprecated, kept for backward compatibility)
    InterestEngineService,
    RateScheduleService, // @deprecated - use RateProviderService
    // PaymentAllocationService KALDIRILDI (de-fang): ölü + ESKİ faiz-önce sıra (P-0 ihlali);
    //   kanonik = AllocationEngineService + TBK100AllocatorService. Dosya yalnız characterization için durur.
    PolicyGateService,
    InterestAuditLogService,
    RateSyncService,
    CekTazminatService,
    
    // New architecture services
    RateProviderService,
    PolicyGateV2Service,
    SegmentBuilderService,
    AllocationEngineService,
    TBK100AllocatorService,
    ClaimPriorityService,
    LegalReportRendererService,
    SegmentReporterService,
    
    // Audit services
    AuditWriterService,
    PrismaAuditService,
    AuditServiceProvider,
    RetentionService,
    MaskingService,
    AccessControlService,
    AccessLogService,
    
    // Strategy services
    CaseTypeStrategyRegistry,
    StrategySelectorService,
    
    // Support services
    VersionPinningService,
    TraceExporterService,
    InterestEngineMetricsService,

    // G4c-1 orchestration (additive, read-only)
    CaseBalanceService,
  ],
  exports: [
    InterestEngineService,
    RateScheduleService, // @deprecated
    CekTazminatService,

    // New exports
    RateProviderService,
    PolicyGateV2Service,
    SegmentBuilderService,
    AllocationEngineService,
    StrategySelectorService,
    'AUDIT_SERVICE',

    // G4c-1
    CaseBalanceService,
  ],
})
export class InterestEngineModule {}
