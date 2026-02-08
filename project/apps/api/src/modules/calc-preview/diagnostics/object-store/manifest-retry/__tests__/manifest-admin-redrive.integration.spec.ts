/**
 * Manifest Admin Redrive Integration Tests - Phase 10.5 Task 7
 * 
 * Tests for admin controller redrive endpoint with carrier clone semantics.
 * 
 * @see ADR-008 v1.3: Queue/Job Boundary Context Propagation
 */

import { ConflictException } from '@nestjs/common';
import { ManifestAdminController } from '../manifest-admin.controller';
import { DlqRedriveError } from '../manifest-dlq.repository';
import {
  resetAllMetrics,
  redriveClonedMetric,
  redriveRejectedMetric,
} from '../idempotency/carrier-lifecycle/carrier-lifecycle-metrics';
import { DlqEntry, DlqStatus } from '../manifest-retry.types';
import { ManifestErrorCode } from '../manifest-error-classifier';

describe('ManifestAdminController - Redrive Integration (Task 7)', () => {
  let controller: ManifestAdminController;
  let mockDlqRepo: {
    getById: jest.Mock;
    getByBundleId: jest.Mock;
    upsert: jest.Mock;
    query: jest.Mock;
    queryWithCursor: jest.Mock;
    resolve: jest.Mock;
    atomicRedrive: jest.Mock;
    getStats: jest.Mock;
    markAsPoison: jest.Mock;
    findByCorrelationId: jest.Mock;
  };
  let mockRetryQueue: {
    enqueue: jest.Mock;
    getStats: jest.Mock;
    queryWithCursor: jest.Mock;
  };
  let mockManifestWriter: { manifestExists: jest.Mock };
  let mockAuditService: { append: jest.Mock };
  
  // =========================================================================
  // FIXTURES
  // =========================================================================
  
  const baseDlqEntry: DlqEntry = {
    id: 'dlq-123',
    bundleId: 'bundle-456',
    attempt: 3,
    finalErrorCode: 'NETWORK_ERROR' as ManifestErrorCode,
    finalErrorMessage: 'Connection refused',
    firstFailedAt: new Date('2026-02-05T08:00:00Z'),
    lastFailedAt: new Date('2026-02-05T10:00:00Z'),
    status: 'DLQ_OPEN' as DlqStatus,
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    redrivenAt: null,
    redrivenBy: null,
    createdAt: new Date('2026-02-05T08:00:00Z'),
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
  };
  
  beforeEach(() => {
    resetAllMetrics();
    
    // Create mocks with jest.fn()
    mockDlqRepo = {
      getById: jest.fn(),
      getByBundleId: jest.fn(),
      upsert: jest.fn(),
      query: jest.fn(),
      queryWithCursor: jest.fn(),
      resolve: jest.fn(),
      atomicRedrive: jest.fn(),
      getStats: jest.fn(),
      markAsPoison: jest.fn(),
      findByCorrelationId: jest.fn().mockResolvedValue(null),
    };
    
    mockRetryQueue = {
      enqueue: jest.fn(),
      getStats: jest.fn(),
      queryWithCursor: jest.fn(),
    };
    
    mockManifestWriter = {
      manifestExists: jest.fn(),
    };
    
    mockAuditService = {
      append: jest.fn(),
    };
    
    // Directly instantiate controller with mocks
    controller = new ManifestAdminController(
      mockRetryQueue as any,
      mockDlqRepo as any,
      mockManifestWriter as any,
      mockAuditService as any,
    );
  });
  
  // =========================================================================
  // REDRIVE SUCCESS TESTS
  // =========================================================================
  
  describe('redriveDlqEntry - Success', () => {
    it('should redrive DLQ entry with new correlationId and parentCorrelationId', async () => {
      // Arrange
      mockDlqRepo.getById.mockResolvedValue(baseDlqEntry);
      mockDlqRepo.atomicRedrive.mockResolvedValue({
        dlqEntry: { ...baseDlqEntry, status: 'DLQ_REDROVE' as DlqStatus },
        newJobId: 'job-789',
      });
      
      const mockReq = {
        ip: '127.0.0.1',
        get: () => 'test-agent',
        user: { id: 'admin@test' },
        requestId: 'req-123',
      } as any;
      
      // Act
      const response = await controller.redriveDlqEntry('dlq-123', mockReq);
      
      // Assert
      expect(response.redriven).toBe(true);
      expect(response.dlqId).toBe('dlq-123');
      expect(response.bundleId).toBe('bundle-456');
      expect(response.newJobId).toBe('job-789');
      expect(response.reason).toBe('REDRIVEN');
      
      // Task 7: Verify correlation IDs in response
      expect(response.correlationId).toBeDefined();
      expect(response.parentCorrelationId).toBeDefined();
      expect(response.correlationId).not.toBe(response.parentCorrelationId);
    });
    
    it('should emit audit event with correlation chain', async () => {
      // Arrange
      mockDlqRepo.getById.mockResolvedValue(baseDlqEntry);
      mockDlqRepo.atomicRedrive.mockResolvedValue({
        dlqEntry: { ...baseDlqEntry, status: 'DLQ_REDROVE' as DlqStatus },
        newJobId: 'job-789',
      });
      
      const mockReq = {
        ip: '127.0.0.1',
        get: () => 'test-agent',
        user: { id: 'admin@test' },
        requestId: 'req-123',
      } as any;
      
      // Act
      await controller.redriveDlqEntry('dlq-123', mockReq);
      
      // Assert audit event
      expect(mockAuditService.append).toHaveBeenCalledTimes(1);
      const auditCall = mockAuditService.append.mock.calls[0][0];
      
      expect(auditCall.eventType).toBe('DLQ_REDRIVE');
      expect(auditCall.resourceType).toBe('DLQ_ENTRY');
      expect(auditCall.resourceId).toBe('dlq-123');
      expect(auditCall.targetBundleId).toBe('bundle-456');
      expect(auditCall.outcome).toBe('SUCCESS');
      
      // Task 7: Verify correlation chain in audit
      expect(auditCall.beforeState.correlationId).toBeDefined();
      expect(auditCall.afterState.correlationId).toBeDefined();
      expect(auditCall.afterState.parentCorrelationId).toBeDefined();
      expect(auditCall.afterState.newJobId).toBe('job-789');
      expect(auditCall.afterState.attemptNumber).toBe(0); // Reset for redrive
    });
    
    it('should increment redriveClonedMetric on success', async () => {
      // Arrange
      mockDlqRepo.getById.mockResolvedValue(baseDlqEntry);
      mockDlqRepo.atomicRedrive.mockResolvedValue({
        dlqEntry: { ...baseDlqEntry, status: 'DLQ_REDROVE' as DlqStatus },
        newJobId: 'job-789',
      });
      
      const mockReq = {
        ip: '127.0.0.1',
        get: () => 'test-agent',
      } as any;
      
      // Act
      await controller.redriveDlqEntry('dlq-123', mockReq);
      
      // Assert
      expect(redriveClonedMetric.getCount({})).toBe(1);
    });
  });
  
  // =========================================================================
  // REDRIVE REJECTION TESTS
  // =========================================================================
  
  describe('redriveDlqEntry - Rejections', () => {
    it('should throw NotFoundException when DLQ entry not found', async () => {
      // Arrange
      mockDlqRepo.getById.mockResolvedValue(null);
      
      const mockReq = { ip: '127.0.0.1', get: () => 'test-agent' } as any;
      
      // Act & Assert
      await expect(controller.redriveDlqEntry('dlq-not-found', mockReq))
        .rejects.toThrow('DLQ entry not found');
      
      expect(redriveRejectedMetric.getCount({ reason: 'NOT_FOUND' })).toBe(1);
    });
    
    it('should throw ConflictException when DLQ entry already redriven', async () => {
      // Arrange
      mockDlqRepo.getById.mockResolvedValue(baseDlqEntry);
      mockDlqRepo.atomicRedrive.mockRejectedValue(
        new DlqRedriveError('Already redriven', 'ALREADY_REDRIVEN')
      );
      
      const mockReq = { ip: '127.0.0.1', get: () => 'test-agent' } as any;
      
      // Act & Assert
      await expect(controller.redriveDlqEntry('dlq-123', mockReq))
        .rejects.toThrow(ConflictException);
    });
    
    it('should throw ConflictException when DLQ entry already resolved', async () => {
      // Arrange
      mockDlqRepo.getById.mockResolvedValue(baseDlqEntry);
      mockDlqRepo.atomicRedrive.mockRejectedValue(
        new DlqRedriveError('Already resolved', 'ALREADY_RESOLVED')
      );
      
      const mockReq = { ip: '127.0.0.1', get: () => 'test-agent' } as any;
      
      // Act & Assert
      await expect(controller.redriveDlqEntry('dlq-123', mockReq))
        .rejects.toThrow(ConflictException);
    });
    
    it('should throw ConflictException when bundle already queued', async () => {
      // Arrange
      mockDlqRepo.getById.mockResolvedValue(baseDlqEntry);
      mockDlqRepo.atomicRedrive.mockRejectedValue(
        new DlqRedriveError('Already queued', 'ALREADY_QUEUED', { existingJobId: 'existing-job' })
      );
      
      const mockReq = { ip: '127.0.0.1', get: () => 'test-agent' } as any;
      
      // Act & Assert
      await expect(controller.redriveDlqEntry('dlq-123', mockReq))
        .rejects.toThrow(ConflictException);
    });
  });
  
  // =========================================================================
  // CLONE SEMANTICS TESTS
  // =========================================================================
  
  describe('Carrier Clone Semantics', () => {
    it('should generate new correlationId (not reuse original)', async () => {
      // Arrange
      mockDlqRepo.getById.mockResolvedValue(baseDlqEntry);
      mockDlqRepo.atomicRedrive.mockResolvedValue({
        dlqEntry: { ...baseDlqEntry, status: 'DLQ_REDROVE' as DlqStatus },
        newJobId: 'job-789',
      });
      
      const mockReq = { ip: '127.0.0.1', get: () => 'test-agent' } as any;
      
      // Act
      const response = await controller.redriveDlqEntry('dlq-123', mockReq);
      
      // Assert: correlationId should be a new UUID, not the DLQ ID
      expect(response.correlationId).toBeDefined();
      expect(response.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });
    
    it('should link parentCorrelationId to original', async () => {
      // Arrange
      mockDlqRepo.getById.mockResolvedValue(baseDlqEntry);
      mockDlqRepo.atomicRedrive.mockResolvedValue({
        dlqEntry: { ...baseDlqEntry, status: 'DLQ_REDROVE' as DlqStatus },
        newJobId: 'job-789',
      });
      
      const mockReq = { ip: '127.0.0.1', get: () => 'test-agent' } as any;
      
      // Act
      const response = await controller.redriveDlqEntry('dlq-123', mockReq);
      
      // Assert: parentCorrelationId should be derived from the original carrier
      expect(response.parentCorrelationId).toBeDefined();
      expect(typeof response.parentCorrelationId).toBe('string');
    });
    
    it('should reset attemptNumber to 0 in audit afterState', async () => {
      // Arrange
      mockDlqRepo.getById.mockResolvedValue({
        ...baseDlqEntry,
        attempt: 7, // High attempt count
      });
      mockDlqRepo.atomicRedrive.mockResolvedValue({
        dlqEntry: { ...baseDlqEntry, status: 'DLQ_REDROVE' as DlqStatus },
        newJobId: 'job-789',
      });
      
      const mockReq = { ip: '127.0.0.1', get: () => 'test-agent' } as any;
      
      // Act
      await controller.redriveDlqEntry('dlq-123', mockReq);
      
      // Assert: attemptNumber should be reset to 0
      const auditCall = mockAuditService.append.mock.calls[0][0];
      expect(auditCall.afterState.attemptNumber).toBe(0);
    });
  });
});
