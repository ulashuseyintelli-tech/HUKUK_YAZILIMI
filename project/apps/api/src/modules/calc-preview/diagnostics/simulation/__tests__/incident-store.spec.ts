/**
 * Incident Store Tests
 * 
 * Phase 8 - Sprint 2E
 * 
 * Tests for incident persistence, baseline pointer, and run summary management.
 */

import { InMemoryIncidentStore } from '../incident-store.service';
import { ClockService } from '../../evidence/clock.service';
import { Incident, IncidentRunSummary } from '../incident.types';

describe('InMemoryIncidentStore', () => {
  let store: InMemoryIncidentStore;
  let clock: ClockService;

  beforeEach(() => {
    clock = new ClockService();
    clock.setFakeTime(new Date('2025-01-15T10:00:00Z'));
    store = new InMemoryIncidentStore(clock);
  });

  describe('save and get', () => {
    it('should save and retrieve incident', async () => {
      const incident: Incident = {
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'High Error Rate',
        status: 'OPEN',
        severity: 'HIGH',
        runCount: 0,
        createdAt: '2025-01-15T09:00:00Z',
        updatedAt: '2025-01-15T09:00:00Z',
      };

      await store.save(incident);
      const retrieved = await store.get('inc-001');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.incidentId).toBe('inc-001');
      expect(retrieved?.title).toBe('High Error Rate');
      expect(retrieved?.status).toBe('OPEN');
      expect(retrieved?.runCount).toBe(0);
    });

    it('should return null for non-existent incident', async () => {
      const result = await store.get('non-existent');
      expect(result).toBeNull();
    });

    it('should update existing incident', async () => {
      const incident: Incident = {
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'High Error Rate',
        status: 'OPEN',
        severity: 'HIGH',
        runCount: 0,
        createdAt: '2025-01-15T09:00:00Z',
        updatedAt: '2025-01-15T09:00:00Z',
      };

      await store.save(incident);

      // Update status
      incident.status = 'INVESTIGATING';
      await store.save(incident);

      const retrieved = await store.get('inc-001');
      expect(retrieved?.status).toBe('INVESTIGATING');
    });

    it('should set updatedAt on save', async () => {
      const incident: Incident = {
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        status: 'OPEN',
        severity: 'LOW',
        runCount: 0,
        createdAt: '2025-01-15T09:00:00Z',
        updatedAt: '2025-01-15T09:00:00Z',
      };

      await store.save(incident);

      const retrieved = await store.get('inc-001');
      expect(retrieved?.updatedAt).toBe('2025-01-15T10:00:00.000Z');
    });

    it('should initialize runCount if not set', async () => {
      const incident = {
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        status: 'OPEN' as const,
        severity: 'LOW' as const,
        createdAt: '2025-01-15T09:00:00Z',
        updatedAt: '2025-01-15T09:00:00Z',
      } as Incident;

      await store.save(incident);

      const retrieved = await store.get('inc-001');
      expect(retrieved?.runCount).toBe(0);
    });
  });

  describe('create', () => {
    it('should create incident with defaults', async () => {
      const incident = await store.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'New Incident',
        severity: 'MEDIUM',
      });

      expect(incident.incidentId).toBe('inc-001');
      expect(incident.status).toBe('OPEN');
      expect(incident.runCount).toBe(0);
      expect(incident.createdAt).toBe('2025-01-15T10:00:00.000Z');
      expect(incident.baselineSnapshotId).toBeUndefined();
    });

    it('should create incident with description', async () => {
      const incident = await store.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'New Incident',
        description: 'Detailed description',
        severity: 'HIGH',
      });

      expect(incident.description).toBe('Detailed description');
    });
  });

  describe('setBaseline', () => {
    it('should set baseline snapshot ID', async () => {
      await store.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      await store.setBaseline('inc-001', 'snap-baseline');

      const incident = await store.get('inc-001');
      expect(incident?.baselineSnapshotId).toBe('snap-baseline');
      expect(incident?.baselineSetAt).toBe('2025-01-15T10:00:00.000Z');
    });

    it('should update baseline when called again', async () => {
      await store.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      await store.setBaseline('inc-001', 'snap-001');
      
      clock.advanceHours(1);
      await store.setBaseline('inc-001', 'snap-002');

      const incident = await store.get('inc-001');
      expect(incident?.baselineSnapshotId).toBe('snap-002');
      expect(incident?.baselineSetAt).toBe('2025-01-15T11:00:00.000Z');
    });

    it('should handle non-existent incident gracefully', async () => {
      // Should not throw
      await store.setBaseline('non-existent', 'snap-001');
      
      const incident = await store.get('non-existent');
      expect(incident).toBeNull();
    });
  });

  describe('clearBaseline', () => {
    it('should clear baseline snapshot ID', async () => {
      await store.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      await store.setBaseline('inc-001', 'snap-baseline');
      await store.clearBaseline('inc-001');

      const incident = await store.get('inc-001');
      expect(incident?.baselineSnapshotId).toBeUndefined();
      expect(incident?.baselineSetAt).toBeUndefined();
    });

    it('should handle non-existent incident gracefully', async () => {
      // Should not throw
      await store.clearBaseline('non-existent');
    });
  });

  describe('recordRun', () => {
    it('should record run summary and increment runCount', async () => {
      await store.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      const summary: IncidentRunSummary = {
        runId: 'run-001',
        verdict: 'PROCEED',
        driftScore: 0.05,
        evidenceStatus: 'PASSED',
        driftBlocked: false,
        baselineSnapshotId: 'snap-baseline',
        currentSnapshotId: 'snap-current',
        runAt: '2025-01-15T10:00:00.000Z',
      };

      await store.recordRun('inc-001', summary);

      const incident = await store.get('inc-001');
      expect(incident?.runCount).toBe(1);
      expect(incident?.lastRun).toEqual(summary);
    });

    it('should increment runCount on each run', async () => {
      await store.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      const summary1: IncidentRunSummary = {
        runId: 'run-001',
        verdict: 'PROCEED',
        driftScore: 0.05,
        evidenceStatus: 'PASSED',
        driftBlocked: false,
        baselineSnapshotId: 'snap-baseline',
        currentSnapshotId: 'snap-current-1',
        runAt: '2025-01-15T10:00:00.000Z',
      };

      const summary2: IncidentRunSummary = {
        runId: 'run-002',
        verdict: 'BLOCK_DRIFT',
        driftScore: 0.25,
        evidenceStatus: 'PASSED',
        driftBlocked: true,
        baselineSnapshotId: 'snap-baseline',
        currentSnapshotId: 'snap-current-2',
        runAt: '2025-01-15T11:00:00.000Z',
      };

      await store.recordRun('inc-001', summary1);
      await store.recordRun('inc-001', summary2);

      const incident = await store.get('inc-001');
      expect(incident?.runCount).toBe(2);
      expect(incident?.lastRun?.runId).toBe('run-002');
    });

    it('should record evidenceGateReason when evidence fails', async () => {
      await store.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test',
        severity: 'LOW',
      });

      const summary: IncidentRunSummary = {
        runId: 'run-001',
        verdict: 'BLOCK_EVIDENCE',
        driftScore: 0.05,
        evidenceStatus: 'FAILED',
        evidenceGateReason: 'STALE_EVIDENCE',
        driftBlocked: false,
        baselineSnapshotId: 'snap-baseline',
        currentSnapshotId: 'snap-current',
        runAt: '2025-01-15T10:00:00.000Z',
      };

      await store.recordRun('inc-001', summary);

      const incident = await store.get('inc-001');
      expect(incident?.lastRun?.evidenceStatus).toBe('FAILED');
      expect(incident?.lastRun?.evidenceGateReason).toBe('STALE_EVIDENCE');
    });

    it('should handle non-existent incident gracefully', async () => {
      const summary: IncidentRunSummary = {
        runId: 'run-001',
        verdict: 'PROCEED',
        driftScore: 0.05,
        evidenceStatus: 'PASSED',
        driftBlocked: false,
        baselineSnapshotId: 'snap-baseline',
        currentSnapshotId: 'snap-current',
        runAt: '2025-01-15T10:00:00.000Z',
      };

      // Should not throw
      await store.recordRun('non-existent', summary);
    });
  });

  describe('listByTenant', () => {
    it('should list incidents for tenant', async () => {
      await store.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Incident 1',
        severity: 'LOW',
      });

      clock.advanceHours(1);

      await store.create({
        incidentId: 'inc-002',
        tenantId: 'tenant-001',
        title: 'Incident 2',
        severity: 'HIGH',
      });

      const incidents = await store.listByTenant('tenant-001');

      expect(incidents).toHaveLength(2);
      // Sorted by createdAt DESC
      expect(incidents[0].incidentId).toBe('inc-002');
      expect(incidents[1].incidentId).toBe('inc-001');
    });

    it('should not include incidents from other tenants', async () => {
      await store.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Tenant 1 Incident',
        severity: 'LOW',
      });

      await store.create({
        incidentId: 'inc-002',
        tenantId: 'tenant-002',
        title: 'Tenant 2 Incident',
        severity: 'LOW',
      });

      const incidents = await store.listByTenant('tenant-001');

      expect(incidents).toHaveLength(1);
      expect(incidents[0].incidentId).toBe('inc-001');
    });

    it('should return empty array for tenant with no incidents', async () => {
      const incidents = await store.listByTenant('tenant-empty');
      expect(incidents).toHaveLength(0);
    });
  });

  describe('clear and size', () => {
    it('should clear all incidents', async () => {
      await store.create({
        incidentId: 'inc-001',
        tenantId: 'tenant-001',
        title: 'Test 1',
        severity: 'LOW',
      });

      await store.create({
        incidentId: 'inc-002',
        tenantId: 'tenant-001',
        title: 'Test 2',
        severity: 'LOW',
      });

      expect(store.size()).toBe(2);

      store.clear();

      expect(store.size()).toBe(0);
    });
  });
});
