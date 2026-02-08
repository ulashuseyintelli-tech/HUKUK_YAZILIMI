/**
 * Admin Controller — Depth Check Integration Tests
 *
 * Phase 11.3 — Task 8.5
 *
 * Tests HTTP 409 responses, audit logging, currentDepth in success,
 * and fail-closed behaviour at the controller level.
 *
 * @see phase-11-3-redrive-depth-limit/design.md — Req 5.1–5.5
 */

import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { ManifestAdminController } from '../manifest-admin.controller';
import {
  resetAllMetrics,
  redriveRejectedMetric,
} from '../idempotency/carrier-lifecycle/carrier-lifecycle-metrics';
import { MAX_REDRIVE_DEPTH } from '../idempotency/carrier-lifecycle/redrive-depth-enforcer';
import { DlqEntry, DlqStatus } from '../manifest-retry.types';
import { ManifestErrorCode } from '../manifest-error-classifier';

// ============================================================================
// FIXTURES
// ============================================================================

const NOW = new Date('2026-02-07T10:00:00Z');

function makeDlqEntry(overrides: Partial<DlqEntry> = {}): DlqEntry {
  return {
    id: 'dlq-depth-test',
    bundleId: 'bundle-depth-test',
    attempt: 3,
    finalErrorCode: 'NETWORK_ERROR' as ManifestErrorCode,
    finalErrorMessage: 'Connection refused',
    firstFailedAt: NOW,
    lastFailedAt: NOW,
    status: 'DLQ_OPEN' as DlqStatus,
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    redrivenAt: null,
    redrivenBy: null,
    createdAt: NOW,
    carrierJson: JSON.stringify({
      version: 2,
      requestId: 'req-original',
      actionId: 'action-1',
      actionType: 'DLQ_REDRIVE',
      resourceType: 'DLQ_ENTRY',
      resourceId: null,
      takeover: false,
      previousActorId: null,
      attemptNumber: 0,
    }),
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

function makeMockReq() {
  return {
    ip: '127.0.0.1',
    get: () => 'test-agent',
    user: { id: 'admin@test' },
    requestId: 'req-test-123',
  } as any;
}

// ============================================================================
// MOCK SETUP
// ============================================================================

function createMocks() {
  const dlqRepo = {
    getById: jest.fn(),
    getByBundleId: jest.fn(),
    upsert: jest.fn(),
    query: jest.fn(),
    queryWithCursor: jest.fn(),
    resolve: jest.fn(),
    atomicRedrive: jest.fn(),
    getStats: jest.fn(),
    markAsPoison: jest.fn(),
    findByCorrelationId: jest.fn(),
  };

  const retryQueue = {
    enqueue: jest.fn(),
    getStats: jest.fn(),
    queryWithCursor: jest.fn(),
    claimNext: jest.fn(),
    scheduleRetry: jest.fn(),
    markDone: jest.fn(),
    extendLease: jest.fn(),
    getById: jest.fn(),
    getActiveByBundleId: jest.fn(),
  };

  const manifestWriter = { manifestExists: jest.fn() };
  const auditService = { append: jest.fn() };

  const controller = new ManifestAdminController(
    retryQueue as any,
    dlqRepo as any,
    manifestWriter as any,
    auditService as any,
  );

  return { controller, dlqRepo, retryQueue, manifestWriter, auditService };
}

// ============================================================================
// TESTS
// ============================================================================

describe('ManifestAdminController — Depth Check (Phase 11.3)', () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    resetAllMetrics();
    mocks = createMocks();
  });

  // --------------------------------------------------------------------------
  // 8.5a: HTTP 409 — REDRIVE_DEPTH_EXCEEDED
  // --------------------------------------------------------------------------
  describe('HTTP 409 — REDRIVE_DEPTH_EXCEEDED', () => {
    it('should return 409 with code, currentDepth, maxDepth when depth >= MAX_REDRIVE_DEPTH', async () => {
      // Entry with a chain of depth=3 (parentCorrelationId → node-0 → node-1 → node-2)
      const entry = makeDlqEntry({
        carrierJson: JSON.stringify({
          version: 2,
          requestId: 'req-original',
          actionId: 'action-1',
          actionType: 'DLQ_REDRIVE',
          resourceType: 'DLQ_ENTRY',
          resourceId: null,
          takeover: false,
          previousActorId: null,
          attemptNumber: 0,
          parentCorrelationId: 'node-0',
        }),
      });

      mocks.dlqRepo.getById.mockResolvedValue(entry);

      // Build chain: node-0 → node-1 → node-2 → (root, no parent)
      mocks.dlqRepo.findByCorrelationId.mockImplementation(async (cid: string) => {
        const chain: Record<string, DlqEntry> = {
          'node-0': makeDlqEntry({
            carrierJson: JSON.stringify({
              version: 2, requestId: 'node-0', parentCorrelationId: 'node-1',
              actionId: 'a', actionType: 'DLQ_REDRIVE', resourceType: 'DLQ_ENTRY',
              resourceId: null, takeover: false, previousActorId: null, attemptNumber: 0,
            }),
          }),
          'node-1': makeDlqEntry({
            carrierJson: JSON.stringify({
              version: 2, requestId: 'node-1', parentCorrelationId: 'node-2',
              actionId: 'a', actionType: 'DLQ_REDRIVE', resourceType: 'DLQ_ENTRY',
              resourceId: null, takeover: false, previousActorId: null, attemptNumber: 0,
            }),
          }),
          'node-2': makeDlqEntry({
            carrierJson: JSON.stringify({
              version: 2, requestId: 'node-2',
              actionId: 'a', actionType: 'DLQ_REDRIVE', resourceType: 'DLQ_ENTRY',
              resourceId: null, takeover: false, previousActorId: null, attemptNumber: 0,
            }),
          }),
        };
        return chain[cid] ?? null;
      });

      const req = makeMockReq();

      try {
        await mocks.controller.redriveDlqEntry('dlq-depth-test', req);
        fail('Expected ConflictException');
      } catch (error: any) {
        expect(error).toBeInstanceOf(ConflictException);
        const response = error.getResponse();
        expect(response.code).toBe('REDRIVE_DEPTH_EXCEEDED');
        expect(response.currentDepth).toBe(3);
        expect(response.maxDepth).toBe(MAX_REDRIVE_DEPTH);
        expect(response.dlqId).toBe('dlq-depth-test');
      }

      // markAsPoison should have been called
      expect(mocks.dlqRepo.markAsPoison).toHaveBeenCalledWith(
        entry.id,
        expect.objectContaining({ reason: expect.stringContaining('REDRIVE_DEPTH_EXCEEDED') }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // 8.5b: HTTP 409 — POISON_ENTRY
  // --------------------------------------------------------------------------
  describe('HTTP 409 — POISON_ENTRY', () => {
    it('should return 409 with code=POISON_ENTRY for already-poison entries', async () => {
      const entry = makeDlqEntry({
        isPoison: true,
        poisonReason: 'REDRIVE_DEPTH_EXCEEDED: depth=3, maxDepth=3',
      });

      mocks.dlqRepo.getById.mockResolvedValue(entry);

      const req = makeMockReq();

      try {
        await mocks.controller.redriveDlqEntry('dlq-depth-test', req);
        fail('Expected ConflictException');
      } catch (error: any) {
        expect(error).toBeInstanceOf(ConflictException);
        const response = error.getResponse();
        expect(response.code).toBe('POISON_ENTRY');
        expect(response.dlqId).toBe('dlq-depth-test');
      }

      // findByCorrelationId should NOT have been called (short-circuit)
      expect(mocks.dlqRepo.findByCorrelationId).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // 8.5c: Audit log on rejection
  // --------------------------------------------------------------------------
  describe('Audit logging on depth rejection', () => {
    it('should emit audit event with reason and correlationId on DEPTH_EXCEEDED', async () => {
      const entry = makeDlqEntry({
        carrierJson: JSON.stringify({
          version: 2,
          requestId: 'req-original',
          actionId: 'action-1',
          actionType: 'DLQ_REDRIVE',
          resourceType: 'DLQ_ENTRY',
          resourceId: null,
          takeover: false,
          previousActorId: null,
          attemptNumber: 0,
          parentCorrelationId: 'node-0',
        }),
      });

      mocks.dlqRepo.getById.mockResolvedValue(entry);

      // Chain of depth=3
      mocks.dlqRepo.findByCorrelationId.mockImplementation(async (cid: string) => {
        const chain: Record<string, DlqEntry> = {
          'node-0': makeDlqEntry({ carrierJson: JSON.stringify({ version: 2, requestId: 'node-0', parentCorrelationId: 'node-1', actionId: 'a', actionType: 'DLQ_REDRIVE', resourceType: 'DLQ_ENTRY', resourceId: null, takeover: false, previousActorId: null, attemptNumber: 0 }) }),
          'node-1': makeDlqEntry({ carrierJson: JSON.stringify({ version: 2, requestId: 'node-1', parentCorrelationId: 'node-2', actionId: 'a', actionType: 'DLQ_REDRIVE', resourceType: 'DLQ_ENTRY', resourceId: null, takeover: false, previousActorId: null, attemptNumber: 0 }) }),
          'node-2': makeDlqEntry({ carrierJson: JSON.stringify({ version: 2, requestId: 'node-2', actionId: 'a', actionType: 'DLQ_REDRIVE', resourceType: 'DLQ_ENTRY', resourceId: null, takeover: false, previousActorId: null, attemptNumber: 0 }) }),
        };
        return chain[cid] ?? null;
      });

      const req = makeMockReq();

      try {
        await mocks.controller.redriveDlqEntry('dlq-depth-test', req);
      } catch {
        // expected
      }

      expect(mocks.auditService.append).toHaveBeenCalledTimes(1);
      const auditCall = mocks.auditService.append.mock.calls[0][0];
      expect(auditCall.eventType).toBe('DLQ_REDRIVE');
      expect(auditCall.outcome).toBe('REJECTED');
      expect(auditCall.reason).toContain('DEPTH_EXCEEDED');
      expect(auditCall.resourceId).toBe('dlq-depth-test');
    });

    it('should emit audit event on POISON_ENTRY rejection', async () => {
      const entry = makeDlqEntry({ isPoison: true, poisonReason: 'DEPTH_EXCEEDED' });
      mocks.dlqRepo.getById.mockResolvedValue(entry);

      const req = makeMockReq();

      try {
        await mocks.controller.redriveDlqEntry('dlq-depth-test', req);
      } catch {
        // expected
      }

      expect(mocks.auditService.append).toHaveBeenCalledTimes(1);
      const auditCall = mocks.auditService.append.mock.calls[0][0];
      expect(auditCall.outcome).toBe('REJECTED');
      expect(auditCall.reason).toContain('POISON_ENTRY');
    });
  });

  // --------------------------------------------------------------------------
  // 8.5d: currentDepth in success response
  // --------------------------------------------------------------------------
  describe('currentDepth in success response', () => {
    it('should include currentDepth when redrive succeeds (depth < 3)', async () => {
      // depth=1 chain
      const entry = makeDlqEntry({
        carrierJson: JSON.stringify({
          version: 2,
          requestId: 'req-original',
          actionId: 'action-1',
          actionType: 'DLQ_REDRIVE',
          resourceType: 'DLQ_ENTRY',
          resourceId: null,
          takeover: false,
          previousActorId: null,
          attemptNumber: 0,
          parentCorrelationId: 'node-0',
        }),
      });

      mocks.dlqRepo.getById.mockResolvedValue(entry);

      // depth=1: node-0 is root (no parent)
      mocks.dlqRepo.findByCorrelationId.mockImplementation(async (cid: string) => {
        if (cid === 'node-0') {
          return makeDlqEntry({
            carrierJson: JSON.stringify({
              version: 2, requestId: 'node-0',
              actionId: 'a', actionType: 'DLQ_REDRIVE', resourceType: 'DLQ_ENTRY',
              resourceId: null, takeover: false, previousActorId: null, attemptNumber: 0,
            }),
          });
        }
        return null;
      });

      mocks.dlqRepo.atomicRedrive.mockResolvedValue({
        dlqEntry: { ...entry, status: 'DLQ_REDROVE' as DlqStatus },
        newJobId: 'job-new',
      });

      const req = makeMockReq();
      const response = await mocks.controller.redriveDlqEntry('dlq-depth-test', req);

      expect(response.redriven).toBe(true);
      expect(response.currentDepth).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // 8.5e: Fail-closed — DB error during depth check
  // --------------------------------------------------------------------------
  describe('Fail-closed — depth check DB error', () => {
    it('should return 500 DEPTH_CHECK_FAILED when calculator throws', async () => {
      const entry = makeDlqEntry({
        carrierJson: JSON.stringify({
          version: 2,
          requestId: 'req-original',
          actionId: 'action-1',
          actionType: 'DLQ_REDRIVE',
          resourceType: 'DLQ_ENTRY',
          resourceId: null,
          takeover: false,
          previousActorId: null,
          attemptNumber: 0,
          parentCorrelationId: 'node-0',
        }),
      });

      mocks.dlqRepo.getById.mockResolvedValue(entry);
      mocks.dlqRepo.findByCorrelationId.mockRejectedValue(new Error('DB_CONNECTION_LOST'));

      const req = makeMockReq();

      try {
        await mocks.controller.redriveDlqEntry('dlq-depth-test', req);
        fail('Expected InternalServerErrorException');
      } catch (error: any) {
        expect(error).toBeInstanceOf(InternalServerErrorException);
        const response = error.getResponse();
        expect(response.code).toBe('DEPTH_CHECK_FAILED');
      }

      expect(redriveRejectedMetric.getCount({ reason: 'DEPTH_CHECK_FAILED' })).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // 8.5f: Metrics
  // --------------------------------------------------------------------------
  describe('Metrics on depth rejection', () => {
    it('should increment DEPTH_EXCEEDED metric', async () => {
      const entry = makeDlqEntry({
        carrierJson: JSON.stringify({
          version: 2,
          requestId: 'req-original',
          actionId: 'action-1',
          actionType: 'DLQ_REDRIVE',
          resourceType: 'DLQ_ENTRY',
          resourceId: null,
          takeover: false,
          previousActorId: null,
          attemptNumber: 0,
          parentCorrelationId: 'node-0',
        }),
      });

      mocks.dlqRepo.getById.mockResolvedValue(entry);

      // depth=3 chain
      mocks.dlqRepo.findByCorrelationId.mockImplementation(async (cid: string) => {
        const chain: Record<string, DlqEntry> = {
          'node-0': makeDlqEntry({ carrierJson: JSON.stringify({ version: 2, requestId: 'node-0', parentCorrelationId: 'node-1', actionId: 'a', actionType: 'DLQ_REDRIVE', resourceType: 'DLQ_ENTRY', resourceId: null, takeover: false, previousActorId: null, attemptNumber: 0 }) }),
          'node-1': makeDlqEntry({ carrierJson: JSON.stringify({ version: 2, requestId: 'node-1', parentCorrelationId: 'node-2', actionId: 'a', actionType: 'DLQ_REDRIVE', resourceType: 'DLQ_ENTRY', resourceId: null, takeover: false, previousActorId: null, attemptNumber: 0 }) }),
          'node-2': makeDlqEntry({ carrierJson: JSON.stringify({ version: 2, requestId: 'node-2', actionId: 'a', actionType: 'DLQ_REDRIVE', resourceType: 'DLQ_ENTRY', resourceId: null, takeover: false, previousActorId: null, attemptNumber: 0 }) }),
        };
        return chain[cid] ?? null;
      });

      const req = makeMockReq();

      try {
        await mocks.controller.redriveDlqEntry('dlq-depth-test', req);
      } catch {
        // expected
      }

      expect(redriveRejectedMetric.getCount({ reason: 'DEPTH_EXCEEDED' })).toBe(1);
    });

    it('should increment POISON_ENTRY metric', async () => {
      const entry = makeDlqEntry({ isPoison: true, poisonReason: 'DEPTH_EXCEEDED' });
      mocks.dlqRepo.getById.mockResolvedValue(entry);

      const req = makeMockReq();

      try {
        await mocks.controller.redriveDlqEntry('dlq-depth-test', req);
      } catch {
        // expected
      }

      expect(redriveRejectedMetric.getCount({ reason: 'POISON_ENTRY' })).toBe(1);
    });
  });
});
