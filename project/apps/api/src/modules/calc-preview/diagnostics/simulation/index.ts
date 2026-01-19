/**
 * Simulation Module Exports
 * 
 * Phase 8 - Sprint 2E
 * Phase 9B.5 - CalcResult projection utilities
 */

// Types
export * from './simulation.types';
export * from './incident.types';
export * from './evidence-bundle.types';
export * from './legal-hold-inventory.types';

// Determinism utilities
export * from './determinism';

// CalcResult projection (Phase 9B.5 - Single Source of Truth)
export * from './calc-result-projection';

// Clock
export * from './simulation-clock.service';

// Scheduler
export * from './simulation-scheduler.service';

// Engine
export * from './simulation-engine.service';

// Incident Store (Sprint 2D)
export * from './incident-store.service';

// Baseline Resolver (Sprint 2D)
export * from './baseline-resolver.service';

// Evidence Bundle (Sprint 2E)
export * from './evidence-bundle.service';

// Legal Hold Inventory (Sprint 2E)
export * from './legal-hold-inventory.service';

// Snapshot Query Service (Phase 9B.5 - Query Facade)
export * from './snapshot-query.service';
