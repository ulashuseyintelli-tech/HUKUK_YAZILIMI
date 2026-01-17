/**
 * Playbook YAML Validator Tests
 * 
 * Phase 7B - Sprint 1
 * 
 * Tests for schema and semantic validation.
 */

import { PlaybookYAMLValidator } from '../playbook-yaml-validator.service';
import { Playbook } from '../playbook.types';

describe('PlaybookYAMLValidator', () => {
  let validator: PlaybookYAMLValidator;

  beforeEach(() => {
    validator = new PlaybookYAMLValidator();
  });

  describe('Schema Validation', () => {
    it('should accept valid playbook', () => {
      const yaml = `
id: test-playbook
version: "1.0.0"
name: "Test Playbook"
description: "A test playbook"
match:
  incidentType: CIRCUIT_BREAKER_OPEN
  severity:
    - WARNING
  tenantScope: "*"
priority: 100
dryRun: true
actions:
  - id: notify
    type: notification
    channel: console
    template: test_template
`;
      const result = validator.validate(yaml);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid playbook ID format', () => {
      const yaml = `
id: Test_Playbook
version: "1.0.0"
name: "Test"
description: "Test"
match:
  incidentType: CIRCUIT_BREAKER_OPEN
  severity: [WARNING]
  tenantScope: "*"
priority: 100
dryRun: true
actions:
  - id: notify
    type: notification
    channel: console
    template: test
`;
      const result = validator.validate(yaml);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'id')).toBe(true);
    });

    it('should reject invalid version format', () => {
      const yaml = `
id: test
version: "1.0"
name: "Test"
description: "Test"
match:
  incidentType: CIRCUIT_BREAKER_OPEN
  severity: [WARNING]
  tenantScope: "*"
priority: 100
dryRun: true
actions:
  - id: notify
    type: notification
    channel: console
    template: test
`;
      const result = validator.validate(yaml);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'version')).toBe(true);
    });

    it('should reject unknown incident type', () => {
      const yaml = `
id: test
version: "1.0.0"
name: "Test"
description: "Test"
match:
  incidentType: UNKNOWN_TYPE
  severity: [WARNING]
  tenantScope: "*"
priority: 100
dryRun: true
actions:
  - id: notify
    type: notification
    channel: console
    template: test
`;
      const result = validator.validate(yaml);
      expect(result.valid).toBe(false);
    });

    it('should reject empty actions array', () => {
      const yaml = `
id: test
version: "1.0.0"
name: "Test"
description: "Test"
match:
  incidentType: CIRCUIT_BREAKER_OPEN
  severity: [WARNING]
  tenantScope: "*"
priority: 100
dryRun: true
actions: []
`;
      const result = validator.validate(yaml);
      expect(result.valid).toBe(false);
    });

    it('should reject priority > 1000', () => {
      const yaml = `
id: test
version: "1.0.0"
name: "Test"
description: "Test"
match:
  incidentType: CIRCUIT_BREAKER_OPEN
  severity: [WARNING]
  tenantScope: "*"
priority: 1001
dryRun: true
actions:
  - id: notify
    type: notification
    channel: console
    template: test
`;
      const result = validator.validate(yaml);
      expect(result.valid).toBe(false);
    });
  });


  describe('Auto-Action Validation', () => {
    it('should require safety policy for auto-action', () => {
      const playbook: Playbook = {
        id: 'test',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        match: {
          incidentType: 'CIRCUIT_BREAKER_OPEN',
          severity: ['WARNING'],
          tenantScope: '*',
        },
        priority: 100,
        dryRun: true,
        actions: [
          {
            id: 'auto',
            type: 'auto_action',
            action: 'extend_cache_ttl',
            params: { namespace: 'rate_provider', multiplier: 2 },
            safetyPolicy: undefined as any, // Missing
          },
        ],
      };

      const result = validator.validateSemantics(playbook);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'SAFETY_POLICY_REQUIRED')).toBe(true);
    });

    it('should require cooldownMs in safety policy', () => {
      const playbook: Playbook = {
        id: 'test',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        match: {
          incidentType: 'CIRCUIT_BREAKER_OPEN',
          severity: ['WARNING'],
          tenantScope: '*',
        },
        priority: 100,
        dryRun: true,
        actions: [
          {
            id: 'auto',
            type: 'auto_action',
            action: 'extend_cache_ttl',
            params: { namespace: 'rate_provider', multiplier: 2 },
            safetyPolicy: {
              maxTtlMs: 300000,
              // cooldownMs missing
            } as any,
          },
        ],
      };

      const result = validator.validateSemantics(playbook);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'COOLDOWN_REQUIRED')).toBe(true);
    });

    it('should require lease for temporary actions', () => {
      const playbook: Playbook = {
        id: 'test',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        match: {
          incidentType: 'CIRCUIT_BREAKER_OPEN',
          severity: ['WARNING'],
          tenantScope: '*',
        },
        priority: 100,
        dryRun: true,
        actions: [
          {
            id: 'auto',
            type: 'auto_action',
            action: 'extend_cache_ttl', // Temporary action
            params: { namespace: 'rate_provider', multiplier: 2 },
            safetyPolicy: { cooldownMs: 600000 },
            // lease missing
          },
        ],
      };

      const result = validator.validateSemantics(playbook);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'LEASE_REQUIRED')).toBe(true);
    });

    it('should accept valid auto-action with safety policy and lease', () => {
      const playbook: Playbook = {
        id: 'test',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        match: {
          incidentType: 'CIRCUIT_BREAKER_OPEN',
          severity: ['WARNING'],
          tenantScope: '*',
        },
        priority: 100,
        dryRun: true,
        actions: [
          {
            id: 'auto',
            type: 'auto_action',
            action: 'extend_cache_ttl',
            params: { namespace: 'rate_provider', multiplier: 2 },
            safetyPolicy: {
              maxTtlMs: 300000,
              maxMultiplier: 3,
              cooldownMs: 600000,
            },
            lease: {
              durationMs: 900000,
              autoRollback: true,
            },
          },
        ],
      };

      const result = validator.validateSemantics(playbook);
      expect(result.valid).toBe(true);
    });
  });

  describe('When Clause Validation', () => {
    it('should reject unknown when clause field', () => {
      const playbook: Playbook = {
        id: 'test',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        match: {
          incidentType: 'CIRCUIT_BREAKER_OPEN',
          severity: ['WARNING'],
          tenantScope: '*',
        },
        when: [
          {
            field: 'unknown.field' as any,
            operator: 'eq',
            value: 'test',
          },
        ],
        priority: 100,
        dryRun: true,
        actions: [
          { id: 'notify', type: 'notification', channel: 'console', template: 'test' },
        ],
      };

      const result = validator.validateSemantics(playbook);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'WHEN_FIELD_NOT_ALLOWED')).toBe(true);
    });

    it('should accept allowed when clause fields', () => {
      const playbook: Playbook = {
        id: 'test',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        match: {
          incidentType: 'CIRCUIT_BREAKER_OPEN',
          severity: ['WARNING'],
          tenantScope: '*',
        },
        when: [
          { field: 'severity', operator: 'eq', value: 'CRITICAL' },
          { field: 'evidence.breakerName', operator: 'in', values: ['rate_provider'] },
        ],
        priority: 100,
        dryRun: true,
        actions: [
          { id: 'notify', type: 'notification', channel: 'console', template: 'test' },
        ],
      };

      const result = validator.validateSemantics(playbook);
      expect(result.valid).toBe(true);
    });

    it('should require values for in operator', () => {
      const playbook: Playbook = {
        id: 'test',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        match: {
          incidentType: 'CIRCUIT_BREAKER_OPEN',
          severity: ['WARNING'],
          tenantScope: '*',
        },
        when: [
          { field: 'severity', operator: 'in' }, // values missing
        ],
        priority: 100,
        dryRun: true,
        actions: [
          { id: 'notify', type: 'notification', channel: 'console', template: 'test' },
        ],
      };

      const result = validator.validateSemantics(playbook);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'WHEN_MISSING_VALUES')).toBe(true);
    });
  });


  describe('Escalation Loop Detection', () => {
    it('should detect simple escalation loop', () => {
      const playbooks: Playbook[] = [
        {
          id: 'playbook-a',
          version: '1.0.0',
          name: 'A',
          description: 'A',
          match: {
            incidentType: 'CIRCUIT_BREAKER_OPEN',
            severity: ['WARNING'],
            tenantScope: '*',
          },
          priority: 100,
          dryRun: true,
          actions: [
            {
              id: 'escalate',
              type: 'escalation',
              delayMs: 1800000,
              toSeverity: 'CRITICAL',
              maxEscalations: 2,
            },
          ],
        },
        {
          id: 'playbook-b',
          version: '1.0.0',
          name: 'B',
          description: 'B',
          match: {
            incidentType: 'CIRCUIT_BREAKER_OPEN',
            severity: ['CRITICAL'],
            tenantScope: '*',
          },
          priority: 100,
          dryRun: true,
          actions: [
            {
              id: 'escalate',
              type: 'escalation',
              delayMs: 1800000,
              toSeverity: 'WARNING', // Back to WARNING = loop
              maxEscalations: 2,
            },
          ],
        },
      ];

      const loops = validator.detectEscalationLoops(playbooks);
      expect(loops.length).toBeGreaterThan(0);
    });

    it('should not detect loop when no cycle exists', () => {
      const playbooks: Playbook[] = [
        {
          id: 'playbook-a',
          version: '1.0.0',
          name: 'A',
          description: 'A',
          match: {
            incidentType: 'CIRCUIT_BREAKER_OPEN',
            severity: ['WARNING'],
            tenantScope: '*',
          },
          priority: 100,
          dryRun: true,
          actions: [
            {
              id: 'escalate',
              type: 'escalation',
              delayMs: 1800000,
              toSeverity: 'CRITICAL',
              maxEscalations: 2,
            },
          ],
        },
        {
          id: 'playbook-b',
          version: '1.0.0',
          name: 'B',
          description: 'B',
          match: {
            incidentType: 'CIRCUIT_BREAKER_OPEN',
            severity: ['CRITICAL'],
            tenantScope: '*',
          },
          priority: 100,
          dryRun: true,
          actions: [
            // No escalation back
            { id: 'notify', type: 'notification', channel: 'console', template: 'test' },
          ],
        },
      ];

      const loops = validator.detectEscalationLoops(playbooks);
      expect(loops.length).toBe(0);
    });
  });

  describe('Unique Action IDs', () => {
    it('should reject duplicate action IDs', () => {
      const playbook: Playbook = {
        id: 'test',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        match: {
          incidentType: 'CIRCUIT_BREAKER_OPEN',
          severity: ['WARNING'],
          tenantScope: '*',
        },
        priority: 100,
        dryRun: true,
        actions: [
          { id: 'notify', type: 'notification', channel: 'console', template: 'test' },
          { id: 'notify', type: 'notification', channel: 'webhook', template: 'test' }, // Duplicate
        ],
      };

      const result = validator.validateSemantics(playbook);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'DUPLICATE_ACTION_ID')).toBe(true);
    });
  });

  describe('Cross-Playbook Validation', () => {
    it('should reject duplicate playbook IDs', () => {
      const playbooks: Playbook[] = [
        {
          id: 'same-id',
          version: '1.0.0',
          name: 'A',
          description: 'A',
          match: { incidentType: 'CIRCUIT_BREAKER_OPEN', severity: ['WARNING'], tenantScope: '*' },
          priority: 100,
          dryRun: true,
          actions: [{ id: 'notify', type: 'notification', channel: 'console', template: 'test' }],
        },
        {
          id: 'same-id', // Duplicate
          version: '1.0.0',
          name: 'B',
          description: 'B',
          match: { incidentType: 'HIGH_ERROR_RATE', severity: ['WARNING'], tenantScope: '*' },
          priority: 100,
          dryRun: true,
          actions: [{ id: 'notify', type: 'notification', channel: 'console', template: 'test' }],
        },
      ];

      const result = validator.validateAll(playbooks);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'DUPLICATE_PLAYBOOK_ID')).toBe(true);
    });
  });
});
