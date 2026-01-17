/**
 * Ops Playbook System - Type Definitions
 * 
 * Phase 7B - Sprint 1
 * 
 * Incident'ları otomatik aksiyonlara, bildirimlere ve escalation'lara
 * bağlayan operasyonel playbook sistemi.
 * 
 * @see .kiro/specs/ops-playbook/design.md
 */

import { IncidentType, IncidentSeverity } from '../diagnostics.types';

// ============================================================================
// PLAYBOOK TYPES
// ============================================================================

/**
 * Playbook - incident'a karşılık çalışacak aksiyon dizisi
 */
export interface Playbook {
  id: string;
  version: string;
  name: string;
  description: string;
  match: PlaybookMatchCriteria;
  when?: WhenClause[];
  priority: number;
  dryRun: boolean;
  actions: PlaybookAction[];
}

/**
 * Playbook matching criteria
 */
export interface PlaybookMatchCriteria {
  incidentType: IncidentType;
  severity: IncidentSeverity[];
  tenantScope: string | string[];  // "*" for all tenants
}

/**
 * When clause - whitelist DSL only
 * Arbitrary expressions YASAK
 */
export interface WhenClause {
  field: WhenClauseField;
  operator: WhenClauseOperator;
  value?: string | number | boolean;
  values?: (string | number)[];
}

/**
 * Allowed fields for when clauses (whitelist)
 */
export type WhenClauseField =
  | 'severity'
  | 'incident_type'
  | 'tenant_id'
  | 'evidence.breakerName'
  | 'evidence.metric'
  | 'evidence.value'
  | 'evidence.source';

/**
 * Allowed operators for when clauses
 */
export type WhenClauseOperator = 'eq' | 'ne' | 'in' | 'not_in' | 'gt' | 'lt' | 'gte' | 'lte';

/**
 * Whitelist of allowed when clause fields
 */
export const ALLOWED_WHEN_FIELDS: WhenClauseField[] = [
  'severity',
  'incident_type',
  'tenant_id',
  'evidence.breakerName',
  'evidence.metric',
  'evidence.value',
  'evidence.source',
];


// ============================================================================
// ACTION TYPES
// ============================================================================

export type ActionType = 'notification' | 'auto_action' | 'human_action' | 'escalation';

/**
 * Base action interface
 */
export interface PlaybookActionBase {
  id: string;
  type: ActionType;
}

/**
 * Union type for all action types
 */
export type PlaybookAction = 
  | NotificationAction 
  | AutoAction 
  | HumanAction 
  | EscalationAction;

/**
 * Notification action
 */
export interface NotificationAction extends PlaybookActionBase {
  type: 'notification';
  channel: NotificationChannelType;
  template: string;
  recipients?: string[];
}

/**
 * Auto-action (GUARDED + LEASED + IDEMPOTENT)
 */
export interface AutoAction extends PlaybookActionBase {
  type: 'auto_action';
  action: AutoActionType;
  params: AutoActionParams;
  safetyPolicy: SafetyPolicy;
  lease?: LeaseConfig;
}

/**
 * Human action (requires manual intervention)
 */
export interface HumanAction extends PlaybookActionBase {
  type: 'human_action';
  assigneeRole: string;
  slaMs: number;
  description: string;
}

/**
 * Escalation action (time-based severity upgrade)
 */
export interface EscalationAction extends PlaybookActionBase {
  type: 'escalation';
  delayMs: number;
  toSeverity: IncidentSeverity;
  maxEscalations: number;
}

// ============================================================================
// AUTO-ACTION TYPES (Supported Actions)
// ============================================================================

/**
 * Supported auto-action types
 */
export type AutoActionType =
  | 'extend_cache_ttl'
  | 'force_circuit_half_open'
  | 'enable_stale_serve'
  | 'increase_timeout'
  | 'reduce_rate_limit';

/**
 * Auto-action parameters union
 */
export type AutoActionParams =
  | ExtendCacheTTLParams
  | ForceCircuitHalfOpenParams
  | EnableStaleServeParams
  | IncreaseTimeoutParams
  | ReduceRateLimitParams;

export interface ExtendCacheTTLParams {
  namespace: string;
  multiplier: number;
}

export interface ForceCircuitHalfOpenParams {
  dependency: string;
}

export interface EnableStaleServeParams {
  namespace: string;
  enabled: boolean;
}

export interface IncreaseTimeoutParams {
  dependency: string;
  multiplier: number;
}

export interface ReduceRateLimitParams {
  tenantId: string;
  factor: number;  // 0.5 = half the limit
}

// ============================================================================
// SAFETY POLICY (KRİTİK)
// ============================================================================

/**
 * Safety policy for auto-actions
 * 
 * Her auto-action için ZORUNLU.
 * Bu olmadan auto-action çalışamaz.
 */
export interface SafetyPolicy {
  /** Maximum TTL value (ms) */
  maxTtlMs?: number;
  
  /** Maximum multiplier value */
  maxMultiplier?: number;
  
  /** Maximum absolute value */
  maxValue?: number;
  
  /** Allowed cache namespaces */
  allowedNamespaces?: string[];
  
  /** Allowed roles that can trigger */
  allowedRoles?: string[];
  
  /** Allowed tenant IDs ("*" for all) */
  allowedTenants?: string[];
  
  /** Cooldown period (ms) - ZORUNLU */
  cooldownMs: number;
}

/**
 * Default safety policy values
 */
export const DEFAULT_SAFETY_POLICY: Partial<SafetyPolicy> = {
  maxTtlMs: 300000,        // 5 minutes max
  maxMultiplier: 3,        // 3x max
  cooldownMs: 600000,      // 10 minutes cooldown
};


// ============================================================================
// LEASE TYPES
// ============================================================================

/**
 * Lease configuration for temporary effects
 */
export interface LeaseConfig {
  /** Lease duration (ms) */
  durationMs: number;
  
  /** Auto-rollback when lease expires */
  autoRollback: boolean;
  
  /** Rollback action name */
  rollbackAction?: string;
}

/**
 * Active lease record
 */
export interface Lease {
  id: string;
  actionId: string;
  incidentId: string;
  playbookId: string;
  tenantId: string;
  actionType: AutoActionType;
  params: Record<string, unknown>;
  originalState: Record<string, unknown>;  // For rollback
  createdAt: string;
  expiresAt: string;
  status: LeaseStatus;
  rollbackAction?: string;
}

export type LeaseStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ROLLED_BACK';

/**
 * Lease constraints
 */
export const LEASE_CONSTRAINTS = {
  MAX_DURATION_MS: 24 * 60 * 60 * 1000,  // 24 hours max
  MIN_DURATION_MS: 60 * 1000,             // 1 minute min
} as const;

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export type NotificationChannelType = 'console' | 'webhook' | 'slack' | 'email';

export interface NotificationChannel {
  type: NotificationChannelType;
  config: WebhookConfig | SlackConfig | EmailConfig | ConsoleConfig;
}

export interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
  method?: 'POST' | 'PUT';
  timeoutMs?: number;
}

export interface SlackConfig {
  webhookUrl: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;
}

export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  from: string;
  to: string[];
}

export interface ConsoleConfig {
  prefix?: string;
}

export interface Notification {
  id: string;
  channel: NotificationChannelType;
  template: string;
  variables: TemplateVariables;
  incidentId: string;
  playbookId: string;
  sentAt?: string;
  status: NotificationStatus;
  retryCount: number;
  error?: string | undefined;
  nextRetryAt?: string;
}

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface TemplateVariables {
  // Core fields
  incident_type?: string;
  severity?: string;
  tenant_id?: string;
  tenantId?: string;
  description?: string;
  recommendation?: string;
  started_at?: string;
  evidence?: Record<string, unknown>;
  
  // Circuit breaker
  serviceName?: string;
  dependencyName?: string;
  errorRate?: string | number;
  lastError?: string;
  
  // Error rate
  threshold?: string | number;
  affectedOperation?: string;
  
  // Rate limit
  endpoint?: string;
  currentRps?: string | number;
  rateLimit?: string | number;
  
  // Degraded service
  currentLatency?: string | number;
  normalLatency?: string | number;
  affectedEndpoint?: string;
  
  // SLO
  sloName?: string;
  target?: string | number;
  current?: string | number;
  remainingBudget?: string | number;
  
  // Escalation
  escalationLevel?: string | number;
  incidentId?: string;
  duration?: string | number;
  previousNotifications?: string | number;
  
  // Lease
  leaseId?: string;
  actionType?: string;
  remainingTime?: string;
  autoRollback?: string | boolean;
  leaseDuration?: string;
  
  // Action
  playbookId?: string;
  result?: string;
  rejectionReason?: string;
  
  // Generic
  message?: string;
  [key: string]: unknown;
}

// ============================================================================
// EXECUTION TYPES
// ============================================================================

export interface ExecutionOptions {
  /** Dry-run mode: notification + audit only, no auto-action */
  dryRun?: boolean;
  
  /** Trigger source */
  triggeredBy: 'auto' | 'manual';
  
  /** User ID (for manual triggers) */
  userId?: string;
}

export interface ExecutionResult {
  executionId: string;
  playbookId: string;
  playbookVersion: string;
  incidentId: string;
  tenantId: string;
  triggeredAt: string;
  completedAt: string;
  dryRun: boolean;
  result: ExecutionResultStatus;
  actions: ActionResult[];
}

export type ExecutionResultStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED';

export interface ActionResult {
  actionId: string;
  actionType: ActionType;
  result: ActionResultStatus;
  rejectionReason?: string;
  leaseId?: string;
  durationMs: number;
  error?: string;
}

export type ActionResultStatus = 'EXECUTED' | 'SKIPPED' | 'FAILED' | 'REJECTED' | 'DRY_RUN';


// ============================================================================
// POLICY CHECK TYPES
// ============================================================================

export interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;
  checks: {
    idempotency: IdempotencyCheckResult;
    cooldown: CooldownCheckResult;
    valueLimits: ValueLimitCheckResult;
    allowlist: AllowlistCheckResult;
  };
}

export interface IdempotencyCheckResult {
  passed: boolean;
  alreadyExecuted: boolean;
  previousExecutionId?: string;
}

export interface CooldownCheckResult {
  passed: boolean;
  cooldownActive: boolean;
  remainingMs?: number;
  lastExecutionAt?: string;
}

export interface ValueLimitCheckResult {
  passed: boolean;
  violations: string[];
}

export interface AllowlistCheckResult {
  passed: boolean;
  namespaceAllowed: boolean;
  roleAllowed: boolean;
  tenantAllowed: boolean;
}

// ============================================================================
// AUDIT TYPES
// ============================================================================

export interface ExecutionAuditEntry {
  id: string;
  timestamp: string;
  executionId: string;
  playbookId: string;
  playbookVersion: string;
  incidentId: string;
  tenantId: string;
  triggeredBy: 'auto' | 'manual';
  userId?: string;
  dryRun: boolean;
  result: ExecutionResultStatus;
  durationMs: number;
}

export interface ActionAuditEntry {
  id: string;
  timestamp: string;
  executionId: string;
  actionId: string;
  actionType: ActionType;
  params?: Record<string, unknown>;
  result: ActionResultStatus;
  rejectionReason?: string;
  leaseId?: string;
  durationMs: number;
  error?: string;
}

export interface LeaseAuditEntry {
  id: string;
  timestamp: string;
  leaseId: string;
  event: LeaseAuditEvent;
  actionType: AutoActionType;
  incidentId: string;
  tenantId: string;
  originalState?: Record<string, unknown>;
  revokedBy?: string;
}

export type LeaseAuditEvent = 'CREATED' | 'EXPIRED' | 'REVOKED' | 'ROLLED_BACK';

// ============================================================================
// ESCALATION TYPES
// ============================================================================

export interface EscalationTimer {
  id: string;
  incidentId: string;
  playbookId: string;
  actionId: string;
  tenantId: string;
  fromSeverity: IncidentSeverity;
  toSeverity: IncidentSeverity;
  scheduledAt: string;
  dueAt: string;
  status: EscalationTimerStatus;
  escalationCount: number;
  maxEscalations: number;
}

export type EscalationTimerStatus = 'PENDING' | 'EXECUTED' | 'CANCELLED';

// ============================================================================
// VALIDATION TYPES
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface SchemaValidationResult extends ValidationResult {
  zodErrors?: unknown;
}

export interface SemanticValidationResult extends ValidationResult {
  warnings?: ValidationError[];
}

export interface EscalationLoop {
  playbooks: string[];
  cycle: string[];
}

// ============================================================================
// PLAYBOOK MATCH TYPES
// ============================================================================

export interface PlaybookMatch {
  playbook: Playbook;
  matchScore: number;
  matchedCriteria: {
    incidentType: boolean;
    severity: boolean;
    tenantScope: boolean;
    whenClauses: boolean;
  };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isNotificationAction(action: PlaybookAction): action is NotificationAction {
  return action.type === 'notification';
}

export function isAutoAction(action: PlaybookAction): action is AutoAction {
  return action.type === 'auto_action';
}

export function isHumanAction(action: PlaybookAction): action is HumanAction {
  return action.type === 'human_action';
}

export function isEscalationAction(action: PlaybookAction): action is EscalationAction {
  return action.type === 'escalation';
}

export function isValidActionType(type: string): type is ActionType {
  return ['notification', 'auto_action', 'human_action', 'escalation'].includes(type);
}

export function isValidAutoActionType(type: string): type is AutoActionType {
  return [
    'extend_cache_ttl',
    'force_circuit_half_open',
    'enable_stale_serve',
    'increase_timeout',
    'reduce_rate_limit',
  ].includes(type);
}

export function isValidWhenClauseField(field: string): field is WhenClauseField {
  return ALLOWED_WHEN_FIELDS.includes(field as WhenClauseField);
}
