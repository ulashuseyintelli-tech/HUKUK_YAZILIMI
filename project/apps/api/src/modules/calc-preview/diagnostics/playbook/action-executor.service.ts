/**
 * Action Executor Service
 * 
 * Phase 7B - Sprint 2 - Task 2.3 & 2.4
 * 
 * Playbook action'larını çalıştırır.
 * 
 * Kritik Özellikler:
 * 1. Dry-run mode: notification + audit only, no auto-action
 * 2. Policy guard check before each auto-action
 * 3. Lease creation for temporary actions
 * 4. Original state capture for rollback
 * 5. Error handling (partial success)
 * 
 * Auto-Action Implementations:
 * - extend_cache_ttl: VersionedCacheService TTL multiplier
 * - force_circuit_half_open: CircuitBreakerService state change
 * - enable_stale_serve: VersionedCacheService stale-while-revalidate
 * - increase_timeout: CircuitBreakerService timeout multiplier
 * - reduce_rate_limit: Rate limit factor reduction
 * 
 * @see .kiro/specs/ops-playbook/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  Playbook,
  PlaybookAction,
  AutoAction,
  NotificationAction,
  HumanAction,
  EscalationAction,
  ExecutionResult,
  ExecutionResultStatus,
  ActionResult,
  ExecutionOptions,
  AutoActionType,
  ExtendCacheTTLParams,
  ForceCircuitHalfOpenParams,
  EnableStaleServeParams,
  IncreaseTimeoutParams,
  ReduceRateLimitParams,
  isAutoAction,
  isNotificationAction,
  isHumanAction,
  isEscalationAction,
} from './playbook.types';
import { DiagnosticsIncident } from '../diagnostics.types';
import { ActionPolicyGuard } from './action-policy-guard.service';
import { ActionLeaseManager, RollbackResult } from './action-lease-manager.service';
import { CalcPreviewCircuitBreakerService, DependencyName } from '../../circuit-breaker/calc-preview-circuit-breaker.service';
import { VersionedCacheService, CacheNamespace, CACHE_CONFIGS } from '../../cache/versioned-cache.service';

// ============================================================================
// ORIGINAL STATE TYPES
// ============================================================================

interface CacheTTLOriginalState {
  namespace: CacheNamespace;
  originalTtlMs: number;
}

interface CircuitStateOriginalState {
  dependency: DependencyName;
  originalState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

interface StaleServeOriginalState {
  namespace: CacheNamespace;
  originalEnabled: boolean;
}

interface TimeoutOriginalState {
  dependency: DependencyName;
  originalTimeoutMs: number;
}

interface RateLimitOriginalState {
  tenantId: string;
  originalFactor: number;
}

// ============================================================================
// RATE LIMIT TRACKER (in-memory for now)
// ============================================================================

interface RateLimitOverride {
  tenantId: string;
  factor: number;
  originalFactor: number;
  appliedAt: number;
}

// ============================================================================
// ACTION EXECUTOR SERVICE
// ============================================================================

@Injectable()
export class ActionExecutor {
  private readonly logger = new Logger(ActionExecutor.name);
  
  // Rate limit overrides (in-memory)
  private readonly rateLimitOverrides = new Map<string, RateLimitOverride>();
  
  // TTL multipliers (in-memory)
  private readonly ttlMultipliers = new Map<CacheNamespace, number>();
  
  // Timeout multipliers (in-memory)
  private readonly timeoutMultipliers = new Map<DependencyName, number>();
  
  // Stale serve overrides (in-memory)
  private readonly staleServeOverrides = new Map<CacheNamespace, boolean>();

  constructor(
    private readonly policyGuard: ActionPolicyGuard,
    private readonly leaseManager: ActionLeaseManager,
    private readonly circuitBreaker: CalcPreviewCircuitBreakerService,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private readonly _cache: VersionedCacheService,
  ) {
    // Register rollback handler with lease manager
    this.leaseManager.registerRollbackHandler(this.handleRollback.bind(this));
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Execute a playbook for an incident
   */
  async execute(
    playbook: Playbook,
    incident: DiagnosticsIncident,
    options: ExecutionOptions,
  ): Promise<ExecutionResult> {
    const executionId = this.generateExecutionId();
    const startTime = Date.now();
    
    this.logger.log('[Executor] Starting playbook execution', {
      executionId,
      playbookId: playbook.id,
      incidentId: incident.id,
      dryRun: options.dryRun || playbook.dryRun,
    });
    
    const actionResults: ActionResult[] = [];
    const isDryRun = options.dryRun || playbook.dryRun;
    
    // Execute each action
    for (const action of playbook.actions) {
      const actionResult = await this.executeAction(
        action,
        incident,
        playbook,
        executionId,
        isDryRun,
        options,
      );
      actionResults.push(actionResult);
    }
    
    // Determine overall result
    const result = this.determineOverallResult(actionResults);
    
    const executionResult: ExecutionResult = {
      executionId,
      playbookId: playbook.id,
      playbookVersion: playbook.version,
      incidentId: incident.id,
      tenantId: incident.tenantId,
      triggeredAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      dryRun: isDryRun,
      result,
      actions: actionResults,
    };
    
    this.logger.log('[Executor] Playbook execution completed', {
      executionId,
      result,
      dryRun: isDryRun,
      durationMs: Date.now() - startTime,
    });
    
    return executionResult;
  }

  /**
   * Execute a single action
   */
  async executeAction(
    action: PlaybookAction,
    incident: DiagnosticsIncident,
    playbook: Playbook,
    executionId: string,
    isDryRun: boolean,
    options: ExecutionOptions,
  ): Promise<ActionResult> {
    const startTime = Date.now();
    
    try {
      if (isAutoAction(action)) {
        return await this.executeAutoAction(
          action,
          incident,
          playbook,
          executionId,
          isDryRun,
          options,
        );
      }
      
      if (isNotificationAction(action)) {
        return await this.executeNotificationAction(
          action,
          incident,
          executionId,
          isDryRun,
        );
      }
      
      if (isHumanAction(action)) {
        return this.executeHumanAction(action, incident, executionId, isDryRun);
      }
      
      if (isEscalationAction(action)) {
        return this.executeEscalationAction(action, incident, executionId, isDryRun);
      }
      
      // Unknown action type
      return {
        actionId: (action as { id: string }).id,
        actionType: (action as { type: string }).type as 'notification' | 'auto_action' | 'human_action' | 'escalation',
        result: 'FAILED',
        error: `Unknown action type: ${(action as { type: string }).type}`,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error('[Executor] Action execution failed', {
        actionId: action.id,
        actionType: action.type,
        error: errorMessage,
      });
      
      return {
        actionId: action.id,
        actionType: action.type,
        result: 'FAILED',
        error: errorMessage,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ============================================================================
  // AUTO-ACTION EXECUTION
  // ============================================================================

  private async executeAutoAction(
    action: AutoAction,
    incident: DiagnosticsIncident,
    playbook: Playbook,
    executionId: string,
    isDryRun: boolean,
    options: ExecutionOptions,
  ): Promise<ActionResult> {
    const startTime = Date.now();
    
    // Dry-run mode: skip auto-action
    if (isDryRun) {
      this.logger.debug('[Executor] Auto-action skipped (dry-run)', {
        actionId: action.id,
        actionType: action.action,
      });
      
      return {
        actionId: action.id,
        actionType: 'auto_action',
        result: 'DRY_RUN',
        durationMs: Date.now() - startTime,
      };
    }
    
    // Policy guard check
    const policyResult = this.policyGuard.checkPolicy(
      action,
      incident,
      { executionId, role: options.userId || 'system' },
    );
    
    if (!policyResult.allowed) {
      this.logger.warn('[Executor] Auto-action rejected by policy', {
        actionId: action.id,
        actionType: action.action,
        reason: policyResult.reason,
      });
      
      const result: ActionResult = {
        actionId: action.id,
        actionType: 'auto_action',
        result: 'REJECTED',
        durationMs: Date.now() - startTime,
      };
      
      if (policyResult.reason) {
        result.rejectionReason = policyResult.reason;
      }
      
      return result;
    }
    
    // Capture original state
    const originalState = this.captureOriginalState(action);
    
    // Execute the auto-action
    const executeResult = await this.executeAutoActionImpl(action, incident);
    
    if (!executeResult.success) {
      const result: ActionResult = {
        actionId: action.id,
        actionType: 'auto_action',
        result: 'FAILED',
        durationMs: Date.now() - startTime,
      };
      
      if (executeResult.error) {
        result.error = executeResult.error;
      }
      
      return result;
    }
    
    // Create lease if configured
    let leaseId: string | undefined;
    if (action.lease) {
      const leaseResult = this.leaseManager.createLease(
        action,
        incident,
        action.lease,
        executionId,
        originalState,
      );
      
      if (leaseResult.success && leaseResult.lease) {
        leaseId = leaseResult.lease.id;
        this.leaseManager.setPlaybookId(leaseId, playbook.id);
      }
    }
    
    // Record execution for idempotency
    this.policyGuard.recordExecution(
      incident.id,
      action.id,
      executionId,
      action.action,
      incident.tenantId,
    );
    
    const result: ActionResult = {
      actionId: action.id,
      actionType: 'auto_action',
      result: 'EXECUTED',
      durationMs: Date.now() - startTime,
    };
    
    if (leaseId) {
      result.leaseId = leaseId;
    }
    
    return result;
  }

  /**
   * Execute auto-action implementation
   */
  private async executeAutoActionImpl(
    action: AutoAction,
    incident: DiagnosticsIncident,
  ): Promise<{ success: boolean; error?: string }> {
    switch (action.action) {
      case 'extend_cache_ttl':
        return this.executeExtendCacheTTL(action.params as ExtendCacheTTLParams);
        
      case 'force_circuit_half_open':
        return this.executeForceCircuitHalfOpen(action.params as ForceCircuitHalfOpenParams);
        
      case 'enable_stale_serve':
        return this.executeEnableStaleServe(action.params as EnableStaleServeParams);
        
      case 'increase_timeout':
        return this.executeIncreaseTimeout(action.params as IncreaseTimeoutParams);
        
      case 'reduce_rate_limit':
        return this.executeReduceRateLimit(action.params as ReduceRateLimitParams, incident);
        
      default:
        return { success: false, error: `Unknown auto-action: ${action.action}` };
    }
  }

  // ============================================================================
  // AUTO-ACTION IMPLEMENTATIONS
  // ============================================================================

  /**
   * Extend cache TTL by multiplier
   */
  private executeExtendCacheTTL(params: ExtendCacheTTLParams): { success: boolean; error?: string } {
    try {
      const namespace = params.namespace as CacheNamespace;
      
      // Store multiplier (will be applied by cache service)
      this.ttlMultipliers.set(namespace, params.multiplier);
      
      this.logger.log('[Executor] Cache TTL extended', {
        namespace,
        multiplier: params.multiplier,
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Force circuit breaker to HALF_OPEN state
   */
  private executeForceCircuitHalfOpen(params: ForceCircuitHalfOpenParams): { success: boolean; error?: string } {
    try {
      const dependency = params.dependency as DependencyName;
      
      this.circuitBreaker.forceState(dependency, 'HALF_OPEN');
      
      this.logger.log('[Executor] Circuit forced to HALF_OPEN', {
        dependency,
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Enable stale-while-revalidate for cache namespace
   */
  private executeEnableStaleServe(params: EnableStaleServeParams): { success: boolean; error?: string } {
    try {
      const namespace = params.namespace as CacheNamespace;
      
      // Store override
      this.staleServeOverrides.set(namespace, params.enabled);
      
      this.logger.log('[Executor] Stale serve updated', {
        namespace,
        enabled: params.enabled,
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Increase timeout for dependency
   */
  private executeIncreaseTimeout(params: IncreaseTimeoutParams): { success: boolean; error?: string } {
    try {
      const dependency = params.dependency as DependencyName;
      
      // Store multiplier
      this.timeoutMultipliers.set(dependency, params.multiplier);
      
      this.logger.log('[Executor] Timeout increased', {
        dependency,
        multiplier: params.multiplier,
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Reduce rate limit for tenant
   */
  private executeReduceRateLimit(
    params: ReduceRateLimitParams,
    incident: DiagnosticsIncident,
  ): { success: boolean; error?: string } {
    try {
      const tenantId = params.tenantId === '$incident.tenantId' 
        ? incident.tenantId 
        : params.tenantId;
      
      const existing = this.rateLimitOverrides.get(tenantId);
      const originalFactor = existing?.originalFactor ?? 1.0;
      
      this.rateLimitOverrides.set(tenantId, {
        tenantId,
        factor: params.factor,
        originalFactor,
        appliedAt: Date.now(),
      });
      
      this.logger.log('[Executor] Rate limit reduced', {
        tenantId,
        factor: params.factor,
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // ============================================================================
  // ORIGINAL STATE CAPTURE
  // ============================================================================

  private captureOriginalState(action: AutoAction): Record<string, unknown> {
    switch (action.action) {
      case 'extend_cache_ttl': {
        const params = action.params as ExtendCacheTTLParams;
        const namespace = params.namespace as CacheNamespace;
        const config = CACHE_CONFIGS[namespace];
        return {
          namespace,
          originalTtlMs: config?.ttlMs ?? 0,
        };
      }
      
      case 'force_circuit_half_open': {
        const params = action.params as ForceCircuitHalfOpenParams;
        const dependency = params.dependency as DependencyName;
        const status = this.circuitBreaker.getStatus(dependency);
        return {
          dependency,
          originalState: status.state,
        };
      }
      
      case 'enable_stale_serve': {
        const params = action.params as EnableStaleServeParams;
        const namespace = params.namespace as CacheNamespace;
        const config = CACHE_CONFIGS[namespace];
        return {
          namespace,
          originalEnabled: config?.staleWhileRevalidate ?? false,
        };
      }
      
      case 'increase_timeout': {
        const params = action.params as IncreaseTimeoutParams;
        const dependency = params.dependency as DependencyName;
        const status = this.circuitBreaker.getStatus(dependency);
        return {
          dependency,
          originalTimeoutMs: status.config.callTimeoutMs,
        };
      }
      
      case 'reduce_rate_limit': {
        const params = action.params as ReduceRateLimitParams;
        const existing = this.rateLimitOverrides.get(params.tenantId);
        return {
          tenantId: params.tenantId,
          originalFactor: existing?.originalFactor ?? 1.0,
        };
      }
      
      default:
        return {};
    }
  }

  // ============================================================================
  // ROLLBACK HANDLER
  // ============================================================================

  private async handleRollback(
    actionType: AutoActionType,
    _params: Record<string, unknown>,
    originalState: Record<string, unknown>,
  ): Promise<RollbackResult> {
    try {
      switch (actionType) {
        case 'extend_cache_ttl': {
          const state = originalState as unknown as CacheTTLOriginalState;
          this.ttlMultipliers.delete(state.namespace);
          this.logger.log('[Executor] Rolled back cache TTL', { namespace: state.namespace });
          return { success: true, leaseId: '', actionType, restoredState: originalState };
        }
        
        case 'force_circuit_half_open': {
          const state = originalState as unknown as CircuitStateOriginalState;
          this.circuitBreaker.forceState(state.dependency, state.originalState);
          this.logger.log('[Executor] Rolled back circuit state', { 
            dependency: state.dependency, 
            state: state.originalState,
          });
          return { success: true, leaseId: '', actionType, restoredState: originalState };
        }
        
        case 'enable_stale_serve': {
          const state = originalState as unknown as StaleServeOriginalState;
          this.staleServeOverrides.delete(state.namespace);
          this.logger.log('[Executor] Rolled back stale serve', { namespace: state.namespace });
          return { success: true, leaseId: '', actionType, restoredState: originalState };
        }
        
        case 'increase_timeout': {
          const state = originalState as unknown as TimeoutOriginalState;
          this.timeoutMultipliers.delete(state.dependency);
          this.logger.log('[Executor] Rolled back timeout', { dependency: state.dependency });
          return { success: true, leaseId: '', actionType, restoredState: originalState };
        }
        
        case 'reduce_rate_limit': {
          const state = originalState as unknown as RateLimitOriginalState;
          this.rateLimitOverrides.delete(state.tenantId);
          this.logger.log('[Executor] Rolled back rate limit', { tenantId: state.tenantId });
          return { success: true, leaseId: '', actionType, restoredState: originalState };
        }
        
        default:
          return { 
            success: false, 
            leaseId: '', 
            actionType, 
            error: `Unknown action type for rollback: ${actionType}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        leaseId: '',
        actionType,
        error: (error as Error).message,
      };
    }
  }

  // ============================================================================
  // OTHER ACTION TYPES
  // ============================================================================

  private async executeNotificationAction(
    action: NotificationAction,
    _incident: DiagnosticsIncident,
    _executionId: string,
    isDryRun: boolean,
  ): Promise<ActionResult> {
    const startTime = Date.now();
    
    // Notifications are sent even in dry-run mode
    this.logger.log('[Executor] Notification action', {
      actionId: action.id,
      channel: action.channel,
      template: action.template,
      dryRun: isDryRun,
    });
    
    // TODO: Integrate with NotificationService in Sprint 3
    // For now, just log
    
    return {
      actionId: action.id,
      actionType: 'notification',
      result: isDryRun ? 'DRY_RUN' : 'EXECUTED',
      durationMs: Date.now() - startTime,
    };
  }

  private executeHumanAction(
    action: HumanAction,
    _incident: DiagnosticsIncident,
    _executionId: string,
    isDryRun: boolean,
  ): ActionResult {
    const startTime = Date.now();
    
    this.logger.log('[Executor] Human action created', {
      actionId: action.id,
      assigneeRole: action.assigneeRole,
      slaMs: action.slaMs,
      dryRun: isDryRun,
    });
    
    // TODO: Integrate with task tracking in Sprint 3
    
    return {
      actionId: action.id,
      actionType: 'human_action',
      result: isDryRun ? 'DRY_RUN' : 'EXECUTED',
      durationMs: Date.now() - startTime,
    };
  }

  private executeEscalationAction(
    action: EscalationAction,
    _incident: DiagnosticsIncident,
    _executionId: string,
    isDryRun: boolean,
  ): ActionResult {
    const startTime = Date.now();
    
    this.logger.log('[Executor] Escalation scheduled', {
      actionId: action.id,
      delayMs: action.delayMs,
      toSeverity: action.toSeverity,
      dryRun: isDryRun,
    });
    
    // TODO: Integrate with EscalationService in Sprint 3
    
    return {
      actionId: action.id,
      actionType: 'escalation',
      result: isDryRun ? 'DRY_RUN' : 'EXECUTED',
      durationMs: Date.now() - startTime,
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private generateExecutionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `exec_${timestamp}_${random}`;
  }

  private determineOverallResult(results: ActionResult[]): ExecutionResultStatus {
    const hasFailure = results.some(r => r.result === 'FAILED');
    const hasSuccess = results.some(r => r.result === 'EXECUTED' || r.result === 'DRY_RUN');
    
    if (hasFailure && hasSuccess) {
      return 'PARTIAL';
    }
    
    if (hasFailure) {
      return 'FAILED';
    }
    
    return 'SUCCESS';
  }

  // ============================================================================
  // OVERRIDE GETTERS (for other services to check)
  // ============================================================================

  /**
   * Get TTL multiplier for a namespace
   */
  getTTLMultiplier(namespace: CacheNamespace): number {
    return this.ttlMultipliers.get(namespace) ?? 1.0;
  }

  /**
   * Get timeout multiplier for a dependency
   */
  getTimeoutMultiplier(dependency: DependencyName): number {
    return this.timeoutMultipliers.get(dependency) ?? 1.0;
  }

  /**
   * Get stale serve override for a namespace
   */
  getStaleServeOverride(namespace: CacheNamespace): boolean | undefined {
    return this.staleServeOverrides.get(namespace);
  }

  /**
   * Get rate limit factor for a tenant
   */
  getRateLimitFactor(tenantId: string): number {
    return this.rateLimitOverrides.get(tenantId)?.factor ?? 1.0;
  }

  // ============================================================================
  // TEST HELPERS
  // ============================================================================

  /**
   * Clear all overrides (for testing)
   */
  clearOverrides(): void {
    this.ttlMultipliers.clear();
    this.timeoutMultipliers.clear();
    this.staleServeOverrides.clear();
    this.rateLimitOverrides.clear();
  }
}
