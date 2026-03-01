/**
 * Incident Store Tests
 * 
 * Production Alerting System - Sprint 1 Gate A
 * 
 * Tests for IIncidentStore implementations:
 * - InMemoryIncidentStore
 * 
 * Test categories:
 * A) Invariants - same alertKey → same incident, resolve removes active, etc.
 * B) Atomicity - concurrent createOrGetActive must produce single incident
 * C) Global outage listing
 * 
 * @see .kiro/specs/production-alerting-system/design.md
 * @see Requirements 12.2, 13.1, 16.1
 */

import {
  AlertCategory,
  AlertSeverity,
  IncidentStatus,
  ResolutionReason,
  TenantScope,
  AvailabilityAlertTypes,
} from '../types/alerting.types';
import { StoreNotFoundError } from '../errors/alerting.errors';
import { CreateOrGetActiveInput } from '../stores/incident-store.interface';
import { InMemoryIncidentStore } from '../stores/inmemory-incident-store';

describe('InMemoryIncidentStore', () => {
  let store: InMemoryIncidentStore;

  const BASE_INPUT: CreateOrGetActiveInput = {
    alertKey: 'test-alert-key',
    correlationId: 'corr-001',
    nowMs: 1700000000000,
    initial: {
      alertType: AvailabilityAlertTypes.DEGRADED_ENTERED,
      category: AlertCategory.AVAILABILITY,
      severity: AlertSeverity.P2,
      tenantScope: TenantScope.SingleTenant,
      tenantId: 'tenant-1',
      component: 'calc-preview',
    },
  };

  beforeEach(() => {
    store = new InMemoryIncidentStore();
  });

  // A) Invariants

  describe('A) Invariants', () => {
    it('should create a new incident for a new alertKey', async () => {
      const result = await store.createOrGetActive(BASE_INPUT);
      expect(result.created).toBe(true);
      expect(result.incident.alertKey).toBe('test-alert-key');
      expect(result.incident.status).toBe(IncidentStatus.Open);
      expect(result.incident.alertCount).toBe(1);
    });

    it('should return existing incident for same alertKey', async () => {
      const first = await store.createOrGetActive(BASE_INPUT);
      const second = await store.createOrGetActive({
        ...BASE_INPUT,
        correlationId: 'corr-002',
        nowMs: BASE_INPUT.nowMs + 5000,
      });
      expect(second.created).toBe(false);
      expect(second.incident.incidentId).toBe(first.incident.incidentId);
    });

    it('should allow new incident after resolve for same alertKey', async () => {
      const first = await store.createOrGetActive(BASE_INPUT);
      await store.resolve(first.incident.incidentId, {
        nowMs: BASE_INPUT.nowMs + 60000,
        reason: ResolutionReason.AutoRecovery,
      });
      const second = await store.createOrGetActive({
        ...BASE_INPUT,
        nowMs: BASE_INPUT.nowMs + 120000,
      });
      expect(second.created).toBe(true);
      expect(second.incident.incidentId).not.toBe(first.incident.incidentId);
    });

    it('should remove active mapping on resolve', async () => {
      const { incident } = await store.createOrGetActive(BASE_INPUT);
      await store.resolve(incident.incidentId, {
        nowMs: BASE_INPUT.nowMs + 60000,
        reason: ResolutionReason.ManualReset,
      });
      const active = await store.findActiveByAlertKey('test-alert-key');
      expect(active).toBeNull();
    });

    it('should get incident by ID', async () => {
      const { incident } = await store.createOrGetActive(BASE_INPUT);
      const fetched = await store.get(incident.incidentId);
      expect(fetched).not.toBeNull();
      expect(fetched!.incidentId).toBe(incident.incidentId);
    });

    it('should return null for unknown incident ID', async () => {
      const fetched = await store.get('nonexistent');
      expect(fetched).toBeNull();
    });

    it('should throw StoreNotFoundError on resolve of unknown ID', async () => {
      await expect(
        store.resolve('nonexistent', {
          nowMs: Date.now(),
          reason: ResolutionReason.Timeout,
        }),
      ).rejects.toThrow(StoreNotFoundError);
    });

    it('should throw StoreNotFoundError on appendAlert of unknown ID', async () => {
      await expect(
        store.appendAlert('nonexistent', {
          nowMs: Date.now(),
          alertId: 'alert-1',
        }),
      ).rejects.toThrow(StoreNotFoundError);
    });
  });

  // B) Atomicity

  describe('B) Atomicity', () => {
    it('should produce single incident under concurrent createOrGetActive', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        store.createOrGetActive({
          ...BASE_INPUT,
          correlationId: `corr-${i}`,
          nowMs: BASE_INPUT.nowMs + i,
        }),
      );
      const results = await Promise.all(promises);
      const createdCount = results.filter((r) => r.created).length;
      expect(createdCount).toBe(1);

      const ids = new Set(results.map((r) => r.incident.incidentId));
      expect(ids.size).toBe(1);
    });
  });

  // C) Global outage listing

  describe('C) Global outage listing', () => {
    it('should list active global outages', async () => {
      await store.createOrGetActive({
        ...BASE_INPUT,
        alertKey: 'global-1',
        initial: {
          ...BASE_INPUT.initial,
          tenantScope: TenantScope.Global,
          kind: 'GLOBAL_OUTAGE',
        },
      });
      await store.createOrGetActive({
        ...BASE_INPUT,
        alertKey: 'regular-1',
      });
      const outages = await store.listActiveGlobalOutages();
      expect(outages).toHaveLength(1);
      expect(outages[0].kind).toBe('GLOBAL_OUTAGE');
    });

    it('should not list resolved global outages', async () => {
      const { incident } = await store.createOrGetActive({
        ...BASE_INPUT,
        alertKey: 'global-resolved',
        initial: {
          ...BASE_INPUT.initial,
          tenantScope: TenantScope.Global,
          kind: 'GLOBAL_OUTAGE',
        },
      });
      await store.resolve(incident.incidentId, {
        nowMs: BASE_INPUT.nowMs + 60000,
        reason: ResolutionReason.AutoRecovery,
      });
      const outages = await store.listActiveGlobalOutages();
      expect(outages).toHaveLength(0);
    });
  });

  // D) Correlation index

  describe('D) Correlation index', () => {
    it('should find incidents by correlationId', async () => {
      await store.createOrGetActive(BASE_INPUT);
      await store.createOrGetActive({
        ...BASE_INPUT,
        alertKey: 'other-key',
        correlationId: 'corr-001',
      });
      const found = await store.findByCorrelationId('corr-001');
      expect(found).toHaveLength(2);
    });

    it('should return empty for unknown correlationId', async () => {
      const found = await store.findByCorrelationId('unknown');
      expect(found).toHaveLength(0);
    });
  });

  // E) appendAlert

  describe('E) appendAlert', () => {
    it('should increment alertCount and update lastAlertAt', async () => {
      const { incident } = await store.createOrGetActive(BASE_INPUT);
      const updated = await store.appendAlert(incident.incidentId, {
        nowMs: BASE_INPUT.nowMs + 30000,
        alertId: 'alert-2',
      });
      expect(updated.alertCount).toBe(2);
      expect(new Date(updated.lastAlertAt).getTime()).toBe(BASE_INPUT.nowMs + 30000);
    });
  });

  // F) resolve details

  describe('F) resolve', () => {
    it('should set resolution details correctly', async () => {
      const { incident } = await store.createOrGetActive(BASE_INPUT);
      const resolved = await store.resolve(incident.incidentId, {
        nowMs: BASE_INPUT.nowMs + 120000,
        reason: ResolutionReason.ManualReset,
        resolvedBy: 'operator-1',
        rootCauseHint: 'Provider timeout',
      });
      expect(resolved.status).toBe(IncidentStatus.Resolved);
      expect(resolved.resolution).toBeDefined();
      expect(resolved.resolution!.reason).toBe(ResolutionReason.ManualReset);
      expect(resolved.resolution!.durationMs).toBe(120000);
      expect(resolved.resolution!.resolvedBy).toBe('operator-1');
      expect(resolved.resolution!.rootCauseHint).toBe('Provider timeout');
    });
  });
});
