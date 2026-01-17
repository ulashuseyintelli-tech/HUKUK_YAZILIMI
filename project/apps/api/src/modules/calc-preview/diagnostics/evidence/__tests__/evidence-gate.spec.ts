/**
 * Evidence Gate Service Tests
 * 
 * Phase 8 - Sprint 1A
 * 
 * Tests for EvidenceGate flag generation and gate hierarchy enforcement.
 * 
 * @see .kiro/specs/whatif-simulation/requirements.md R1-R8
 */

import { EvidenceGateService } from '../evidence-gate.service';
import { MockClockService } from '../clock.service';
import {
  EvidenceSnapshot,
  EvidencePoint,
  EVIDENCE_THRESHOLDS,
} from '../../diagnostics.types';

describe('EvidenceGateService', () => {
  let service: EvidenceGateService;
  let mockClock: MockClockService;

  // Helper to create test snapshot
  const createSnapshot = (
    overrides: Partial<EvidenceSnapshot> = {},
    pointOverrides: Partial<EvidencePoint>[] = [],
  ): EvidenceSnapshot => {
    const basePoints: EvidencePoint[] = [
      {
        metric: 'error_rate',
        value: 2.5,
        unit: '%',
        windowSec: 60,
        confidence: 0.9,
        freshnessSec: 30,
        source: 'app_metrics',
        timestamp: mockClock.nowIso(),
      },
      {
        metric: 'latency_p99',
        value: 150,
        unit: 'ms',
        windowSec: 60,
        confidence: 0.85,
        freshnessSec: 30,
        source: 'app_metrics',
        timestamp: mockClock.nowIso(),
      },
      {
        metric: 'slo_burn_rate',
        value: 0.5,
        unit: 'ratio',
        windowSec: 60,
        confidence: 0.8,
        freshnessSec: 30,
        source: 'app_metrics',
        timestamp: mockClock.nowIso(),
      },
    ];

    // Apply point overrides
    const points = basePoints.map((point, index) => ({
      ...point,
      ...(pointOverrides[index] || {}),
    }));

    return {
      snapshotId: 'test-snapshot-001',
      tenantId: 'tenant-001',
      incidentId: 'incident-001',
      capturedAt: mockClock.nowIso(),
      points,
      ...overrides,
    };
  };

  beforeEach(() => {
    mockClock = new MockClockService(new Date('2026-01-17T12:00:00Z'));
    service = new EvidenceGateService(mockClock);
  });

  describe('evaluate', () => {
    describe('STALE_EVIDENCE flag (R5)', () => {
      it('should NOT set STALE_EVIDENCE when snapshotAgeSec <= 60', () => {
        // Snapshot captured 30 seconds ago
        const capturedAt = new Date(mockClock.nowMs() - 30 * 1000).toISOString();
        const snapshot = createSnapshot({ capturedAt });

        const result = service.evaluate(snapshot);

        expect(result.flags).not.toContain('STALE_EVIDENCE');
        expect(result.snapshotAgeSec).toBe(30);
      });

      it('should set STALE_EVIDENCE when snapshotAgeSec > 60', () => {
        // Snapshot captured 61 seconds ago
        const capturedAt = new Date(mockClock.nowMs() - 61 * 1000).toISOString();
        const snapshot = createSnapshot({ capturedAt });

        const result = service.evaluate(snapshot);

        expect(result.flags).toContain('STALE_EVIDENCE');
        expect(result.snapshotAgeSec).toBe(61);
      });

      it('should set STALE_EVIDENCE at exactly threshold + 1', () => {
        const threshold = EVIDENCE_THRESHOLDS.STALE_EVIDENCE_THRESHOLD_SEC;
        const capturedAt = new Date(mockClock.nowMs() - (threshold + 1) * 1000).toISOString();
        const snapshot = createSnapshot({ capturedAt });

        const result = service.evaluate(snapshot);

        expect(result.flags).toContain('STALE_EVIDENCE');
      });
    });

    describe('STALE_DATA flag (R7)', () => {
      it('should NOT set STALE_DATA when all points have freshnessSec <= 120', () => {
        const snapshot = createSnapshot({}, [
          { freshnessSec: 60 },
          { freshnessSec: 90 },
          { freshnessSec: 120 },
        ]);

        const result = service.evaluate(snapshot);

        expect(result.flags).not.toContain('STALE_DATA');
      });

      it('should set STALE_DATA when any point has freshnessSec > 120', () => {
        const snapshot = createSnapshot({}, [
          { freshnessSec: 60 },
          { freshnessSec: 121 }, // Stale
          { freshnessSec: 90 },
        ]);

        const result = service.evaluate(snapshot);

        expect(result.flags).toContain('STALE_DATA');
        expect(result.pointLevelFlags).toContainEqual({
          metric: 'latency_p99',
          flags: ['STALE_DATA'],
        });
      });

      it('should set STALE_DATA for multiple stale points', () => {
        const snapshot = createSnapshot({}, [
          { freshnessSec: 150 }, // Stale
          { freshnessSec: 200 }, // Stale
          { freshnessSec: 90 },
        ]);

        const result = service.evaluate(snapshot);

        expect(result.flags).toContain('STALE_DATA');
        // Should only appear once in snapshot-level flags
        expect(result.flags.filter(f => f === 'STALE_DATA')).toHaveLength(1);
        // But multiple in point-level
        expect(result.pointLevelFlags.filter(p => p.flags.includes('STALE_DATA'))).toHaveLength(2);
      });
    });

    describe('LOW_CONFIDENCE flag (R6)', () => {
      it('should NOT set LOW_CONFIDENCE when all critical metrics have confidence >= 0.5', () => {
        const snapshot = createSnapshot({}, [
          { metric: 'error_rate', confidence: 0.5 },
          { metric: 'latency_p99', confidence: 0.6 },
          { metric: 'slo_burn_rate', confidence: 0.7 },
        ]);

        const result = service.evaluate(snapshot);

        expect(result.flags).not.toContain('LOW_CONFIDENCE');
      });

      it('should set LOW_CONFIDENCE when critical metric has confidence < 0.5', () => {
        const snapshot = createSnapshot({}, [
          { metric: 'error_rate', confidence: 0.4 }, // Low confidence on critical metric
          { metric: 'latency_p99', confidence: 0.8 },
          { metric: 'slo_burn_rate', confidence: 0.9 },
        ]);

        const result = service.evaluate(snapshot);

        expect(result.flags).toContain('LOW_CONFIDENCE');
        expect(result.pointLevelFlags).toContainEqual({
          metric: 'error_rate',
          flags: ['LOW_CONFIDENCE'],
        });
      });

      it('should NOT set LOW_CONFIDENCE for non-critical metrics with low confidence', () => {
        // saturation_cpu is not a critical metric
        const snapshot: EvidenceSnapshot = {
          snapshotId: 'test-snapshot-001',
          tenantId: 'tenant-001',
          incidentId: 'incident-001',
          capturedAt: mockClock.nowIso(),
          points: [
            {
              metric: 'saturation_cpu',
              value: 80,
              unit: '%',
              windowSec: 60,
              confidence: 0.3, // Low confidence but not critical
              freshnessSec: 30,
              source: 'app_metrics',
              timestamp: mockClock.nowIso(),
            },
            {
              metric: 'error_rate',
              value: 2,
              unit: '%',
              windowSec: 60,
              confidence: 0.9, // High confidence on critical
              freshnessSec: 30,
              source: 'app_metrics',
              timestamp: mockClock.nowIso(),
            },
          ],
        };

        const result = service.evaluate(snapshot);

        expect(result.flags).not.toContain('LOW_CONFIDENCE');
      });
    });

    describe('Auto gating (R8)', () => {
      it('should allow auto-escalation and promote when no flags', () => {
        const snapshot = createSnapshot();

        const result = service.evaluate(snapshot);

        expect(result.flags).toHaveLength(0);
        expect(result.allowAutoEscalation).toBe(true);
        expect(result.allowPromote).toBe(true);
        expect(result.blockedReason).toBeUndefined();
      });

      it('should block auto-escalation and promote when STALE_EVIDENCE', () => {
        const capturedAt = new Date(mockClock.nowMs() - 120 * 1000).toISOString();
        const snapshot = createSnapshot({ capturedAt });

        const result = service.evaluate(snapshot);

        expect(result.allowAutoEscalation).toBe(false);
        expect(result.allowPromote).toBe(false);
        expect(result.blockedReason).toBe('EVIDENCE_GATE_FAILED');
        expect(result.blockedFlags).toContain('STALE_EVIDENCE');
      });

      it('should block auto-escalation and promote when STALE_DATA', () => {
        const snapshot = createSnapshot({}, [{ freshnessSec: 200 }]);

        const result = service.evaluate(snapshot);

        expect(result.allowAutoEscalation).toBe(false);
        expect(result.allowPromote).toBe(false);
        expect(result.blockedReason).toBe('EVIDENCE_GATE_FAILED');
        expect(result.blockedFlags).toContain('STALE_DATA');
      });

      it('should block auto-escalation and promote when LOW_CONFIDENCE', () => {
        const snapshot = createSnapshot({}, [
          { metric: 'error_rate', confidence: 0.3 },
        ]);

        const result = service.evaluate(snapshot);

        expect(result.allowAutoEscalation).toBe(false);
        expect(result.allowPromote).toBe(false);
        expect(result.blockedReason).toBe('EVIDENCE_GATE_FAILED');
        expect(result.blockedFlags).toContain('LOW_CONFIDENCE');
      });

      it('should block when multiple flags present', () => {
        const capturedAt = new Date(mockClock.nowMs() - 120 * 1000).toISOString();
        const snapshot = createSnapshot({ capturedAt }, [
          { metric: 'error_rate', confidence: 0.3, freshnessSec: 200 },
        ]);

        const result = service.evaluate(snapshot);

        expect(result.flags).toContain('STALE_EVIDENCE');
        expect(result.flags).toContain('STALE_DATA');
        expect(result.flags).toContain('LOW_CONFIDENCE');
        expect(result.allowAutoEscalation).toBe(false);
        expect(result.allowPromote).toBe(false);
      });
    });

    describe('Deterministic ordering', () => {
      it('should sort points by metric name for deterministic evaluation', () => {
        // Create snapshot with unsorted points
        const snapshot: EvidenceSnapshot = {
          snapshotId: 'test-snapshot-001',
          tenantId: 'tenant-001',
          incidentId: 'incident-001',
          capturedAt: mockClock.nowIso(),
          points: [
            {
              metric: 'slo_burn_rate',
              value: 0.5,
              unit: 'ratio',
              windowSec: 60,
              confidence: 0.9,
              freshnessSec: 30,
              source: 'app_metrics',
              timestamp: mockClock.nowIso(),
            },
            {
              metric: 'error_rate',
              value: 2,
              unit: '%',
              windowSec: 60,
              confidence: 0.9,
              freshnessSec: 30,
              source: 'app_metrics',
              timestamp: mockClock.nowIso(),
            },
            {
              metric: 'latency_p99',
              value: 150,
              unit: 'ms',
              windowSec: 60,
              confidence: 0.9,
              freshnessSec: 30,
              source: 'app_metrics',
              timestamp: mockClock.nowIso(),
            },
          ],
        };

        const result = service.evaluate(snapshot);

        // Should evaluate without errors
        expect(result.flags).toHaveLength(0);
        expect(result.allowAutoEscalation).toBe(true);
      });
    });
  });

  describe('canProceed', () => {
    it('should return true when both allowAutoEscalation and allowPromote are true', () => {
      const snapshot = createSnapshot();
      const result = service.evaluate(snapshot);

      expect(service.canProceed(result)).toBe(true);
    });

    it('should return false when allowAutoEscalation is false', () => {
      const capturedAt = new Date(mockClock.nowMs() - 120 * 1000).toISOString();
      const snapshot = createSnapshot({ capturedAt });
      const result = service.evaluate(snapshot);

      expect(service.canProceed(result)).toBe(false);
    });
  });

  describe('createBlockedResponse', () => {
    it('should create deterministic blocked response', () => {
      const capturedAt = new Date(mockClock.nowMs() - 120 * 1000).toISOString();
      const snapshot = createSnapshot({ capturedAt });
      const result = service.evaluate(snapshot);

      const blockedResponse = service.createBlockedResponse(result);

      expect(blockedResponse.scenarios).toEqual([]);
      expect(blockedResponse.ranking).toEqual([]);
      expect(blockedResponse.blockedReason).toBe('EVIDENCE_GATE_FAILED');
      expect(blockedResponse.blockedFlags).toContain('STALE_EVIDENCE');
      expect(blockedResponse.autoEscalationAllowed).toBe(false);
      expect(blockedResponse.promoteAllowed).toBe(false);
      expect(blockedResponse.snapshotAgeSec).toBe(120);
    });
  });
});
