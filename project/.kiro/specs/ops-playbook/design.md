# Design Document: Ops Playbook System

## Overview

Phase 7B: Incident'ları otomatik aksiyonlara, bildirimlere ve escalation'lara bağlayan operasyonel playbook sistemi.

**Temel Prensipler:**
- Incident → Playbook → Action/Notification/Escalation
- Auto-action'lar GUARDED + LEASED + IDEMPOTENT
- Playbook YAML = kod gibi yönetilir (schema + semantic validation)
- Self-observability: playbook sistemi kendi metriklerini üretir

**Önceki Phase:** Phase 7A Self-serve Diagnostics (incident detection, evidence, recommendation)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PlaybookController                                 │
│  GET /playbooks  │  POST /trigger  │  POST /acknowledge  │  GET /leases    │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                        ┌───────────▼───────────┐
                        │  DiagnosticsRBACGuard │ ← Tenant isolation
                        └───────────┬───────────┘
                                    │
                        ┌───────────▼───────────┐
                        │   PlaybookService     │
                        └───────────┬───────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────────┐
        │                           │                               │
┌───────▼───────┐       ┌───────────▼───────────┐       ┌───────────▼───────────┐
│ PlaybookReg   │       │   PlaybookMatcher     │       │  PlaybookAuditSvc     │
│ (YAML load)   │       │   (incident→playbook) │       │  (immutable log)      │
└───────┬───────┘       └───────────┬───────────┘       └───────────────────────┘
        │                           │
        │               ┌───────────▼───────────┐
        │               │   ActionExecutor      │
        │               └───────────┬───────────┘
        │                           │
        │       ┌───────────────────┼───────────────────┐
        │       │                   │                   │
        │ ┌─────▼─────┐   ┌─────────▼─────────┐   ┌─────▼─────┐
        │ │ Notifier  │   │ ActionPolicyGuard │   │ Escalator │
        │ │ (webhook) │   │ (safety check)    │   │ (timer)   │
        │ └───────────┘   └─────────┬─────────┘   └───────────┘
        │                           │
        │               ┌───────────▼───────────┐
        │               │  ActionLeaseManager   │
        │               │  (temporary effects)  │
        │               └───────────┬───────────┘
        │                           │
        │               ┌───────────▼───────────┐
        │               │  Target Services      │
        │               │  (CircuitBreaker,     │
        │               │   VersionedCache)     │
        │               └───────────────────────┘
        │
┌───────▼───────────────────────────────────────────────────────────────────┐
│                         PlaybookYAMLValidator                              │
│  Schema (Zod)  │  Semantic (whitelist DSL)  │  Loop Detection             │
└───────────────────────────────────────────────────────────────────────────┘
```


## Components and Interfaces

### PlaybookRegistry

Playbook YAML dosyalarını yükleyen ve yöneten bileşen.

```typescript
@Injectable()
export class PlaybookRegistry {
  constructor(
    private readonly validator: PlaybookYAMLValidator,
  ) {}

  /**
   * Load playbooks from directory
   * @throws PlaybookValidationError if any playbook fails validation
   */
  loadPlaybooks(directory: string): void;

  /**
   * Get playbook by ID
   */
  getPlaybook(playbookId: string): Playbook | undefined;

  /**
   * Get all active playbooks
   */
  getAllPlaybooks(): Playbook[];

  /**
   * Get playbook version
   */
  getVersion(playbookId: string): string | undefined;

  /**
   * Reload playbooks (hot reload)
   */
  reload(): void;
}
```

### PlaybookYAMLValidator

Schema ve semantic validation yapan bileşen.

```typescript
@Injectable()
export class PlaybookYAMLValidator {
  /**
   * Validate playbook YAML
   * @returns ValidationResult with errors if any
   */
  validate(yaml: string): ValidationResult;

  /**
   * Schema validation (Zod)
   */
  validateSchema(parsed: unknown): SchemaValidationResult;

  /**
   * Semantic validation
   * - Unknown action types → REJECT
   * - Unknown incident types → REJECT
   * - when clause whitelist DSL check
   * - Escalation loop detection
   */
  validateSemantics(playbook: Playbook): SemanticValidationResult;

  /**
   * Detect escalation loops
   */
  detectEscalationLoops(playbooks: Playbook[]): EscalationLoop[];
}
```

### PlaybookMatcher

Incident'ı uygun playbook'a eşleştiren bileşen.

```typescript
@Injectable()
export class PlaybookMatcher {
  constructor(
    private readonly registry: PlaybookRegistry,
  ) {}

  /**
   * Find matching playbook for incident
   * Priority: tenant-specific > global
   */
  findMatch(incident: DiagnosticsIncident): PlaybookMatch | null;

  /**
   * Check if playbook matches incident
   */
  matches(playbook: Playbook, incident: DiagnosticsIncident): boolean;

  /**
   * Evaluate when clause (whitelist DSL only)
   */
  evaluateWhenClause(when: WhenClause, incident: DiagnosticsIncident): boolean;
}
```

### ActionExecutor

Playbook aksiyonlarını çalıştıran bileşen.

```typescript
@Injectable()
export class ActionExecutor {
  constructor(
    private readonly policyGuard: ActionPolicyGuard,
    private readonly leaseManager: ActionLeaseManager,
    private readonly notifier: NotificationService,
    private readonly escalator: EscalationService,
    private readonly audit: PlaybookAuditService,
    private readonly circuitBreaker: CalcPreviewCircuitBreakerService,
    private readonly cache: VersionedCacheService,
  ) {}

  /**
   * Execute playbook actions
   * @param dryRun - If true, only notification + audit, no auto-action
   */
  async execute(
    playbook: Playbook,
    incident: DiagnosticsIncident,
    options: ExecutionOptions,
  ): Promise<ExecutionResult>;

  /**
   * Execute single action
   */
  async executeAction(
    action: PlaybookAction,
    incident: DiagnosticsIncident,
    executionId: string,
  ): Promise<ActionResult>;
}
```


### ActionPolicyGuard (KRİTİK)

Auto-action'lar için safety policy kontrolü yapan bileşen.

```typescript
@Injectable()
export class ActionPolicyGuard {
  /**
   * Check if action is allowed by safety policy
   * @returns PolicyCheckResult with allowed/rejected and reason
   */
  checkPolicy(
    action: AutoAction,
    incident: DiagnosticsIncident,
    policy: SafetyPolicy,
  ): PolicyCheckResult;

  /**
   * Check idempotency (same incident_id + action_id)
   */
  checkIdempotency(incidentId: string, actionId: string): IdempotencyCheckResult;

  /**
   * Check cooldown (action not executed recently)
   */
  checkCooldown(actionType: string, tenantId: string, cooldownMs: number): CooldownCheckResult;

  /**
   * Check value limits (max_ttl, max_multiplier)
   */
  checkValueLimits(action: AutoAction, policy: SafetyPolicy): ValueLimitCheckResult;

  /**
   * Check namespace/role allowlist
   */
  checkAllowlist(action: AutoAction, policy: SafetyPolicy): AllowlistCheckResult;
}
```

### ActionLeaseManager

Geçici etkileri yöneten bileşen (auto-rollback).

```typescript
@Injectable()
export class ActionLeaseManager {
  /**
   * Create lease for temporary action
   */
  createLease(
    action: AutoAction,
    incident: DiagnosticsIncident,
    leaseConfig: LeaseConfig,
  ): Lease;

  /**
   * Get active leases
   */
  getActiveLeases(tenantId?: string): Lease[];

  /**
   * Revoke lease (early rollback)
   */
  revokeLease(leaseId: string): RevokeResult;

  /**
   * Process expired leases (background job)
   * Triggers auto-rollback
   */
  processExpiredLeases(): void;

  /**
   * Execute rollback action
   */
  executeRollback(lease: Lease): RollbackResult;
}
```

### NotificationService

Bildirim gönderen bileşen.

```typescript
@Injectable()
export class NotificationService {
  /**
   * Send notification
   */
  async send(
    channel: NotificationChannel,
    notification: Notification,
  ): Promise<NotificationResult>;

  /**
   * Render template
   */
  renderTemplate(template: string, variables: TemplateVariables): string;

  /**
   * Retry failed notification
   */
  async retry(notificationId: string): Promise<NotificationResult>;
}
```

### EscalationService

Zamanlı escalation yöneten bileşen.

```typescript
@Injectable()
export class EscalationService {
  /**
   * Schedule escalation
   */
  scheduleEscalation(
    incident: DiagnosticsIncident,
    escalation: EscalationConfig,
  ): EscalationTimer;

  /**
   * Cancel escalation (incident resolved)
   */
  cancelEscalation(incidentId: string): void;

  /**
   * Process due escalations (background job)
   */
  processDueEscalations(): void;

  /**
   * Check escalation loop
   */
  checkEscalationLoop(incidentId: string): boolean;
}
```

### PlaybookAuditService

İmmutable audit log servisi.

```typescript
@Injectable()
export class PlaybookAuditService {
  /**
   * Log playbook execution
   */
  logExecution(entry: ExecutionAuditEntry): void;

  /**
   * Log action execution
   */
  logAction(entry: ActionAuditEntry): void;

  /**
   * Log lease creation/expiry/revoke
   */
  logLease(entry: LeaseAuditEntry): void;

  /**
   * Get execution history
   */
  getExecutionHistory(
    tenantId: string,
    playbookId?: string,
    since?: string,
  ): ExecutionAuditEntry[];
}
```


## Data Models

### Playbook YAML Schema

```yaml
# playbooks/circuit-breaker-open.yaml
id: circuit-breaker-open
version: "1.0.0"
name: "Devre Kesici Açık Playbook"
description: "Circuit breaker açıldığında çalışacak playbook"

# Matching criteria
match:
  incident_type: CIRCUIT_BREAKER_OPEN
  severity:
    - WARNING
    - CRITICAL
  tenant_scope: "*"  # or specific tenant IDs

# When clause (whitelist DSL only)
when:
  # Simple field comparisons only
  - field: evidence.breakerName
    operator: in
    values: [rate_provider, tariff_provider]
  - field: severity
    operator: eq
    value: CRITICAL

# Priority (higher = more specific)
priority: 100

# Dry-run mode (notification + audit only)
dry_run: false

# Actions
actions:
  - id: notify-ops
    type: notification
    channel: webhook
    template: circuit_breaker_alert
    
  - id: extend-cache-ttl
    type: auto_action
    action: extend_cache_ttl
    params:
      namespace: rate_provider
      multiplier: 2
    safety_policy:
      max_ttl_ms: 300000
      max_multiplier: 3
      allowed_namespaces: [rate_provider, tariff_provider]
      allowed_roles: [internal-ops, system]
      cooldown_ms: 600000
    lease:
      duration_ms: 900000
      auto_rollback: true
      rollback_action: restore_cache_ttl

  - id: escalate-if-ongoing
    type: escalation
    delay_ms: 1800000  # 30 minutes
    to_severity: CRITICAL
    max_escalations: 2

  - id: human-review
    type: human_action
    assignee_role: internal-ops
    sla_ms: 3600000  # 1 hour
    description: "Bağımlılık servisini kontrol edin"
```

### TypeScript Types

```typescript
// ============================================================================
// PLAYBOOK TYPES
// ============================================================================

export interface Playbook {
  id: string;
  version: string;
  name: string;
  description: string;
  match: PlaybookMatch;
  when?: WhenClause[];
  priority: number;
  dryRun: boolean;
  actions: PlaybookAction[];
}

export interface PlaybookMatch {
  incidentType: IncidentType;
  severity: IncidentSeverity[];
  tenantScope: string | string[];  // "*" for all
}

// Whitelist DSL for when clauses
export interface WhenClause {
  field: string;  // dot notation: evidence.breakerName
  operator: 'eq' | 'ne' | 'in' | 'not_in' | 'gt' | 'lt' | 'gte' | 'lte';
  value?: string | number | boolean;
  values?: (string | number)[];
}

// ============================================================================
// ACTION TYPES
// ============================================================================

export type ActionType = 'notification' | 'auto_action' | 'human_action' | 'escalation';

export interface PlaybookAction {
  id: string;
  type: ActionType;
}

export interface NotificationAction extends PlaybookAction {
  type: 'notification';
  channel: NotificationChannelType;
  template: string;
  recipients?: string[];
}

export interface AutoAction extends PlaybookAction {
  type: 'auto_action';
  action: AutoActionType;
  params: Record<string, unknown>;
  safetyPolicy: SafetyPolicy;
  lease?: LeaseConfig;
}

export interface HumanAction extends PlaybookAction {
  type: 'human_action';
  assigneeRole: string;
  slaMs: number;
  description: string;
}

export interface EscalationAction extends PlaybookAction {
  type: 'escalation';
  delayMs: number;
  toSeverity: IncidentSeverity;
  maxEscalations: number;
}


// ============================================================================
// SAFETY POLICY (KRİTİK)
// ============================================================================

export interface SafetyPolicy {
  // Value limits
  maxTtlMs?: number;
  maxMultiplier?: number;
  maxValue?: number;
  
  // Allowlists
  allowedNamespaces?: string[];
  allowedRoles?: string[];
  allowedTenants?: string[];  // "*" for all
  
  // Cooldown
  cooldownMs: number;
}

export interface LeaseConfig {
  durationMs: number;
  autoRollback: boolean;
  rollbackAction?: string;
}

// ============================================================================
// AUTO-ACTION TYPES (Supported Actions)
// ============================================================================

export type AutoActionType =
  | 'extend_cache_ttl'
  | 'force_circuit_half_open'
  | 'enable_stale_serve'
  | 'increase_timeout'
  | 'reduce_rate_limit';

export interface ExtendCacheTTLParams {
  namespace: CacheNamespace;
  multiplier: number;
}

export interface ForceCircuitHalfOpenParams {
  dependency: DependencyName;
}

export interface EnableStaleServeParams {
  namespace: CacheNamespace;
  enabled: boolean;
}

export interface IncreaseTimeoutParams {
  dependency: DependencyName;
  multiplier: number;
}

export interface ReduceRateLimitParams {
  tenantId: string;
  factor: number;  // 0.5 = half the limit
}

// ============================================================================
// LEASE TYPES
// ============================================================================

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
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ROLLED_BACK';
  rollbackAction?: string;
}

// ============================================================================
// EXECUTION TYPES
// ============================================================================

export interface ExecutionOptions {
  dryRun?: boolean;
  triggeredBy: 'auto' | 'manual';
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
  result: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  actions: ActionResult[];
}

export interface ActionResult {
  actionId: string;
  actionType: ActionType;
  result: 'EXECUTED' | 'SKIPPED' | 'FAILED' | 'REJECTED';
  rejectionReason?: string;
  leaseId?: string;
  durationMs: number;
  error?: string;
}

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
}

export interface SlackConfig {
  webhookUrl: string;
  channel?: string;
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
  status: 'PENDING' | 'SENT' | 'FAILED';
  retryCount: number;
  error?: string;
}

export interface TemplateVariables {
  incident_type: string;
  severity: string;
  tenant_id: string;
  description: string;
  recommendation: string;
  started_at: string;
  evidence?: Record<string, unknown>;
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
  result: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  durationMs: number;
}

export interface ActionAuditEntry {
  id: string;
  timestamp: string;
  executionId: string;
  actionId: string;
  actionType: ActionType;
  params?: Record<string, unknown>;
  result: 'EXECUTED' | 'SKIPPED' | 'FAILED' | 'REJECTED';
  rejectionReason?: string;
  leaseId?: string;
  durationMs: number;
  error?: string;
}

export interface LeaseAuditEntry {
  id: string;
  timestamp: string;
  leaseId: string;
  event: 'CREATED' | 'EXPIRED' | 'REVOKED' | 'ROLLED_BACK';
  actionType: AutoActionType;
  incidentId: string;
  tenantId: string;
  originalState?: Record<string, unknown>;
  revokedBy?: string;
}
```

## Playbook YAML Validation

### Schema Validation (Zod)

```typescript
import { z } from 'zod';

const WhenClauseSchema = z.object({
  field: z.string(),
  operator: z.enum(['eq', 'ne', 'in', 'not_in', 'gt', 'lt', 'gte', 'lte']),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  values: z.array(z.union([z.string(), z.number()])).optional(),
});

const SafetyPolicySchema = z.object({
  maxTtlMs: z.number().positive().optional(),
  maxMultiplier: z.number().positive().max(10).optional(),
  maxValue: z.number().positive().optional(),
  allowedNamespaces: z.array(z.string()).optional(),
  allowedRoles: z.array(z.string()).optional(),
  allowedTenants: z.array(z.string()).optional(),
  cooldownMs: z.number().positive(),
});

const LeaseConfigSchema = z.object({
  durationMs: z.number().positive().max(24 * 60 * 60 * 1000), // max 24h
  autoRollback: z.boolean(),
  rollbackAction: z.string().optional(),
});

const NotificationActionSchema = z.object({
  id: z.string(),
  type: z.literal('notification'),
  channel: z.enum(['console', 'webhook', 'slack', 'email']),
  template: z.string(),
  recipients: z.array(z.string()).optional(),
});

const AutoActionSchema = z.object({
  id: z.string(),
  type: z.literal('auto_action'),
  action: z.enum([
    'extend_cache_ttl',
    'force_circuit_half_open',
    'enable_stale_serve',
    'increase_timeout',
    'reduce_rate_limit',
  ]),
  params: z.record(z.unknown()),
  safetyPolicy: SafetyPolicySchema,
  lease: LeaseConfigSchema.optional(),
});

const HumanActionSchema = z.object({
  id: z.string(),
  type: z.literal('human_action'),
  assigneeRole: z.string(),
  slaMs: z.number().positive(),
  description: z.string(),
});

const EscalationActionSchema = z.object({
  id: z.string(),
  type: z.literal('escalation'),
  delayMs: z.number().positive(),
  toSeverity: z.enum(['WARNING', 'CRITICAL']),
  maxEscalations: z.number().positive().max(5),
});

const PlaybookActionSchema = z.discriminatedUnion('type', [
  NotificationActionSchema,
  AutoActionSchema,
  HumanActionSchema,
  EscalationActionSchema,
]);

const PlaybookMatchSchema = z.object({
  incidentType: z.enum([
    'CIRCUIT_BREAKER_OPEN',
    'HIGH_ERROR_RATE',
    'RATE_LIMIT_EXHAUSTED',
    'DEGRADED_SERVICE',
    'SLO_BREACH',
  ]),
  severity: z.array(z.enum(['WARNING', 'CRITICAL'])),
  tenantScope: z.union([z.string(), z.array(z.string())]),
});

export const PlaybookSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  name: z.string(),
  description: z.string(),
  match: PlaybookMatchSchema,
  when: z.array(WhenClauseSchema).optional(),
  priority: z.number().int().min(0).max(1000),
  dryRun: z.boolean().default(false),
  actions: z.array(PlaybookActionSchema).min(1),
});
```


### Semantic Validation Rules

```typescript
interface SemanticValidationRule {
  name: string;
  validate: (playbook: Playbook, allPlaybooks: Playbook[]) => ValidationError[];
}

const SEMANTIC_RULES: SemanticValidationRule[] = [
  {
    name: 'no-unknown-action-types',
    validate: (playbook) => {
      const knownTypes = ['notification', 'auto_action', 'human_action', 'escalation'];
      return playbook.actions
        .filter(a => !knownTypes.includes(a.type))
        .map(a => ({ field: `actions.${a.id}.type`, message: `Unknown action type: ${a.type}` }));
    },
  },
  {
    name: 'no-arbitrary-expressions',
    validate: (playbook) => {
      // when clauses must use whitelist DSL only
      const errors: ValidationError[] = [];
      for (const clause of playbook.when || []) {
        // Check field is in allowed list
        const allowedFields = [
          'severity', 'incident_type', 'tenant_id',
          'evidence.breakerName', 'evidence.metric', 'evidence.value',
        ];
        if (!allowedFields.includes(clause.field)) {
          errors.push({
            field: `when.${clause.field}`,
            message: `Field not in whitelist: ${clause.field}`,
          });
        }
      }
      return errors;
    },
  },
  {
    name: 'no-escalation-loops',
    validate: (playbook, allPlaybooks) => {
      // Detect escalation cycles
      const errors: ValidationError[] = [];
      const escalations = playbook.actions.filter(a => a.type === 'escalation') as EscalationAction[];
      
      for (const esc of escalations) {
        // Check if escalating to same severity creates loop
        if (playbook.match.severity.includes(esc.toSeverity)) {
          // Find playbooks that match the escalated severity
          const matchingPlaybooks = allPlaybooks.filter(p =>
            p.match.incidentType === playbook.match.incidentType &&
            p.match.severity.includes(esc.toSeverity)
          );
          
          // Check if any of them escalate back
          for (const mp of matchingPlaybooks) {
            const mpEscalations = mp.actions.filter(a => a.type === 'escalation') as EscalationAction[];
            for (const mpEsc of mpEscalations) {
              if (playbook.match.severity.includes(mpEsc.toSeverity)) {
                errors.push({
                  field: `actions.${esc.id}`,
                  message: `Escalation loop detected: ${playbook.id} → ${mp.id} → ${playbook.id}`,
                });
              }
            }
          }
        }
      }
      return errors;
    },
  },
  {
    name: 'auto-action-requires-safety-policy',
    validate: (playbook) => {
      const autoActions = playbook.actions.filter(a => a.type === 'auto_action') as AutoAction[];
      return autoActions
        .filter(a => !a.safetyPolicy || !a.safetyPolicy.cooldownMs)
        .map(a => ({
          field: `actions.${a.id}.safetyPolicy`,
          message: 'Auto-action requires safety_policy with cooldown_ms',
        }));
    },
  },
  {
    name: 'lease-required-for-temporary-actions',
    validate: (playbook) => {
      const temporaryActions = ['extend_cache_ttl', 'increase_timeout', 'enable_stale_serve'];
      const autoActions = playbook.actions.filter(a => a.type === 'auto_action') as AutoAction[];
      return autoActions
        .filter(a => temporaryActions.includes(a.action) && !a.lease)
        .map(a => ({
          field: `actions.${a.id}.lease`,
          message: `Temporary action ${a.action} requires lease configuration`,
        }));
    },
  },
];
```

## Sequence Diagrams

### Incident → Playbook Execution Flow

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│Incident │     │PlaybookSvc  │     │ActionExec   │     │PolicyGuard   │
│Service  │     │             │     │             │     │              │
└────┬────┘     └──────┬──────┘     └──────┬──────┘     └──────┬───────┘
     │                 │                   │                   │
     │ detectIncident  │                   │                   │
     │────────────────>│                   │                   │
     │                 │                   │                   │
     │                 │ findMatch()       │                   │
     │                 │──────────────────>│                   │
     │                 │                   │                   │
     │                 │ execute(playbook) │                   │
     │                 │──────────────────>│                   │
     │                 │                   │                   │
     │                 │                   │ checkPolicy()     │
     │                 │                   │──────────────────>│
     │                 │                   │                   │
     │                 │                   │<──────────────────│
     │                 │                   │ PolicyCheckResult │
     │                 │                   │                   │
     │                 │                   │ [if allowed]      │
     │                 │                   │ createLease()     │
     │                 │                   │──────────────────>│
     │                 │                   │                   │
     │                 │                   │ executeAction()   │
     │                 │                   │──────────────────>│
     │                 │                   │                   │
     │                 │<──────────────────│                   │
     │                 │ ExecutionResult   │                   │
     │                 │                   │                   │
     │<────────────────│                   │                   │
     │ PlaybookTriggered                   │                   │
```


### Lease Expiry → Auto-Rollback Flow

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│LeaseManager │     │TargetService │     │AuditService  │     │Metrics      │
│(background) │     │(Cache/CB)    │     │              │     │             │
└──────┬──────┘     └──────┬───────┘     └──────┬───────┘     └──────┬──────┘
       │                   │                    │                    │
       │ processExpired()  │                    │                    │
       │──────────────────>│                    │                    │
       │                   │                    │                    │
       │ [for each expired]│                    │                    │
       │ executeRollback() │                    │                    │
       │──────────────────>│                    │                    │
       │                   │                    │                    │
       │                   │ restoreState()     │                    │
       │                   │──────────────────> │                    │
       │                   │                    │                    │
       │                   │                    │ logLease(ROLLED_BACK)
       │                   │                    │──────────────────> │
       │                   │                    │                    │
       │                   │                    │                    │ emit
       │                   │                    │                    │ lease_rollback_total
       │                   │                    │                    │
       │<──────────────────│                    │                    │
       │ RollbackResult    │                    │                    │
```

## Self-Observability Metrics

### Playbook Metrics

```typescript
// Playbook execution metrics
playbook_executions_total{playbook_id, result, dry_run}
playbook_execution_duration_ms{playbook_id}
playbook_match_total{incident_type, matched}

// Action metrics
playbook_actions_total{action_type, result}
playbook_action_duration_ms{action_type}
playbook_action_rejected_total{action_type, reason}

// Lease metrics
playbook_leases_active{action_type}
playbook_leases_created_total{action_type}
playbook_leases_expired_total{action_type}
playbook_leases_revoked_total{action_type}
playbook_lease_rollback_total{action_type, result}

// Escalation metrics
playbook_escalations_total{from_severity, to_severity}
playbook_escalation_cancelled_total{reason}

// Notification metrics
playbook_notifications_total{channel, result}
playbook_notification_latency_ms{channel}
playbook_notification_retry_total{channel}

// Validation metrics
playbook_validation_errors_total{error_type}
playbook_load_total{result}
```

## Error Handling

### HTTP Status Codes

| Status | Condition |
|--------|-----------|
| 200 | Başarılı response |
| 400 | Invalid playbook ID, invalid parameters |
| 401 | Authentication missing |
| 403 | RBAC violation (tenant isolation) |
| 404 | Playbook/Incident/Lease not found |
| 409 | Conflict (duplicate execution, cooldown active) |
| 422 | Playbook validation failed |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

### Error Response Format

```typescript
interface PlaybookErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  details?: {
    playbookId?: string;
    actionId?: string;
    validationErrors?: ValidationError[];
    cooldownRemainingMs?: number;
  };
}
```

## Correctness Properties

### Property 1: Auto-Action Safety

*For any* auto-action execution, the action SHALL be rejected if:
- Safety policy is missing
- Value exceeds max limits (maxTtlMs, maxMultiplier)
- Namespace not in allowedNamespaces
- Role not in allowedRoles
- Cooldown period not elapsed

### Property 2: Idempotency

*For any* auto-action with the same (incident_id, action_id) pair:
- Second execution SHALL be skipped
- Audit log SHALL record "skipped: already_executed"
- No side effects SHALL occur

### Property 3: Lease Auto-Rollback

*For any* lease with auto_rollback: true:
- When lease expires, rollback action SHALL execute
- Original state SHALL be restored
- Audit log SHALL record "ROLLED_BACK"

### Property 4: Escalation Loop Prevention

*For any* set of playbooks:
- Escalation chains SHALL NOT form cycles
- Maximum escalation count SHALL be enforced
- Loop detection SHALL reject playbook at load time

### Property 5: Dry-Run Isolation

*For any* playbook execution with dry_run: true:
- Notifications SHALL be sent
- Audit logs SHALL be written
- Auto-actions SHALL NOT execute
- Leases SHALL NOT be created

### Property 6: Tenant Isolation

*For any* playbook execution:
- Actions SHALL only affect the incident's tenant
- Audit logs SHALL include tenantId
- Cross-tenant access SHALL be blocked


## Testing Strategy

### Unit Tests

- PlaybookYAMLValidator: Schema + semantic validation
- PlaybookMatcher: Incident → playbook matching
- ActionPolicyGuard: Safety policy enforcement
- ActionLeaseManager: Lease lifecycle
- WhenClause evaluator: DSL evaluation

### Property-Based Tests

```typescript
// Property 1: Safety policy enforcement
fc.assert(
  fc.property(
    fc.record({ maxTtlMs: fc.nat(), multiplier: fc.nat() }),
    fc.record({ ttlMs: fc.nat(), multiplier: fc.nat() }),
    (policy, params) => {
      const result = guard.checkValueLimits(params, policy);
      if (params.ttlMs > policy.maxTtlMs || params.multiplier > policy.maxMultiplier) {
        return result.allowed === false;
      }
      return true;
    }
  )
);

// Property 2: Idempotency
fc.assert(
  fc.property(
    fc.uuid(),
    fc.uuid(),
    (incidentId, actionId) => {
      guard.recordExecution(incidentId, actionId);
      const result = guard.checkIdempotency(incidentId, actionId);
      return result.alreadyExecuted === true;
    }
  )
);
```

### Contract Tests

- Playbook YAML schema validation
- API response schema validation
- Audit log schema validation

### Golden Scenario Tests

1. Circuit breaker open → extend cache TTL → lease expires → rollback
2. High error rate → notification → escalation after 30min
3. Dry-run execution → notification sent, no auto-action
4. Cooldown active → action rejected
5. Escalation loop detected → playbook rejected at load

### Integration Tests

- Full playbook execution flow
- Lease expiry background job
- Notification delivery
- Escalation timer

---

## Design Sertleştirmeleri (Production-Critical)

### 1. Auto-Action Safety (KRİTİK)

> ⚠️ **Auto-action'lar sistem davranışını değiştirir. Güvenlik olmadan tehlikeli.**

| Kontrol | Açıklama | Bypass |
|---------|----------|--------|
| SafetyPolicy | max values, allowlists, cooldown | YASAK |
| Idempotency | same incident+action → skip | YASAK |
| Lease | temporary effect, auto-rollback | YASAK (temporary actions için) |

### 2. Playbook Governance (KRİTİK)

> ⚠️ **Playbook YAML = prod davranışı. Kod gibi yönetilmeli.**

| Kontrol | Açıklama |
|---------|----------|
| Schema validation | Zod typed model |
| Semantic validation | Whitelist DSL, no arbitrary expressions |
| Loop detection | Escalation cycles rejected at load |
| Versioning | semver, tenant allowlist, dry-run |

### 3. Lease Guarantee

> ⚠️ **Lease süresi dolunca rollback GARANTİLİ olmalı.**

- Background job her 30 saniyede çalışır
- Expired lease → immediate rollback
- Rollback failure → retry + alert
- Original state stored at lease creation

---

## Files to Create

```
diagnostics/playbook/
├── playbook.types.ts
├── playbook.module.ts
├── playbook.controller.ts
├── playbook.service.ts
├── playbook-registry.service.ts
├── playbook-matcher.service.ts
├── playbook-yaml-validator.service.ts
├── action-executor.service.ts
├── action-policy-guard.service.ts
├── action-lease-manager.service.ts
├── notification.service.ts
├── escalation.service.ts
├── playbook-audit.service.ts
├── playbook-metrics.service.ts
├── playbooks/
│   ├── circuit-breaker-open.yaml
│   ├── high-error-rate.yaml
│   ├── rate-limit-exhausted.yaml
│   ├── degraded-service.yaml
│   └── slo-breach.yaml
├── templates/
│   ├── circuit_breaker_alert.ts
│   ├── error_rate_alert.ts
│   └── slo_breach_alert.ts
└── __tests__/
    ├── playbook-validator.spec.ts
    ├── playbook-matcher.spec.ts
    ├── action-policy-guard.spec.ts
    ├── action-lease-manager.spec.ts
    ├── playbook.property.spec.ts
    ├── playbook.contract.spec.ts
    ├── playbook.golden.spec.ts
    └── playbook.integration.spec.ts
```
