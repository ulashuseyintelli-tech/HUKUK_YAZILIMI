/**
 * v28 Engine Module
 * 
 * UYAP Event Ingestion + Rule Engine + Timeline + Outbox
 * Python v28_ALL_IN_ONE paketinden port edildi.
 * Django v28_django_timeline paketinden port edildi.
 * Python v28_ops_bundle paketinden port edildi.
 * Python v28_policy_feedback paketinden port edildi.
 * 
 * Components:
 * - FactStoreService: Fact/Flag depolama
 * - TimelineService: Olay kaydı
 * - OutboxService: Action queue
 * - ExpressionEvaluatorService: Kural ifade değerlendirme
 * - ComputeRegistryService: Hesaplama motorları
 * - EngineRunnerService: Ana kural motoru
 * - RuleLoaderService: Kural yükleme
 * - UyapEventIngestService: UYAP event normalizer
 * - ActionHandlerService: Action dispatch + feedback
 * - EngineRunService: Engine run tracking (v28_decision_timeline)
 * - SeedService: Test verisi oluşturma (v28_django_timeline)
 * - PolicyGateService: Policy kuralları (v28_ops_bundle)
 * - ScenarioHarnessService: Senaryo test harness (v28_ops_bundle)
 * - ActionFeedbackService: Action feedback writer (v28_policy_feedback)
 */
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AggregateVersionAllocator } from '../domain-event-ingest';

// Services
import { FactStoreService } from './factstore.service';
import { TimelineService } from './timeline.service';
import { OutboxService } from './outbox.service';
import { ExpressionEvaluatorService } from './expression-evaluator.service';
import { ComputeRegistryService } from './compute-registry.service';
import { EngineRunnerService } from './engine-runner.service';
import { RuleLoaderService } from './rule-loader.service';
import { UyapEventIngestService } from './uyap-event-ingest.service';
import { ActionHandlerService } from './action-handler.service';
import { EngineRunService } from './engine-run.service';
import { SeedService } from './seed.service';
import { PolicyGateService } from './policy-gate.service';
import { ScenarioHarnessService } from './scenario-harness.service';
import { ActionFeedbackService } from './action-feedback.service';

// Controllers
import {
  UyapEventController,
  FactStoreController,
  TimelineController,
  OutboxController,
  RulesController,
  ComputeController,
  EngineRunController,
  ActionsController,
  SeedController,
  PolicyGateController,
  ScenarioHarnessController,
  ActionFeedbackController,
} from './v28-engine.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    UyapEventController,
    FactStoreController,
    TimelineController,
    OutboxController,
    RulesController,
    ComputeController,
    EngineRunController,
    ActionsController,
    SeedController,
    PolicyGateController,
    ScenarioHarnessController,
    ActionFeedbackController,
  ],
  providers: [
    AggregateVersionAllocator,
    FactStoreService,
    TimelineService,
    OutboxService,
    ExpressionEvaluatorService,
    ComputeRegistryService,
    EngineRunnerService,
    RuleLoaderService,
    UyapEventIngestService,
    ActionHandlerService,
    EngineRunService,
    SeedService,
    PolicyGateService,
    ScenarioHarnessService,
    ActionFeedbackService,
  ],
  exports: [
    FactStoreService,
    TimelineService,
    OutboxService,
    ExpressionEvaluatorService,
    ComputeRegistryService,
    EngineRunnerService,
    RuleLoaderService,
    UyapEventIngestService,
    ActionHandlerService,
    EngineRunService,
    SeedService,
    PolicyGateService,
    ScenarioHarnessService,
    ActionFeedbackService,
  ],
})
export class V28EngineModule {}
