/**
 * DLQ Repository — Poison & Filter Property Tests
 *
 * Phase 11.3 — Tasks 2.6, 2.7
 *
 * Property 3: markAsPoison atomik doğruluğu (mock-based)
 * Property 6: DLQ listeleme POISON filtresi (mock-based)
 *
 * These tests validate the contract at the interface level using
 * in-memory state. DB-level atomicity is covered by integration tests.
 *
 * @see phase-11-3-redrive-depth-limit/design.md — Properties 3, 6
 */

import * as fc from 'fast-check';
import type { DlqEntry, DlqQueryOptions } from '../manifest-retry.types';
import type { ManifestErrorCode } from '../manifest-error-classifier';

// ============================================================================
// IN-MEMORY DLQ STORE (simulates repo behaviour)
// ============================================================================

const NOW = new Date();

function makeDlqEntry(overrides: Partial<DlqEntry> = {}): DlqEntry {
  return {
    id: `dlq-${Math.random().toString(36).slice(2, 10)}`,
    bundleId: `bundle-${Math.random().toString(36).slice(2, 10)}`,
    attempt: 1,
    finalErrorCode: 'UNKNOWN_ERROR' as ManifestErrorCode,
    finalErrorMessage: null,
    firstFailedAt: NOW,
    lastFailedAt: NOW,
    status: 'DLQ_OPEN',
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    redrivenAt: null,
    redrivenBy: null,
    createdAt: NOW,
    carrierJson: null,
    carrierVersion: 2,
    carrierTruncated: false,
    isPoison: false,
    poisonReason: null,
    // Phase 11.4 - Rate limiting
    lastRedrivenAt: null,
    redriveCount: 0,
    nextAllowedRedriveAt: null,
    rateLimitReason: null,
    ...overrides,
  };
}

/**
 * In-memory store that mirrors the markAsPoison and query contract.
 */
class InMemoryDlqStore {
  private entries: Map<string, DlqEntry>;

  constructor(initial: DlqEntry[]) {
    this.entries = new Map(initial.map((e) => [e.id, { ...e }]));
  }

  async markAsPoison(dlqId: string, input: { reason: string }): Promise<void> {
    const entry = this.entries.get(dlqId);
    if (!entry) return; // no-op if not found (matches real repo)
    // Atomically set both fields
    entry.isPoison = true;
    entry.poisonReason = input.reason;
  }

  async query(options: DlqQueryOptions = {}): Promise<{ entries: DlqEntry[]; total: number }> {
    let results = Array.from(this.entries.values());
    if (options.status) results = results.filter((e) => e.status === options.status);
    if (options.isPoison !== undefined) results = results.filter((e) => e.isPoison === options.isPoison);
    return { entries: results, total: results.length };
  }

  getById(dlqId: string): DlqEntry | undefined {
    return this.entries.get(dlqId);
  }
}

// ============================================================================
// ARBITRARIES
// ============================================================================

const reasonArb = fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0);

const poisonBoolArb = fc.boolean();

const dlqEntryArb = fc.record({
  isPoison: poisonBoolArb,
  poisonReason: fc.option(reasonArb, { nil: null }),
}).map(({ isPoison, poisonReason }) =>
  makeDlqEntry({ isPoison, poisonReason: isPoison ? poisonReason : null }),
);

// ============================================================================
// PROPERTY TESTS
// ============================================================================

describe('DLQ Repository — Poison Property Tests', () => {
  // --------------------------------------------------------------------------
  // Property 3: markAsPoison atomik doğruluğu
  // --------------------------------------------------------------------------
  describe('Property 3: markAsPoison atomicity', () => {
    it('after markAsPoison, entry.isPoison=true and poisonReason matches', async () => {
      await fc.assert(
        fc.asyncProperty(reasonArb, async (reason) => {
          const entry = makeDlqEntry({ isPoison: false, poisonReason: null });
          const store = new InMemoryDlqStore([entry]);

          await store.markAsPoison(entry.id, { reason });

          const updated = store.getById(entry.id)!;
          expect(updated.isPoison).toBe(true);
          expect(updated.poisonReason).toBe(reason);
        }),
        { numRuns: 100 },
      );
    });

    it('markAsPoison is idempotent — calling twice does not revert', async () => {
      await fc.assert(
        fc.asyncProperty(reasonArb, reasonArb, async (reason1, reason2) => {
          const entry = makeDlqEntry({ isPoison: false, poisonReason: null });
          const store = new InMemoryDlqStore([entry]);

          await store.markAsPoison(entry.id, { reason: reason1 });
          await store.markAsPoison(entry.id, { reason: reason2 });

          const updated = store.getById(entry.id)!;
          // isPoison must still be true (never reverted)
          expect(updated.isPoison).toBe(true);
          // Second call overwrites reason (matches real SQL: SET poison_reason = $reason)
          expect(updated.poisonReason).toBe(reason2);
        }),
        { numRuns: 100 },
      );
    });

    it('markAsPoison on already-poison entry keeps isPoison=true', async () => {
      await fc.assert(
        fc.asyncProperty(reasonArb, reasonArb, async (existingReason, newReason) => {
          const entry = makeDlqEntry({ isPoison: true, poisonReason: existingReason });
          const store = new InMemoryDlqStore([entry]);

          await store.markAsPoison(entry.id, { reason: newReason });

          const updated = store.getById(entry.id)!;
          expect(updated.isPoison).toBe(true);
        }),
        { numRuns: 100 },
      );
    });
  });

  // --------------------------------------------------------------------------
  // Property 6: DLQ listeleme POISON filtresi
  // --------------------------------------------------------------------------
  describe('Property 6: DLQ listing POISON filter', () => {
    it('isPoison=true filter returns only poison entries', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(dlqEntryArb, { minLength: 1, maxLength: 30 }),
          async (entries) => {
            const store = new InMemoryDlqStore(entries);
            const result = await store.query({ isPoison: true });

            // Every returned entry must be poison
            for (const e of result.entries) {
              expect(e.isPoison).toBe(true);
            }

            // Count must match
            const expectedCount = entries.filter((e) => e.isPoison).length;
            expect(result.total).toBe(expectedCount);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('isPoison=false filter returns only non-poison entries', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(dlqEntryArb, { minLength: 1, maxLength: 30 }),
          async (entries) => {
            const store = new InMemoryDlqStore(entries);
            const result = await store.query({ isPoison: false });

            for (const e of result.entries) {
              expect(e.isPoison).toBe(false);
            }

            const expectedCount = entries.filter((e) => !e.isPoison).length;
            expect(result.total).toBe(expectedCount);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('no isPoison filter returns all entries', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(dlqEntryArb, { minLength: 0, maxLength: 30 }),
          async (entries) => {
            const store = new InMemoryDlqStore(entries);
            const result = await store.query({});

            expect(result.total).toBe(entries.length);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('poison + non-poison counts sum to total', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(dlqEntryArb, { minLength: 0, maxLength: 30 }),
          async (entries) => {
            const store = new InMemoryDlqStore(entries);
            const poisonResult = await store.query({ isPoison: true });
            const nonPoisonResult = await store.query({ isPoison: false });
            const allResult = await store.query({});

            expect(poisonResult.total + nonPoisonResult.total).toBe(allResult.total);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
