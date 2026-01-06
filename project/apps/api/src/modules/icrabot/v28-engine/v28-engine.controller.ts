/**
 * v28 Engine Controller
 * 
 * UYAP Event Ingestion ve Engine API endpoints.
 * OpenAPI spec: v28_decision_timeline/api/openapi.yaml
 */
import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { UyapEventIngestService, UyapEvent } from './uyap-event-ingest.service';
import { FactStoreService } from './factstore.service';
import { TimelineService, TimelineEntryType, TimelineSeverity, TimelineSource } from './timeline.service';
import { OutboxService } from './outbox.service';
import { RuleLoaderService } from './rule-loader.service';
import { ActionHandlerService } from './action-handler.service';
import { ComputeRegistryService } from './compute-registry.service';
import { EngineRunService } from './engine-run.service';
import { PolicyGateService } from './policy-gate.service';
import { ScenarioHarnessService, BUILT_IN_SCENARIOS } from './scenario-harness.service';
import { ActionFeedbackService } from './action-feedback.service';

// ============ UYAP Event Ingest Controller ============
@Controller('icrabot/v28/events')
export class UyapEventController {
  constructor(private readonly ingestService: UyapEventIngestService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async ingestEvent(@Body() event: UyapEvent) {
    return this.ingestService.ingestEvent(event);
  }

  @Post('batch')
  @HttpCode(HttpStatus.OK)
  async ingestBatch(@Body() events: UyapEvent[]) {
    return this.ingestService.ingestBatch(events);
  }
}

// ============ FactStore Controller ============
@Controller('icrabot/v28/facts')
export class FactStoreController {
  constructor(private readonly factStore: FactStoreService) {}

  @Get(':caseId')
  async getSnapshot(@Param('caseId') caseId: string) {
    return this.factStore.getSnapshot(caseId);
  }

  @Get(':caseId/fact/:key')
  async getFact(@Param('caseId') caseId: string, @Param('key') key: string) {
    const value = await this.factStore.getFact(caseId, key);
    return { key, value };
  }

  @Get(':caseId/flag/:key')
  async getFlag(@Param('caseId') caseId: string, @Param('key') key: string) {
    const value = await this.factStore.getFlag(caseId, key);
    return { key, value };
  }

  @Get(':caseId/audit')
  async getAuditHistory(
    @Param('caseId') caseId: string,
    @Query('limit') limit?: string,
  ) {
    return this.factStore.getAuditHistory(caseId, limit ? parseInt(limit) : 100);
  }

  // ==================== v28_factstore_actions EXTENSIONS ====================

  @Post(':caseId/batch')
  @HttpCode(HttpStatus.OK)
  async batchWrite(
    @Param('caseId') caseId: string,
    @Body() body: { facts?: Record<string, any>; flags?: Record<string, boolean>; meta?: any },
  ) {
    return this.factStore.batchWrite(caseId, body.facts || {}, body.flags || {}, body.meta || {});
  }

  @Post(':caseId/fact/:key')
  @HttpCode(HttpStatus.OK)
  async setFact(
    @Param('caseId') caseId: string,
    @Param('key') key: string,
    @Body() body: { value: any; meta?: any },
  ) {
    await this.factStore.setFacts(caseId, { [key]: body.value }, body.meta || {});
    return { ok: true, key, value: body.value };
  }

  @Post(':caseId/flag/:key')
  @HttpCode(HttpStatus.OK)
  async setFlag(
    @Param('caseId') caseId: string,
    @Param('key') key: string,
    @Body() body: { value: boolean; meta?: any },
  ) {
    await this.factStore.setFlags(caseId, { [key]: body.value }, body.meta || {});
    return { ok: true, key, value: body.value };
  }

  @Get(':caseId/pattern/:pattern')
  async getFactsByPattern(
    @Param('caseId') caseId: string,
    @Param('pattern') pattern: string,
  ) {
    return this.factStore.getFactsByPattern(caseId, pattern);
  }

  @Get(':caseId/audit/:key')
  async getKeyAuditHistory(
    @Param('caseId') caseId: string,
    @Param('key') key: string,
    @Query('limit') limit?: string,
  ) {
    return this.factStore.getKeyAuditHistory(caseId, key, limit ? parseInt(limit) : 50);
  }

  @Post(':caseId/increment/:key')
  @HttpCode(HttpStatus.OK)
  async incrementFact(
    @Param('caseId') caseId: string,
    @Param('key') key: string,
    @Body() body: { delta: number; meta?: any },
  ) {
    const newValue = await this.factStore.incrementFact(caseId, key, body.delta, body.meta || {});
    return { ok: true, key, value: newValue };
  }

  @Post(':caseId/append/:key')
  @HttpCode(HttpStatus.OK)
  async appendToFact(
    @Param('caseId') caseId: string,
    @Param('key') key: string,
    @Body() body: { item: any; meta?: any },
  ) {
    const newArray = await this.factStore.appendToFact(caseId, key, body.item, body.meta || {});
    return { ok: true, key, value: newArray };
  }

  @Delete(':caseId')
  @HttpCode(HttpStatus.OK)
  async clearCase(
    @Param('caseId') caseId: string,
    @Body() body: { meta?: any },
  ) {
    await this.factStore.clearCase(caseId, body?.meta || {});
    return { ok: true, caseId };
  }

  @Post(':caseId/clear')
  @HttpCode(HttpStatus.OK)
  async clearCasePost(
    @Param('caseId') caseId: string,
    @Body() body: { meta?: any },
  ) {
    await this.factStore.clearCase(caseId, body?.meta || {});
    return { ok: true, caseId };
  }

  @Get('by-flag/:key')
  async getCasesWithFlag(
    @Param('key') key: string,
    @Query('value') value?: string,
  ) {
    const boolValue = value !== 'false';
    const caseIds = await this.factStore.getCasesWithFlag(key, boolValue);
    return { key, value: boolValue, caseIds, count: caseIds.length };
  }

  @Post('bulk-snapshot')
  @HttpCode(HttpStatus.OK)
  async getBulkSnapshots(@Body() body: { caseIds: string[] }) {
    const snapshots = await this.factStore.getBulkSnapshots(body.caseIds);
    return Object.fromEntries(snapshots);
  }
}

// ============ Timeline Controller ============
@Controller('icrabot/v28/timeline')
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}

  /**
   * OpenAPI spec: GET /cases/{case_id}/timeline (cursor-based pagination)
   */
  @Get(':caseId')
  async getTimeline(
    @Param('caseId') caseId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('severity') severity?: string,
    @Query('source') source?: string,
  ) {
    return this.timeline.getTimelinePaged(caseId, {
      cursor,
      limit: limit ? Math.min(parseInt(limit), 200) : 50,
      type: type as TimelineEntryType,
      severity: severity as TimelineSeverity,
      source: source as TimelineSource,
    });
  }

  @Get(':caseId/stats')
  async getStats(@Param('caseId') caseId: string) {
    return this.timeline.getStats(caseId);
  }

  @Get(':caseId/summary')
  async getRecentSummary(
    @Param('caseId') caseId: string,
    @Query('days') days?: string,
  ) {
    return this.timeline.getRecentSummary(caseId, days ? parseInt(days) : 7);
  }

  @Get('run/:runId')
  async getTimelineByRun(@Param('runId') runId: string) {
    return this.timeline.getTimelineByRun(runId);
  }

  @Get('entry/:entryId')
  async getEntry(@Param('entryId') entryId: string) {
    const entry = await this.timeline.getEntry(entryId);
    if (!entry) throw new NotFoundException(`Timeline entry not found: ${entryId}`);
    return entry;
  }
}

// ============ Engine Run Controller ============
@Controller('icrabot/v28/runs')
export class EngineRunController {
  constructor(private readonly engineRun: EngineRunService) {}

  /**
   * OpenAPI spec: GET /engine/runs/{run_id}
   */
  @Get(':runId')
  async getRun(@Param('runId') runId: string) {
    return this.engineRun.getRun(runId);
  }

  @Get('case/:caseId')
  async getRunsByCaseId(
    @Param('caseId') caseId: string,
    @Query('status') status?: string,
    @Query('ruleId') ruleId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.engineRun.getRunsByCaseId(caseId, {
      status: status as any,
      ruleId,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get('stats')
  async getStats(@Query('days') days?: string) {
    return this.engineRun.getStats(days ? parseInt(days) : 7);
  }
}

// ============ Outbox Controller ============
@Controller('icrabot/v28/outbox')
export class OutboxController {
  constructor(
    private readonly outbox: OutboxService,
    private readonly actionHandler: ActionHandlerService,
  ) {}

  @Get('stats')
  async getStats() {
    return this.outbox.getStats();
  }

  @Get('pending')
  async getPending(@Query('limit') limit?: string) {
    return this.outbox.getPendingActions(limit ? parseInt(limit) : 100);
  }

  @Get('dead-letter')
  async getDeadLetter(@Query('limit') limit?: string) {
    return this.outbox.getDeadLetterQueue(limit ? parseInt(limit) : 100);
  }

  @Get('case/:caseId')
  async getActionsByCaseId(
    @Param('caseId') caseId: string,
    @Query('status') status?: string,
    @Query('actionType') actionType?: string,
    @Query('limit') limit?: string,
  ) {
    return this.outbox.getActionsByCaseId(caseId, {
      status: status as any,
      actionType,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Post('process')
  @HttpCode(HttpStatus.OK)
  async processPending(@Query('limit') limit?: string) {
    const processed = await this.actionHandler.processPendingActions(
      limit ? parseInt(limit) : 10,
    );
    return { processed };
  }

  @Post(':actionId/retry')
  @HttpCode(HttpStatus.OK)
  async retryAction(@Param('actionId') actionId: string) {
    await this.outbox.retryDeadAction(actionId);
    return { success: true };
  }

  // ==================== v28_factstore_actions EXTENSIONS ====================

  @Post('process-retryable')
  @HttpCode(HttpStatus.OK)
  async processRetryable(@Query('limit') limit?: string) {
    const results = await this.actionHandler.processRetryableActions(
      limit ? parseInt(limit) : 10,
    );
    return { 
      processed: results.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }

  @Get('handlers')
  async getHandlers() {
    return { handlers: this.actionHandler.getRegisteredHandlers() };
  }

  @Get('handler-stats')
  async getHandlerStats() {
    return this.actionHandler.getHandlerStats();
  }

  @Get('locks')
  async getActiveLocks() {
    return { locks: this.actionHandler.getActiveLocks() };
  }

  @Post('execute-direct')
  @HttpCode(HttpStatus.OK)
  async executeDirect(
    @Body() body: { actionType: string; payload: Record<string, any>; caseId: string },
  ) {
    await this.actionHandler.executeDirectly(body.actionType, body.payload, body.caseId);
    return { ok: true, actionType: body.actionType, caseId: body.caseId };
  }

  @Post('dispatch-batch')
  @HttpCode(HttpStatus.OK)
  async dispatchBatch(@Body() body: { actionIds: string[] }) {
    const results = await this.actionHandler.dispatchBatch(body.actionIds);
    return {
      processed: results.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }
}

// ============ Actions Controller (OpenAPI spec) ============
@Controller('icrabot/v28/actions')
export class ActionsController {
  constructor(private readonly outbox: OutboxService) {}

  /**
   * OpenAPI spec: GET /actions/{action_id}
   */
  @Get(':actionId')
  async getAction(@Param('actionId') actionId: string) {
    const action = await this.outbox.getAction(actionId);
    if (!action) throw new NotFoundException(`Action not found: ${actionId}`);
    return action;
  }
}

// ============ Rules Controller ============
@Controller('icrabot/v28/rules')
export class RulesController {
  constructor(private readonly ruleLoader: RuleLoaderService) {}

  @Get('active')
  async getActiveRules(@Query('pack') packName?: string) {
    if (packName) {
      // Pack bazlı yükleme
      const loaded = await this.ruleLoader.loadActivePack(packName);
      return {
        pack: packName,
        count: loaded.length,
        items: loaded.map(r => ({
          pack: r.packName,
          rule_key: r.ruleKey,
          revision_id: r.revisionId,
          version: r.version,
          sha256: r.sha256,
        })),
      };
    }

    // Tüm aktif kurallar
    const rules = await this.ruleLoader.getActiveRules();
    return {
      count: rules.length,
      rules: rules.map(r => ({
        rule_id: r.rule_id,
        version: r.version,
        when: r.when,
      })),
    };
  }

  @Get('packs')
  async listPacks() {
    const packs = await this.ruleLoader.listActivePacks();
    return { packs };
  }

  @Post('reload')
  @HttpCode(HttpStatus.OK)
  async reloadRules(@Body() body?: { pack?: string }) {
    this.ruleLoader.invalidateCache(body?.pack);
    
    if (body?.pack) {
      const loaded = await this.ruleLoader.loadActivePack(body.pack);
      return { reloaded: true, pack: body.pack, count: loaded.length };
    }

    const rules = await this.ruleLoader.getActiveRules();
    return { reloaded: true, count: rules.length };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async addRule(
    @Body() body: { 
      packName: string; 
      ruleKey: string; 
      content: string;
      createdBy?: string;
      note?: string;
    },
  ) {
    const revisionId = await this.ruleLoader.addRule(
      body.packName,
      body.ruleKey,
      body.content,
      body.createdBy,
      body.note,
    );
    return { revisionId };
  }

  // ==================== ROLLBACK API ====================

  /**
   * Belirli bir revision'ı devre dışı bırakır
   * POST /api/icrabot/v28/rules/disable-revision
   */
  @Post('disable-revision')
  @HttpCode(HttpStatus.OK)
  async disableRevision(@Body() body: { revisionId: string }) {
    const result = await this.ruleLoader.disableRevision(body.revisionId);
    return { ok: true, ...result, revisionId: body.revisionId };
  }

  /**
   * Belirli bir rule'u devre dışı bırakır
   * POST /api/icrabot/v28/rules/disable-rule
   */
  @Post('disable-rule')
  @HttpCode(HttpStatus.OK)
  async disableRule(@Body() body: { packName: string; ruleKey: string }) {
    await this.ruleLoader.disableRule(body.packName, body.ruleKey);
    return { ok: true, packName: body.packName, ruleKey: body.ruleKey, disabled: true };
  }

  /**
   * Belirli bir rule'u aktif eder
   * POST /api/icrabot/v28/rules/enable-rule
   */
  @Post('enable-rule')
  @HttpCode(HttpStatus.OK)
  async enableRule(@Body() body: { packName: string; ruleKey: string }) {
    await this.ruleLoader.enableRule(body.packName, body.ruleKey);
    return { ok: true, packName: body.packName, ruleKey: body.ruleKey, enabled: true };
  }

  /**
   * Belirli bir versiyona pin'ler (rollback)
   * POST /api/icrabot/v28/rules/pin-version
   */
  @Post('pin-version')
  @HttpCode(HttpStatus.OK)
  async pinVersion(@Body() body: { packName: string; ruleKey: string; version: number }) {
    await this.ruleLoader.pinVersion(body.packName, body.ruleKey, body.version);
    return { ok: true, packName: body.packName, ruleKey: body.ruleKey, pinnedVersion: body.version };
  }

  /**
   * Rule versiyonlarını listeler
   * GET /api/icrabot/v28/rules/versions/:packName/:ruleKey
   */
  @Get('versions/:packName/:ruleKey')
  async getRuleVersions(
    @Param('packName') packName: string,
    @Param('ruleKey') ruleKey: string,
  ) {
    return this.ruleLoader.getRuleVersions(packName, ruleKey);
  }
}

// ============ Compute Registry Controller ============
@Controller('icrabot/v28/compute')
export class ComputeController {
  constructor(private readonly computeRegistry: ComputeRegistryService) {}

  @Get('engines')
  async listEngines() {
    return { engines: this.computeRegistry.listEngines() };
  }

  @Post(':engineName')
  @HttpCode(HttpStatus.OK)
  async runEngine(
    @Param('engineName') engineName: string,
    @Body() input: Record<string, any>,
  ) {
    const result = await this.computeRegistry.run(engineName, input);
    return { engine: engineName, result };
  }
}


// ============ Seed Controller (Dev/Test) ============
import { SeedService } from './seed.service';

@Controller('icrabot/v28/seed')
export class SeedController {
  constructor(private readonly seed: SeedService) {}

  /**
   * Dosya için örnek timeline verisi oluşturur (dev/test)
   */
  @Post(':caseId')
  @HttpCode(HttpStatus.CREATED)
  async seedCase(@Param('caseId') caseId: string) {
    return this.seed.seedCase(caseId);
  }

  /**
   * Dosya için örnek UYAP event'leri oluşturur
   */
  @Post(':caseId/uyap-events')
  @HttpCode(HttpStatus.CREATED)
  async seedUyapEvents(
    @Param('caseId') caseId: string,
    @Query('count') count?: string,
  ) {
    const created = await this.seed.seedUyapEvents(caseId, count ? parseInt(count) : 5);
    return { created };
  }
}

// ============ Policy Gate Controller (v28_ops_bundle) ============
@Controller('icrabot/v28/policy')
export class PolicyGateController {
  constructor(private readonly policyGate: PolicyGateService) {}

  @Get('rules')
  async getRules() {
    return { rules: this.policyGate.getRules() };
  }

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  async evaluate(
    @Body() body: { caseId: string; actionType: string; payload: Record<string, any> },
  ) {
    return this.policyGate.evaluateAction(body.caseId, body.actionType, body.payload);
  }

  @Post('rules')
  @HttpCode(HttpStatus.CREATED)
  async addRule(
    @Body() body: {
      name: string;
      priority: number;
      actionType?: string;
      expr: string;
      decision: 'ALLOW' | 'DENY' | 'MANUAL';
      manualActionType?: string;
      manualPayload?: Record<string, any>;
      note?: string;
    },
  ) {
    return this.policyGate.addRule({
      ...body,
      actionType: body.actionType || null,
      isActive: true,
    });
  }

  @Post('rules/:id/disable')
  @HttpCode(HttpStatus.OK)
  async disableRule(@Param('id') id: string) {
    await this.policyGate.disableRule(id);
    return { ok: true, id, disabled: true };
  }

  @Post('rules/:id/enable')
  @HttpCode(HttpStatus.OK)
  async enableRule(@Param('id') id: string) {
    await this.policyGate.enableRule(id);
    return { ok: true, id, enabled: true };
  }

  @Delete('rules/:id')
  @HttpCode(HttpStatus.OK)
  async deleteRule(@Param('id') id: string) {
    await this.policyGate.deleteRule(id);
    return { ok: true, id, deleted: true };
  }

  @Post('reload')
  @HttpCode(HttpStatus.OK)
  async reloadRules() {
    const count = await this.policyGate.reloadRules();
    return { ok: true, count };
  }

  @Post('seed')
  @HttpCode(HttpStatus.OK)
  async seedDefaultRules() {
    return this.policyGate.seedDefaultRules();
  }

  @Get('risk-band/:score')
  async getRiskBand(@Param('score') score: string) {
    const band = this.policyGate.getRiskBand(parseInt(score));
    return { score: parseInt(score), band };
  }

  @Get('quiet-hours')
  async isQuietHours() {
    return { isQuietHours: this.policyGate.isQuietHours() };
  }
}

// ============ Scenario Harness Controller (v28_ops_bundle) ============
@Controller('icrabot/v28/scenarios')
export class ScenarioHarnessController {
  constructor(private readonly harness: ScenarioHarnessService) {}

  @Get()
  async listScenarios() {
    return { scenarios: this.harness.listBuiltInScenarios() };
  }

  @Post('run/:scenarioKey')
  @HttpCode(HttpStatus.OK)
  async runBuiltInScenario(@Param('scenarioKey') scenarioKey: string) {
    const key = scenarioKey as keyof typeof BUILT_IN_SCENARIOS;
    if (!BUILT_IN_SCENARIOS[key]) {
      throw new NotFoundException(`Scenario not found: ${scenarioKey}`);
    }
    return this.harness.runBuiltInScenario(key);
  }

  @Post('run-all')
  @HttpCode(HttpStatus.OK)
  async runAllScenarios() {
    return this.harness.runAllBuiltInScenarios();
  }

  @Post('run-custom')
  @HttpCode(HttpStatus.OK)
  async runCustomScenario(
    @Body() body: {
      name: string;
      events: Array<{ event_id: string; type: string; [key: string]: any }>;
      expectedTimeline?: any[];
      expectedActions?: any[];
      caseId?: string;
    },
  ) {
    return this.harness.runScenario(
      body.name,
      body.events,
      body.expectedTimeline || [],
      body.expectedActions || [],
      body.caseId,
    );
  }
}

// ============ Action Feedback Controller (v28_policy_feedback) ============
@Controller('icrabot/v28/feedback')
export class ActionFeedbackController {
  constructor(private readonly feedback: ActionFeedbackService) {}

  /**
   * External callback endpoint (Python ActionCallbackView)
   * POST /api/icrabot/v28/feedback/callback
   * 
   * Body: { case_id: string, kind: string, data?: object }
   */
  @Post('callback')
  @HttpCode(HttpStatus.OK)
  async processCallback(
    @Body() body: { case_id: string; kind: string; data?: Record<string, any> },
  ) {
    if (!body.case_id) {
      throw new NotFoundException('case_id required');
    }
    return this.feedback.processCallback(body);
  }

  /**
   * Get last feedback for specific action type
   */
  @Get(':caseId/:actionType')
  async getLastFeedback(
    @Param('caseId') caseId: string,
    @Param('actionType') actionType: string,
  ) {
    return this.feedback.getLastFeedback(caseId, actionType);
  }

  /**
   * Get all feedbacks for a case
   */
  @Get(':caseId')
  async getAllFeedbacks(@Param('caseId') caseId: string) {
    return this.feedback.getAllFeedbacks(caseId);
  }

  /**
   * Get callback history for a case
   */
  @Get(':caseId/callbacks')
  async getCallbackHistory(@Param('caseId') caseId: string) {
    return this.feedback.getCallbackHistory(caseId);
  }

  /**
   * Get last global action status
   */
  @Get(':caseId/last')
  async getLastGlobalStatus(@Param('caseId') caseId: string) {
    return this.feedback.getLastGlobalStatus(caseId);
  }
}
