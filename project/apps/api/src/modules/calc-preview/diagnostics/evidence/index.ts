/**
 * Evidence Module Exports
 * 
 * Phase 8 - Sprint 1A/1B
 * Phase 9B.5 - Truth Layer migration
 * 
 * ⚠️  MIGRATION NOTICE  ⚠️
 * 
 * For new code, ALWAYS import from:
 * - persistence/snapshot-store.interface.ts (ISnapshotStore, SimulationSnapshot, SNAPSHOT_STORE)
 * - simulation/calc-result-projection.ts (extractPoints)
 * 
 * The legacy ISnapshotStore has been renamed to ILegacySnapshotStore to force
 * compile-time errors. This ensures all consumers migrate to the Truth Layer.
 * 
 * SINGLE SOURCE OF TRUTH:
 * - calcResult is authoritative for calculation data
 * - Use extractPoints(calcResult) to get points
 * - Do NOT add points[] to SimulationSnapshot
 */

// Sprint 1A
export * from './clock.service';
export * from './evidence-gate.service';
export * from './evidence-aggregator.service';

// Sprint 1B - LEGACY (deprecated)
// ISnapshotStore is renamed to ILegacySnapshotStore - compile error if you try to import ISnapshotStore
export * from './snapshot-store.types';
export * from './snapshot-store.service';
export * from './snapshot-cleanup.service';
export * from './drift-utils';

// Phase 9B.5 - Truth Layer (PREFERRED)
// This is the ONLY ISnapshotStore that should be used
export { 
  SNAPSHOT_STORE,
  ISnapshotStore,
  SimulationSnapshot,
  CreateSnapshotInput,
  ApplyLegalHoldResult as TruthLayerApplyLegalHoldResult,
  SetRetentionPolicyResult as TruthLayerSetRetentionPolicyResult,
  LegalHoldStats,
} from '../persistence/snapshot-store.interface';
