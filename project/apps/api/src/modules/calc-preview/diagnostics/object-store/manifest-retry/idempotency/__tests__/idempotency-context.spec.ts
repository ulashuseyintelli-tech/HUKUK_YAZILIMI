/**
 * Idempotency Context (ALS) Tests
 * 
 * Phase 10.3 - PR-7.1
 * 
 * Tests for AsyncLocalStorage-based context propagation.
 * 
 * DoD:
 * - Parallel requests → context isolation verified
 * - CACHED/IN_PROGRESS paths → getStore() returns undefined
 * - Context immutability
 */

import { IdempotencyALS, getIdempotencyContext, hasIdempotencyContext, IdempotencyContext } from '../idempotency-context';

describe('IdempotencyContext (ALS)', () => {
  describe('getIdempotencyContext', () => {
    it('returns undefined outside of ALS.run() scope', () => {
      expect(getIdempotencyContext()).toBeUndefined();
    });

    it('returns context inside ALS.run() scope', () => {
      const ctx: IdempotencyContext = {
        actionId: 'act-123',
        requestId: 'req-456',
        actionType: 'RETRY_BUNDLE',
        resourceType: 'BUNDLE',
        resourceId: 'bundle-789',
        takeover: false,
        previousActorId: null,
      };

      IdempotencyALS.run(ctx, () => {
        const retrieved = getIdempotencyContext();
        expect(retrieved).toBeDefined();
        expect(retrieved?.actionId).toBe('act-123');
        expect(retrieved?.requestId).toBe('req-456');
        expect(retrieved?.actionType).toBe('RETRY_BUNDLE');
      });
    });

    it('returns undefined after ALS.run() completes', () => {
      const ctx: IdempotencyContext = {
        actionId: 'act-123',
        requestId: 'req-456',
        actionType: 'RETRY_BUNDLE',
        resourceType: 'BUNDLE',
        resourceId: null,
        takeover: false,
        previousActorId: null,
      };

      IdempotencyALS.run(ctx, () => {
        expect(getIdempotencyContext()).toBeDefined();
      });

      // After run() completes
      expect(getIdempotencyContext()).toBeUndefined();
    });
  });

  describe('hasIdempotencyContext', () => {
    it('returns false outside of ALS.run() scope', () => {
      expect(hasIdempotencyContext()).toBe(false);
    });

    it('returns true inside ALS.run() scope', () => {
      const ctx: IdempotencyContext = {
        actionId: 'act-123',
        requestId: 'req-456',
        actionType: 'RETRY_BUNDLE',
        resourceType: 'BUNDLE',
        resourceId: null,
        takeover: false,
        previousActorId: null,
      };

      IdempotencyALS.run(ctx, () => {
        expect(hasIdempotencyContext()).toBe(true);
      });
    });
  });

  describe('context isolation (parallel requests)', () => {
    it('isolates context between concurrent async operations', async () => {
      const results: string[] = [];

      const ctx1: IdempotencyContext = {
        actionId: 'act-1',
        requestId: 'req-1',
        actionType: 'RETRY_BUNDLE',
        resourceType: 'BUNDLE',
        resourceId: 'bundle-1',
        takeover: false,
        previousActorId: null,
      };

      const ctx2: IdempotencyContext = {
        actionId: 'act-2',
        requestId: 'req-2',
        actionType: 'MOVE_TO_DLQ',
        resourceType: 'BUNDLE',
        resourceId: 'bundle-2',
        takeover: true,
        previousActorId: 'prev-actor',
      };

      // Simulate two parallel requests
      const promise1 = new Promise<void>((resolve) => {
        IdempotencyALS.run(ctx1, async () => {
          // Simulate async work
          await new Promise((r) => setTimeout(r, 10));
          const ctx = getIdempotencyContext();
          results.push(`p1:${ctx?.actionId}`);
          resolve();
        });
      });

      const promise2 = new Promise<void>((resolve) => {
        IdempotencyALS.run(ctx2, async () => {
          // Simulate async work (shorter delay)
          await new Promise((r) => setTimeout(r, 5));
          const ctx = getIdempotencyContext();
          results.push(`p2:${ctx?.actionId}`);
          resolve();
        });
      });

      await Promise.all([promise1, promise2]);

      // Each request should see its own context
      expect(results).toContain('p1:act-1');
      expect(results).toContain('p2:act-2');
    });

    it('maintains context through nested async calls', async () => {
      const ctx: IdempotencyContext = {
        actionId: 'act-nested',
        requestId: 'req-nested',
        actionType: 'RETRY_BUNDLE',
        resourceType: 'BUNDLE',
        resourceId: null,
        takeover: false,
        previousActorId: null,
      };

      const nestedResults: (string | undefined)[] = [];

      await new Promise<void>((resolve) => {
        IdempotencyALS.run(ctx, async () => {
          nestedResults.push(getIdempotencyContext()?.actionId);
          
          // First level async
          await Promise.resolve();
          nestedResults.push(getIdempotencyContext()?.actionId);
          
          // Second level async
          await new Promise((r) => setTimeout(r, 5));
          nestedResults.push(getIdempotencyContext()?.actionId);
          
          // Third level - nested promise
          await Promise.all([
            (async () => {
              await Promise.resolve();
              nestedResults.push(getIdempotencyContext()?.actionId);
            })(),
          ]);
          
          resolve();
        });
      });

      // All nested calls should see the same context
      expect(nestedResults).toEqual([
        'act-nested',
        'act-nested',
        'act-nested',
        'act-nested',
      ]);
    });
  });

  describe('CACHED/IN_PROGRESS paths (no ALS.run)', () => {
    it('simulates CACHED path - no context available', () => {
      // CACHED path doesn't call ALS.run()
      // Downstream code should handle undefined gracefully
      
      const enrichAudit = () => {
        const ctx = getIdempotencyContext();
        if (ctx) {
          return { actionId: ctx.actionId, enriched: true };
        }
        return { enriched: false };
      };

      // Outside ALS.run() - simulates CACHED path
      const result = enrichAudit();
      expect(result.enriched).toBe(false);
      expect(result).not.toHaveProperty('actionId');
    });

    it('simulates IN_PROGRESS path - no context available', () => {
      // IN_PROGRESS path doesn't call ALS.run()
      const ctx = getIdempotencyContext();
      expect(ctx).toBeUndefined();
      expect(hasIdempotencyContext()).toBe(false);
    });
  });

  describe('takeover context', () => {
    it('correctly propagates takeover information', () => {
      const ctx: IdempotencyContext = {
        actionId: 'act-takeover',
        requestId: 'req-takeover',
        actionType: 'RETRY_BUNDLE',
        resourceType: 'BUNDLE',
        resourceId: 'bundle-123',
        takeover: true,
        previousActorId: 'previous-user-id',
      };

      IdempotencyALS.run(ctx, () => {
        const retrieved = getIdempotencyContext();
        expect(retrieved?.takeover).toBe(true);
        expect(retrieved?.previousActorId).toBe('previous-user-id');
      });
    });

    it('correctly propagates non-takeover context', () => {
      const ctx: IdempotencyContext = {
        actionId: 'act-normal',
        requestId: 'req-normal',
        actionType: 'MOVE_TO_DLQ',
        resourceType: 'BUNDLE',
        resourceId: 'bundle-456',
        takeover: false,
        previousActorId: null,
      };

      IdempotencyALS.run(ctx, () => {
        const retrieved = getIdempotencyContext();
        expect(retrieved?.takeover).toBe(false);
        expect(retrieved?.previousActorId).toBeNull();
      });
    });
  });
});
