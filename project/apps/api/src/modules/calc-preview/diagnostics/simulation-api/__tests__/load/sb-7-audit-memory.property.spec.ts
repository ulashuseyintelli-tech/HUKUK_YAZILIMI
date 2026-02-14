/**
 * Property 7: Audit Set Idempotency at Scale (P7)
 *
 * Synthetic Load Validation — Task 10.2
 *
 * For any N unique event seti:
 * - N event gönderildikten sonra Set boyutu = N
 * - Aynı N event tekrar gönderildiğinde Set boyutu = N (artmamalı)
 *
 * Feature: synthetic-load-validation, Property 7: Audit Set Idempotency at Scale
 *
 * @see .kiro/specs/synthetic-load-validation/design.md Property 7
 * @see .kiro/specs/synthetic-load-validation/requirements.md Req 7.1, 7.2
 */

import * as fc from 'fast-check';
import { SimulationAuditAdapter } from '../../simulation-audit.adapter';
import { DiagnosticsAuditService } from '../../../diagnostics-audit.service';
import { SimulationAuditEvent } from '../../simulation-audit.types';

describe('Property 7: Audit Set Idempotency at Scale', () => {
  it('∀ N ∈ [1,5000]: N unique events → Set.size=N, N duplicates → Set.size=N', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5000 }),
        async (N) => {
          // Fresh adapter per iteration
          const mockAuditService: jest.Mocked<DiagnosticsAuditService> = {
            logAccessAttempt: jest.fn(),
          } as any;

          const adapter = new SimulationAuditAdapter(mockAuditService, { incAuditWriteFailed: jest.fn() } as any);

          // Generate N unique events
          const events: SimulationAuditEvent[] = Array.from({ length: N }, (_, i) => ({
            eventId: `evt-${i}`,
            eventType: 'PROMOTE_ACCEPTED',
            timestamp: new Date('2026-02-14T10:00:00Z').toISOString(),
            actorId: 'actor-pbt',
            incidentId: `inc-${i}`,
            runId: `run-${i}`,
            requestId: `req-${i}`,
            detail: `PBT event ${i}`,
          }));

          // Insert N unique events
          for (const event of events) {
            adapter.logSimulationEvent(event);
          }

          // Access private seenKeys via reflection for assertion
          const seenKeys = (adapter as any).seenKeys;

          // Invariant 1: cache.size = N after unique inserts
          expect(seenKeys.size).toBe(N);

          // Insert same N events again (duplicates)
          for (const event of events) {
            adapter.logSimulationEvent(event);
          }

          // Invariant 2: cache.size still = N (duplicates suppressed)
          expect(seenKeys.size).toBe(N);

          // Invariant 3: audit service called exactly N times (not 2N)
          expect(mockAuditService.logAccessAttempt).toHaveBeenCalledTimes(N);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});
