/**
 * Manifest Retry Queue Repository Tests
 * 
 * Phase 10 - Task 10.1.4
 * 
 * Unit tests for retry queue repository.
 * These tests mock PrismaService for fast execution.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaManifestRetryQueueRepository } from '../manifest-retry-queue.repository';
import { PrismaService } from '../../../../../../prisma/prisma.service';
import { ManifestErrorCode } from '../manifest-error-classifier';
import { BACKOFF_CONFIG } from '../manifest-retry.types';

describe('PrismaManifestRetryQueueRepository', () => {
  let repository: PrismaManifestRetryQueueRepository;
  let prisma: jest.Mocked<PrismaService>;
  
  const mockBundleId = '550e8400-e29b-41d4-a716-446655440000';
  const mockJobId = '660e8400-e29b-41d4-a716-446655440001';
  const mockWorkerId = 'worker-1';
  
  beforeEach(async () => {
    const mockPrisma = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      $queryRawUnsafe: jest.fn(),
    };
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaManifestRetryQueueRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    
    repository = module.get<PrismaManifestRetryQueueRepository>(PrismaManifestRetryQueueRepository);
    prisma = module.get(PrismaService);
  });
  
  // ==========================================================================
  // enqueue
  // ==========================================================================
  
  describe('enqueue', () => {
    it('should create new job when no active job exists', async () => {
      // No existing job
      prisma.$queryRaw
        .mockResolvedValueOnce([]) // getActiveByBundleId returns empty
        .mockResolvedValueOnce([{ id: mockJobId }]); // INSERT returns new id
      
      const result = await repository.enqueue({
        bundleId: mockBundleId,
        source: 'post_seal_hook',
      });
      
      expect(result.enqueued).toBe(true);
      expect(result.jobId).toBe(mockJobId);
      expect(result.reason).toBe('CREATED');
    });
    
    it('should return ALREADY_QUEUED when active job exists', async () => {
      const existingJob = {
        id: mockJobId,
        bundle_id: mockBundleId,
        status: 'PENDING',
        attempt: 0,
        max_attempts: 7,
        next_attempt_at: new Date('2026-02-02T12:05:00Z'),
        leased_until: null,
        leased_by: null,
        last_error_code: null,
        last_error_message: null,
        done_reason: null,
        source: 'post_seal_hook',
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      prisma.$queryRaw.mockResolvedValueOnce([existingJob]);
      
      const result = await repository.enqueue({
        bundleId: mockBundleId,
        source: 'admin_retry',
      });
      
      expect(result.enqueued).toBe(false);
      expect(result.reason).toBe('ALREADY_QUEUED');
      expect(result.existingJobId).toBe(mockJobId);
    });
    
    it('should handle concurrent insert conflict', async () => {
      // First check: no existing job
      prisma.$queryRaw
        .mockResolvedValueOnce([]) // getActiveByBundleId returns empty
        .mockResolvedValueOnce([]) // INSERT returns empty (conflict)
        .mockResolvedValueOnce([{ // Second getActiveByBundleId finds concurrent insert
          id: mockJobId,
          bundle_id: mockBundleId,
          status: 'PENDING',
          attempt: 0,
          max_attempts: 7,
          next_attempt_at: null,
          leased_until: null,
          leased_by: null,
          last_error_code: null,
          last_error_message: null,
          done_reason: null,
          source: 'post_seal_hook',
          created_at: new Date(),
          updated_at: new Date(),
        }]);
      
      const result = await repository.enqueue({
        bundleId: mockBundleId,
        source: 'post_seal_hook',
      });
      
      expect(result.enqueued).toBe(false);
      expect(result.reason).toBe('ALREADY_QUEUED');
    });
    
    it('should include error info when provided', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: mockJobId }]);
      
      await repository.enqueue({
        bundleId: mockBundleId,
        source: 'post_seal_hook',
        errorCode: ManifestErrorCode.S3_TIMEOUT,
        errorMessage: 'Connection timed out',
      });
      
      // Verify INSERT was called (we can't easily check params with raw queries)
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });
  });
  
  // ==========================================================================
  // claimNext
  // ==========================================================================
  
  describe('claimNext', () => {
    it('should claim available job', async () => {
      const claimedJob = {
        id: mockJobId,
        bundle_id: mockBundleId,
        status: 'IN_PROGRESS',
        attempt: 0,
        max_attempts: 7,
        next_attempt_at: null,
        leased_until: new Date(Date.now() + BACKOFF_CONFIG.leaseMs),
        leased_by: mockWorkerId,
        last_error_code: null,
        last_error_message: null,
        done_reason: null,
        source: 'post_seal_hook',
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      prisma.$queryRaw.mockResolvedValueOnce([claimedJob]);
      
      const result = await repository.claimNext(mockWorkerId);
      
      expect(result.claimed).toBe(true);
      expect(result.reason).toBe('CLAIMED');
      expect(result.job).toBeDefined();
      expect(result.job!.id).toBe(mockJobId);
      expect(result.job!.status).toBe('IN_PROGRESS');
      expect(result.job!.leasedBy).toBe(mockWorkerId);
    });
    
    it('should return NO_JOBS_AVAILABLE when queue is empty', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      
      const result = await repository.claimNext(mockWorkerId);
      
      expect(result.claimed).toBe(false);
      expect(result.reason).toBe('NO_JOBS_AVAILABLE');
      expect(result.job).toBeUndefined();
    });
    
    it('should use custom lease duration', async () => {
      const customLeaseMs = 120_000; // 2 minutes
      
      prisma.$queryRaw.mockResolvedValueOnce([{
        id: mockJobId,
        bundle_id: mockBundleId,
        status: 'IN_PROGRESS',
        attempt: 0,
        max_attempts: 7,
        next_attempt_at: null,
        leased_until: new Date(Date.now() + customLeaseMs),
        leased_by: mockWorkerId,
        last_error_code: null,
        last_error_message: null,
        done_reason: null,
        source: 'post_seal_hook',
        created_at: new Date(),
        updated_at: new Date(),
      }]);
      
      const result = await repository.claimNext(mockWorkerId, customLeaseMs);
      
      expect(result.claimed).toBe(true);
    });
  });
  
  // ==========================================================================
  // scheduleRetry
  // ==========================================================================
  
  describe('scheduleRetry', () => {
    it('should update job with retry info', async () => {
      prisma.$executeRaw.mockResolvedValueOnce(1);
      
      const nextAttemptAt = new Date('2026-02-02T12:05:00Z');
      
      await repository.scheduleRetry({
        jobId: mockJobId,
        errorCode: ManifestErrorCode.S3_TIMEOUT,
        errorMessage: 'Connection timed out',
        nextAttemptAt,
      });
      
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
    
    it('should handle missing error message', async () => {
      prisma.$executeRaw.mockResolvedValueOnce(1);
      
      await repository.scheduleRetry({
        jobId: mockJobId,
        errorCode: ManifestErrorCode.S3_5XX,
        nextAttemptAt: new Date(),
      });
      
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });
  
  // ==========================================================================
  // markDone
  // ==========================================================================
  
  describe('markDone', () => {
    it('should mark job as done with OK reason', async () => {
      prisma.$executeRaw.mockResolvedValueOnce(1);
      
      await repository.markDone({
        jobId: mockJobId,
        reason: 'OK',
      });
      
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
    
    it('should mark job as done with DONE_NOOP reason', async () => {
      prisma.$executeRaw.mockResolvedValueOnce(1);
      
      await repository.markDone({
        jobId: mockJobId,
        reason: 'DONE_NOOP',
      });
      
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
    
    it('should mark job as done with DLQ reason', async () => {
      prisma.$executeRaw.mockResolvedValueOnce(1);
      
      await repository.markDone({
        jobId: mockJobId,
        reason: 'DLQ',
      });
      
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });
  
  // ==========================================================================
  // extendLease
  // ==========================================================================
  
  describe('extendLease', () => {
    it('should extend lease for valid job', async () => {
      prisma.$executeRaw.mockResolvedValueOnce(1);
      
      const result = await repository.extendLease(mockJobId, mockWorkerId);
      
      expect(result).toBe(true);
    });
    
    it('should return false when job not found or wrong worker', async () => {
      prisma.$executeRaw.mockResolvedValueOnce(0);
      
      const result = await repository.extendLease(mockJobId, 'wrong-worker');
      
      expect(result).toBe(false);
    });
  });
  
  // ==========================================================================
  // getById
  // ==========================================================================
  
  describe('getById', () => {
    it('should return job when found', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{
        id: mockJobId,
        bundle_id: mockBundleId,
        status: 'PENDING',
        attempt: 0,
        max_attempts: 7,
        next_attempt_at: null,
        leased_until: null,
        leased_by: null,
        last_error_code: null,
        last_error_message: null,
        done_reason: null,
        source: 'post_seal_hook',
        created_at: new Date(),
        updated_at: new Date(),
      }]);
      
      const result = await repository.getById(mockJobId);
      
      expect(result).not.toBeNull();
      expect(result!.id).toBe(mockJobId);
    });
    
    it('should return null when not found', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      
      const result = await repository.getById('non-existent');
      
      expect(result).toBeNull();
    });
  });
  
  // ==========================================================================
  // getStats
  // ==========================================================================
  
  describe('getStats', () => {
    it('should return queue statistics', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        { status: 'PENDING', count: BigInt(5), oldest_age_seconds: 120 },
        { status: 'IN_PROGRESS', count: BigInt(2), oldest_age_seconds: null },
        { status: 'RETRY_SCHEDULED', count: BigInt(3), oldest_age_seconds: null },
        { status: 'DONE', count: BigInt(100), oldest_age_seconds: null },
      ]);
      
      const stats = await repository.getStats();
      
      expect(stats.pending).toBe(5);
      expect(stats.inProgress).toBe(2);
      expect(stats.retryScheduled).toBe(3);
      expect(stats.done).toBe(100);
      expect(stats.total).toBe(110);
      expect(stats.oldestPendingAge).toBe(120);
    });
    
    it('should handle empty queue', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      
      const stats = await repository.getStats();
      
      expect(stats.pending).toBe(0);
      expect(stats.inProgress).toBe(0);
      expect(stats.retryScheduled).toBe(0);
      expect(stats.done).toBe(0);
      expect(stats.total).toBe(0);
    });
  });
});
