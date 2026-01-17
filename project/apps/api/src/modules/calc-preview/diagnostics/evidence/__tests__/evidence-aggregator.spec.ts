/**
 * Evidence Aggregator Service Tests
 * 
 * Phase 8 - Sprint 1A
 * 
 * Tests for EvidenceAggregator metric collection and snapshot creation.
 * 
 * @see .kiro/specs/whatif-simulation/requirements.md R1-R4
 */

import { EvidenceAggregatorService, MetricAdapter } from '../evidence-aggregator.service';
import { MockClockService } from '../clock.service';
import { DiagnosticsAggregatorService } from '../../diagnostics-aggregator.service';
import { EvidenceMetricType, sortEvidencePoints } from '../../diagnostics.types';

describe('EvidenceAggregatorService', () => {
  let service: EvidenceAggregatorService;
  let mockClock: MockClockService;
  let mockDiagnosticsAggregator: jest.Mocked<DiagnosticsAggregatorService>;

  beforeEach(() => {
    mockClock = new MockClockService(new Date('2026-01-17T12:00:00Z'));
    
    // Mock DiagnosticsAggregatorService
    mockDiagnosticsAggregator = {
      getMetricsData: jest.fn().mockReturnValue({
        latency: { p50: 100, p95: 200, p99: 350 },
        rates: { success: 97, fallback: 1, stale: 1, error: 2 },
        counts: { total: 1000, success: 970, fallback: 10, error: 20 },
      }),
      getSLOStatus: jest.fn().mockReturnValue({
        successRate: 97,
        p95Latency: 200,
        isHealthy: true,
      }),
    } as unknown as jest.Mocked<DiagnosticsAggregatorService>;

    service = new EvidenceAggregatorService(mockClock, mockDiagnosticsAggregator);
  });

  describe('captureSnapshot', () => {
    it('should capture snapshot with all registered metrics', () => {
      const snapshot = service.captureSnapshot('tenant-001', 'incident-001', 60);

      expect(snapshot.snapshotId).toBeDefined();
      expect(snapshot.tenantId).toBe('tenant-001');
      expect(snapshot.incidentId).toBe('incident-001');
      expect(snapshot.capturedAt).toBe('2026-01-17T12:00:00.000Z');
      expect(snapshot.points.length).toBeGreaterThanOrEqual(3);
    });

    it('should throw error when tenantId is missing', () => {
      expect(() => service.captureSnapshot('', 'incident-001', 60)).toThrow(
        'tenantId is required for evidence capture',
      );
    });

    it('should include error_rate metric', () => {
      const snapshot = service.captureSnapshot('tenant-001', 'incident-001', 60);
      const errorRatePoint = snapshot.points.find(p => p.metric === 'error_rate');

      expect(errorRatePoint).toBeDefined();
      expect(errorRatePoint?.value).toBe(2); // From mock
      expect(errorRatePoint?.unit).toBe('%');
      expect(errorRatePoint?.source).toBe('app_metrics');
    });

    it('should include latency_p99 metric', () => {
      const snapshot = service.captureSnapshot('tenant-001', 'incident-001', 60);
      const latencyPoint = snapshot.points.find(p => p.metric === 'latency_p99');

      expect(latencyPoint).toBeDefined();
      expect(latencyPoint?.value).toBe(350); // From mock
      expect(latencyPoint?.unit).toBe('ms');
    });

    it('should include slo_burn_rate metric', () => {
      const snapshot = service.captureSnapshot('tenant-001', 'incident-001', 60);
      const burnRatePoint = snapshot.points.find(p => p.metric === 'slo_burn_rate');

      expect(burnRatePoint).toBeDefined();
      expect(burnRatePoint?.unit).toBe('ratio');
      // burn_rate = (100 - 97) / (100 - 95) = 3/5 = 0.6
      expect(burnRatePoint?.value).toBe(0.6);
    });

    it('should sort points by metric name for determinism', () => {
      const snapshot = service.captureSnapshot('tenant-001', 'incident-001', 60);
      const metrics = snapshot.points.map(p => p.metric);

      // Should be sorted alphabetically
      const sortedMetrics = [...metrics].sort();
      expect(metrics).toEqual(sortedMetrics);
    });

    it('should generate unique snapshotId for each capture', () => {
      const snapshot1 = service.captureSnapshot('tenant-001', 'incident-001', 60);
      const snapshot2 = service.captureSnapshot('tenant-001', 'incident-001', 60);

      expect(snapshot1.snapshotId).not.toBe(snapshot2.snapshotId);
    });

    it('should use provided windowSec', () => {
      const snapshot = service.captureSnapshot('tenant-001', 'incident-001', 120);
      
      snapshot.points.forEach(point => {
        expect(point.windowSec).toBe(120);
      });
    });

    it('should default windowSec to 60', () => {
      const snapshot = service.captureSnapshot('tenant-001', 'incident-001');
      
      snapshot.points.forEach(point => {
        expect(point.windowSec).toBe(60);
      });
    });
  });

  describe('confidence calculation', () => {
    it('should have high confidence with many samples', () => {
      mockDiagnosticsAggregator.getMetricsData.mockReturnValue({
        latency: { p50: 100, p95: 200, p99: 350 },
        rates: { success: 97, fallback: 1, stale: 1, error: 2 },
        counts: { total: 1000, success: 970, fallback: 10, error: 20 },
      });

      const snapshot = service.captureSnapshot('tenant-001', 'incident-001', 60);
      const errorRatePoint = snapshot.points.find(p => p.metric === 'error_rate');

      expect(errorRatePoint?.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('should have low confidence with few samples', () => {
      mockDiagnosticsAggregator.getMetricsData.mockReturnValue({
        latency: { p50: 100, p95: 200, p99: 350 },
        rates: { success: 97, fallback: 1, stale: 1, error: 2 },
        counts: { total: 5, success: 4, fallback: 0, error: 1 },
      });

      const snapshot = service.captureSnapshot('tenant-001', 'incident-001', 60);
      const errorRatePoint = snapshot.points.find(p => p.metric === 'error_rate');

      expect(errorRatePoint?.confidence).toBeLessThanOrEqual(0.5);
    });
  });

  describe('registerAdapter', () => {
    it('should allow registering custom adapters', () => {
      const customAdapter: MetricAdapter = {
        metric: 'saturation_cpu',
        collect: (_tenantId: string, windowSec: number) => ({
          metric: 'saturation_cpu',
          value: 75,
          unit: '%',
          windowSec,
          confidence: 0.9,
          freshnessSec: 10,
          source: 'prometheus',
          timestamp: mockClock.nowIso(),
        }),
      };

      service.registerAdapter(customAdapter);
      const snapshot = service.captureSnapshot('tenant-001', 'incident-001', 60);
      const cpuPoint = snapshot.points.find(p => p.metric === 'saturation_cpu');

      expect(cpuPoint).toBeDefined();
      expect(cpuPoint?.value).toBe(75);
    });
  });

  describe('getRegisteredMetrics', () => {
    it('should return list of registered metrics', () => {
      const metrics = service.getRegisteredMetrics();

      expect(metrics).toContain('error_rate');
      expect(metrics).toContain('latency_p99');
      expect(metrics).toContain('slo_burn_rate');
    });
  });

  describe('error handling', () => {
    it('should continue collecting when one adapter fails', () => {
      // Make error_rate adapter fail
      mockDiagnosticsAggregator.getMetricsData.mockImplementation((_tenantId, window) => {
        if (window === '15m') {
          throw new Error('Metrics unavailable');
        }
        return {
          latency: { p50: 100, p95: 200, p99: 350 },
          rates: { success: 97, fallback: 1, stale: 1, error: 2 },
          counts: { total: 1000, success: 970, fallback: 10, error: 20 },
        };
      });

      // Should not throw, but may have fewer points
      const snapshot = service.captureSnapshot('tenant-001', 'incident-001', 60);
      expect(snapshot.snapshotId).toBeDefined();
    });
  });
});

describe('sortEvidencePoints', () => {
  it('should sort points alphabetically by metric', () => {
    const points = [
      { metric: 'slo_burn_rate' as EvidenceMetricType, value: 0.5, unit: 'ratio', windowSec: 60, confidence: 0.9, freshnessSec: 0, source: 'app_metrics' as const, timestamp: '' },
      { metric: 'error_rate' as EvidenceMetricType, value: 2, unit: '%', windowSec: 60, confidence: 0.9, freshnessSec: 0, source: 'app_metrics' as const, timestamp: '' },
      { metric: 'latency_p99' as EvidenceMetricType, value: 350, unit: 'ms', windowSec: 60, confidence: 0.9, freshnessSec: 0, source: 'app_metrics' as const, timestamp: '' },
    ];

    const sorted = sortEvidencePoints(points);

    expect(sorted[0].metric).toBe('error_rate');
    expect(sorted[1].metric).toBe('latency_p99');
    expect(sorted[2].metric).toBe('slo_burn_rate');
  });

  it('should not mutate original array', () => {
    const points = [
      { metric: 'slo_burn_rate' as EvidenceMetricType, value: 0.5, unit: 'ratio', windowSec: 60, confidence: 0.9, freshnessSec: 0, source: 'app_metrics' as const, timestamp: '' },
      { metric: 'error_rate' as EvidenceMetricType, value: 2, unit: '%', windowSec: 60, confidence: 0.9, freshnessSec: 0, source: 'app_metrics' as const, timestamp: '' },
    ];

    const sorted = sortEvidencePoints(points);

    expect(points[0].metric).toBe('slo_burn_rate'); // Original unchanged
    expect(sorted[0].metric).toBe('error_rate'); // Sorted copy
  });
});
