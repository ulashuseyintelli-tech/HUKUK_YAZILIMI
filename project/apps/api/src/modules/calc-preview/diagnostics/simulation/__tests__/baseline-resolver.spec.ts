/**
 * Baseline Resolver Tests
 * Phase 9B.5 - Updated to use MockSnapshotStore and tenantId
 */

import { BaselineResolverService } from '../baseline-resolver.service';
import { ClockService } from '../../evidence/clock.service';
import { MockSnapshotStore } from '../../simulation-api/__tests__/mock-snapshot-store';
import { CreateSnapshotInput } from '../../persistence/snapshot-store.interface';
import { canonicalHash, canonicalStringify } from '../determinism';

describe('BaselineResolverService', () => {
  let clock: ClockService;
  let snapshotStore: MockSnapshotStore;
  let resolver: BaselineResolverService;
  const TENANT_ID = 'tenant-001';

  beforeEach(() => {
    clock = new ClockService();
    clock.setFakeTime(new Date('2025-01-15T10:00:00Z'));
    snapshotStore = new MockSnapshotStore(clock);
    resolver = new BaselineResolverService(snapshotStore);
  });

  const createSnapshotInput = (snapshotId: string, incidentId: string): CreateSnapshotInput => {
    const calcResult = { points: [{ metric: 'error_rate', value: 0.05, unit: 'ratio', windowSec: 300, confidence: 0.95, freshnessSec: 30, source: 'prometheus', timestamp: '2025-01-15T09:00:00Z' }] };
    const calcResultNorm = JSON.parse(canonicalStringify(calcResult));
    return { snapshotId, tenantId: TENANT_ID, incidentId, snapshotKind: 'CURRENT', verdict: 'PROCEED', driftScore: 0.1, calcResult, calcResultNorm, calcHash: canonicalHash(calcResultNorm) };
  };

  describe('selectBaseline', () => {
    it('should return NONE when no snapshots exist', async () => {
      const result = await resolver.selectBaseline(TENANT_ID, 'incident-001');
      expect(result.snapshotId).toBeNull();
      expect(result.source).toBe('NONE');
    });

    it('should select STANDARD snapshot when no PROMOTED exists', async () => {
      await snapshotStore.createSnapshot(createSnapshotInput('snap-001', 'incident-001'));
      const result = await resolver.selectBaseline(TENANT_ID, 'incident-001');
      expect(result.snapshotId).toBe('snap-001');
      expect(result.source).toBe('STANDARD');
    });
  });

  describe('protectBaseline', () => {
    it('should apply LEGAL_HOLD to snapshot', async () => {
      await snapshotStore.createSnapshot(createSnapshotInput('snap-001', 'incident-001'));
      const result = await resolver.protectBaseline('snap-001');
      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
    });
  });
});
