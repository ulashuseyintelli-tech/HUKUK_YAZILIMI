import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../prisma/prisma.module';
import { RecipeService } from './recipe.service';
import { TaskOrchestratorService } from './task-orchestrator.service';
import { IcrabotService } from './icrabot.service';
import { IcrabotController } from './icrabot.controller';
import { EvidenceService } from './evidence.service';
// v12: Admin services
import { AdminService } from './admin/admin.service';
import { AdminController } from './admin/admin.controller';
import { JobMonitorService } from './admin/job-monitor.service';
import { AuditReportService } from './admin/audit-report.service';
// v14-v16: Bundle, Runner, Scheduler, Export services
import { BundleService } from './bundle/bundle.service';
import { BundleController } from './bundle/bundle.controller';
import { RecipeRunnerService } from './runner/recipe-runner.service';
import { SchedulerService } from './scheduler/scheduler.service';
import { AuditExportService } from './export/audit-export.service';
// v17-v23: UI Worker, Degraded Mode, Case Lock, Extractors
import { LocatorResolverService } from './ui-worker/locator-resolver.service';
import { DegradedModeService } from './degraded-mode/degraded-mode.service';
import { CaseLockService } from './case-lock/case-lock.service';
import { FactExtractorService } from './extractor/fact-extractor.service';
import { DecisionEngineService } from './extractor/decision-engine.service';
// v24-v29: Decision Rules Bundle, Predicates, Actions, Compute, Plan
import { DecisionRulesLoaderService } from './decision/decision-rules-loader.service';
import { PredicateEvaluatorService } from './decision/predicate-evaluator.service';
import { ActionExecutorService } from './decision/action-executor.service';
import { DecisionEngineV2Service } from './decision/decision-engine-v2.service';
import { ComputeParamsLoaderService } from './compute/compute-params-loader.service';
import { ComputeModulesService } from './compute/compute-modules.service';
import { PlanLoaderService } from './plan/plan-loader.service';
// v30: Adaptive Scheduling, Debtor-Scoped Planning
import { AdaptiveSchedulerService } from './scheduler/adaptive-scheduler.service';
import { OrchestratorV30Service } from './scheduler/orchestrator-v30.service';

/**
 * ICRABOT MODULE
 * 
 * UYAP entegrasyonlu otomasyon sistemi için ana modül.
 * 
 * Versiyon Geçmişi:
 * - v1-v11: Temel recipe'ler, state machine, task orchestrator
 * - v12: Admin panel, job monitor, audit report
 * - v14: DB-backed bundles, audit export
 * - v15: Scheduler, bundle validator
 * - v16: Recipe runner, UI worker interface
 * - v17: UI Worker Adapter Interface (MockUiWorker)
 * - v18: RealUiWorker (Playwright), Locator Resolver
 * - v19: DSL genişletme (wait_for, expect_text), Degraded Mode
 * - v20: Selector Health Log, Auto Degraded Mode, Download/Upload DSL
 * - v21: SystemConfig model, Table Parser
 * - v22: Case-level concurrency guard, Fact Extractor
 * - v23: Extractor Engine, Decision Engine
 * - v24: Decision Rules DB Bundle
 * - v25: Decision Predicates (fact filters)
 * - v26: Then Actions Executor (enqueue/locks/flags/emit)
 * - v27: Compute + Decisions (risk/recovery)
 * - v28: Parametric Compute (risk/recovery bundles)
 * - v29: Plan Bundle (DAG/Planning DB-backed)
 * - v30: Debtor-Scoped Planning, Per-Recipe Interval, Adaptive Scheduling
 * 
 * Blueprint Katmanları:
 * - Katman 0: Case Digital Twin (mevcut Case modeli)
 * - Katman 2: Task Orchestrator (TaskOrchestratorService)
 * - Katman 3: Rules Engine (RecipeService)
 * - Katman 4: State Machine (state-machine.ts)
 * - Katman 5: Scheduler (SchedulerService)
 * - Katman 6: Audit/Evidence (EvidenceService, AuditExportService)
 * - Katman 7: Admin Panel (AdminService)
 * - Katman 8: Bundle Management (BundleService)
 * - Katman 9: Recipe Runner (RecipeRunnerService)
 * - Katman 10: UI Worker (LocatorResolverService)
 * - Katman 11: Degraded Mode (DegradedModeService)
 * - Katman 12: Case Lock (CaseLockService)
 * - Katman 13: Fact Extraction (FactExtractorService)
 * - Katman 14: Decision Engine (DecisionEngineService)
 * - Katman 15: Decision Rules Bundle (DecisionRulesLoaderService) v24
 * - Katman 16: Predicate Evaluator (PredicateEvaluatorService) v25
 * - Katman 17: Action Executor (ActionExecutorService) v26
 * - Katman 18: Compute Modules (ComputeModulesService) v27-v28
 * - Katman 19: Plan Loader (PlanLoaderService) v29
 * - Katman 20: Adaptive Scheduler (AdaptiveSchedulerService) v30
 * - Katman 21: Orchestrator V30 (OrchestratorV30Service) v30
 * 
 * Recipe Modülleri (82 adet):
 * - Session: 1, Sync: 7, Tebligat: 8, Kesinleşme: 3
 * - Varlık: 17, Haciz: 23, Tahsilat: 16, Satış: 6, Finance: 1
 */
@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  controllers: [IcrabotController, AdminController, BundleController],
  providers: [
    RecipeService,
    TaskOrchestratorService,
    IcrabotService,
    EvidenceService,
    // v12: Admin services
    AdminService,
    JobMonitorService,
    AuditReportService,
    // v14-v16: Bundle, Runner, Scheduler, Export
    BundleService,
    RecipeRunnerService,
    SchedulerService,
    AuditExportService,
    // v17-v23: UI Worker, Degraded Mode, Case Lock, Extractors
    LocatorResolverService,
    DegradedModeService,
    CaseLockService,
    FactExtractorService,
    DecisionEngineService,
    // v24-v29: Decision Rules Bundle, Predicates, Actions, Compute, Plan
    DecisionRulesLoaderService,
    PredicateEvaluatorService,
    ActionExecutorService,
    DecisionEngineV2Service,
    ComputeParamsLoaderService,
    ComputeModulesService,
    PlanLoaderService,
    // v30: Adaptive Scheduling, Debtor-Scoped Planning
    AdaptiveSchedulerService,
    OrchestratorV30Service,
  ],
  exports: [
    RecipeService,
    TaskOrchestratorService,
    IcrabotService,
    EvidenceService,
    // v12: Admin services
    AdminService,
    JobMonitorService,
    AuditReportService,
    // v14-v16: Bundle, Runner, Scheduler, Export
    BundleService,
    RecipeRunnerService,
    SchedulerService,
    AuditExportService,
    // v17-v23: UI Worker, Degraded Mode, Case Lock, Extractors
    LocatorResolverService,
    DegradedModeService,
    CaseLockService,
    FactExtractorService,
    DecisionEngineService,
    // v24-v29: Decision Rules Bundle, Predicates, Actions, Compute, Plan
    DecisionRulesLoaderService,
    PredicateEvaluatorService,
    ActionExecutorService,
    DecisionEngineV2Service,
    ComputeParamsLoaderService,
    ComputeModulesService,
    PlanLoaderService,
    // v30: Adaptive Scheduling, Debtor-Scoped Planning
    AdaptiveSchedulerService,
    OrchestratorV30Service,
  ],
})
export class IcrabotModule {}
