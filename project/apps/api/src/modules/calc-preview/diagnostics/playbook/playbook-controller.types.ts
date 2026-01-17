/**
 * Playbook Controller Types
 * 
 * Phase 7B - Sprint 3 - Task 3.4
 * 
 * Request/Response DTOs for PlaybookController
 */

import { Playbook, PlaybookAction, SafetyPolicy, Lease, ExecutionResult } from './playbook.types';
import { IncidentSeverity } from '../diagnostics.types';

// ============================================================================
// ENUMS
// ============================================================================

export type PlaybookMode = 'DRY_RUN' | 'LIVE';
export type PauseScope = 'GLOBAL' | 'INCIDENT' | 'TENANT';
export type PlaybookState = 'ACTIVE' | 'PAUSED' | 'DISABLED' | 'ESCALATED' | 'EXHAUSTED';

// ============================================================================
// LIST RESPONSE
// ============================================================================

export interface PlaybookListItem {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  mode: PlaybookMode;
  state: PlaybookState;
  lastUpdatedAt: string;
  tags: string[];
  matchCriteria: {
    incidentType: string;
    severities: IncidentSeverity[];
  };
}

export interface PlaybookListResponse {
  playbooks: PlaybookListItem[];
  total: number;
}

// ============================================================================
// DETAIL RESPONSE
// ============================================================================

export interface PlaybookDetailResponse {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  mode: PlaybookMode;
  state: PlaybookState;
  
  // Match criteria
  match: {
    incidentType: string;
    severities: IncidentSeverity[];
    tenantScope: string | string[];
  };
  
  // Actions summary
  actions: {
    total: number;
    notifications: number;
    autoActions: number;
    humanActions: number;
    escalations: number;
  };
  
  // Guardrails
  guardrails: {
    safetyPolicies: SafetyPolicy[];
    maxEscalations: number;
    cooldownMs: number;
  };
  
  // Stats
  stats: {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    lastExecutedAt?: string | undefined;
    activeLeases: number;
  };
  
  // Timestamps
  createdAt: string;
  lastUpdatedAt: string;
}

// ============================================================================
// STATE CHANGE RESPONSE
// ============================================================================

export interface PlaybookStateResponse {
  ok: boolean;
  playbookId: string;
  previousState: {
    enabled: boolean;
    mode: PlaybookMode;
    state: PlaybookState;
  };
  newState: {
    enabled: boolean;
    mode: PlaybookMode;
    state: PlaybookState;
  };
  auditId: string;
  timestamp: string;
}

// ============================================================================
// EVALUATE RESPONSE
// ============================================================================

export interface EvaluateResponse {
  playbookId: string;
  incidentId: string;
  
  // Match result
  matched: boolean;
  matchScore: number;
  matchedCriteria: {
    incidentType: boolean;
    severity: boolean;
    tenantScope: boolean;
    whenClauses: boolean;
  };
  
  // Planned actions
  plannedActions: PlannedAction[];
  
  // Policy pre-check
  wouldBlock: {
    blocked: boolean;
    reasons: string[];
  };
  
  // Estimates
  estimatedDuration: number; // Total lease duration
  estimatedNotifications: number;
  
  // Dry run output
  dryRunOutput?: {
    notifications: string[];
    actions: string[];
  };
}

export interface PlannedAction {
  actionId: string;
  type: 'notification' | 'auto_action' | 'human_action' | 'escalation';
  description: string;
  wouldExecute: boolean;
  blockReason?: string | undefined;
}

// ============================================================================
// RUN RESPONSE
// ============================================================================

export interface RunResponse {
  ok: boolean;
  executionId: string;
  playbookId: string;
  incidentId: string;
  mode: PlaybookMode;
  status: 'ACCEPTED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  
  // Execution result (if sync)
  result?: ExecutionResult;
  
  // For async polling
  pollUrl?: string;
  
  auditId: string;
  timestamp: string;
}

// ============================================================================
// HEALTH RESPONSE
// ============================================================================

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  
  registry: {
    loaded: boolean;
    count: number;
    lastReload?: string | undefined;
    errors: string[];
  };
  
  matcher: {
    operational: boolean;
  };
  
  escalation: {
    jobRunning: boolean;
    pendingTimers: number;
    executedLast24h: number;
  };
  
  notification: {
    channels: {
      console: 'ok' | 'not_configured' | 'error';
      webhook: 'ok' | 'not_configured' | 'error';
      slack: 'ok' | 'not_configured' | 'error';
      email: 'ok' | 'not_configured' | 'error';
    };
    retryQueue: number;
    deadLetter: number;
  };
  
  leases: {
    active: number;
    expiringSoon: number; // Within 5 minutes
  };
  
  metrics: {
    executionsLast24h: number;
    successRate: number;
  };
}

// ============================================================================
// LEASE RESPONSE
// ============================================================================

export interface LeaseResponse {
  ok: boolean;
  lease: {
    id: string;
    actionId: string;
    incidentId: string;
    playbookId: string;
    tenantId: string;
    actionType: string;
    status: string;
    createdAt: string;
    expiresAt: string;
    remainingMs: number;
  };
  auditId?: string | undefined;
}

// ============================================================================
// INCIDENT RESPONSES
// ============================================================================

export interface AcknowledgeResponse {
  ok: boolean;
  incidentId: string;
  acknowledgedBy: string;
  acknowledgedAt: string;
  slaTimerStarted: boolean;
  slaDeadline?: string | undefined;
  auditId: string;
}

export interface ResolveResponse {
  ok: boolean;
  incidentId: string;
  resolvedBy: string;
  resolvedAt: string;
  resolutionNote: string;
  
  // Cleanup actions
  escalationsCancelled: number;
  leasesRevoked: number;
  
  // SLA compliance
  slaCompliance?: {
    met: boolean;
    targetMs: number;
    actualMs: number;
  } | undefined;
  
  auditId: string;
}

// ============================================================================
// AUDIT RESPONSE
// ============================================================================

export interface AuditResponse {
  playbookId: string;
  entries: AuditEntry[];
  total: number;
  hasMore: boolean;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  type: 'execution' | 'state_change' | 'action' | 'lease';
  userId?: string;
  details: Record<string, unknown>;
}

// ============================================================================
// ERROR RESPONSES
// ============================================================================

export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// REQUEST CONTEXT
// ============================================================================

export interface RequestContext {
  tenantId?: string;
  userId?: string;
  idempotencyKey?: string;
}

export interface PauseContext extends RequestContext {
  scope: PauseScope;
  incidentId?: string;
}

export interface RunContext extends RequestContext {
  mode: PlaybookMode;
}

export interface AuditQueryContext {
  limit?: number;
  since?: Date;
  tenantId?: string;
}
