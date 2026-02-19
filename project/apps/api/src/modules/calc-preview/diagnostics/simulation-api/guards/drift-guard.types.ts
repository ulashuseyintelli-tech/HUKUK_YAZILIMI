/**
 * Drift Guard — Type Definitions
 *
 * SD-1 Drift Guard Wiring — Task 1.1
 *
 * Runtime drift detection types for the guard policy resolver.
 * DriftGuard evaluates structural/config drift at P1.5 in the precedence chain
 * (after kill-switch, before missing signals).
 *
 * DriftType enum values are lexicographically sorted:
 *   CARRIER_WRITE < CONFIG < RULESET < SCHEMA
 *
 * @see .kiro/specs/sd-1-drift-guard-wiring/design.md
 * @see .kiro/specs/sd-1-drift-guard-wiring/requirements.md — R2, R6, R12
 */

import { GuardOperation } from './guard-policy-resolver.types';

// ============================================================================
// Drift Type — closed enum, bounded cardinality
// ============================================================================

/**
 * Drift classification enum.
 * Values are lexicographically sorted: CARRIER_WRITE < CONFIG < RULESET < SCHEMA.
 * No free-form strings — metric labels use these values directly.
 *
 * @see Requirements 2.1, 8.2
 */
export enum DriftType {
  CARRIER_WRITE = 'CARRIER_WRITE',
  CONFIG = 'CONFIG',
  RULESET = 'RULESET',
  SCHEMA = 'SCHEMA',
}

/** All DriftType values — frozen, lexicographically sorted */
export const DRIFT_TYPE_VALUES: readonly DriftType[] = Object.freeze([
  DriftType.CARRIER_WRITE,
  DriftType.CONFIG,
  DriftType.RULESET,
  DriftType.SCHEMA,
]);

// ============================================================================
// Drift Input — pure function parameter
// ============================================================================

/**
 * Input to evaluateDrift() pure function.
 * All fields are readonly. Optional fields trigger fail-closed when undefined.
 *
 * Provider rules (D2.1):
 *   - Provider MUST NOT truncate or default-fill fields
 *   - Missing field → undefined → evaluateDrift fail-closed (DRIFT_INPUT_MISSING)
 *
 * @see Requirements 2.2–2.5, 6.1, 12.1
 */
export interface DriftInput {
  readonly tenantId: string;
  readonly operation: GuardOperation;
  readonly policyVersion: string;
  /** Injected clock — never Date.now() inside evaluateDrift */
  readonly nowMs: number;

  // ── Schema drift fields ───────────────────────────────────────────
  readonly expectedSchemaVersion?: string;
  readonly actualSchemaVersion?: string;

  // ── Ruleset drift fields ──────────────────────────────────────────
  readonly expectedRuleHash?: string;
  readonly actualRuleHash?: string;

  // ── Config drift fields ───────────────────────────────────────────
  readonly expectedConfigRevision?: string;
  readonly actualConfigRevision?: string;

  // ── Carrier write drift fields ────────────────────────────────────
  readonly carrierWriteState?: {
    /** Write count > 1 means write-once invariant violation */
    readonly writeCount: number;
  };
}

// ============================================================================
// Drift Detail — log-only, NOT for metric labels
// ============================================================================

/**
 * Per-drift-type detail for structured logging.
 * NOT used as metric labels (cardinality risk — R7.3, R7.6).
 *
 * @see Requirements 7.3, 7.6
 */
export interface DriftDetail {
  readonly type: DriftType;
  readonly expected?: string;
  readonly actual?: string;
}

// ============================================================================
// Drift Verdict — evaluateDrift() return type
// ============================================================================

/**
 * Output of evaluateDrift() pure function.
 * All arrays are readonly and sorted lexicographically.
 *
 * Invariants:
 *   - isDrift=false → types=[], details=[], reasonCodes=[]
 *   - isDrift=true  → types.length >= 1, reasonCodes.length >= 1
 *   - types sorted by DriftType value (lexicographic)
 *   - reasonCodes sorted lexicographically, format: DRIFT:<type> or DRIFT_INPUT_MISSING
 *
 * @see Requirements 2.6, 6.1, 7.1
 */
export interface DriftVerdict {
  readonly isDrift: boolean;
  /** Detected drift types — sorted lexicographically by DriftType value */
  readonly types: readonly DriftType[];
  /** Per-type details — log-only, not for metric labels */
  readonly details: readonly DriftDetail[];
  /** Reason codes — DRIFT:<type> format, sorted lexicographically */
  readonly reasonCodes: readonly string[];
}
