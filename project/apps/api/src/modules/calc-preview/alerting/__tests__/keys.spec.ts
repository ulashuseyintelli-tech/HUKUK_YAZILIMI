/**
 * Key Generation Tests
 * 
 * Production Alerting System - Sprint 0 Gate A
 * 
 * Tests for deterministic key generation.
 * 
 * @see Requirements 13.2, 16.1
 */

import { NotificationChannel, TenantScope } from '../types/alerting.types';
import {
  makeAlertKey,
  makeAlertKeyFromParts,
  makeCorrelationId,
  makeCorrelationIdFromParts,
  makeIdempotencyKey,
  makeIncidentId,
  makeAlertId,
  makeOutageId,
  makeSignalId,
  makeNotificationId,
  makeDeadLetterId,
  buildRateLimitDimension,
  buildQueueDimension,
  buildDegradedDimension,
  buildSecurityAnomalyDimension,
  buildResourceDimension,
  buildIntegrityDimension,
  buildHygieneDimension,
} from '../core/keys';

describe('Key Generation', () => {
  describe('makeAlertKey', () => {
    it('should produce same key for same inputs', () => {
      const params = {
        alertType: 'DEGRADED_PERSISTING',
        tenantScope: TenantScope.SingleTenant,
        primaryDimension: 'tenant-123:calc-preview',
        component: 'circuit-breaker',
      };

      const key1 = makeAlertKey(params);
      const key2 = makeAlertKey(params);

      expect(key1).toBe(key2);
    });

    it('should produce different keys for different alert types', () => {
      const base = {
        tenantScope: TenantScope.SingleTenant,
        primaryDimension: 'tenant-123',
        component: 'circuit-breaker',
      };

      const key1 = makeAlertKey({ ...base, alertType: 'DEGRADED_ENTERED' });
      const key2 = makeAlertKey({ ...base, alertType: 'DEGRADED_PERSISTING' });

      expect(key1).not.toBe(key2);
    });

    it('should produce different keys for different tenant scopes', () => {
      const base = {
        alertType: 'DEGRADED_PERSISTING',
        primaryDimension: 'tenant-123',
        component: 'circuit-breaker',
      };

      const key1 = makeAlertKey({ ...base, tenantScope: TenantScope.SingleTenant });
      const key2 = makeAlertKey({ ...base, tenantScope: TenantScope.MultiTenant });

      expect(key1).not.toBe(key2);
    });

    it('should produce different keys for different dimensions', () => {
      const base = {
        alertType: 'DEGRADED_PERSISTING',
        tenantScope: TenantScope.SingleTenant,
        component: 'circuit-breaker',
      };

      const key1 = makeAlertKey({ ...base, primaryDimension: 'tenant-123' });
      const key2 = makeAlertKey({ ...base, primaryDimension: 'tenant-456' });

      expect(key1).not.toBe(key2);
    });

    it('should produce different keys for different components', () => {
      const base = {
        alertType: 'DEGRADED_PERSISTING',
        tenantScope: TenantScope.SingleTenant,
        primaryDimension: 'tenant-123',
      };

      const key1 = makeAlertKey({ ...base, component: 'circuit-breaker' });
      const key2 = makeAlertKey({ ...base, component: 'rate-limiter' });

      expect(key1).not.toBe(key2);
    });

    it('makeAlertKeyFromParts should match makeAlertKey', () => {
      const params = {
        alertType: 'DEGRADED_PERSISTING',
        tenantScope: TenantScope.SingleTenant,
        primaryDimension: 'tenant-123',
        component: 'circuit-breaker',
      };

      const key1 = makeAlertKey(params);
      const key2 = makeAlertKeyFromParts(
        params.alertType,
        params.tenantScope,
        params.primaryDimension,
        params.component,
      );

      expect(key1).toBe(key2);
    });

    // Determinism test - same inputs always produce same output
    it('should produce consistent key across multiple calls', () => {
      const params = {
        alertType: 'DEGRADED_PERSISTING',
        tenantScope: TenantScope.SingleTenant,
        primaryDimension: 'tenant-test',
        component: 'circuit-breaker',
      };

      const key1 = makeAlertKey(params);
      const key2 = makeAlertKey(params);
      const key3 = makeAlertKey(params);

      expect(key1).toBe(key2);
      expect(key2).toBe(key3);
      expect(key1).toHaveLength(16);
      expect(key1).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('makeCorrelationId', () => {
    it('should produce same ID for same inputs within same window', () => {
      const params = {
        rootDimension: 'deploy-123',
        timestampMs: 1700000000000,
        componentCluster: 'calc-preview',
      };

      const id1 = makeCorrelationId(params);
      const id2 = makeCorrelationId(params);

      expect(id1).toBe(id2);
    });

    it('should produce same ID for timestamps within same 5-minute window', () => {
      const base = {
        rootDimension: 'deploy-123',
        componentCluster: 'calc-preview',
      };

      // Calculate a timestamp that's at the start of a 5-minute window
      const windowMs = 5 * 60 * 1000;
      const baseTimestamp = Math.floor(1700000000000 / windowMs) * windowMs; // Start of window
      
      // Both timestamps within same window
      const id1 = makeCorrelationId({ ...base, timestampMs: baseTimestamp });
      const id2 = makeCorrelationId({ ...base, timestampMs: baseTimestamp + 4 * 60 * 1000 }); // +4 minutes, still in same window

      expect(id1).toBe(id2);
    });

    it('should produce different IDs for timestamps in different windows', () => {
      const base = {
        rootDimension: 'deploy-123',
        componentCluster: 'calc-preview',
      };

      // Different 5-minute windows
      const id1 = makeCorrelationId({ ...base, timestampMs: 1700000000000 });
      const id2 = makeCorrelationId({ ...base, timestampMs: 1700000000000 + 6 * 60 * 1000 }); // +6 minutes

      expect(id1).not.toBe(id2);
    });

    it('should produce different IDs for different root dimensions', () => {
      const base = {
        timestampMs: 1700000000000,
        componentCluster: 'calc-preview',
      };

      const id1 = makeCorrelationId({ ...base, rootDimension: 'deploy-123' });
      const id2 = makeCorrelationId({ ...base, rootDimension: 'deploy-456' });

      expect(id1).not.toBe(id2);
    });

    it('should support custom window size', () => {
      const base = {
        rootDimension: 'deploy-123',
        componentCluster: 'calc-preview',
      };

      // 10-minute window
      const windowMs = 10 * 60 * 1000;
      const baseTimestamp = Math.floor(1700000000000 / windowMs) * windowMs; // Start of window
      
      const id1 = makeCorrelationId({ ...base, timestampMs: baseTimestamp, windowMs });
      const id2 = makeCorrelationId({ ...base, timestampMs: baseTimestamp + 9 * 60 * 1000, windowMs }); // +9 minutes, still in same window

      expect(id1).toBe(id2);
    });

    it('makeCorrelationIdFromParts should match makeCorrelationId', () => {
      const params = {
        rootDimension: 'deploy-123',
        timestampMs: 1700000000000,
        componentCluster: 'calc-preview',
      };

      const id1 = makeCorrelationId(params);
      const id2 = makeCorrelationIdFromParts(
        params.rootDimension,
        params.timestampMs,
        params.componentCluster,
      );

      expect(id1).toBe(id2);
    });
  });

  describe('makeIdempotencyKey', () => {
    it('should produce same key for same inputs within same window', () => {
      const params = {
        alertId: 'alt_123',
        channel: NotificationChannel.Slack,
        timestampMs: 1700000000000,
      };

      const key1 = makeIdempotencyKey(params);
      const key2 = makeIdempotencyKey(params);

      expect(key1).toBe(key2);
    });

    it('should include alert ID, channel, and bucket in key', () => {
      const key = makeIdempotencyKey({
        alertId: 'alt_123',
        channel: NotificationChannel.Slack,
        timestampMs: 1700000000000,
      });

      expect(key).toContain('alt_123');
      expect(key).toContain('slack');
    });

    it('should produce different keys for different channels', () => {
      const base = {
        alertId: 'alt_123',
        timestampMs: 1700000000000,
      };

      const key1 = makeIdempotencyKey({ ...base, channel: NotificationChannel.Slack });
      const key2 = makeIdempotencyKey({ ...base, channel: NotificationChannel.PagerDuty });

      expect(key1).not.toBe(key2);
    });
  });

  describe('makeIncidentId', () => {
    it('should produce unique IDs with inc_ prefix', () => {
      const id = makeIncidentId({
        alertKey: 'abc123',
        timestampMs: 1700000000000,
      });

      expect(id).toMatch(/^inc_/);
    });

    it('should be deterministic', () => {
      const params = {
        alertKey: 'abc123',
        timestampMs: 1700000000000,
      };

      const id1 = makeIncidentId(params);
      const id2 = makeIncidentId(params);

      expect(id1).toBe(id2);
    });
  });

  describe('makeAlertId', () => {
    it('should produce unique IDs with alt_ prefix', () => {
      const id = makeAlertId({
        incidentId: 'inc_123',
        sequence: 1,
        timestampMs: 1700000000000,
      });

      expect(id).toMatch(/^alt_/);
    });

    it('should produce different IDs for different sequences', () => {
      const base = {
        incidentId: 'inc_123',
        timestampMs: 1700000000000,
      };

      const id1 = makeAlertId({ ...base, sequence: 1 });
      const id2 = makeAlertId({ ...base, sequence: 2 });

      expect(id1).not.toBe(id2);
    });
  });

  describe('makeOutageId', () => {
    it('should produce unique IDs with out_ prefix', () => {
      const id = makeOutageId({
        reason: 'multi_tenant_escalation',
        timestampMs: 1700000000000,
      });

      expect(id).toMatch(/^out_/);
    });
  });

  describe('makeSignalId', () => {
    it('should produce unique IDs with sig_ prefix', () => {
      const id = makeSignalId({
        collectorType: 'security',
        signalType: 'JTI_ANOMALY',
        timestampMs: 1700000000000,
      });

      expect(id).toMatch(/^sig_/);
    });
  });

  describe('makeNotificationId', () => {
    it('should produce unique IDs with ntf_ prefix', () => {
      const id = makeNotificationId({
        alertId: 'alt_123',
        timestampMs: 1700000000000,
      });

      expect(id).toMatch(/^ntf_/);
    });
  });

  describe('makeDeadLetterId', () => {
    it('should produce unique IDs with dlq_ prefix', () => {
      const id = makeDeadLetterId({
        notificationId: 'ntf_123',
        timestampMs: 1700000000000,
      });

      expect(id).toMatch(/^dlq_/);
    });
  });

  describe('Primary Dimension Builders', () => {
    it('buildRateLimitDimension should combine tenant and limit key', () => {
      const dim = buildRateLimitDimension('tenant-123', 'api-calls');
      expect(dim).toBe('tenant-123:api-calls');
    });

    it('buildQueueDimension should return queue name', () => {
      const dim = buildQueueDimension('calc-preview-queue');
      expect(dim).toBe('calc-preview-queue');
    });

    it('buildDegradedDimension should return service name', () => {
      const dim = buildDegradedDimension('circuit-breaker');
      expect(dim).toBe('circuit-breaker');
    });

    it('buildSecurityAnomalyDimension should include bucket when JTI provided', () => {
      const dim = buildSecurityAnomalyDimension('HIGH_USAGE', 'jti-123', 1700000000000);
      expect(dim).toContain('HIGH_USAGE');
      expect(dim).toContain('jti-123');
    });

    it('buildSecurityAnomalyDimension should return anomaly kind when no JTI', () => {
      const dim = buildSecurityAnomalyDimension('MULTI_ACTOR');
      expect(dim).toBe('MULTI_ACTOR');
    });

    it('buildResourceDimension should combine resource type and component', () => {
      const dim = buildResourceDimension('cpu', 'api-server');
      expect(dim).toBe('cpu:api-server');
    });

    it('buildIntegrityDimension should combine component and check type', () => {
      const dim = buildIntegrityDimension('audit-store', 'write');
      expect(dim).toBe('audit-store:write');
    });

    it('buildHygieneDimension should return error type', () => {
      const dim = buildHygieneDimension('validation_error');
      expect(dim).toBe('validation_error');
    });
  });
});
