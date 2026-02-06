/**
 * Enqueue With Context Tests
 * 
 * Phase 10.4 - PR-10.4.2 (P1)
 * 
 * Tests enqueueWithContext() producer helper.
 */

import {
  captureCurrentCarrier,
  enrichPayloadWithCarrier,
  enqueueWithContext,
  QueueLike,
  PayloadWithCarrier,
} from '../enqueue-with-context';
import { IdempotencyALS, IdempotencyContext } from '../idempotency-context';
import { CARRIER_FIELD_NAME, CARRIER_VERSION } from '../idempotency-carrier.types';

describe('captureCurrentCarrier', () => {
  it('should return null when no ALS context', () => {
    const carrier = captureCurrentCarrier();
    expect(carrier).toBeNull();
  });

  it('should return carrier when ALS context is active', () => {
    const ctx: IdempotencyContext = {
      requestId: 'req-capture',
      actionId: 'act-capture',
      actionType: 'TEST',
      resourceType: 'TEST',
      resourceId: 'res-1',
      takeover: true,
      previousActorId: 'prev-actor',
    };

    let carrier: ReturnType<typeof captureCurrentCarrier> = null;

    IdempotencyALS.run(ctx, () => {
      carrier = captureCurrentCarrier();
    });

    expect(carrier).not.toBeNull();
    expect(carrier!.version).toBe(CARRIER_VERSION);
    expect(carrier!.requestId).toBe('req-capture');
    expect(carrier!.actionId).toBe('act-capture');
    expect(carrier!.actionType).toBe('TEST');
    expect(carrier!.resourceType).toBe('TEST');
    expect(carrier!.resourceId).toBe('res-1');
    expect(carrier!.takeover).toBe(true);
    expect(carrier!.previousActorId).toBe('prev-actor');
  });
});

describe('enrichPayloadWithCarrier', () => {
  it('should add null carrier when no ALS context', () => {
    const payload = { bundleId: 'bundle-123', attempt: 1 };
    const enriched = enrichPayloadWithCarrier(payload);

    expect(enriched.bundleId).toBe('bundle-123');
    expect(enriched.attempt).toBe(1);
    expect(enriched[CARRIER_FIELD_NAME]).toBeNull();
  });

  it('should add carrier when ALS context is active', () => {
    const ctx: IdempotencyContext = {
      requestId: 'req-enrich',
      actionId: 'act-enrich',
      actionType: 'ADMIN_RETRY',
      resourceType: 'BUNDLE',
      resourceId: null,
      takeover: false,
      previousActorId: null,
    };

    let enriched: PayloadWithCarrier<{ bundleId: string }> | null = null;

    IdempotencyALS.run(ctx, () => {
      enriched = enrichPayloadWithCarrier({ bundleId: 'bundle-456' });
    });

    expect(enriched!.bundleId).toBe('bundle-456');
    expect(enriched![CARRIER_FIELD_NAME]).not.toBeNull();
    expect(enriched![CARRIER_FIELD_NAME]!.requestId).toBe('req-enrich');
    expect(enriched![CARRIER_FIELD_NAME]!.actionId).toBe('act-enrich');
  });

  it('should preserve all original payload fields', () => {
    const payload = {
      bundleId: 'bundle-789',
      attempt: 3,
      metadata: { key: 'value' },
      tags: ['a', 'b'],
    };

    const enriched = enrichPayloadWithCarrier(payload);

    expect(enriched.bundleId).toBe('bundle-789');
    expect(enriched.attempt).toBe(3);
    expect(enriched.metadata).toEqual({ key: 'value' });
    expect(enriched.tags).toEqual(['a', 'b']);
  });

  it('should use CARRIER_FIELD_NAME constant', () => {
    const enriched = enrichPayloadWithCarrier({ data: 'test' });
    expect(CARRIER_FIELD_NAME in enriched).toBe(true);
    expect('idempotencyContext' in enriched).toBe(true);
  });
});

describe('enqueueWithContext', () => {
  it('should call queue.add with enriched payload', async () => {
    const mockQueue: QueueLike<any> = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    await enqueueWithContext(mockQueue, 'test-job', { bundleId: 'bundle-1' });

    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'test-job',
      expect.objectContaining({
        bundleId: 'bundle-1',
        [CARRIER_FIELD_NAME]: null, // No ALS context
      }),
      undefined,
    );
  });

  it('should pass options to queue.add', async () => {
    const mockQueue: QueueLike<any> = {
      add: jest.fn().mockResolvedValue({ id: 'job-2' }),
    };

    const opts = { delay: 1000, priority: 1 };
    await enqueueWithContext(mockQueue, 'delayed-job', { data: 'test' }, opts);

    expect(mockQueue.add).toHaveBeenCalledWith(
      'delayed-job',
      expect.any(Object),
      opts,
    );
  });

  it('should include carrier when ALS context is active', async () => {
    const mockQueue: QueueLike<any> = {
      add: jest.fn().mockResolvedValue({ id: 'job-3' }),
    };

    const ctx: IdempotencyContext = {
      requestId: 'req-queue',
      actionId: 'act-queue',
      actionType: 'ADMIN_RETRY',
      resourceType: 'BUNDLE',
      resourceId: 'bundle-queue',
      takeover: false,
      previousActorId: null,
    };

    await IdempotencyALS.run(ctx, async () => {
      await enqueueWithContext(mockQueue, 'context-job', { bundleId: 'bundle-queue' });
    });

    expect(mockQueue.add).toHaveBeenCalledWith(
      'context-job',
      expect.objectContaining({
        bundleId: 'bundle-queue',
        [CARRIER_FIELD_NAME]: expect.objectContaining({
          version: CARRIER_VERSION,
          requestId: 'req-queue',
          actionId: 'act-queue',
        }),
      }),
      undefined,
    );
  });

  it('should return queue.add result', async () => {
    const mockJob = { id: 'job-4', name: 'test' };
    const mockQueue: QueueLike<any> = {
      add: jest.fn().mockResolvedValue(mockJob),
    };

    const result = await enqueueWithContext(mockQueue, 'result-job', { data: 'test' });

    expect(result).toBe(mockJob);
  });

  it('should propagate queue.add errors', async () => {
    const mockQueue: QueueLike<any> = {
      add: jest.fn().mockRejectedValue(new Error('Queue error')),
    };

    await expect(
      enqueueWithContext(mockQueue, 'error-job', { data: 'test' }),
    ).rejects.toThrow('Queue error');
  });
});

describe('Integration: enqueue → dequeue round-trip', () => {
  it('should preserve context through simulated queue round-trip', async () => {
    // Simulate producer side
    const ctx: IdempotencyContext = {
      requestId: 'req-roundtrip',
      actionId: 'act-roundtrip',
      actionType: 'DLQ_REDRIVE',
      resourceType: 'DLQ_ENTRY',
      resourceId: 'dlq-entry-1',
      takeover: true,
      previousActorId: 'prev-roundtrip',
    };

    let capturedPayload: any;
    const mockQueue: QueueLike<any> = {
      add: jest.fn().mockImplementation((_name, data) => {
        capturedPayload = data;
        return Promise.resolve({ id: 'job-roundtrip' });
      }),
    };

    // Producer: enqueue with context
    await IdempotencyALS.run(ctx, async () => {
      await enqueueWithContext(mockQueue, 'roundtrip-job', { entryId: 'entry-1' });
    });

    // Verify payload has carrier
    expect(capturedPayload[CARRIER_FIELD_NAME]).not.toBeNull();
    expect(capturedPayload[CARRIER_FIELD_NAME].requestId).toBe('req-roundtrip');
    expect(capturedPayload[CARRIER_FIELD_NAME].takeover).toBe(true);
    expect(capturedPayload[CARRIER_FIELD_NAME].previousActorId).toBe('prev-roundtrip');

    // Consumer side would use runJobWithCarrier to restore context
    // (tested in run-job-with-carrier.spec.ts)
  });
});
