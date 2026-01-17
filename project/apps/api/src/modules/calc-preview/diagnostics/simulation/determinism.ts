/**
 * Determinism Utilities
 * 
 * Phase 8 - Sprint 2A
 * 
 * Seed-based PRNG and deterministic hash generation.
 * NO Math.random() anywhere in this file.
 */

import { createHash } from 'crypto';

// ============================================================================
// Mulberry32 PRNG
// ============================================================================

/**
 * Mulberry32 - fast, deterministic PRNG with good distribution
 * Same seed → same sequence of random numbers
 * 
 * @param seed - 32-bit integer seed
 * @returns Function that returns next random number in [0, 1)
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0; // Ensure unsigned 32-bit
  
  return function(): number {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a seeded RNG from multiple inputs
 * Combines inputs into a single seed deterministically
 */
export function createSeededRng(
  seed: number,
  ...additionalInputs: string[]
): () => number {
  // Combine seed with additional inputs
  const combined = [seed.toString(), ...additionalInputs].join(':');
  const hash = createHash('sha256').update(combined).digest();
  
  // Use first 4 bytes as seed
  const derivedSeed = hash.readUInt32BE(0);
  
  return mulberry32(derivedSeed);
}

// ============================================================================
// Deterministic Run ID Generation
// ============================================================================

/**
 * Generate deterministic run ID from inputs
 * Same inputs → same runId (no UUID randomness)
 * 
 * Format: sim_{version}_{hash8}
 */
export function generateRunId(
  incidentId: string,
  scenarioId: string,
  seed: number,
  version: string,
): string {
  const input = `${incidentId}:${scenarioId}:${seed}:${version}`;
  const hash = createHash('sha256').update(input).digest('hex');
  
  // Take first 8 chars for readability
  return `sim_${version}_${hash.substring(0, 8)}`;
}

// ============================================================================
// Canonical Hash for Determinism Testing
// ============================================================================

/**
 * Generate canonical hash of any object
 * Uses sorted keys to ensure deterministic JSON stringification
 * 
 * @param obj - Object to hash
 * @returns SHA256 hex string
 */
export function canonicalHash(obj: unknown): string {
  const canonical = canonicalStringify(obj);
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Canonical JSON stringify with sorted keys
 * Ensures same object → same string regardless of key order
 */
export function canonicalStringify(obj: unknown): string {
  if (obj === undefined) {
    return 'undefined';
  }
  return JSON.stringify(obj, sortedReplacer);
}

/**
 * JSON replacer that sorts object keys
 */
function sortedReplacer(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  
  // Sort keys and create new object
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(value as Record<string, unknown>).sort();
  
  for (const k of keys) {
    sorted[k] = (value as Record<string, unknown>)[k];
  }
  
  return sorted;
}

// ============================================================================
// Deterministic Sorting
// ============================================================================

/**
 * Sort array with deterministic tiebreaker using RNG
 * When primary sort is equal, use RNG for consistent ordering
 */
export function deterministicSort<T>(
  items: T[],
  compareFn: (a: T, b: T) => number,
  rng: () => number,
): T[] {
  // Assign random values for tiebreaking
  const withTiebreaker = items.map(item => ({
    item,
    tiebreaker: rng(),
  }));
  
  // Sort with tiebreaker
  withTiebreaker.sort((a, b) => {
    const primary = compareFn(a.item, b.item);
    if (primary !== 0) return primary;
    return a.tiebreaker - b.tiebreaker;
  });
  
  return withTiebreaker.map(x => x.item);
}
