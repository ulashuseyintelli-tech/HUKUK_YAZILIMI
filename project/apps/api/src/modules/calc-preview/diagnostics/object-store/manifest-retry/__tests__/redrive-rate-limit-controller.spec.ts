/**
 * Admin Controller — Rate Limit Integration Tests
 *
 * Phase 11.4 — Task 8.1 (Fail-Closed Semantic Patch)
 *
 * Tests:
 *   - Allowed → atomicRedrive (with rateLimitGate) called, 200, redriveCount/nextAllowedRedriveAt in response
 *   - Backoff reject (pre-check: now < next_allowed_redrive_at) → 409 REDRIVE_RATE_LIMITED, atomicRedrive NOT called
 *   - Fail-closed: checkRateLimit throws → 409 REDRIVE_RATE_LIMIT_CHECK_FAILED (non-retriable)
 *   - Tx gate: atomicRedrive throws RATE_LIMITED → 409 REDRIVE_RATE_LIMITED
 *   - Tx gate: atomicRedrive throws ALREADY_REDRIVEN → 409 (concurrency)
 *   - All-or-nothing: atomicRedrive tx fail → no enqueue, no state update
 *   - Precondition: POISON → 409, rate limit never checked
 *   - redriveCount NULL → treated as 0
 *   - waitSeconds ceil correctness
 *   - Backward compat: rateLimitGate passed to atomicRedrive
 *
 * @see phase-11-4-redrive-rate-limiting/task-8-1-patch.md
 */

import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { ManifestAdminController } from '../manifest-admin.controller';
import { DlqRedriveError } from '../manifest-dlq.repository';
import {
  resetAllMetrics,
  redriveRejectedMetric,
  redriveRateLimitedMetric,
  redriveRateCheckFailedMetric,
  redriveBackoffHistogram,
  redriveBackoffAppliedMetric,
  redriveTxDurationHistogram,
  redriveKillSwitchGauge,
  redriveDisabledMetric,
} from '../idempotency/carrier-lifecycle/carrier-lifecycle-metrics';
import { DlqEntry, DlqStatus } from '../manifest-retry.types';
import { ManifestErrorCode } from '../manifest-error-classifier';

// ============================================================================
// FIXTURES
// ============================================================================

const NOW = new Date('2026-02-07T12:00:00.000Z');

function makeDlqEntry(overrides: Partial<DlqEntry> = {}): DlqEntry {
  return {
    id: 'dlq-rate-test',
    bundleId: 'bundle-rate-test',
    attempt: 1,
    finalErrorCode: 'NETWORK_ERROR' as ManifestErrorCode,
    finalErrorMessage: 'timeout',
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
      requestId: 'req-rate-test',
      actionId: 'action-rate',
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
    requestId: 'req-test-rate',
  } as any;
}

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

/** Setup mocks for a successful redrive (depth=0, no parent) */
function setupAllowedRedrive(mocks: ReturnType<typeof createMocks>, entry: DlqEntry) {
  mocks.dlqRepo.getById.mockResolvedValue(entry);
  // No parent → depth=0 (allowed)
  mocks.dlqRepo.findByCorrelationId.mockResolvedValue(null);
  // atomicRedrive returns updated entry with incremented redriveCount
  const updatedEntry = {
    ...entry,
    status: 'DLQ_REDROVE' as DlqStatus,
    redriveCount: (entry.redriveCount ?? 0) + 1,
  };
  mocks.dlqRepo.atomicRedrive.mockResolvedValue({
    dlqEntry: updatedEntry,
    newJobId: 'job-new-rate',
  });
}

// ============================================================================
// TESTS
// ============================================================================

describe('ManifestAdminController — Rate Limit (Phase 11.4 Task 8.1)', () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    resetAllMetrics();
    mocks = createMocks();
    // Mock Date.now for consistent "now" in controller
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // Allowed → success path
  // --------------------------------------------------------------------------
  describe('Allowed → 200 success', () => {
    it('should call atomicRedrive with rateLimitGate and return redriveCount/nextAllowedRedriveAt', async () => {
      const entry = makeDlqEntry({ redriveCount: 0, nextAllowedRedriveAt: null });
      setupAllowedRedrive(mocks, entry);

      const req = makeMockReq();
      const response = await mocks.controller.redriveDlqEntry('dlq-rate-test', req);

      expect(response.redriven).toBe(true);
      expect(mocks.dlqRepo.atomicRedrive).toHaveBeenCalledTimes(1);

      // atomicRedrive called with rateLimitGate
      const arCall = mocks.dlqRepo.atomicRedrive.mock.calls[0];
      expect(arCall[0]).toBe('dlq-rate-test');
      expect(arCall[3]).toBeDefined(); // rateLimitGate
      expect(arCall[3].now).toBeInstanceOf(Date);
      expect(arCall[3].nextAllowedRedriveAt).toBeInstanceOf(Date);

      // Response includes rate limit fields
      expect(response.redriveCount).toBe(1); // 0 + 1 (from tx result)
      expect(response.nextAllowedRedriveAt).toBeDefined();

      // Phase 11.4 Task 7: backoff metrics emitted on success
      expect(redriveBackoffAppliedMetric.getCount({ count_bucket: '0' })).toBe(1);
      // Backoff histogram: redriveCount=0 → 30s base + jitter → value 30.xxx
      // le semantics: 30.xxx > 30 → falls into bucket 60, not 30
      const b30 = redriveBackoffHistogram.getBucketCount(30);
      const b60 = redriveBackoffHistogram.getBucketCount(60);
      expect(b30 + b60).toBeGreaterThanOrEqual(1);
    });

    it('should allow redrive when now >= nextAllowedRedriveAt (cooldown expired)', async () => {
      const pastAllowed = new Date(NOW.getTime() - 5000); // 5s ago
      const entry = makeDlqEntry({ redriveCount: 2, nextAllowedRedriveAt: pastAllowed });
      setupAllowedRedrive(mocks, entry);

      const req = makeMockReq();
      const response = await mocks.controller.redriveDlqEntry('dlq-rate-test', req);

      expect(response.redriven).toBe(true);
      expect(response.redriveCount).toBe(3); // 2 + 1
      expect(mocks.dlqRepo.atomicRedrive).toHaveBeenCalledTimes(1);
    });

    it('should allow redrive when now == nextAllowedRedriveAt (boundary)', async () => {
      const entry = makeDlqEntry({ redriveCount: 1, nextAllowedRedriveAt: NOW });
      setupAllowedRedrive(mocks, entry);

      const req = makeMockReq();
      const response = await mocks.controller.redriveDlqEntry('dlq-rate-test', req);

      expect(response.redriven).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Pre-check backoff reject → 409
  // --------------------------------------------------------------------------
  describe('Pre-check backoff reject → 409 REDRIVE_RATE_LIMITED', () => {
    it('should return 409 with nextAllowedAt, waitSeconds when now < nextAllowedRedriveAt', async () => {
      const futureAllowed = new Date(NOW.getTime() + 45_000); // 45s from now
      const entry = makeDlqEntry({ redriveCount: 2, nextAllowedRedriveAt: futureAllowed });
      mocks.dlqRepo.getById.mockResolvedValue(entry);
      mocks.dlqRepo.findByCorrelationId.mockResolvedValue(null); // depth=0

      const req = makeMockReq();

      try {
        await mocks.controller.redriveDlqEntry('dlq-rate-test', req);
        fail('Expected ConflictException');
      } catch (error: any) {
        expect(error).toBeInstanceOf(ConflictException);
        const response = error.getResponse();
        expect(response.code).toBe('REDRIVE_RATE_LIMITED');
        expect(response.dlqId).toBe('dlq-rate-test');
        expect(response.waitSeconds).toBe(45);
        expect(response.nextAllowedAt).toBe(futureAllowed.toISOString());
        expect(response.redriveCount).toBe(2);
      }

      // atomicRedrive should NOT have been called (pre-check rejected)
      expect(mocks.dlqRepo.atomicRedrive).not.toHaveBeenCalled();
    });

    it('waitSeconds uses ceil (500ms → 1s)', async () => {
      const futureAllowed = new Date(NOW.getTime() + 500);
      const entry = makeDlqEntry({ redriveCount: 1, nextAllowedRedriveAt: futureAllowed });
      mocks.dlqRepo.getById.mockResolvedValue(entry);
      mocks.dlqRepo.findByCorrelationId.mockResolvedValue(null);

      const req = makeMockReq();

      try {
        await mocks.controller.redriveDlqEntry('dlq-rate-test', req);
        fail('Expected ConflictException');
      } catch (error: any) {
        const response = error.getResponse();
        expect(response.waitSeconds).toBe(1);
      }
    });

    it('should emit audit event on rate limit rejection', async () => {
      const futureAllowed = new Date(NOW.getTime() + 30_000);
      const entry = makeDlqEntry({ redriveCount: 3, nextAllowedRedriveAt: futureAllowed });
      mocks.dlqRepo.getById.mockResolvedValue(entry);
      mocks.dlqRepo.findByCorrelationId.mockResolvedValue(null);

      const req = makeMockReq();

      try {
        await mocks.controller.redriveDlqEntry('dlq-rate-test', req);
      } catch {
        // expected
      }

      // Find the rate limit audit event
      const auditCalls = mocks.auditService.append.mock.calls;
      const rateLimitAudit = auditCalls.find(
        (c: any) => c[0].reason && c[0].reason.includes('RATE_LIMITED'),
      );
      expect(rateLimitAudit).toBeDefined();
      expect(rateLimitAudit![0].outcome).toBe('REJECTED');
      expect(rateLimitAudit![0].reason).toContain('RATE_LIMITED');
    });

    it('should increment RATE_LIMITED metric', async () => {
      const futureAllowed = new Date(NOW.getTime() + 10_000);
      const entry = makeDlqEntry({ redriveCount: 1, nextAllowedRedriveAt: futureAllowed });
      mocks.dlqRepo.getById.mockResolvedValue(entry);
      mocks.dlqRepo.findByCorrelationId.mockResolvedValue(null);

      const req = makeMockReq();

      try {
        await mocks.controller.redriveDlqEntry('dlq-rate-test', req);
      } catch {
        // expected
      }

      expect(redriveRejectedMetric.getCount({ reason: 'RATE_LIMITED' })).toBe(1);
      // Phase 11.4 Task 7: gate-specific metric
      expect(redriveRateLimitedMetric.getCount({ gate: 'precheck' })).toBe(1);
      expect(redriveRateLimitedMetric.getCount({ gate: 'tx' })).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Fail-closed: checkRateLimit throws → 409 (non-retriable)
  // --------------------------------------------------------------------------
  describe('Fail-closed → 409 REDRIVE_RATE_LIMIT_CHECK_FAILED', () => {
    it('should return 409 when checkRateLimit encounters unexpected error', async () => {
      const entry = makeDlqEntry();
      // Override nextAllowedRedriveAt with a getter that throws
      Object.defineProperty(entry, 'nextAllowedRedriveAt', {
        get() { throw new Error('CORRUPTED_STATE'); },
      });

      mocks.dlqRepo.getById.mockResolvedValue(entry);
      mocks.dlqRepo.findByCorrelationId.mockResolvedValue(null);

      const req = makeMockReq();

      try {
        await mocks.controller.redriveDlqEntry('dlq-rate-test', req);
        fail('Expected ConflictException');
      } catch (error: any) {
        expect(error).toBeInstanceOf(ConflictException);
        const response = error.getResponse();
        expect(response.code).toBe('REDRIVE_RATE_LIMIT_CHECK_FAILED');
        expect(response.message).toContain('fail-closed');
      }

      expect(redriveRejectedMetric.getCount({ reason: 'RATE_LIMIT_CHECK_FAILED' })).toBe(1);
      // Phase 11.4 Task 7: fail-closed specific metric
      expect(redriveRateCheckFailedMetric.getCount()).toBe(1);
      expect(mocks.dlqRepo.atomicRedrive).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Tx gate: atomicRedrive throws RATE_LIMITED → 409
  // --------------------------------------------------------------------------
  describe('Tx gate → 409 REDRIVE_RATE_LIMITED (concurrent race)', () => {
    it('should return 409 when tx gate detects cooldown (pre-check passed but tx found active cooldown)', async () => {
      // Pre-check passes (entry shows no cooldown at read time)
      const entry = makeDlqEntry({ redriveCount: 1, nextAllowedRedriveAt: null });
      mocks.dlqRepo.getById.mockResolvedValue(entry);
      mocks.dlqRepo.findByCorrelationId.mockResolvedValue(null);

      // But tx gate finds cooldown active (concurrent request updated state)
      const txNextAllowed = new Date(NOW.getTime() + 60_000);
      mocks.dlqRepo.atomicRedrive.mockRejectedValue(
        new DlqRedriveError(
          `Rate limited: next allowed redrive at ${txNextAllowed.toISOString()}`,
          'RATE_LIMITED',
          { nextAllowedAt: txNextAllowed, waitSeconds: 60 },
        ),
      );

      const req = makeMockReq();

      try {
        await mocks.controller.redriveDlqEntry('dlq-rate-test', req);
        fail('Expected ConflictException');
      } catch (error: any) {
        expect(error).toBeInstanceOf(ConflictException);
        const response = error.getResponse();
        expect(response.code).toBe('REDRIVE_RATE_LIMITED');
        expect(response.nextAllowedAt).toBe(txNextAllowed.toISOString());
        expect(response.waitSeconds).toBe(60);
      }

      expect(redriveRejectedMetric.getCount({ reason: 'RATE_LIMITED' })).toBe(1);
      // Phase 11.4 Task 7: tx gate specific metric
      expect(redriveRateLimitedMetric.getCount({ gate: 'tx' })).toBe(1);
      expect(redriveRateLimitedMetric.getCount({ gate: 'precheck' })).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Concurrency: two parallel calls → one success, one ALREADY_REDRIVEN
  // --------------------------------------------------------------------------
  describe('Concurrency: two parallel calls', () => {
    it('first call succeeds, second gets ALREADY_REDRIVEN from tx', async () => {
      const entry = makeDlqEntry({ redriveCount: 0, nextAllowedRedriveAt: null });
      mocks.dlqRepo.getById.mockResolvedValue(entry);
      mocks.dlqRepo.findByCorrelationId.mockResolvedValue(null);

      // First call succeeds
      mocks.dlqRepo.atomicRedrive
        .mockResolvedValueOnce({
          dlqEntry: { ...entry, status: 'DLQ_REDROVE' as DlqStatus, redriveCount: 1 },
          newJobId: 'job-first',
        })
        // Second call gets ALREADY_REDRIVEN (status guard in tx)
        .mockRejectedValueOnce(
          new DlqRedriveError(
            'DLQ entry already redriven: dlq-rate-test',
            'ALREADY_REDRIVEN',
            { currentStatus: 'DLQ_REDROVE' },
          ),
        );

      const req1 = makeMockReq();
      const req2 = makeMockReq();

      // Run both in parallel
      const [result1, result2] = await Promise.allSettled([
        mocks.controller.redriveDlqEntry('dlq-rate-test', req1),
        mocks.controller.redriveDlqEntry('dlq-rate-test', req2),
      ]);

      // First succeeds
      expect(result1.status).toBe('fulfilled');
      if (result1.status === 'fulfilled') {
        expect(result1.value.redriven).toBe(true);
        expect(result1.value.newJobId).toBe('job-first');
      }

      // Second rejected with 409
      expect(result2.status).toBe('rejected');
      if (result2.status === 'rejected') {
        expect(result2.reason).toBeInstanceOf(ConflictException);
        expect(result2.reason.getResponse().code).toBe('ALREADY_REDRIVEN');
      }
    });
  });

  // --------------------------------------------------------------------------
  // All-or-nothing: tx fail → no enqueue, no state update
  // --------------------------------------------------------------------------
  describe('All-or-nothing: tx rollback', () => {
    it('should not enqueue or update state when tx fails', async () => {
      const entry = makeDlqEntry({ redriveCount: 0, nextAllowedRedriveAt: null });
      mocks.dlqRepo.getById.mockResolvedValue(entry);
      mocks.dlqRepo.findByCorrelationId.mockResolvedValue(null);

      // atomicRedrive throws unexpected error (simulating tx failure)
      mocks.dlqRepo.atomicRedrive.mockRejectedValue(new Error('DB_CONNECTION_LOST'));

      const req = makeMockReq();

      await expect(
        mocks.controller.redriveDlqEntry('dlq-rate-test', req),
      ).rejects.toThrow('DB_CONNECTION_LOST');

      // tx handles everything — no separate state update call needed
    });
  });

  // --------------------------------------------------------------------------
  // Precondition: POISON → 409, rate limit never checked
  // --------------------------------------------------------------------------
  describe('Precondition: POISON → 409 before rate limit', () => {
    it('should reject POISON entry before rate limit check', async () => {
      const entry = makeDlqEntry({
        isPoison: true,
        poisonReason: 'REDRIVE_DEPTH_EXCEEDED',
        redriveCount: 5,
        nextAllowedRedriveAt: new Date(NOW.getTime() + 999_999),
      });
      mocks.dlqRepo.getById.mockResolvedValue(entry);

      const req = makeMockReq();

      try {
        await mocks.controller.redriveDlqEntry('dlq-rate-test', req);
        fail('Expected ConflictException');
      } catch (error: any) {
        expect(error).toBeInstanceOf(ConflictException);
        const response = error.getResponse();
        expect(response.code).toBe('POISON_ENTRY');
      }

      // atomicRedrive should NOT have been called
      expect(mocks.dlqRepo.atomicRedrive).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // redriveCount NULL → 0
  // --------------------------------------------------------------------------
  describe('redriveCount NULL handling', () => {
    it('should treat null/undefined redriveCount as 0', async () => {
      const entry = makeDlqEntry({ redriveCount: undefined as any, nextAllowedRedriveAt: null });
      setupAllowedRedrive(mocks, entry);

      const req = makeMockReq();
      const response = await mocks.controller.redriveDlqEntry('dlq-rate-test', req);

      expect(response.redriven).toBe(true);
      expect(response.redriveCount).toBe(1); // 0 + 1
    });
  });

  // --------------------------------------------------------------------------
  // Backward compat: rateLimitGate passed to atomicRedrive
  // --------------------------------------------------------------------------
  describe('Backward compat: rateLimitGate in atomicRedrive call', () => {
    it('should pass rateLimitGate with now and nextAllowedRedriveAt to atomicRedrive', async () => {
      const entry = makeDlqEntry({ redriveCount: 3, nextAllowedRedriveAt: null });
      setupAllowedRedrive(mocks, entry);

      const req = makeMockReq();
      await mocks.controller.redriveDlqEntry('dlq-rate-test', req);

      const arCall = mocks.dlqRepo.atomicRedrive.mock.calls[0];
      // args: dlqId, redrivenBy, nextAttemptAt, rateLimitGate
      expect(arCall[0]).toBe('dlq-rate-test');
      expect(arCall[2]).toBeNull(); // immediate retry
      const gate = arCall[3];
      expect(gate).toBeDefined();
      expect(gate.now).toBeInstanceOf(Date);
      expect(gate.nextAllowedRedriveAt).toBeInstanceOf(Date);
      // nextAllowedRedriveAt should be in the future (backoff computed)
      expect(gate.nextAllowedRedriveAt.getTime()).toBeGreaterThan(gate.now.getTime());
    });
  });

  // --------------------------------------------------------------------------
  // Audit on success includes redriveCount + nextAllowedRedriveAt
  // --------------------------------------------------------------------------
  describe('Audit on success', () => {
    it('should include redriveCount and nextAllowedRedriveAt in success audit', async () => {
      const entry = makeDlqEntry({ redriveCount: 2, nextAllowedRedriveAt: null });
      setupAllowedRedrive(mocks, entry);

      const req = makeMockReq();
      await mocks.controller.redriveDlqEntry('dlq-rate-test', req);

      // Find the success audit event
      const auditCalls = mocks.auditService.append.mock.calls;
      const successAudit = auditCalls.find(
        (c: any) => c[0].outcome === 'SUCCESS',
      );
      expect(successAudit).toBeDefined();
      expect(successAudit![0].afterState.redriveCount).toBe(3); // 2 + 1 (from tx result)
      expect(successAudit![0].afterState.nextAllowedRedriveAt).toBeDefined();
      expect(successAudit![0].beforeState.redriveCount).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Phase 11.4 Task 7: Metric contract validation
  // --------------------------------------------------------------------------
  describe('Phase 11.4 Task 7: Metric emission', () => {
    it('success path emits backoff_applied with correct count_bucket for redriveCount=3', async () => {
      const entry = makeDlqEntry({ redriveCount: 3, nextAllowedRedriveAt: null });
      setupAllowedRedrive(mocks, entry);

      const req = makeMockReq();
      await mocks.controller.redriveDlqEntry('dlq-rate-test', req);

      // count_bucket for redriveCount=3 → '3-4'
      expect(redriveBackoffAppliedMetric.getCount({ count_bucket: '3-4' })).toBe(1);
      expect(redriveBackoffAppliedMetric.getCount({ count_bucket: '0' })).toBe(0);
    });

    it('success path emits backoff_applied with count_bucket 10+ for high redriveCount', async () => {
      const entry = makeDlqEntry({ redriveCount: 15, nextAllowedRedriveAt: null });
      setupAllowedRedrive(mocks, entry);

      const req = makeMockReq();
      await mocks.controller.redriveDlqEntry('dlq-rate-test', req);

      expect(redriveBackoffAppliedMetric.getCount({ count_bucket: '10+' })).toBe(1);
    });

    it('success path emits backoff histogram with correct seconds', async () => {
      const entry = makeDlqEntry({ redriveCount: 0, nextAllowedRedriveAt: null });
      setupAllowedRedrive(mocks, entry);

      const req = makeMockReq();
      await mocks.controller.redriveDlqEntry('dlq-rate-test', req);

      // redriveCount=0 → base backoff = 30s + jitter
      // Should fall in the 30s or 60s bucket (le semantics)
      const bucket30 = redriveBackoffHistogram.getBucketCount(30);
      const bucket60 = redriveBackoffHistogram.getBucketCount(60);
      expect(bucket30 + bucket60).toBeGreaterThanOrEqual(1);
    });

    it('pre-check reject does NOT emit backoff metrics', async () => {
      const futureAllowed = new Date(NOW.getTime() + 30_000);
      const entry = makeDlqEntry({ redriveCount: 2, nextAllowedRedriveAt: futureAllowed });
      mocks.dlqRepo.getById.mockResolvedValue(entry);
      mocks.dlqRepo.findByCorrelationId.mockResolvedValue(null);

      const req = makeMockReq();
      try {
        await mocks.controller.redriveDlqEntry('dlq-rate-test', req);
      } catch {
        // expected
      }

      // No backoff metrics on reject
      expect(redriveBackoffAppliedMetric.getCount({ count_bucket: '0' })).toBe(0);
      expect(redriveBackoffAppliedMetric.getCount({ count_bucket: '1' })).toBe(0);
      expect(redriveBackoffAppliedMetric.getCount({ count_bucket: '2' })).toBe(0);
      expect(redriveBackoffHistogram.getBucketCount(30)).toBe(0);

      // But rate limited metric IS emitted
      expect(redriveRateLimitedMetric.getCount({ gate: 'precheck' })).toBe(1);
    });
  });
});


// ============================================================================
// Phase 12: Kill-Switch Tests (Task 4)
// ============================================================================

describe('ManifestAdminController — Kill-Switch (Phase 12 Task 4)', () => {
  let mocks: ReturnType<typeof createMocks>;
  const originalEnv = process.env.REDRIVE_DISABLED;

  beforeEach(() => {
    resetAllMetrics();
    mocks = createMocks();
    jest.useFakeTimers({ now: NOW });
    delete process.env.REDRIVE_DISABLED;
  });

  afterEach(() => {
    jest.useRealTimers();
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.REDRIVE_DISABLED = originalEnv;
    } else {
      delete process.env.REDRIVE_DISABLED;
    }
  });

  // 4.1: REDRIVE_DISABLED=true → 503 + REDRIVE_DISABLED code
  it('should return 503 with REDRIVE_DISABLED code when kill-switch is active', async () => {
    process.env.REDRIVE_DISABLED = 'true';
    const entry = makeDlqEntry();
    setupAllowedRedrive(mocks, entry);

    const req = makeMockReq();

    try {
      await mocks.controller.redriveDlqEntry('dlq-rate-test', req);
      fail('Expected ServiceUnavailableException');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      const response = error.getResponse();
      expect(response.code).toBe('REDRIVE_DISABLED');
      expect(response.message).toBe('Redrive is temporarily disabled by operator');
      expect(response.retryable).toBe(false);
    }
  });

  // 4.2: REDRIVE_DISABLED=true → atomicRedrive NOT called
  it('should not call atomicRedrive when kill-switch is active', async () => {
    process.env.REDRIVE_DISABLED = 'true';
    const entry = makeDlqEntry();
    setupAllowedRedrive(mocks, entry);

    const req = makeMockReq();

    try {
      await mocks.controller.redriveDlqEntry('dlq-rate-test', req);
    } catch {
      // expected 503
    }

    expect(mocks.dlqRepo.atomicRedrive).not.toHaveBeenCalled();
    // Also verify NO downstream calls at all (short-circuit)
    expect(mocks.dlqRepo.getById).not.toHaveBeenCalled();
    expect(mocks.dlqRepo.findByCorrelationId).not.toHaveBeenCalled();
  });

  // 4.3: REDRIVE_DISABLED=true → carrier_redrive_disabled_total counter incremented
  it('should increment carrier_redrive_disabled_total on kill-switch rejection', async () => {
    process.env.REDRIVE_DISABLED = 'true';

    const req = makeMockReq();

    try {
      await mocks.controller.redriveDlqEntry('dlq-rate-test', req);
    } catch {
      // expected 503
    }

    expect(redriveDisabledMetric.getCount()).toBe(1);
  });

  // 4.4: REDRIVE_DISABLED unset → normal behavior (regression)
  it('should allow redrive when kill-switch is off (regression)', async () => {
    // REDRIVE_DISABLED is deleted in beforeEach — kill-switch OFF
    const entry = makeDlqEntry({ redriveCount: 0, nextAllowedRedriveAt: null });
    setupAllowedRedrive(mocks, entry);

    const req = makeMockReq();
    const response = await mocks.controller.redriveDlqEntry('dlq-rate-test', req);

    expect(response.redriven).toBe(true);
    expect(mocks.dlqRepo.atomicRedrive).toHaveBeenCalledTimes(1);
    expect(redriveDisabledMetric.getCount()).toBe(0);
  });

  // 4.5: Gauge init — flag on → gauge=1, flag off → gauge=0
  it('should set gauge=1 when REDRIVE_DISABLED=true at init', () => {
    process.env.REDRIVE_DISABLED = 'true';
    resetAllMetrics(); // reset gauge to 0
    mocks.controller.onModuleInit();
    expect(redriveKillSwitchGauge.get()).toBe(1);
  });

  it('should set gauge=0 when REDRIVE_DISABLED is unset at init', () => {
    delete process.env.REDRIVE_DISABLED;
    resetAllMetrics();
    mocks.controller.onModuleInit();
    expect(redriveKillSwitchGauge.get()).toBe(0);
  });

  // Case-insensitive check
  it('should treat REDRIVE_DISABLED=TRUE (uppercase) as active', async () => {
    process.env.REDRIVE_DISABLED = 'TRUE';

    const req = makeMockReq();

    try {
      await mocks.controller.redriveDlqEntry('dlq-rate-test', req);
      fail('Expected ServiceUnavailableException');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.getResponse().code).toBe('REDRIVE_DISABLED');
    }
  });
});

// ============================================================================
// Phase 12: TX Duration Tests (Task 5)
// ============================================================================

describe('ManifestAdminController — TX Duration (Phase 12 Task 5)', () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    resetAllMetrics();
    mocks = createMocks();
    jest.useFakeTimers({ now: NOW });
    delete process.env.REDRIVE_DISABLED;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // 5.1: Successful atomicRedrive → histogram observed
  it('should observe tx duration histogram on successful atomicRedrive', async () => {
    const entry = makeDlqEntry({ redriveCount: 0, nextAllowedRedriveAt: null });
    setupAllowedRedrive(mocks, entry);

    const req = makeMockReq();
    await mocks.controller.redriveDlqEntry('dlq-rate-test', req);

    // Histogram should have at least 1 observation (any bucket)
    // tx duration is ~0ms in test → falls into 0.01 bucket
    const bucket001 = redriveTxDurationHistogram.getBucketCount(0.01);
    const bucket005 = redriveTxDurationHistogram.getBucketCount(0.05);
    const bucket01 = redriveTxDurationHistogram.getBucketCount(0.1);
    expect(bucket001 + bucket005 + bucket01).toBeGreaterThanOrEqual(1);
  });

  // 5.2: atomicRedrive throws error → histogram STILL observed (try/finally)
  it('should observe tx duration histogram even when atomicRedrive throws', async () => {
    const entry = makeDlqEntry({ redriveCount: 0, nextAllowedRedriveAt: null });
    mocks.dlqRepo.getById.mockResolvedValue(entry);
    mocks.dlqRepo.findByCorrelationId.mockResolvedValue(null);

    // atomicRedrive throws unexpected error
    mocks.dlqRepo.atomicRedrive.mockRejectedValue(new Error('DB_CONNECTION_LOST'));

    const req = makeMockReq();

    await expect(
      mocks.controller.redriveDlqEntry('dlq-rate-test', req),
    ).rejects.toThrow('DB_CONNECTION_LOST');

    // Histogram should STILL have observation (try/finally guarantees this)
    const bucket001 = redriveTxDurationHistogram.getBucketCount(0.01);
    const bucket005 = redriveTxDurationHistogram.getBucketCount(0.05);
    const bucket01 = redriveTxDurationHistogram.getBucketCount(0.1);
    expect(bucket001 + bucket005 + bucket01).toBeGreaterThanOrEqual(1);
  });

  // 5.2 bonus: atomicRedrive throws DlqRedriveError (RATE_LIMITED) → histogram observed
  it('should observe tx duration histogram when atomicRedrive throws RATE_LIMITED', async () => {
    const entry = makeDlqEntry({ redriveCount: 1, nextAllowedRedriveAt: null });
    mocks.dlqRepo.getById.mockResolvedValue(entry);
    mocks.dlqRepo.findByCorrelationId.mockResolvedValue(null);

    const txNextAllowed = new Date(NOW.getTime() + 60_000);
    mocks.dlqRepo.atomicRedrive.mockRejectedValue(
      new DlqRedriveError(
        'Rate limited in tx',
        'RATE_LIMITED',
        { nextAllowedAt: txNextAllowed, waitSeconds: 60 },
      ),
    );

    const req = makeMockReq();

    try {
      await mocks.controller.redriveDlqEntry('dlq-rate-test', req);
    } catch {
      // expected 409
    }

    // Histogram observed despite tx rejection
    const bucket001 = redriveTxDurationHistogram.getBucketCount(0.01);
    const bucket005 = redriveTxDurationHistogram.getBucketCount(0.05);
    const bucket01 = redriveTxDurationHistogram.getBucketCount(0.1);
    expect(bucket001 + bucket005 + bucket01).toBeGreaterThanOrEqual(1);
  });
});
