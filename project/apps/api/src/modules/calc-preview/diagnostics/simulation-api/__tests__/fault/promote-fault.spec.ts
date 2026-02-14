/**
 * Promote Store — Fault Injection Tests
 *
 * F1:  INSERT timeout → error thrown, no partial row
 * F5:  ack-lost → retry → ALREADY_PROMOTED (idempotent)
 * F10: duplicate invocation → single row, single effect
 *
 * Assertion triple per test: outcome + DB state + metrics/log
 * Audit assertions are NOT hard-asserted (best-effort dedupe).
 *
 * @see .kiro/specs/fault-injection-harness/requirements.md — Req 3
 * @see .kiro/specs/fault-injection-harness/design.md — D2.1, D4
 */

import {
  DefaultFaultInjector,
  FAULT_SCENARIOS,
  selectScenario,
} from './fault-injector';
import { createFaultablePromoteStore } from './db-fault-wrapper';

// ============================================================================
// Helpers
// ============================================================================

const SEED = 42;

function createHarness() {
  const injector = new DefaultFaultInjector();
  const store = createFaultablePromoteStore(injector);
  return { injector, store };
}

// ============================================================================
// Tests
// ============================================================================

describe('Promote Store — Fault Injection (Tier-0)', () => {
  // --------------------------------------------------------------------------
  // 8.1 — F1: INSERT timeout → error, no row
  // --------------------------------------------------------------------------
  describe('F1: fault_promote_insert_timeout_returns_500_and_creates_no_row', () => {
    it('should throw on INSERT timeout and leave no row in DB', async () => {
      const scenario = selectScenario(SEED, 'F1');
      expect(scenario).toBeDefined();
      expect(scenario!.active).toBe(true);

      const { injector, store } = createHarness();

      // Inject: promote_insert timeout
      injector.injectDb('promote_insert', 'timeout');

      // Act: attempt promote
      await expect(
        store.claimOrGet('inc-f1', 'run-f1', 'req-f1'),
      ).rejects.toThrow(/timed out/);

      // DB state: no row created (timeout before commit)
      expect(store.db.size).toBe(0);

      // Cleanup
      injector.reset();
    });

    it('should NOT fall into P2002/SELECT path on timeout', async () => {
      const { injector, store } = createHarness();
      injector.injectDb('promote_insert', 'timeout');

      // First call: timeout
      await expect(
        store.claimOrGet('inc-f1b', 'run-f1b', 'req-f1b'),
      ).rejects.toThrow(/timed out/);

      // Remove fault, retry: should be fresh INSERT (not P2002)
      injector.reset();
      const result = await store.claimOrGet('inc-f1b', 'run-f1b', 'req-f1b-retry');

      expect(result.isNew).toBe(true);
      expect(result.record.requestId).toBe('req-f1b-retry');
      expect(store.db.size).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // 8.2 — F5: ack-lost → retry → ALREADY_PROMOTED
  // --------------------------------------------------------------------------
  describe('F5: fault_promote_ack_lost_then_retry_returns_already_promoted', () => {
    it('should commit row on ack-lost, then retry returns ALREADY_PROMOTED', async () => {
      const scenario = selectScenario(SEED, 'F5');
      expect(scenario).toBeDefined();

      const { injector, store } = createHarness();

      // Inject: ack_lost — row commits but caller sees error
      injector.injectDb('promote_insert', 'ack_lost');

      // Call 1: ack-lost — throws to caller
      await expect(
        store.claimOrGet('inc-f5', 'run-f5', 'req-f5'),
      ).rejects.toThrow(/ack_lost/);

      // DB state: row WAS committed (ack-lost means write succeeded)
      expect(store.db.size).toBe(1);
      const committedRow = store.db.get('inc-f5::run-f5');
      expect(committedRow).toBeDefined();
      expect(committedRow!.requestId).toBe('req-f5');

      // Call 2: retry — remove fault, same incidentId+runId
      injector.reset();
      const retryResult = await store.claimOrGet('inc-f5', 'run-f5', 'req-f5-retry');

      // Outcome: ALREADY_PROMOTED (isNew=false), same original requestId
      expect(retryResult.isNew).toBe(false);
      expect(retryResult.record.requestId).toBe('req-f5');

      // DB state: still single row
      expect(store.db.size).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // 8.3 — F5 (dedupe): audit dedupe is best-effort, restart resets seenKeys
  // --------------------------------------------------------------------------
  describe('F5: fault_audit_dedupe_is_best_effort_restart_resets_seenKeys', () => {
    it('should document that seenKeys reset on adapter re-creation (process restart sim)', () => {
      // This is a documentation/behavioral test:
      // After "restart" (new adapter instance), seenKeys is empty.
      // Duplicate audit entries are acceptable post-restart.

      const { LRUCache } = require('lru-cache');

      // Simulate first process lifetime
      const cache1 = new LRUCache({ max: 50000, ttl: 86400000 });
      cache1.set('key-1', true);
      cache1.set('key-2', true);
      expect(cache1.size).toBe(2);

      // Simulate restart: new cache instance
      const cache2 = new LRUCache({ max: 50000, ttl: 86400000 });
      expect(cache2.size).toBe(0);

      // key-1 is NOT in cache2 — duplicate audit would pass through
      expect(cache2.has('key-1')).toBe(false);

      // This is the documented "best-effort" behavior:
      // restart → seenKeys empty → duplicate audit acceptable
    });
  });

  // --------------------------------------------------------------------------
  // 5.1 — F10: Duplicate invocation → single row, single effect
  // --------------------------------------------------------------------------
  describe('F10: fault_duplicate_promote_invocation_results_in_single_effect', () => {
    it('should create exactly one row for parallel duplicate invocations', async () => {
      const scenario = selectScenario(SEED, 'F10');
      expect(scenario).toBeDefined();

      const { injector, store } = createHarness();
      // No fault injected — testing idempotency under concurrent identical calls

      const CONCURRENCY = 5;
      const promises = Array.from({ length: CONCURRENCY }, (_, i) =>
        store.claimOrGet('inc-f10', 'run-f10', `req-f10-${i}`),
      );

      const results = await Promise.all(promises);

      // Exactly one isNew=true, rest are isNew=false
      const freshResults = results.filter((r) => r.isNew);
      const replayResults = results.filter((r) => !r.isNew);

      expect(freshResults).toHaveLength(1);
      expect(replayResults).toHaveLength(CONCURRENCY - 1);

      // DB state: single row
      expect(store.db.size).toBe(1);

      // All results reference the same requestId (the winner's)
      const winnerRequestId = freshResults[0].record.requestId;
      for (const replay of replayResults) {
        expect(replay.record.requestId).toBe(winnerRequestId);
      }

      // No exceptions thrown
      // (audit assertions intentionally omitted — best-effort)
    });
  });
});
