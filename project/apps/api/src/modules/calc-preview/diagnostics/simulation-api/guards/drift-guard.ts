/**
 * Drift Guard — Pure Function
 *
 * SD-1 Drift Guard Wiring — Task 2.1
 *
 * evaluateDrift() is a pure function: no external state, no Date.now(), no throw.
 * Same input always produces the same output (Property 1: Determinism).
 *
 * Drift detection rules:
 *   SCHEMA:        expectedSchemaVersion !== actualSchemaVersion
 *   RULESET:       expectedRuleHash !== actualRuleHash
 *   CONFIG:        expectedConfigRevision !== actualConfigRevision
 *   CARRIER_WRITE: carrierWriteState?.writeCount > 1
 *
 * Missing input (expected/actual undefined): fail-closed → isDrift=true, DRIFT_INPUT_MISSING
 * Output: types sorted by DRIFT_TYPE_VALUES index, reasonCodes in DRIFT:<type> format sorted.
 * No drift → types=[], reasonCodes=[], details=[] (empty arrays, not undefined).
 *
 * @see .kiro/specs/sd-1-drift-guard-wiring/design.md — D2.1
 * @see .kiro/specs/sd-1-drift-guard-wiring/requirements.md — R2, R6, R12
 */

import {
  DriftInput,
  DriftDetail,
  DriftType,
  DriftVerdict,
  DRIFT_TYPE_VALUES,
} from './drift-guard.types';

// ============================================================================
// Constants
// ============================================================================

/** Reason code for missing input fields (fail-closed) */
const DRIFT_INPUT_MISSING = 'DRIFT_INPUT_MISSING';

/** Reason code prefix for drift types */
const DRIFT_PREFIX = 'DRIFT:';

// ============================================================================
// Internal helpers — all pure, no throw
// ============================================================================

/**
 * Sort DriftType array by DRIFT_TYPE_VALUES index order.
 * Uses index-based sort (not string compare) per design spec.
 */
function sortTypes(types: DriftType[]): DriftType[] {
  return types.sort(
    (a, b) => DRIFT_TYPE_VALUES.indexOf(a) - DRIFT_TYPE_VALUES.indexOf(b),
  );
}

/**
 * Build sorted, unique reason codes from drift types.
 * Format: DRIFT:<TYPE> — sorted lexicographically.
 */
function buildReasonCodes(types: readonly DriftType[]): string[] {
  return types.map((t) => `${DRIFT_PREFIX}${t}`).sort();
}

/**
 * Check if a pair of expected/actual string fields indicates drift.
 * Both must be defined and different for drift to be detected.
 * If either is undefined → returns 'missing' (fail-closed handled by caller).
 */
function checkStringPair(
  expected: string | undefined,
  actual: string | undefined,
): 'match' | 'mismatch' | 'missing' {
  if (expected === undefined || actual === undefined) return 'missing';
  return expected !== actual ? 'mismatch' : 'match';
}

// ============================================================================
// evaluateDrift — pure function, never throws
// ============================================================================

/**
 * Evaluate drift from a DriftInput. Pure function — no side effects.
 *
 * @param input - Readonly drift input (injected clock, no Date.now())
 * @returns DriftVerdict with sorted types, details, and reasonCodes
 */
export function evaluateDrift(input: DriftInput): DriftVerdict {
  const types: DriftType[] = [];
  const details: DriftDetail[] = [];
  let hasMissingInput = false;

  // ── SCHEMA drift ──────────────────────────────────────────────────
  const schemaResult = checkStringPair(
    input.expectedSchemaVersion,
    input.actualSchemaVersion,
  );
  if (schemaResult === 'mismatch') {
    types.push(DriftType.SCHEMA);
    details.push({
      type: DriftType.SCHEMA,
      ...(input.expectedSchemaVersion !== undefined && { expected: input.expectedSchemaVersion }),
      ...(input.actualSchemaVersion !== undefined && { actual: input.actualSchemaVersion }),
    });
  } else if (schemaResult === 'missing') {
    hasMissingInput = true;
  }

  // ── RULESET drift ─────────────────────────────────────────────────
  const rulesetResult = checkStringPair(
    input.expectedRuleHash,
    input.actualRuleHash,
  );
  if (rulesetResult === 'mismatch') {
    types.push(DriftType.RULESET);
    details.push({
      type: DriftType.RULESET,
      ...(input.expectedRuleHash !== undefined && { expected: input.expectedRuleHash }),
      ...(input.actualRuleHash !== undefined && { actual: input.actualRuleHash }),
    });
  } else if (rulesetResult === 'missing') {
    hasMissingInput = true;
  }

  // ── CONFIG drift ──────────────────────────────────────────────────
  const configResult = checkStringPair(
    input.expectedConfigRevision,
    input.actualConfigRevision,
  );
  if (configResult === 'mismatch') {
    types.push(DriftType.CONFIG);
    details.push({
      type: DriftType.CONFIG,
      ...(input.expectedConfigRevision !== undefined && { expected: input.expectedConfigRevision }),
      ...(input.actualConfigRevision !== undefined && { actual: input.actualConfigRevision }),
    });
  } else if (configResult === 'missing') {
    hasMissingInput = true;
  }

  // ── CARRIER_WRITE drift ───────────────────────────────────────────
  if (input.carrierWriteState !== undefined) {
    if (input.carrierWriteState.writeCount > 1) {
      types.push(DriftType.CARRIER_WRITE);
      details.push({
        type: DriftType.CARRIER_WRITE,
        expected: '1',
        actual: String(input.carrierWriteState.writeCount),
      });
    }
  }
  // carrierWriteState undefined → not a missing input scenario
  // (carrier write is optional, not a required pair)

  // ── Fail-closed: missing input ────────────────────────────────────
  if (hasMissingInput && types.length === 0) {
    // No explicit drift detected but input is incomplete → fail-closed
    return Object.freeze({
      isDrift: true,
      types: Object.freeze([] as DriftType[]),
      details: Object.freeze([] as DriftDetail[]),
      reasonCodes: Object.freeze([DRIFT_INPUT_MISSING]),
    });
  }

  if (hasMissingInput) {
    // Explicit drift detected AND missing input → report both
    const sortedTypes = sortTypes(types);
    const reasonCodes = [...buildReasonCodes(sortedTypes), DRIFT_INPUT_MISSING].sort();
    return Object.freeze({
      isDrift: true,
      types: Object.freeze(sortedTypes),
      details: Object.freeze(details),
      reasonCodes: Object.freeze(reasonCodes),
    });
  }

  // ── Normal path ───────────────────────────────────────────────────
  if (types.length === 0) {
    return Object.freeze({
      isDrift: false,
      types: Object.freeze([] as DriftType[]),
      details: Object.freeze([] as DriftDetail[]),
      reasonCodes: Object.freeze([] as string[]),
    });
  }

  const sortedTypes = sortTypes(types);
  return Object.freeze({
    isDrift: true,
    types: Object.freeze(sortedTypes),
    details: Object.freeze(details),
    reasonCodes: Object.freeze(buildReasonCodes(sortedTypes)),
  });
}
