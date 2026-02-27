/**
 * runBatched Unit Tests
 *
 * Faz 0b Stabilizasyon — Task 1.6 + INV-1 + INV-3
 */

import { runBatched, RunBatchedResult } from '../scheduler-batch.helper';

// Mock item factory
function makeItems(count: number, startId = 1): Array<{ id: string; name: string }> {
  return Array.from({ length: count }, (_, i) => ({
    id: String(startId + i).padStart(8, '0'),
    name: `item-${startId + i}`,
  }));
}

/**
 * Simulates Prisma cursor-based pagination.
 * runBatched sends: { take, orderBy, cursor?: { id: cursorId }, skip?: 1 }
 */
function makeFindMany(allItems: Array<{ id: string; [k: string]: any }>) {
  return jest.fn(async (args: any) => {
    let startIdx = 0;
    if (args.cursor) {
      const cursorKey = Object.keys(args.cursor)[0]; // 'id' or custom cursorField
      const cursorValue = args.cursor[cursorKey];
      const cursorIdx = allItems.findIndex((i) => i[cursorKey] === cursorValue);
      if (cursorIdx === -1) return [];
      startIdx = cursorIdx + (args.skip || 0);
    }
    return allItems.slice(startIdx, startIdx + args.take);
  });
}

describe('runBatched', () => {
  // INV-1: Bounded Resource Consumption
  describe('INV-1: Bounded Resource Consumption', () => {
    it('should process all records when under cap (120 records, cap 500)', async () => {
      const allItems = makeItems(120);
      const findMany = makeFindMany(allItems);
      const handler = jest.fn(async () => {});

      const result = await runBatched(findMany, handler, {
        batchSize: 50,
        maxBatches: 10,
        maxTotal: 500,
      });

      expect(result.processed).toBe(120);
      expect(result.truncated).toBe(false);
      expect(handler).toHaveBeenCalledTimes(120);
    });

    it('should cap at maxTotal when over limit (600 records, cap 500)', async () => {
      const allItems = makeItems(600);
      const findMany = makeFindMany(allItems);
      const handler = jest.fn(async () => {});

      const result = await runBatched(findMany, handler, {
        batchSize: 50,
        maxBatches: 100,
        maxTotal: 500,
      });

      expect(result.processed).toBe(500);
      expect(result.truncated).toBe(true);
    });

    it('should handle 0 records gracefully', async () => {
      const findMany = jest.fn(async () => []);
      const handler = jest.fn(async () => {});

      const result = await runBatched(findMany, handler, {
        batchSize: 50,
        maxBatches: 10,
        maxTotal: 500,
      });

      expect(result.processed).toBe(0);
      expect(result.batches).toBe(1);
      expect(result.truncated).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should cap at maxBatches', async () => {
      const allItems = makeItems(200);
      const findMany = makeFindMany(allItems);
      const handler = jest.fn(async () => {});

      const result = await runBatched(findMany, handler, {
        batchSize: 10,
        maxBatches: 3,
        maxTotal: 500,
      });

      expect(result.processed).toBe(30);
      expect(result.batches).toBe(3);
      expect(result.truncated).toBe(true);
    });
  });

  // INV-3: No Starvation — Cursor Stability
  describe('INV-3: Cursor Stability', () => {
    it('should process all items uniquely across batches', async () => {
      const allItems = makeItems(75);
      const processedIds = new Set<string>();
      const findMany = makeFindMany(allItems);

      const handler = jest.fn(async (item: any) => {
        processedIds.add(item.id);
      });

      await runBatched(findMany, handler, {
        batchSize: 25,
        maxBatches: 10,
        maxTotal: 500,
      });

      // All 75 items should be unique
      expect(processedIds.size).toBe(75);
    });

    it('should use tie-breaker when cursorField is not id', async () => {
      const findMany = jest.fn(async () => [
        { id: '001', createdAt: '2024-01-01' },
      ]);

      const handler = jest.fn(async () => {});

      await runBatched(findMany, handler, { cursorField: 'createdAt' });

      // orderBy should be array with tie-breaker
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('should use simple orderBy when cursorField is id', async () => {
      const findMany = jest.fn(async () => []);
      const handler = jest.fn(async () => {});

      await runBatched(findMany, handler);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { id: 'asc' },
        }),
      );
    });
  });

  // Task 1.6: non-unique cursorField runtime error
  describe('Task 1.6: cursorField runtime assert', () => {
    it('should throw when cursorField returns non-string value', async () => {
      const findMany = jest.fn(async () => [
        { id: '001', badField: 123 },
      ]);
      const handler = jest.fn(async () => {});

      await expect(
        runBatched(findMany, handler, { cursorField: 'badField' }),
      ).rejects.toThrow("runBatched: cursorField 'badField' returned non-string value: 123");
    });

    it('should throw when cursorField returns undefined', async () => {
      const findMany = jest.fn(async () => [
        { id: '001' },
      ]);
      const handler = jest.fn(async () => {});

      await expect(
        runBatched(findMany, handler, { cursorField: 'nonExistent' }),
      ).rejects.toThrow("runBatched: cursorField 'nonExistent' returned non-string value: undefined");
    });
  });
});
