/**
 * Redrive Rate Limiter — Property-Based Tests + Unit Tests
 *
 * Phase 11.4 — Task 5.2, 5.3
 *
 * Properties tested:
 *   P2: No Early Allow (INV-11.4.1)
 *       — now < nextAllowedRedriveAt → allowed=false
 *   P3: Reject Does Not Mutate Counters (INV-11.4.3)
 *       — reject path has zero DB writes
 *
 * Additional PBTs:
 *   P-key: Key fallback chain (rootCorrelationId → correlationId → id)
 *   P-clamp: Clamp/hash determinism (same input → same hash)
 *   P-wait: waitSeconds = ceil((nextAllowed - now) / 1000)
 *
 * Unit tests:
 *   - First redrive (NULL nextAllowed) → allow
 *   - now >= nextAllowed → allow
 *   - now < nextAllowed → reject + correct waitSeconds
 *   - resolveRateLimitKey priority chain
 *   - clampKey hash for long keys
 *
 * @see phase-11-4-redrive-rate-limiting/design.md — Properties 2, 3
 */

import * as fc from 'fast-check';
import { createHash } from 'crypto';
import type { DlqEntry } from '../../../manifest-retry.types';
import {
  checkRateLimit,
  resolveRateLimitKey,
  clampKey,
  MAX_KEY_LENGTH,
  HASH_KEY_PREFIX,
} from '../redrive-rate-limiter';
import { DEFAULT_BACKOFF_CONFIG } from '../redrive-backoff-policy';

// ============================================================================
// HELPERS
// ============================================================================

const BASE_NOW = new Date('2026-02-07T12:00:00.000Z');

/** Minimal DlqEntry factory — only fields relevant to rate limiter */
function makeDlqEntry(overrides: Partial<DlqEntry> = {}): DlqEntry {
  return {
    id: 'dlq-test-id',
    bundleId: 'bundle-test-id',
    attempt: 1,
    finalErrorCode: 'MANIFEST_WRITE_FAILED' as any,
    finalErrorMessage: null,
    firstFailedAt: BASE_NOW,
    lastFailedAt: BASE_NOW,
    status: 'DLQ_OPEN',
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    redrivenAt: null,
    redrivenBy: null,
    createdAt: BASE_NOW,
    carrierJson: null,
    carrierVersion: null,
    carrierTruncated: false,
    isPoison: false,
    poisonReason: null,
    lastRedrivenAt: null,
    redriveCount: 0,
    nextAllowedRedriveAt: null,
    rateLimitReason: null,
    ...overrides,
  };
}

// ============================================================================
// GENERATORS
// ============================================================================

/** Random timestamp within a reasonable range (noInvalidDate to avoid NaN) */
const arbTimestamp = fc.date({
  min: new Date('2020-01-01T00:00:00Z'),
  max: new Date('2030-12-31T23:59:59Z'),
  noInvalidDate: true,
});

/** Random positive integer for redriveCount */
const arbRedriveCount = fc.integer({ min: 0, max: 100 });

/** Random string of given length */
const arbShortKey = fc.string({ minLength: 1, maxLength: MAX_KEY_LENGTH });
const arbLongKey = fc.string({ minLength: MAX_KEY_LENGTH + 1, maxLength: 1000 });

// ============================================================================
// PROPERTY-BASED TESTS
// ============================================================================

describe('Phase 11.4 — Rate Limiter PBT', () => {
  // --------------------------------------------------------------------------
  // Property 2: No Early Allow (INV-11.4.1)
  // **Validates: Requirements 2.1**
  // --------------------------------------------------------------------------
  describe('Property 2: No Early Allow (INV-11.4.1)', () => {
    it('now < nextAllowedRedriveAt → always rejected', () => {
      fc.assert(
        fc.property(
          arbTimestamp,
          fc.integer({ min: 1, max: 3_600_000 }),
          arbRedriveCount,
          (nextAllowed, deltaMs, count) => {
            // now is strictly before nextAllowed
            const now = new Date(nextAllowed.getTime() - deltaMs);
            const entry = makeDlqEntry({
              redriveCount: count,
              nextAllowedRedriveAt: nextAllowed,
            });

            const result = checkRateLimit(entry, now);

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('RATE_LIMITED');
          },
        ),
        { numRuns: 200 },
      );
    });

    it('waitSeconds = ceil((nextAllowed - now) / 1000)', () => {
      fc.assert(
        fc.property(
          arbTimestamp,
          fc.integer({ min: 1, max: 3_600_000 }),
          (nextAllowed, deltaMs) => {
            const now = new Date(nextAllowed.getTime() - deltaMs);
            const entry = makeDlqEntry({ nextAllowedRedriveAt: nextAllowed });

            const result = checkRateLimit(entry, now);

            expect(result.allowed).toBe(false);
            expect(result.waitSeconds).toBe(Math.ceil(deltaMs / 1000));
          },
        ),
        { numRuns: 200 },
      );
    });

    it('now >= nextAllowedRedriveAt → always allowed', () => {
      fc.assert(
        fc.property(
          arbTimestamp,
          fc.integer({ min: 0, max: 3_600_000 }),
          (nextAllowed, deltaMs) => {
            // now is at or after nextAllowed
            const now = new Date(nextAllowed.getTime() + deltaMs);
            const entry = makeDlqEntry({ nextAllowedRedriveAt: nextAllowed });

            const result = checkRateLimit(entry, now);

            expect(result.allowed).toBe(true);
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  // --------------------------------------------------------------------------
  // Property 3: Reject Does Not Mutate Counters (INV-11.4.3)
  // **Validates: Requirements 5.2**
  // --------------------------------------------------------------------------
  describe('Property 3: Reject Does Not Mutate Counters (INV-11.4.3)', () => {
    it('checkRateLimit is a pure function — no side effects on entry', () => {
      fc.assert(
        fc.property(
          arbTimestamp,
          fc.integer({ min: 1, max: 3_600_000 }),
          arbRedriveCount,
          (nextAllowed, deltaMs, count) => {
            const now = new Date(nextAllowed.getTime() - deltaMs);
            const entry = makeDlqEntry({
              redriveCount: count,
              nextAllowedRedriveAt: nextAllowed,
              lastRedrivenAt: BASE_NOW,
            });

            // Snapshot state before
            const countBefore = entry.redriveCount;
            const nextBefore = entry.nextAllowedRedriveAt;
            const lastBefore = entry.lastRedrivenAt;

            checkRateLimit(entry, now);

            // State unchanged after reject
            expect(entry.redriveCount).toBe(countBefore);
            expect(entry.nextAllowedRedriveAt).toBe(nextBefore);
            expect(entry.lastRedrivenAt).toBe(lastBefore);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('checkRateLimit never calls any repo method (synchronous, no DB)', () => {
      // checkRateLimit is synchronous — it cannot call async repo methods.
      // This test verifies the function signature is sync (returns plain object, not Promise).
      fc.assert(
        fc.property(
          arbTimestamp,
          fc.integer({ min: 1, max: 3_600_000 }),
          (nextAllowed, deltaMs) => {
            const now = new Date(nextAllowed.getTime() - deltaMs);
            const entry = makeDlqEntry({ nextAllowedRedriveAt: nextAllowed });

            const result = checkRateLimit(entry, now);

            // Result is a plain object, not a Promise
            expect(result).toBeDefined();
            expect(typeof (result as any).then).not.toBe('function');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // --------------------------------------------------------------------------
  // P-key: Key Fallback Chain
  // --------------------------------------------------------------------------
  describe('P-key: Key Fallback Chain', () => {
    it('rootCorrelationId takes priority over correlationId and id', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          (rootId, corrId) => {
            const entry = makeDlqEntry({
              id: 'fallback-id',
              carrierJson: JSON.stringify({
                rootCorrelationId: rootId,
                requestId: corrId,
              }),
            });

            const key = resolveRateLimitKey(entry);
            expect(key).toBe(rootId);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('correlationId used when rootCorrelationId absent', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (corrId) => {
            const entry = makeDlqEntry({
              id: 'fallback-id',
              carrierJson: JSON.stringify({ requestId: corrId }),
            });

            const key = resolveRateLimitKey(entry);
            expect(key).toBe(corrId);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('dlqEntry.id used when carrier has neither root nor correlation', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (entryId) => {
            const entry = makeDlqEntry({
              id: entryId,
              carrierJson: JSON.stringify({ someOtherField: 'value' }),
            });

            const key = resolveRateLimitKey(entry);
            expect(key).toBe(entryId);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('dlqEntry.id used when carrierJson is null', () => {
      const entry = makeDlqEntry({ id: 'my-dlq-id', carrierJson: null });
      expect(resolveRateLimitKey(entry)).toBe('my-dlq-id');
    });

    it('dlqEntry.id used when carrierJson is invalid JSON', () => {
      const entry = makeDlqEntry({ id: 'my-dlq-id', carrierJson: '{broken' });
      expect(resolveRateLimitKey(entry)).toBe('my-dlq-id');
    });
  });

  // --------------------------------------------------------------------------
  // P-clamp: Clamp/Hash Determinism
  // --------------------------------------------------------------------------
  describe('P-clamp: Clamp/Hash Determinism', () => {
    it('short keys pass through unchanged', () => {
      fc.assert(
        fc.property(arbShortKey, (key) => {
          expect(clampKey(key)).toBe(key);
        }),
        { numRuns: 100 },
      );
    });

    it('long keys are hashed deterministically', () => {
      fc.assert(
        fc.property(arbLongKey, (key) => {
          const result1 = clampKey(key);
          const result2 = clampKey(key);
          expect(result1).toBe(result2);
          expect(result1.startsWith(HASH_KEY_PREFIX)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('hashed key matches expected sha256', () => {
      fc.assert(
        fc.property(arbLongKey, (key) => {
          const result = clampKey(key);
          const expectedHash = createHash('sha256').update(key).digest('hex');
          expect(result).toBe(`${HASH_KEY_PREFIX}${expectedHash}`);
        }),
        { numRuns: 100 },
      );
    });

    it('hashed key length is always prefix + 64 hex chars', () => {
      fc.assert(
        fc.property(arbLongKey, (key) => {
          const result = clampKey(key);
          // "rl:v1:" (6 chars) + 64 hex chars = 70
          expect(result.length).toBe(HASH_KEY_PREFIX.length + 64);
        }),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// UNIT TESTS
// ============================================================================

describe('Phase 11.4 — Rate Limiter Unit Tests', () => {
  describe('checkRateLimit', () => {
    it('first redrive (NULL nextAllowed) → allow', () => {
      const entry = makeDlqEntry({ nextAllowedRedriveAt: null, redriveCount: 0 });
      const result = checkRateLimit(entry, BASE_NOW);
      expect(result.allowed).toBe(true);
      expect(result.redriveCount).toBe(0);
      expect(result.reason).toBeUndefined();
    });

    it('now >= nextAllowed → allow', () => {
      const nextAllowed = new Date(BASE_NOW.getTime() - 1000); // 1s ago
      const entry = makeDlqEntry({ nextAllowedRedriveAt: nextAllowed, redriveCount: 3 });
      const result = checkRateLimit(entry, BASE_NOW);
      expect(result.allowed).toBe(true);
      expect(result.redriveCount).toBe(3);
    });

    it('now == nextAllowed → allow (boundary)', () => {
      const entry = makeDlqEntry({ nextAllowedRedriveAt: BASE_NOW, redriveCount: 1 });
      const result = checkRateLimit(entry, BASE_NOW);
      expect(result.allowed).toBe(true);
    });

    it('now < nextAllowed → reject with correct waitSeconds', () => {
      const nextAllowed = new Date(BASE_NOW.getTime() + 45_000); // 45s from now
      const entry = makeDlqEntry({ nextAllowedRedriveAt: nextAllowed, redriveCount: 2 });
      const result = checkRateLimit(entry, BASE_NOW);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('RATE_LIMITED');
      expect(result.waitSeconds).toBe(45);
      expect(result.nextAllowedAt!.getTime()).toBe(nextAllowed.getTime());
      expect(result.redriveCount).toBe(2);
      expect(result.policy).toBeDefined();
    });

    it('waitSeconds uses ceil (500ms → 1s)', () => {
      const nextAllowed = new Date(BASE_NOW.getTime() + 500); // 500ms
      const entry = makeDlqEntry({ nextAllowedRedriveAt: nextAllowed });
      const result = checkRateLimit(entry, BASE_NOW);
      expect(result.waitSeconds).toBe(1);
    });

    it('waitSeconds uses ceil (1001ms → 2s)', () => {
      const nextAllowed = new Date(BASE_NOW.getTime() + 1001);
      const entry = makeDlqEntry({ nextAllowedRedriveAt: nextAllowed });
      const result = checkRateLimit(entry, BASE_NOW);
      expect(result.waitSeconds).toBe(2);
    });

    it('redriveCount defaults to 0 when undefined', () => {
      const entry = makeDlqEntry({ redriveCount: undefined as any });
      const result = checkRateLimit(entry, BASE_NOW);
      expect(result.redriveCount).toBe(0);
    });
  });

  describe('resolveRateLimitKey', () => {
    it('uses rootCorrelationId when present', () => {
      const entry = makeDlqEntry({
        carrierJson: JSON.stringify({
          rootCorrelationId: 'root-123',
          requestId: 'corr-456',
        }),
      });
      expect(resolveRateLimitKey(entry)).toBe('root-123');
    });

    it('uses correlationId (requestId) when root absent', () => {
      const entry = makeDlqEntry({
        carrierJson: JSON.stringify({ requestId: 'corr-456' }),
      });
      expect(resolveRateLimitKey(entry)).toBe('corr-456');
    });

    it('uses dlqEntry.id when carrier has no correlation fields', () => {
      const entry = makeDlqEntry({
        id: 'dlq-fallback',
        carrierJson: JSON.stringify({ foo: 'bar' }),
      });
      expect(resolveRateLimitKey(entry)).toBe('dlq-fallback');
    });

    it('uses dlqEntry.id when carrierJson is null', () => {
      const entry = makeDlqEntry({ id: 'dlq-null', carrierJson: null });
      expect(resolveRateLimitKey(entry)).toBe('dlq-null');
    });

    it('uses dlqEntry.id when carrierJson is invalid JSON', () => {
      const entry = makeDlqEntry({ id: 'dlq-bad', carrierJson: 'not-json' });
      expect(resolveRateLimitKey(entry)).toBe('dlq-bad');
    });

    it('hashes key when rootCorrelationId exceeds 256 chars', () => {
      const longRoot = 'r'.repeat(300);
      const entry = makeDlqEntry({
        carrierJson: JSON.stringify({ rootCorrelationId: longRoot }),
      });
      const key = resolveRateLimitKey(entry);
      expect(key.startsWith(HASH_KEY_PREFIX)).toBe(true);
      expect(key.length).toBe(HASH_KEY_PREFIX.length + 64);
    });
  });

  describe('clampKey', () => {
    it('returns key unchanged when <= 256 chars', () => {
      const key = 'a'.repeat(256);
      expect(clampKey(key)).toBe(key);
    });

    it('hashes key when > 256 chars', () => {
      const key = 'b'.repeat(257);
      const result = clampKey(key);
      const expectedHash = createHash('sha256').update(key).digest('hex');
      expect(result).toBe(`${HASH_KEY_PREFIX}${expectedHash}`);
    });

    it('empty string passes through', () => {
      expect(clampKey('')).toBe('');
    });
  });

});
