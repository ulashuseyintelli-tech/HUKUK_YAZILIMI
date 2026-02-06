/**
 * Run Job With Carrier Tests
 * 
 * Phase 10.4 - PR-10.4.2 (P1)
 * 
 * Tests runJobWithCarrier() consumer helper.
 */

import { Logger } from '@nestjs/common';
import {
  runJobWithCarrier,
  runJobWithCarrierSync,
} from '../run-job-with-carrier';
import { getIdempotencyContext, IdempotencyALS } from '../idempotency-context';
import { IdempotencyContextCarrier } from '../idempotency-carrier.types';
import * as carrierMetrics from '../carrier-metrics';

// Mock metrics
jest.mock('../carrier-metrics', () => ({
  recordDegradedCorrelation: jest.fn(),
  recordContextRestored: jest.fn(),
  REASON_MISSING: 'MISSING',
}));

describe('runJobWithCarrier', () => {
  const mockLogger = {
    warn: jest.fn(),
    log: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  } as unknown as Logger;

  const validCarrier: IdempotencyContextCarrier = {
    version: 1,
    requestId: 'req-123',
    actionId: 'act-456',
    actionType: 'ADMIN_RETRY',
    resourceType: 'BUNDLE',
    resourceId: 'bundle-789',
    takeover: false,
    previousActorId: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('with valid carrier', () => {
    it('should restore ALS context inside fn', async () => {
      let capturedContext: ReturnType<typeof getIdempotencyContext>;

      await runJobWithCarrier(
        validCarrier,
        async () => {
          capturedContext = getIdempotencyContext();
        },
        mockLogger,
      );

      expect(capturedContext).toBeDefined();
      expect(capturedContext!.requestId).toBe('req-123');
      expect(capturedContext!.actionId).toBe('act-456');
      expect(capturedContext!.actionType).toBe('ADMIN_RETRY');
      expect(capturedContext!.resourceType).toBe('BUNDLE');
      expect(capturedContext!.resourceId).toBe('bundle-789');
      expect(capturedContext!.takeover).toBe(false);
      expect(capturedContext!.previousActorId).toBeNull();
    });

    it('should record context restored metric', async () => {
      await runJobWithCarrier(validCarrier, async () => {}, mockLogger);

      expect(carrierMetrics.recordContextRestored).toHaveBeenCalledTimes(1);
      expect(carrierMetrics.recordDegradedCorrelation).not.toHaveBeenCalled();
    });

    it('should return fn result', async () => {
      const result = await runJobWithCarrier(
        validCarrier,
        async () => 'success',
        mockLogger,
      );

      expect(result).toBe('success');
    });

    it('should propagate fn errors', async () => {
      const error = new Error('Job failed');

      await expect(
        runJobWithCarrier(
          validCarrier,
          async () => {
            throw error;
          },
          mockLogger,
        ),
      ).rejects.toThrow('Job failed');
    });

    it('should not log warning for valid carrier', async () => {
      await runJobWithCarrier(validCarrier, async () => {}, mockLogger);

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('with null carrier (MISSING)', () => {
    it('should run fn without ALS context', async () => {
      let capturedContext: ReturnType<typeof getIdempotencyContext>;

      await runJobWithCarrier(
        null,
        async () => {
          capturedContext = getIdempotencyContext();
        },
        mockLogger,
      );

      expect(capturedContext).toBeUndefined();
    });

    it('should record MISSING metric', async () => {
      await runJobWithCarrier(null, async () => {}, mockLogger);

      expect(carrierMetrics.recordDegradedCorrelation).toHaveBeenCalledWith('MISSING');
      expect(carrierMetrics.recordContextRestored).not.toHaveBeenCalled();
    });

    it('should log warning', async () => {
      await runJobWithCarrier(null, async () => {}, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No carrier provided'),
      );
    });

    it('should still return fn result', async () => {
      const result = await runJobWithCarrier(null, async () => 'degraded-result', mockLogger);

      expect(result).toBe('degraded-result');
    });
  });

  describe('with undefined carrier (MISSING)', () => {
    it('should run fn without ALS context', async () => {
      let capturedContext: ReturnType<typeof getIdempotencyContext>;

      await runJobWithCarrier(
        undefined,
        async () => {
          capturedContext = getIdempotencyContext();
        },
        mockLogger,
      );

      expect(capturedContext).toBeUndefined();
    });

    it('should record MISSING metric', async () => {
      await runJobWithCarrier(undefined, async () => {}, mockLogger);

      expect(carrierMetrics.recordDegradedCorrelation).toHaveBeenCalledWith('MISSING');
    });
  });

  describe('with invalid carrier (VERSION_MISMATCH)', () => {
    it('should run fn without ALS context', async () => {
      const invalidCarrier = { ...validCarrier, version: 2 };
      let capturedContext: ReturnType<typeof getIdempotencyContext>;

      await runJobWithCarrier(
        invalidCarrier,
        async () => {
          capturedContext = getIdempotencyContext();
        },
        mockLogger,
      );

      expect(capturedContext).toBeUndefined();
    });

    it('should record VERSION_MISMATCH metric', async () => {
      const invalidCarrier = { ...validCarrier, version: 2 };

      await runJobWithCarrier(invalidCarrier, async () => {}, mockLogger);

      expect(carrierMetrics.recordDegradedCorrelation).toHaveBeenCalledWith('VERSION_MISMATCH');
    });

    it('should log warning with reason', async () => {
      const invalidCarrier = { ...validCarrier, version: 2 };

      await runJobWithCarrier(invalidCarrier, async () => {}, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('VERSION_MISMATCH'),
      );
    });
  });

  describe('with invalid carrier (MISSING_REQUIRED)', () => {
    it('should record MISSING_REQUIRED metric', async () => {
      const invalidCarrier = { ...validCarrier, requestId: '' };

      await runJobWithCarrier(invalidCarrier, async () => {}, mockLogger);

      expect(carrierMetrics.recordDegradedCorrelation).toHaveBeenCalledWith('MISSING_REQUIRED');
    });
  });

  describe('with invalid carrier (MALFORMED)', () => {
    it('should record MALFORMED metric for non-object', async () => {
      await runJobWithCarrier('not-an-object', async () => {}, mockLogger);

      expect(carrierMetrics.recordDegradedCorrelation).toHaveBeenCalledWith('MALFORMED');
    });

    it('should record MALFORMED metric for array', async () => {
      await runJobWithCarrier([1, 2, 3], async () => {}, mockLogger);

      expect(carrierMetrics.recordDegradedCorrelation).toHaveBeenCalledWith('MALFORMED');
    });
  });

  describe('with invalid carrier (TYPE_ERROR)', () => {
    it('should record TYPE_ERROR metric', async () => {
      const invalidCarrier = { ...validCarrier, takeover: 'true' };

      await runJobWithCarrier(invalidCarrier, async () => {}, mockLogger);

      expect(carrierMetrics.recordDegradedCorrelation).toHaveBeenCalledWith('TYPE_ERROR');
    });
  });

  describe('ALS isolation', () => {
    it('should not leak context after fn completes', async () => {
      await runJobWithCarrier(validCarrier, async () => {
        expect(getIdempotencyContext()).toBeDefined();
      }, mockLogger);

      // After runJobWithCarrier completes, context should be gone
      expect(getIdempotencyContext()).toBeUndefined();
    });

    it('should not affect outer ALS context', async () => {
      const outerContext = {
        requestId: 'outer-req',
        actionId: 'outer-act',
        actionType: 'OUTER',
        resourceType: 'OUTER',
        resourceId: null,
        takeover: false,
        previousActorId: null,
      };

      await IdempotencyALS.run(outerContext, async () => {
        // Inner runJobWithCarrier should not affect outer context
        await runJobWithCarrier(validCarrier, async () => {
          const inner = getIdempotencyContext();
          expect(inner!.requestId).toBe('req-123'); // Inner context
        }, mockLogger);

        // After inner completes, outer context should be restored
        const outer = getIdempotencyContext();
        expect(outer!.requestId).toBe('outer-req');
      });
    });
  });
});

describe('runJobWithCarrierSync', () => {
  const mockLogger = {
    warn: jest.fn(),
    log: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  } as unknown as Logger;

  const validCarrier: IdempotencyContextCarrier = {
    version: 1,
    requestId: 'sync-req',
    actionId: 'sync-act',
    actionType: 'SYNC_TEST',
    resourceType: 'TEST',
    resourceId: null,
    takeover: false,
    previousActorId: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should restore ALS context for sync fn', () => {
    let capturedContext: ReturnType<typeof getIdempotencyContext>;

    runJobWithCarrierSync(
      validCarrier,
      () => {
        capturedContext = getIdempotencyContext();
      },
      mockLogger,
    );

    expect(capturedContext).toBeDefined();
    expect(capturedContext!.requestId).toBe('sync-req');
  });

  it('should return sync fn result', () => {
    const result = runJobWithCarrierSync(validCarrier, () => 42, mockLogger);

    expect(result).toBe(42);
  });

  it('should handle null carrier', () => {
    let capturedContext: ReturnType<typeof getIdempotencyContext>;

    runJobWithCarrierSync(
      null,
      () => {
        capturedContext = getIdempotencyContext();
      },
      mockLogger,
    );

    expect(capturedContext).toBeUndefined();
    expect(carrierMetrics.recordDegradedCorrelation).toHaveBeenCalledWith('MISSING');
  });

  it('should propagate sync errors', () => {
    expect(() =>
      runJobWithCarrierSync(
        validCarrier,
        () => {
          throw new Error('Sync error');
        },
        mockLogger,
      ),
    ).toThrow('Sync error');
  });
});
