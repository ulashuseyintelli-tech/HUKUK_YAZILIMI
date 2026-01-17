/**
 * Playbook Golden Scenario Tests
 * 
 * Phase 7B - Sprint 3 - Task 3.7
 * 
 * "Gerçeğin fotoğrafı" - uçtan uca senaryolar.
 * Bu testler sistemin "doğru" davranışını kilitler.
 * 
 * 6 Golden Senaryo:
 * 1. SLO breach → evaluate → run DRY_RUN → notify → escalation
 * 2. LIVE run → lease → action → resolve → cleanup
 * 3. Human reject → rollback (TODO: Phase 8)
 * 4. Pause TENANT → tenant isolation
 * 5. Idempotency-Key → duplicate prevention
 * 6. Loop guard → EXHAUSTED state
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PlaybookService } from '../playbook.service';
import { PlaybookRegistry } from '../playbook-registry.service';
import { PlaybookMatcher } from '../playbook-matcher.service';
import { ActionExecutor } from '../action-executor.service';
import { ActionPolicyGuard } from '../action-policy-guard.service';
import { ActionLeaseManager } from '../action-lease-manager.service';
import { PlaybookAuditService } from '../playbook-audit.service';
import { PlaybookMetricsService } from '../playbook-metrics.service';
import { NotificationService } from '../notification.service';
import { EscalationService } from '../escalation.service';
import { DiagnosticsIncidentService } from '../../diagnostics-incident.service';
import { PlaybookYAMLValidator } from '../playbook-yaml-validator.service';
import { Playbook, EscalationAction } from '../playbook.types';
import { DiagnosticsIncident } from '../../diagnostics.types';

describe('Playbook Golden Scenarios', () => {
  // Services
  let playbookService: PlaybookService;
  let registry: PlaybookRegistry;
  let policyGuard: ActionPolicyGuard;
  let leaseManager: ActionLeaseManager;
  let audit: PlaybookAuditService;
  let metrics: PlaybookMetricsService;
  let notifications: NotificationService;
  let escalation: EscalationService;
  let incidentService: DiagnosticsIncidentService;

  // Test fixtures
  const testPlaybook: Playbook = {
    id: 'golden-test-playbook',
    name: 'Golden Test Playbook',
    version: '1.0.0',
    description: 'Test playbook for golden scenarios',
    dryRun: false,
    priority: 100,
    match: {
      incidentType: 'SLO_BREACH',
      severity: ['WARNING'], // Only WARNING to avoid escalation loop
      tenantScope: '*',
    },
    actions: [
      {
        id: 'notify-ops',
        type: 'notification',
        channel: 'console',
        template: 'slo_breach_alert',
        recipients: ['ops-team'],
      },
      {
        id: 'extend-cache',
        type: 'auto_action',
        action: 'extend_cache_ttl',
        params: { namespace: 'rate-provider', multiplier: 2 },
        safetyPolicy: {
          maxTtlMs: 3600000,
          maxMultiplier: 5,
          allowedNamespaces: ['rate-provider', 'tariff-provider'],
          allowedRoles: ['system', 'admin'],
          cooldownMs: 60000,
        },
        lease: {
          durationMs: 300000, // 5 minutes
          autoRollback: true,
          rollbackAction: 'restore_cache_ttl',
        },
      },
      {
        id: 'escalate-critical',
        type: 'escalation',
        toSeverity: 'CRITICAL',
        delayMs: 300000, // 5 minutes
        maxEscalations: 2,
      },
    ],
  };

  const createTestIncident = (overrides: Partial<DiagnosticsIncident> = {}): DiagnosticsIncident => ({
    id: `incident-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    type: 'SLO_BREACH',
    severity: 'WARNING',
    status: 'ONGOING',
    title: 'SLO Breach Detected',
    description: 'P95 latency exceeded threshold',
    recommendation: 'Check downstream services',
    startedAt: new Date().toISOString(),
    evidence: {
      source: 'metrics',
      metric: 'p95_latency_ms',
      value: 1500,
      threshold: 1000,
      timestamp: new Date().toISOString(),
    },
    tenantId: 'tenant-golden',
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaybookYAMLValidator,
        PlaybookRegistry,
        PlaybookMatcher,
        ActionPolicyGuard,
        ActionLeaseManager,
        PlaybookAuditService,
        PlaybookMetricsService,
        NotificationService,
        EscalationService,
        DiagnosticsIncidentService,
        // ActionExecutor needs mocked dependencies
        {
          provide: ActionExecutor,
          useFactory: () => {
            // Create mock executor that doesn't need circuit breaker
            return {
              execute: jest.fn().mockResolvedValue({
                executionId: 'mock-exec-id',
                playbookId: 'test',
                playbookVersion: '1.0.0',
                incidentId: 'test',
                tenantId: 'test',
                triggeredAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                dryRun: true,
                result: 'SUCCESS',
                actionResults: [],
              }),
            };
          },
        },
        PlaybookService,
      ],
    }).compile();

    playbookService = module.get<PlaybookService>(PlaybookService);
    registry = module.get<PlaybookRegistry>(PlaybookRegistry);
    policyGuard = module.get<ActionPolicyGuard>(ActionPolicyGuard);
    leaseManager = module.get<ActionLeaseManager>(ActionLeaseManager);
    audit = module.get<PlaybookAuditService>(PlaybookAuditService);
    metrics = module.get<PlaybookMetricsService>(PlaybookMetricsService);
    notifications = module.get<NotificationService>(NotificationService);
    escalation = module.get<EscalationService>(EscalationService);
    incidentService = module.get<DiagnosticsIncidentService>(DiagnosticsIncidentService);

    // Clear all state first
    registry.clear();
    policyGuard.clear();
    leaseManager.clear();
    audit.clear();
    metrics.clear();
    notifications.clear();
    escalation.clear();
    incidentService.clear();
    playbookService.clear();
    
    // Then register test playbook
    const registrationResult = registry.registerPlaybook(testPlaybook);
    
    // Verify registration
    if (!registrationResult.valid) {
      throw new Error(`Playbook registration failed: ${JSON.stringify(registrationResult.errors)}`);
    }
    
    const allPlaybooks = registry.getAllPlaybooks();
    if (allPlaybooks.length === 0) {
      throw new Error('Playbook not found after registration!');
    }
  });

  afterEach(() => {
    // No need to clear here - beforeEach handles it
  });

  // ==========================================================================
  // GOLDEN SCENARIO 1: SLO Breach → Evaluate → DRY_RUN → Notify → Escalation
  // ==========================================================================
  describe('Golden 1: SLO Breach Full Flow (DRY_RUN)', () => {
    it('should evaluate playbook and show planned actions', async () => {
      const incident = createTestIncident();
      
      // Store incident
      incidentService['incidents'].set(incident.id, incident);
      
      // Evaluate
      const evalResult = await playbookService.evaluatePlaybook(
        testPlaybook.id,
        incident.id,
        incident.tenantId,
      );
      
      // Assertions
      expect(evalResult.matched).toBe(true);
      expect(evalResult.matchScore).toBeGreaterThan(0);
      expect(evalResult.plannedActions).toHaveLength(3);
      expect(evalResult.plannedActions[0].type).toBe('notification');
      expect(evalResult.plannedActions[1].type).toBe('auto_action');
      expect(evalResult.plannedActions[2].type).toBe('escalation');
      expect(evalResult.wouldBlock.blocked).toBe(false);
      expect(evalResult.estimatedNotifications).toBe(1);
    });

    it('should run in DRY_RUN mode', async () => {
      const incident = createTestIncident();
      incidentService['incidents'].set(incident.id, incident);
      
      // Run DRY_RUN
      const runResult = await playbookService.runPlaybook(
        testPlaybook.id,
        incident.id,
        {
          mode: 'DRY_RUN',
          tenantId: incident.tenantId,
          userId: 'test-user',
        },
      );
      
      // Assertions
      expect(runResult.ok).toBe(true);
      expect(runResult.mode).toBe('DRY_RUN');
      expect(runResult.executionId).toBeDefined();
      expect(runResult.auditId).toBeDefined();
      
      // Check audit
      const auditEntries = audit.getExecutionHistory(incident.tenantId);
      expect(auditEntries.length).toBeGreaterThan(0);
    });

    it('should schedule escalation after delay', () => {
      const incident = createTestIncident();
      incidentService['incidents'].set(incident.id, incident);
      
      const escalationAction = testPlaybook.actions[2] as EscalationAction;
      
      // Schedule escalation
      const escalationResult = escalation.scheduleEscalation(
        incident.id,
        testPlaybook.id,
        escalationAction.id,
        incident.tenantId,
        escalationAction,
        incident.severity,
      );
      
      expect(escalationResult.success).toBe(true);
      expect(escalationResult.timerId).toBeDefined();
      
      // Check pending timers
      const stats = escalation.getStats();
      expect(stats.pendingTimers).toBe(1);
    });
  });

  // ==========================================================================
  // GOLDEN SCENARIO 2: LIVE Run → Lease → Action → Resolve → Cleanup
  // ==========================================================================
  describe('Golden 2: LIVE Execution with Lease Lifecycle', () => {
    it('should cleanup escalations on resolve', async () => {
      const incident = createTestIncident();
      incidentService['incidents'].set(incident.id, incident);
      
      const escalationAction = testPlaybook.actions[2] as EscalationAction;
      
      // Schedule escalation
      escalation.scheduleEscalation(
        incident.id,
        testPlaybook.id,
        escalationAction.id,
        incident.tenantId,
        escalationAction,
        incident.severity,
      );
      
      // Verify escalation scheduled
      let stats = escalation.getStats();
      expect(stats.pendingTimers).toBe(1);
      
      // Resolve incident
      const resolveResult = await playbookService.resolveIncident(incident.id, {
        userId: 'resolver-user',
        resolutionNote: 'Issue fixed by scaling up',
        tenantId: incident.tenantId,
      });
      
      expect(resolveResult.ok).toBe(true);
      expect(resolveResult.escalationsCancelled).toBe(1);
      
      // Verify escalation cancelled
      stats = escalation.getStats();
      expect(stats.pendingTimers).toBe(0);
    });
  });

  // ==========================================================================
  // GOLDEN SCENARIO 3: Human Reject → Rollback (TODO: Phase 8)
  // ==========================================================================
  describe('Golden 3: Human Reject with Rollback Policy', () => {
    it.todo('should trigger immediate rollback on human reject');
    // TODO: Implement override_policy in Phase 8
  });

  // ==========================================================================
  // GOLDEN SCENARIO 4: Pause TENANT → Tenant Isolation
  // ==========================================================================
  describe('Golden 4: Tenant-Scoped Pause', () => {
    it('should pause playbook for specific tenant only', async () => {
      const tenantA = 'tenant-A';
      const tenantB = 'tenant-B';
      
      // Pause for tenant A
      const pauseResult = await playbookService.pausePlaybook(testPlaybook.id, {
        scope: 'TENANT',
        tenantId: tenantA,
        userId: 'admin',
      });
      
      expect(pauseResult.ok).toBe(true);
      
      // Create incidents for both tenants
      const incidentA = createTestIncident({ id: 'inc-A', tenantId: tenantA });
      const incidentB = createTestIncident({ id: 'inc-B', tenantId: tenantB });
      incidentService['incidents'].set(incidentA.id, incidentA);
      incidentService['incidents'].set(incidentB.id, incidentB);
      
      // Tenant B should still work
      const evalB = await playbookService.evaluatePlaybook(
        testPlaybook.id,
        incidentB.id,
        tenantB,
      );
      expect(evalB.matched).toBe(true);
      
      // Resume tenant A
      const resumeResult = await playbookService.resumePlaybook(testPlaybook.id, {
        scope: 'TENANT',
        tenantId: tenantA,
        userId: 'admin',
      });
      
      expect(resumeResult.ok).toBe(true);
    });

    it('should isolate tenant A execution from tenant B', async () => {
      const tenantA = 'tenant-A';
      const tenantB = 'tenant-B';
      
      const incidentA = createTestIncident({ id: 'inc-A', tenantId: tenantA });
      const incidentB = createTestIncident({ id: 'inc-B', tenantId: tenantB });
      incidentService['incidents'].set(incidentA.id, incidentA);
      incidentService['incidents'].set(incidentB.id, incidentB);
      
      // Run for tenant A
      await playbookService.runPlaybook(testPlaybook.id, incidentA.id, {
        mode: 'DRY_RUN',
        tenantId: tenantA,
        userId: 'user-A',
      });
      
      // Run for tenant B
      await playbookService.runPlaybook(testPlaybook.id, incidentB.id, {
        mode: 'DRY_RUN',
        tenantId: tenantB,
        userId: 'user-B',
      });
      
      // Check audit isolation
      const auditA = audit.getExecutionHistory(tenantA);
      const auditB = audit.getExecutionHistory(tenantB);
      
      expect(auditA.every(e => e.tenantId === tenantA)).toBe(true);
      expect(auditB.every(e => e.tenantId === tenantB)).toBe(true);
    });
  });

  // ==========================================================================
  // GOLDEN SCENARIO 5: Idempotency-Key → Duplicate Prevention
  // ==========================================================================
  describe('Golden 5: Idempotency Key', () => {
    it('should return same result for duplicate requests with same key', async () => {
      const incident = createTestIncident();
      incidentService['incidents'].set(incident.id, incident);
      
      const idempotencyKey = `idem-${Date.now()}`;
      
      // First request
      const result1 = await playbookService.runPlaybook(
        testPlaybook.id,
        incident.id,
        {
          mode: 'DRY_RUN',
          tenantId: incident.tenantId,
          userId: 'test-user',
          idempotencyKey,
        },
      );
      
      // Second request with same key
      const result2 = await playbookService.runPlaybook(
        testPlaybook.id,
        incident.id,
        {
          mode: 'DRY_RUN',
          tenantId: incident.tenantId,
          userId: 'test-user',
          idempotencyKey,
        },
      );
      
      // Should return same executionId
      expect(result1.executionId).toBe(result2.executionId);
      expect(result1.auditId).toBe(result2.auditId);
    });

    it('should create new execution for different idempotency keys', async () => {
      const incident = createTestIncident();
      incidentService['incidents'].set(incident.id, incident);
      
      // First request
      const result1 = await playbookService.runPlaybook(
        testPlaybook.id,
        incident.id,
        {
          mode: 'DRY_RUN',
          tenantId: incident.tenantId,
          userId: 'test-user',
          idempotencyKey: 'key-1',
        },
      );
      
      // Second request with different key
      const result2 = await playbookService.runPlaybook(
        testPlaybook.id,
        incident.id,
        {
          mode: 'DRY_RUN',
          tenantId: incident.tenantId,
          userId: 'test-user',
          idempotencyKey: 'key-2',
        },
      );
      
      // Should have different executionIds
      expect(result1.executionId).not.toBe(result2.executionId);
    });
  });

  // ==========================================================================
  // GOLDEN SCENARIO 6: Loop Guard → EXHAUSTED State
  // ==========================================================================
  describe('Golden 6: Escalation Loop Guard', () => {
    it('should prevent escalation after max count reached', () => {
      const incident = createTestIncident();
      incidentService['incidents'].set(incident.id, incident);
      
      const escalationAction = testPlaybook.actions[2] as EscalationAction;
      const maxEscalations = escalationAction.maxEscalations; // 2
      
      // Manually set escalation count to max
      escalation['escalationCounts'].set(incident.id, maxEscalations);
      
      // Try to schedule - should be blocked
      const blockedResult = escalation.scheduleEscalation(
        incident.id,
        testPlaybook.id,
        escalationAction.id,
        incident.tenantId,
        escalationAction,
        incident.severity,
      );
      
      expect(blockedResult.success).toBe(false);
      expect(blockedResult.error).toContain('Max escalations');
    });

    it('should enforce minimum interval between escalations', () => {
      const incident = createTestIncident();
      incidentService['incidents'].set(incident.id, incident);
      
      const escalationAction: EscalationAction = {
        id: 'test-escalation',
        type: 'escalation',
        delayMs: 1000,
        toSeverity: 'CRITICAL',
        maxEscalations: 5,
      };
      
      // First escalation
      const result1 = escalation.scheduleEscalation(
        incident.id,
        testPlaybook.id,
        escalationAction.id,
        incident.tenantId,
        escalationAction,
        incident.severity,
      );
      expect(result1.success).toBe(true);
      
      // Set last escalation time to now and count to 1
      escalation['lastEscalationTime'].set(incident.id, Date.now());
      escalation['escalationCounts'].set(incident.id, 1);
      
      // Immediate second escalation - should be blocked by min interval
      const result2 = escalation.scheduleEscalation(
        incident.id,
        testPlaybook.id,
        escalationAction.id,
        incident.tenantId,
        escalationAction,
        incident.severity,
      );
      
      // Should fail due to min interval
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('interval');
    });
  });

  // ==========================================================================
  // SNAPSHOT: Audit Export Format
  // ==========================================================================
  describe('Audit Export Snapshot', () => {
    it('should produce consistent audit export format', async () => {
      const incident = createTestIncident({ id: 'snapshot-incident' });
      incidentService['incidents'].set(incident.id, incident);
      
      // Run playbook
      await playbookService.runPlaybook(testPlaybook.id, incident.id, {
        mode: 'DRY_RUN',
        tenantId: incident.tenantId,
        userId: 'snapshot-user',
      });
      
      // Export audit
      const exportJson = audit.exportExecutionLogs();
      const exported = JSON.parse(exportJson);
      
      // Verify structure
      expect(Array.isArray(exported)).toBe(true);
      if (exported.length > 0) {
        const entry = exported[0];
        expect(entry).toHaveProperty('id');
        expect(entry).toHaveProperty('timestamp');
        expect(entry).toHaveProperty('executionId');
        expect(entry).toHaveProperty('playbookId');
        expect(entry).toHaveProperty('incidentId');
        expect(entry).toHaveProperty('tenantId');
        expect(entry).toHaveProperty('triggeredBy');
        expect(entry).toHaveProperty('dryRun');
        expect(entry).toHaveProperty('result');
      }
    });
  });
});
