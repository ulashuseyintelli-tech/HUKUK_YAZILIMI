/**
 * Playbook YAML Validator Service
 * 
 * Phase 7B - Sprint 1 - Task 1.2, 1.3
 * 
 * Schema validation (Zod) + Semantic validation
 * 
 * Kurallar:
 * - Unknown fields → REJECT
 * - Unknown action types → REJECT
 * - when clause'lar whitelist DSL only
 * - Escalation loop detection
 * - Safety policy required for auto-actions
 * - Lease required for temporary actions
 * 
 * @see .kiro/specs/ops-playbook/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import * as yaml from 'js-yaml';
import {
  Playbook,
  AutoAction,
  EscalationAction,
  ValidationResult,
  SchemaValidationResult,
  SemanticValidationResult,
  ValidationError,
  EscalationLoop,
  ALLOWED_WHEN_FIELDS,
} from './playbook.types';

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const WhenClauseSchema = z.object({
  field: z.string(),
  operator: z.enum(['eq', 'ne', 'in', 'not_in', 'gt', 'lt', 'gte', 'lte']),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  values: z.array(z.union([z.string(), z.number()])).optional(),
}).strict();

const SafetyPolicySchema = z.object({
  maxTtlMs: z.number().positive().optional(),
  maxMultiplier: z.number().positive().max(10).optional(),
  maxValue: z.number().positive().optional(),
  allowedNamespaces: z.array(z.string()).optional(),
  allowedRoles: z.array(z.string()).optional(),
  allowedTenants: z.array(z.string()).optional(),
  cooldownMs: z.number().positive(),
}).strict();

const LeaseConfigSchema = z.object({
  durationMs: z.number().positive().max(24 * 60 * 60 * 1000), // max 24h
  autoRollback: z.boolean(),
  rollbackAction: z.string().optional(),
}).strict();

const NotificationActionSchema = z.object({
  id: z.string().min(1),
  type: z.literal('notification'),
  channel: z.enum(['console', 'webhook', 'slack', 'email']),
  template: z.string().min(1),
  recipients: z.array(z.string()).optional(),
}).strict();

const AutoActionSchema = z.object({
  id: z.string().min(1),
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
}).strict();


const HumanActionSchema = z.object({
  id: z.string().min(1),
  type: z.literal('human_action'),
  assigneeRole: z.string().min(1),
  slaMs: z.number().positive(),
  description: z.string().min(1),
}).strict();

const EscalationActionSchema = z.object({
  id: z.string().min(1),
  type: z.literal('escalation'),
  delayMs: z.number().positive(),
  toSeverity: z.enum(['WARNING', 'CRITICAL']),
  maxEscalations: z.number().positive().max(5),
}).strict();

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
  severity: z.array(z.enum(['WARNING', 'CRITICAL'])).min(1),
  tenantScope: z.union([z.string(), z.array(z.string())]),
}).strict();

export const PlaybookSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ID must be lowercase alphanumeric with dashes'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver format'),
  name: z.string().min(1),
  description: z.string().min(1),
  match: PlaybookMatchSchema,
  when: z.array(WhenClauseSchema).optional(),
  priority: z.number().int().min(0).max(1000),
  dryRun: z.boolean().default(false),
  actions: z.array(PlaybookActionSchema).min(1),
}).strict();

// ============================================================================
// TEMPORARY ACTIONS (require lease)
// ============================================================================

const TEMPORARY_ACTIONS = [
  'extend_cache_ttl',
  'increase_timeout',
  'enable_stale_serve',
  'reduce_rate_limit',
];

// ============================================================================
// VALIDATOR SERVICE
// ============================================================================

@Injectable()
export class PlaybookYAMLValidator {
  private readonly logger = new Logger(PlaybookYAMLValidator.name);

  /**
   * Validate playbook YAML string
   */
  validate(yamlContent: string): ValidationResult {
    const errors: ValidationError[] = [];

    // 1. Parse YAML
    let parsed: unknown;
    try {
      parsed = yaml.load(yamlContent);
    } catch (e) {
      return {
        valid: false,
        errors: [{
          field: 'yaml',
          message: `YAML parse error: ${(e as Error).message}`,
          code: 'YAML_PARSE_ERROR',
        }],
      };
    }

    // 2. Schema validation
    const schemaResult = this.validateSchema(parsed);
    if (!schemaResult.valid) {
      return schemaResult;
    }

    // 3. Semantic validation (single playbook)
    const playbook = parsed as Playbook;
    const semanticResult = this.validateSemantics(playbook);
    errors.push(...semanticResult.errors);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Schema validation using Zod
   */
  validateSchema(parsed: unknown): SchemaValidationResult {
    const result = PlaybookSchema.safeParse(parsed);

    if (result.success) {
      return { valid: true, errors: [] };
    }

    const errors: ValidationError[] = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: 'SCHEMA_VALIDATION_ERROR',
    }));

    return {
      valid: false,
      errors,
      zodErrors: result.error.errors,
    };
  }


  /**
   * Semantic validation
   * 
   * Rules:
   * - no-unknown-action-types
   * - no-arbitrary-expressions (when clause whitelist)
   * - auto-action-requires-safety-policy
   * - lease-required-for-temporary-actions
   */
  validateSemantics(playbook: Playbook): SemanticValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Rule 1: no-unknown-action-types (already enforced by Zod, but double-check)
    errors.push(...this.checkUnknownActionTypes(playbook));

    // Rule 2: no-arbitrary-expressions (when clause whitelist)
    errors.push(...this.checkWhenClauseWhitelist(playbook));

    // Rule 3: auto-action-requires-safety-policy
    errors.push(...this.checkSafetyPolicyRequired(playbook));

    // Rule 4: lease-required-for-temporary-actions
    errors.push(...this.checkLeaseRequired(playbook));

    // Rule 5: unique action IDs
    errors.push(...this.checkUniqueActionIds(playbook));

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Detect escalation loops across multiple playbooks
   */
  detectEscalationLoops(playbooks: Playbook[]): EscalationLoop[] {
    const loops: EscalationLoop[] = [];
    
    // Build escalation graph
    // Node: (incidentType, severity)
    // Edge: escalation action
    const graph = new Map<string, Set<string>>();
    const playbookMap = new Map<string, Playbook>();

    for (const playbook of playbooks) {
      playbookMap.set(playbook.id, playbook);
      
      const escalations = playbook.actions.filter(
        a => a.type === 'escalation'
      ) as EscalationAction[];

      for (const severity of playbook.match.severity) {
        const fromNode = `${playbook.match.incidentType}:${severity}`;
        
        for (const esc of escalations) {
          const toNode = `${playbook.match.incidentType}:${esc.toSeverity}`;
          
          if (!graph.has(fromNode)) {
            graph.set(fromNode, new Set());
          }
          graph.get(fromNode)!.add(toNode);
        }
      }
    }

    // Detect cycles using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          // Found cycle
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart);
          cycle.push(neighbor); // Complete the cycle
          
          loops.push({
            playbooks: [...new Set(cycle.map(n => n.split(':')[0]))],
            cycle,
          });
          return true;
        }
      }

      path.pop();
      recursionStack.delete(node);
      return false;
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    if (loops.length > 0) {
      this.logger.warn('[PlaybookValidator] Escalation loops detected', { loops });
    }

    return loops;
  }

  /**
   * Validate multiple playbooks together
   */
  validateAll(playbooks: Playbook[]): ValidationResult {
    const errors: ValidationError[] = [];

    // Individual validation
    for (const playbook of playbooks) {
      const result = this.validateSemantics(playbook);
      errors.push(...result.errors.map(e => ({
        ...e,
        field: `${playbook.id}.${e.field}`,
      })));
    }

    // Cross-playbook validation: escalation loops
    const loops = this.detectEscalationLoops(playbooks);
    for (const loop of loops) {
      errors.push({
        field: 'escalation',
        message: `Escalation loop detected: ${loop.cycle.join(' → ')}`,
        code: 'ESCALATION_LOOP',
      });
    }

    // Cross-playbook validation: duplicate IDs
    const ids = playbooks.map(p => p.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    for (const dup of duplicates) {
      errors.push({
        field: 'id',
        message: `Duplicate playbook ID: ${dup}`,
        code: 'DUPLICATE_PLAYBOOK_ID',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }


  // ============================================================================
  // PRIVATE VALIDATION RULES
  // ============================================================================

  private checkUnknownActionTypes(playbook: Playbook): ValidationError[] {
    const errors: ValidationError[] = [];
    const knownTypes = ['notification', 'auto_action', 'human_action', 'escalation'];

    for (const action of playbook.actions) {
      if (!knownTypes.includes(action.type)) {
        errors.push({
          field: `actions.${action.id}.type`,
          message: `Unknown action type: ${action.type}`,
          code: 'UNKNOWN_ACTION_TYPE',
        });
      }
    }

    return errors;
  }

  private checkWhenClauseWhitelist(playbook: Playbook): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!playbook.when) {
      return errors;
    }

    for (let i = 0; i < playbook.when.length; i++) {
      const clause = playbook.when[i];
      
      if (!ALLOWED_WHEN_FIELDS.includes(clause.field as any)) {
        errors.push({
          field: `when[${i}].field`,
          message: `Field not in whitelist: ${clause.field}. Allowed: ${ALLOWED_WHEN_FIELDS.join(', ')}`,
          code: 'WHEN_FIELD_NOT_ALLOWED',
        });
      }

      // Check operator-value consistency
      if (['in', 'not_in'].includes(clause.operator) && !clause.values) {
        errors.push({
          field: `when[${i}]`,
          message: `Operator '${clause.operator}' requires 'values' array`,
          code: 'WHEN_MISSING_VALUES',
        });
      }

      if (['eq', 'ne', 'gt', 'lt', 'gte', 'lte'].includes(clause.operator) && clause.value === undefined) {
        errors.push({
          field: `when[${i}]`,
          message: `Operator '${clause.operator}' requires 'value'`,
          code: 'WHEN_MISSING_VALUE',
        });
      }
    }

    return errors;
  }

  private checkSafetyPolicyRequired(playbook: Playbook): ValidationError[] {
    const errors: ValidationError[] = [];

    const autoActions = playbook.actions.filter(
      a => a.type === 'auto_action'
    ) as AutoAction[];

    for (const action of autoActions) {
      if (!action.safetyPolicy) {
        errors.push({
          field: `actions.${action.id}.safetyPolicy`,
          message: 'Auto-action requires safety_policy',
          code: 'SAFETY_POLICY_REQUIRED',
        });
      } else if (!action.safetyPolicy.cooldownMs) {
        errors.push({
          field: `actions.${action.id}.safetyPolicy.cooldownMs`,
          message: 'Safety policy requires cooldownMs',
          code: 'COOLDOWN_REQUIRED',
        });
      }
    }

    return errors;
  }

  private checkLeaseRequired(playbook: Playbook): ValidationError[] {
    const errors: ValidationError[] = [];

    const autoActions = playbook.actions.filter(
      a => a.type === 'auto_action'
    ) as AutoAction[];

    for (const action of autoActions) {
      if (TEMPORARY_ACTIONS.includes(action.action) && !action.lease) {
        errors.push({
          field: `actions.${action.id}.lease`,
          message: `Temporary action '${action.action}' requires lease configuration`,
          code: 'LEASE_REQUIRED',
        });
      }
    }

    return errors;
  }

  private checkUniqueActionIds(playbook: Playbook): ValidationError[] {
    const errors: ValidationError[] = [];
    const ids = playbook.actions.map(a => a.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);

    for (const dup of duplicates) {
      errors.push({
        field: `actions.${dup}`,
        message: `Duplicate action ID: ${dup}`,
        code: 'DUPLICATE_ACTION_ID',
      });
    }

    return errors;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Parse YAML to Playbook (after validation)
   */
  parseYAML(yamlContent: string): Playbook | null {
    const result = this.validate(yamlContent);
    if (!result.valid) {
      this.logger.error('[PlaybookValidator] Validation failed', { errors: result.errors });
      return null;
    }

    return yaml.load(yamlContent) as Playbook;
  }
}
