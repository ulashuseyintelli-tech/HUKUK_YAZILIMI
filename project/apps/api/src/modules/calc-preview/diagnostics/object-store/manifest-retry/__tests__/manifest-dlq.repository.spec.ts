/**
 * Manifest DLQ Repository Tests
 * 
 * Phase 10 - Task 10.1.5
 * 
 * Unit tests for dead letter queue repository.
 * These tests mock PrismaService for fast execution.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaManifestDlqRepository } from '../manifest-dlq.repository';
import { PrismaService } from '../../../../../../prisma/prisma.service';
import { ManifestErrorCode } from '../manifest-error-classifier';

describe('PrismaManifestDlqRepository', () => {
  let repository: PrismaManifestDlqRepository;
  let prisma: jest.Mocked<PrismaService>;
  
  const mockBundleId = '550e8400-e29b-41d4-a716-446655440000';
  const mockDlqId = '770e8400-e29b-41d4-a716-446655440002';
  
  const mockRawDlqEntry = {
    id: mockDlqId,
    bundle_id: mockBundleId,
    attempt: 7,
    final_error_code: 'S3_TIMEOUT',
    final_error_message: 'Connection timed out after 7 attempts',
    first_failed_at: new Date('2026-02-02T10:00:00Z'),
    last_failed_at: new Date('2026-02-02T17:00:00Z'),
    status: 'DLQ_OPEN',
    resolved_at: null,
    resolved_by: null,
    resolution_note: null,
    redriven_at: null,
    redriven_by: null,
    created_at: new Date('2026-02-02T17:00:00Z'),
    // Phase 11.0 - Carrier storage
    carrier_json: null,
    carrier_version: null,
    carrier_truncated: false,
  };
  
  beforeEach(async () => {
    const mockPrisma = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      $queryRawUnsafe: jest.fn(),
    };
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaManifestDlqRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    
    repository = module.get<PrismaManifestDlqRepository>(PrismaManifestDlqRepository);
    prisma = module.get(PrismaService);
  });
  
  // ==========================================================================
  // upsert
  // ==========================================================================
  
  describe('upsert', () => {
    it('should create new DLQ entry', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([mockRawDlqEntry]);
      
      const result = await repository.upsert({
        bundleId: mockBundleId,
        attempt: 7,
        errorCode: ManifestErrorCode.S3_TIMEOUT,
        errorMessage: 'Connection timed out after 7 attempts',
        firstFailedAt: new Date('2026-02-02T10:00:00Z'),
        lastFailedAt: new Date('2026-02-02T17:00:00Z'),
      });
      
      expect(result.id).toBe(mockDlqId);
      expect(result.bundleId).toBe(mockBundleId);
      expect(result.status).toBe('DLQ_OPEN');
      expect(result.finalErrorCode).toBe('S3_TIMEOUT');
    });
    
    it('should update existing DLQ entry on conflict', async () => {
      const updatedEntry = {
        ...mockRawDlqEntry,
        attempt: 14, // Updated attempt count
        last_failed_at: new Date('2026-02-03T10:00:00Z'),
      };
      
      prisma.$queryRaw.mockResolvedValueOnce([updatedEntry]);
      
      const result = await repository.upsert({
        bundleId: mockBundleId,
        attempt: 14,
        errorCode: ManifestErrorCode.S3_TIMEOUT,
        errorMessage: 'Still failing',
        firstFailedAt: new Date('2026-02-02T10:00:00Z'),
        lastFailedAt: new Date('2026-02-03T10:00:00Z'),
      });
      
      expect(result.attempt).toBe(14);
    });
    
    it('should handle missing error message', async () => {
      const entryWithoutMessage = {
        ...mockRawDlqEntry,
        final_error_message: null,
      };
      
      prisma.$queryRaw.mockResolvedValueOnce([entryWithoutMessage]);
      
      const result = await repository.upsert({
        bundleId: mockBundleId,
        attempt: 7,
        errorCode: ManifestErrorCode.S3_ACCESS_DENIED,
        firstFailedAt: new Date(),
        lastFailedAt: new Date(),
      });
      
      expect(result.finalErrorMessage).toBeNull();
    });
    
    // Phase 11.0 - Carrier storage tests
    it('should store carrier JSON when provided', async () => {
      const carrierJson = JSON.stringify({
        version: 2,
        correlationId: 'test-correlation-id',
        requestId: 'test-request-id',
      });
      
      const entryWithCarrier = {
        ...mockRawDlqEntry,
        carrier_json: carrierJson,
        carrier_version: 2,
        carrier_truncated: false,
      };
      
      prisma.$queryRaw.mockResolvedValueOnce([entryWithCarrier]);
      
      const result = await repository.upsert({
        bundleId: mockBundleId,
        attempt: 7,
        errorCode: ManifestErrorCode.S3_TIMEOUT,
        errorMessage: 'Connection timed out',
        firstFailedAt: new Date(),
        lastFailedAt: new Date(),
        carrierJson,
        carrierVersion: 2,
        carrierTruncated: false,
      });
      
      expect(result.carrierJson).toBe(carrierJson);
      expect(result.carrierVersion).toBe(2);
      expect(result.carrierTruncated).toBe(false);
    });
    
    it('should handle truncated carrier', async () => {
      const truncatedCarrierJson = JSON.stringify({
        version: 2,
        correlationId: 'test-correlation-id',
        // metadata truncated
      });
      
      const entryWithTruncatedCarrier = {
        ...mockRawDlqEntry,
        carrier_json: truncatedCarrierJson,
        carrier_version: 2,
        carrier_truncated: true,
      };
      
      prisma.$queryRaw.mockResolvedValueOnce([entryWithTruncatedCarrier]);
      
      const result = await repository.upsert({
        bundleId: mockBundleId,
        attempt: 7,
        errorCode: ManifestErrorCode.S3_TIMEOUT,
        firstFailedAt: new Date(),
        lastFailedAt: new Date(),
        carrierJson: truncatedCarrierJson,
        carrierVersion: 2,
        carrierTruncated: true,
      });
      
      expect(result.carrierTruncated).toBe(true);
    });
    
    it('should default carrier fields to null/false when not provided', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([mockRawDlqEntry]);
      
      const result = await repository.upsert({
        bundleId: mockBundleId,
        attempt: 7,
        errorCode: ManifestErrorCode.S3_TIMEOUT,
        firstFailedAt: new Date(),
        lastFailedAt: new Date(),
        // No carrier fields provided
      });
      
      expect(result.carrierJson).toBeNull();
      expect(result.carrierVersion).toBeNull();
      expect(result.carrierTruncated).toBe(false);
    });
  });
  
  // ==========================================================================
  // getById
  // ==========================================================================
  
  describe('getById', () => {
    it('should return entry when found', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([mockRawDlqEntry]);
      
      const result = await repository.getById(mockDlqId);
      
      expect(result).not.toBeNull();
      expect(result!.id).toBe(mockDlqId);
      expect(result!.bundleId).toBe(mockBundleId);
      // Phase 11.0 - Carrier fields should be present
      expect(result!.carrierJson).toBeNull();
      expect(result!.carrierVersion).toBeNull();
      expect(result!.carrierTruncated).toBe(false);
    });
    
    it('should return entry with carrier data', async () => {
      const carrierJson = JSON.stringify({ version: 2, correlationId: 'test' });
      const entryWithCarrier = {
        ...mockRawDlqEntry,
        carrier_json: carrierJson,
        carrier_version: 2,
        carrier_truncated: false,
      };
      
      prisma.$queryRaw.mockResolvedValueOnce([entryWithCarrier]);
      
      const result = await repository.getById(mockDlqId);
      
      expect(result).not.toBeNull();
      expect(result!.carrierJson).toBe(carrierJson);
      expect(result!.carrierVersion).toBe(2);
      expect(result!.carrierTruncated).toBe(false);
    });
    
    it('should return null when not found', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      
      const result = await repository.getById('non-existent');
      
      expect(result).toBeNull();
    });
  });
  
  // ==========================================================================
  // getByBundleId
  // ==========================================================================
  
  describe('getByBundleId', () => {
    it('should return entry when found', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([mockRawDlqEntry]);
      
      const result = await repository.getByBundleId(mockBundleId);
      
      expect(result).not.toBeNull();
      expect(result!.bundleId).toBe(mockBundleId);
    });
    
    it('should return null when not found', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      
      const result = await repository.getByBundleId('non-existent');
      
      expect(result).toBeNull();
    });
  });
  
  // ==========================================================================
  // query
  // ==========================================================================
  
  describe('query', () => {
    it('should return paginated results', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([mockRawDlqEntry]);
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ count: BigInt(1) }]);
      prisma.$queryRaw.mockResolvedValueOnce([{ oldest_age: 3600 }]);
      
      const result = await repository.query({ limit: 10, offset: 0 });
      
      expect(result.entries).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.oldestAge).toBe(3600);
    });
    
    it('should filter by status', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([mockRawDlqEntry]);
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ count: BigInt(1) }]);
      prisma.$queryRaw.mockResolvedValueOnce([{ oldest_age: 3600 }]);
      
      const result = await repository.query({ status: 'DLQ_OPEN' });
      
      expect(result.entries).toHaveLength(1);
    });
    
    it('should handle empty results', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([]);
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ count: BigInt(0) }]);
      prisma.$queryRaw.mockResolvedValueOnce([{ oldest_age: null }]);
      
      const result = await repository.query();
      
      expect(result.entries).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.oldestAge).toBeUndefined();
    });
    
    it('should support custom ordering', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([mockRawDlqEntry]);
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ count: BigInt(1) }]);
      prisma.$queryRaw.mockResolvedValueOnce([{ oldest_age: null }]);
      
      await repository.query({
        orderBy: 'created_at',
        orderDir: 'asc',
      });
      
      // Verify query was called
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
    });
  });
  
  // ==========================================================================
  // resolve
  // ==========================================================================
  
  describe('resolve', () => {
    it('should resolve open entry', async () => {
      const resolvedEntry = {
        ...mockRawDlqEntry,
        status: 'DLQ_RESOLVED',
        resolved_at: new Date(),
        resolved_by: 'admin@example.com',
        resolution_note: 'Manually fixed',
      };
      
      prisma.$queryRaw.mockResolvedValueOnce([resolvedEntry]);
      
      const result = await repository.resolve({
        dlqId: mockDlqId,
        resolvedBy: 'admin@example.com',
        resolutionNote: 'Manually fixed',
      });
      
      expect(result.status).toBe('DLQ_RESOLVED');
      expect(result.resolvedBy).toBe('admin@example.com');
      expect(result.resolutionNote).toBe('Manually fixed');
    });
    
    it('should throw when entry not found or already resolved', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      
      await expect(repository.resolve({
        dlqId: mockDlqId,
        resolvedBy: 'admin@example.com',
      })).rejects.toThrow('DLQ entry not found or already resolved');
    });
    
    it('should handle missing resolution note', async () => {
      const resolvedEntry = {
        ...mockRawDlqEntry,
        status: 'DLQ_RESOLVED',
        resolved_at: new Date(),
        resolved_by: 'admin@example.com',
        resolution_note: null,
      };
      
      prisma.$queryRaw.mockResolvedValueOnce([resolvedEntry]);
      
      const result = await repository.resolve({
        dlqId: mockDlqId,
        resolvedBy: 'admin@example.com',
      });
      
      expect(result.resolutionNote).toBeNull();
    });
  });
  
  // ==========================================================================
  // getStats
  // ==========================================================================
  
  describe('getStats', () => {
    it('should return DLQ statistics', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        { status: 'DLQ_OPEN', count: BigInt(10), oldest_age_seconds: 7200 },
        { status: 'DLQ_RESOLVED', count: BigInt(50), oldest_age_seconds: null },
        { status: 'DLQ_REDROVE', count: BigInt(5), oldest_age_seconds: null },
      ]);
      
      const stats = await repository.getStats();
      
      expect(stats.open).toBe(10);
      expect(stats.resolved).toBe(50);
      expect(stats.redriven).toBe(5);
      expect(stats.total).toBe(65);
      expect(stats.oldestOpenAge).toBe(7200);
    });
    
    it('should handle empty DLQ', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      
      const stats = await repository.getStats();
      
      expect(stats.open).toBe(0);
      expect(stats.resolved).toBe(0);
      expect(stats.redriven).toBe(0);
      expect(stats.total).toBe(0);
      expect(stats.oldestOpenAge).toBeUndefined();
    });
    
    it('should handle DLQ with only resolved entries', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        { status: 'DLQ_RESOLVED', count: BigInt(100), oldest_age_seconds: null },
      ]);
      
      const stats = await repository.getStats();
      
      expect(stats.open).toBe(0);
      expect(stats.resolved).toBe(100);
      expect(stats.total).toBe(100);
      expect(stats.oldestOpenAge).toBeUndefined();
    });
  });
});
