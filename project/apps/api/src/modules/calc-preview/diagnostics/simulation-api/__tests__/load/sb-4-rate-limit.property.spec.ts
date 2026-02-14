/**
 * Property 4: Rate Limit Boundary Invariant (P4)
 *
 * Synthetic Load Validation — Task 6.2
 *
 * For any rate limit tier ve limit L:
 * - ≤L istek → tümü kabul
 * - >L istek → fazlası reject (429, 500 değil)
 *
 * Feature: synthetic-load-validation, Property 4: Rate Limit Boundary Invariant
 *
 * @see .kiro/specs/synthetic-load-validation/design.md Property 4
 * @see .kiro/specs/synthetic-load-validation/requirements.md Req 4.1–4.5
 */

import * as fc from 'fast-check';
import { SimulationRateLimitGuard } from '../../guards/simulation-rate-limit.guard';
import { MockClockService } from '../../../evidence/clock.service';
import { SIMULATION_RATE_LIMITS } from '../../simulation-rate-limit.constants';

const CONCURRENT_LIMIT = SIMULATION_RATE_LIMITS.perTenantConcurrent;

describe('Property 4: Rate Limit Boundary Invariant', () => {
  it('∀ N ∈ [1, L]: N concurrent acquires → all acquired=true (no false reject)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: CONCURRENT_LIMIT }),
        async (N) => {
          const clock = new MockClockService(new Date('2026-02-14T00:00:00Z'));
          const guard = new SimulationRateLimitGuard(undefined, clock);

          const results = [];
          for (let i = 0; i < N; i++) {
            results.push(await guard.acquireToken('pbt-tenant', `inc-${i}`, `run-${i}`));
          }

          // Invariant: all ≤L should be acquired
          expect(results.every((r) => r.acquired)).toBe(true);

          await guard.reset();
        },
      ),
      { numRuns: 50 },
    );
  });

  it('∀ N ∈ [L+1, L+10]: Nth concurrent acquire → acquired=false, reason=concurrent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: CONCURRENT_LIMIT + 1, max: CONCURRENT_LIMIT + 10 }),
        async (N) => {
          const clock = new MockClockService(new Date('2026-02-14T00:00:00Z'));
          const guard = new SimulationRateLimitGuard(undefined, clock);

          const results = [];
          for (let i = 0; i < N; i++) {
            results.push(await guard.acquireToken('pbt-tenant', `inc-${i}`, `run-${i}`));
          }

          const acquired = results.filter((r) => r.acquired);
          const rejected = results.filter((r) => !r.acquired);

          // Invariant 1: max L acquired
          expect(acquired.length).toBeLessThanOrEqual(CONCURRENT_LIMIT);

          // Invariant 2: overflow rejected with reason=concurrent
          expect(rejected.length).toBeGreaterThanOrEqual(1);
          for (const r of rejected) {
            expect(r.reason).toBe('concurrent');
          }

          // Invariant 3: no exceptions (no 500)
          expect(results).toHaveLength(N);

          await guard.reset();
        },
      ),
      { numRuns: 50 },
    );
  });
});
