import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../prisma/prisma.module';
import { CasePolicyEngine } from './case-policy-engine.service';
import { EffectivePermissionResolver } from './effective-permission-resolver.service';
import { PolicyEngineController } from './policy-engine.controller';
import { FactStoreService, ComputedFactRegistry, UyapAvailabilityService } from './fact-store';
import { DecisionLoggerService, ExecutionRecorderService, DecisionLogRetentionService } from './decision-logger';
import { StateMachineService } from './state-machine';
import { GateCheckerService } from './gate-checker';
import { RuleEngineService } from './rule-engine';
import { CpeRequiredGuard } from './decorators/cpe-required.guard';
import { DeprecatedUsageTrackerService } from './deprecated-usage-tracker.service';

/**
 * Case Policy Engine Module
 * 
 * Merkezi karar motoru - sistemdeki tüm aksiyonlar için tek otorite.
 * 
 * Components:
 * - CasePolicyEngine: Ana servis
 * - FactStoreService: Fact depolama ve sorgulama
 * - ComputedFactRegistry: Computed fact provider'ları
 * - StateMachineService: State transition yönetimi
 * - GateCheckerService: Gate kontrolleri
 * - RuleEngineService: Kural değerlendirme
 * - DecisionLoggerService: Karar loglama
 * - ExecutionRecorderService: Execution kaydı (idempotency)
 * - DeprecatedUsageTrackerService: Eski servis kullanım takibi
 * 
 * @see docs/decision-point-inventory.md
 * @see docs/high-risk-action-matrix.md
 * @see .kiro/specs/case-policy-engine/design.md
 */
@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [
    PolicyEngineController,
  ],
  providers: [
    // Core services
    CasePolicyEngine,
    // P2a: per-user Guided-Open resolver (observe core; hiçbir controller/guard çağırmaz)
    EffectivePermissionResolver,

    // Fact Store
    FactStoreService,
    ComputedFactRegistry,
    UyapAvailabilityService,
    
    // State Machine
    StateMachineService,
    
    // Gate Checker
    GateCheckerService,
    
    // Rule Engine
    RuleEngineService,
    
    // Decision Logger
    DecisionLoggerService,
    ExecutionRecorderService,
    DecisionLogRetentionService,
    
    // Guards
    CpeRequiredGuard,
    
    // Deprecated Usage Tracker
    DeprecatedUsageTrackerService,
  ],
  exports: [
    CasePolicyEngine,
    EffectivePermissionResolver,
    FactStoreService,
    StateMachineService,
    GateCheckerService,
    RuleEngineService,
    DecisionLoggerService,
    ExecutionRecorderService,
    DecisionLogRetentionService,
    CpeRequiredGuard,
    DeprecatedUsageTrackerService,
  ],
})
export class PolicyEngineModule {}
