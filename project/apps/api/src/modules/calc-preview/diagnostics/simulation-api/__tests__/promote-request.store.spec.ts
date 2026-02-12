/**
 * PromoteRequestStore — Idempotency Tests
 *
 * Sprint 3 - Checkpoint A validation
 *
 * Test matrix:
 *   1. Single claim → isNew=true, correct record
 *   2. Duplicate claim (same key) → isNew=false, same requestId
 *   3. Parallel claims (Promise.all) → exactly 1 row, both calls return same record
 *   4. markSucceeded / markFailed status transitions
 *   5. get() returns null for non-existent key
 */

import { PromoteRequestStore, PromoteRequestRecord } from '../promote-request.store';
import { Prisma } from '@prisma/client';

// ============================================================================
// Mock PrismaService
// ============================================================================

function createMockPrisma() {
  return {
    promoteRequest: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

function buildRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'pr-1',
    incidentId: 'inc-1',
    runId: 'run-1',
    requestId: 'req-aaa',
    status: 'IN_PROGRESS',
    resultRef: null,
    createdAt: new Date('2026-02-10T00:00:00Z'),
    updatedAt: new Date('2026-02-10T00:00:00Z'),
    ...overrides,
  };
}

describe('PromoteRequestStore', () => {
  let store: PromoteRequestStore;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    store = new PromoteRequestStore(mockPrisma as any);
  });

  // ==========================================================================
  // 1. Fresh claim
  // ==========================================================================

  describe('claimOrGet — fresh claim', () => {
    it('should INSERT and return isNew=true', async () => {
      const row = buildRow();
      mockPrisma.promoteRequest.create.mockResolvedValue(row);

      const { record, isNew } = await store.claimOrGet('inc-1', 'run-1', 'req-aaa');

      expect(isNew).toBe(true);
      expect(record.incidentId).toBe('inc-1');
      expect(record.runId).toBe('run-1');
      expect(record.requestId).toBe('req-aaa');
      expect(record.status).toBe('IN_PROGRESS');
      expect(mockPrisma.promoteRequest.create).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 2. Duplicate claim — P2002 → SELECT existing
  // ==========================================================================

  describe('claimOrGet — duplicate (P2002 → SELECT)', () => {
    it('should catch unique violation and return existing record with isNew=false', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.0.0' },
      );
      mockPrisma.promoteRequest.create.mockRejectedValue(p2002);

      const existingRow = buildRow({ requestId: 'req-original' });
      mockPrisma.promoteRequest.findUnique.mockResolvedValue(existingRow);

      const { record, isNew } = await store.claimOrGet('inc-1', 'run-1', 'req-new');

      expect(isNew).toBe(false);
      expect(record.requestId).toBe('req-original'); // original, not the new one
      expect(mockPrisma.promoteRequest.findUnique).toHaveBeenCalledWith({
        where: { incidentId_runId: { incidentId: 'inc-1', runId: 'run-1' } },
      });
    });

    it('should throw if record vanishes after P2002 (edge case)', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.0.0' },
      );
      mockPrisma.promoteRequest.create.mockRejectedValue(p2002);
      mockPrisma.promoteRequest.findUnique.mockResolvedValue(null);

      await expect(store.claimOrGet('inc-1', 'run-1', 'req-x'))
        .rejects.toThrow('vanished');
    });
  });

  // ==========================================================================
  // 3. Parallel claims — exactly 1 winner
  // ==========================================================================

  describe('claimOrGet — parallel calls (Promise.all)', () => {
    it('should produce exactly 1 INSERT + 1 SELECT, both return same record', async () => {
      const row = buildRow({ requestId: 'req-winner' });

      // First call succeeds (INSERT)
      // Second call hits P2002 → SELECT
      let callCount = 0;
      mockPrisma.promoteRequest.create.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return row;
        throw new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed',
          { code: 'P2002', clientVersion: '5.0.0' },
        );
      });
      mockPrisma.promoteRequest.findUnique.mockResolvedValue(row);

      const [r1, r2] = await Promise.all([
        store.claimOrGet('inc-1', 'run-1', 'req-a'),
        store.claimOrGet('inc-1', 'run-1', 'req-b'),
      ]);

      // Both return the same requestId (the winner's)
      expect(r1.record.requestId).toBe('req-winner');
      expect(r2.record.requestId).toBe('req-winner');

      // Exactly one isNew=true, one isNew=false
      const newFlags = [r1.isNew, r2.isNew].sort();
      expect(newFlags).toEqual([false, true]);
    });
  });

  // ==========================================================================
  // 4. Status transitions
  // ==========================================================================

  describe('markSucceeded / markFailed', () => {
    it('should update status to SUCCEEDED with resultRef', async () => {
      mockPrisma.promoteRequest.update.mockResolvedValue({});

      await store.markSucceeded('inc-1', 'run-1', 'ref-123');

      expect(mockPrisma.promoteRequest.update).toHaveBeenCalledWith({
        where: { incidentId_runId: { incidentId: 'inc-1', runId: 'run-1' } },
        data: { status: 'SUCCEEDED', resultRef: 'ref-123' },
      });
    });

    it('should update status to FAILED', async () => {
      mockPrisma.promoteRequest.update.mockResolvedValue({});

      await store.markFailed('inc-1', 'run-1');

      expect(mockPrisma.promoteRequest.update).toHaveBeenCalledWith({
        where: { incidentId_runId: { incidentId: 'inc-1', runId: 'run-1' } },
        data: { status: 'FAILED' },
      });
    });
  });

  // ==========================================================================
  // 5. get() — read-only
  // ==========================================================================

  describe('get()', () => {
    it('should return record when exists', async () => {
      mockPrisma.promoteRequest.findUnique.mockResolvedValue(buildRow());

      const result = await store.get('inc-1', 'run-1');
      expect(result).not.toBeNull();
      expect(result!.incidentId).toBe('inc-1');
    });

    it('should return null when not found', async () => {
      mockPrisma.promoteRequest.findUnique.mockResolvedValue(null);

      const result = await store.get('inc-x', 'run-x');
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // 6. Non-P2002 errors propagate
  // ==========================================================================

  describe('error propagation', () => {
    it('should rethrow non-P2002 Prisma errors', async () => {
      const dbError = new Error('Connection refused');
      mockPrisma.promoteRequest.create.mockRejectedValue(dbError);

      await expect(store.claimOrGet('inc-1', 'run-1', 'req-x'))
        .rejects.toThrow('Connection refused');
    });
  });
});
