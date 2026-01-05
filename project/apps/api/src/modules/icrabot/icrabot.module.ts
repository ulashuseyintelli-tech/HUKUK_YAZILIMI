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
// v31: Priority + Queue Policy
import { QueuePolicyLoaderService } from './scheduler/queue-policy-loader.service';
import { PriorityDispatcherService } from './scheduler/priority-dispatcher.service';
// v32: Ops API, Recipe Pause, SLA Boost
import { RecipePauseService } from './ops/recipe-pause.service';
import { SlaBoostService } from './ops/sla-boost.service';
import { OpsController } from './ops/ops.controller';
// v33-v35: UiMap Recorder, Selector Health, Click Test, Stability Score
import { UiMapRecorderService } from './recorder/uimap-recorder.service';
import { SelectorHealthService } from './recorder/selector-health.service';
import { SelectorScoringService } from './recorder/selector-scoring.service';
import { RecorderController, HealthController as SelectorHealthController, RecorderTestController } from './recorder/recorder.controller';
// v36: Case Health, UiMap Validator
import { CaseHealthService } from './health/case-health.service';
import { UiMapValidatorService } from './health/uimap-validator.service';
import { CaseHealthController, UiMapValidateController } from './health/health.controller';
// v37: MVP Completion - Action List, Risk Report, Weekly Export
import { ActionListService } from './mvp/action-list.service';
import { RiskNetReportService } from './mvp/risk-net-report.service';
import { WeeklyExportService } from './mvp/weekly-export.service';
import { ActionListController, RiskReportController, WeeklyExportController } from './mvp/mvp.controller';
// v38: Enterprise Layer - PII, Audit, Approval, Leasing, Backpressure, Plan Limits
import { PiiMaskingService } from './enterprise/pii-masking.service';
import { AuditChainService } from './enterprise/audit-chain.service';
import { ApprovalWorkflowService } from './enterprise/approval-workflow.service';
import { JobLeasingService } from './enterprise/job-leasing.service';
import { BackpressureService } from './enterprise/backpressure.service';
import { PlanLimitsService } from './enterprise/plan-limits.service';
import {
  PiiMaskingController,
  AuditChainController,
  ApprovalWorkflowController,
  JobLeasingController,
  BackpressureController,
  PlanLimitsController,
} from './enterprise/enterprise.controller';

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
 * - v31: Job Priority, Queue Policy (concurrency limits, quotas)
 * - v32: Ops API, Recipe Pause/Unpause, Cancel Job, SLA Boost
 * - v33: UiMap Recorder MVP, Selector Health API
 * - v34: Recorder v2 (multi-selector, auto-section, click-test)
 * - v35: Recorder v3 (stability score, auto click-test approve, table column)
 * - v36: Case Health Report, UiMap Validator, Extractor Library
 * - v37: MVP Completion (Action List, Risk/Net Report, Weekly Export)
 * - v38: Enterprise Layer (PII Masking, Audit Chain, Approval Workflow, Job Leasing, Backpressure, Plan Limits)
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
 * - Katman 22: Queue Policy Loader (QueuePolicyLoaderService) v31
 * - Katman 23: Priority Dispatcher (PriorityDispatcherService) v31
 * - Katman 24: Recipe Pause (RecipePauseService) v32
 * - Katman 25: SLA Boost (SlaBoostService) v32
 * - Katman 26: Ops Controller (OpsController) v32
 * - Katman 27: UiMap Recorder (UiMapRecorderService) v33
 * - Katman 28: Selector Health (SelectorHealthService) v33
 * - Katman 29: Selector Scoring (SelectorScoringService) v35
 * - Katman 30: Case Health (CaseHealthService) v36
 * - Katman 31: UiMap Validator (UiMapValidatorService) v36
 * - Katman 32: Action List (ActionListService) v37
 * - Katman 33: Risk Net Report (RiskNetReportService) v37
 * - Katman 34: Weekly Export (WeeklyExportService) v37
 * - Katman 35: PII Masking (PiiMaskingService) v38
 * - Katman 36: Audit Chain (AuditChainService) v38
 * - Katman 37: Approval Workflow (ApprovalWorkflowService) v38
 * - Katman 38: Job Leasing (JobLeasingService) v38
 * - Katman 39: Backpressure (BackpressureService) v38
 * - Katman 40: Plan Limits (PlanLimitsService) v38
 * 
 * Recipe Modülleri (82 adet):
 * - Session: 1, Sync: 7, Tebligat: 8, Kesinleşme: 3
 * - Varlık: 17, Haciz: 23, Tahsilat: 16, Satış: 6, Finance: 1
 */
@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  controllers: [
    IcrabotController, 
    AdminController, 
    BundleController, 
    OpsController, 
    RecorderController, 
    SelectorHealthController, 
    RecorderTestController, 
    CaseHealthController, 
    UiMapValidateController,
    // v37: MVP Completion
    ActionListController,
    RiskReportController,
    WeeklyExportController,
    // v38: Enterprise Layer
    PiiMaskingController,
    AuditChainController,
    ApprovalWorkflowController,
    JobLeasingController,
    BackpressureController,
    PlanLimitsController,
  ],
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
    // v31: Priority + Queue Policy
    QueuePolicyLoaderService,
    PriorityDispatcherService,
    // v32: Ops API, Recipe Pause, SLA Boost
    RecipePauseService,
    SlaBoostService,
    // v33-v35: UiMap Recorder, Selector Health, Selector Scoring
    UiMapRecorderService,
    SelectorHealthService,
    SelectorScoringService,
    // v36: Case Health, UiMap Validator
    CaseHealthService,
    UiMapValidatorService,
    // v37: MVP Completion
    ActionListService,
    RiskNetReportService,
    WeeklyExportService,
    // v38: Enterprise Layer
    PiiMaskingService,
    AuditChainService,
    ApprovalWorkflowService,
    JobLeasingService,
    BackpressureService,
    PlanLimitsService,
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
    // v31: Priority + Queue Policy
    QueuePolicyLoaderService,
    PriorityDispatcherService,
    // v32: Ops API, Recipe Pause, SLA Boost
    RecipePauseService,
    SlaBoostService,
    // v33-v35: UiMap Recorder, Selector Health, Selector Scoring
    UiMapRecorderService,
    SelectorHealthService,
    SelectorScoringService,
    // v36: Case Health, UiMap Validator
    CaseHealthService,
    UiMapValidatorService,
    // v37: MVP Completion
    ActionListService,
    RiskNetReportService,
    WeeklyExportService,
    // v38: Enterprise Layer
    PiiMaskingService,
    AuditChainService,
    ApprovalWorkflowService,
    JobLeasingService,
    BackpressureService,
    PlanLimitsService,
  ],
})
export class IcrabotModule {}
