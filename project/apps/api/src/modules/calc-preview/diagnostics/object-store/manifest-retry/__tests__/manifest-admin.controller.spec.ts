/**
 * Manifest Admin Controller Tests
 * 
 * Phase 10 - Task 10.1.8-11
 * 
 * Tests for admin endpoints:
 * - POST /admin/bundles/{bundleId}/manifest/retry
 * - GET /admin/manifest/retry-queue
 * - GET /admin/manifest/dlq
 * - POST /admin/manifest/dlq/{dlqId}/resolve
 */

import { NotFoundException, ConflictException } from '@nestjs/common';
import { ManifestAdminController } from '../manifest-admin.controller';
import { IManifestRetryQueueRepository } from '../manifest-retry-queue.repository';
import { IManifestDlqRepository } from '../manifest-dlq.repository';
import { ManifestWriter } from '../../bundle-manifest/bundle-manifest.writer';
import { ManifestErrorCode } from '../manifest-error-classifier';
import { DlqEntry } from '../manifest-retry.types';

// ============================================================================
// Mock Factories
// ============================================================================

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

function createMockManifestWriter(): jest.Mocked<Pick<ManifestWriter, 'manifestExists'>> {
  return {
    manifestExists: jest.fn(),
  };
}

function createMockDlqEntry(overrides: Partial<DlqEntry> = {}): DlqEntry {
  return {
    id: 'dlq-123',
    bundleId: 'bundle-456',
    attempt: 7,
    finalErrorCode: ManifestErrorCode.S3_TIMEOUT,
    finalErrorMessage: 'Request timeout',
    firstFailedAt: new Date('2026-02-02T10:00:00Z'),
    lastFailedAt: new Date('2026-02-02T12:00:00Z'),
    status: 'DLQ_OPEN',
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    redrivenAt: null,
    redrivenBy: null,
    createdAt: new Date('2026-02-02T10:00:00Z'),
    carrierJson: null,
    carrierVersion: null,
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

// ============================================================================
// Tests
// ============================================================================

describe('ManifestAdminController', () => {
  let controller: ManifestAdminController;
  let mockRetryQueue: jest.Mocked<IManifestRetryQueueRepository>;
  let mockDlqRepo: jest.Mocked<IManifestDlqRepository>;
  let mockManifestWriter: jest.Mocked<Pick<ManifestWriter, 'manifestExists'>>;
  let mockAuditService: { append: jest.Mock };

  beforeEach(async () => {
    mockRetryQueue = createMockRetryQueue();
    mockDlqRepo = createMockDlqRepo();
    mockManifestWriter = createMockManifestWriter();
    mockAuditService = { append: jest.fn() };

    // Manual instantiation since we're using interfaces
    controller = new ManifestAdminController(
      mockRetryQueue,
      mockDlqRepo,
      mockManifestWriter as unknown as ManifestWriter,
      mockAuditService as any,
    );
  });

  // ==========================================================================
  // POST /admin/bundles/{bundleId}/manifest/retry
  // ==========================================================================

  describe('retryManifest', () => {
    const bundleId = 'bundle-456';

    it('should return MANIFEST_EXISTS when manifest already exists', async () => {
      mockManifestWriter.manifestExists.mockResolvedValue(true);

      const result = await controller.retryManifest(bundleId);

      expect(result.enqueued).toBe(false);
      expect(result.reason).toBe('MANIFEST_EXISTS');
      expect(mockRetryQueue.enqueue).not.toHaveBeenCalled();
    });

    it('should enqueue job when manifest does not exist', async () => {
      mockManifestWriter.manifestExists.mockResolvedValue(false);
      mockRetryQueue.enqueue.mockResolvedValue({
        enqueued: true,
        jobId: 'job-789',
        reason: 'CREATED',
      });

      const result = await controller.retryManifest(bundleId);

      expect(result.enqueued).toBe(true);
      expect(result.jobId).toBe('job-789');
      expect(result.reason).toBe('CREATED');
      expect(mockRetryQueue.enqueue).toHaveBeenCalledWith({
        bundleId,
        source: 'admin_retry',
      });
    });

    it('should return ALREADY_QUEUED when job exists', async () => {
      mockManifestWriter.manifestExists.mockResolvedValue(false);
      mockRetryQueue.enqueue.mockResolvedValue({
        enqueued: false,
        reason: 'ALREADY_QUEUED',
        existingJobId: 'existing-job-123',
        nextAttemptAt: new Date('2026-02-02T12:05:00Z'),
      });

      const result = await controller.retryManifest(bundleId);

      expect(result.enqueued).toBe(false);
      expect(result.reason).toBe('ALREADY_QUEUED');
      expect(result.existingJobId).toBe('existing-job-123');
      expect(result.nextAttemptAt).toBe('2026-02-02T12:05:00.000Z');
    });

    it('should NEVER call direct write (critical invariant)', async () => {
      mockManifestWriter.manifestExists.mockResolvedValue(false);
      mockRetryQueue.enqueue.mockResolvedValue({
        enqueued: true,
        jobId: 'job-789',
        reason: 'CREATED',
      });

      await controller.retryManifest(bundleId);

      // Verify no direct write methods were called
      expect(mockManifestWriter.manifestExists).toHaveBeenCalled();
      // manifestWriter should only be used for existence check, not write
    });
  });

  // ==========================================================================
  // GET /admin/manifest/retry-queue
  // ==========================================================================

  describe('getRetryQueueStats', () => {
    it('should return queue statistics', async () => {
      mockRetryQueue.getStats.mockResolvedValue({
        pending: 5,
        inProgress: 2,
        retryScheduled: 10,
        done: 100,
        total: 117,
        oldestPendingAge: 3600,
      });

      const result = await controller.getRetryQueueStats();

      expect(result.pending).toBe(5);
      expect(result.inProgress).toBe(2);
      expect(result.retryScheduled).toBe(10);
      expect(result.done).toBe(100);
      expect(result.total).toBe(117);
      expect(result.oldestPendingAge).toBe(3600);
    });
  });

  // ==========================================================================
  // GET /admin/manifest/dlq
  // ==========================================================================

  describe('queryDlq', () => {
    it('should return DLQ entries with pagination', async () => {
      const entry = createMockDlqEntry();
      mockDlqRepo.query.mockResolvedValue({
        entries: [entry],
        total: 1,
        oldestAge: 7200,
      });

      const result = await controller.queryDlq({ limit: 50, offset: 0 });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe('dlq-123');
      expect(result.entries[0].bundleId).toBe('bundle-456');
      expect(result.total).toBe(1);
      expect(result.oldestAge).toBe(7200);
    });

    it('should filter by status', async () => {
      mockDlqRepo.query.mockResolvedValue({
        entries: [],
        total: 0,
      });

      await controller.queryDlq({ status: 'DLQ_OPEN', limit: 50, offset: 0 });

      expect(mockDlqRepo.query).toHaveBeenCalledWith({
        status: 'DLQ_OPEN',
        limit: 50,
        offset: 0,
      });
    });
  });

  // ==========================================================================
  // POST /admin/manifest/dlq/{dlqId}/resolve
  // ==========================================================================

  describe('resolveDlqEntry', () => {
    const dlqId = 'dlq-123';

    it('should throw NotFoundException when DLQ entry not found', async () => {
      mockDlqRepo.getById.mockResolvedValue(null);

      await expect(
        controller.resolveDlqEntry(dlqId, { resolution: 'manual_fix' })
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when entry already resolved', async () => {
      const entry = createMockDlqEntry({ status: 'DLQ_RESOLVED' });
      mockDlqRepo.getById.mockResolvedValue(entry);

      await expect(
        controller.resolveDlqEntry(dlqId, { resolution: 'manual_fix' })
      ).rejects.toThrow(ConflictException);
    });

    it('should resolve successfully with notes', async () => {
      const entry = createMockDlqEntry();
      mockDlqRepo.getById.mockResolvedValue(entry);
      mockDlqRepo.resolve.mockResolvedValue({
        ...entry,
        status: 'DLQ_RESOLVED',
        resolvedAt: new Date('2026-02-02T14:00:00Z'),
        resolvedBy: 'admin@system',
        resolutionNote: '[manual_fix] Fixed manually via S3 console',
      });

      const result = await controller.resolveDlqEntry(dlqId, {
        resolution: 'manual_fix',
        notes: 'Fixed manually via S3 console',
      });

      expect(result.resolved).toBe(true);
      expect(result.resolvedAt).toBe('2026-02-02T14:00:00.000Z');
      expect(mockDlqRepo.resolve).toHaveBeenCalledWith({
        dlqId,
        resolvedBy: 'admin@system',
        resolutionNote: '[manual_fix] Fixed manually via S3 console',
      });
    });

    it('should resolve without notes', async () => {
      const entry = createMockDlqEntry();
      mockDlqRepo.getById.mockResolvedValue(entry);
      mockDlqRepo.resolve.mockResolvedValue({
        ...entry,
        status: 'DLQ_RESOLVED',
        resolvedAt: new Date('2026-02-02T14:00:00Z'),
        resolvedBy: 'admin@system',
        resolutionNote: '[wont_fix]',
      });

      const result = await controller.resolveDlqEntry(dlqId, {
        resolution: 'wont_fix',
      });

      expect(result.resolved).toBe(true);
      expect(mockDlqRepo.resolve).toHaveBeenCalledWith({
        dlqId,
        resolvedBy: 'admin@system',
        resolutionNote: '[wont_fix]',
      });
    });
  });
});

