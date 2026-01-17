/**
 * Simulation Types
 * 
 * Phase 8 - Sprint 2B
 * 
 * Core types for deterministic simulation engine.
 * NO real time / setInterval / Math.random in this file.
 * 
 * NOTE: DriftResult and MetricDrift are imported from drift-utils.ts
 * to maintain SINGLE SOURCE OF TRUTH.
 */

import { EvidenceSnapshot, EvidenceGateResult } from '../diagnostics.types';

// Re-export drift types from single source
export { DriftResult, MetricDrift } from '../evidence/drift-utils';

// ============================================================================
// Retention Policy
// ============================================================================

export type RetentionPolicy = 'STANDARD' | 'PROMOTED' | 'LEGAL_HOLD';

export const RETENTION_HOURS: Record<RetentionPolicy, number | null> = {
  STANDARD: 72,
  PROMOTED: 168, // 7 days
  LEGAL_HOLD: null, // indefinite
};

// ============================================================================
// Evidence Chain (uses DriftResult from drift-utils)
// ============================================================================

import { DriftResult } from '../evidence/drift-utils';

export type EvidenceVerdict = 
  | 'PROCEED' 
  | 'BLOCK_DRIFT' 
  | 'BLOCK_EVIDENCE' 
  | 'BLOCK_POLICY';

export interface EvidenceChain {
  baselineSnapshotId: string;
  currentSnapshotId: string;
  driftResult: DriftResult;
  gateResult: EvidenceGateResult;
  verdict: EvidenceVerdict;
  verdictReason: string | undefined;
}

// ============================================================================
// Simulation Input/Output
// ============================================================================

export interface SimulationInput {
  incidentId: string;
  tenantId: string;
  scenarioId: string;
  seed: number;
  baselineSnapshot: EvidenceSnapshot;
  currentSnapshot?: EvidenceSnapshot;
  timeHorizonSec?: number;
  maxComputeTimeSec?: number;
}

export interface SimulationOutput {
  runId: string;
  incidentId: string;
  tenantId: string;
  scenarioId: string;
  seed: number;
  
  // Evidence
  baselineSnapshot: EvidenceSnapshot;
  currentSnapshot: EvidenceSnapshot;
  evidenceChain: EvidenceChain;
  
  // Compute metadata
  compute: ComputeInfo;
  
  // Version for hash stability
  version: string;
}

export interface ComputeInfo {
  startedAt: string;
  finishedAt: string;
  computeTimeSec: number;
  timedOut: boolean;
}

// ============================================================================
// Simulation Engine Interface
// ============================================================================

export interface ISimulationEngine {
  simulate(input: SimulationInput): Promise<SimulationOutput>;
}

// ============================================================================
// Simulation Clock Interface
// ============================================================================

export interface ISimulationClock {
  now(): Date;
  advanceSeconds(seconds: number): void;
  reset(to?: Date): void;
}

// ============================================================================
// Simulation Scheduler Interface
// ============================================================================

export interface ISimulationScheduler {
  schedule(callback: () => void | Promise<void>, intervalMs: number): void;
  tick(): Promise<void>;
  stop(): void;
  isRunning(): boolean;
}

// ============================================================================
// Simulation Context (for engine internals)
// ============================================================================

export interface SimulationContext {
  rng: () => number;
  clock: ISimulationClock;
  scheduler: ISimulationScheduler;
  seed: number;
  version: string;
}

// ============================================================================
// Constants
// ============================================================================

export const SIMULATION_VERSION = '2A.1';

export const SIMULATION_DEFAULTS = {
  TIME_HORIZON_SEC: 300,
  MAX_COMPUTE_TIME_SEC: 30,
};
