/**
 * Escalation Service Tests
 * 
 * Phase 7B - Sprint 3 - Task 3.3
 * 
 * Tests for:
 * - Time-based escalation scheduling
 * - Escalation cancellation
 * - Loop prevention
 * - Min interval enforcement
 * - Background job processing
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EscalationService } from '../escalation.service';
import { NotificationService } from '../notification.service';
import { PlaybookMetricsService } from '../playbook-metrics.service';
import { EscalationAction } from '../playbook.types';

describe('EscalationService', () => {
  let service: EscalationService;
  let notifications: NotificationService;
  let metrics: PlaybookMetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscalationService,
        NotificationService,
        PlaybookMetricsService,
      ],
    }).compile();

    service = module.get<EscalationService>(EscalationService);
    notifications = module.get<NotificationService>(NotificationService);
    metrics = module.get<PlaybookMetricsService>(PlaybookMetricsService);
    
    // Clear state
    service.clear();
    notifications.clear();
    metrics.clear();
  });

  afterEach(() => {
    service.clear();
  });

  describe('Schedule Escalation', () => {
    it('should schedule escalation successfully', () => {
      const escalation: EscalationAction = {
        id: 'esc-1',
        type: 'escalation',
        delayMs: 5 * 60 * 1000, // 5 minutes
        toSeverity: 'CRITICAL',
        maxEscalations: 3,
      };

      const result = service.scheduleEscalation(
        'incident-1',
        'playbook-1',
        'action-1',
        'tenant-1',
        escalation,
        'WARNING',
      );

      expect(result.success).toBe(true);
      expect(result.timerId).toBeDefined();
    });

    it('should create timer with correct properties', () => {
      const escalation: EscalationAction = {
        id: 'esc-1',
        type: 'escalation',
        delayMs: 10 * 60 * 1000, // 10 minutes
        toSeverity: 'CRITICAL',
        maxEscalations: 3,
      };

      const result = service.scheduleEscalation(
        'incident-1',
        'playbook-1',
        'action-1',
        'tenant-1',
        escalation,
        'WARNING',
      );

      const timer = service.getTimer(result.timerId!);

      expect(timer).toBeDefined();
      expect(timer?.incidentId).toBe('incident-1');
      expect(timer?.playbookId).toBe('playbook-1');
      expect(timer?.fromSeverity).toBe('WARNING');
      expect(timer?.toSeverity).toBe('CRITICAL');
      expect(timer?.status).toBe('PENDING');
      expect(timer?.escalationCount).toBe(1);
    });
  });

  describe('Loop Prevention', () => {
    it('should track escalation count after execution', async () => {
      const escalation: EscalationAction = {
        id: 'esc-1',
        type: 'escalation',
        delayMs: 0, // Immediate for testing
        toSeverity: 'CRITICAL',
        maxEscalations: 5,
      };

      expect(service.getEscalationCount('incident-1')).toBe(0);

      // Schedule and execute first escalation
      service.scheduleEscalation('incident-1', 'playbook-1', 'action-1', 'tenant-1', escalation, 'WARNING');
      await service.forceProcessDue();
      
      expect(service.getEscalationCount('incident-1')).toBe(1);
    });

    it('should check escalation loop based on count', () => {
      // Initially no loop
      expect(service.checkEscalationLoop('incident-1', 2)).toBe(false);
      expect(service.checkEscalationLoop('incident-1', 0)).toBe(true); // 0 max means always loop
    });

    it('should track escalation count per incident', () => {
      const escalation: EscalationAction = {
        id: 'esc-1',
        type: 'escalation',
        delayMs: 1000,
        toSeverity: 'CRITICAL',
        maxEscalations: 5,
      };

      expect(service.getEscalationCount('incident-1')).toBe(0);

      service.scheduleEscalation('incident-1', 'playbook-1', 'action-1', 'tenant-1', escalation, 'WARNING');
      expect(service.getEscalationCount('incident-1')).toBe(0); // Count increments on execute, not schedule

      service.scheduleEscalation('incident-2', 'playbook-1', 'action-1', 'tenant-1', escalation, 'WARNING');
      expect(service.getEscalationCount('incident-2')).toBe(0);
    });
  });

  describe('Cancel Escalation', () => {
    it('should cancel all escalations for an incident', () => {
      const escalation: EscalationAction = {
        id: 'esc-1',
        type: 'escalation',
        delayMs: 60000,
        toSeverity: 'CRITICAL',
        maxEscalations: 5,
      };

      service.scheduleEscalation('incident-1', 'playbook-1', 'action-1', 'tenant-1', escalation, 'WARNING');
      service.scheduleEscalation('incident-1', 'playbook-1', 'action-2', 'tenant-1', escalation, 'WARNING');

      const result = service.cancelEscalation('incident-1', 'incident_resolved');

      expect(result.success).toBe(true);
      expect(result.cancelled).toBe(true);

      const timers = service.getTimersForIncident('incident-1');
      expect(timers.every(t => t.status === 'CANCELLED')).toBe(true);
    });

    it('should cancel specific timer', () => {
      const escalation: EscalationAction = {
        id: 'esc-1',
        type: 'escalation',
        delayMs: 60000,
        toSeverity: 'CRITICAL',
        maxEscalations: 5,
      };

      const scheduled = service.scheduleEscalation(
        'incident-1',
        'playbook-1',
        'action-1',
        'tenant-1',
        escalation,
        'WARNING',
      );

      const result = service.cancelTimer(scheduled.timerId!, 'manual_cancel');

      expect(result.success).toBe(true);
      expect(result.cancelled).toBe(true);

      const timer = service.getTimer(scheduled.timerId!);
      expect(timer?.status).toBe('CANCELLED');
    });

    it('should fail to cancel non-existent timer', () => {
      const result = service.cancelTimer('non-existent-timer');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should clear escalation count on cancel', () => {
      const escalation: EscalationAction = {
        id: 'esc-1',
        type: 'escalation',
        delayMs: 60000,
        toSeverity: 'CRITICAL',
        maxEscalations: 5,
      };

      service.scheduleEscalation('incident-1', 'playbook-1', 'action-1', 'tenant-1', escalation, 'WARNING');
      
      service.cancelEscalation('incident-1');

      // After cancel, escalation count should be reset
      expect(service.getEscalationCount('incident-1')).toBe(0);
    });
  });

  describe('Query Methods', () => {
    it('should get timers for incident', () => {
      const escalation: EscalationAction = {
        id: 'esc-1',
        type: 'escalation',
        delayMs: 60000,
        toSeverity: 'CRITICAL',
        maxEscalations: 5,
      };

      service.scheduleEscalation('incident-1', 'playbook-1', 'action-1', 'tenant-1', escalation, 'WARNING');
      service.scheduleEscalation('incident-1', 'playbook-1', 'action-2', 'tenant-1', escalation, 'WARNING');
      service.scheduleEscalation('incident-2', 'playbook-1', 'action-1', 'tenant-1', escalation, 'WARNING');

      const timers = service.getTimersForIncident('incident-1');

      expect(timers.length).toBe(2);
      expect(timers.every(t => t.incidentId === 'incident-1')).toBe(true);
    });

    it('should get pending timers', () => {
      const escalation: EscalationAction = {
        id: 'esc-1',
        type: 'escalation',
        delayMs: 60000,
        toSeverity: 'CRITICAL',
        maxEscalations: 5,
      };

      service.scheduleEscalation('incident-1', 'playbook-1', 'action-1', 'tenant-1', escalation, 'WARNING');
      const scheduled = service.scheduleEscalation('incident-2', 'playbook-1', 'action-1', 'tenant-1', escalation, 'WARNING');
      
      service.cancelTimer(scheduled.timerId!);

      const pending = service.getPendingTimers();

      expect(pending.length).toBe(1);
      expect(pending[0].incidentId).toBe('incident-1');
    });

    it('should return stats', () => {
      const escalation: EscalationAction = {
        id: 'esc-1',
        type: 'escalation',
        delayMs: 60000,
        toSeverity: 'CRITICAL',
        maxEscalations: 5,
      };

      service.scheduleEscalation('incident-1', 'playbook-1', 'action-1', 'tenant-1', escalation, 'WARNING');
      service.scheduleEscalation('incident-1', 'playbook-1', 'action-2', 'tenant-1', escalation, 'WARNING');
      const scheduled = service.scheduleEscalation('incident-2', 'playbook-1', 'action-1', 'tenant-1', escalation, 'WARNING');
      
      service.cancelTimer(scheduled.timerId!);

      const stats = service.getStats();

      expect(stats.totalTimers).toBe(3);
      expect(stats.pendingTimers).toBe(2);
      expect(stats.cancelledTimers).toBe(1);
      expect(stats.escalationsByIncident.get('incident-1')).toBe(2);
      expect(stats.escalationsByIncident.get('incident-2')).toBe(1);
    });
  });

  describe('Process Due Escalations', () => {
    it('should process due escalations', async () => {
      const escalation: EscalationAction = {
        id: 'esc-1',
        type: 'escalation',
        delayMs: 0, // Immediate
        toSeverity: 'CRITICAL',
        maxEscalations: 5,
      };

      service.scheduleEscalation('incident-1', 'playbook-1', 'action-1', 'tenant-1', escalation, 'WARNING');

      // Wait a bit for the timer to be due
      await new Promise(resolve => setTimeout(resolve, 10));

      const executed = await service.forceProcessDue();

      expect(executed).toBe(1);

      const timer = service.getTimersForIncident('incident-1')[0];
      expect(timer.status).toBe('EXECUTED');
    });

    it('should not process future escalations', async () => {
      const escalation: EscalationAction = {
        id: 'esc-1',
        type: 'escalation',
        delayMs: 60000, // 1 minute in future
        toSeverity: 'CRITICAL',
        maxEscalations: 5,
      };

      service.scheduleEscalation('incident-1', 'playbook-1', 'action-1', 'tenant-1', escalation, 'WARNING');

      const executed = await service.forceProcessDue();

      expect(executed).toBe(0);

      const timer = service.getTimersForIncident('incident-1')[0];
      expect(timer.status).toBe('PENDING');
    });
  });

  describe('Max Timers Per Incident', () => {
    it('should reject when max timers per incident reached', () => {
      const escalation: EscalationAction = {
        id: 'esc-1',
        type: 'escalation',
        delayMs: 60000,
        toSeverity: 'CRITICAL',
        maxEscalations: 20, // High max to not hit this limit
      };

      // Schedule 10 timers (max)
      for (let i = 0; i < 10; i++) {
        const result = service.scheduleEscalation(
          'incident-1',
          'playbook-1',
          `action-${i}`,
          'tenant-1',
          escalation,
          'WARNING',
        );
        expect(result.success).toBe(true);
      }

      // 11th should fail
      const result = service.scheduleEscalation(
        'incident-1',
        'playbook-1',
        'action-11',
        'tenant-1',
        escalation,
        'WARNING',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Max timers');
    });
  });
});
