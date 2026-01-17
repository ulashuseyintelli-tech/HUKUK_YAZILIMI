/**
 * Playbook Service
 * 
 * Phase 7B - Sprint 3 - Task 3.5
 * 
 * State machine + iş mantığı.
 * Controller ince, service kalın.
 * 
 * States: ACTIVE | PAUSED | DISABLED | ESCALATED | EXHAUSTED
 * 
 * @see .kiro/specs/ops-playbook/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { PlaybookRegistry } from './playbook-registry.service';
import { PlaybookMatcher } from './playbook-matcher.service';
import { ActionExecutor } from './action-executor.service';
import { ActionPolicyGuard } from './action-policy-guard.service';
import { ActionLeaseManager } from './action-lease-manager.service';
import { PlaybookAuditService } from './playbook-audit.service';
import { PlaybookMetricsService } from './playbook-metrics.service';
import { NotificationService } from './notification.service';
import { EscalationService } from './escalation.service';
import { DiagnosticsIncidentService } from '../diagnostics-incident.service';
import {
  Playbook,
  AutoAction,
  EscalationAction,
  SafetyPolicy,
  isNotificationAction,
  isAutoAction,
  isHumanAction,
  isEscalationAction,
} from './playbook.types';
import {
  PlaybookMode,
  PauseScope,
  PlaybookState,
  PlaybookListResponse,
  PlaybookListItem,
  PlaybookDetailResponse,
  PlaybookStateResponse,
  EvaluateResponse,
  RunResponse,
  HealthResponse,
  LeaseResponse,
  AcknowledgeResponse,
  ResolveResponse,
  RequestContext,
  PauseContext,
  RunContext,
  AuditQueryContext,
  PlannedAction,
} from './playbook-controller.types';

// ============================================================================
// INTERNAL STATE TYPES
// ============================================================================

interface PlaybookRuntimeState {
  enabled: boolean;
  mode: PlaybookMode;
  state: PlaybookState;
  pausedScopes: Map<string, PauseScope>; // key: scope identifier
  lastUpdatedAt: string;
  lastExecutedAt?: string;
  executionCount: number;
  successCount: number;
  failedCount: number;
}

interface IdempotencyRecord {
  key: string;
  result: unknown;
  timestamp: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MIN_DRY_RUNS_FOR_LIVE = 10;
const LEASE_EXPIRY_SOON_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// PLAYBOOK SERVICE
// ============================================================================

@Injectable()
export class PlaybookService {
  private readonly logger = new Logger(PlaybookService.name);
  
  // Runtime state per playbook
  private readonly runtimeStates = new Map<string, PlaybookRuntimeState>();
  
  // Idempotency tracking
  private readonly idempotencyCache = new Map<string, IdempotencyRecord>();
  
  // Human action tracking
  private readonly acknowledgements = new Map<string, {
    userId: string;
    timestamp: string;
    note?: string | undefined;
  }>();

  constructor(
    private readonly registry: PlaybookRegistry,
    private readonly matcher: PlaybookMatcher,
    private readonly executor: ActionExecutor,
    private readonly policyGuard: ActionPolicyGuard,
    private readonly leaseManager: ActionLeaseManager,
    private readonly audit: PlaybookAuditService,
    private readonly metrics: PlaybookMetricsService,
    private readonly notifications: NotificationService,
    private readonly escalation: EscalationService,
    private readonly incidentService: DiagnosticsIncidentService,
  ) {}

  // ============================================================================
  // LIST & GET
  // ============================================================================

  async listPlaybooks(filters: {
    enabled?: boolean;
    tag?: string;
    tenantId?: string;
  }): Promise<PlaybookListResponse> {
    const allPlaybooks = this.registry.getAllPlaybooks();
    
    let filtered = allPlaybooks;
    
    // Apply filters
    if (filters.enabled !== undefined) {
      filtered = filtered.filter((p: Playbook) => {
        const state = this.getOrCreateRuntimeState(p.id);
        return state.enabled === filters.enabled;
      });
    }
    
    // Map to list items
    const items: PlaybookListItem[] = filtered.map((p: Playbook) => {
      const state = this.getOrCreateRuntimeState(p.id);
      return {
        id: p.id,
        name: p.name,
        version: p.version,
        enabled: state.enabled,
        mode: state.mode,
        state: state.state,
        lastUpdatedAt: state.lastUpdatedAt,
        tags: [], // TODO: Add tags to playbook schema
        matchCriteria: {
          incidentType: p.match.incidentType,
          severities: p.match.severity,
        },
      };
    });
    
    return {
      playbooks: items,
      total: items.length,
    };
  }

  async getPlaybook(id: string, _tenantId?: string): Promise<PlaybookDetailResponse | null> {
    const playbook = this.registry.getPlaybook(id);
    if (!playbook) return null;
    
    const state = this.getOrCreateRuntimeState(id);
    const activeLeases = this.leaseManager.getActiveLeases()
      .filter(l => l.playbookId === id);
    
    // Count actions by type
    let notifications = 0, autoActions = 0, humanActions = 0, escalations = 0;
    for (const action of playbook.actions) {
      if (isNotificationAction(action)) notifications++;
      else if (isAutoAction(action)) autoActions++;
      else if (isHumanAction(action)) humanActions++;
      else if (isEscalationAction(action)) escalations++;
    }
    
    // Collect safety policies
    const safetyPolicies = playbook.actions
      .filter(isAutoAction)
      .map((a: AutoAction) => a.safetyPolicy);
    
    // Find max escalations
    const maxEscalations = playbook.actions
      .filter(isEscalationAction)
      .reduce((max: number, a: EscalationAction) => Math.max(max, a.maxEscalations), 0);
    
    // Find cooldown
    const cooldownMs = safetyPolicies.length > 0
      ? Math.max(...safetyPolicies.map((p: SafetyPolicy) => p.cooldownMs))
      : 0;
    
    return {
      id: playbook.id,
      name: playbook.name,
      version: playbook.version,
      description: playbook.description,
      enabled: state.enabled,
      mode: state.mode,
      state: state.state,
      match: {
        incidentType: playbook.match.incidentType,
        severities: playbook.match.severity,
        tenantScope: playbook.match.tenantScope,
      },
      actions: {
        total: playbook.actions.length,
        notifications,
        autoActions,
        humanActions,
        escalations,
      },
      guardrails: {
        safetyPolicies,
        maxEscalations,
        cooldownMs,
      },
      stats: {
        totalExecutions: state.executionCount,
        successfulExecutions: state.successCount,
        failedExecutions: state.failedCount,
        lastExecutedAt: state.lastExecutedAt,
        activeLeases: activeLeases.length,
      },
      createdAt: state.lastUpdatedAt, // TODO: Track creation time
      lastUpdatedAt: state.lastUpdatedAt,
    };
  }

  // ============================================================================
  // ENABLE/DISABLE
  // ============================================================================

  async enablePlaybook(id: string, ctx: RequestContext): Promise<PlaybookStateResponse> {
    // Idempotency check
    if (ctx.idempotencyKey) {
      const cached = this.checkIdempotency(ctx.idempotencyKey);
      if (cached) return cached as PlaybookStateResponse;
    }
    
    const playbook = this.registry.getPlaybook(id);
    if (!playbook) {
      throw new Error(`Playbook ${id} not found`);
    }
    
    const state = this.getOrCreateRuntimeState(id);
    const previousState = { ...state };
    
    state.enabled = true;
    if (state.state === 'DISABLED') {
      state.state = 'ACTIVE';
    }
    state.lastUpdatedAt = new Date().toISOString();
    
    // Audit
    const auditEntry = this.audit.createExecutionEntry(
      `enable_${Date.now()}`,
      id,
      playbook.version,
      'system',
      ctx.tenantId || 'global',
      'manual',
      false,
      'SUCCESS',
      0,
      ctx.userId,
    );
    
    const response: PlaybookStateResponse = {
      ok: true,
      playbookId: id,
      previousState: {
        enabled: previousState.enabled,
        mode: previousState.mode,
        state: previousState.state,
      },
      newState: {
        enabled: state.enabled,
        mode: state.mode,
        state: state.state,
      },
      auditId: auditEntry.id,
      timestamp: new Date().toISOString(),
    };
    
    // Cache for idempotency
    if (ctx.idempotencyKey) {
      this.cacheIdempotency(ctx.idempotencyKey, response);
    }
    
    this.logger.log('[PlaybookService] Playbook enabled', { id, userId: ctx.userId });
    
    return response;
  }

  async disablePlaybook(id: string, ctx: RequestContext): Promise<PlaybookStateResponse> {
    if (ctx.idempotencyKey) {
      const cached = this.checkIdempotency(ctx.idempotencyKey);
      if (cached) return cached as PlaybookStateResponse;
    }
    
    const playbook = this.registry.getPlaybook(id);
    if (!playbook) {
      throw new Error(`Playbook ${id} not found`);
    }
    
    const state = this.getOrCreateRuntimeState(id);
    const previousState = { ...state };
    
    state.enabled = false;
    state.state = 'DISABLED';
    state.lastUpdatedAt = new Date().toISOString();
    
    const auditEntry = this.audit.createExecutionEntry(
      `disable_${Date.now()}`,
      id,
      playbook.version,
      'system',
      ctx.tenantId || 'global',
      'manual',
      false,
      'SUCCESS',
      0,
      ctx.userId,
    );
    
    const response: PlaybookStateResponse = {
      ok: true,
      playbookId: id,
      previousState: {
        enabled: previousState.enabled,
        mode: previousState.mode,
        state: previousState.state,
      },
      newState: {
        enabled: state.enabled,
        mode: state.mode,
        state: state.state,
      },
      auditId: auditEntry.id,
      timestamp: new Date().toISOString(),
    };
    
    if (ctx.idempotencyKey) {
      this.cacheIdempotency(ctx.idempotencyKey, response);
    }
    
    this.logger.log('[PlaybookService] Playbook disabled', { id, userId: ctx.userId });
    
    return response;
  }

  // ============================================================================
  // MODE CHANGE
  // ============================================================================

  async changeMode(id: string, mode: PlaybookMode, ctx: RequestContext): Promise<PlaybookStateResponse> {
    if (ctx.idempotencyKey) {
      const cached = this.checkIdempotency(ctx.idempotencyKey);
      if (cached) return cached as PlaybookStateResponse;
    }
    
    const playbook = this.registry.getPlaybook(id);
    if (!playbook) {
      throw new Error(`Playbook ${id} not found`);
    }
    
    const state = this.getOrCreateRuntimeState(id);
    const previousState = { ...state };
    
    // Validate DRY_RUN → LIVE transition
    if (mode === 'LIVE' && previousState.mode === 'DRY_RUN') {
      const validationResult = this.validateLiveTransition(id, state);
      if (!validationResult.allowed) {
        throw new Error(`Cannot switch to LIVE: ${validationResult.reason}`);
      }
    }
    
    state.mode = mode;
    state.lastUpdatedAt = new Date().toISOString();
    
    const auditEntry = this.audit.createExecutionEntry(
      `mode_${Date.now()}`,
      id,
      playbook.version,
      'system',
      ctx.tenantId || 'global',
      'manual',
      false,
      'SUCCESS',
      0,
      ctx.userId,
    );
    
    const response: PlaybookStateResponse = {
      ok: true,
      playbookId: id,
      previousState: {
        enabled: previousState.enabled,
        mode: previousState.mode,
        state: previousState.state,
      },
      newState: {
        enabled: state.enabled,
        mode: state.mode,
        state: state.state,
      },
      auditId: auditEntry.id,
      timestamp: new Date().toISOString(),
    };
    
    if (ctx.idempotencyKey) {
      this.cacheIdempotency(ctx.idempotencyKey, response);
    }
    
    this.logger.log('[PlaybookService] Mode changed', { id, mode, userId: ctx.userId });
    
    return response;
  }

  private validateLiveTransition(_id: string, state: PlaybookRuntimeState): { allowed: boolean; reason?: string } {
    // Check minimum dry runs
    if (state.executionCount < MIN_DRY_RUNS_FOR_LIVE) {
      return {
        allowed: false,
        reason: `Need at least ${MIN_DRY_RUNS_FOR_LIVE} dry-run executions (current: ${state.executionCount})`,
      };
    }
    
    // Check recent failures
    const failureRate = state.executionCount > 0
      ? state.failedCount / state.executionCount
      : 0;
    if (failureRate > 0.1) {
      return {
        allowed: false,
        reason: `Failure rate too high: ${(failureRate * 100).toFixed(1)}% (max: 10%)`,
      };
    }
    
    // Check notification channels
    const notifStats = this.notifications.getStats();
    if (notifStats.deadLetter > 0) {
      return {
        allowed: false,
        reason: `${notifStats.deadLetter} notifications in dead letter queue`,
      };
    }
    
    return { allowed: true };
  }


  // ============================================================================
  // PAUSE/RESUME
  // ============================================================================

  async pausePlaybook(id: string, ctx: PauseContext): Promise<PlaybookStateResponse> {
    if (ctx.idempotencyKey) {
      const cached = this.checkIdempotency(ctx.idempotencyKey);
      if (cached) return cached as PlaybookStateResponse;
    }
    
    const playbook = this.registry.getPlaybook(id);
    if (!playbook) {
      throw new Error(`Playbook ${id} not found`);
    }
    
    const state = this.getOrCreateRuntimeState(id);
    const previousState = { ...state };
    
    // Build scope key
    const scopeKey = this.buildScopeKey(ctx.scope, ctx.incidentId, ctx.tenantId);
    state.pausedScopes.set(scopeKey, ctx.scope);
    
    // Update state if globally paused
    if (ctx.scope === 'GLOBAL') {
      state.state = 'PAUSED';
    }
    
    state.lastUpdatedAt = new Date().toISOString();
    
    const auditEntry = this.audit.createExecutionEntry(
      `pause_${Date.now()}`,
      id,
      playbook.version,
      'system',
      ctx.tenantId || 'global',
      'manual',
      false,
      'SUCCESS',
      0,
      ctx.userId,
    );
    
    const response: PlaybookStateResponse = {
      ok: true,
      playbookId: id,
      previousState: {
        enabled: previousState.enabled,
        mode: previousState.mode,
        state: previousState.state,
      },
      newState: {
        enabled: state.enabled,
        mode: state.mode,
        state: state.state,
      },
      auditId: auditEntry.id,
      timestamp: new Date().toISOString(),
    };
    
    if (ctx.idempotencyKey) {
      this.cacheIdempotency(ctx.idempotencyKey, response);
    }
    
    this.logger.log('[PlaybookService] Playbook paused', { 
      id, 
      scope: ctx.scope, 
      incidentId: ctx.incidentId,
      userId: ctx.userId,
    });
    
    return response;
  }

  async resumePlaybook(id: string, ctx: PauseContext): Promise<PlaybookStateResponse> {
    if (ctx.idempotencyKey) {
      const cached = this.checkIdempotency(ctx.idempotencyKey);
      if (cached) return cached as PlaybookStateResponse;
    }
    
    const playbook = this.registry.getPlaybook(id);
    if (!playbook) {
      throw new Error(`Playbook ${id} not found`);
    }
    
    const state = this.getOrCreateRuntimeState(id);
    const previousState = { ...state };
    
    // Remove scope
    const scopeKey = this.buildScopeKey(ctx.scope, ctx.incidentId, ctx.tenantId);
    state.pausedScopes.delete(scopeKey);
    
    // Update state if no more pauses
    if (state.pausedScopes.size === 0 && state.state === 'PAUSED') {
      state.state = state.enabled ? 'ACTIVE' : 'DISABLED';
    }
    
    state.lastUpdatedAt = new Date().toISOString();
    
    const auditEntry = this.audit.createExecutionEntry(
      `resume_${Date.now()}`,
      id,
      playbook.version,
      'system',
      ctx.tenantId || 'global',
      'manual',
      false,
      'SUCCESS',
      0,
      ctx.userId,
    );
    
    const response: PlaybookStateResponse = {
      ok: true,
      playbookId: id,
      previousState: {
        enabled: previousState.enabled,
        mode: previousState.mode,
        state: previousState.state,
      },
      newState: {
        enabled: state.enabled,
        mode: state.mode,
        state: state.state,
      },
      auditId: auditEntry.id,
      timestamp: new Date().toISOString(),
    };
    
    if (ctx.idempotencyKey) {
      this.cacheIdempotency(ctx.idempotencyKey, response);
    }
    
    this.logger.log('[PlaybookService] Playbook resumed', { 
      id, 
      scope: ctx.scope,
      userId: ctx.userId,
    });
    
    return response;
  }

  private buildScopeKey(scope: PauseScope, incidentId?: string, tenantId?: string): string {
    switch (scope) {
      case 'GLOBAL': return 'global';
      case 'INCIDENT': return `incident:${incidentId}`;
      case 'TENANT': return `tenant:${tenantId}`;
      default: return 'global';
    }
  }

  // ============================================================================
  // EVALUATE (DRY SIMULATION)
  // ============================================================================

  async evaluatePlaybook(id: string, incidentId: string, _tenantId?: string): Promise<EvaluateResponse> {
    const playbook = this.registry.getPlaybook(id);
    if (!playbook) {
      throw new Error(`Playbook ${id} not found`);
    }
    
    // Get incident
    const incident = this.incidentService.getIncident(incidentId);
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`);
    }
    
    // Check match
    const matchResult = this.matcher.findMatch(incident);
    const matched = matchResult?.playbook.id === id;
    
    // Plan actions
    const plannedActions: PlannedAction[] = [];
    const blockReasons: string[] = [];
    let estimatedDuration = 0;
    let estimatedNotifications = 0;
    
    for (const action of playbook.actions) {
      const planned: PlannedAction = {
        actionId: action.id,
        type: action.type,
        description: this.describeAction(action),
        wouldExecute: true,
      };
      
      // Check policy for auto-actions
      if (isAutoAction(action)) {
        const policyCheck = this.policyGuard.checkPolicy(
          action,
          incident,
          { executionId: `eval_${Date.now()}`, role: 'system' },
        );
        
        if (!policyCheck.allowed) {
          planned.wouldExecute = false;
          planned.blockReason = policyCheck.reason;
          blockReasons.push(`${action.id}: ${policyCheck.reason}`);
        }
        
        // Add lease duration
        if (action.lease) {
          estimatedDuration += action.lease.durationMs;
        }
      }
      
      if (isNotificationAction(action)) {
        estimatedNotifications++;
      }
      
      plannedActions.push(planned);
    }
    
    return {
      playbookId: id,
      incidentId,
      matched,
      matchScore: matchResult?.matchScore || 0,
      matchedCriteria: matchResult?.matchedCriteria || {
        incidentType: false,
        severity: false,
        tenantScope: false,
        whenClauses: false,
      },
      plannedActions,
      wouldBlock: {
        blocked: blockReasons.length > 0,
        reasons: blockReasons,
      },
      estimatedDuration,
      estimatedNotifications,
      dryRunOutput: {
        notifications: plannedActions
          .filter(a => a.type === 'notification')
          .map(a => a.description),
        actions: plannedActions
          .filter(a => a.type === 'auto_action')
          .map(a => a.description),
      },
    };
  }

  private describeAction(action: any): string {
    if (isNotificationAction(action)) {
      return `Send ${action.template} via ${action.channel}`;
    }
    if (isAutoAction(action)) {
      return `Execute ${action.action} with params: ${JSON.stringify(action.params)}`;
    }
    if (isHumanAction(action)) {
      return `Assign to ${action.assigneeRole}: ${action.description}`;
    }
    if (isEscalationAction(action)) {
      return `Escalate to ${action.toSeverity} after ${action.delayMs}ms`;
    }
    return `Unknown action: ${action.type}`;
  }

  // ============================================================================
  // RUN (EXECUTE)
  // ============================================================================

  async runPlaybook(id: string, incidentId: string, ctx: RunContext): Promise<RunResponse> {
    if (ctx.idempotencyKey) {
      const cached = this.checkIdempotency(ctx.idempotencyKey);
      if (cached) return cached as RunResponse;
    }
    
    const playbook = this.registry.getPlaybook(id);
    if (!playbook) {
      throw new Error(`Playbook ${id} not found`);
    }
    
    const state = this.getOrCreateRuntimeState(id);
    
    // Check if playbook is runnable
    if (!state.enabled) {
      throw new Error(`Playbook ${id} is disabled`);
    }
    
    if (state.state === 'PAUSED') {
      throw new Error(`Playbook ${id} is paused`);
    }
    
    // Check mode
    const effectiveMode = ctx.mode || state.mode;
    const isDryRun = effectiveMode === 'DRY_RUN' || playbook.dryRun;
    
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    
    // Get incident for executor
    const incident = this.incidentService.getIncident(incidentId);
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`);
    }
    
    // Execute
    const result = await this.executor.execute(
      playbook,
      incident,
      {
        dryRun: isDryRun,
        triggeredBy: ctx.userId ? 'manual' : 'auto',
        userId: ctx.userId,
      },
    );
    
    // Update stats
    state.executionCount++;
    if (result.result === 'SUCCESS') {
      state.successCount++;
    } else if (result.result === 'FAILED') {
      state.failedCount++;
    }
    state.lastExecutedAt = new Date().toISOString();
    
    // Audit
    const auditEntry = this.audit.createExecutionEntry(
      executionId,
      id,
      playbook.version,
      incidentId,
      ctx.tenantId || 'global',
      ctx.userId ? 'manual' : 'auto',
      isDryRun,
      result.result,
      Date.now() - startTime,
      ctx.userId,
    );
    
    const response: RunResponse = {
      ok: result.result !== 'FAILED',
      executionId,
      playbookId: id,
      incidentId,
      mode: effectiveMode,
      status: 'COMPLETED',
      result,
      auditId: auditEntry.id,
      timestamp: new Date().toISOString(),
    };
    
    if (ctx.idempotencyKey) {
      this.cacheIdempotency(ctx.idempotencyKey, response);
    }
    
    this.logger.log('[PlaybookService] Playbook executed', {
      id,
      executionId,
      incidentId,
      mode: effectiveMode,
      result: result.result,
    });
    
    return response;
  }

  // ============================================================================
  // AUDIT
  // ============================================================================

  async getPlaybookAudit(id: string, ctx: AuditQueryContext) {
    const entries = this.audit.getExecutionHistory(
      ctx.tenantId,
      id,
      ctx.since,
      ctx.limit,
    );
    
    return {
      playbookId: id,
      entries,
      total: entries.length,
      hasMore: entries.length === ctx.limit,
    };
  }

  async exportPlaybookAudit(_id: string, ctx: AuditQueryContext) {
    return this.audit.exportExecutionLogs(ctx.since);
  }

  // ============================================================================
  // HEALTH
  // ============================================================================

  async getHealth(): Promise<HealthResponse> {
    const allPlaybooks = this.registry.getAllPlaybooks();
    const notifStats = this.notifications.getStats();
    const escalationStats = this.escalation.getStats();
    const activeLeases = this.leaseManager.getActiveLeases();
    
    // Count expiring soon
    const now = Date.now();
    const expiringSoon = activeLeases.filter(l => {
      const expiresAt = new Date(l.expiresAt).getTime();
      return expiresAt - now < LEASE_EXPIRY_SOON_MS;
    }).length;
    
    // Calculate metrics
    const metricsData = this.metrics.getMetrics();
    const totalExecs = metricsData.summary.totalExecutions;
    const successExecs = metricsData.executions
      .filter(e => e.result === 'SUCCESS')
      .reduce((sum, e) => sum + e.count, 0);
    
    const status = this.determineHealthStatus(notifStats, escalationStats);
    
    return {
      status,
      timestamp: new Date().toISOString(),
      registry: {
        loaded: true,
        count: allPlaybooks.length,
        lastReload: undefined, // TODO: Track reload time
        errors: [],
      },
      matcher: {
        operational: true,
      },
      escalation: {
        jobRunning: true, // Assume running if service is up
        pendingTimers: escalationStats.pendingTimers,
        executedLast24h: escalationStats.executedTimers,
      },
      notification: {
        channels: {
          console: 'ok',
          webhook: this.notifications.getChannelConfig('webhook') ? 'ok' : 'not_configured',
          slack: this.notifications.getChannelConfig('slack') ? 'ok' : 'not_configured',
          email: 'not_configured',
        },
        retryQueue: notifStats.retryQueue,
        deadLetter: notifStats.deadLetter,
      },
      leases: {
        active: activeLeases.length,
        expiringSoon,
      },
      metrics: {
        executionsLast24h: totalExecs,
        successRate: totalExecs > 0 ? successExecs / totalExecs : 1,
      },
    };
  }

  private determineHealthStatus(
    notifStats: { deadLetter: number; retryQueue: number },
    _escalationStats: { pendingTimers: number },
  ): 'healthy' | 'degraded' | 'unhealthy' {
    if (notifStats.deadLetter > 10) return 'unhealthy';
    if (notifStats.deadLetter > 0 || notifStats.retryQueue > 50) return 'degraded';
    return 'healthy';
  }

  // ============================================================================
  // LEASE MANAGEMENT
  // ============================================================================

  async getActiveLeases(tenantId?: string): Promise<LeaseResponse[]> {
    let leases = this.leaseManager.getActiveLeases();
    
    if (tenantId) {
      leases = leases.filter(l => l.tenantId === tenantId);
    }
    
    const now = Date.now();
    
    return leases.map(l => ({
      ok: true,
      lease: {
        id: l.id,
        actionId: l.actionId,
        incidentId: l.incidentId,
        playbookId: l.playbookId,
        tenantId: l.tenantId,
        actionType: l.actionType,
        status: l.status,
        createdAt: l.createdAt,
        expiresAt: l.expiresAt,
        remainingMs: Math.max(0, new Date(l.expiresAt).getTime() - now),
      },
    }));
  }

  async revokeLease(id: string, ctx: RequestContext): Promise<LeaseResponse> {
    const result = await this.leaseManager.revokeLease(id, ctx.userId);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to revoke lease');
    }
    
    const lease = this.leaseManager.getLease(id);
    
    return {
      ok: true,
      lease: {
        id,
        actionId: lease?.actionId || '',
        incidentId: lease?.incidentId || '',
        playbookId: lease?.playbookId || '',
        tenantId: lease?.tenantId || '',
        actionType: lease?.actionType || '',
        status: 'REVOKED',
        createdAt: lease?.createdAt || '',
        expiresAt: lease?.expiresAt || '',
        remainingMs: 0, // Revoked lease has no remaining time
      },
      auditId: result.auditId,
    };
  }

  async extendLease(id: string, durationMs: number, _ctx: RequestContext): Promise<LeaseResponse> {
    const result = await this.leaseManager.extendLease(id, durationMs);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to extend lease');
    }
    
    const lease = this.leaseManager.getLease(id);
    const now = Date.now();
    
    return {
      ok: true,
      lease: {
        id,
        actionId: lease?.actionId || '',
        incidentId: lease?.incidentId || '',
        playbookId: lease?.playbookId || '',
        tenantId: lease?.tenantId || '',
        actionType: lease?.actionType || '',
        status: lease?.status || 'ACTIVE',
        createdAt: lease?.createdAt || '',
        expiresAt: lease?.expiresAt || '',
        remainingMs: lease ? Math.max(0, new Date(lease.expiresAt).getTime() - now) : 0,
      },
    };
  }

  // ============================================================================
  // INCIDENT INTEGRATION (HUMAN ACTION TRACKING)
  // ============================================================================

  async acknowledgeIncident(incidentId: string, ctx: {
    userId: string;
    note?: string;
    tenantId?: string;
  }): Promise<AcknowledgeResponse> {
    const now = new Date();
    
    // Store acknowledgement
    this.acknowledgements.set(incidentId, {
      userId: ctx.userId,
      timestamp: now.toISOString(),
      note: ctx.note,
    });
    
    // Find SLA from playbook human actions
    const incident = this.incidentService.getIncident(incidentId);
    let slaDeadline: string | undefined;
    
    if (incident) {
      const matchResult = this.matcher.findMatch(incident);
      if (matchResult) {
        const humanAction = matchResult.playbook.actions.find(isHumanAction);
        if (humanAction) {
          slaDeadline = new Date(now.getTime() + humanAction.slaMs).toISOString();
        }
      }
    }
    
    const auditEntry = this.audit.createExecutionEntry(
      `ack_${Date.now()}`,
      'system',
      '1.0.0',
      incidentId,
      ctx.tenantId || 'global',
      'manual',
      false,
      'SUCCESS',
      0,
      ctx.userId,
    );
    
    this.logger.log('[PlaybookService] Incident acknowledged', {
      incidentId,
      userId: ctx.userId,
    });
    
    return {
      ok: true,
      incidentId,
      acknowledgedBy: ctx.userId,
      acknowledgedAt: now.toISOString(),
      slaTimerStarted: !!slaDeadline,
      slaDeadline,
      auditId: auditEntry.id,
    };
  }

  async resolveIncident(incidentId: string, ctx: {
    userId: string;
    resolutionNote: string;
    tenantId?: string;
  }): Promise<ResolveResponse> {
    const now = new Date();
    
    // Cancel escalations
    const escalationResult = this.escalation.cancelEscalation(incidentId, 'incident_resolved');
    
    // Revoke leases for this incident
    const activeLeases = this.leaseManager.getActiveLeases()
      .filter(l => l.incidentId === incidentId);
    
    for (const lease of activeLeases) {
      await this.leaseManager.revokeLease(lease.id, ctx.userId);
    }
    
    // Calculate SLA compliance
    const ack = this.acknowledgements.get(incidentId);
    let slaCompliance: ResolveResponse['slaCompliance'];
    
    if (ack) {
      const ackTime = new Date(ack.timestamp).getTime();
      const resolveTime = now.getTime();
      const actualMs = resolveTime - ackTime;
      
      // Find SLA target
      const incident = this.incidentService.getIncident(incidentId);
      if (incident) {
        const matchResult = this.matcher.findMatch(incident);
        if (matchResult) {
          const humanAction = matchResult.playbook.actions.find(isHumanAction);
          if (humanAction) {
            slaCompliance = {
              met: actualMs <= humanAction.slaMs,
              targetMs: humanAction.slaMs,
              actualMs,
            };
          }
        }
      }
    }
    
    // Clean up acknowledgement
    this.acknowledgements.delete(incidentId);
    
    const auditEntry = this.audit.createExecutionEntry(
      `resolve_${Date.now()}`,
      'system',
      '1.0.0',
      incidentId,
      ctx.tenantId || 'global',
      'manual',
      false,
      'SUCCESS',
      0,
      ctx.userId,
    );
    
    this.logger.log('[PlaybookService] Incident resolved', {
      incidentId,
      userId: ctx.userId,
      escalationsCancelled: escalationResult.cancelled ? 1 : 0,
      leasesRevoked: activeLeases.length,
    });
    
    return {
      ok: true,
      incidentId,
      resolvedBy: ctx.userId,
      resolvedAt: now.toISOString(),
      resolutionNote: ctx.resolutionNote,
      escalationsCancelled: escalationResult.cancelled ? 1 : 0,
      leasesRevoked: activeLeases.length,
      slaCompliance,
      auditId: auditEntry.id,
    };
  }

  async getIncidentPlaybookHistory(incidentId: string, _tenantId?: string) {
    const actions = this.audit.getActionsForIncident(incidentId);
    return {
      incidentId,
      executions: actions,
      total: actions.length,
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private getOrCreateRuntimeState(playbookId: string): PlaybookRuntimeState {
    let state = this.runtimeStates.get(playbookId);
    
    if (!state) {
      const playbook = this.registry.getPlaybook(playbookId);
      state = {
        enabled: true,
        mode: playbook?.dryRun ? 'DRY_RUN' : 'LIVE',
        state: 'ACTIVE',
        pausedScopes: new Map(),
        lastUpdatedAt: new Date().toISOString(),
        executionCount: 0,
        successCount: 0,
        failedCount: 0,
      };
      this.runtimeStates.set(playbookId, state);
    }
    
    return state;
  }

  private checkIdempotency(key: string): unknown | null {
    const record = this.idempotencyCache.get(key);
    if (!record) return null;
    
    // Check TTL
    if (Date.now() - record.timestamp > IDEMPOTENCY_TTL_MS) {
      this.idempotencyCache.delete(key);
      return null;
    }
    
    return record.result;
  }

  private cacheIdempotency(key: string, result: unknown): void {
    this.idempotencyCache.set(key, {
      key,
      result,
      timestamp: Date.now(),
    });
    
    // Cleanup old entries periodically
    if (this.idempotencyCache.size > 10000) {
      const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
      for (const [k, v] of this.idempotencyCache.entries()) {
        if (v.timestamp < cutoff) {
          this.idempotencyCache.delete(k);
        }
      }
    }
  }

  // ============================================================================
  // TEST HELPERS
  // ============================================================================

  clear(): void {
    this.runtimeStates.clear();
    this.idempotencyCache.clear();
    this.acknowledgements.clear();
  }
}
