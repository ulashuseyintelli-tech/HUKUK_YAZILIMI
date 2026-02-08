/**
 * Redrive Depth Enforcer — Property-Based Tests
 *
 * Phase 11.3 — Tasks 5.2, 5.3, 5.4
 *
 * Validates enforcement decision, POISON latch, and fail-closed
 * behaviour using in-memory mock repo (no DB).
 *
 * Properties tested:
 *   P2: Enforcement decision — depth >= MAX ↔ reject, depth < MAX ↔ allow
 *   P4: POISON latch — is_poison=true → immediate reject, no calculator call
 *   P5: Fail-closed — repo error → reject (never allow on error)
 *
 * @see phase-11-3-redrive-depth-limit/design.md — Properties 2, 4, 5
 */

import * as fc from 'fast-check';
import {
  enforceRedriveDepthLimit,
  DepthEnforcementResult,
} from '../redrive-depth-enforcer';
import type { IManifestDlqRepository } from '../../../manifest-dlq.repository';
import type { DlqEntry } from '../../../manifest-retry.types';
import type { IdempotencyContextCarrierV2 } from '../carrier-lifecycle.types';
import { resetAllMetrics } from '../carrier-lifecycle-metrics';

// ============================================================================
// HELPERS
// ============================================================================

const NOW = new Date();

function makeDlqEntry(overrides: Partial<DlqEntry> = {}): DlqEntry {
  return {
    id: 'dlq-stub',
    bundleId: 'bundle-stub',
    attempt: 1,
    finalErrorCode: 'UNKNOWN_ERROR' as any,
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

function makeCarrier(parentCorrelationId?: string): IdempotencyContextCarrierV2 {
  return {
    version: 2,
    requestId: `req-${Math.random().toString(36).slice(2, 10)}`,
    actionId: 'action-stub',
    actionType: 'DLQ_REDRIVE',
    resourceType: 'DLQ_ENTRY',
    resourceId: null,
    takeover: false,
    previousActorId: null,
    attemptNumber: 0,
    parentCorrelationId,
  } as IdempotencyContextCarrierV2;
}

/**
 * Build a mock repo that returns a linear chain of `depth` entries.
 * The carrier's parentCorrelationId points to node-0, which points to node-1, etc.
 * The last node has no parent (root).
 */
function buildChainRepo(depth: number): {
  carrier: IdempotencyContextCarrierV2;
  repo: IManifestDlqRepository;
  poisonCalls: Array<{ dlqId: string; reason: string }>;
} {
  const nodeIds = Array.from({ length: depth }, (_, i) => `node-${i}`);
  const entries = new Map<string, DlqEntry>();
  const poisonCalls: Array<{ dlqId: string; reason: string }> = [];

  for (let i = 0; i < depth; i++) {
    const parentId = i < depth - 1 ? nodeIds[i + 1] : undefined;
    entries.set(
      nodeIds[i],
      makeDlqEntry({
        carrierJson: JSON.stringify({
          version: 2,
          requestId: nodeIds[i],
          parentCorrelationId: parentId,
        }),
      }),
    );
  }

  const carrier = makeCarrier(depth > 0 ? nodeIds[0] : undefined);

  const repo: IManifestDlqRepository = {
    findByCorrelationId: async (cid: string) => entries.get(cid) ?? null,
    markAsPoison: async (dlqId: string, input: { reason: string }) => {
      poisonCalls.push({ dlqId, reason: input.reason });
    },
    // Stubs
    upsert: async () => { throw new Error('not implemented'); },
    getById: async () => null,
    getByBundleId: async () => null,
    query: async () => ({ entries: [], total: 0 }),
    queryWithCursor: async () => ({ items: [], page: { limit: 50, nextCursor: null, hasMore: false } }),
    resolve: async () => { throw new Error('not implemented'); },
    atomicRedrive: async () => { throw new Error('not implemented'); },
    getStats: async () => ({ open: 0, resolved: 0, redriven: 0, total: 0 }),
  } as unknown as IManifestDlqRepository;

  return { carrier, repo, poisonCalls };
}

/**
 * Build a repo whose findByCorrelationId always throws (simulates DB error).
 */
function buildErrorRepo(): IManifestDlqRepository {
  return {
    findByCorrelationId: async () => {
      throw new Error('DB_CONNECTION_LOST');
    },
    markAsPoison: async () => {
      throw new Error('DB_CONNECTION_LOST');
    },
    upsert: async () => { throw new Error('not implemented'); },
    getById: async () => null,
    getByBundleId: async () => null,
    query: async () => ({ entries: [], total: 0 }),
    queryWithCursor: async () => ({ items: [], page: { limit: 50, nextCursor: null, hasMore: false } }),
    resolve: async () => { throw new Error('not implemented'); },
    atomicRedrive: async () => { throw new Error('not implemented'); },
    getStats: async () => ({ open: 0, resolved: 0, redriven: 0, total: 0 }),
  } as unknown as IManifestDlqRepository;
}

// ============================================================================
// ARBITRARIES
// ============================================================================

/** Depth 0..10 */
const depthArb = fc.integer({ min: 0, max: 10 });

/** maxDepth 1..5 */
const maxDepthArb = fc.integer({ min: 1, max: 5 });

// ============================================================================
// PROPERTY TESTS
// ============================================================================

describe('Redrive Depth Enforcer — Property-Based Tests', () => {
  beforeEach(() => resetAllMetrics());

  // --------------------------------------------------------------------------
  // P2: Enforcement decision
  // --------------------------------------------------------------------------
  describe('P2: Enforcement decision — depth vs maxDepth', () => {
    it('depth >= maxDepth → allowed=false + DEPTH_EXCEEDED + markAsPoison called', async () => {
      await fc.assert(
        fc.asyncProperty(depthArb, maxDepthArb, async (depth, maxDepth) => {
          fc.pre(depth >= maxDepth);

          const dlqEntry = makeDlqEntry();
          const { carrier, repo, poisonCalls } = buildChainRepo(depth);
          const result = await enforceRedriveDepthLimit(dlqEntry, carrier, repo, maxDepth);

          expect(result.allowed).toBe(false);
          expect(result.reason).toBe('DEPTH_EXCEEDED');
          expect(result.currentDepth).toBeGreaterThanOrEqual(maxDepth);
          // markAsPoison must have been called exactly once
          expect(poisonCalls.length).toBe(1);
          expect(poisonCalls[0].dlqId).toBe(dlqEntry.id);
          expect(poisonCalls[0].reason).toContain('REDRIVE_DEPTH_EXCEEDED');
        }),
        { numRuns: 100 },
      );
    });

    it('depth < maxDepth → allowed=true + no poison', async () => {
      await fc.assert(
        fc.asyncProperty(depthArb, maxDepthArb, async (depth, maxDepth) => {
          fc.pre(depth < maxDepth);

          const dlqEntry = makeDlqEntry();
          const { carrier, repo, poisonCalls } = buildChainRepo(depth);
          const result = await enforceRedriveDepthLimit(dlqEntry, carrier, repo, maxDepth);

          expect(result.allowed).toBe(true);
          expect(result.reason).toBeUndefined();
          expect(result.currentDepth).toBe(depth);
          expect(poisonCalls.length).toBe(0);
        }),
        { numRuns: 100 },
      );
    });
  });

  // --------------------------------------------------------------------------
  // P4: POISON latch — immediate reject, no depth calculation
  // --------------------------------------------------------------------------
  describe('P4: POISON latch — is_poison=true → immediate reject', () => {
    it('should reject with POISON_ENTRY without calling findByCorrelationId', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }), // random poison reason
          maxDepthArb,
          async (existingReason, maxDepth) => {
            let findCalled = false;

            const dlqEntry = makeDlqEntry({
              isPoison: true,
              poisonReason: existingReason,
            });

            const carrier = makeCarrier('some-parent');

            const repo: IManifestDlqRepository = {
              findByCorrelationId: async () => {
                findCalled = true;
                return null;
              },
              markAsPoison: async () => {},
              upsert: async () => { throw new Error('not implemented'); },
              getById: async () => null,
              getByBundleId: async () => null,
              query: async () => ({ entries: [], total: 0 }),
              queryWithCursor: async () => ({ items: [], page: { limit: 50, nextCursor: null, hasMore: false } }),
              resolve: async () => { throw new Error('not implemented'); },
              atomicRedrive: async () => { throw new Error('not implemented'); },
              getStats: async () => ({ open: 0, resolved: 0, redriven: 0, total: 0 }),
            } as unknown as IManifestDlqRepository;

            const result = await enforceRedriveDepthLimit(dlqEntry, carrier, repo, maxDepth);

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('POISON_ENTRY');
            expect(result.currentDepth).toBe(-1);
            // Calculator must NOT have been invoked
            expect(findCalled).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('POISON latch is irreversible — subsequent calls always reject', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }), // call count
          async (callCount) => {
            const dlqEntry = makeDlqEntry({ isPoison: true, poisonReason: 'DEPTH_EXCEEDED' });
            const carrier = makeCarrier('parent-id');
            const repo = buildChainRepo(0).repo;

            for (let i = 0; i < callCount; i++) {
              const result = await enforceRedriveDepthLimit(dlqEntry, carrier, repo);
              expect(result.allowed).toBe(false);
              expect(result.reason).toBe('POISON_ENTRY');
            }
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // --------------------------------------------------------------------------
  // P5: Fail-closed — repo error → never allow
  // --------------------------------------------------------------------------
  describe('P5: Fail-closed — DB error → reject or throw (never allow)', () => {
    it('should never return allowed=true when repo throws', async () => {
      await fc.assert(
        fc.asyncProperty(maxDepthArb, async (maxDepth) => {
          const dlqEntry = makeDlqEntry(); // not poison
          const carrier = makeCarrier('some-parent');
          const repo = buildErrorRepo();

          let result: DepthEnforcementResult | undefined;
          let threw = false;

          try {
            result = await enforceRedriveDepthLimit(dlqEntry, carrier, repo, maxDepth);
          } catch {
            threw = true;
          }

          // Either it threw (fail-closed at caller level) or returned reject
          if (!threw) {
            expect(result!.allowed).toBe(false);
          }
          // Key invariant: it must NEVER return allowed=true
          if (result) {
            expect(result.allowed).not.toBe(true);
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});
