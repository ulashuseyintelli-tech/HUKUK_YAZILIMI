/**
 * Promotion Workflow Tests
 * 
 * Phase 8 - Sprint 2C
 * 
 * Tests for markPromoted, applyLegalHold, and setRetentionPolicy.
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 */

import { InMemorySnapshotStore } from '../snapshot-store.service';
import { MockClockService } from '../clock.service';
import { EvidenceSnapshot } from '../../diagnostics.types';
import {
  InMemorySnapshotAuditEmitter,
  SnapshotPromotedEvent,
  SnapshotLegalHoldAppliedEvent,
  SnapshotPolicyChangedEvent,
} from '../snapshot-audit.types';

describe('Promotion Workflow', () => {
  let store: InMemorySnapshotStore;
  let clock: MockClockService;
  let auditEmitter: InMemorySnapshotAuditEmitter;

  const baseTime = new Date('2026-01-17T12:00:00Z');

  beforeEach(() => {
    clock = new MockClockService(baseTime);
    auditEmitter = new InMemorySnapshotAuditEmitter();
    store = new InMemorySnapshotStore(clock, undefined, auditEmitter);
  });

  function createSnapshot(id: string): EvidenceSnapshot {
    return {
      snapshotId: id,
      tenantId: 'tenant-001',
      incidentId: 'incident-001',
      capturedAt: baseTime.toISOString(),
      points: [
        {
          metric: 'error_rate',
          value: 0.05,
          unit: '%',
          windowSec: 300,
          confidence: 0.9,
          freshnessSec: 30,
          source: 'prometheus',
          timestamp: baseTime.toISOString(),
        },
      ],
    };
  }

  describe('markPromoted', () => {
    it('should return error when snapshot not found', async () => {
      const result = await store.markPromoted('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('SNAPSHOT_NOT_FOUND');
      expect(result.changed).toBe(false);
    });

    it('should promote STANDARD snapshot to PROMOTED', async () => {
      await store.save(createSnapshot('snap-001'));

      const result = await store.markPromoted('snap-001');

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.previousPolicy).toBe('STANDARD');
      expect(result.newPolicy).toBe('PROMOTED');
      expect(result.promotedAt).toBeDefined();

      const stored = await store.get('snap-001');
      expect(stored?.retentionPolicy).toBe('PROMOTED');
      expect(stored?.promoted).toBe(true);
      expect(stored?.promotedAt).toBe(result.promotedAt);
    });

    it('should be idempotent - second call returns changed=false', async () => {
      await store.save(createSnapshot('snap-001'));

      const result1 = await store.markPromoted('snap-001');
      const result2 = await store.markPromoted('snap-001');

      expect(result1.success).toBe(true);
      expect(result1.changed).toBe(true);

      expect(result2.success).toBe(true);
      expect(result2.changed).toBe(false);
      expect(result2.promotedAt).toBe(result1.promotedAt); // Same timestamp
    });

    it('should NOT change promotedAt on second call (immutable)', async () => {
      await store.save(createSnapshot('snap-001'));

      const result1 = await store.markPromoted('snap-001');
      
      // Advance time
      clock.advanceHours(1);
      
      const result2 = await store.markPromoted('snap-001');

      expect(result2.promotedAt).toBe(result1.promotedAt); // Unchanged
    });

    it('should return no-op for LEGAL_HOLD snapshot (LEGAL_HOLD > PROMOTED)', async () => {
      await store.save(createSnapshot('snap-001'));
      await store.applyLegalHold('snap-001');

      const result = await store.markPromoted('snap-001');

      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.newPolicy).toBe('LEGAL_HOLD'); // Stays LEGAL_HOLD
    });

    it('should emit audit event only on actual change', async () => {
      await store.save(createSnapshot('snap-001'));

      await store.markPromoted('snap-001');
      await store.markPromoted('snap-001'); // Second call

      const events = auditEmitter.getEventsByType<SnapshotPromotedEvent>('SNAPSHOT_PROMOTED');
      expect(events).toHaveLength(1); // Only one event
      expect(events[0].snapshotId).toBe('snap-001');
      expect(events[0].previousPolicy).toBe('STANDARD');
      expect(events[0].newPolicy).toBe('PROMOTED');
    });

    it('should calculate TTL based on createdAt, NOT promotedAt', async () => {
      await store.save(createSnapshot('snap-001'));
      
      // Advance 71 hours before promoting
      clock.advanceHours(71);
      
      await store.markPromoted('snap-001');

      const stored = await store.get('snap-001');
      
      // expiresAt should be createdAt + 168h, NOT promotedAt + 168h
      // createdAt = baseTime, so expiresAt = baseTime + 168h
      const expectedExpiresAt = new Date(baseTime.getTime() + 168 * 60 * 60 * 1000);
      expect(stored?.expiresAt).toBe(expectedExpiresAt.toISOString());
    });
  });

  describe('applyLegalHold', () => {
    it('should return error when snapshot not found', async () => {
      const result = await store.applyLegalHold('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('SNAPSHOT_NOT_FOUND');
    });

    it('should apply LEGAL_HOLD to STANDARD snapshot', async () => {
      await store.save(createSnapshot('snap-001'));

      const result = await store.applyLegalHold('snap-001');

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.previousPolicy).toBe('STANDARD');
      expect(result.newPolicy).toBe('LEGAL_HOLD');

      const stored = await store.get('snap-001');
      expect(stored?.retentionPolicy).toBe('LEGAL_HOLD');
      expect(stored?.expiresAt).toBeNull();
    });

    it('should apply LEGAL_HOLD to PROMOTED snapshot', async () => {
      await store.save(createSnapshot('snap-001'));
      await store.markPromoted('snap-001');

      const result = await store.applyLegalHold('snap-001');

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.previousPolicy).toBe('PROMOTED');
      expect(result.newPolicy).toBe('LEGAL_HOLD');
    });

    it('should be idempotent - second call returns changed=false', async () => {
      await store.save(createSnapshot('snap-001'));

      const result1 = await store.applyLegalHold('snap-001');
      const result2 = await store.applyLegalHold('snap-001');

      expect(result1.changed).toBe(true);
      expect(result2.changed).toBe(false);
    });

    it('should emit audit event only on actual change', async () => {
      await store.save(createSnapshot('snap-001'));

      await store.applyLegalHold('snap-001');
      await store.applyLegalHold('snap-001'); // Second call

      const events = auditEmitter.getEventsByType<SnapshotLegalHoldAppliedEvent>('SNAPSHOT_LEGAL_HOLD_APPLIED');
      expect(events).toHaveLength(1);
    });
  });

  describe('setRetentionPolicy', () => {
    it('should return error when snapshot not found', async () => {
      const result = await store.setRetentionPolicy('non-existent', 'PROMOTED');

      expect(result.success).toBe(false);
      expect(result.error).toBe('SNAPSHOT_NOT_FOUND');
    });

    describe('upgrades (allowed)', () => {
      it('should allow STANDARD → PROMOTED', async () => {
        await store.save(createSnapshot('snap-001'));

        const result = await store.setRetentionPolicy('snap-001', 'PROMOTED');

        expect(result.success).toBe(true);
        expect(result.changed).toBe(true);
        expect(result.previousPolicy).toBe('STANDARD');
        expect(result.newPolicy).toBe('PROMOTED');
      });

      it('should allow STANDARD → LEGAL_HOLD', async () => {
        await store.save(createSnapshot('snap-001'));

        const result = await store.setRetentionPolicy('snap-001', 'LEGAL_HOLD');

        expect(result.success).toBe(true);
        expect(result.changed).toBe(true);
        expect(result.newPolicy).toBe('LEGAL_HOLD');
        expect(result.newExpiresAt).toBeNull();
      });

      it('should allow PROMOTED → LEGAL_HOLD', async () => {
        await store.save(createSnapshot('snap-001'));
        await store.markPromoted('snap-001');

        const result = await store.setRetentionPolicy('snap-001', 'LEGAL_HOLD');

        expect(result.success).toBe(true);
        expect(result.changed).toBe(true);
        expect(result.previousPolicy).toBe('PROMOTED');
        expect(result.newPolicy).toBe('LEGAL_HOLD');
      });
    });

    describe('same policy (no-op)', () => {
      it('should return changed=false for same policy', async () => {
        await store.save(createSnapshot('snap-001'));

        const result = await store.setRetentionPolicy('snap-001', 'STANDARD');

        expect(result.success).toBe(true);
        expect(result.changed).toBe(false);
      });
    });

    describe('downgrades (FORBIDDEN)', () => {
      it('should reject PROMOTED → STANDARD', async () => {
        await store.save(createSnapshot('snap-001'));
        await store.markPromoted('snap-001');

        const result = await store.setRetentionPolicy('snap-001', 'STANDARD');

        expect(result.success).toBe(false);
        expect(result.error).toBe('RETENTION_DOWNGRADE_FORBIDDEN');
        expect(result.changed).toBe(false);

        // Policy should remain PROMOTED
        const stored = await store.get('snap-001');
        expect(stored?.retentionPolicy).toBe('PROMOTED');
      });

      it('should reject LEGAL_HOLD → STANDARD', async () => {
        await store.save(createSnapshot('snap-001'));
        await store.applyLegalHold('snap-001');

        const result = await store.setRetentionPolicy('snap-001', 'STANDARD');

        expect(result.success).toBe(false);
        expect(result.error).toBe('RETENTION_DOWNGRADE_FORBIDDEN');
      });

      it('should reject LEGAL_HOLD → PROMOTED', async () => {
        await store.save(createSnapshot('snap-001'));
        await store.applyLegalHold('snap-001');

        const result = await store.setRetentionPolicy('snap-001', 'PROMOTED');

        expect(result.success).toBe(false);
        expect(result.error).toBe('RETENTION_DOWNGRADE_FORBIDDEN');
      });
    });

    it('should emit audit event only on actual change', async () => {
      await store.save(createSnapshot('snap-001'));

      await store.setRetentionPolicy('snap-001', 'PROMOTED');
      await store.setRetentionPolicy('snap-001', 'PROMOTED'); // No-op

      const events = auditEmitter.getEventsByType<SnapshotPolicyChangedEvent>('SNAPSHOT_POLICY_CHANGED');
      expect(events).toHaveLength(1);
    });

    it('should NOT emit audit event on downgrade attempt', async () => {
      await store.save(createSnapshot('snap-001'));
      await store.markPromoted('snap-001');
      auditEmitter.clear();

      await store.setRetentionPolicy('snap-001', 'STANDARD'); // Rejected

      const events = auditEmitter.getEvents();
      expect(events).toHaveLength(0);
    });
  });

  describe('TTL based on createdAt (NOT promotedAt)', () => {
    it('should delete promoted snapshot after 168h from createdAt', async () => {
      await store.save(createSnapshot('snap-001'));
      
      // Promote at 71h
      clock.advanceHours(71);
      await store.markPromoted('snap-001');
      
      // At 167h from creation (96h after promotion) - should still exist
      clock.advanceHours(96);
      let stored = await store.get('snap-001');
      expect(stored).not.toBeNull();
      
      // At 169h from creation - should be expired
      clock.advanceHours(2);
      stored = await store.get('snap-001');
      expect(stored).toBeNull();
    });

    it('should NOT extend TTL when promoting late', async () => {
      await store.save(createSnapshot('snap-001'));
      
      // Promote at 71h (1h before STANDARD expiry)
      clock.advanceHours(71);
      await store.markPromoted('snap-001');
      
      // PROMOTED TTL is 168h from createdAt
      // So snapshot expires at 168h from creation, NOT 71h + 168h = 239h
      
      // At 168h from creation - should be expired
      clock.advanceHours(97); // 71 + 97 = 168h
      const stored = await store.get('snap-001');
      expect(stored).toBeNull();
    });
  });
});
