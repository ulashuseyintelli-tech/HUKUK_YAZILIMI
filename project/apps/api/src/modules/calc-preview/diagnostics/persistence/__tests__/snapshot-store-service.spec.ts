/**
 * Snapshot Store Service Unit Tests
 * 
 * Phase 9B.5 Task 3: Sentinel Validation Tests
 */

import { 
  SnapshotStoreService, 
  NULL_RUN_SENTINEL,
  SnapshotValidationError,
} from '../snapshot-store.service';
import { ISnapshotRepository, Snapshot, SnapshotInput } from '../snapshot-repository.interface';
import { CreateSnapshotInput } from '../snapshot-store.interface';
import { randomUUID } from 'crypto';

describe('SnapshotStoreService', () => {
  let service: SnapshotStoreService;
  let mockRepository: jest.Mocked<ISnapshotRepository>;

  const createValidInput = (overrides: Partial<CreateSnapshotInput> = {}): CreateSnapshotInput => ({
    snapshotId: randomUUID(),
    tenantId: 'tenant-123',
    incidentId: 'incident-456',
    runId: randomUUID(),
    snapshotKind: 'CURRENT',
    verdict: 'PROCEED',
    driftScore: 0.05,
    calcResult: { total: 1000 },
    calcResultNorm: { total: '1000' },
    calcHash: 'a'.repeat(64),
    isBaseline: false,
    retentionPolicy: 'STANDARD',
    ...overrides,
  });

  const createMockSnapshot = (input: SnapshotInput): Snapshot => ({
    snapshotId: input.snapshotId,
    tenantId: input.tenantId,
    incidentId: input.incidentId,
    runId: input.runId,
    snapshotKind: input.snapshotKind,
    isBaseline: input.isBaseline ?? false,
    verdict: input.verdict,
    driftScore: input.driftScore,
    calcResult: input.calcResult,
    calcResultNorm: input.calcResultNorm,
    calcHash: input.calcHash,
    legalHold: false,
    retentionPolicy: input.retentionPolicy ?? 'STANDARD',
    createdAt: new Date().toISOString(),
  });

  beforeEach(() => {
    mockRepository = {
      insert: jest.fn(),
      markAsBaseline: jest.fn(),
      applyLegalHold: jest.fn(),
      setRetentionPolicy: jest.fn(),
      markArchived: jest.fn(),
      findById: jest.fn(),
      findByIncidentId: jest.fn(),
      findBaseline: jest.fn(),
      findByRunId: jest.fn(),
      findWithLegalHold: jest.fn(),
      getLegalHoldStats: jest.fn(),
      listDistinctTenantIds: jest.fn(),
      buildDeletableWhere: jest.fn(),
      countDeletable: jest.fn(),
      deleteExpired: jest.fn(),
    };
    service = new SnapshotStoreService(mockRepository);
  });

  describe('NULL_RUN_SENTINEL constant', () => {
    it('should be defined as __NO_RUN__', () => {
      expect(NULL_RUN_SENTINEL).toBe('__NO_RUN__');
    });
  });

  describe('createSnapshot - sentinel validation', () => {
    it('should reject runId equal to sentinel value', async () => {
      const input = createValidInput({ runId: NULL_RUN_SENTINEL });
      await expect(service.createSnapshot(input)).rejects.toThrow(SnapshotValidationError);
      expect(mockRepository.insert).not.toHaveBeenCalled();
    });

    it('should accept undefined runId (NULL)', async () => {
      const input = createValidInput({ runId: undefined });
      mockRepository.insert.mockResolvedValue(createMockSnapshot(input as SnapshotInput));
      const result = await service.createSnapshot(input);
      expect(result).toBeDefined();
      expect(mockRepository.insert).toHaveBeenCalledTimes(1);
    });
  });

  describe('createSnapshot - calcHash validation', () => {
    it('should reject empty calcHash', async () => {
      const input = createValidInput({ calcHash: '' });
      await expect(service.createSnapshot(input)).rejects.toThrow(SnapshotValidationError);
    });

    it('should reject invalid hash format', async () => {
      const input = createValidInput({ calcHash: 'invalid-hash' });
      await expect(service.createSnapshot(input)).rejects.toThrow(SnapshotValidationError);
    });

    it('should accept valid SHA256 hash', async () => {
      const input = createValidInput({ calcHash: 'abcdef0123456789'.repeat(4) });
      mockRepository.insert.mockResolvedValue(createMockSnapshot(input as SnapshotInput));
      const result = await service.createSnapshot(input);
      expect(result).toBeDefined();
    });
  });

  describe('createSnapshot - driftScore validation', () => {
    it('should reject negative driftScore', async () => {
      const input = createValidInput({ driftScore: -0.1 });
      await expect(service.createSnapshot(input)).rejects.toThrow(SnapshotValidationError);
    });

    it('should reject driftScore > 1', async () => {
      const input = createValidInput({ driftScore: 1.5 });
      await expect(service.createSnapshot(input)).rejects.toThrow(SnapshotValidationError);
    });
  });

  describe('SnapshotValidationError', () => {
    it('should have correct error code', () => {
      const error = new SnapshotValidationError('testField', 'test message');
      expect(error.code).toBe('SNAPSHOT_VALIDATION_ERROR');
      expect(error.field).toBe('testField');
    });
  });
});
