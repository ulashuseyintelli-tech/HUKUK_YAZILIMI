/**
 * GuardClock — Injectable clock abstraction
 *
 * Operational Guard Phase — Task 4
 *
 * Prevents Date.now() leaking into guard logic.
 * Test: inject fixed value. Prod: inject Date.now wrapper.
 *
 * @see .kiro/specs/operational-guard-phase/design.md — D4
 */

// ============================================================================
// Interface
// ============================================================================

/** Clock abstraction for guard engine — all time in ms */
export interface GuardClock {
  /** Current time in milliseconds since epoch */
  nowMs(): number;
}

// ============================================================================
// Implementations
// ============================================================================

/** Production clock — wraps Date.now() */
export class SystemClock implements GuardClock {
  nowMs(): number {
    return Date.now();
  }
}

/** Test clock — returns fixed or controllable time */
export class FixedClock implements GuardClock {
  constructor(private _nowMs: number) {}

  nowMs(): number {
    return this._nowMs;
  }

  /** Advance time by delta ms */
  advance(deltaMs: number): void {
    this._nowMs += deltaMs;
  }

  /** Set absolute time */
  set(nowMs: number): void {
    this._nowMs = nowMs;
  }
}
