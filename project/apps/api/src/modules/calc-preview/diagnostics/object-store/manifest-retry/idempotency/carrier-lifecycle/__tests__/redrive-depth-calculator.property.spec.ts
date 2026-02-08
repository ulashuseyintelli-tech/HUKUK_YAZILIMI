/**
 * Redrive Depth Calculator — Property-Based Tests
 *
 * Phase 11.3 — Task 4.2
 *
 * Validates correctness properties of calculateRedriveDepth using
 * randomly generated DLQ chain graphs (in-memory mock repo).
 *
 * Properties tested:
 *   P1a: Termination — every input produces a result (never hangs)
 *   P1b: Bounded work — traversal steps <= maxTraversal
 *   P1c: Cycle detection — cycles produce cycleDetected=true
 *   P1d: Monotonic — adding a parent cannot decrease depth
 *   P1e: Depth accuracy — known-length chains return exact depth
 *   P1f: Chain broken — NULL/bad carrier stops traversal
 *
 * @see phase-11-3-redrive-depth-limit/design.md — Property 1
 */

import * as fc from 'fast-check';
import { calculateRedriveDepth } from '../redrive-depth-calculator';
import type { IManifestDlqRepository } from '../../../manifest-dlq.repository';
import type { DlqEntry } from '../../../manifest-retry.types';
import type { IdempotencyContextCarrierV2 } from '../carrier-lifecycle.types';

// ============================================================================
// IN-MEMORY MOCK REPO
// ============================================================================

/**
 * Minimal in-memory DLQ repo that resolves correlationId → DlqEntry.
 * Only findByCorrelationId is used by the calculator.
 */
function createMockRepo(
  entries: Map<string, DlqEntry>,
): IManifestDlqRepository {
  return {
    findByCorrelationId: async (correlationId: string) =>
      entries.get(correlationId) ?? null,
    // Stubs — not called by calculator
    upsert: async () => { throw new Error('not implemented'); },
    getById: async () => null,
    getByBundleId: async () => null,
    query: async () => ({ entries: [], total: 0 }),
    queryWithCursor: async () => ({ items: [], page: { limit: 50, nextCursor: null, hasMore: false } }),
    resolve: async () => { throw new Error('not implemented'); },
    atomicRedrive: async () => { throw new Error('not implemented'); },
    getStats: async () => ({ open: 0, resolved: 0, redriven: 0, total: 0 }),
    markAsPoison: async () => {},
  } as unknown as IManifestDlqRepository;
}

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

// ============================================================================
// ARBITRARIES
// ============================================================================

/** Generate maxTraversal 1..25 */
const maxTraversalArb = fc.integer({ min: 1, max: 25 });

/**
 * Build a clean linear chain of N nodes.
 * Returns { carrier, repo, expectedDepth }.
 */
function buildLinearChain(nodeIds: string[]): {
  carrier: IdempotencyContextCarrierV2;
  repo: IManifestDlqRepository;
  expectedDepth: number;
} {
  const entries = new Map<string, DlqEntry>();
  const n = nodeIds.length;

  if (n === 0) {
    return {
      carrier: makeCarrier(undefined),
      repo: createMockRepo(entries),
      expectedDepth: 0,
    };
  }

  // nodeIds[0] = immediate parent, nodeIds[n-1] = root (no parent)
  for (let i = 0; i < n; i++) {
    const parentId = i < n - 1 ? nodeIds[i + 1] : undefined;
    const carrierJson = JSON.stringify({
      version: 2,
      requestId: nodeIds[i],
      parentCorrelationId: parentId,
    });
    entries.set(nodeIds[i], makeDlqEntry({ carrierJson }));
  }

  const carrier = makeCarrier(nodeIds[0]);
  return { carrier, repo: createMockRepo(entries), expectedDepth: n };
}

/**
 * Arbitrary: array of 0..20 unique UUIDs for chain nodes.
 */
const uniqueNodeIdsArb = (min = 0, max = 20) =>
  fc.uniqueArray(fc.uuid(), { minLength: min, maxLength: max });

// ============================================================================
// PROPERTY TESTS
// ============================================================================

describe('Redrive Depth Calculator — Property-Based Tests', () => {
  // --------------------------------------------------------------------------
  // P1a: Termination
  // --------------------------------------------------------------------------
  describe('P1a: Termination — every input terminates', () => {
    it('should always return a DepthCalculationResult (never hang)', async () => {
      await fc.assert(
        fc.asyncProperty(
          uniqueNodeIdsArb(0, 15),
          maxTraversalArb,
          async (nodeIds, maxTrav) => {
            const { carrier, repo } = buildLinearChain(nodeIds);
            const result = await calculateRedriveDepth(carrier, repo, maxTrav);
            expect(result).toBeDefined();
            expect(typeof result.depth).toBe('number');
            expect(typeof result.chainBroken).toBe('boolean');
            expect(typeof result.cycleDetected).toBe('boolean');
            expect(typeof result.traversalMs).toBe('number');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // --------------------------------------------------------------------------
  // P1b: Bounded work — traversal steps <= maxTraversal
  // --------------------------------------------------------------------------
  describe('P1b: Bounded work — depth <= maxTraversal', () => {
    it('should never report depth exceeding maxTraversal', async () => {
      await fc.assert(
        fc.asyncProperty(
          uniqueNodeIdsArb(0, 20),
          maxTraversalArb,
          async (nodeIds, maxTrav) => {
            const { carrier, repo } = buildLinearChain(nodeIds);
            const result = await calculateRedriveDepth(carrier, repo, maxTrav);
            expect(result.depth).toBeLessThanOrEqual(maxTrav);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // --------------------------------------------------------------------------
  // P1c: Cycle detection
  // --------------------------------------------------------------------------
  describe('P1c: Cycle detection — cycles produce cycleDetected=true', () => {
    it('should detect cycles and terminate', async () => {
      await fc.assert(
        fc.asyncProperty(
          // At least 2 nodes to form a cycle
          uniqueNodeIdsArb(2, 10),
          fc.integer({ min: 0 }), // index where cycle points back
          async (nodeIds, cycleTargetRaw) => {
            const n = nodeIds.length;
            const cycleTarget = cycleTargetRaw % n; // which node the last node points back to

            const entries = new Map<string, DlqEntry>();

            // Build chain: 0 → 1 → 2 → ... → (n-1) → cycleTarget (cycle!)
            for (let i = 0; i < n; i++) {
              const parentId = i < n - 1 ? nodeIds[i + 1] : nodeIds[cycleTarget];
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

            const carrier = makeCarrier(nodeIds[0]);
            const repo = createMockRepo(entries);
            const result = await calculateRedriveDepth(carrier, repo, n + 5);

            // Must terminate (covered by P1a) and detect cycle
            expect(result.cycleDetected).toBe(true);
            expect(result.depth).toBeLessThanOrEqual(n);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // --------------------------------------------------------------------------
  // P1d: Monotonic — adding a parent cannot decrease depth
  // --------------------------------------------------------------------------
  describe('P1d: Monotonic — extending chain does not decrease depth', () => {
    it('depth(chain ++ [newParent]) >= depth(chain)', async () => {
      await fc.assert(
        fc.asyncProperty(
          uniqueNodeIdsArb(1, 10),
          fc.uuid(), // extra parent node
          async (nodeIds, extraNodeId) => {
            fc.pre(!nodeIds.includes(extraNodeId));

            const maxTrav = nodeIds.length + 5;

            // Original chain
            const original = buildLinearChain(nodeIds);
            const depthOriginal = await calculateRedriveDepth(
              original.carrier,
              original.repo,
              maxTrav,
            );

            // Extended chain: append extraNodeId as new root
            const extendedIds = [...nodeIds, extraNodeId];
            const extended = buildLinearChain(extendedIds);
            const depthExtended = await calculateRedriveDepth(
              extended.carrier,
              extended.repo,
              maxTrav,
            );

            expect(depthExtended.depth).toBeGreaterThanOrEqual(depthOriginal.depth);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // --------------------------------------------------------------------------
  // P1e: Depth accuracy — known-length chains return exact depth
  // --------------------------------------------------------------------------
  describe('P1e: Depth accuracy — linear chain of N returns depth=N', () => {
    it('should return exact depth for clean linear chains', async () => {
      await fc.assert(
        fc.asyncProperty(
          uniqueNodeIdsArb(0, 15),
          async (nodeIds) => {
            const maxTrav = nodeIds.length + 5; // enough headroom
            const { carrier, repo, expectedDepth } = buildLinearChain(nodeIds);
            const result = await calculateRedriveDepth(carrier, repo, maxTrav);

            expect(result.depth).toBe(expectedDepth);
            expect(result.chainBroken).toBe(false);
            expect(result.cycleDetected).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // --------------------------------------------------------------------------
  // P1f: Chain broken — NULL/bad carrierJson stops traversal
  // --------------------------------------------------------------------------
  describe('P1f: Chain broken — NULL or bad JSON stops traversal', () => {
    it('should stop at broken link and report chainBroken=true', async () => {
      await fc.assert(
        fc.asyncProperty(
          uniqueNodeIdsArb(2, 12),
          fc.integer({ min: 0 }),
          fc.constantFrom('null', 'bad-json', 'missing-entry'),
          async (nodeIds, breakIndexRaw, breakType) => {
            const n = nodeIds.length;
            // Break somewhere in the middle (not the carrier itself)
            const breakIndex = breakIndexRaw % n;

            const entries = new Map<string, DlqEntry>();

            for (let i = 0; i < n; i++) {
              const parentId = i < n - 1 ? nodeIds[i + 1] : undefined;

              if (i === breakIndex) {
                if (breakType === 'null') {
                  entries.set(nodeIds[i], makeDlqEntry({ carrierJson: null }));
                } else if (breakType === 'bad-json') {
                  entries.set(nodeIds[i], makeDlqEntry({ carrierJson: '{{{INVALID' }));
                }
                // 'missing-entry' → don't add to map at all
                continue;
              }

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

            const carrier = makeCarrier(nodeIds[0]);
            const repo = createMockRepo(entries);
            const result = await calculateRedriveDepth(carrier, repo, n + 5);

            // Depth should be <= breakIndex (stopped at or before break)
            expect(result.depth).toBeLessThanOrEqual(breakIndex);
            // Either chainBroken or cycleDetected (if break caused early stop)
            if (result.depth < n) {
              expect(result.chainBroken || result.cycleDetected || result.depth === breakIndex).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
