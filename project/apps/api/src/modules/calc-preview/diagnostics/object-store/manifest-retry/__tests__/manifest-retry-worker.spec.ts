/**
 * Manifest Retry Worker Tests
 * 
 * Phase 10 - Task 10.1.6
 * 
 * Tests for the retry worker service including:
 * - Core loop processing
 * - State transitions
 * - Circuit breaker behavior
 * - Metrics emission
 */

import {
  ManifestRetryWorkerService,
  IManifestWriter,
  IWorkerMetrics,
  CircuitBreaker,
  NoOpWorkerMetrics,
} from '../manifest-retry-worker.service';
import { IManifestRetryQueueRepository } from '../manifest-retry-queue.repository';
import { IManifestDlqRepository } from '../manifest-dlq.repository';
import { ManifestErrorCode } from '../manifest-error-classifier';
import { RetryQueueJob, BACKOFF_CONFIG } from '../manifest-retry.types';

// ============================================================================
// Mock Factories
// ============================================================================

function createMockJob(overrides: Partial<RetryQueueJob> = {}): RetryQueueJob {
  return {
    id: 'job-123',
    bundleId: 'bundle-456',
    status: 'IN_PROGRESS',
    attempt: 0,
    maxAttempts: BACKOFF_CONFIG.maxAttempts,
    nextAttemptAt: null,
    leasedUntil: new Date(Date.now() + 60000),
    leasedBy: 'worker-test',
    lastErrorCode: null,
    lastErrorMessage: null,
    doneReason: null,
    source: 'post_seal_hook',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}


function createMockRetryQueue(): jest.Mocked<IManifestRetryQueueRepository> {
  return {
    enqueue: jest.fn(),
    claimNext: jest.fn(),
    scheduleRetry: jest.fn(),
    markDone: jest.fn(),
    extendLease: jest.fn(),
    getById: jest.fn(),
    getActiveByBundleId: jest.fn(),
    getStats: jest.fn(),
  };
}

function createMockDlqRepo(): jest.Mocked<IManifestDlqRepository> {
  return {
    upsert: jest.fn(),
    getById: jest.fn(),
    getByBundleId: jest.fn(),
    query: jest.fn(),
    resolve: jest.fn(),
    getStats: jest.fn(),
  };
}

function createMockManifestWriter(): jest.Mocked<IManifestWriter> {
  return {
    tryWriteManifest: jest.fn(),
  };
}

function createMockMetrics(): jest.Mocked<IWorkerMetrics> {
  return {
    recordJobClaimed: jest.fn(),
    recordJobDone: jest.fn(),
    recordJobRetryScheduled: jest.fn(),
    recordJobDlq: jest.fn(),
    recordCircuitBreakerState: jest.fn(),
    recordWorkerPoll: jest.fn(),
    recordWorkerIdle: jest.fn(),
    recordWorkerError: jest.fn(),
  };
}

// ============================================================================
// Circuit Breaker Tests
// ============================================================================

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;
  
  beforeEach(() => {
    breaker = new CircuitBreaker(5, 60000);
  });
  
  describe('initial state', () => {
    it('should start in closed state', () => {
      expect(breaker.getState()).toBe('closed');
      expect(breaker.isOpen()).toBe(false);
    });
    
    it('should have zero consecutive failures', () => {
      expect(breaker.getConsecutiveFailures()).toBe(0);
    });
  });
  
  describe('recordSuccess', () => {
    it('should reset consecutive failures', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getConsecutiveFailures()).toBe(2);
      
      breaker.recordSuccess();
      expect(breaker.getConsecutiveFailures()).toBe(0);
    });
    
    it('should keep state closed', () => {
      breaker.recordSuccess();
      expect(breaker.getState()).toBe('closed');
    });
  });
  
  describe('recordFailure', () => {
    it('should increment consecutive failures', () => {
      breaker.recordFailure();
      expect(breaker.getConsecutiveFailures()).toBe(1);
      
      breaker.recordFailure();
      expect(breaker.getConsecutiveFailures()).toBe(2);
    });
    
    it('should open circuit after threshold failures', () => {
      for (let i = 0; i < 5; i++) {
        breaker.recordFailure();
      }
      expect(breaker.getState()).toBe('open');
      expect(breaker.isOpen()).toBe(true);
    });
    
    it('should not open circuit before threshold', () => {
      for (let i = 0; i < 4; i++) {
        breaker.recordFailure();
      }
      expect(breaker.getState()).toBe('closed');
      expect(breaker.isOpen()).toBe(false);
    });
  });

  describe('half-open transition', () => {
    it('should transition to half-open after reset timeout', () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        breaker.recordFailure();
      }
      expect(breaker.getState()).toBe('open');
      
      // Create new breaker with short timeout for testing
      const shortBreaker = new CircuitBreaker(5, 10);
      for (let i = 0; i < 5; i++) {
        shortBreaker.recordFailure();
      }
      
      // Wait for timeout
      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(shortBreaker.getState()).toBe('half_open');
          resolve();
        }, 15);
      });
    });
  });
  
  describe('reset', () => {
    it('should reset to closed state', () => {
      for (let i = 0; i < 5; i++) {
        breaker.recordFailure();
      }
      expect(breaker.getState()).toBe('open');
      
      breaker.reset();
      expect(breaker.getState()).toBe('closed');
      expect(breaker.getConsecutiveFailures()).toBe(0);
    });
  });
});

// ============================================================================
// Worker Service Tests
// ============================================================================

describe('ManifestRetryWorkerService', () => {
  let worker: ManifestRetryWorkerService;
  let mockRetryQueue: jest.Mocked<IManifestRetryQueueRepository>;
  let mockDlqRepo: jest.Mocked<IManifestDlqRepository>;
  let mockManifestWriter: jest.Mocked<IManifestWriter>;
  let mockMetrics: jest.Mocked<IWorkerMetrics>;
  
  beforeEach(() => {
    mockRetryQueue = createMockRetryQueue();
    mockDlqRepo = createMockDlqRepo();
    mockManifestWriter = createMockManifestWriter();
    mockMetrics = createMockMetrics();
    
    worker = new ManifestRetryWorkerService(
      mockRetryQueue,
      mockDlqRepo,
      mockManifestWriter,
      mockMetrics,
      { circuitBreakerEnabled: true, circuitBreakerFailureThreshold: 5 }
    );
  });
  
  describe('initialization', () => {
    it('should generate unique instance ID', () => {
      const id = worker.getInstanceId();
      expect(id).toMatch(/^worker-[a-z0-9]+-[a-z0-9]+$/);
    });
    
    it('should not be running initially', () => {
      expect(worker.isRunning()).toBe(false);
    });
    
    it('should have closed circuit breaker initially', () => {
      expect(worker.getCircuitBreakerState()).toBe('closed');
    });
  });

  describe('processOnce - no jobs', () => {
    it('should return no_jobs when queue is empty', async () => {
      mockRetryQueue.claimNext.mockResolvedValue({
        claimed: false,
        reason: 'NO_JOBS_AVAILABLE',
      });
      
      const result = await worker.processOnce();
      
      expect(result.processed).toBe(false);
      expect(result.reason).toBe('no_jobs');
      expect(mockMetrics.recordWorkerPoll).toHaveBeenCalled();
      expect(mockMetrics.recordWorkerIdle).toHaveBeenCalled();
    });
  });
  
  describe('processOnce - successful write', () => {
    it('should mark job as done when manifest written', async () => {
      const job = createMockJob();
      mockRetryQueue.claimNext.mockResolvedValue({ claimed: true, job, reason: 'CLAIMED' });
      mockManifestWriter.tryWriteManifest.mockResolvedValue({
        outcome: 'written',
        manifestKey: 'bundles/bundle-456/manifest.json',
      });
      
      const result = await worker.processOnce();
      
      expect(result.processed).toBe(true);
      expect(result.decision).toBe('DONE_NOOP');
      expect(mockRetryQueue.markDone).toHaveBeenCalledWith({
        jobId: job.id,
        reason: 'OK',
      });
      expect(mockMetrics.recordJobClaimed).toHaveBeenCalledWith('post_seal_hook');
      expect(mockMetrics.recordJobDone).toHaveBeenCalledWith('ok', expect.any(Number));
    });
  });
  
  describe('processOnce - already exists (DONE_NOOP)', () => {
    it('should mark job as DONE_NOOP when manifest already exists', async () => {
      const job = createMockJob();
      mockRetryQueue.claimNext.mockResolvedValue({ claimed: true, job, reason: 'CLAIMED' });
      mockManifestWriter.tryWriteManifest.mockResolvedValue({
        outcome: 'already_exists',
        manifestKey: 'bundles/bundle-456/manifest.json',
      });
      
      const result = await worker.processOnce();
      
      expect(result.processed).toBe(true);
      expect(result.decision).toBe('DONE_NOOP');
      expect(mockRetryQueue.markDone).toHaveBeenCalledWith({
        jobId: job.id,
        reason: 'DONE_NOOP',
      });
      expect(mockMetrics.recordJobDone).toHaveBeenCalledWith('done_noop', expect.any(Number));
    });
  });
  
  describe('processOnce - transient error (RETRY)', () => {
    it('should schedule retry for transient error', async () => {
      const job = createMockJob({ attempt: 0 });
      mockRetryQueue.claimNext.mockResolvedValue({ claimed: true, job, reason: 'CLAIMED' });
      mockManifestWriter.tryWriteManifest.mockResolvedValue({
        outcome: 'error',
        error: { code: 'ETIMEDOUT' },
        errorCode: ManifestErrorCode.S3_TIMEOUT,
        errorMessage: 'Request timeout',
      });
      
      const result = await worker.processOnce();
      
      expect(result.processed).toBe(true);
      expect(result.decision).toBe('RETRY');
      expect(mockRetryQueue.scheduleRetry).toHaveBeenCalledWith({
        jobId: job.id,
        errorCode: ManifestErrorCode.S3_TIMEOUT,
        errorMessage: 'Request timeout',
        nextAttemptAt: expect.any(Date),
      });
      expect(mockMetrics.recordJobRetryScheduled).toHaveBeenCalledWith('S3_TIMEOUT', 1);
    });

    it('should move to DLQ when max attempts reached', async () => {
      const job = createMockJob({ attempt: 6 }); // 6 + 1 = 7 = maxAttempts
      mockRetryQueue.claimNext.mockResolvedValue({ claimed: true, job, reason: 'CLAIMED' });
      mockManifestWriter.tryWriteManifest.mockResolvedValue({
        outcome: 'error',
        error: { code: 'ETIMEDOUT' },
        errorCode: ManifestErrorCode.S3_TIMEOUT,
        errorMessage: 'Request timeout',
      });
      mockDlqRepo.upsert.mockResolvedValue({
        id: 'dlq-1',
        bundleId: job.bundleId,
        attempt: 7,
        finalErrorCode: ManifestErrorCode.S3_TIMEOUT,
        finalErrorMessage: 'Request timeout',
        firstFailedAt: job.createdAt,
        lastFailedAt: expect.any(Date),
        status: 'DLQ_OPEN',
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
        createdAt: expect.any(Date),
      });
      
      const result = await worker.processOnce();
      
      expect(result.processed).toBe(true);
      expect(result.decision).toBe('RETRY'); // Decision is RETRY but max attempts triggers DLQ
      expect(mockDlqRepo.upsert).toHaveBeenCalled();
      expect(mockRetryQueue.markDone).toHaveBeenCalledWith({
        jobId: job.id,
        reason: 'DLQ',
      });
      expect(mockMetrics.recordJobDlq).toHaveBeenCalledWith('S3_TIMEOUT');
    });
  });
  
  describe('processOnce - permanent error (DLQ)', () => {
    it('should move to DLQ for permanent error', async () => {
      const job = createMockJob();
      mockRetryQueue.claimNext.mockResolvedValue({ claimed: true, job, reason: 'CLAIMED' });
      mockManifestWriter.tryWriteManifest.mockResolvedValue({
        outcome: 'error',
        error: { code: 'AccessDenied', $metadata: { httpStatusCode: 403 } },
        errorCode: ManifestErrorCode.S3_ACCESS_DENIED,
        errorMessage: 'Access denied',
      });
      mockDlqRepo.upsert.mockResolvedValue({
        id: 'dlq-1',
        bundleId: job.bundleId,
        attempt: 1,
        finalErrorCode: ManifestErrorCode.S3_ACCESS_DENIED,
        finalErrorMessage: 'Access denied',
        firstFailedAt: job.createdAt,
        lastFailedAt: expect.any(Date),
        status: 'DLQ_OPEN',
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
        createdAt: expect.any(Date),
      });
      
      const result = await worker.processOnce();
      
      expect(result.processed).toBe(true);
      expect(result.decision).toBe('DLQ');
      expect(mockDlqRepo.upsert).toHaveBeenCalledWith({
        bundleId: job.bundleId,
        attempt: 1,
        errorCode: ManifestErrorCode.S3_ACCESS_DENIED,
        errorMessage: 'Access denied',
        firstFailedAt: job.createdAt,
        lastFailedAt: expect.any(Date),
        // Phase 11.2: prepareCarrierForDlqStorage(null) → carrier alanları null/false
        carrierJson: null,
        carrierVersion: null,
        carrierTruncated: false,
      });
      expect(mockRetryQueue.markDone).toHaveBeenCalledWith({
        jobId: job.id,
        reason: 'DLQ',
      });
      expect(mockMetrics.recordJobDlq).toHaveBeenCalledWith('S3_ACCESS_DENIED');
    });
  });

  describe('processOnce - circuit breaker', () => {
    it('should skip processing when circuit is open', async () => {
      // Open the circuit by simulating failures
      const job = createMockJob();
      mockRetryQueue.claimNext.mockResolvedValue({ claimed: true, job, reason: 'CLAIMED' });
      mockManifestWriter.tryWriteManifest.mockResolvedValue({
        outcome: 'error',
        error: { code: 'ETIMEDOUT' },
        errorCode: ManifestErrorCode.S3_TIMEOUT,
        errorMessage: 'Timeout',
      });
      mockDlqRepo.upsert.mockResolvedValue({
        id: 'dlq-1',
        bundleId: job.bundleId,
        attempt: 1,
        finalErrorCode: ManifestErrorCode.S3_TIMEOUT,
        finalErrorMessage: 'Timeout',
        firstFailedAt: job.createdAt,
        lastFailedAt: new Date(),
        status: 'DLQ_OPEN',
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
        createdAt: new Date(),
      });
      
      // Process 5 failures to open circuit
      for (let i = 0; i < 5; i++) {
        await worker.processOnce();
      }
      
      expect(worker.getCircuitBreakerState()).toBe('open');
      
      // Next call should be skipped
      const result = await worker.processOnce();
      
      expect(result.processed).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('circuit_open');
      expect(mockMetrics.recordCircuitBreakerState).toHaveBeenCalledWith('open');
    });
    
    it('should close circuit on success', async () => {
      const job = createMockJob();
      mockRetryQueue.claimNext.mockResolvedValue({ claimed: true, job, reason: 'CLAIMED' });
      
      // First, open the circuit
      mockManifestWriter.tryWriteManifest.mockResolvedValue({
        outcome: 'error',
        error: { code: 'ETIMEDOUT' },
        errorCode: ManifestErrorCode.S3_TIMEOUT,
        errorMessage: 'Timeout',
      });
      mockDlqRepo.upsert.mockResolvedValue({
        id: 'dlq-1',
        bundleId: job.bundleId,
        attempt: 1,
        finalErrorCode: ManifestErrorCode.S3_TIMEOUT,
        finalErrorMessage: 'Timeout',
        firstFailedAt: job.createdAt,
        lastFailedAt: new Date(),
        status: 'DLQ_OPEN',
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
        createdAt: new Date(),
      });
      
      for (let i = 0; i < 4; i++) {
        await worker.processOnce();
      }
      
      // Now succeed
      mockManifestWriter.tryWriteManifest.mockResolvedValue({
        outcome: 'written',
        manifestKey: 'bundles/bundle-456/manifest.json',
      });
      
      await worker.processOnce();
      
      expect(worker.getCircuitBreakerState()).toBe('closed');
    });
  });

  describe('processOnce - exception handling', () => {
    it('should handle thrown exceptions gracefully', async () => {
      const job = createMockJob();
      mockRetryQueue.claimNext.mockResolvedValue({ claimed: true, job, reason: 'CLAIMED' });
      mockManifestWriter.tryWriteManifest.mockRejectedValue(new Error('Unexpected error'));
      mockDlqRepo.upsert.mockResolvedValue({
        id: 'dlq-1',
        bundleId: job.bundleId,
        attempt: 1,
        finalErrorCode: ManifestErrorCode.UNKNOWN,
        finalErrorMessage: 'Unexpected error',
        firstFailedAt: job.createdAt,
        lastFailedAt: new Date(),
        status: 'DLQ_OPEN',
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
        createdAt: new Date(),
      });
      
      const result = await worker.processOnce();
      
      expect(result.processed).toBe(true);
      expect(result.error).toBeDefined();
      // First attempt of unknown error should RETRY
      expect(result.decision).toBe('RETRY');
    });
    
    it('should DLQ unknown error on second attempt', async () => {
      const job = createMockJob({ attempt: 1 });
      mockRetryQueue.claimNext.mockResolvedValue({ claimed: true, job, reason: 'CLAIMED' });
      mockManifestWriter.tryWriteManifest.mockRejectedValue(new Error('Unexpected error'));
      mockDlqRepo.upsert.mockResolvedValue({
        id: 'dlq-1',
        bundleId: job.bundleId,
        attempt: 2,
        finalErrorCode: ManifestErrorCode.UNKNOWN,
        finalErrorMessage: 'Unexpected error',
        firstFailedAt: job.createdAt,
        lastFailedAt: new Date(),
        status: 'DLQ_OPEN',
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
        createdAt: new Date(),
      });
      
      const result = await worker.processOnce();
      
      expect(result.processed).toBe(true);
      expect(result.decision).toBe('DLQ');
      expect(mockDlqRepo.upsert).toHaveBeenCalled();
    });
  });
  
  describe('NoOpWorkerMetrics', () => {
    it('should not throw on any method call', () => {
      const metrics = new NoOpWorkerMetrics();
      
      expect(() => metrics.recordJobClaimed('test')).not.toThrow();
      expect(() => metrics.recordJobDone('ok', 100)).not.toThrow();
      expect(() => metrics.recordJobRetryScheduled('S3_TIMEOUT', 1)).not.toThrow();
      expect(() => metrics.recordJobDlq('S3_ACCESS_DENIED')).not.toThrow();
      expect(() => metrics.recordCircuitBreakerState('closed')).not.toThrow();
      expect(() => metrics.recordWorkerPoll()).not.toThrow();
      expect(() => metrics.recordWorkerIdle()).not.toThrow();
      expect(() => metrics.recordWorkerError('TEST')).not.toThrow();
    });
  });
});

