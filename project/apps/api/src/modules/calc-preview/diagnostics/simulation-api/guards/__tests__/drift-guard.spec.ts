/**
 * Drift Guard — Unit Tests
 *
 * SD-1 Drift Guard Wiring — Task 2.1
 *
 * Tests evaluateDrift() pure function:
 *   - Never throws (minimal valid input)
 *   - Determinism (same input → deepEqual verdict)
 *   - Sorted unique types
 *   - Sorted unique reasonCodes
 *   - Each DriftType detection individually
 *   - Multiple drift types simultaneously
 *   - Missing input fail-closed (DRIFT_INPUT_MISSING)
 *   - No drift → empty arrays
 *
 * @see .kiro/specs/sd-1-drift-guard-wiring/design.md — D2.1
 */

import { evaluateDrift } from '../drift-guard';
import { DriftInput, DriftType, DRIFT_TYPE_VALUES } from '../drift-guard.types';
import { GuardOperation } from '../guard-policy-resolver.types';

// ============================================================================
// Helpers
// ============================================================================

/** Minimal valid DriftInput — no drift expected */
function baseDriftInput(overrides: Partial<DriftInput> = {}): DriftInput {
  return {
    tenantId: 'tenant-1',
    operation: GuardOperation.EVALUATE,
    policyVersion: '1.0.0',
    nowMs: 1708128000000,
    expectedSchemaVersion: 'v1',
    actualSchemaVersion: 'v1',
    expectedRuleHash: 'abc123',
    actualRuleHash: 'abc123',
    expectedConfigRevision: 'rev-1',
    actualConfigRevision: 'rev-1',
    carrierWriteState: { writeCount: 1 },
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('evaluateDrift', () => {
  // ── Never throws ────────────────────────────────────────────────────
  it('never throws with minimal valid input', () => {
    const input = baseDriftInput();
    expect(() => evaluateDrift(input)).not.toThrow();
  });

  it('never throws with completely empty optional fields', () => {
    const input: DriftInput = {
      tenantId: 'tenant-1',
      operation: GuardOperation.PROMOTE,
      policyVersion: '1.0.0',
      nowMs: 0,
    };
    expect(() => evaluateDrift(input)).not.toThrow();
  });

  // ── Determinism ─────────────────────────────────────────────────────
  it('produces identical verdict for identical input (determinism)', () => {
    const input = baseDriftInput({
      expectedSchemaVersion: 'v1',
      actualSchemaVersion: 'v2',
    });
    const v1 = evaluateDrift(input);
    const v2 = evaluateDrift(input);
    expect(v1).toEqual(v2);
  });

  // ── No drift → empty arrays ─────────────────────────────────────────
  it('returns isDrift=false with empty arrays when no drift', () => {
    const verdict = evaluateDrift(baseDriftInput());
    expect(verdict.isDrift).toBe(false);
    expect(verdict.types).toEqual([]);
    expect(verdict.details).toEqual([]);
    expect(verdict.reasonCodes).toEqual([]);
  });

  // ── Individual DriftType detection ──────────────────────────────────
  it('detects SCHEMA drift', () => {
    const verdict = evaluateDrift(
      baseDriftInput({
        expectedSchemaVersion: 'v1',
        actualSchemaVersion: 'v2',
      }),
    );
    expect(verdict.isDrift).toBe(true);
    expect(verdict.types).toEqual([DriftType.SCHEMA]);
    expect(verdict.reasonCodes).toEqual(['DRIFT:SCHEMA']);
    expect(verdict.details).toEqual([
      { type: DriftType.SCHEMA, expected: 'v1', actual: 'v2' },
    ]);
  });

  it('detects RULESET drift', () => {
    const verdict = evaluateDrift(
      baseDriftInput({
        expectedRuleHash: 'hash-a',
        actualRuleHash: 'hash-b',
      }),
    );
    expect(verdict.isDrift).toBe(true);
    expect(verdict.types).toEqual([DriftType.RULESET]);
    expect(verdict.reasonCodes).toEqual(['DRIFT:RULESET']);
  });

  it('detects CONFIG drift', () => {
    const verdict = evaluateDrift(
      baseDriftInput({
        expectedConfigRevision: 'rev-1',
        actualConfigRevision: 'rev-2',
      }),
    );
    expect(verdict.isDrift).toBe(true);
    expect(verdict.types).toEqual([DriftType.CONFIG]);
    expect(verdict.reasonCodes).toEqual(['DRIFT:CONFIG']);
  });

  it('detects CARRIER_WRITE drift (writeCount > 1)', () => {
    const verdict = evaluateDrift(
      baseDriftInput({
        carrierWriteState: { writeCount: 3 },
      }),
    );
    expect(verdict.isDrift).toBe(true);
    expect(verdict.types).toEqual([DriftType.CARRIER_WRITE]);
    expect(verdict.reasonCodes).toEqual(['DRIFT:CARRIER_WRITE']);
    expect(verdict.details).toEqual([
      { type: DriftType.CARRIER_WRITE, expected: '1', actual: '3' },
    ]);
  });

  it('does NOT detect CARRIER_WRITE drift when writeCount === 1', () => {
    const verdict = evaluateDrift(
      baseDriftInput({ carrierWriteState: { writeCount: 1 } }),
    );
    expect(verdict.isDrift).toBe(false);
  });

  it('does NOT detect CARRIER_WRITE drift when carrierWriteState is absent', () => {
    const { carrierWriteState, ...rest } = baseDriftInput();
    const verdict = evaluateDrift(rest);
    expect(verdict.isDrift).toBe(false);
  });

  // ── Multiple drift types simultaneously ─────────────────────────────
  it('detects multiple drift types sorted by DRIFT_TYPE_VALUES index', () => {
    const verdict = evaluateDrift(
      baseDriftInput({
        expectedSchemaVersion: 'v1',
        actualSchemaVersion: 'v2',
        expectedConfigRevision: 'rev-1',
        actualConfigRevision: 'rev-2',
        carrierWriteState: { writeCount: 5 },
      }),
    );
    expect(verdict.isDrift).toBe(true);
    // CARRIER_WRITE < CONFIG < SCHEMA (DRIFT_TYPE_VALUES order)
    expect(verdict.types).toEqual([
      DriftType.CARRIER_WRITE,
      DriftType.CONFIG,
      DriftType.SCHEMA,
    ]);
    expect(verdict.reasonCodes).toEqual([
      'DRIFT:CARRIER_WRITE',
      'DRIFT:CONFIG',
      'DRIFT:SCHEMA',
    ]);
  });

  it('detects all four drift types simultaneously', () => {
    const verdict = evaluateDrift(
      baseDriftInput({
        expectedSchemaVersion: 'v1',
        actualSchemaVersion: 'v2',
        expectedRuleHash: 'a',
        actualRuleHash: 'b',
        expectedConfigRevision: 'r1',
        actualConfigRevision: 'r2',
        carrierWriteState: { writeCount: 2 },
      }),
    );
    expect(verdict.isDrift).toBe(true);
    expect(verdict.types).toEqual([...DRIFT_TYPE_VALUES]);
    expect(verdict.reasonCodes).toEqual([
      'DRIFT:CARRIER_WRITE',
      'DRIFT:CONFIG',
      'DRIFT:RULESET',
      'DRIFT:SCHEMA',
    ]);
  });

  // ── Sorted output ───────────────────────────────────────────────────
  it('types are sorted by DRIFT_TYPE_VALUES index order', () => {
    const verdict = evaluateDrift(
      baseDriftInput({
        expectedSchemaVersion: 'v1',
        actualSchemaVersion: 'v2',
        expectedRuleHash: 'a',
        actualRuleHash: 'b',
      }),
    );
    // RULESET < SCHEMA in DRIFT_TYPE_VALUES
    expect(verdict.types).toEqual([DriftType.RULESET, DriftType.SCHEMA]);
  });

  it('reasonCodes are sorted lexicographically', () => {
    const verdict = evaluateDrift(
      baseDriftInput({
        expectedSchemaVersion: 'v1',
        actualSchemaVersion: 'v2',
        expectedConfigRevision: 'r1',
        actualConfigRevision: 'r2',
      }),
    );
    const sorted = [...verdict.reasonCodes].sort();
    expect(verdict.reasonCodes).toEqual(sorted);
  });

  // ── Missing input → fail-closed ─────────────────────────────────────
  it('fail-closed: missing expectedSchemaVersion → isDrift=true + DRIFT_INPUT_MISSING', () => {
    const { expectedSchemaVersion, ...rest } = baseDriftInput();
    const verdict = evaluateDrift({ ...rest, actualSchemaVersion: 'v1' });
    expect(verdict.isDrift).toBe(true);
    expect(verdict.reasonCodes).toContain('DRIFT_INPUT_MISSING');
  });

  it('fail-closed: missing actualRuleHash → isDrift=true + DRIFT_INPUT_MISSING', () => {
    const { actualRuleHash, ...rest } = baseDriftInput();
    const verdict = evaluateDrift({ ...rest, expectedRuleHash: 'hash-a' });
    expect(verdict.isDrift).toBe(true);
    expect(verdict.reasonCodes).toContain('DRIFT_INPUT_MISSING');
  });

  it('fail-closed: all optional fields undefined → isDrift=true + DRIFT_INPUT_MISSING', () => {
    const verdict = evaluateDrift({
      tenantId: 'tenant-1',
      operation: GuardOperation.EVALUATE,
      policyVersion: '1.0.0',
      nowMs: 1708128000000,
    });
    expect(verdict.isDrift).toBe(true);
    expect(verdict.reasonCodes).toEqual(['DRIFT_INPUT_MISSING']);
    expect(verdict.types).toEqual([]);
  });

  it('fail-closed + explicit drift: missing input AND schema mismatch → both reported', () => {
    const { actualRuleHash, ...rest } = baseDriftInput({
      expectedSchemaVersion: 'v1',
      actualSchemaVersion: 'v2',
      expectedRuleHash: 'hash-a',
    });
    const verdict = evaluateDrift(rest);
    expect(verdict.isDrift).toBe(true);
    expect(verdict.types).toContain(DriftType.SCHEMA);
    expect(verdict.reasonCodes).toContain('DRIFT:SCHEMA');
    expect(verdict.reasonCodes).toContain('DRIFT_INPUT_MISSING');
  });

  // ── Field absence = no drift (both undefined → skip) ────────────────
  it('both expected and actual undefined for a pair → fail-closed (DRIFT_INPUT_MISSING)', () => {
    // When BOTH sides of a pair are undefined, the field is simply absent
    // checkStringPair returns 'missing' → fail-closed
    const { expectedSchemaVersion, actualSchemaVersion, ...rest } = baseDriftInput();
    const verdict = evaluateDrift(rest);
    // Both undefined → 'missing' from checkStringPair, triggers fail-closed
    expect(verdict.isDrift).toBe(true);
    expect(verdict.reasonCodes).toContain('DRIFT_INPUT_MISSING');
  });

  // ── Immutability ────────────────────────────────────────────────────
  it('verdict arrays are frozen (immutable)', () => {
    const verdict = evaluateDrift(
      baseDriftInput({
        expectedSchemaVersion: 'v1',
        actualSchemaVersion: 'v2',
      }),
    );
    expect(Object.isFrozen(verdict)).toBe(true);
    expect(Object.isFrozen(verdict.types)).toBe(true);
    expect(Object.isFrozen(verdict.details)).toBe(true);
    expect(Object.isFrozen(verdict.reasonCodes)).toBe(true);
  });
});
