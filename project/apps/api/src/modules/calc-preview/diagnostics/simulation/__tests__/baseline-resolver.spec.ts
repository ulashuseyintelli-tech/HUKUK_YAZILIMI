/**
 * Baseline Resolver Tests
 * 
 * Phase 8 - Sprint 2D
 * 
 * Tests for baseline selection and protection.
 * 
 * Key behaviors:
 * - Selection priority: PROMOTED > STANDARD
 * - Auto LEGAL_HOLD on simulation start
 * - Baseline pointer prevents "baseline deleted" scenario
 */

import { BaselineResolverService } from '../baseline-resolver.service';
import { InMemorySnapshotStore } from '../../evidence/snapshot-store.service';
import { ClockService } from '../../evidence/clock.service';
import { EvidenceSnapshot } from '../../diagnostics.types';

describe('BaselineResolverService', () => {
  let resolver: BaselineResolverService;
  let snapshotStore: InMemorySnapshotStore;
  let clock: ClockService;

  beforeEach(() => {
    clock = new ClockService();
    clock.setFakeTime(new Date('2025-01-15T10:00:00Z'));
    snapshotStore = new InMemorySnapshotStore(clock);
    resolver = new BaselineResolverService(snapshotStore);
  });

  const createSnapshot = (
    snapshotId: string,
    incidentId: string,
    capturedAt: string,
  ): EvidenceSnapshot => ({
    snapshotId,
    tenantId: 'tenant-001',
    incidentId,
    capturedAt,
    points: [
      {
        metric: 'error_rate',
        value: 0.05,
        unit: 'ratio',
        windowSec: 300,
        confidence: 0.95,
        freshnessSec: 30,
        source: 'prometheus',
        timestamp: capturedAt,
      },
    ],
  });

  describe('selectBaseline', () => {
    it('should return NONE when no snapshots exist', async () => {
      const result = await resolver.selectBaseline('incident-001');

      expect(result.snapshotId).toBeNull();
      expect(result.source).toBe('NONE');
      expect(result.reason).toContain('No snapshots available');
    });

    it('should select STANDARD snapshot when no PROMOTED exists', async () => {
      const snapshot = createSnapshot(
        'snap-001',
        'incident-001',
        '2025-01-15T09:00:00Z',
      );
      await snapshotStore.save(snapshot);

      const result = await resolver.selectBaseline('incident-001');

      expect(result.snapshotId).toBe('snap-001');
      expect(result.source).toBe('STANDARD');
      expect(result.policy).toBe('STANDARD');
    });

    it('should prefer PROMOTED over STANDARD', async () => {
      // Save STANDARD snapshot (older)
      const standard = createSnapshot(
        'snap-standard',
        'incident-001',
        '2025-01-15T08:00:00Z',
      );
      await snapshotStore.save(standard);

      // Save and promote another snapshot (newer)
      const promoted = createSnapshot(
        'snap-promoted',
        'incident-001',
        '2025-01-15T09:00:00Z',
      );
      await snapshotStore.save(promoted);
      await snapshotStore.markPromoted('snap-promoted');

      const result = await resolver.selectBaseline('incident-001');

      expect(result.snapshotId).toBe('snap-promoted');
      expect(result.source).toBe('PROMOTED');
      expect(result.policy).toBe('PROMOTED');
    });

    it('should select latest PROMOTED when multiple exist', async () => {
      // Save and promote older snapshot
      const older = createSnapshot(
        'snap-older',
        'incident-001',
        '2025-01-15T08:00:00Z',
      );
      await snapshotStore.save(older);
      await snapshotStore.markPromoted('snap-older');

      // Save and promote newer snapshot
      const newer = createSnapshot(
        'snap-newer',
        'incident-001',
        '2025-01-15T09:00:00Z',
      );
      await snapshotStore.save(newer);
      await snapshotStore.markPromoted('snap-newer');

      const result = await resolver.selectBaseline('incident-001');

      expect(result.snapshotId).toBe('snap-newer');
      expect(result.source).toBe('PROMOTED');
    });

    it('should select LEGAL_HOLD snapshot as PROMOTED source', async () => {
      const snapshot = createSnapshot(
        'snap-legal',
        'incident-001',
        '2025-01-15T09:00:00Z',
      );
      await snapshotStore.save(snapshot);
      await snapshotStore.applyLegalHold('snap-legal');

      const result = await resolver.selectBaseline('incident-001');

      expect(result.snapshotId).toBe('snap-legal');
      expect(result.source).toBe('PROMOTED'); // LEGAL_HOLD counts as promoted
      expect(result.policy).toBe('LEGAL_HOLD');
    });

    it('should select latest STANDARD when no PROMOTED/LEGAL_HOLD', async () => {
      // Save multiple STANDARD snapshots
      const older = createSnapshot(
        'snap-older',
        'incident-001',
        '2025-01-15T08:00:00Z',
      );
      await snapshotStore.save(older);

      const newer = createSnapshot(
        'snap-newer',
        'incident-001',
        '2025-01-15T09:00:00Z',
      );
      await snapshotStore.save(newer);

      const result = await resolver.selectBaseline('incident-001');

      expect(result.snapshotId).toBe('snap-newer');
      expect(result.source).toBe('STANDARD');
    });

    it('should not select snapshots from other incidents', async () => {
      const otherIncident = createSnapshot(
        'snap-other',
        'incident-other',
        '2025-01-15T09:00:00Z',
      );
      await snapshotStore.save(otherIncident);

      const result = await resolver.selectBaseline('incident-001');

      expect(result.snapshotId).toBeNull();
      expect(result.source).toBe('NONE');
    });
  });

  describe('protectBaseline', () => {
    it('should apply LEGAL_HOLD to STANDARD snapshot', async () => {
      const snapshot = createSnapshot(
        'snap-001',
        'incident-001',
        '2025-01-15T09:00:00Z',
      );
      await snapshotStore.save(snapshot);

      const result = await resolver.protectBaseline('snap-001');

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.previousPolicy).toBe('STANDARD');

      // Verify snapshot is now LEGAL_HOLD
      const stored = await snapshotStore.get('snap-001');
      expect(stored?.retentionPolicy).toBe('LEGAL_HOLD');
    });

    it('should apply LEGAL_HOLD to PROMOTED snapshot', async () => {
      const snapshot = createSnapshot(
        'snap-001',
        'incident-001',
        '2025-01-15T09:00:00Z',
      );
      await snapshotStore.save(snapshot);
      await snapshotStore.markPromoted('snap-001');

      const result = await resolver.protectBaseline('snap-001');

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.previousPolicy).toBe('PROMOTED');

      const stored = await snapshotStore.get('snap-001');
      expect(stored?.retentionPolicy).toBe('LEGAL_HOLD');
    });

    it('should be idempotent for already LEGAL_HOLD', async () => {
      const snapshot = createSnapshot(
        'snap-001',
        'incident-001',
        '2025-01-15T09:00:00Z',
      );
      await snapshotStore.save(snapshot);
      await snapshotStore.applyLegalHold('snap-001');

      const result = await resolver.protectBaseline('snap-001');

      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
    });

    it('should return error for non-existent snapshot', async () => {
      const result = await resolver.protectBaseline('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('SNAPSHOT_NOT_FOUND');
    });
  });

  describe('selectAndProtectBaseline', () => {
    it('should select and protect in one operation', async () => {
      const snapshot = createSnapshot(
        'snap-001',
        'incident-001',
        '2025-01-15T09:00:00Z',
      );
      await snapshotStore.save(snapshot);

      const result = await resolver.selectAndProtectBaseline('incident-001');

      expect(result.selection.snapshotId).toBe('snap-001');
      expect(result.selection.source).toBe('STANDARD');
      expect(result.protection).not.toBeNull();
      expect(result.protection?.success).toBe(true);
      expect(result.protection?.changed).toBe(true);

      // Verify protection applied
      const stored = await snapshotStore.get('snap-001');
      expect(stored?.retentionPolicy).toBe('LEGAL_HOLD');
    });

    it('should return null protection when no baseline', async () => {
      const result = await resolver.selectAndProtectBaseline('incident-001');

      expect(result.selection.snapshotId).toBeNull();
      expect(result.protection).toBeNull();
    });

    it('should prefer PROMOTED and protect it', async () => {
      // STANDARD snapshot
      const standard = createSnapshot(
        'snap-standard',
        'incident-001',
        '2025-01-15T08:00:00Z',
      );
      await snapshotStore.save(standard);

      // PROMOTED snapshot
      const promoted = createSnapshot(
        'snap-promoted',
        'incident-001',
        '2025-01-15T09:00:00Z',
      );
      await snapshotStore.save(promoted);
      await snapshotStore.markPromoted('snap-promoted');

      const result = await resolver.selectAndProtectBaseline('incident-001');

      expect(result.selection.snapshotId).toBe('snap-promoted');
      expect(result.protection?.success).toBe(true);

      // PROMOTED should now be LEGAL_HOLD
      const stored = await snapshotStore.get('snap-promoted');
      expect(stored?.retentionPolicy).toBe('LEGAL_HOLD');

      // STANDARD should remain STANDARD
      const standardStored = await snapshotStore.get('snap-standard');
      expect(standardStored?.retentionPolicy).toBe('STANDARD');
    });
  });

  describe('getBaseline', () => {
    it('should return snapshot data', async () => {
      const snapshot = createSnapshot(
        'snap-001',
        'incident-001',
        '2025-01-15T09:00:00Z',
      );
      await snapshotStore.save(snapshot);

      const baseline = await resolver.getBaseline('incident-001');

      expect(baseline).not.toBeNull();
      expect(baseline?.snapshotId).toBe('snap-001');
      expect(baseline?.points).toHaveLength(1);
    });

    it('should return null when no snapshots', async () => {
      const baseline = await resolver.getBaseline('incident-001');
      expect(baseline).toBeNull();
    });
  });

  describe('isBaselineProtected', () => {
    it('should return protected=true for LEGAL_HOLD', async () => {
      const snapshot = createSnapshot(
        'snap-001',
        'incident-001',
        '2025-01-15T09:00:00Z',
      );
      await snapshotStore.save(snapshot);
      await snapshotStore.applyLegalHold('snap-001');

      const status = await resolver.isBaselineProtected('snap-001');

      expect(status.exists).toBe(true);
      expect(status.protected).toBe(true);
      expect(status.policy).toBe('LEGAL_HOLD');
    });

    it('should return protected=false for STANDARD', async () => {
      const snapshot = createSnapshot(
        'snap-001',
        'incident-001',
        '2025-01-15T09:00:00Z',
      );
      await snapshotStore.save(snapshot);

      const status = await resolver.isBaselineProtected('snap-001');

      expect(status.exists).toBe(true);
      expect(status.protected).toBe(false);
      expect(status.policy).toBe('STANDARD');
    });

    it('should return exists=false for non-existent', async () => {
      const status = await resolver.isBaselineProtected('non-existent');

      expect(status.exists).toBe(false);
      expect(status.protected).toBe(false);
    });
  });

  describe('baseline deleted scenario prevention', () => {
    it('should prevent baseline deletion after protection', async () => {
      // Create and protect baseline
      const snapshot = createSnapshot(
        'snap-baseline',
        'incident-001',
        '2025-01-15T09:00:00Z',
      );
      await snapshotStore.save(snapshot);
      await resolver.protectBaseline('snap-baseline');

      // Advance time past STANDARD TTL (72h)
      clock.advanceHours(73);

      // Run cleanup
      const deleted = await snapshotStore.deleteExpired();

      // Baseline should NOT be deleted (LEGAL_HOLD)
      expect(deleted).toBe(0);
      const baseline = await snapshotStore.get('snap-baseline');
      expect(baseline).not.toBeNull();
      expect(baseline?.retentionPolicy).toBe('LEGAL_HOLD');
    });

    it('should delete unprotected snapshots but keep baseline', async () => {
      // Create baseline and protect it
      const baseline = createSnapshot(
        'snap-baseline',
        'incident-001',
        '2025-01-15T08:00:00Z',
      );
      await snapshotStore.save(baseline);
      await resolver.protectBaseline('snap-baseline');

      // Create another STANDARD snapshot
      const other = createSnapshot(
        'snap-other',
        'incident-001',
        '2025-01-15T09:00:00Z',
      );
      await snapshotStore.save(other);

      // Advance time past STANDARD TTL
      clock.advanceHours(73);

      // Run cleanup
      const deleted = await snapshotStore.deleteExpired();

      // Only STANDARD should be deleted
      expect(deleted).toBe(1);
      
      // Baseline still exists
      const baselineStored = await snapshotStore.get('snap-baseline');
      expect(baselineStored).not.toBeNull();

      // Other is deleted
      const otherStored = await snapshotStore.get('snap-other');
      expect(otherStored).toBeNull();
    });

    it('should maintain baseline reference after cleanup', async () => {
      // Setup: create and protect baseline
      const snapshot = createSnapshot(
        'snap-baseline',
        'incident-001',
        '2025-01-15T09:00:00Z',
      );
      await snapshotStore.save(snapshot);
      
      const { selection, protection } = await resolver.selectAndProtectBaseline('incident-001');
      expect(selection.snapshotId).toBe('snap-baseline');
      expect(protection?.success).toBe(true);

      // Advance time significantly
      clock.advanceHours(200); // Way past any TTL

      // Cleanup
      await snapshotStore.deleteExpired();

      // Baseline should still be selectable
      const newSelection = await resolver.selectBaseline('incident-001');
      expect(newSelection.snapshotId).toBe('snap-baseline');
      expect(newSelection.source).toBe('PROMOTED'); // LEGAL_HOLD counts as promoted
    });
  });
});
