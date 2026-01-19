/**
 * Evidence Module Exports
 * 
 * Phase 8 - Sprint 1A/1B
 * Phase 9B.5 - Truth Layer migration
 * 
 * NOTE: For new code, prefer importing from:
 * - persistence/snapshot-store.interface.ts (ISnapshotStore, SimulationSnapshot)
 * - simulation/calc-result-projection.ts (extractPoints)
 */

// Sprint 1A
export * from './clock.service';
export * from './evidence-gate.service';
export * from './evidence-aggregator.service';

// Sprint 1B
// @deprecated - Use persistence/snapshot-store.interface.ts for new code
export * from './snapshot-store.types';
export * from './snapshot-store.service';
export * from './snapshot-cleanup.service';
export * from './drift-utils';

// Phase 9B.5 - Re-export Truth Layer interface for convenience
export { 
  SNAPSHOT_STORE,
  ISnapshotStore as ITruthLayerSnapshotStore,
  SimulationSnapshot,
} from '../persistence/snapshot-store.interface';
