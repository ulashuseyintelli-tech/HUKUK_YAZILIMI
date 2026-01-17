/**
 * Action Policy Guard Service
 * 
 * Phase 7B - Sprint 2 - Task 2.1
 * 
 * Sistemin "fiziği" - auto-action'ların çalışıp çalışmayacağını belirler.
 * 
 * Soru: "Yetkisi var mı?" değil, "Şu an yapmalı mı?"
 * 
 * Kontroller:
 * 1. Value limits (maxTtlMs, maxMultiplier, maxValue)
 * 2. Namespace/Role/Tenant allowlist
 * 3. Cooldown (aynı action türü için bekleme süresi)
 * 4. Idempotency (aynı incident+action tekrar çalışmasın)
 * 
 * @see .kiro/specs/ops-playbook/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  AutoAction,
  SafetyPolicy,
  PolicyCheckResult,
  IdempotencyCheckResult,
  CooldownCheckResult,
  ValueLimitCheckResult,
  AllowlistCheckResult,
  ExtendCacheTTLParams,
  IncreaseTimeoutParams,
  ReduceRateLimitParams,
} from './playbook.types';
import { DiagnosticsIncident } from '../diagnostics.types';

// ============================================================================
// EXECUTION RECORD (for idempotency + cooldown)
// ============================================================================

interface ExecutionRecord {
  incidentId: string;
  actionId: string;
  executionId: string;
  actionType: string;
  tenantId: string;
  executedAt: number;
}

// ============================================================================
// ACTION POLICY GUARD SERVICE
// ============================================================================

@Injectable()
export class ActionPolicyGuard {
  private readonly logger = new Logger(ActionPolicyGuard.name);
  
  // Execution history for idempotency check
  private readonly executionHistory = new Map<string, ExecutionRecord>();
  
  // Cooldown tracking per action type per tenant
  private readonly cooldownTracker = new Map<string, number>();
  
  // Max history size
  private readonly MAX_HISTORY_SIZE = 10000;


  /**
   * Check if action is allowed by safety policy
   * 
   * Tüm kontroller geçmeli. Biri bile fail ederse action REJECT.
   */
  checkPolicy(
    action: AutoAction,
    incident: DiagnosticsIncident,
    context: { executionId: string; role: string },
  ): PolicyCheckResult {
    const policy = action.safetyPolicy;
    
    // 1. Idempotency check
    const idempotency = this.checkIdempotency(incident.id, action.id);
    
    // 2. Cooldown check
    const cooldown = this.checkCooldown(
      action.action,
      incident.tenantId,
      policy.cooldownMs,
    );
    
    // 3. Value limits check
    const valueLimits = this.checkValueLimits(action, policy);
    
    // 4. Allowlist check
    const allowlist = this.checkAllowlist(action, policy, incident.tenantId, context.role);
    
    // Aggregate result
    const allPassed = 
      idempotency.passed && 
      cooldown.passed && 
      valueLimits.passed && 
      allowlist.passed;
    
    const result: PolicyCheckResult = {
      allowed: allPassed,
      checks: {
        idempotency,
        cooldown,
        valueLimits,
        allowlist,
      },
    };
    
    // Build rejection reason if not allowed
    if (!allPassed) {
      const reasons: string[] = [];
      
      if (!idempotency.passed) {
        reasons.push(`Idempotency: already executed (${idempotency.previousExecutionId})`);
      }
      if (!cooldown.passed) {
        reasons.push(`Cooldown: ${cooldown.remainingMs}ms remaining`);
      }
      if (!valueLimits.passed) {
        reasons.push(`Value limits: ${valueLimits.violations.join(', ')}`);
      }
      if (!allowlist.passed) {
        const denials: string[] = [];
        if (!allowlist.namespaceAllowed) denials.push('namespace');
        if (!allowlist.roleAllowed) denials.push('role');
        if (!allowlist.tenantAllowed) denials.push('tenant');
        reasons.push(`Allowlist denied: ${denials.join(', ')}`);
      }
      
      result.reason = reasons.join('; ');
      
      this.logger.warn('[PolicyGuard] Action rejected', {
        actionId: action.id,
        actionType: action.action,
        incidentId: incident.id,
        reason: result.reason,
      });
    }
    
    return result;
  }

  /**
   * Check idempotency - same incident_id + action_id should not execute twice
   */
  checkIdempotency(incidentId: string, actionId: string): IdempotencyCheckResult {
    const key = this.buildIdempotencyKey(incidentId, actionId);
    const existing = this.executionHistory.get(key);
    
    if (existing) {
      return {
        passed: false,
        alreadyExecuted: true,
        previousExecutionId: existing.executionId,
      };
    }
    
    return {
      passed: true,
      alreadyExecuted: false,
    };
  }

  /**
   * Check cooldown - action type should not execute too frequently for same tenant
   */
  checkCooldown(
    actionType: string,
    tenantId: string,
    cooldownMs: number,
  ): CooldownCheckResult {
    const key = this.buildCooldownKey(actionType, tenantId);
    const lastExecution = this.cooldownTracker.get(key);
    
    if (!lastExecution) {
      return {
        passed: true,
        cooldownActive: false,
      };
    }
    
    const elapsed = Date.now() - lastExecution;
    const remaining = cooldownMs - elapsed;
    
    if (remaining > 0) {
      return {
        passed: false,
        cooldownActive: true,
        remainingMs: remaining,
        lastExecutionAt: new Date(lastExecution).toISOString(),
      };
    }
    
    return {
      passed: true,
      cooldownActive: false,
    };
  }


  /**
   * Check value limits - params should not exceed policy limits
   */
  checkValueLimits(action: AutoAction, policy: SafetyPolicy): ValueLimitCheckResult {
    const violations: string[] = [];
    const params = action.params;
    
    // Check maxTtlMs - TTL is derived from multiplier, checked via maxMultiplier
    // No direct TTL param in current actions
    
    // Check maxMultiplier
    if (policy.maxMultiplier !== undefined) {
      if (action.action === 'extend_cache_ttl') {
        const p = params as ExtendCacheTTLParams;
        if (p.multiplier > policy.maxMultiplier) {
          violations.push(`multiplier ${p.multiplier} exceeds max ${policy.maxMultiplier}`);
        }
      }
      if (action.action === 'increase_timeout') {
        const p = params as IncreaseTimeoutParams;
        if (p.multiplier > policy.maxMultiplier) {
          violations.push(`multiplier ${p.multiplier} exceeds max ${policy.maxMultiplier}`);
        }
      }
    }
    
    // Check maxValue (for reduce_rate_limit factor)
    if (policy.maxValue !== undefined) {
      if (action.action === 'reduce_rate_limit') {
        const p = params as ReduceRateLimitParams;
        // Factor should be between 0 and 1, lower is more aggressive
        if (p.factor < 0.1) {
          violations.push(`factor ${p.factor} is too aggressive (min 0.1)`);
        }
      }
    }
    
    // Multiplier sanity check (never allow > 10x)
    if (action.action === 'extend_cache_ttl' || action.action === 'increase_timeout') {
      const p = params as { multiplier: number };
      if (p.multiplier > 10) {
        violations.push(`multiplier ${p.multiplier} exceeds hard limit 10`);
      }
      if (p.multiplier < 1) {
        violations.push(`multiplier ${p.multiplier} must be >= 1`);
      }
    }
    
    return {
      passed: violations.length === 0,
      violations,
    };
  }

  /**
   * Check allowlist - namespace, role, tenant must be in allowed lists
   */
  checkAllowlist(
    action: AutoAction,
    policy: SafetyPolicy,
    tenantId: string,
    role: string,
  ): AllowlistCheckResult {
    let namespaceAllowed = true;
    let roleAllowed = true;
    let tenantAllowed = true;
    
    // Check namespace allowlist
    if (policy.allowedNamespaces && policy.allowedNamespaces.length > 0) {
      const namespace = this.extractNamespace(action);
      if (namespace) {
        namespaceAllowed = policy.allowedNamespaces.includes(namespace);
      }
    }
    
    // Check role allowlist
    if (policy.allowedRoles && policy.allowedRoles.length > 0) {
      roleAllowed = policy.allowedRoles.includes(role);
    }
    
    // Check tenant allowlist
    if (policy.allowedTenants && policy.allowedTenants.length > 0) {
      tenantAllowed = 
        policy.allowedTenants.includes('*') || 
        policy.allowedTenants.includes(tenantId);
    }
    
    return {
      passed: namespaceAllowed && roleAllowed && tenantAllowed,
      namespaceAllowed,
      roleAllowed,
      tenantAllowed,
    };
  }

  /**
   * Record successful execution (for idempotency + cooldown tracking)
   */
  recordExecution(
    incidentId: string,
    actionId: string,
    executionId: string,
    actionType: string,
    tenantId: string,
  ): void {
    // Record for idempotency
    const idempotencyKey = this.buildIdempotencyKey(incidentId, actionId);
    this.executionHistory.set(idempotencyKey, {
      incidentId,
      actionId,
      executionId,
      actionType,
      tenantId,
      executedAt: Date.now(),
    });
    
    // Record for cooldown
    const cooldownKey = this.buildCooldownKey(actionType, tenantId);
    this.cooldownTracker.set(cooldownKey, Date.now());
    
    // Cleanup old entries if needed
    this.cleanupIfNeeded();
    
    this.logger.debug('[PolicyGuard] Execution recorded', {
      incidentId,
      actionId,
      executionId,
      actionType,
    });
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Extract namespace from action params
   */
  private extractNamespace(action: AutoAction): string | null {
    const params = action.params;
    
    if (action.action === 'extend_cache_ttl') {
      return (params as ExtendCacheTTLParams).namespace;
    }
    if (action.action === 'enable_stale_serve') {
      return (params as { namespace: string }).namespace;
    }
    
    return null;
  }

  /**
   * Build idempotency key from incident_id + action_id
   */
  private buildIdempotencyKey(incidentId: string, actionId: string): string {
    return `idem:${incidentId}:${actionId}`;
  }

  /**
   * Build cooldown key from action_type + tenant_id
   */
  private buildCooldownKey(actionType: string, tenantId: string): string {
    return `cool:${actionType}:${tenantId}`;
  }

  /**
   * Cleanup old entries if history exceeds max size
   */
  private cleanupIfNeeded(): void {
    if (this.executionHistory.size <= this.MAX_HISTORY_SIZE) {
      return;
    }
    
    // Find oldest entries and remove them
    const entries = Array.from(this.executionHistory.entries())
      .sort((a, b) => a[1].executedAt - b[1].executedAt);
    
    const toRemove = entries.slice(0, entries.length - this.MAX_HISTORY_SIZE);
    
    for (const [key] of toRemove) {
      this.executionHistory.delete(key);
    }
    
    this.logger.debug('[PolicyGuard] Cleaned up old execution records', {
      removed: toRemove.length,
      remaining: this.executionHistory.size,
    });
  }

  // ============================================================================
  // TEST HELPERS
  // ============================================================================

  /**
   * Clear all state (for testing only)
   */
  clear(): void {
    this.executionHistory.clear();
    this.cooldownTracker.clear();
  }

  /**
   * Get current stats (for diagnostics)
   */
  getStats(): {
    executionHistorySize: number;
    cooldownTrackerSize: number;
  } {
    return {
      executionHistorySize: this.executionHistory.size,
      cooldownTrackerSize: this.cooldownTracker.size,
    };
  }
}