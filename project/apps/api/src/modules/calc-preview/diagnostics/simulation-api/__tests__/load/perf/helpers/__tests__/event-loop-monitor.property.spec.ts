/**
 * Property 3: Event Loop Breakpoint Sinyali Doğruluğu
 *
 * Performance Characterization — Task 2.2 (CORE)
 *
 * For any EventLoopSnapshot, isBreakpoint() = true iff p99Ms > 50.
 *
 * **Validates: Requirements 2.3**
 *
 * @see .kiro/specs/perf-characterization/design.md — Property 3
 */

import * as fc from 'fast-check';
import { EventLoopMonitor, EventLoopSnapshot } from '../event-loop-monitor';

jest.setTimeout(120_000);

describe('Feature: perf-characterization, Property 3: Event Loop Breakpoint Sinyali', () => {
  it('isBreakpoint(snap) = true iff snap.p99Ms > 50', () => {
    fc.assert(
      fc.property(
        fc.record({
          p50Ms: fc.double({ min: 0, max: 500, noNaN: true }),
          p95Ms: fc.double({ min: 0, max: 500, noNaN: true }),
          p99Ms: fc.double({ min: 0, max: 500, noNaN: true }),
          maxMs: fc.double({ min: 0, max: 500, noNaN: true }),
        }),
        (snap: EventLoopSnapshot) => {
          const result = EventLoopMonitor.isBreakpoint(snap);
          const expected = snap.p99Ms > 50;
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('p99Ms tam 50 olduğunda breakpoint = false (eşik exclusive)', () => {
    const snap: EventLoopSnapshot = { p50Ms: 10, p95Ms: 30, p99Ms: 50, maxMs: 60 };
    expect(EventLoopMonitor.isBreakpoint(snap)).toBe(false);
  });

  it('p99Ms 50.001 olduğunda breakpoint = true', () => {
    const snap: EventLoopSnapshot = { p50Ms: 10, p95Ms: 30, p99Ms: 50.001, maxMs: 60 };
    expect(EventLoopMonitor.isBreakpoint(snap)).toBe(true);
  });
});
